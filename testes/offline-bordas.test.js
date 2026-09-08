// ============================================================
// offline-bordas.test.js — Estágio 4 do modo offline
// (BORDAS E CONFLITOS — fecha o offline)
//
// Prova o tratamento dos casos de borda que faltavam para o modo offline ficar
// robusto na prática (operador único num aparelho → last-write-wins):
//
//   1. UPDATE de linha EXCLUÍDA no servidor durante o replay → a operação sai
//      da fila com aviso ("não aplicável") e a sincronização CONTINUA (não
//      trava a fila inteira por isso).
//   2. Erro de AUTENTICAÇÃO/PERMISSÃO no replay (401/403/PGRST301) → PARA a
//      drenagem, MANTÉM a fila inteira e avisa "não foi possível autenticar…".
//   3. Tentar criar/editar FUNCIONÁRIO offline → BLOQUEADO: nada é enfileirado,
//      NENHUMA senha em texto vai para a fila (segurança).
//   4. Venda/OS offline que deixa ESTOQUE NEGATIVO ao sincronizar → sincroniza
//      normalmente e AVISA quais produtos ficaram negativos (para repor).
//   5. Fila CORROMPIDA no localStorage (JSON inválido) → o app NÃO quebra:
//      segue com fila vazia (melhor esforço).
//
// jsdom não tem IndexedDB: espelhoLocal cai no localStorage — o comportamento
// observável (fila + drenagem + avisos) é o mesmo.
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

function tamanhoFila(window) {
  return window.eval("filaOffline.listar().then(function(l){ return l.length })")
}
function lerFila(window) {
  return window.eval(
    "filaOffline.listar().then(function(l){ return JSON.stringify(l) })",
  )
}
function textoToast(window) {
  const t = window.document.getElementById("toast")
  return t ? t.textContent : ""
}

// ------------------------------------------------------------
// 1) CONFLITO: UPDATE de linha excluída no servidor durante o replay.
//    → a operação sai da fila com aviso e a sincronização continua.
// ------------------------------------------------------------
test("conflito: UPDATE de linha excluída no servidor → sai da fila com aviso, sincronização continua", async function () {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  const registro = ambiente.clienteFake.__registro
  semearCache(window)
  await window.eval("filaOffline.limpar()")
  window.eval("localStorage.removeItem('chaveiro_mapa_id_real')")
  window.eval("CACHE.clientes = []; mapaIdReal = {}")

  definirConexao(window, false)
  await esperarAssentar(window)

  // OFFLINE: um UPDATE numa linha que existia (id 55) e um insert que DEVE subir
  // normalmente depois — para provar que a fila NÃO trava por causa do conflito.
  await window.eval(
    "escrever('update', 'clientes', { nome: 'Editado Offline' }, { id: 55, executarOnline: function(){ throw new Error('x') } })",
  )
  await window.eval(
    "escrever('insert', 'clientes', { nome: 'Novo Que Deve Subir' }, { executarOnline: function(){ throw new Error('x') } })",
  )
  await esperarAssentar(window)
  assert.strictEqual(await tamanhoFila(window), 2, "duas operações na fila")

  // O servidor: a linha 55 foi EXCLUÍDA enquanto estávamos offline → o UPDATE
  // afeta 0 linhas. O insert seguinte devolve id real 700.
  registro.__linhasAfetadas.clientes = 0
  registro.__idsInsert.clientes = [700]

  definirConexao(window, true)
  await esperarAssentar(window)
  await esperarAssentar(window)
  await esperarAssentar(window)

  // A fila esvaziou: o UPDATE conflitante foi DESCARTADO (não aplicável) e o
  // insert seguinte subiu — a fila NÃO travou no conflito.
  assert.strictEqual(
    await tamanhoFila(window),
    0,
    "a fila deveria esvaziar: conflito descartado e o resto sincronizado",
  )
  // O insert seguinte foi ao servidor (a sincronização CONTINUOU).
  const inserts = registro.insert.clientes || []
  assert.strictEqual(
    inserts.length,
    1,
    "o insert seguinte deveria ter sido enviado mesmo após o conflito",
  )
  // Avisou o usuário sobre a operação descartada.
  assert.ok(
    textoToast(window).toLowerCase().indexOf("excluíd") !== -1 ||
      textoToast(window).toLowerCase().indexOf("não puderam") !== -1,
    "deveria avisar que a alteração não pôde ser aplicada (registro excluído)",
  )
})

// ------------------------------------------------------------
// 2) AUTENTICAÇÃO: erro 401/403/PGRST301 no replay.
//    → para, mantém a fila inteira, avisa.
// ------------------------------------------------------------
test("autenticação: erro de permissão no replay → para, mantém a fila, avisa", async function () {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  const registro = ambiente.clienteFake.__registro
  semearCache(window)
  await window.eval("filaOffline.limpar()")
  window.eval("localStorage.removeItem('chaveiro_mapa_id_real')")
  window.eval("CACHE.clientes = []; mapaIdReal = {}")

  definirConexao(window, false)
  await esperarAssentar(window)

  // Dois inserts na fila. O servidor vai recusar o PRIMEIRO com erro de auth.
  await window.eval(
    "escrever('insert', 'clientes', { nome: 'A' }, { executarOnline: function(){ throw new Error('x') } })",
  )
  await window.eval(
    "escrever('insert', 'clientes', { nome: 'B' }, { executarOnline: function(){ throw new Error('x') } })",
  )
  await esperarAssentar(window)
  assert.strictEqual(await tamanhoFila(window), 2)

  // Erro típico de JWT/permissão do PostgREST no insert de clientes.
  registro.__erros.insert.clientes = {
    code: "PGRST301",
    message: "JWT expired",
  }

  definirConexao(window, true)
  await esperarAssentar(window)
  await esperarAssentar(window)

  // PAROU na primeira: a fila inteira permanece (nada se perde).
  assert.strictEqual(
    await tamanhoFila(window),
    2,
    "a fila inteira deveria permanecer após erro de autenticação",
  )
  // Avisou sobre a falha de autenticação.
  assert.ok(
    textoToast(window).toLowerCase().indexOf("autenticar") !== -1,
    "deveria avisar que não foi possível autenticar para sincronizar",
  )

  // Reconexão posterior, já com acesso liberado: a fila drena por completo.
  registro.__erros.insert.clientes = null
  registro.__idsInsert.clientes = [1, 2]
  definirConexao(window, true)
  await esperarAssentar(window)
  await esperarAssentar(window)
  assert.strictEqual(
    await tamanhoFila(window),
    0,
    "com o acesso restaurado, a fila deveria drenar",
  )
})

// ------------------------------------------------------------
// 3) SEGURANÇA: funcionário com senha offline é BLOQUEADO.
//    → nada é enfileirado; NENHUMA senha em texto entra na fila.
// ------------------------------------------------------------
test("segurança: criar/editar funcionário offline é bloqueado — nenhuma senha vai para a fila", async function () {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  const registro = ambiente.clienteFake.__registro
  const doc = window.document
  semearCache(window)
  await window.eval("filaOffline.limpar()")
  window.eval("CACHE.funcionarios = []")

  // Monta os campos do formulário de funcionário que funcSalvar lê.
  function campo(id, valor) {
    const el = doc.createElement("input")
    el.id = id
    el.value = valor
    doc.body.appendChild(el)
    return el
  }
  campo("ffUser", "novo.operador")
  campo("ffNome", "Novo Operador")
  campo("ffSenha", "senha-super-secreta-123")
  const perfil = doc.createElement("select")
  perfil.id = "ffPerfil"
  const opt = doc.createElement("option")
  opt.value = "operador"
  opt.selected = true
  perfil.appendChild(opt)
  doc.body.appendChild(perfil)
  const ativo = doc.createElement("select")
  ativo.id = "ffAtivo"
  const optA = doc.createElement("option")
  optA.value = "true"
  optA.selected = true
  ativo.appendChild(optA)
  doc.body.appendChild(ativo)
  campo("ffComissao", "0")
  const btn = doc.createElement("button")
  btn.id = "ffSaveBtn"
  doc.body.appendChild(btn)

  // OFFLINE: tenta cadastrar um funcionário NOVO com senha.
  definirConexao(window, false)
  await esperarAssentar(window)
  await window.eval("funcSalvar(0)")
  await esperarAssentar(window)

  // A fila continua VAZIA (nada enfileirado) e o RPC NÃO foi chamado offline.
  assert.strictEqual(
    await tamanhoFila(window),
    0,
    "criar funcionário offline não deveria enfileirar nada",
  )
  const chamadasFunc = registro.rpc.filter(function (c) {
    return c.nome === "funcionario_salvar"
  })
  assert.strictEqual(
    chamadasFunc.length,
    0,
    "o RPC funcionario_salvar não deveria ser chamado offline",
  )

  // GARANTIA DE SEGURANÇA: a senha em texto NÃO aparece em lugar nenhum da
  // persistência offline (fila nem localStorage).
  const filaSerializada = await lerFila(window)
  assert.strictEqual(
    filaSerializada.indexOf("senha-super-secreta-123"),
    -1,
    "a senha em texto NÃO pode estar na fila",
  )
  const dumpLocalStorage = window.eval(
    "JSON.stringify(Object.keys(localStorage).map(function(k){ return localStorage.getItem(k) }))",
  )
  assert.strictEqual(
    dumpLocalStorage.indexOf("senha-super-secreta-123"),
    -1,
    "a senha em texto NÃO pode estar em nenhum item do localStorage",
  )
  // Avisou que precisa de conexão.
  assert.ok(
    textoToast(window).toLowerCase().indexOf("conexão") !== -1,
    "deveria avisar que o cadastro de funcionário precisa de conexão",
  )
})

// ------------------------------------------------------------
// 4) ESTOQUE NEGATIVO no replay: aceita e avisa (não bloqueia).
// ------------------------------------------------------------
test("estoque negativo: sincroniza e avisa quais produtos ficaram negativos", async function () {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  const registro = ambiente.clienteFake.__registro
  semearCache(window)
  semearProdutos(window)
  await window.eval("filaOffline.limpar()")
  window.eval("localStorage.removeItem('chaveiro_mapa_id_real')")
  window.eval("mapaIdReal = {}")

  definirConexao(window, false)
  await esperarAssentar(window)

  // OFFLINE: uma venda por RPC (será reproduzida no servidor). O reflexo é só
  // visual neste estágio; o estoque negativo aparece na RECARGA pós-sync.
  await window.eval(
    "escreverRpc('pdv_finalizar_venda', { p_itens: [{ chave_id: 10, quantidade: 99 }] }, { refletirOtimista: function(idTemp){ return { data: idTemp, error: null } } })",
  )
  await esperarAssentar(window)
  assert.strictEqual(await tamanhoFila(window), 1)

  // O servidor aceita a RPC e, na recarga pós-sync, devolve o produto 10 com
  // estoque NEGATIVO (vendeu-se mais do que havia). carregarChaves preenche
  // CACHE.chaves a partir de registro.__linhas.chaves.
  registro.__rpcDisponivel = true
  registro.__rpcRetorno = { id: 321 }
  registro.__linhas.chaves = [
    {
      id: 10,
      codigo: "CH1",
      descricao: "Chave Fisica",
      preco_venda: 10,
      estoque: -96,
      tipo_produto: "chave",
    },
  ]

  definirConexao(window, true)
  await esperarAssentar(window)
  await esperarAssentar(window)
  await esperarAssentar(window)

  // A fila esvaziou (a sincronização NÃO foi bloqueada pelo estoque negativo).
  assert.strictEqual(
    await tamanhoFila(window),
    0,
    "a sincronização não deve ser bloqueada pelo estoque negativo",
  )
  // Avisou o estoque negativo, citando o produto.
  const aviso = textoToast(window).toLowerCase()
  assert.ok(
    aviso.indexOf("negativo") !== -1 && aviso.indexOf("chave fisica") !== -1,
    "deveria avisar o estoque negativo listando o produto (Chave Fisica)",
  )
})

// ------------------------------------------------------------
// 5) ROBUSTEZ: fila corrompida no localStorage → o app não quebra.
// ------------------------------------------------------------
test("robustez: fila corrompida no localStorage → segue com fila vazia, sem quebrar", async function () {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  const registro = ambiente.clienteFake.__registro
  semearCache(window)

  // Corrompe DELIBERADAMENTE a fila persistida (JSON inválido).
  window.eval(
    "localStorage.setItem('chaveiro_fila_escrita', '{isso não é json válido]]')",
  )

  // listar() não deve lançar — resolve fila vazia (melhor esforço).
  const tamanho = await tamanhoFila(window)
  assert.strictEqual(
    tamanho,
    0,
    "fila corrompida deveria ser lida como vazia (sem lançar)",
  )

  // Reconectar com fila corrompida também não deve quebrar: o evento "online"
  // dispara aoFicarOnline() -> drenarFilaOffline(). Deixamos essa drenagem
  // (disparada pelo evento) assentar por completo antes de inspecionar.
  definirConexao(window, true)
  await esperarAssentar(window)
  await esperarAssentar(window)

  // Uma drenagem EXPLÍCITA agora (já sem a anterior em curso) conclui limpa.
  const resultado = JSON.parse(
    await window.eval(
      "drenarFilaOffline().then(function(r){ return JSON.stringify(r) })",
    ),
  )
  await esperarAssentar(window)
  assert.strictEqual(
    resultado.estado,
    "concluido",
    "drenar com fila corrompida deveria concluir sem erro",
  )
  assert.strictEqual(
    registro.rpc.length,
    0,
    "fila corrompida (vazia) não deve enviar nada ao servidor",
  )
})
