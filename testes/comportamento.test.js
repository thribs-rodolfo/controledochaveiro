// ============================================================
// comportamento.test.js — testes de COMPORTAMENTO do index.html
//
// Roda com o test runner nativo do Node:   npm test   (node --test)
//
// Estes testes carregam o index.html num DOM jsdom com o <script> inline
// EXECUTANDO de verdade (globais externos dublados). Eles verificam o que o
// `node --check` NÃO pega: id duplicado por formulário e recálculo errado.
//
// O caso que originou a suite: id="osDesc" era usado na DESCRIÇÃO e no DESCONTO
// da OS ao mesmo tempo. getElementById devolvia o primeiro (a textarea), então o
// desconto nunca recalculava. Já corrigido (o desconto virou #osDesconto): o
// teste (a) guarda contra id duplicado; o teste (b) confirma que o Total reflete
// o desconto.
// ============================================================

const { test } = require("node:test")
const assert = require("node:assert")
const {
  montarAmbiente,
  semearCache,
  idsDuplicados,
  esperarAssentar,
  acharCampoEstoqueMinimo,
  campoDeServicoOcultado,
  campoDeServicoVisivel,
} = require("./ambiente")

// Formulários que abrem em modal (openModal / openModal2). Cada um é chamado
// isoladamente e o HTML renderizado é inspecionado.
const FORMULARIOS_MODAL = [
  "osForm",
  "chaveForm",
  "clienteForm",
  "funcForm",
  "txForm",
  "fabForm",
  "catForm",
  "eqForm",
]

// Páginas que renderizam direto no #main (não em modal).
const PAGINAS = [
  "pageDashboard",
  "pagePDV",
  "pageChaves",
  "pageClientes",
  "pageServicos",
  "pageFabricantes",
  "pageCategorias",
  "pageEquivalencias",
  "pageEstoque",
  "pageFinanceiro",
  "pageRelatorios",
  "pageTipos",
  "pageFuncionarios",
  "pageConfiguracoes",
]

// Helper: monta ambiente já semeado e devolve { window, doc }.
async function prepararApp() {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  semearCache(window)
  return { window: window, doc: window.document }
}

// Acha o INPUT numérico de desconto da OS de forma ROBUSTA (sem depender do id,
// que é justamente o que pode estar bugado). O campo de desconto é o input que
// fica imediatamente antes do seletor R$/% (#osDescTipo), na mesma linha.
// Simula "o usuário digitando no campo de desconto".
function acharCampoDescontoOs(doc) {
  const tipo = doc.getElementById("osDescTipo")
  assert.ok(tipo, "não achei o seletor R$/% da OS (#osDescTipo)")
  const container = tipo.parentElement
  const input = container.querySelector('input[type="number"]')
  assert.ok(input, "não achei o input numérico de desconto ao lado de #osDescTipo")
  return input
}

// ------------------------------------------------------------
// (0) Sanidade do ambiente: o app bootou e as funções existem.
// ------------------------------------------------------------
test("ambiente: o app carrega e expõe as funções de formulário", async function () {
  const { window } = await prepararApp()
  FORMULARIOS_MODAL.forEach(function (nome) {
    assert.strictEqual(
      typeof window[nome],
      "function",
      "função " + nome + " deveria existir no app",
    )
  })
  assert.strictEqual(typeof window.osRecalc, "function")
  assert.strictEqual(typeof window.renderPdvCart, "function")
})

// ------------------------------------------------------------
// (a) NENHUM formulário/modal pode ter id duplicado.
//     Guarda contra a regressão do osDesc duplicado (já corrigido).
// ------------------------------------------------------------
FORMULARIOS_MODAL.forEach(function (nomeForm) {
  // Historicamente o osForm renderizava dois elementos com id="osDesc" (a
  // textarea de descrição e o input de desconto), então getElementById pegava
  // sempre a textarea e o desconto da OS não recalculava. Corrigido: o campo de
  // desconto agora é #osDesconto. Este teste garante que nenhum formulário
  // volte a ter id duplicado.
  test(
    "sem id duplicado no formulário: " + nomeForm,
    async function () {
      const { window, doc } = await prepararApp()
      // catForm/funcForm etc. usam modal normal; clienteForm/chaveForm sem
      // contexto também usam modal normal. Chamamos sem argumentos.
      window.eval(nomeForm + "()")
      const modal = doc.getElementById("modal")
      assert.ok(
        modal.innerHTML.length > 0,
        nomeForm + " não renderizou nada no modal",
      )
      const duplicados = idsDuplicados(modal)
      assert.deepStrictEqual(
        duplicados,
        [],
        nomeForm +
          " renderizou id(s) duplicado(s): " +
          JSON.stringify(duplicados) +
          ". Ids têm que ser únicos dentro de cada formulário.",
      )
    },
  )
})

// Cobertura extra do id duplicado na tela de PDV (renderiza no #main).
test("sem id duplicado na tela de PDV (pagePDV)", async function () {
  const { window, doc } = await prepararApp()
  await window.eval("pagePDV()")
  await esperarAssentar(window)
  const main = doc.getElementById("main")
  assert.ok(main.innerHTML.length > 0, "pagePDV não renderizou nada")
  const duplicados = idsDuplicados(main)
  assert.deepStrictEqual(
    duplicados,
    [],
    "pagePDV renderizou id(s) duplicado(s): " + JSON.stringify(duplicados),
  )
})

// ------------------------------------------------------------
// (b) Comportamento do DESCONTO da OS: o Total tem que refletir
//     subtotal − desconto (e NÃO ficar igual ao subtotal).
//     O desconto é lido de #osDesconto; a descrição fica em #osDesc.
// ------------------------------------------------------------
test("desconto da OS em R$: Total reflete subtotal − desconto", async function () {
  const { window, doc } = await prepararApp()
  window.eval("osForm()")

  // subtotal = mão de obra = 100,00
  doc.getElementById("osMaoObra").value = "100,00"

  // O usuário digita 30 no CAMPO DE DESCONTO (o input numérico), não na
  // descrição. Localizamos o campo por posição (robusto ao id).
  const campoDesconto = acharCampoDescontoOs(doc)
  campoDesconto.value = "30"

  window.eval("osRecalc()")

  const total = doc.getElementById("osTotal").value
  assert.strictEqual(
    total,
    "R$ 70,00",
    "Total deveria ser R$ 70,00 (100 − 30). Veio '" +
      total +
      "'. Se veio 'R$ 100,00', o desconto não recalculou (osRecalc deveria " +
      "ler o campo #osDesconto).",
  )
})

test("desconto da OS em %: Total reflete subtotal − percentual", async function () {
  const { window, doc } = await prepararApp()
  window.eval("osForm()")
  doc.getElementById("osMaoObra").value = "200,00"

  const campoDesconto = acharCampoDescontoOs(doc)
  campoDesconto.value = "10" // 10%
  doc.getElementById("osDescTipo").value = "pct"

  window.eval("osRecalc()")

  const total = doc.getElementById("osTotal").value
  assert.strictEqual(
    total,
    "R$ 180,00",
    "Total deveria ser R$ 180,00 (200 − 10%). Veio '" + total + "'.",
  )
})

// ------------------------------------------------------------
// (b') Comportamento do DESCONTO do PDV: mesmo raciocínio.
// ------------------------------------------------------------
test("desconto do PDV em R$: Total reflete subtotal − desconto", async function () {
  const { window, doc } = await prepararApp()
  await window.eval("pagePDV()")
  await esperarAssentar(window)

  // carrinho com 1 item de R$ 100
  window.eval(
    "PDV_CART = [{ descricao: 'Item', quantidade: 1, preco_unit: 100, estoque: 5, codigo: 'c1' }]",
  )
  doc.getElementById("pdvDesc").value = "30"
  window.eval("renderPdvCart()")

  const total = doc.getElementById("pdvTotal").textContent
  assert.strictEqual(
    total,
    "R$ 70,00",
    "Total do PDV deveria ser R$ 70,00 (100 − 30). Veio '" + total + "'.",
  )
})

// ------------------------------------------------------------
// (c) Campos de serviço: ao escolher tipo de produto "serviço" no
//     chaveForm, os campos de custo/estoque somem.
// ------------------------------------------------------------
// Este teste afirma o COMPORTAMENTO (serviço não mostra custo/estoque mín. ao
// usuário), não a MECÂNICA. Aceita as duas estruturas do index.html:
//   - toggle por display: o campo existe e recebe display:none;
//   - render condicional: o campo some do DOM.
// Também aceita o id antigo (chCampoEstMin) e o novo (chCampoEstoqueMinimo),
// resolvendo o campo de estoque mín. por id-ou-rótulo.
test("chaveForm: tipo 'serviço' ESCONDE custo e estoque (toggle por display)", async function () {
  const { window, doc } = await prepararApp()
  window.eval("chaveForm()")

  // por padrão (tipo != serviço), custo e estoque mín. estão VISÍVEIS
  assert.ok(
    campoDeServicoVisivel(doc, "chCampoCusto"),
    "com tipo padrão, o campo de custo deveria estar visível",
  )
  assert.ok(
    campoDeServicoVisivel(doc, acharCampoEstoqueMinimo(doc)),
    "com tipo padrão, o campo de estoque mínimo deveria estar visível",
  )

  // troca para 'serviço' e dispara o toggle real do app
  doc.getElementById("chTipoProduto").value = "servico"
  window.eval("chaveAtualizarCamposServico()")

  assert.ok(
    campoDeServicoOcultado(doc, "chCampoCusto"),
    "com tipo 'serviço', o campo de custo não deveria aparecer (display:none ou removido)",
  )
  assert.ok(
    campoDeServicoOcultado(doc, acharCampoEstoqueMinimo(doc)),
    "com tipo 'serviço', o campo de estoque mínimo não deveria aparecer",
  )

  // volta para 'chave' e confirma que reaparece
  doc.getElementById("chTipoProduto").value = "chave"
  window.eval("chaveAtualizarCamposServico()")
  assert.ok(
    campoDeServicoVisivel(doc, "chCampoCusto"),
    "ao voltar para 'chave', o custo deveria voltar a aparecer",
  )
})

// ------------------------------------------------------------
// (c2) BUG task 334 + render condicional: no cadastro, tipo 'serviço'
//      não renderiza Fabricante, Unidade, Tipo físico, Custo, Estoque
//      mín. nem Estoque inicial, e o rótulo da foto não diz "produto".
//      Caso-chave: abrir SERVIÇO e trocar para PRODUTO TRAZ os campos
//      de volta (o toggle antigo por display não fazia isso ao remontar).
// ------------------------------------------------------------
test("chaveForm: 'serviço' esconde custo/estoque mín./estoque inicial; voltar a produto os traz de volta", async function () {
  const { window, doc } = await prepararApp()
  window.eval("chaveForm()")

  // Cadastro NOVO (não-edição), tipo padrão: os três campos físicos estão
  // VISÍVEIS ao usuário (existem no DOM e sem display:none). Campo de estoque
  // mín. resolvido por id-ou-rótulo (id difere entre as duas estruturas).
  assert.ok(campoDeServicoVisivel(doc, "chCampoCusto"), "custo deveria estar visível")
  assert.ok(
    campoDeServicoVisivel(doc, acharCampoEstoqueMinimo(doc)),
    "estoque mín. deveria estar visível",
  )
  assert.ok(
    campoDeServicoVisivel(doc, "chCampoEstoqueInicial"),
    "estoque inicial deveria estar visível (cadastro novo)",
  )

  // troca para 'serviço': os campos físicos somem PARA O USUÁRIO (display:none
  // ou removidos do DOM, conforme a estrutura).
  doc.getElementById("chTipoProduto").value = "servico"
  window.eval("chaveAtualizarCamposServico()")

  assert.ok(campoDeServicoOcultado(doc, "chCampoCusto"), "serviço esconde custo")
  assert.ok(
    campoDeServicoOcultado(doc, acharCampoEstoqueMinimo(doc)),
    "serviço esconde estoque mín.",
  )
  assert.ok(
    campoDeServicoOcultado(doc, "chCampoEstoqueInicial"),
    "serviço esconde estoque inicial",
  )

  // volta de 'serviço' para 'chave' e TODOS reaparecem
  doc.getElementById("chTipoProduto").value = "chave"
  window.eval("chaveAtualizarCamposServico()")
  assert.ok(campoDeServicoVisivel(doc, "chCampoCusto"), "serviço→produto: custo volta")
  assert.ok(
    campoDeServicoVisivel(doc, acharCampoEstoqueMinimo(doc)),
    "serviço→produto: estoque mín. volta",
  )
  assert.ok(
    campoDeServicoVisivel(doc, "chCampoEstoqueInicial"),
    "serviço→produto: estoque inicial volta",
  )
})

// ------------------------------------------------------------
// Smoke tests baratos: cada página renderiza no #main sem lançar exceção.
// ------------------------------------------------------------
PAGINAS.forEach(function (nomePagina) {
  test("smoke: " + nomePagina + " renderiza sem lançar", async function () {
    const { window, doc } = await prepararApp()
    assert.strictEqual(
      typeof window[nomePagina],
      "function",
      nomePagina + " deveria existir",
    )
    // algumas páginas são async (carregam do supabase fake); await cobre as duas.
    await window.eval("(" + nomePagina + ")()")
    await esperarAssentar(window)
    const main = doc.getElementById("main")
    assert.ok(
      main.innerHTML.length > 0,
      nomePagina + " não renderizou conteúdo no #main",
    )
  })
})

// Smoke extra: cada formulário-modal abre e fecha sem lançar.
FORMULARIOS_MODAL.forEach(function (nomeForm) {
  test("smoke: " + nomeForm + " abre e fecha sem lançar", async function () {
    const { window, doc } = await prepararApp()
    window.eval(nomeForm + "()")
    assert.ok(doc.getElementById("modal").innerHTML.length > 0)
    window.eval("closeModal()")
    assert.ok(
      !doc.getElementById("modalBg").classList.contains("show"),
      "closeModal deveria remover a classe .show",
    )
  })
})
