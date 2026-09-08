// ============================================================
// estoque-baixo-dashboard.test.js — regressão do "Estoque baixo" do dashboard.
//
// Regra do dashboard: estoqueBaixo lista produtos ABAIXO do estoque mínimo,
// EXCLUINDO serviço (mão de obra não tem estoque físico). Padrão do source:
//   estoqueBaixo = CACHE.chaves.filter(k =>
//     k.estoque_min > 0 && k.estoque <= k.estoque_min && k.tipo_produto !== "servico")
//
// Este teste NÃO reimplementa a lógica: ele EXTRAI do próprio index.html o
// trecho real que constrói `estoqueBaixo` (o `CACHE.chaves.filter(...).sort(...).slice(...)`)
// e o AVALIA com um CACHE.chaves mock. Assim uma regressão no source é pega:
//   1) ASI/"return" solto numa linha -> filtro devolve undefined p/ tudo ->
//      estoqueBaixo fica SEMPRE VAZIO -> a guarda de length >= 1 FALHA.
//   2) Sumir a condição `tipo_produto !== "servico"` -> um serviço com estoque
//      baixo entraria na lista -> o assert do serviço D FALHA.
// ============================================================

const { test } = require("node:test")
const assert = require("node:assert")
const fs = require("fs")
const path = require("path")

const CAMINHO_INDEX =
  process.env.CAMINHO_INDEX_TESTE ||
  path.join(__dirname, "..", "index.html")

// Extrai do index.html o texto EXATO da atribuição de `estoqueBaixo`:
// de `const estoqueBaixo = CACHE.chaves` até o `.slice(0, 8)` que a encerra.
// Retorna só a expressão (o lado direito), pronta para ser avaliada.
function extrairExpressaoEstoqueBaixo(html) {
  const inicio = html.indexOf("const estoqueBaixo = CACHE.chaves")
  assert.notStrictEqual(
    inicio,
    -1,
    "não encontrei 'const estoqueBaixo = CACHE.chaves' no index.html — o dashboard mudou?",
  )
  // A partir do início, acha o `.slice(` que fecha a cadeia e vai até o `)` dele.
  const posSlice = html.indexOf(".slice(", inicio)
  assert.notStrictEqual(
    posSlice,
    -1,
    "não encontrei o `.slice(` que encerra a construção de estoqueBaixo",
  )
  const posFechaParen = html.indexOf(")", posSlice)
  assert.notStrictEqual(posFechaParen, -1, "`.slice(` sem fechamento")

  const trecho = html.slice(inicio, posFechaParen + 1)
  // Remove o prefixo `const estoqueBaixo = ` para sobrar só a expressão.
  const expressao = trecho.replace(/^const\s+estoqueBaixo\s*=\s*/, "")
  return expressao
}

// Avalia a expressão real do source contra um CACHE.chaves mock, preservando a
// quebra de linha original (importante: um `return`+newline no source só quebra
// se o texto for avaliado como está, sem reformatação).
function avaliarEstoqueBaixo(expressao, chavesMock) {
  // O trecho real termina em `.slice(0, limiteInicial)`. `limiteInicial` é o
  // limite de itens do painel (padrão 8 no app); passamos um valor alto para
  // não cortar nenhum item elegível do mock e testar só a regra do filtro.
  const fn = new Function(
    "CACHE",
    "limiteInicial",
    "return (" + expressao + ");",
  )
  return fn({ chaves: chavesMock }, 100)
}

// Produtos mock cobrindo os casos da regra.
const CHAVES_MOCK = [
  // A: chave física abaixo do mínimo -> DEVE aparecer.
  { id: 1, codigo: "A", descricao: "Chave A", estoque_min: 5, estoque: 2, tipo_produto: "chave" },
  // B: min 0 -> NÃO aparece (não rastreia mínimo).
  { id: 2, codigo: "B", descricao: "Chave B", estoque_min: 0, estoque: 0, tipo_produto: "chave" },
  // C: serviço sem estoque (min 0) -> NÃO aparece.
  { id: 3, codigo: "C", descricao: "Servico C", estoque_min: 0, estoque: null, tipo_produto: "servico" },
  // D: serviço "abaixo do mínimo" -> NÃO aparece (exclusão de serviço).
  { id: 4, codigo: "D", descricao: "Servico D", estoque_min: 3, estoque: 1, tipo_produto: "servico" },
]

test("dashboard estoqueBaixo (source real): inclui chave abaixo do mínimo, exclui min-zero e serviços", function () {
  const html = fs.readFileSync(CAMINHO_INDEX, "utf8")
  const expressao = extrairExpressaoEstoqueBaixo(html)
  const estoqueBaixo = avaliarEstoqueBaixo(expressao, CHAVES_MOCK)

  const ids = estoqueBaixo.map((k) => k.id)

  // Guarda anti-ASI: se o filtro do source retornasse undefined p/ tudo
  // (return solto numa linha), a lista viria vazia e isto FALHA.
  assert.ok(
    estoqueBaixo.length >= 1,
    "estoqueBaixo veio vazio — provável ASI/'return' solto no filtro do source: " +
      JSON.stringify(expressao),
  )

  // A DEVE aparecer (chave física abaixo do mínimo).
  assert.ok(ids.includes(1), "produto A (chave abaixo do mínimo) deveria estar em estoqueBaixo")
  // B NÃO aparece (estoque_min 0).
  assert.ok(!ids.includes(2), "produto B (estoque_min 0) NÃO deveria aparecer")
  // C NÃO aparece (serviço, min 0).
  assert.ok(!ids.includes(3), "serviço C NÃO deveria aparecer")
  // D NÃO aparece (serviço mesmo 'abaixo do mínimo' é excluído).
  assert.ok(
    !ids.includes(4),
    "serviço D NÃO deveria aparecer — a condição `tipo_produto !== \"servico\"` sumiu do source?",
  )

  // Exatamente 1 item elegível (só o A).
  assert.strictEqual(
    estoqueBaixo.length,
    1,
    "esperava exatamente 1 produto em estoqueBaixo (o A). Veio: " + JSON.stringify(ids),
  )
})
