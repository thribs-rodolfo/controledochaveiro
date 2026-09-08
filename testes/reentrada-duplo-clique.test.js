// ============================================================
// reentrada-duplo-clique.test.js — travas de reentrada (Commit A)
//
// Simula o DUPLO-CLIQUE: chama a ação duas vezes SEM aguardar a primeira
// terminar (que é o que acontece quando o usuário clica duas vezes rápido
// antes de o await do banco resolver). Sem a trava de reentrada, o segundo
// disparo lançaria/estornaria de novo — dinheiro/estoque em dobro.
//
// Ações cobertas: osDarBaixa (recebimento), osExcluir (estorno de estoque),
// txExcluir (delete de lançamento).
//
// O Supabase é dublado e REGISTRA as escritas em clienteFake.__registro.
// Contamos quantas vezes cada tabela foi escrita: com a trava, é UMA vez.
// ============================================================

const { test } = require("node:test")
const assert = require("node:assert")
const { montarAmbiente, semearCache, esperarAssentar } = require("./ambiente")

// Conta quantos payloads foram registrados para (tipo, tabela).
function contarEscritas(registro, tipo, tabela) {
  const lista = registro[tipo] && registro[tipo][tabela]
  return lista ? lista.length : 0
}

// Semeia uma OS pendente PAGÁVEL (saldo a receber) no CACHE, para a baixa.
function semearOsPendente(window) {
  window.eval(
    "CACHE.servicos = [{ id: 777, titulo: 'OS Teste', status: 'pendente'," +
      " total: 100, valor_pago: 0, itens: [], forma_pagamento: 'Dinheiro' }];",
  )
}

test("osDarBaixa: duplo-clique NÃO lança o recebimento duas vezes", async function () {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  const registro = ambiente.clienteFake.__registro
  semearCache(window)
  semearOsPendente(window)

  // Dois disparos "ao mesmo tempo": não aguardamos o primeiro antes do segundo.
  const p1 = window.eval("osDarBaixa(777)")
  const p2 = window.eval("osDarBaixa(777)")
  await Promise.all([p1, p2])
  await esperarAssentar(window)

  // Só UMA transação de recebimento deve ter sido inserida.
  assert.strictEqual(
    contarEscritas(registro, "insert", "transacoes"),
    1,
    "o recebimento foi lançado mais de uma vez (trava de reentrada falhou)",
  )
})

test("osExcluir: duplo-clique NÃO estorna o estoque duas vezes", async function () {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  const registro = ambiente.clienteFake.__registro
  semearCache(window)
  // OS concluída com uma saída de estoque a estornar (o fake devolve [] no
  // select de movimentacoes, então o estorno em si não insere movimentacao —
  // mas o delete de servicos SÓ pode ocorrer uma vez).
  semearOsPendente(window)

  const p1 = window.eval("osExcluir(777)")
  const p2 = window.eval("osExcluir(777)")
  await Promise.all([p1, p2])
  await esperarAssentar(window)

  // O delete de 'servicos' só pode ter sido chamado UMA vez.
  assert.strictEqual(
    contarEscritas(registro, "delete", "servicos"),
    1,
    "a OS foi excluída mais de uma vez (trava de reentrada falhou)",
  )
})

test("txExcluir: duplo-clique NÃO deleta o lançamento duas vezes", async function () {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  const registro = ambiente.clienteFake.__registro
  semearCache(window)

  const p1 = window.eval("txExcluir(555)")
  const p2 = window.eval("txExcluir(555)")
  await Promise.all([p1, p2])
  await esperarAssentar(window)

  assert.strictEqual(
    contarEscritas(registro, "delete", "transacoes"),
    1,
    "o lançamento foi excluído mais de uma vez (trava de reentrada falhou)",
  )
})
