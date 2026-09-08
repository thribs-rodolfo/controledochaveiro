// ============================================================
// erro-nao-vira-sucesso.test.js — if(error) throw (Commit B)
//
// O supabase-js NAO lanca em erro de banco: resolve { error }. Antes, varios
// writes (movimentacoes, transacoes) ignoravam esse { error } e o app mostrava
// "sucesso" mesmo sem gravar nada (falso sucesso = dinheiro/estoque sumido).
//
// Aqui INJETAMOS um erro no write (via __erros do fake) e confirmamos que:
//   (1) o app NAO mostra o toast/modal de sucesso, e
//   (2) a promessa da acao rejeita (o erro sobe) OU o fluxo cai no catch.
//
// Usamos registro.__erros[tipo][tabela] = { message } para simular a falha.
// ============================================================

const { test } = require("node:test")
const assert = require("node:assert")
const {
  montarAmbiente,
  semearCache,
  semearProdutos,
  esperarAssentar,
} = require("./ambiente")

// Captura os toasts do app (toast(msg, tipo)) para inspecionar sucesso/erro.
function instalarEspiaToast(window) {
  window.eval(
    "window.__toasts = [];" +
      "var __toastOrig = typeof toast === 'function' ? toast : null;" +
      "toast = function(msg, tipo){ window.__toasts.push({ msg: String(msg), tipo: tipo || 'ok' });" +
      "  if (__toastOrig) { try { return __toastOrig(msg, tipo) } catch(e){} } };",
  )
}

function houveToastSucesso(window) {
  const toasts = window.__toasts || []
  // toast de sucesso e o que NAO tem tipo 'err'
  return toasts.some(function (t) {
    return t.tipo !== "err"
  })
}

// Monta o app na tela de PDV com um item no carrinho, pronto pra finalizar.
async function prepararPdvComItem(window) {
  window.eval("pagePDV()")
  await esperarAssentar(window)
  semearCache(window)
  semearProdutos(window)
  // Coloca um produto fisico (id 10, estoque 3) no carrinho do PDV.
  window.eval(
    "PDV_CART = [{ chave_id: 10, codigo: 'CH1', descricao: 'Chave Fisica'," +
      " quantidade: 1, unidade_medida: 'un', preco_unit: 10, estoque: 3 }];" +
      "if ($('pdvPayStatus')) $('pdvPayStatus').value = 'pago';",
  )
}

test("pdvFinish: se a movimentacao de estoque retorna {error}, NAO mostra sucesso e o erro sobe", async function () {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  const registro = ambiente.clienteFake.__registro
  instalarEspiaToast(window)
  await prepararPdvComItem(window)

  // Injeta erro no INSERT de movimentacoes (a saida de estoque).
  registro.__erros.insert.movimentacoes = { message: "falha simulada de banco" }

  await window.eval("pdvFinish()")
  await esperarAssentar(window)

  // O toast de "venda finalizada" NAO pode ter aparecido.
  const sucesso = houveToastSucesso(window)
  assert.strictEqual(
    sucesso,
    false,
    "mostrou sucesso mesmo com a movimentacao de estoque falhando (falso sucesso)",
  )
  // E deve ter havido pelo menos um toast de erro.
  const teveErro = (window.__toasts || []).some(function (t) {
    return t.tipo === "err"
  })
  assert.ok(teveErro, "nenhum toast de erro apareceu apesar da falha de banco")
})

test("txSalvar: se o insert de transacoes retorna {error}, NAO mostra sucesso", async function () {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  const registro = ambiente.clienteFake.__registro
  semearCache(window)
  // Abre o financeiro e o form de lancamento.
  window.eval("pageFinanceiro()")
  await esperarAssentar(window)
  semearCache(window)
  window.eval("txForm()")
  await esperarAssentar(window)
  instalarEspiaToast(window)

  // Preenche o form (valor + descricao sao obrigatorios).
  window.eval(
    "if ($('txfValor')) $('txfValor').value = '50';" +
      "if ($('txfDesc')) $('txfDesc').value = 'Teste falha';",
  )
  registro.__erros.insert.transacoes = { message: "falha simulada de banco" }

  await window.eval("txSalvar()")
  await esperarAssentar(window)

  assert.strictEqual(
    houveToastSucesso(window),
    false,
    "mostrou 'Lancamento registrado' mesmo com o insert falhando (falso sucesso)",
  )
})
