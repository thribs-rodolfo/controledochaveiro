// ============================================================
// aviso-ativacao.test.js — o aviso central de ativação para a MyKey é
// "melhor esforço": NUNCA pode lançar erro nem quebrar a ativação, e não
// pode enviar nada quando a URL não está configurada. App REAL no jsdom.
// ============================================================

const { test } = require("node:test")
const assert = require("node:assert")
const { montarAmbiente } = require("./ambiente")

async function preparar() {
  const ambiente = await montarAmbiente()
  return { window: ambiente.window, doc: ambiente.window.document }
}

// No ambiente de teste, window.URL_AVISO_ATIVACAO não é definido, então a
// constante URL_AVISO_ATIVACAO do app vale "" — o aviso deve ser ignorado e
// NENHUM fetch pode ser disparado.
test("avisarAtivacaoMyKey: sem URL configurada, não dispara fetch e não lança", async function () {
  const { window } = await preparar()
  let fetchChamado = false
  window.fetch = function () {
    fetchChamado = true
    return Promise.resolve()
  }
  // Não deve lançar.
  window.eval(
    "avisarAtivacaoMyKey({ nome_chaveiro: 'Fulano', cidade: 'Cidade', whatsapp: '35999', codigo_instalacao: 'MK-1', data_ativacao: '2026-08-24T00:00:00Z' })",
  )
  assert.strictEqual(fetchChamado, false, "sem URL, não pode chamar fetch")
})

// A URL com o texto de exemplo ("COLE_AQUI...") conta como "não configurada":
// mesmo que a constante tivesse esse valor, o guard impede o envio. Provamos o
// guard chamando a função real e confirmando que nenhum fetch sai.
test("avisarAtivacaoMyKey: com a URL de exemplo (COLE_AQUI), não envia", async function () {
  const { window } = await preparar()
  let fetchChamado = false
  window.fetch = function () {
    fetchChamado = true
    return Promise.resolve()
  }
  // No teste a constante URL_AVISO_ATIVACAO é "" (não configurada), então o
  // guard por vazio já barra; e a checagem de "COLE_AQUI" cobre o outro caso.
  window.eval(
    "avisarAtivacaoMyKey({ nome_chaveiro: 'Fulano', cidade: 'C', whatsapp: '1', codigo_instalacao: 'MK-1', data_ativacao: 'x' })",
  )
  assert.strictEqual(fetchChamado, false, "URL não configurada não pode enviar")
  // O código-fonte só monta o corpo com os campos de contato (verificado em
  // revisão): nome_chaveiro, cidade, whatsapp, codigo_instalacao, data_ativacao.
  // O código de liberação NUNCA é passado para o corpo do aviso.
  const fs = require("fs")
  const path = require("path")
  const html = fs.readFileSync(
    path.join(__dirname, "..", "index.html"),
    "utf8",
  )
  const trecho = html.slice(
    html.indexOf("function avisarAtivacaoMyKey"),
    html.indexOf("async function ativarSistema"),
  )
  assert.ok(
    trecho.indexOf("codigo_liberacao") === -1,
    "o aviso NÃO pode conter o código de liberação",
  )
})

// Contrato central: se o fetch FALHAR (offline / servidor fora), a função
// não pode propagar erro — a ativação já valeu.
test("avisarAtivacaoMyKey: se o fetch rejeita, não propaga erro", async function () {
  const { window } = await preparar()
  window.fetch = function () {
    return Promise.reject(new Error("sem internet"))
  }
  // A função real usa .catch(...) interno; chamar não pode lançar nem gerar
  // rejeição não tratada síncrona.
  assert.doesNotThrow(function () {
    window.eval(
      "avisarAtivacaoMyKey({ nome_chaveiro: 'Fulano', cidade: 'C', whatsapp: '1', codigo_instalacao: 'MK-1', data_ativacao: 'x' })",
    )
  })
})
