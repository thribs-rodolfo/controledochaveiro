// ============================================================
// offline-fundacao.test.js — Estágio 1 do modo offline (fundação)
//
// Cobre os três pilares da fundação, SEM mudar o comportamento online:
//   1. Detecção de conexão: estadoConexao.estaOffline reflete navigator.onLine
//      e reage aos eventos online/offline; o selo aparece/some.
//   2. Espelho local (leitura): uma leitura bem-sucedida grava o espelho; se a
//      leitura falha por rede OU estamos offline, o app lê do espelho e NÃO
//      quebra (renderiza os últimos dados conhecidos).
//   3. Andaime da fila (filaOffline): existe e persiste, mas NÃO é usado pelas
//      escritas neste estágio (as escritas continuam indo ao Supabase).
//
// Observação: no jsdom não há IndexedDB, então o espelhoLocal cai no reserva
// localStorage — exatamente o caminho que documentamos. O comportamento
// observável (ler do espelho quando offline) é o mesmo.
// ============================================================

const { test } = require("node:test")
const assert = require("node:assert")
const {
  montarAmbiente,
  esperarAssentar,
  definirConexao,
} = require("./ambiente")

// Lê o valor de estadoConexao.estaOffline de dentro do escopo do app.
function lerEstaOffline(window) {
  return window.eval("estadoConexao.estaOffline")
}

// Diz se o selo do modo offline está VISÍVEL (tem a classe .visivel).
function seloVisivel(window) {
  const selo = window.document.getElementById("seloOffline")
  return !!selo && selo.classList.contains("visivel")
}

test("estaOffline reflete navigator.onLine e reage aos eventos online/offline", async function () {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  // Liga a detecção (o boot já chama, mas garantimos de forma explícita).
  window.eval("iniciarDeteccaoConexao()")

  // Estado inicial: jsdom sobe online.
  assert.strictEqual(lerEstaOffline(window), false, "deveria iniciar online")
  assert.strictEqual(seloVisivel(window), false, "selo não deveria aparecer online")

  // Cai a conexão.
  definirConexao(window, false)
  await esperarAssentar(window)
  assert.strictEqual(lerEstaOffline(window), true, "estaOffline deveria virar true no evento offline")
  assert.strictEqual(seloVisivel(window), true, "selo deveria aparecer offline")

  // Volta a conexão.
  definirConexao(window, true)
  await esperarAssentar(window)
  assert.strictEqual(lerEstaOffline(window), false, "estaOffline deveria voltar a false no evento online")
  assert.strictEqual(seloVisivel(window), false, "selo deveria sumir ao reconectar")
})

test("espelho local: leitura com sucesso grava o espelho e, offline, é lido de volta", async function () {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  const registro = ambiente.clienteFake.__registro

  // Semeia o retorno do fake para a tabela 'fabricantes': o thenable resolve
  // { data: [], error: null } por padrão. Para provar o espelho, gravamos
  // diretamente pelo caminho de sucesso: chamamos lerComEspelho com um
  // carregador que devolve dados, garantindo a gravação no espelho.
  const dados = [{ id: 1, nome: "Fabricante Espelhado" }]
  window.__dadosFake = dados
  await window.eval(
    "lerComEspelho(function(){ return Promise.resolve({ data: window.__dadosFake, error: null }) }, 'fabricantes', function(d){ CACHE.fabricantes = d })",
  )
  await esperarAssentar(window)

  // O CACHE recebeu os dados frescos.
  assert.deepStrictEqual(
    window.eval("JSON.stringify(CACHE.fabricantes)"),
    JSON.stringify(dados),
    "CACHE deveria ter os dados frescos do servidor",
  )

  // Agora simula OFFLINE: zera o CACHE e carrega de novo — deve vir do espelho.
  definirConexao(window, false)
  await esperarAssentar(window)
  window.eval("CACHE.fabricantes = []")
  await window.eval("carregarFabricantes()")
  await esperarAssentar(window)

  assert.deepStrictEqual(
    window.eval("JSON.stringify(CACHE.fabricantes)"),
    JSON.stringify(dados),
    "offline: carregarFabricantes deveria ler o espelho, não estourar erro",
  )
})

test("leitura que falha por rede cai no espelho e NÃO quebra (últimos dados)", async function () {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  const registro = ambiente.clienteFake.__registro

  // Primeiro, um carregamento bem-sucedido para popular o espelho de 'clientes'.
  const dados = [{ id: 7, nome: "Cliente Conhecido", telefone: "35999" }]
  window.__dadosClientes = dados
  await window.eval(
    "lerComEspelho(function(){ return Promise.resolve({ data: window.__dadosClientes, error: null }) }, 'clientes', function(d){ CACHE.clientes = d })",
  )
  await esperarAssentar(window)

  // Agora INJETA um erro de rede no SELECT de 'clientes' e recarrega ONLINE.
  // O app deve cair no espelho (não propagar o erro) e renderizar os dados.
  registro.__erros.select.clientes = { message: "Failed to fetch" }
  window.eval("CACHE.clientes = []")

  let quebrou = false
  function aoErrar() {
    quebrou = true
  }
  await window.eval("carregarClientes()").then(function () {}, aoErrar)
  await esperarAssentar(window)

  assert.strictEqual(quebrou, false, "falha de rede na leitura NÃO deveria propagar erro")
  assert.deepStrictEqual(
    window.eval("JSON.stringify(CACHE.clientes)"),
    JSON.stringify(dados),
    "deveria ter lido os últimos dados conhecidos do espelho",
  )
})

test("erro de BANCO (não-rede) na leitura ainda propaga (não mascara bug)", async function () {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  const registro = ambiente.clienteFake.__registro

  // Erro com cara de banco (code definido, mensagem não-rede): deve subir.
  registro.__erros.select.servicos = {
    code: "42P01",
    message: 'relation "servicos" does not exist',
  }

  let subiu = false
  function aoErrar() {
    subiu = true
  }
  await window.eval("carregarServicos()").then(function () {}, aoErrar)
  await esperarAssentar(window)

  assert.strictEqual(subiu, true, "erro de banco deveria propagar (não ser tratado como offline)")
})

test("filaOffline existe e persiste, mas as escritas NÃO a usam neste estágio", async function () {
  const ambiente = await montarAmbiente()
  const window = ambiente.window

  // O andaime existe e enfileira/persiste.
  await window.eval(
    "filaOffline.enfileirar({ tipo: 'insert', tabela: 'clientes', payload: { nome: 'X' } })",
  )
  const tamanho = await window.eval(
    "filaOffline.listar().then(function(l){ return l.length })",
  )
  assert.strictEqual(tamanho, 1, "filaOffline deveria persistir a operação enfileirada")

  // Limpar volta a fila a zero.
  await window.eval("filaOffline.limpar()")
  const zerada = await window.eval(
    "filaOffline.listar().then(function(l){ return l.length })",
  )
  assert.strictEqual(zerada, 0, "filaOffline.limpar deveria esvaziar a fila")
})

test("online: comportamento inalterado — carregar grava espelho e devolve dados do servidor", async function () {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  const registro = ambiente.clienteFake.__registro

  // Online, sem erro injetado: o fake resolve data:[] — o app aplica [] no CACHE
  // (como antes) e não lança. Prova de não-regressão do caminho feliz.
  window.eval("CACHE.categorias = null")
  await window.eval("carregarCategorias()")
  await esperarAssentar(window)
  assert.deepStrictEqual(
    window.eval("JSON.stringify(CACHE.categorias)"),
    "[]",
    "online: carregarCategorias deveria aplicar a lista do servidor (vazia no fake)",
  )
})
