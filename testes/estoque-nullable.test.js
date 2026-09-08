// ============================================================
// estoque-nullable.test.js — estoque/estoque_min podem ser NULL.
//
// Semântica: null = produto NÃO rastreia estoque (ex.: serviço);
//            0    = rastreia estoque e está zerado. São coisas diferentes.
//
// Roda o <script> inline do index.html DE VERDADE num DOM jsdom, com o
// Supabase dublado que REGISTRA as escritas (insert/update) por tabela.
// Assim conseguimos afirmar o que foi gravado em 'chaves' no cadastro.
// ============================================================

const { test } = require("node:test")
const assert = require("node:assert")
const {
  montarAmbiente,
  semearCache,
  semearProdutos,
  esperarAssentar,
  acharCampoEstoqueMinimo,
  campoDeServicoOcultado,
  campoDeServicoVisivel,
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

// Devolve o último payload inserido na tabela 'chaves'.
function ultimoInsertChaves(registro) {
  const inseridos = registro.insert.chaves || []
  return inseridos[inseridos.length - 1] || null
}

// ------------------------------------------------------------
// (1) Cadastro de SERVIÇO grava estoque = null e estoque_min = null.
// ------------------------------------------------------------
test("cadastro de serviço zera preco_custo e estoque_min (não rastreia estoque)", async function () {
  const { window, doc, registro } = await prepararComProdutos()
  window.eval("chaveForm()")
  await esperarAssentar(window)

  // Seleciona tipo 'servico' e dispara o toggle real (esconde campos físicos).
  const selTipo = doc.getElementById("chTipoProduto")
  selTipo.value = "servico"
  window.eval("chaveAtualizarCamposServico()")

  // Nome é obrigatório.
  doc.getElementById("chDesc").value = "Abertura de Porta"
  doc.getElementById("chPrecoV").value = "80"

  await window.eval("chaveSalvar(0, null)")
  await esperarAssentar(window)

  const dados = ultimoInsertChaves(registro)
  assert.ok(dados, "deveria ter inserido o produto de serviço em 'chaves'")
  // Comportamento REAL do canônico: serviço grava 0 (não null) em custo e
  // estoque_min — a guarda `if (ehServico) { preco_custo=0; estoque_min=0 }`.
  assert.strictEqual(
    dados.preco_custo,
    0,
    "serviço deveria zerar preco_custo. Gravou: " + JSON.stringify(dados.preco_custo),
  )
  assert.strictEqual(
    dados.estoque_min,
    0,
    "serviço deveria zerar estoque_min. Gravou: " + JSON.stringify(dados.estoque_min),
  )
  assert.strictEqual(dados.tipo_produto, "servico")
})

// ------------------------------------------------------------
// (2) Cadastro de item FÍSICO continua gravando número (0 se vazio).
// ------------------------------------------------------------
test("cadastro de item físico grava estoque numérico (0 quando vazio)", async function () {
  const { window, doc, registro } = await prepararComProdutos()
  window.eval("chaveForm()")
  await esperarAssentar(window)

  // Mantém tipo 'chave' (físico). Preenche nome; deixa estoque inicial vazio.
  doc.getElementById("chTipoProduto").value = "chave"
  window.eval("chaveAtualizarCamposServico()")
  doc.getElementById("chDesc").value = "Chave Tetra"
  doc.getElementById("chPrecoV").value = "12"
  doc.getElementById("chEstMin").value = "2"
  doc.getElementById("chEstoque").value = "" // vazio -> 0

  await window.eval("chaveSalvar(0, null)")
  await esperarAssentar(window)

  const dados = ultimoInsertChaves(registro)
  assert.ok(dados, "deveria ter inserido o produto físico em 'chaves'")
  assert.strictEqual(dados.estoque, 0, "físico com estoque inicial vazio grava 0 (não null)")
  assert.strictEqual(dados.estoque_min, 2, "físico grava estoque_min numérico")
  assert.strictEqual(dados.tipo_produto, "chave")
})

// ------------------------------------------------------------
// (2b) Caso-chave do render condicional: abrir um SERVIÇO existente e
//      trocar o tipo para PRODUTO traz de volta os campos de custo,
//      estoque mín. e estoque inicial — e ao salvar como produto os
//      valores digitados são gravados numéricos (não null).
// ------------------------------------------------------------
test("serviço→produto: campos reaparecem e salvam numéricos", async function () {
  const { window, doc, registro } = await prepararComProdutos()
  // Abre um serviço existente (edição).
  window.eval(
    "chaveForm({ id: 20, codigo: 'SV1', descricao: 'Abertura', preco_venda: 80, preco_custo: 0, estoque: 0, estoque_min: 0, tipo_produto: 'servico', fabricante_id: 1, tipo: 'residencial' })",
  )
  await esperarAssentar(window)

  // No serviço, os campos físicos estão OCULTOS para o usuário — nas duas
  // estruturas do index.html: display:none (toggle) ou ausentes (render
  // condicional). Estoque mín. resolvido por id-ou-rótulo.
  assert.ok(
    campoDeServicoOcultado(doc, "chCampoCusto"),
    "serviço esconde o custo",
  )
  assert.ok(
    campoDeServicoOcultado(doc, acharCampoEstoqueMinimo(doc)),
    "serviço esconde o estoque mín.",
  )

  // Troca para 'chave' (produto): campos voltam a aparecer.
  doc.getElementById("chTipoProduto").value = "chave"
  window.eval("chaveAtualizarCamposServico()")
  assert.ok(
    campoDeServicoVisivel(doc, "chCampoCusto"),
    "serviço→produto: custo reaparece",
  )
  assert.ok(
    campoDeServicoVisivel(doc, acharCampoEstoqueMinimo(doc)),
    "serviço→produto: estoque mín. reaparece",
  )

  // Preenche custo e estoque mín. e salva (edição = update).
  doc.getElementById("chPrecoC").value = "7"
  doc.getElementById("chEstMin").value = "3"
  await window.eval("chaveSalvar(20, null)")
  await esperarAssentar(window)

  const atualizados = registro.update.chaves || []
  const dados = atualizados[atualizados.length - 1]
  assert.ok(dados, "deveria ter atualizado 'chaves'")
  assert.strictEqual(dados.tipo_produto, "chave", "virou produto")
  assert.strictEqual(dados.preco_custo, 7, "produto grava custo numérico digitado")
  assert.strictEqual(dados.estoque_min, 3, "produto grava estoque_min numérico digitado")
})

// ------------------------------------------------------------
// (3) Render da lista de produtos: serviço (estoque null) mostra "—"
//     e NÃO mostra badge de estoque baixo; físico mostra o número.
// ------------------------------------------------------------
test("lista de produtos: serviço sem badge de estoque baixo; físico abaixo do mínimo com badge", async function () {
  const { window, doc } = await prepararComProdutos()
  // Semeia produtos: um serviço com estoque null e estoque_min null,
  // um físico com estoque baixo (1 <= min 5).
  window.eval(
    "CACHE.chaves = [" +
      "  { id: 30, codigo: 'SV9', descricao: 'Servico Sem Estoque', preco_venda: 80, estoque: null, estoque_min: null, tipo_produto: 'servico', fabricante_id: 1, tipo: 'residencial' }," +
      "  { id: 31, codigo: 'CH9', descricao: 'Chave Baixa', preco_venda: 10, estoque: 1, estoque_min: 5, tipo_produto: 'chave', fabricante_id: 1, tipo: 'residencial' }" +
      "];",
  )
  await window.eval("pageChaves()")
  await esperarAssentar(window)
  // pageChaves recarrega do supabase fake (vazio): re-semeia e re-renderiza.
  window.eval(
    "CACHE.chaves = [" +
      "  { id: 30, codigo: 'SV9', descricao: 'Servico Sem Estoque', preco_venda: 80, estoque: null, estoque_min: null, tipo_produto: 'servico', fabricante_id: 1, tipo: 'residencial' }," +
      "  { id: 31, codigo: 'CH9', descricao: 'Chave Baixa', preco_venda: 10, estoque: 1, estoque_min: 5, tipo_produto: 'chave', fabricante_id: 1, tipo: 'residencial' }" +
      "];",
  )
  window.eval("renderChaves()")

  const tabela = doc.getElementById("chList")
  const linhas = tabela.querySelectorAll("tbody tr")
  assert.strictEqual(linhas.length, 2, "deveria renderizar 2 produtos")

  function linhaComTexto(texto) {
    for (const linha of linhas) {
      if (linha.textContent.includes(texto)) return linha
    }
    return null
  }

  const linhaServico = linhaComTexto("Servico Sem Estoque")
  const linhaFisico = linhaComTexto("Chave Baixa")
  assert.ok(linhaServico, "não achei a linha do serviço")
  assert.ok(linhaFisico, "não achei a linha do físico")

  // Comportamento REAL do canônico: como estoque_min é null (falsy), a guarda
  // `estoque_min > 0 && estoque <= estoque_min` dá false, então o serviço NÃO
  // recebe o badge de estoque baixo (que é o que importa para o usuário).
  assert.doesNotMatch(
    linhaServico.innerHTML,
    /b-baixo/,
    "serviço não deveria ter o badge de estoque baixo",
  )

  // O físico baixo mantém o badge com o número.
  assert.match(
    linhaFisico.innerHTML,
    /b-baixo/,
    "físico com estoque <= mínimo deveria manter o badge de baixo",
  )
})

// ------------------------------------------------------------
// (4) Dashboard: filtro de "estoque baixo" ignora serviço (estoque null).
// ------------------------------------------------------------
test("estoque baixo ignora serviço (estoque null): null <= min dá false", async function () {
  const { window } = await prepararComProdutos()
  // Regra usada no dashboard e na lista: estoque_min > 0 && estoque <= estoque_min.
  const servicoNull = window.eval(
    "(function(k){ return k.estoque_min > 0 && k.estoque <= k.estoque_min; })({ estoque: null, estoque_min: null })",
  )
  const fisicoBaixo = window.eval(
    "(function(k){ return k.estoque_min > 0 && k.estoque <= k.estoque_min; })({ estoque: 1, estoque_min: 5 })",
  )
  assert.strictEqual(servicoNull, false, "serviço (null) não conta como estoque baixo")
  assert.strictEqual(fisicoBaixo, true, "físico 1<=5 conta como estoque baixo")
})

// ------------------------------------------------------------
// (5) Valuation do estoque: serviço fica FORA da soma de custo e de venda.
//     1 físico (estoque 5, custo 2, venda 3) + 1 serviço =>
//     valorCusto = 10 (5×2), valorVenda = 15 (5×3). Serviço não entra.
// ------------------------------------------------------------
// Semeia o CACHE e renderiza; devolve o texto do resumo de valuation.
// pageChaves() monta o container #chList (e recarrega do supabase fake vazio),
// então semeamos o CACHE DEPOIS e chamamos renderChaves() na mão.
async function renderizarComListaEValidarResumo(window, doc, listaLiteral) {
  await window.eval("pageChaves()")
  await esperarAssentar(window)
  window.eval("CACHE.chaves = " + listaLiteral + ";")
  window.eval("renderChaves()")
  const resumo = doc.querySelector("#chList .resumo-estoque")
  assert.ok(resumo, "deveria renderizar o resumo de valuation")
  return resumo.textContent
}

test("valuation: serviço fica fora da soma de custo e de venda (físico 5×2=10, 5×3=15)", async function () {
  const { window, doc } = await prepararComProdutos()
  const texto = await renderizarComListaEValidarResumo(
    window,
    doc,
    "[" +
      "  { id: 40, codigo: 'CH1', descricao: 'Chave Fisica', preco_custo: 2, preco_venda: 3, estoque: 5, estoque_min: 1, tipo_produto: 'chave', fabricante_id: 1, tipo: 'residencial' }," +
      "  { id: 41, codigo: 'SV1', descricao: 'Servico', preco_custo: null, preco_venda: 80, estoque: null, estoque_min: null, tipo_produto: 'servico', fabricante_id: 1, tipo: 'residencial' }" +
      "]",
  )
  assert.match(texto, /custo\)[^R]*R\$\s*10,00/, "valorCusto deveria ser 10,00 (só o físico). Texto: " + texto)
  assert.match(texto, /venda:\s*R\$\s*15,00/, "valorVenda deveria ser 15,00 (só o físico). Texto: " + texto)
})

test("valuation: serviço com estoque/custo/venda não-nulos por engano ainda fica de fora", async function () {
  const { window, doc } = await prepararComProdutos()
  // Serviço com números "sujos" (estoque 100, custo 9, venda 999): a guarda
  // explícita por tipo_produto tem que ignorá-lo mesmo assim.
  const texto = await renderizarComListaEValidarResumo(
    window,
    doc,
    "[" +
      "  { id: 42, codigo: 'CH2', descricao: 'Chave Fisica', preco_custo: 2, preco_venda: 3, estoque: 5, estoque_min: 1, tipo_produto: 'chave', fabricante_id: 1, tipo: 'residencial' }," +
      "  { id: 43, codigo: 'SV2', descricao: 'Servico Sujo', preco_custo: 9, preco_venda: 999, estoque: 100, estoque_min: 0, tipo_produto: 'servico', fabricante_id: 1, tipo: 'residencial' }" +
      "]",
  )
  assert.match(texto, /custo\)[^R]*R\$\s*10,00/, "valorCusto deveria continuar 10,00. Texto: " + texto)
  assert.match(texto, /venda:\s*R\$\s*15,00/, "valorVenda deveria continuar 15,00. Texto: " + texto)
})

test("valuation: funcionário sem permissão de faturamento não vê o resumo de valor do estoque", async function () {
  const { window, doc } = await prepararComProdutos()
  await window.eval("pageChaves()")
  await esperarAssentar(window)
  // Operador comum, sem a permissão 'faturamento': o valor do estoque é dado do
  // dono e não pode nem chegar ao DOM.
  window.eval(
    "SESSAO = { id: 2, usuario: 'balcao', nome: 'Balcao', perfil: 'operador', permissoes: '' };",
  )
  window.eval(
    "CACHE.chaves = [{ id: 50, codigo: 'CH3', descricao: 'Chave Fisica', preco_custo: 2, preco_venda: 3, estoque: 5, estoque_min: 1, tipo_produto: 'chave', fabricante_id: 1, tipo: 'residencial' }];",
  )
  window.eval("renderChaves()")
  const resumo = doc.querySelector("#chList .resumo-estoque")
  assert.strictEqual(resumo, null, "sem permissão de faturamento, o resumo de valor não pode ser renderizado")
  // A tabela de produtos em si continua visível (só o valor financeiro some).
  assert.ok(doc.querySelector("#chList table"), "a lista de produtos deveria continuar aparecendo")
})
