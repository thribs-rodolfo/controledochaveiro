// ============================================================
// rpc-atomico.test.js — escrita atômica via RPC + fallback (Commit D)
//
// Os 3 fluxos do caminho do dinheiro (pdvFinish, osSalvar, osDarBaixa) agora
// tentam PRIMEIRO uma função RPC do banco (escrita atômica). Se a função não
// existe (cliente ainda não rodou o atualizar-banco.sql), caem no caminho antigo passo a passo.
//
// O Supabase dublado tem .rpc(): por padrão "função inexistente" (exercita o
// FALLBACK); com registro.__rpcDisponivel = true, "existe" (exercita o RPC).
// Verificamos, em cada modo:
//   RPC: sb.rpc(<nome>) foi chamado; e o app NÃO fez os inserts manuais.
//   FALLBACK: o app fez os inserts manuais (compatibilidade).
// ============================================================

const { test } = require("node:test")
const assert = require("node:assert")
const {
  montarAmbiente,
  semearCache,
  semearProdutos,
  esperarAssentar,
} = require("./ambiente")

function chamouRpc(registro, nome) {
  return (registro.rpc || []).some(function (c) {
    return c.nome === nome
  })
}
function contar(registro, tipo, tabela) {
  const lista = registro[tipo] && registro[tipo][tabela]
  return lista ? lista.length : 0
}

async function prepararPdvComItem(window) {
  window.eval("pagePDV()")
  await esperarAssentar(window)
  semearCache(window)
  semearProdutos(window)
  window.eval(
    "PDV_CART = [{ chave_id: 10, codigo: 'CH1', descricao: 'Chave Fisica'," +
      " quantidade: 1, unidade_medida: 'un', preco_unit: 10, estoque: 3 }];" +
      "if ($('pdvPayStatus')) $('pdvPayStatus').value = 'pago';",
  )
}

test("pdvFinish CAMINHO RPC: chama pdv_finalizar_venda e NÃO faz inserts manuais", async function () {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  const registro = ambiente.clienteFake.__registro
  registro.__rpcDisponivel = true // função existe no banco
  registro.__rpcRetorno = 12345 // id da OS que o RPC retorna
  await prepararPdvComItem(window)

  await window.eval("pdvFinish()")
  await esperarAssentar(window)

  assert.ok(
    chamouRpc(registro, "pdv_finalizar_venda"),
    "deveria ter chamado o RPC pdv_finalizar_venda",
  )
  // No caminho RPC, o app NÃO insere servicos/movimentacoes/transacoes um a um.
  assert.strictEqual(
    contar(registro, "insert", "servicos"),
    0,
    "não deve inserir servicos manualmente no caminho RPC",
  )
  assert.strictEqual(
    contar(registro, "insert", "movimentacoes"),
    0,
    "não deve inserir movimentacoes manualmente no caminho RPC",
  )
  assert.strictEqual(
    contar(registro, "insert", "transacoes"),
    0,
    "não deve inserir transacoes manualmente no caminho RPC",
  )
})

test("pdvFinish FALLBACK: RPC inexistente cai no caminho antigo (inserts manuais)", async function () {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  const registro = ambiente.clienteFake.__registro
  registro.__rpcDisponivel = false // função NÃO existe (banco sem o atualizar-banco.sql)
  await prepararPdvComItem(window)

  await window.eval("pdvFinish()")
  await esperarAssentar(window)

  assert.ok(
    chamouRpc(registro, "pdv_finalizar_venda"),
    "deveria ter TENTADO o RPC antes de cair no fallback",
  )
  // No fallback, o app grava tudo passo a passo (compatibilidade).
  assert.strictEqual(
    contar(registro, "insert", "servicos"),
    1,
    "fallback deve inserir a venda em servicos",
  )
  assert.strictEqual(
    contar(registro, "insert", "movimentacoes"),
    1,
    "fallback deve inserir a movimentação de saída",
  )
  assert.strictEqual(
    contar(registro, "insert", "transacoes"),
    1,
    "fallback deve lançar a transação",
  )
})

test("pdvFinish: se o RPC retorna erro REAL (não 'inexistente'), NÃO cai no fallback e o erro sobe", async function () {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  const registro = ambiente.clienteFake.__registro
  registro.__rpcErro = { code: "P0001", message: "erro real de constraint" }
  // instala espião de toast para detectar (não) sucesso
  window.eval(
    "window.__toasts = [];" +
      "toast = function(msg, tipo){ window.__toasts.push({ msg: String(msg), tipo: tipo || 'ok' }); };",
  )
  await prepararPdvComItem(window)

  await window.eval("pdvFinish()")
  await esperarAssentar(window)

  // Não deve ter caído no fallback (nenhum insert manual).
  assert.strictEqual(
    contar(registro, "insert", "servicos"),
    0,
    "erro real do RPC não pode virar fallback (evita gravar em dobro)",
  )
  // Não deve ter mostrado sucesso.
  const sucesso = (window.__toasts || []).some(function (t) {
    return t.tipo !== "err"
  })
  assert.strictEqual(sucesso, false, "erro real do RPC não pode virar sucesso")
})

test("osDarBaixa CAMINHO RPC: chama os_dar_baixa e NÃO faz update/insert manuais", async function () {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  const registro = ambiente.clienteFake.__registro
  registro.__rpcDisponivel = true
  semearCache(window)
  window.eval(
    "CACHE.servicos = [{ id: 777, titulo: 'OS Teste', status: 'pendente'," +
      " total: 100, valor_pago: 0, itens: [], forma_pagamento: 'Dinheiro' }];",
  )

  await window.eval("osDarBaixa(777)")
  await esperarAssentar(window)

  assert.ok(chamouRpc(registro, "os_dar_baixa"), "deveria ter chamado os_dar_baixa")
  assert.strictEqual(
    contar(registro, "update", "servicos"),
    0,
    "não deve atualizar servicos manualmente no caminho RPC",
  )
  assert.strictEqual(
    contar(registro, "insert", "transacoes"),
    0,
    "não deve lançar transação manualmente no caminho RPC",
  )
})

test("osSalvar CAMINHO RPC: chama os_salvar e NÃO insere servicos manualmente", async function () {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  const registro = ambiente.clienteFake.__registro
  registro.__rpcDisponivel = true
  registro.__rpcRetorno = 555

  window.eval("pageServicos()")
  await esperarAssentar(window)
  semearCache(window)
  semearProdutos(window)
  window.eval("osForm()")
  await esperarAssentar(window)
  window.eval(
    "if ($('osTitulo')) $('osTitulo').value = 'OS RPC';" +
      "if ($('osMaoObra')) $('osMaoObra').value = '50,00';" +
      "if ($('osStatus')) $('osStatus').value = 'concluido';",
  )

  await window.eval("osSalvar()")
  await esperarAssentar(window)

  assert.ok(chamouRpc(registro, "os_salvar"), "deveria ter chamado os_salvar")
  assert.strictEqual(
    contar(registro, "insert", "servicos"),
    0,
    "não deve inserir servicos manualmente no caminho RPC",
  )
})
