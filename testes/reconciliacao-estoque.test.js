// ============================================================
// reconciliacao-estoque.test.js — rede de segurança de ESTOQUE (Commit E)
//
// reconciliarEstoque() lista as OS CONCLUÍDAS que têm peça FÍSICA mas NÃO têm a
// movimentação de SAÍDA correspondente (casada pelo servico_id da movimentação).
// É a paralela da reconciliação financeira, mas para o estoque (que ficaria
// inflado se a saída foi engolida por uma falha de conexão).
//
// Também exercita registrarMovimentacaoFaltante(osId): insere a(s) saída(s) que
// faltaram para aquela OS.
// ============================================================

const { test } = require("node:test")
const assert = require("node:assert")
const { montarAmbiente, semearCache, esperarAssentar } = require("./ambiente")

// Semeia produtos: id 10 físico (chave), id 20 serviço (não movimenta estoque).
function semearProdutosRecon(window) {
  window.eval(
    "CACHE.chaves = [" +
      "  { id: 10, descricao: 'Chave Fisica', tipo_produto: 'chave', estoque: 5 }," +
      "  { id: 20, descricao: 'Servico', tipo_produto: 'servico', estoque: 0 }" +
      "];",
  )
}

test("reconciliarEstoque detecta OS concluída com peça física SEM saída", async function () {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  semearProdutosRecon(window)
  // OS 100: concluída, peça física, SEM saída → deve aparecer.
  // OS 101: concluída, peça física, COM saída → ok, não aparece.
  // OS 102: concluída, só serviço → não movimenta estoque, não aparece.
  // OS 103: pendente (não concluída) → não aparece.
  window.eval(
    "CACHE.servicos = [" +
      "  { id: 100, titulo: 'Sem baixa', status: 'concluido', itens: [{ chave_id: 10, descricao: 'Chave Fisica', quantidade: 2 }] }," +
      "  { id: 101, titulo: 'Com baixa', status: 'concluido', itens: [{ chave_id: 10, descricao: 'Chave Fisica', quantidade: 1 }] }," +
      "  { id: 102, titulo: 'So servico', status: 'concluido', itens: [{ chave_id: 20, descricao: 'Servico', quantidade: 1 }] }," +
      "  { id: 103, titulo: 'Pendente', status: 'pendente', itens: [{ chave_id: 10, descricao: 'Chave Fisica', quantidade: 1 }] }" +
      "];" +
      "CACHE.movimentacoes = [ { id: 1, servico_id: 101, tipo: 'saida', chave_id: 10, quantidade: 1 } ];",
  )

  const lista = JSON.parse(
    window.eval(
      "JSON.stringify(reconciliarEstoque().map(function(o){return {id:o.id,itens:o.itens};}))",
    ),
  )
  const ids = lista
    .map(function (x) {
      return x.id
    })
    .sort(function (a, b) {
      return a - b
    })
  assert.deepStrictEqual(
    ids,
    [100],
    "deve apontar exatamente a OS 100 (concluída, física, sem saída)",
  )
  assert.strictEqual(lista[0].itens.length, 1, "um item físico faltante")
  assert.strictEqual(lista[0].itens[0].quantidade, 2, "quantidade 2 a baixar")
})

test("reconciliarEstoque ignora OS já com saída, OS só de serviço e OS não concluída", async function () {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  semearProdutosRecon(window)
  window.eval(
    "CACHE.servicos = [" +
      "  { id: 200, titulo: 'Com baixa', status: 'concluido', itens: [{ chave_id: 10, descricao: 'Chave', quantidade: 1 }] }," +
      "  { id: 201, titulo: 'So servico', status: 'concluido', itens: [{ chave_id: 20, descricao: 'Servico', quantidade: 1 }] }" +
      "];" +
      "CACHE.movimentacoes = [ { id: 9, servico_id: 200, tipo: 'saida', chave_id: 10, quantidade: 1 } ];",
  )
  const qtd = window.eval("reconciliarEstoque().length")
  assert.strictEqual(qtd, 0, "nenhuma OS faltante nesse cenário")
})

test("bannerReconciliacaoEstoque mostra aviso quando há faltantes e vazio quando não há", async function () {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  semearCache(window) // define SESSAO admin
  semearProdutosRecon(window)
  // sem faltantes
  window.eval(
    "CACHE.servicos = []; CACHE.movimentacoes = [];",
  )
  assert.strictEqual(
    window.eval("bannerReconciliacaoEstoque()"),
    "",
    "sem faltantes o banner é vazio",
  )
  // com faltante
  window.eval(
    "CACHE.servicos = [{ id: 300, titulo: 'X', status: 'concluido', itens: [{ chave_id: 10, descricao: 'Chave', quantidade: 1 }] }];",
  )
  const html = window.eval("bannerReconciliacaoEstoque()")
  assert.ok(/sem baixa de estoque/i.test(html), "banner cita o problema")
  assert.ok(
    /registrarMovimentacaoFaltante\(300\)/.test(html),
    "banner tem o botão de corrigir a OS 300 (admin)",
  )
})

test("registrarMovimentacaoFaltante insere a saída que faltou para a OS", async function () {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  const registro = ambiente.clienteFake.__registro
  semearCache(window) // SESSAO admin
  semearProdutosRecon(window)
  window.eval(
    "CACHE.servicos = [{ id: 400, titulo: 'Corrigir', status: 'concluido'," +
      " itens: [{ chave_id: 10, descricao: 'Chave', quantidade: 3 }] }];" +
      "CACHE.movimentacoes = [];",
  )

  await window.eval("registrarMovimentacaoFaltante(400)")
  await esperarAssentar(window)

  const movs = (registro.insert.movimentacoes || []).filter(function (m) {
    return m && m.servico_id === 400
  })
  assert.strictEqual(movs.length, 1, "insere uma saída para a OS 400")
  assert.strictEqual(movs[0].tipo, "saida")
  assert.strictEqual(movs[0].quantidade, 3, "baixa 3 unidades (o que faltou)")
  assert.strictEqual(movs[0].chave_id, 10)
})
