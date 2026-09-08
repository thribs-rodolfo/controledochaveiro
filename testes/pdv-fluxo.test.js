// ============================================================
// pdv-fluxo.test.js — cobertura do fluxo de PDV (Ponto de Venda / Venda Rápida)
//
// Roda o <script> inline do index.html DE VERDADE num DOM jsdom, com o
// Supabase dublado que REGISTRA as escritas (insert/update) por tabela.
// Assim afirmamos comportamento OBSERVÁVEL: total no #pdvTotal, conteúdo do
// carrinho (PDV_CART e HTML do #pdvCartBody) e o que foi gravado no Supabase.
//
// Funções cobertas: pdvAddItem, pdvSetQty, pdvSetPreco, pdvRemove,
// pdvDescontoValor, renderPdvCart, pdvClear, pdvFinish, pdvScan.
//
// Como CACHE/SESSAO/PDV_CART são `let` de topo do <script>, não são
// propriedades de window — lemos/escrevemos via window.eval (mesmo escopo).
// ============================================================

const { test } = require("node:test")
const assert = require("node:assert")
const {
  montarAmbiente,
  semearCache,
  semearProdutos,
  esperarAssentar,
} = require("./ambiente")

// Formata igual ao app: "R$ 12,34" (2 casas, vírgula decimal).
function formatoReais(valor) {
  return "R$ " + parseFloat(valor || 0).toFixed(2).replace(".", ",")
}

// Monta o app já semeado (cache + produtos) e com a página PDV renderizada,
// devolvendo o essencial para os testes.
async function prepararPdv() {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  semearCache(window)
  semearProdutos(window)
  // renderiza a tela do PDV; os ids (pdvCartBody, pdvTotal, ...) passam a existir.
  // pagePDV() chama carregarChaves()/carregarClientes(), que com o Supabase
  // dublado (data vazio) sobrescrevem o CACHE — por isso re-semeamos DEPOIS.
  await window.eval("pagePDV()")
  await esperarAssentar(window)
  semearCache(window)
  semearProdutos(window)
  // garante carrinho limpo entre montagens (o PDV_CART é módulo-global)
  window.eval("PDV_CART = []; renderPdvCart()")
  return {
    window: window,
    doc: window.document,
    registro: ambiente.clienteFake.__registro,
  }
}

// Adiciona ao carrinho o produto do CACHE com o id informado.
function adicionar(window, chaveId) {
  window.eval(
    "pdvAddItem(CACHE.chaves.find(function(k){return k.id===" +
      chaveId +
      "}))",
  )
}

// Lê o texto atual do total exibido.
function textoTotal(doc) {
  return doc.getElementById("pdvTotal").textContent
}

// ------------------------------------------------------------
// (1) pdvAddItem duas vezes o MESMO produto → soma quantidade (1 linha, qtd 2).
// ------------------------------------------------------------
test("pdvAddItem do mesmo produto duas vezes soma a quantidade (não duplica a linha)", async function () {
  const { window } = await prepararPdv()
  adicionar(window, 10)
  adicionar(window, 10)

  const tamanho = window.eval("PDV_CART.length")
  const quantidade = window.eval("PDV_CART[0].quantidade")
  assert.strictEqual(tamanho, 1, "deve haver uma única linha para o mesmo produto")
  assert.strictEqual(quantidade, 2, "a quantidade deve somar para 2")
})

// ------------------------------------------------------------
// (2) pdvAddItem de dois produtos diferentes → 2 linhas; total = soma correta.
// ------------------------------------------------------------
test("pdvAddItem de dois produtos diferentes cria 2 linhas e soma o total corretamente", async function () {
  const { window, doc } = await prepararPdv()
  adicionar(window, 10) // preço 10
  adicionar(window, 11) // preço 5

  assert.strictEqual(window.eval("PDV_CART.length"), 2, "duas linhas distintas")
  assert.strictEqual(
    textoTotal(doc),
    formatoReais(15),
    "total = 10 + 5 = R$ 15,00",
  )
})

// ------------------------------------------------------------
// (3) pdvSetQty: <1 vira 1; string numérica funciona; total recalcula.
// ------------------------------------------------------------
test("pdvSetQty: valor <1 vira 1, aceita string numérica e recalcula o total", async function () {
  const { window, doc } = await prepararPdv()
  adicionar(window, 10) // preço 10

  // string numérica "3" → quantidade 3, total 30
  window.eval("pdvSetQty(0, '3')")
  assert.strictEqual(window.eval("PDV_CART[0].quantidade"), 3, "aceita string '3'")
  assert.strictEqual(textoTotal(doc), formatoReais(30), "total recalcula para 30")

  // valor abaixo de 1 é normalizado para 1
  window.eval("pdvSetQty(0, 0)")
  assert.strictEqual(window.eval("PDV_CART[0].quantidade"), 1, "0 vira 1")
  assert.strictEqual(textoTotal(doc), formatoReais(10), "total volta para 10")

  // negativo também vira 1
  window.eval("pdvSetQty(0, -5)")
  assert.strictEqual(window.eval("PDV_CART[0].quantidade"), 1, "negativo vira 1")
})

// ------------------------------------------------------------
// (4) pdvSetPreco: negativo vira 0; recalcula o total.
// ------------------------------------------------------------
test("pdvSetPreco: preço negativo vira 0 e recalcula o total", async function () {
  const { window, doc } = await prepararPdv()
  adicionar(window, 10) // preço 10

  window.eval("pdvSetPreco(0, -3)")
  assert.strictEqual(window.eval("PDV_CART[0].preco_unit"), 0, "negativo vira 0")
  assert.strictEqual(textoTotal(doc), formatoReais(0), "total zera")

  // valor válido volta a somar
  window.eval("pdvSetPreco(0, 7.5)")
  assert.strictEqual(window.eval("PDV_CART[0].preco_unit"), 7.5, "aceita 7,50")
  assert.strictEqual(textoTotal(doc), formatoReais(7.5), "total recalcula para 7,50")
})

// ------------------------------------------------------------
// (5) pdvRemove remove a linha certa.
// ------------------------------------------------------------
test("pdvRemove remove a linha certa do carrinho", async function () {
  const { window } = await prepararPdv()
  adicionar(window, 10) // índice 0
  adicionar(window, 11) // índice 1
  adicionar(window, 20) // índice 2

  // remove o do meio (índice 1 = produto 11)
  window.eval("pdvRemove(1)")
  assert.strictEqual(window.eval("PDV_CART.length"), 2, "restam 2 linhas")
  const ids = window.eval("PDV_CART.map(function(it){return it.chave_id}).join(',')")
  assert.strictEqual(ids, "10,20", "sobram exatamente os produtos 10 e 20")
})

// ------------------------------------------------------------
// (6) pdvDescontoValor: reais e pct; nunca passa do subtotal; negativo vira 0.
// ------------------------------------------------------------
test("pdvDescontoValor: reais e pct, limitado ao subtotal e negativo vira 0", async function () {
  const { window, doc } = await prepararPdv()

  // desconto em REAIS
  doc.getElementById("pdvDescTipo").value = "reais"
  doc.getElementById("pdvDesc").value = "4"
  assert.strictEqual(
    window.eval("pdvDescontoValor(20)"),
    4,
    "R$ 4 de desconto sobre subtotal 20",
  )

  // desconto em PORCENTAGEM
  doc.getElementById("pdvDescTipo").value = "pct"
  doc.getElementById("pdvDesc").value = "10"
  assert.strictEqual(
    window.eval("pdvDescontoValor(200)"),
    20,
    "10% de 200 = 20",
  )

  // desconto nunca passa do subtotal
  doc.getElementById("pdvDescTipo").value = "reais"
  doc.getElementById("pdvDesc").value = "999"
  assert.strictEqual(
    window.eval("pdvDescontoValor(30)"),
    30,
    "desconto é limitado ao subtotal (30)",
  )

  // negativo vira 0
  doc.getElementById("pdvDesc").value = "-5"
  assert.strictEqual(
    window.eval("pdvDescontoValor(50)"),
    0,
    "desconto negativo vira 0",
  )
})

// ------------------------------------------------------------
// (6b) Integração do desconto no total via renderPdvCart.
// ------------------------------------------------------------
test("desconto em reais desce o total exibido no #pdvTotal", async function () {
  const { window, doc } = await prepararPdv()
  adicionar(window, 10) // 10
  adicionar(window, 11) // 5  → subtotal 15

  doc.getElementById("pdvDescTipo").value = "reais"
  doc.getElementById("pdvDesc").value = "5"
  window.eval("renderPdvCart()")

  assert.strictEqual(textoTotal(doc), formatoReais(10), "15 − 5 = R$ 10,00")
  const info = doc.getElementById("pdvDescInfo").textContent
  assert.ok(/desconto/.test(info), "a linha de desconto aparece no #pdvDescInfo")
})

// ------------------------------------------------------------
// (7) renderPdvCart com carrinho vazio: "Nenhum item" e botão finalizar disabled.
// ------------------------------------------------------------
test("carrinho vazio mostra 'Nenhum item' e desabilita o botão Finalizar", async function () {
  const { window, doc } = await prepararPdv()
  // carrinho já vem vazio de prepararPdv()
  const html = doc.getElementById("pdvCartBody").innerHTML
  assert.ok(/Nenhum item/i.test(html), "mensagem de carrinho vazio presente")
  assert.strictEqual(
    doc.getElementById("pdvFinishBtn").disabled,
    true,
    "botão Finalizar desabilitado com carrinho vazio",
  )

  // ao adicionar um item, o botão volta a ficar habilitado
  adicionar(window, 10)
  assert.strictEqual(
    doc.getElementById("pdvFinishBtn").disabled,
    false,
    "botão Finalizar habilita quando há item",
  )
})

// ------------------------------------------------------------
// (8) renderPdvCart: aviso de estoque quando qtd > estoque; sem aviso quando dentro.
// ------------------------------------------------------------
test("renderPdvCart: mostra ⚠️ quando quantidade excede o estoque e 'estoque:' sem aviso quando dentro", async function () {
  const { window, doc } = await prepararPdv()
  adicionar(window, 10) // estoque 3

  // dentro do estoque (qtd 2 <= 3): sem aviso
  window.eval("pdvSetQty(0, 2)")
  let html = doc.getElementById("pdvCartBody").innerHTML
  assert.ok(/estoque:/.test(html), "mostra o texto 'estoque:'")
  assert.ok(!/⚠️/.test(html), "sem aviso ⚠️ quando dentro do estoque")

  // acima do estoque (qtd 5 > 3): aviso ⚠️
  window.eval("pdvSetQty(0, 5)")
  html = doc.getElementById("pdvCartBody").innerHTML
  assert.ok(/⚠️/.test(html), "mostra aviso ⚠️ quando excede o estoque")
})

// ------------------------------------------------------------
// (9) pdvFinish: insere a venda em 'servicos' e movimenta 'saida' p/ item físico.
// ------------------------------------------------------------
test("pdvFinish insere a venda em 'servicos' e registra movimentação de saída para item físico", async function () {
  const { window, doc, registro } = await prepararPdv()
  adicionar(window, 10) // item físico, estoque 3, preço 10
  window.eval("pdvSetQty(0, 2)") // 2 unidades → total 20

  // pdvFinish é async — aguardamos a promessa e o assentamento dos awaits internos.
  await window.eval("pdvFinish()")
  await esperarAssentar(window)
  await esperarAssentar(window)

  // 1) venda gravada na tabela 'servicos'
  const vendas = registro.insert.servicos || []
  assert.strictEqual(vendas.length, 1, "uma venda inserida em 'servicos'")
  assert.strictEqual(vendas[0].is_pdv, true, "marcada como venda de PDV")
  assert.strictEqual(vendas[0].total, 20, "total da venda = 20")

  // 2) movimentação de saída para o item físico (chave_id 10)
  const movs = (registro.insert.movimentacoes || []).filter(function (m) {
    return m && m.chave_id == 10
  })
  assert.strictEqual(movs.length, 1, "uma movimentação para a chave 10")
  assert.strictEqual(movs[0].tipo, "saida", "movimentação é de saída")
  assert.strictEqual(movs[0].quantidade, 2, "baixa 2 unidades")

  // 3) Commit C: NÃO edita mais chaves.estoque no cliente (fonte única =
  // movimentação + trigger). O update redundante foi removido.
  const updatesEstoque = (registro.update.chaves || []).filter(function (u) {
    return u && Object.prototype.hasOwnProperty.call(u, "estoque")
  })
  assert.strictEqual(
    updatesEstoque.length,
    0,
    "não deve mais editar chaves.estoque no cliente",
  )
  // O cache local reflete o derivado (3 − 2 = 1), espelhando o trigger.
  const estoqueCache = window.eval(
    "(CACHE.chaves.find(function(x){return x.id==10})||{}).estoque",
  )
  assert.strictEqual(estoqueCache, 1, "cache otimista: estoque da chave 10 = 1")

  // 4) financeiro lançado (venda paga por padrão → transacoes)
  const transacoes = registro.insert.transacoes || []
  assert.strictEqual(transacoes.length, 1, "uma transação de entrada lançada")
  assert.strictEqual(transacoes[0].valor, 20, "valor da transação = 20")

  // 5) o carrinho é esvaziado após finalizar
  assert.strictEqual(window.eval("PDV_CART.length"), 0, "carrinho zerado após venda")
})

// ------------------------------------------------------------
// (9b) Seletor de funcionário do PDV: a venda grava o funcionário ESCOLHIDO
//      (não necessariamente o logado). Decisão do Joel.
// ------------------------------------------------------------
test("pdvFinish grava o funcionário escolhido no seletor (não só o logado)", async function () {
  const { window, doc, registro } = await prepararPdv()
  // Dois funcionários: logado (1) e outro (2). Como o Supabase dublado devolve
  // lista vazia em carregarFuncionariosCache, semeamos o CACHE e remontamos as
  // opções do seletor pelo helper REAL do app (optionsFuncionarios).
  window.eval(
    "CACHE.funcionarios = [" +
      "  { id: 1, nome: 'Fulano', ativo: true }," +
      "  { id: 2, nome: 'Ciclana', ativo: true }" +
      "];" +
      "document.getElementById('pdvFuncionario').innerHTML =" +
      " optionsFuncionarios(SESSAO && SESSAO.id);",
  )

  const sel = doc.getElementById("pdvFuncionario")
  assert.ok(sel, "faltou o seletor de funcionário do PDV (pdvFuncionario)")
  // Duas opções disponíveis; o logado (1) vem selecionado por padrão.
  assert.strictEqual(sel.options.length, 2, "seletor deve listar os 2 funcionários")
  assert.strictEqual(sel.value, "1", "default = funcionário logado (id 1)")

  // Escolhe OUTRO funcionário e finaliza a venda.
  window.eval("document.getElementById('pdvFuncionario').value = '2'")
  window.eval("pdvAddItem(CACHE.chaves.find(function(k){return k.id===10}))")
  await window.eval("pdvFinish()")
  await esperarAssentar(window)
  await esperarAssentar(window)

  const vendas = registro.insert.servicos || []
  assert.strictEqual(vendas.length, 1, "uma venda gravada")
  assert.strictEqual(
    vendas[0].funcionario_id,
    2,
    "a venda grava o funcionário ESCOLHIDO (id 2), não o logado (id 1)",
  )
})

// ------------------------------------------------------------
// (9c) Taxa de cartão: a venda paga em forma com taxa grava o valor LÍQUIDO
//      (total menos a taxa) em transacoes.valor_liquido. Dinheiro (taxa 0) fica
//      com líquido = valor.
// ------------------------------------------------------------
test("pdvFinish grava o valor líquido descontando a taxa da forma de pagamento", async function () {
  const { window, doc, registro } = await prepararPdv()
  // Forma com taxa de 10% e uma sem taxa. taxaDaForma/liquidoComTaxa leem daqui.
  window.eval(
    "CACHE.formas = [" +
      "  { id: 1, nome: 'Dinheiro', taxa_percentual: 0, ativo: true }," +
      "  { id: 2, nome: 'Cartão de Crédito', taxa_percentual: 10, ativo: true }" +
      "];",
  )
  // Helpers puros: 100 a 10% → líquido 90; sem taxa → 100.
  assert.strictEqual(
    window.eval("liquidoComTaxa(100, 'Cartão de Crédito')"),
    90,
    "líquido de 100 a 10% deve ser 90",
  )
  assert.strictEqual(
    window.eval("liquidoComTaxa(100, 'Dinheiro')"),
    100,
    "sem taxa, líquido = valor",
  )

  // Escolhe a forma com taxa e finaliza (item físico id 10, preço 10, qtd 2 = 20).
  doc.getElementById("pdvPay").innerHTML =
    "<option value='Cartão de Crédito'>Cartão de Crédito</option>"
  doc.getElementById("pdvPay").value = "Cartão de Crédito"
  adicionar(window, 10)
  window.eval("pdvSetQty(0, 2)")
  await window.eval("pdvFinish()")
  await esperarAssentar(window)
  await esperarAssentar(window)

  const transacoes = registro.insert.transacoes || []
  assert.strictEqual(transacoes.length, 1, "uma transação lançada")
  assert.strictEqual(transacoes[0].valor, 20, "valor bruto = 20")
  assert.strictEqual(
    transacoes[0].valor_liquido,
    18,
    "valor líquido = 20 − 10% = 18",
  )
})

// ------------------------------------------------------------
// (10) pdvClear zera o carrinho (confirm dublado como true).
// ------------------------------------------------------------
test("pdvClear zera o carrinho (confirm dublado como true)", async function () {
  const { window, doc } = await prepararPdv()
  adicionar(window, 10)
  adicionar(window, 11)
  assert.strictEqual(window.eval("PDV_CART.length"), 2, "carrinho com 2 itens antes")

  window.eval("pdvClear()")
  assert.strictEqual(window.eval("PDV_CART.length"), 0, "carrinho vazio depois")
  const html = doc.getElementById("pdvCartBody").innerHTML
  assert.ok(/Nenhum item/i.test(html), "volta a mostrar 'Nenhum item'")
})

// ------------------------------------------------------------
// (11) pdvScan: bipar o mesmo código adiciona/soma no carrinho.
// ------------------------------------------------------------
test("pdvScan encontra o produto pelo código e sucessivos bips somam a quantidade", async function () {
  const { window, doc } = await prepararPdv()
  const input = doc.getElementById("pdvCode")

  input.value = "CH1"
  window.eval("pdvScan()")
  assert.strictEqual(window.eval("PDV_CART.length"), 1, "um item após primeiro bip")

  // bipa o mesmo código de novo → soma a quantidade (não cria linha nova)
  input.value = "CH1"
  window.eval("pdvScan()")
  assert.strictEqual(window.eval("PDV_CART.length"), 1, "continua uma linha")
  assert.strictEqual(window.eval("PDV_CART[0].quantidade"), 2, "quantidade somou para 2")
})

// ------------------------------------------------------------
// (12) pdvScan aceita produtos SEM código: um item de código vazio, cujo
// termo só aparece na descrição, NÃO pode ficar escondido por um homônimo
// que tenha o código preenchido. Antes havia busca em dois estágios (código
// exato curto-circuitava e auto-selecionava). Cenário real relatado pelo LBS
// (Luiz Barbosa da Silva): buscar "1001" precisa mostrar os DOIS itens.
// ------------------------------------------------------------
test("pdvScan lista TODOS os itens que casam, inclusive os de código vazio (cai no modal, não auto-seleciona)", async function () {
  const { window, doc } = await prepararPdv()
  // dois produtos "fechadura ... 1001": um com código '1001' e outro SEM código.
  window.eval(
    "CACHE.chaves = [" +
      "  { id: 30, codigo: '1001', descricao: 'fechadura stam auxiliar fosco 1001', preco_venda: 50, estoque: 2, tipo_produto: 'chave', fabricante_id: 1 }," +
      "  { id: 29, codigo: '', descricao: 'fechadura stam fosco auxiliar 1001', preco_venda: 50, estoque: 1, tipo_produto: 'chave', fabricante_id: 1 }" +
      "];",
  )
  const input = doc.getElementById("pdvCode")
  input.value = "1001"
  window.eval("pdvScan()")

  // NÃO auto-selecionou (carrinho segue vazio) e abriu o modal de seleção.
  assert.strictEqual(window.eval("PDV_CART.length"), 0, "não auto-selecionou")
  const modal = doc.getElementById("modal") || doc.body
  const texto = modal.innerHTML
  assert.ok(/2 chaves encontradas/.test(texto), "modal indica 2 chaves encontradas")
  // ambos os itens (id 29 de código vazio e id 30) aparecem no modal.
  assert.ok(/pdvPickFromModal\(30\)/.test(texto), "item de código '1001' (id 30) no modal")
  assert.ok(/pdvPickFromModal\(29\)/.test(texto), "item SEM código (id 29) também no modal")

  // ao escolher o de código vazio, ele entra no carrinho normalmente.
  window.eval("pdvPickFromModal(29)")
  assert.strictEqual(window.eval("PDV_CART.length"), 1, "item sem código foi adicionado")
  assert.strictEqual(window.eval("PDV_CART[0].chave_id"), 29, "é o item de código vazio")
})

// ------------------------------------------------------------
// (10) Data de vencimento na venda FIADO/PENDENTE: quando o pagamento nao e
//      'pago' integral, o campo de vencimento aparece e a data e gravada em
//      servicos.data_vencimento. Em 'pago' o campo fica oculto e nao grava.
// ------------------------------------------------------------
test("pdvFinish fiado grava a data de vencimento em servicos.data_vencimento", async function () {
  const { window, doc, registro } = await prepararPdv()
  adicionar(window, 10) // item fisico

  // marca a venda como fiado e dispara o toggle que revela o campo.
  doc.getElementById("pdvPayStatus").value = "fiado"
  window.eval("pdvAtualizarVencimento()")
  const campo = doc.getElementById("pdvVencimentoCampo")
  assert.notStrictEqual(campo.style.display, "none", "campo de vencimento visivel em fiado")
  doc.getElementById("pdvVencimento").value = "2026-09-30"

  await window.eval("pdvFinish()")
  await esperarAssentar(window)
  await esperarAssentar(window)

  // caminho FALLBACK (RPC dublado indisponivel): grava direto em servicos.
  const vendas = registro.insert.servicos || []
  assert.strictEqual(vendas.length, 1, "uma venda inserida")
  assert.strictEqual(
    vendas[0].data_vencimento,
    "2026-09-30",
    "grava a data de vencimento informada",
  )
})

// Mesmo teste no CAMINHO RPC: o vencimento vai como p_data_vencimento.
test("pdvFinish fiado via RPC passa p_data_vencimento", async function () {
  const { window, doc, registro } = await prepararPdv()
  registro.__rpcDisponivel = true
  adicionar(window, 10)

  doc.getElementById("pdvPayStatus").value = "pendente"
  window.eval("pdvAtualizarVencimento()")
  doc.getElementById("pdvVencimento").value = "2026-10-15"

  await window.eval("pdvFinish()")
  await esperarAssentar(window)
  await esperarAssentar(window)

  const chamada = (registro.rpc || []).find(function (r) {
    return r.nome === "pdv_finalizar_venda"
  })
  assert.ok(chamada, "chamou pdv_finalizar_venda")
  assert.strictEqual(
    chamada.args.p_data_vencimento,
    "2026-10-15",
    "passa o vencimento ao RPC",
  )
})

// Pago integral: campo oculto e vencimento nao e gravado (fica nulo).
test("pdvFinish pago NAO grava data de vencimento (campo oculto)", async function () {
  const { window, doc, registro } = await prepararPdv()
  adicionar(window, 10)

  doc.getElementById("pdvPayStatus").value = "pago"
  window.eval("pdvAtualizarVencimento()")
  const campo = doc.getElementById("pdvVencimentoCampo")
  assert.strictEqual(campo.style.display, "none", "campo oculto quando pago")

  await window.eval("pdvFinish()")
  await esperarAssentar(window)
  await esperarAssentar(window)

  const vendas = registro.insert.servicos || []
  assert.strictEqual(vendas.length, 1, "uma venda inserida")
  assert.strictEqual(
    vendas[0].data_vencimento || null,
    null,
    "sem vencimento quando pago",
  )
})
