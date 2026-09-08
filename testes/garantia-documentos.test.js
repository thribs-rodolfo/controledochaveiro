// ============================================================
// garantia-documentos.test.js — a garantia padrão (dias) das Regras de
// Negócio deve aparecer NOS DOCUMENTOS impressos: cupom térmico
// (imprimirCupom) e A4 de orçamento e recibo (imprimirDoc).
//
// Roda o <script> inline do index.html DE VERDADE num DOM jsdom. Semeamos
// CACHE.servicos/clientes e sobrescrevemos getConfig() para devolver a
// configuração controlada (com ou sem garantia). Depois lemos o HTML gerado
// em #printDoc — que as funções preenchem ANTES de chamar safePrint().
//
// Regra afirmada: a linha de garantia SÓ aparece quando garantia_dias > 0.
// Com garantia_dias 0 (ou vazio), NENHUMA linha de garantia é impressa.
// ============================================================

const { test } = require("node:test")
const assert = require("node:assert")
const { montarAmbiente, esperarAssentar } = require("./ambiente")

// Semeia um serviço/venda e um cliente no CACHE e fixa a config devolvida por
// getConfig(). 'garantia' é o valor de garantia_dias que queremos testar.
async function prepararComGarantia(garantia) {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  window.eval(
    "CACHE.clientes = [{ id: 1, nome: 'Cliente Teste', telefone: '35999998888' }];" +
      "CACHE.servicos = [{" +
      "  id: 42, cliente_id: 1, status: 'concluido', status_pagamento: 'pago'," +
      "  tipo: 'servico', titulo: 'Copia de chave', servico: 'Copia de chave'," +
      "  criado_em: '2026-08-25T10:00:00.000Z', total: 100, valor_pago: 100," +
      "  desconto: 0, forma_pagamento: 'Dinheiro', mao_de_obra: 0," +
      "  itens: [{ descricao: 'Chave', quantidade: 1, unidade_medida: 'UN', preco_unit: 100, total: 100 }]" +
      "}];",
  )
  // Sobrescreve getConfig para devolver a config controlada (o Supabase dublado
  // devolveria configuracoes vazias). Função nomeada, sem arrow, sem try/catch.
  const configJson = JSON.stringify({
    nome_empresa: "Chaveiro Teste",
    garantia_dias: String(garantia),
  })
  window.eval(
    "getConfig = function reconfigurarParaTeste() { return Promise.resolve(" +
      configJson +
      "); };",
  )
  return { window: window, doc: window.document }
}

// Lê o HTML atualmente montado no #printDoc.
function htmlDoDocumento(window) {
  return window.document.getElementById("printDoc").innerHTML
}

test("cupom térmico: imprime a garantia por extenso quando garantia_dias > 0", async function () {
  const ctx = await prepararComGarantia(90)
  await ctx.window.eval("imprimirCupom(42)")
  await esperarAssentar(ctx.window)
  const html = htmlDoDocumento(ctx.window)
  assert.match(html, /Garantia: 90 dias \(noventa dias\)/)
})

test("cupom térmico: NÃO imprime garantia quando garantia_dias é 0", async function () {
  const ctx = await prepararComGarantia(0)
  await ctx.window.eval("imprimirCupom(42)")
  await esperarAssentar(ctx.window)
  const html = htmlDoDocumento(ctx.window)
  assert.ok(
    html.indexOf("Garantia:") === -1,
    "não deve haver linha de garantia com garantia_dias 0",
  )
})

test("A4 orçamento: imprime a garantia por extenso quando garantia_dias > 0", async function () {
  const ctx = await prepararComGarantia(90)
  await ctx.window.eval("imprimirDoc(42, 'orcamento')")
  await esperarAssentar(ctx.window)
  const html = htmlDoDocumento(ctx.window)
  assert.match(html, /Garantia: 90 dias \(noventa dias\)/)
})

test("A4 orçamento: NÃO imprime garantia quando garantia_dias é 0", async function () {
  const ctx = await prepararComGarantia(0)
  await ctx.window.eval("imprimirDoc(42, 'orcamento')")
  await esperarAssentar(ctx.window)
  const html = htmlDoDocumento(ctx.window)
  assert.ok(
    html.indexOf("Garantia:") === -1,
    "não deve haver linha de garantia com garantia_dias 0",
  )
})

test("A4 recibo: imprime a garantia por extenso quando garantia_dias > 0", async function () {
  const ctx = await prepararComGarantia(90)
  await ctx.window.eval("imprimirDoc(42, 'recibo')")
  await esperarAssentar(ctx.window)
  const html = htmlDoDocumento(ctx.window)
  assert.match(html, /Garantia: 90 dias \(noventa dias\)/)
})

test("A4 recibo: NÃO imprime garantia quando garantia_dias é 0", async function () {
  const ctx = await prepararComGarantia(0)
  await ctx.window.eval("imprimirDoc(42, 'recibo')")
  await esperarAssentar(ctx.window)
  const html = htmlDoDocumento(ctx.window)
  assert.ok(
    html.indexOf("Garantia:") === -1,
    "não deve haver linha de garantia com garantia_dias 0",
  )
})

test("por extenso: 365 dias vira 'trezentos e sessenta e cinco'", async function () {
  const ctx = await prepararComGarantia(365)
  await ctx.window.eval("imprimirCupom(42)")
  await esperarAssentar(ctx.window)
  const html = htmlDoDocumento(ctx.window)
  assert.match(
    html,
    /Garantia: 365 dias \(trezentos e sessenta e cinco dias\)/,
  )
})
