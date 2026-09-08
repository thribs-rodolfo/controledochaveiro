// ============================================================
// offline-fila.test.js — Estágio 2 do modo offline (enfileirar escritas)
//
// Prova que, quando OFFLINE:
//   1. Uma escrita de TABELA direta (insert/update) vai para a filaOffline e
//      NÃO chama o Supabase; o CACHE reflete (id temporário para novos) e a UI
//      mostra o registro.
//   2. Uma operação via RPC (ex.: salvar OS / finalizar venda) enfileira a
//      chamada e reflete a OS/venda no CACHE; NÃO chama o Supabase.
//   3. ONLINE o comportamento é o de sempre — as escritas vão ao Supabase
//      (sem regressão). Os demais testes da suíte cobrem o caminho online em
//      profundidade; aqui garantimos o ponto de intercepção (escrever/escreverRpc).
//
// Observação: no jsdom não há IndexedDB — o espelhoLocal cai no localStorage.
// O comportamento observável (enfileirar + refletir) é o mesmo.
// ============================================================

const { test } = require("node:test")
const assert = require("node:assert")
const {
  montarAmbiente,
  esperarAssentar,
  definirConexao,
  semearCache,
  semearProdutos,
} = require("./ambiente")

// Lê o tamanho atual da filaOffline (Promise no app -> valor aqui).
function tamanhoFila(window) {
  return window.eval("filaOffline.listar().then(function(l){ return l.length })")
}

// Lê a fila inteira, serializada, para inspeção nos testes.
function lerFila(window) {
  return window.eval(
    "filaOffline.listar().then(function(l){ return JSON.stringify(l) })",
  )
}

// Quantas escritas de um TIPO/tabela o Supabase fake registrou.
function contarEscritas(registro, tipo, tabela) {
  const lista = registro[tipo] && registro[tipo][tabela]
  return lista ? lista.length : 0
}

test("offline: insert de tabela vai para a fila, NÃO chama o Supabase e reflete no CACHE", async function () {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  const registro = ambiente.clienteFake.__registro
  semearCache(window)
  await window.eval("filaOffline.limpar()")

  // Cai a conexão e salva um cliente novo (insert direto, via clienteRapidoSalvar).
  definirConexao(window, false)
  await esperarAssentar(window)

  // Chama o ponto de intercepção diretamente para provar o contrato de escrever().
  window.__resultadoEscrever = await window.eval(
    "escrever('insert', 'clientes', { nome: 'Cliente Offline', telefone: '5535999' }, { executarOnline: function(){ throw new Error('offline nao deveria chamar a rede') } })",
  )
  await esperarAssentar(window)

  // NÃO chamou o Supabase (nenhum insert em 'clientes' registrado no fake).
  assert.strictEqual(
    contarEscritas(registro, "insert", "clientes"),
    0,
    "offline: o insert NÃO deveria ter ido ao Supabase",
  )

  // Foi para a fila.
  const tamanho = await tamanhoFila(window)
  assert.strictEqual(tamanho, 1, "a operação deveria estar na filaOffline")

  const fila = JSON.parse(await lerFila(window))
  assert.strictEqual(fila[0].tipo, "insert")
  assert.strictEqual(fila[0].tabela, "clientes")
  assert.strictEqual(
    fila[0].dados.nome,
    "Cliente Offline",
    "a fila deveria guardar o payload da escrita",
  )
  assert.ok(
    fila[0].idTemporario < 0,
    "insert novo deveria ter id temporário negativo para o Estágio 3 remapear",
  )

  // O CACHE reflete a nova linha com o id temporário e a marca de pendente.
  const clienteRefletido = window.eval(
    "JSON.stringify(CACHE.clientes.find(function(c){ return c.nome === 'Cliente Offline' }) || null)",
  )
  const c = JSON.parse(clienteRefletido)
  assert.ok(c, "o cliente deveria aparecer no CACHE para a UI mostrar")
  assert.ok(c.id < 0, "a linha refletida deveria usar o id temporário")
  assert.strictEqual(
    c._offlinePendente,
    true,
    "a linha deveria estar marcada como aguardando sincronizar",
  )

  // O retorno de escrever() imita o supabase-js: { data, error } com a linha.
  const retorno = JSON.parse(
    window.eval("JSON.stringify(window.__resultadoEscrever)"),
  )
  assert.strictEqual(retorno.error, null)
  assert.strictEqual(retorno.data.nome, "Cliente Offline")
})

test("offline: update de tabela enfileira e altera a linha no CACHE (sem tocar o Supabase)", async function () {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  const registro = ambiente.clienteFake.__registro
  semearCache(window)
  await window.eval("filaOffline.limpar()")

  // Semeia um cliente existente (id real 1, já vem do semearCache).
  definirConexao(window, false)
  await esperarAssentar(window)

  await window.eval(
    "escrever('update', 'clientes', { nome: 'Nome Alterado' }, { id: 1, executarOnline: function(){ throw new Error('offline nao deveria chamar a rede') } })",
  )
  await esperarAssentar(window)

  assert.strictEqual(
    contarEscritas(registro, "update", "clientes"),
    0,
    "offline: o update NÃO deveria ter ido ao Supabase",
  )

  const fila = JSON.parse(await lerFila(window))
  assert.strictEqual(fila.length, 1)
  assert.strictEqual(fila[0].tipo, "update")
  assert.deepStrictEqual(
    fila[0].condicao,
    { id: 1 },
    "o update deveria guardar a condição (id) para o replay",
  )

  const nomeAtual = window.eval(
    "(CACHE.clientes.find(function(c){ return c.id == 1 }) || {}).nome",
  )
  assert.strictEqual(
    nomeAtual,
    "Nome Alterado",
    "o CACHE deveria refletir o update otimista",
  )
})

test("offline: salvar OS via RPC enfileira a chamada e reflete a OS no CACHE (sem Supabase)", async function () {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  const registro = ambiente.clienteFake.__registro
  semearCache(window)
  await window.eval("filaOffline.limpar()")
  window.eval("CACHE.servicos = []")

  definirConexao(window, false)
  await esperarAssentar(window)

  // Exercita o ponto de intercepção de RPC diretamente (contrato de escreverRpc).
  await window.eval(
    "escreverRpc('os_salvar', { p_os_id: null, p_dados: { titulo: 'OS Offline' }, p_itens: [] }, { refletirOtimista: function(idTemporario){ CACHE.servicos.unshift({ id: idTemporario, titulo: 'OS Offline', status: 'orcamento', status_pagamento: 'pendente', total: 0, _offlinePendente: true }); return { data: idTemporario, error: null } } })",
  )
  await esperarAssentar(window)

  // NÃO chamou o Supabase: nenhuma RPC registrada no fake.
  assert.strictEqual(
    registro.rpc.length,
    0,
    "offline: a RPC os_salvar NÃO deveria ter ido ao Supabase",
  )

  // A chamada foi enfileirada com nome + args.
  const fila = JSON.parse(await lerFila(window))
  assert.strictEqual(fila.length, 1)
  assert.strictEqual(fila[0].tipo, "rpc")
  assert.strictEqual(fila[0].rpc, "os_salvar")
  assert.ok(fila[0].args, "a fila deveria guardar os args da RPC para o replay")
  assert.ok(
    fila[0].idTemporario < 0,
    "a RPC de criação deveria carregar um id temporário",
  )

  // A OS aparece no CACHE (com id temporário) para a lista mostrar.
  const os = JSON.parse(
    window.eval(
      "JSON.stringify(CACHE.servicos.find(function(s){ return s.titulo === 'OS Offline' }) || null)",
    ),
  )
  assert.ok(os, "a OS deveria aparecer no CACHE.servicos")
  assert.ok(os.id < 0, "a OS refletida deveria usar id temporário")
  assert.strictEqual(os._offlinePendente, true)
})

test("offline: fluxo real de finalizar venda (pdvFinish) enfileira a RPC e reflete a venda", async function () {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  const registro = ambiente.clienteFake.__registro
  semearCache(window)
  semearProdutos(window)
  await window.eval("filaOffline.limpar()")
  window.eval("CACHE.servicos = []")

  definirConexao(window, false)
  await esperarAssentar(window)

  // Monta um carrinho e chama pdvFinish() de verdade (o app monta o modal/DOM
  // mínimo que o fluxo usa; os campos ausentes caem nos defaults).
  window.eval(
    "PDV_CART = [{ chave_id: 10, descricao: 'Chave Fisica', quantidade: 1, preco_unit: 10, unidade_medida: 'un', tipo_produto: 'chave', estoque: 3 }]",
  )
  // Garante os elementos que pdvFinish consulta ($()) para não quebrar.
  window.eval(
    "document.body.insertAdjacentHTML('beforeend', '<input id=\"pdvCust\" value=\"\"><select id=\"pdvPay\"><option value=\"Dinheiro\" selected>Dinheiro</option></select><select id=\"pdvPayStatus\"><option value=\"pago\" selected>pago</option></select><input id=\"pdvVencimento\" value=\"\"><input id=\"pdvFinishBtn\"><input id=\"pdvDesc\" value=\"0\">')",
  )
  await window.eval("pdvFinish()")
  await esperarAssentar(window)
  await esperarAssentar(window)

  // NÃO chamou o Supabase (nem RPC, nem insert direto em servicos).
  assert.strictEqual(
    registro.rpc.length,
    0,
    "offline: pdvFinish NÃO deveria chamar a RPC no Supabase",
  )
  assert.strictEqual(
    contarEscritas(registro, "insert", "servicos"),
    0,
    "offline: pdvFinish NÃO deveria inserir servicos no Supabase",
  )

  // Enfileirou a chamada de venda.
  const fila = JSON.parse(await lerFila(window))
  assert.strictEqual(fila.length, 1)
  assert.strictEqual(fila[0].rpc, "pdv_finalizar_venda")

  // A venda aparece na lista (CACHE.servicos) com id temporário e marca pendente.
  const venda = JSON.parse(
    window.eval(
      "JSON.stringify(CACHE.servicos.find(function(s){ return s.is_pdv }) || null)",
    ),
  )
  assert.ok(venda, "a venda deveria aparecer no CACHE.servicos")
  assert.ok(venda.id < 0, "a venda offline deveria ter id temporário")
  assert.strictEqual(venda._offlinePendente, true)
})

test("online: escrever() delega ao Supabase (sem enfileirar) — contrato de não-regressão", async function () {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  const registro = ambiente.clienteFake.__registro
  semearCache(window)
  await window.eval("filaOffline.limpar()")

  // Online (padrão do jsdom): escrever() chama o executor real.
  definirConexao(window, true)
  await esperarAssentar(window)

  window.__chamouOnline = false
  await window.eval(
    "escrever('insert', 'clientes', { nome: 'Online' }, { executarOnline: function(){ window.__chamouOnline = true; return sb.from('clientes').insert({ nome: 'Online' }).select().single() } })",
  )
  await esperarAssentar(window)

  assert.strictEqual(
    window.__chamouOnline,
    true,
    "online: escrever() deveria ter chamado o executor real (Supabase)",
  )
  assert.strictEqual(
    contarEscritas(registro, "insert", "clientes"),
    1,
    "online: o insert deveria ter ido ao Supabase",
  )
  const tamanho = await tamanhoFila(window)
  assert.strictEqual(tamanho, 0, "online: NADA deveria ter sido enfileirado")
})

test("online: escreverRpc() delega ao Supabase (sem enfileirar)", async function () {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  const registro = ambiente.clienteFake.__registro
  await window.eval("filaOffline.limpar()")

  definirConexao(window, true)
  await esperarAssentar(window)

  await window.eval(
    "escreverRpc('os_salvar', { p_os_id: null }, { executarOnline: function(){ return sb.rpc('os_salvar', { p_os_id: null }) } })",
  )
  await esperarAssentar(window)

  assert.strictEqual(
    registro.rpc.length,
    1,
    "online: escreverRpc() deveria ter chamado a RPC no Supabase",
  )
  assert.strictEqual(registro.rpc[0].nome, "os_salvar")
  const tamanho = await tamanhoFila(window)
  assert.strictEqual(tamanho, 0, "online: NADA deveria ter sido enfileirado")
})

test("ids temporários são negativos, decrescentes e persistidos entre chamadas", async function () {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  window.eval("localStorage.removeItem('chaveiro_contador_id_temporario')")

  const primeiro = window.eval("gerarIdTemporario()")
  const segundo = window.eval("gerarIdTemporario()")
  const terceiro = window.eval("gerarIdTemporario()")

  assert.strictEqual(primeiro, -1)
  assert.strictEqual(segundo, -2)
  assert.strictEqual(terceiro, -3)
  assert.strictEqual(
    window.eval("ehIdTemporario(-2)"),
    true,
    "ehIdTemporario deveria reconhecer negativos",
  )
  assert.strictEqual(
    window.eval("ehIdTemporario(5)"),
    false,
    "ehIdTemporario NÃO deveria marcar ids reais (positivos)",
  )
})
