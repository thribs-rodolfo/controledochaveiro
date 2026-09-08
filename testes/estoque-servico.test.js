// ============================================================
// estoque-servico.test.js — BUG task 335 (cliente Dois Irmãos/Seilma)
//
// Regra: item tipo 'servico' (mão de obra, ex.: "abertura de porta") NÃO
// movimenta estoque, não bloqueia por estoque e não mostra aviso de estoque.
// Itens físicos (chave, variados, etc.) continuam movimentando estoque.
//
// Estes testes rodam o <script> inline do index.html DE VERDADE num DOM jsdom,
// com o Supabase dublado que REGISTRA as escritas (insert/update) por tabela.
// Assim conseguimos afirmar o que foi (ou não foi) gravado em 'movimentacoes'.
// ============================================================

const { test } = require("node:test")
const assert = require("node:assert")
const {
  montarAmbiente,
  semearCache,
  semearProdutos,
  esperarAssentar,
} = require("./ambiente")

// Monta o app já semeado (cache + produtos de teste) e devolve o essencial.
async function prepararComProdutos() {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  semearCache(window)
  semearProdutos(window)
  return {
    window: window,
    doc: window.document,
    registro: ambiente.clienteFake.__registro,
  }
}

// Conta quantas movimentações de estoque foram inseridas para uma dada chave_id.
function movimentacoesDaChave(registro, chaveId) {
  const inseridas = registro.insert.movimentacoes || []
  return inseridas.filter(function (m) {
    return m && m.chave_id == chaveId
  })
}

// Obs.: o teste-unidade da "regra de estoque por tipo" foi removido porque o
// app NÃO expõe um helper único (`itemMovimentaEstoque` não existe em nenhuma
// das versões). A regra é observada de ponta a ponta nos testes (3) PDV
// finalizar e (5) OS concluir abaixo, que checam se houve/não houve
// movimentação em 'movimentacoes'.

// ------------------------------------------------------------
// (2) PDV render: serviço não mostra aviso ⚠️ de estoque.
// ------------------------------------------------------------
test("PDV carrinho: serviço não exibe aviso ⚠️; físico com estoque 0 exibe aviso", async function () {
  const { window, doc } = await prepararComProdutos()
  await window.eval("pagePDV()")
  await esperarAssentar(window)

  window.eval(
    "PDV_CART = [" +
      "{ chave_id: 20, codigo: 'SV1', descricao: 'Abertura de Porta', quantidade: 1, preco_unit: 80, estoque: 0, tipo_produto: 'servico' }," +
      "{ chave_id: 11, codigo: 'VR1', descricao: 'Item Variados', quantidade: 2, preco_unit: 5, estoque: 0, tipo_produto: 'variados' }" +
      "]",
  )
  window.eval("renderPdvCart()")

  const body = doc.getElementById("pdvCartBody")
  const linhas = body.querySelectorAll(".pdv-cart-row")
  assert.strictEqual(linhas.length, 2, "deveria renderizar 2 linhas no carrinho")

  // Localiza cada linha pelo nome do item (robusto à ordem).
  function linhaDoItem(nome) {
    for (const linha of linhas) {
      const pname = linha.querySelector(".pname")
      if (pname && pname.textContent.trim() === nome) return linha
    }
    return null
  }

  const linhaServico = linhaDoItem("Abertura de Porta")
  const linhaVariados = linhaDoItem("Item Variados")
  assert.ok(linhaServico, "não achei a linha do serviço no carrinho")
  assert.ok(linhaVariados, "não achei a linha do item variados no carrinho")

  // Comportamento esperado: o serviço NÃO mostra o aviso ⚠️ de estoque
  // insuficiente (é mão de obra, não há estoque a controlar). O físico continua
  // mostrando o "estoque:" e o ⚠️ quando falta estoque.
  assert.doesNotMatch(
    linhaServico.innerHTML,
    /⚠️/,
    "serviço não deveria mostrar aviso de estoque ⚠️",
  )
  // O item físico 'variados' com estoque 0 deve continuar avisando.
  assert.match(
    linhaVariados.innerHTML,
    /estoque: 0/,
    "item físico 'variados' com estoque 0 deveria continuar mostrando 'estoque: 0'",
  )
  assert.match(
    linhaVariados.innerHTML,
    /⚠️/,
    "item físico 'variados' sem estoque suficiente deveria mostrar o aviso ⚠️",
  )
})

// ------------------------------------------------------------
// (3) PDV finalizar: serviço NÃO gera movimentação; físico gera.
// ------------------------------------------------------------
test("PDV finalizar venda: serviço não gera movimentação de estoque; físico gera", async function () {
  const { window, doc, registro } = await prepararComProdutos()
  await window.eval("pagePDV()")
  await esperarAssentar(window)
  // pagePDV recarrega CACHE.chaves/tipos do supabase fake (vazio): re-semeia.
  semearCache(window)
  semearProdutos(window)

  // Carrinho: 1 serviço (qtd 3) + 1 físico 'chave' (qtd 2).
  window.eval(
    "PDV_CART = [" +
      "{ chave_id: 20, codigo: 'SV1', descricao: 'Abertura de Porta', quantidade: 3, preco_unit: 80, estoque: 0, tipo_produto: 'servico' }," +
      "{ chave_id: 10, codigo: 'CH1', descricao: 'Chave Fisica', quantidade: 2, preco_unit: 10, estoque: 3, tipo_produto: 'chave' }" +
      "]",
  )
  // Pagamento à vista (concluído) para acionar a baixa de estoque.
  doc.getElementById("pdvPayStatus").value = "pago"

  await window.eval("pdvFinish()")
  await esperarAssentar(window)

  const movServico = movimentacoesDaChave(registro, 20)
  const movFisico = movimentacoesDaChave(registro, 10)

  assert.strictEqual(
    movServico.length,
    0,
    "serviço (chave_id 20) NÃO deveria gerar nenhuma movimentação de estoque. Gerou: " +
      JSON.stringify(movServico),
  )
  assert.strictEqual(
    movFisico.length,
    1,
    "item físico (chave_id 10) deveria gerar 1 movimentação de saída. Gerou: " +
      JSON.stringify(movFisico),
  )
  assert.strictEqual(movFisico[0].tipo, "saida")
  assert.strictEqual(movFisico[0].quantidade, 2)
})

// ------------------------------------------------------------
// (4) PDV: serviço em qualquer quantidade não bloqueia por estoque.
//     confirm() no ambiente devolve true; garantimos que a venda concluiu
//     (movimentação do físico saiu) mesmo com serviço estoque 0 e qtd alta.
// ------------------------------------------------------------
test("PDV: vender serviço com estoque 0 em qualquer quantidade não impede a venda", async function () {
  const { window, doc, registro } = await prepararComProdutos()
  await window.eval("pagePDV()")
  await esperarAssentar(window)

  window.eval(
    "PDV_CART = [" +
      "{ chave_id: 20, codigo: 'SV1', descricao: 'Abertura de Porta', quantidade: 99, preco_unit: 80, estoque: 0, tipo_produto: 'servico' }" +
      "]",
  )
  doc.getElementById("pdvPayStatus").value = "pago"

  // Se o serviço bloqueasse/movimentasse, veríamos movimentação; não deve haver.
  await window.eval("pdvFinish()")
  await esperarAssentar(window)

  const movServico = movimentacoesDaChave(registro, 20)
  assert.strictEqual(
    movServico.length,
    0,
    "serviço não deveria movimentar estoque mesmo com qtd 99 e estoque 0",
  )
  // A venda foi registrada (a OS/servico foi inserida).
  const servicosInseridos = registro.insert.servicos || []
  assert.ok(
    servicosInseridos.length >= 1,
    "a venda com serviço deveria ter sido registrada (insert em 'servicos')",
  )
})

// ------------------------------------------------------------
// (5) OS: concluir OS com serviço não gera movimentação; físico gera.
// ------------------------------------------------------------
test("OS concluir: item de serviço não baixa estoque; item físico baixa", async function () {
  const { window, doc, registro } = await prepararComProdutos()
  // Abre a página de OS primeiro (cria os contêineres que osSalvar atualiza no fim).
  await window.eval("pageServicos()")
  await esperarAssentar(window)
  // pageServicos recarrega CACHE do supabase fake (vazio): re-semeia.
  semearCache(window)
  semearProdutos(window)
  window.eval("osForm()")

  // Monta a OS: título (obrigatório), mão de obra e itens (1 serviço + 1 físico).
  doc.getElementById("osTitulo").value = "Serviço na porta"
  doc.getElementById("osMaoObra").value = "50,00"
  window.eval(
    "OS_ITENS = [" +
      "{ chave_id: 20, descricao: 'Abertura de Porta', quantidade: 5, preco_unit: 80 }," +
      "{ chave_id: 10, descricao: 'Chave Fisica', quantidade: 1, preco_unit: 10 }" +
      "]",
  )
  // Status concluído para acionar a baixa de estoque.
  const selStatus = doc.getElementById("osStatus")
  if (selStatus) selStatus.value = "concluido"

  await window.eval("osSalvar()")
  await esperarAssentar(window)

  const movServico = movimentacoesDaChave(registro, 20)
  const movFisico = movimentacoesDaChave(registro, 10)

  assert.strictEqual(
    movServico.length,
    0,
    "OS: serviço (chave_id 20) NÃO deveria baixar estoque. Baixou: " +
      JSON.stringify(movServico),
  )
  assert.strictEqual(
    movFisico.length,
    1,
    "OS: item físico (chave_id 10) deveria baixar 1 saída de estoque. Gerou: " +
      JSON.stringify(movFisico),
  )
})

// ------------------------------------------------------------
// (6) REGRESSÃO task 457 ("estoque negativo em serviço"): concluir uma OS com
//     um serviço cujo cadastro já está com estoque negativo (ex.: −2, o sintoma
//     relatado) NÃO pode gerar mais movimentação de estoque nem mexer no cache.
//     O serviço "Abertura de veículo" aparecia com estoque −2 porque baixava
//     estoque como se fosse produto físico. A guarda de serviço corrige isso.
// ------------------------------------------------------------
test("REGRESSÃO 457: OS com serviço de estoque negativo não baixa estoque ao concluir", async function () {
  const { window, doc, registro } = await prepararComProdutos()
  await window.eval("pageServicos()")
  await esperarAssentar(window)
  semearCache(window)
  semearProdutos(window)
  // Reproduz o sintoma: o serviço (id 20) já está com estoque negativo no cache.
  window.eval(
    "CACHE.chaves.find(function (k) { return k.id === 20 }).estoque = -2",
  )
  window.eval("osForm()")

  doc.getElementById("osTitulo").value = "Abertura de veículo"
  doc.getElementById("osMaoObra").value = "80,00"
  window.eval(
    "OS_ITENS = [" +
      "{ chave_id: 20, descricao: 'Abertura de veículo', quantidade: 1, preco_unit: 80 }" +
      "]",
  )
  const selStatus = doc.getElementById("osStatus")
  if (selStatus) selStatus.value = "concluido"

  await window.eval("osSalvar()")
  await esperarAssentar(window)

  const movServico = movimentacoesDaChave(registro, 20)
  assert.strictEqual(
    movServico.length,
    0,
    "serviço com estoque negativo NÃO deveria gerar movimentação. Gerou: " +
      JSON.stringify(movServico),
  )
  // O cache do serviço permanece intacto (não fica mais negativo do que estava).
  const estoqueDepois = window.eval(
    "CACHE.chaves.find(function (k) { return k.id === 20 }).estoque",
  )
  assert.strictEqual(
    estoqueDepois,
    -2,
    "estoque do serviço não deveria ser alterado ao concluir a OS",
  )
})
