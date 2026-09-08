// ============================================================
// protecao-senha.test.js — contrato do NAVEGADOR da proteção de
// acesso por funcionário (ver ):
//   1. cadastro/edição passa pelo RPC funcionario_salvar (senha hasheada no
//      servidor) — o navegador NUNCA manda senha em texto puro pra uma coluna
//      legível nem faz insert/update cru na tabela funcionarios;
//   2. a listagem de funcionários (admin) lê pela VIEW funcionarios_visao (sem
//      a coluna senha), com fallback a colunas explícitas sem senha — nunca
//      um select("*") cru em funcionarios.
// (O hash/migração/coluna-escondida do lado do BANCO são provados aplicando
//  01+02 num Postgres real; aqui é o lado do app.)
// App REAL rodando no jsdom.
// ============================================================

const { test } = require("node:test")
const assert = require("node:assert")
const { montarAmbiente, semearCache, esperarAssentar } = require("./ambiente")

async function montarSemeado() {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  semearCache(window)
  return {
    window: window,
    doc: window.document,
    registro: ambiente.clienteFake.__registro,
    clienteFake: ambiente.clienteFake,
  }
}

// Espia clienteFake.from registrando cada tabela/view lida e cada .select(cols)
// solicitado, sem alterar o comportamento do dublê. Retorna a lista de leituras
// no formato { tabela, colunas }.
function espiarLeituras(clienteFake) {
  const leituras = []
  const fromOriginal = clienteFake.from.bind(clienteFake)
  clienteFake.from = function (tabela) {
    const consulta = fromOriginal(tabela)
    const selectOriginal = consulta.select
    consulta.select = function (colunas) {
      leituras.push({ tabela: tabela, colunas: colunas })
      return selectOriginal ? selectOriginal.apply(consulta, arguments) : consulta
    }
    return consulta
  }
  return leituras
}

function definirCampo(doc, id, valor) {
  const el = doc.getElementById(id)
  if (!el) throw new Error("Campo não encontrado: " + id)
  el.value = valor
  return el
}

// ------------------------------------------------------------
// CADASTRO/EDIÇÃO via RPC (senha nunca em texto puro numa coluna)
// ------------------------------------------------------------
test("funcSalvar novo cadastra pelo RPC funcionario_salvar e NÃO insere senha crua", async function () {
  const { window, doc, registro } = await montarSemeado()
  window.eval("pageFuncionarios()")
  await esperarAssentar(window)
  window.eval("funcForm()")
  await esperarAssentar(window)

  definirCampo(doc, "ffUser", "joana")
  definirCampo(doc, "ffNome", "Joana")
  definirCampo(doc, "ffSenha", "senhaSecreta1")
  definirCampo(doc, "ffPerfil", "operador")

  window.eval("funcSalvar(0)")
  await esperarAssentar(window)

  // Nenhuma escrita direta na tabela funcionarios (a senha em texto puro não vai
  // pra uma coluna legível): tudo via RPC security definer que hasheia no servidor.
  assert.strictEqual(
    (registro.insert["funcionarios"] || []).length,
    0,
    "não deve inserir na tabela funcionarios diretamente",
  )
  assert.strictEqual(
    (registro.update["funcionarios"] || []).length,
    0,
    "não deve dar update direto na tabela funcionarios",
  )
  const chamadas = registro.funcionarioSalvar || []
  assert.strictEqual(chamadas.length, 1, "deveria chamar funcionario_salvar 1x")
  assert.strictEqual(chamadas[0].p_usuario, "joana")
  assert.strictEqual(chamadas[0].p_senha, "senhaSecreta1")
})

test("funcSalvar edição sem senha nova envia p_senha null (servidor mantém a atual)", async function () {
  const { window, doc, registro } = await montarSemeado()
  window.eval("pageFuncionarios()")
  await esperarAssentar(window)
  window.eval(
    'funcForm({ id: 12, usuario: "bruno", nome: "Bruno", perfil: "supervisor", ativo: true, permissoes: null })',
  )
  await esperarAssentar(window)
  definirCampo(doc, "ffNome", "Bruno Costa")
  definirCampo(doc, "ffSenha", "") // não troca a senha
  window.eval("funcSalvar(12)")
  await esperarAssentar(window)

  const chamadas = registro.funcionarioSalvar || []
  assert.strictEqual(chamadas.length, 1)
  assert.strictEqual(chamadas[0].p_id, 12, "edição → p_id do funcionário")
  assert.strictEqual(chamadas[0].p_nome, "Bruno Costa")
  assert.strictEqual(
    chamadas[0].p_senha,
    null,
    "sem senha nova → p_senha null (não regrava a senha)",
  )
})

// ------------------------------------------------------------
// LISTAGEM sem a coluna senha
// ------------------------------------------------------------
test("carregarFuncionarios lê pela view funcionarios_visao (nunca select('*') cru em funcionarios)", async function () {
  const { window, clienteFake } = await montarSemeado()
  // pageFuncionarios cria o container #funcList e dispara carregarFuncionarios.
  // Instala o espião ANTES de chamar, pra capturar as leituras da listagem.
  const leituras = espiarLeituras(clienteFake)
  window.eval("pageFuncionarios()")
  await esperarAssentar(window)

  const daFuncionarios = leituras.filter(
    (l) => l.tabela === "funcionarios" || l.tabela === "funcionarios_visao",
  )
  assert.ok(daFuncionarios.length > 0, "deveria ler funcionários")

  // A primeira leitura é a VIEW sem senha.
  const primeira = daFuncionarios[0]
  assert.strictEqual(
    primeira.tabela,
    "funcionarios_visao",
    "a listagem deve usar a view funcionarios_visao (sem a coluna senha)",
  )

  // Se em algum momento cair no fallback pra tabela funcionarios, jamais pode
  // ser select("*") — tem de ser lista explícita de colunas SEM 'senha'.
  daFuncionarios
    .filter((l) => l.tabela === "funcionarios")
    .forEach((l) => {
      assert.notStrictEqual(
        l.colunas,
        "*",
        "fallback não pode fazer select('*') em funcionarios (traria a senha)",
      )
      assert.ok(
        typeof l.colunas === "string" && !/\bsenha\b/.test(l.colunas),
        "fallback não pode pedir a coluna senha",
      )
    })
})

// ------------------------------------------------------------
// BACKUP sem a coluna senha (regressão: "permission denied for table
// funcionarios" ao salvar o backup — o loop fazia select('*') em funcionarios,
// que o anon não pode ler por causa da senha protegida).
// ------------------------------------------------------------
test("_backupCarregarTudo lê funcionarios pela view (nunca select('*') cru)", async function () {
  const { window, clienteFake } = await montarSemeado()
  const leituras = espiarLeituras(clienteFake)
  const dump = await window.eval("_backupCarregarTudo()")

  const daFuncionarios = leituras.filter(
    (l) => l.tabela === "funcionarios" || l.tabela === "funcionarios_visao",
  )
  assert.ok(daFuncionarios.length > 0, "o backup deveria ler funcionários")
  assert.strictEqual(
    daFuncionarios[0].tabela,
    "funcionarios_visao",
    "o backup deve ler funcionarios_visao (sem a coluna senha)",
  )
  daFuncionarios
    .filter((l) => l.tabela === "funcionarios")
    .forEach((l) => {
      assert.notStrictEqual(
        l.colunas,
        "*",
        "backup não pode fazer select('*') em funcionarios",
      )
      assert.ok(
        typeof l.colunas === "string" && !/\bsenha\b/.test(l.colunas),
        "backup não pode pedir a coluna senha",
      )
    })
  ;(dump.funcionarios || []).forEach((f) => {
    assert.ok(!("senha" in f), "o backup não pode conter a coluna senha")
  })
})
