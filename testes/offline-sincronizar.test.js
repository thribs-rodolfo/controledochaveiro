// ============================================================
// offline-sincronizar.test.js — Estágio 3 do modo offline
// (SINCRONIZAR AO RECONECTAR)
//
// Prova o CORAÇÃO do offline: quando a conexão volta, a filaOffline é drenada
// e enviada ao Supabase na ORDEM (FIFO), com TRADUÇÃO dos ids temporários
// (pai->filho) para os ids reais devolvidos pelo servidor.
//
// Cenários cobertos:
//   1. Cliente novo (id temporário) + OS que referencia esse cliente
//      (cliente_id temporário) → reconecta → o cliente ganha id real e a OS é
//      reproduzida com cliente_id = id REAL. Fila esvazia, sem duplicar, CACHE
//      fica com ids reais e sem pendências.
//   2. Falha no meio: a 1ª sobe (sai da fila), a 2ª falha (fica na fila) e as
//      seguintes permanecem; nova reconexão retoma de onde parou.
//   3. Idempotência: reprocessar a fila não duplica o que já subiu.
//   4. Online normal segue sem regressão (não há drenagem quando a fila é vazia).
//
// jsdom não tem IndexedDB: espelhoLocal cai no localStorage — o comportamento
// observável (fila + remapeamento) é o mesmo.
// ============================================================

const { test } = require("node:test")
const assert = require("node:assert")
const {
  montarAmbiente,
  esperarAssentar,
  definirConexao,
  semearCache,
} = require("./ambiente")

// Lê a fila inteira serializada.
function lerFila(window) {
  return window.eval(
    "filaOffline.listar().then(function(l){ return JSON.stringify(l) })",
  )
}
function tamanhoFila(window) {
  return window.eval("filaOffline.listar().then(function(l){ return l.length })")
}
// Quantas escritas de um TIPO/tabela o Supabase fake registrou.
function contarEscritas(registro, tipo, tabela) {
  const lista = registro[tipo] && registro[tipo][tabela]
  return lista ? lista.length : 0
}

test("reconectar: cliente novo + OS filha → replay remapeia cliente_id temporário para o real", async function () {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  const registro = ambiente.clienteFake.__registro
  semearCache(window)
  await window.eval("filaOffline.limpar()")
  window.eval("localStorage.removeItem('chaveiro_mapa_id_real')")
  window.eval("CACHE.servicos = []; CACHE.clientes = []; mapaIdReal = {}")

  // OFFLINE: cria o cliente (insert direto) e a OS (RPC os_salvar) referenciando
  // o cliente pelo id temporário. Enfileiramos na ordem pai -> filho.
  definirConexao(window, false)
  await esperarAssentar(window)

  // Pai: cliente novo. escrever() gera o id temporário e reflete no CACHE.
  const idClienteTemp = await window.eval(
    "escrever('insert', 'clientes', { nome: 'Maria Offline', telefone: '35911112222' }, { executarOnline: function(){ throw new Error('offline nao chama rede') } }).then(function(r){ return r.data.id })",
  )
  assert.ok(idClienteTemp < 0, "o cliente deveria ter id temporário negativo")

  // Filho: a OS referencia o cliente pelo id temporário (cliente_id) tanto no
  // p_dados quanto no reflexo do CACHE.
  await window.eval(
    "escreverRpc('os_salvar', { p_os_id: null, p_dados: { titulo: 'OS da Maria', cliente_id: " +
      idClienteTemp +
      " }, p_itens: [] }, { refletirOtimista: function(idTemp){ CACHE.servicos.unshift({ id: idTemp, titulo: 'OS da Maria', cliente_id: " +
      idClienteTemp +
      ", _offlinePendente: true }); return { data: idTemp, error: null } } })",
  )
  await esperarAssentar(window)

  // A fila tem 2 operações, na ordem pai (insert clientes) -> filho (rpc os_salvar).
  let fila = JSON.parse(await lerFila(window))
  assert.strictEqual(fila.length, 2, "duas operações na fila")
  assert.strictEqual(fila[0].tipo, "insert")
  assert.strictEqual(fila[0].tabela, "clientes")
  assert.strictEqual(fila[1].tipo, "rpc")
  assert.strictEqual(fila[1].rpc, "os_salvar")
  assert.strictEqual(
    fila[1].args.p_dados.cliente_id,
    idClienteTemp,
    "a OS na fila ainda aponta para o cliente TEMPORÁRIO (será traduzido no replay)",
  )

  // Configura o servidor: o insert de cliente devolve id real 500; a RPC
  // os_salvar devolve o id real da OS (777).
  registro.__idsInsert.clientes = [500]
  registro.__rpcDisponivel = true
  registro.__rpcRetorno = { id: 777 }
  // Após sincronizar, o app recarrega os CACHEs do servidor. Semeamos o que o
  // servidor passa a devolver (a verdade do banco): o cliente com id real 500 e
  // a OS com id real 777 apontando para o cliente_id real 500.
  registro.__linhas.clientes = [
    { id: 500, nome: "Maria Offline", telefone: "35911112222" },
  ]
  registro.__linhas.servicos = [
    { id: 777, titulo: "OS da Maria", cliente_id: 500 },
  ]

  // RECONECTA: dispara aoFicarOnline() -> drena a fila.
  definirConexao(window, true)
  await esperarAssentar(window)
  await esperarAssentar(window)
  await esperarAssentar(window)

  // A fila esvaziou.
  assert.strictEqual(await tamanhoFila(window), 0, "a fila deveria ter esvaziado")

  // O insert de cliente foi ao Supabase UMA vez (sem duplicar).
  assert.strictEqual(
    contarEscritas(registro, "insert", "clientes"),
    1,
    "o cliente deveria ter sido inserido exatamente uma vez",
  )
  // A RPC os_salvar foi ao Supabase UMA vez.
  const chamadasOsSalvar = registro.rpc.filter(function (c) {
    return c.nome === "os_salvar"
  })
  assert.strictEqual(chamadasOsSalvar.length, 1, "os_salvar chamada uma vez")

  // O CORAÇÃO: a OS foi reproduzida com cliente_id = id REAL (500), não o temp.
  assert.strictEqual(
    chamadasOsSalvar[0].args.p_dados.cliente_id,
    500,
    "a OS deveria ter sido enviada com o cliente_id REAL remapeado",
  )

  // O CACHE ficou com ids reais e sem pendências.
  const cliente = JSON.parse(
    window.eval(
      "JSON.stringify(CACHE.clientes.find(function(c){ return c.nome === 'Maria Offline' }) || null)",
    ),
  )
  assert.ok(cliente, "o cliente deveria continuar no CACHE")
  assert.strictEqual(cliente.id, 500, "o CACHE deveria usar o id real do cliente")
  assert.ok(
    !cliente._offlinePendente,
    "a marca de pendente deveria ter saído do cliente",
  )

  const os = JSON.parse(
    window.eval(
      "JSON.stringify(CACHE.servicos.find(function(s){ return s.titulo === 'OS da Maria' }) || null)",
    ),
  )
  assert.ok(os, "a OS deveria continuar no CACHE")
  assert.strictEqual(
    os.cliente_id,
    500,
    "no CACHE, a OS deveria apontar para o cliente_id REAL",
  )

  // O mapa temp->real foi limpo ao zerar a fila.
  const mapaBruto = window.eval(
    "localStorage.getItem('chaveiro_mapa_id_real')",
  )
  assert.strictEqual(mapaBruto, null, "o mapa deveria ser limpo ao esvaziar a fila")
})

test("falha no meio: a 1ª sai da fila, a 2ª e seguintes permanecem; nova reconexão retoma", async function () {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  const registro = ambiente.clienteFake.__registro
  semearCache(window)
  await window.eval("filaOffline.limpar()")
  window.eval("localStorage.removeItem('chaveiro_mapa_id_real')")
  window.eval("CACHE.clientes = []; mapaIdReal = {}")

  definirConexao(window, false)
  await esperarAssentar(window)

  // Três inserts na fila, em tabelas distintas para controlar sucesso/falha por
  // tabela: A (clientes) deve subir; B e C (chaves) vão falhar na 1ª reconexão.
  await window.eval(
    "escrever('insert', 'clientes', { nome: 'A' }, { executarOnline: function(){ throw new Error('x') } })",
  )
  await window.eval(
    "escrever('insert', 'chaves', { descricao: 'B' }, { executarOnline: function(){ throw new Error('x') } })",
  )
  await window.eval(
    "escrever('insert', 'chaves', { descricao: 'C' }, { executarOnline: function(){ throw new Error('x') } })",
  )
  await esperarAssentar(window)
  assert.strictEqual(await tamanhoFila(window), 3)

  // O servidor aceita clientes (id 10) e ERRA chaves (falha de rede simulada).
  registro.__idsInsert.clientes = [10]
  registro.__erros.insert.chaves = { message: "Failed to fetch" }

  definirConexao(window, true)
  await esperarAssentar(window)
  await esperarAssentar(window)

  // A 1ª (A/clientes) subiu e saiu; a 2ª e a 3ª (chaves) permanecem — parou na
  // falha, SEM pular para a seguinte (FIFO estrito).
  let fila = JSON.parse(await lerFila(window))
  assert.strictEqual(fila.length, 2, "1ª saiu, restam 2 na fila")
  assert.strictEqual(fila[0].dados.descricao, "B", "a cabeça agora é a que falhou")
  assert.strictEqual(fila[1].dados.descricao, "C")

  // O mapa NÃO foi limpo (fila não zerou) — persistência para retomar.
  const mapaBruto = window.eval("localStorage.getItem('chaveiro_mapa_id_real')")
  assert.notStrictEqual(mapaBruto, null, "o mapa persiste enquanto a fila não zera")

  // Segunda reconexão: o servidor agora aceita chaves também (ids 20 e 30).
  registro.__erros.insert.chaves = null
  registro.__idsInsert.chaves = [20, 30]

  // Força novo "online" (o navegador já está online; disparamos o evento).
  definirConexao(window, true)
  await esperarAssentar(window)
  await esperarAssentar(window)

  assert.strictEqual(await tamanhoFila(window), 0, "a fila esvazia na retomada")

  // Idempotência: a operação que JÁ SUBIU (A) NÃO é reenviada na retomada —
  // saiu da fila, então continua com exatamente 1 insert em clientes.
  assert.strictEqual(
    contarEscritas(registro, "insert", "clientes"),
    1,
    "o cliente A (já sincronizado) NÃO deve ser reenviado na retomada",
  )
  // B teve 1 tentativa que FALHOU (o servidor rejeitou, nada persistiu) + 1 na
  // retomada; C só na retomada. Reenviar uma operação que FALHOU não é duplicar
  // (o insert anterior não gravou). Total: B(2) + C(1) = 3.
  assert.strictEqual(
    contarEscritas(registro, "insert", "chaves"),
    3,
    "B reenviado após a falha (1 falha + 1 sucesso) e C uma vez",
  )
})

test("idempotência: reprocessar a fila já drenada não reenvia nada", async function () {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  const registro = ambiente.clienteFake.__registro
  semearCache(window)
  await window.eval("filaOffline.limpar()")
  window.eval("CACHE.clientes = []; mapaIdReal = {}")

  definirConexao(window, false)
  await esperarAssentar(window)
  await window.eval(
    "escrever('insert', 'clientes', { nome: 'Unico' }, { executarOnline: function(){ throw new Error('x') } })",
  )
  await esperarAssentar(window)

  registro.__idsInsert.clientes = [42]

  definirConexao(window, true)
  await esperarAssentar(window)
  await esperarAssentar(window)
  assert.strictEqual(await tamanhoFila(window), 0)
  assert.strictEqual(contarEscritas(registro, "insert", "clientes"), 1)

  // Dispara online de novo com a fila já vazia: nada deve ser enviado.
  await window.eval("drenarFilaOffline()")
  await esperarAssentar(window)
  assert.strictEqual(
    contarEscritas(registro, "insert", "clientes"),
    1,
    "reprocessar a fila vazia não deve reenviar",
  )
})

test("pendência: filho referencia pai que não sincronizou → aborta e mantém a fila", async function () {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  const registro = ambiente.clienteFake.__registro
  semearCache(window)
  await window.eval("filaOffline.limpar()")
  window.eval("CACHE.servicos = []; mapaIdReal = {}")
  window.eval("localStorage.removeItem('chaveiro_mapa_id_real')")

  definirConexao(window, false)
  await esperarAssentar(window)

  // Enfileira SÓ a OS filha, apontando para um cliente temporário que NUNCA foi
  // enfileirado (pai faltando). No replay, a tradução não acha o real -> aborta.
  await window.eval(
    "escreverRpc('os_salvar', { p_os_id: null, p_dados: { titulo: 'OS Orfã', cliente_id: -999 }, p_itens: [] }, { refletirOtimista: function(idTemp){ return { data: idTemp, error: null } } })",
  )
  await esperarAssentar(window)

  registro.__rpcDisponivel = true

  definirConexao(window, true)
  await esperarAssentar(window)
  await esperarAssentar(window)

  // A RPC NÃO foi enviada (pai faltando) e a operação segue na fila.
  const chamadasOsSalvar = registro.rpc.filter(function (c) {
    return c.nome === "os_salvar"
  })
  assert.strictEqual(
    chamadasOsSalvar.length,
    0,
    "não deveria enviar a OS órfã (FK temporária sem real)",
  )
  assert.strictEqual(await tamanhoFila(window), 1, "a operação deveria seguir na fila")
})

test("online normal: sem fila, reconectar não faz nada (sem regressão)", async function () {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  const registro = ambiente.clienteFake.__registro
  semearCache(window)
  await window.eval("filaOffline.limpar()")

  definirConexao(window, true)
  await esperarAssentar(window)

  const resultado = JSON.parse(
    await window.eval(
      "drenarFilaOffline().then(function(r){ return JSON.stringify(r) })",
    ),
  )
  await esperarAssentar(window)
  assert.strictEqual(resultado.estado, "concluido")
  assert.strictEqual(
    registro.rpc.length,
    0,
    "nenhuma RPC deveria ter sido chamada com a fila vazia",
  )
})
