// ============================================================
// login-config-nav.test.js — login/logout, aviso de versão do banco,
// navegação lateral, normalização do código de ativação, saída do PDV,
// fotos da OS e logo da empresa. App REAL no jsdom.
// ============================================================

const { test } = require("node:test")
const assert = require("node:assert")
const {
  montarAmbiente,
  semearCache,
  semearProdutos,
  esperarAssentar,
} = require("./ambiente")

async function preparar() {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  semearCache(window)
  semearProdutos(window)
  return {
    window: window,
    doc: window.document,
    registro: ambiente.clienteFake.__registro,
  }
}

function ultimo(lista) {
  return lista && lista.length ? lista[lista.length - 1] : null
}

// ------------------------------------------------------------
// LOGIN
// ------------------------------------------------------------
test("doLogin sem usuário/senha mostra erro e não entra no app", async function () {
  const { window, doc } = await preparar()
  doc.getElementById("loginUser").value = ""
  doc.getElementById("loginPass").value = ""
  await window.eval("doLogin()")
  await esperarAssentar(window)
  const err = doc.getElementById("loginError")
  assert.match(err.textContent, /Preencha/, "deveria pedir usuário e senha")
  assert.ok(err.classList.contains("show"), "erro deveria estar visível")
})

test("doLogin com senha errada (usuário não encontrado) mostra 'incorretos'", async function () {
  const { window, doc } = await preparar()
  doc.getElementById("loginUser").value = "fulano"
  doc.getElementById("loginPass").value = "senhaerrada"
  // sem __loginUser semeado, a consulta devolve null -> credenciais inválidas
  await window.eval("doLogin()")
  await esperarAssentar(window)
  const err = doc.getElementById("loginError")
  assert.match(err.textContent, /incorretos/, "deveria acusar credenciais inválidas")
})

test("doLogin com credenciais válidas entra no app e cria a SESSAO", async function () {
  const { window, doc, registro } = await preparar()
  // Semeia o usuário que a consulta de funcionarios vai devolver.
  registro.__loginUser = {
    id: 1,
    usuario: "admin",
    senha: "1234",
    nome: "Admin Teste",
    perfil: "admin",
    permissoes: null,
    ativo: true,
  }
  doc.getElementById("loginUser").value = "admin"
  doc.getElementById("loginPass").value = "1234"
  await window.eval("doLogin()")
  await esperarAssentar(window)
  await esperarAssentar(window)

  assert.ok(
    doc.getElementById("app").classList.contains("show"),
    "o app deveria ficar visível após login",
  )
  const nome = window.eval("SESSAO && SESSAO.nome")
  assert.strictEqual(nome, "Admin Teste", "SESSAO deveria refletir o usuário logado")
  const salvo = window.eval("localStorage.getItem('chaveiro_sessao')")
  assert.match(salvo || "", /Admin Teste/, "sessão persistida no localStorage")
})

test("doLogin valida no SERVIDOR via RPC funcionario_login (não vaza a senha)", async function () {
  const { window, doc, registro } = await preparar()
  registro.__loginUser = {
    id: 7,
    usuario: "op",
    senha: "segredo",
    nome: "Operador",
    perfil: "operador",
    permissoes: null,
    ativo: true,
  }
  doc.getElementById("loginUser").value = "op"
  doc.getElementById("loginPass").value = "segredo"
  await window.eval("doLogin()")
  await esperarAssentar(window)
  await esperarAssentar(window)

  const chamou = registro.rpc.find((c) => c.nome === "funcionario_login")
  assert.ok(chamou, "o login deveria chamar a RPC funcionario_login")
  assert.strictEqual(chamou.args.p_usuario, "op")
  assert.strictEqual(chamou.args.p_senha, "segredo")
  assert.strictEqual(
    window.eval("SESSAO && SESSAO.perfil"),
    "operador",
    "SESSAO deveria vir da RPC",
  )
})

test("doLogin cai no caminho antigo se a RPC não existe (banco desatualizado)", async function () {
  const { window, doc, registro } = await preparar()
  // Banco sem a função (cliente não rodou o atualizar-banco.sql): não pode trancar o usuário.
  registro.__loginRpcAusente = true
  registro.__loginUser = {
    id: 3,
    usuario: "admin",
    senha: "1234",
    nome: "Admin Legado",
    perfil: "admin",
    permissoes: null,
    ativo: true,
  }
  doc.getElementById("loginUser").value = "admin"
  doc.getElementById("loginPass").value = "1234"
  await window.eval("doLogin()")
  await esperarAssentar(window)
  await esperarAssentar(window)

  assert.ok(
    doc.getElementById("app").classList.contains("show"),
    "mesmo sem a RPC, o login antigo deveria funcionar",
  )
  assert.strictEqual(window.eval("SESSAO && SESSAO.nome"), "Admin Legado")
})

test("doLogout limpa a SESSAO e volta para a tela de login", async function () {
  const { window, doc } = await preparar()
  window.eval("SESSAO = { id: 1, nome: 'X', perfil: 'admin' }")
  window.eval("localStorage.setItem('chaveiro_sessao', '{}')")
  window.eval("doLogout()")
  assert.strictEqual(window.eval("SESSAO"), null, "SESSAO zerada")
  assert.strictEqual(
    window.eval("localStorage.getItem('chaveiro_sessao')"),
    null,
    "sessão removida do localStorage",
  )
  assert.strictEqual(
    doc.getElementById("loginScreen").style.display,
    "flex",
    "tela de login reaparece",
  )
})

// ------------------------------------------------------------
// VERSÃO DO BANCO
// ------------------------------------------------------------
test("mostrarAvisoAtualizacao insere a faixa de aviso uma única vez", async function () {
  const { window, doc } = await preparar()
  window.eval("mostrarAvisoAtualizacao(2, 6)")
  const aviso = doc.getElementById("avisoSchema")
  assert.ok(aviso, "faixa de aviso deveria existir")
  assert.match(aviso.textContent, /versão 2/, "mostra a versão do banco")
  assert.match(aviso.textContent, /versão 6/, "mostra a versão exigida")
  // Chamar de novo não duplica.
  window.eval("mostrarAvisoAtualizacao(2, 6)")
  assert.strictEqual(
    doc.querySelectorAll("#avisoSchema").length,
    1,
    "aviso não deveria duplicar",
  )
})

// ------------------------------------------------------------
// NAVEGAÇÃO LATERAL (toggle da sidebar)
// ------------------------------------------------------------
test("toggleNav abre/fecha a sidebar e force=false sempre fecha", async function () {
  const { window, doc } = await preparar()
  const sidebar = doc.getElementById("sidebar")
  sidebar.classList.remove("open")
  window.eval("toggleNav()")
  assert.ok(sidebar.classList.contains("open"), "toggle abre quando estava fechada")
  window.eval("toggleNav()")
  assert.ok(!sidebar.classList.contains("open"), "toggle fecha quando estava aberta")
  sidebar.classList.add("open")
  window.eval("toggleNav(false)")
  assert.ok(!sidebar.classList.contains("open"), "force=false sempre fecha")
})

// ------------------------------------------------------------
// ATIVAÇÃO: normalização do código
// ------------------------------------------------------------
test("mkNormalizar remove hífens, espaços e o prefixo MK, em maiúsculas", async function () {
  const { window } = await preparar()
  assert.strictEqual(window.eval("mkNormalizar('mk-abcd-1234')"), "ABCD1234")
  assert.strictEqual(window.eval("mkNormalizar('AB CD 12')"), "ABCD12")
  assert.strictEqual(window.eval("mkNormalizar('')"), "")
  assert.strictEqual(window.eval("mkNormalizar(null)"), "")
})

// ------------------------------------------------------------
// PDV: sair descartando carrinho
// ------------------------------------------------------------
test("pdvSair esvazia o carrinho e, para admin, cai no Painel (primeira página permitida)", async function () {
  const { window, doc } = await preparar()
  await window.eval("pagePDV()")
  await esperarAssentar(window)
  window.eval("PDV_CART = [{ chave_id: 10, quantidade: 1, preco_unit: 10, estoque: 3 }]")
  // confirm dublado devolve true -> sai mesmo com itens
  window.eval("pdvSair()")
  await esperarAssentar(window)
  assert.strictEqual(window.eval("PDV_CART.length"), 0, "carrinho zerado ao sair")
  // admin tem o Painel como primeira página permitida → o cabeçalho "Painel" aparece
  assert.ok(doc.getElementById("main").innerHTML.length > 0)
  assert.match(
    doc.getElementById("main").innerHTML,
    /Painel/,
    "admin deveria cair no Painel após descartar a venda",
  )
})

// ------------------------------------------------------------
// OS: fotos (remoção)
// ------------------------------------------------------------
test("osFotoRemover: foto nova é descartada; foto existente é marcada p/ remover", async function () {
  const { window } = await preparar()
  window.eval("osForm()")
  await esperarAssentar(window)
  // 2 fotos: uma nova (id null) e uma existente (id 5)
  window.eval(
    "OS_FOTOS = [{ id: null, imagem: 'data:img1', remover: false }, { id: 5, imagem: 'data:img2', remover: false }]",
  )
  // remove a existente (idx 1) -> marca remover=true, mantém no array
  window.eval("osFotoRemover(1)")
  assert.strictEqual(window.eval("OS_FOTOS.length"), 2, "existente permanece no array")
  assert.strictEqual(window.eval("OS_FOTOS[1].remover"), true, "existente marcada p/ remover")
  // remove a nova (idx 0) -> some do array
  window.eval("osFotoRemover(0)")
  assert.strictEqual(window.eval("OS_FOTOS.length"), 1, "foto nova é descartada do array")
})

// ------------------------------------------------------------
// CONFIG: logo da empresa
// ------------------------------------------------------------
test("salvarConfigLogo sem imagem escolhida não grava (pede imagem)", async function () {
  const { window, registro } = await preparar()
  await window.eval("pageConfiguracoes()")
  await esperarAssentar(window)
  window.eval("_logoPendente = null")
  await window.eval("salvarConfigLogo()")
  await esperarAssentar(window)
  // Sem logo, não deveria ter chamado _salvarConfig (nenhum upsert de logo_empresa).
  const rows = (registro.upsert.configuracoes || []).flat()
  const gravouLogo = rows.some((r) => r && r.chave === "logo_empresa")
  assert.strictEqual(gravouLogo, false, "sem imagem, não grava logo")
})

test("salvarConfigLogo com logo pendente grava logo_empresa em configuracoes", async function () {
  const { window, registro } = await preparar()
  await window.eval("pageConfiguracoes()")
  await esperarAssentar(window)
  window.eval("_logoPendente = 'data:image/png;base64,AAAA'")
  await window.eval("salvarConfigLogo()")
  await esperarAssentar(window)
  // _salvarConfig faz upsert de linhas { chave, valor }.
  const rows = (registro.upsert.configuracoes || []).flat()
  const gravou = rows.find(
    (r) => r && r.chave === "logo_empresa" && r.valor === "data:image/png;base64,AAAA",
  )
  assert.ok(gravou, "deveria gravar a logo em configuracoes: " + JSON.stringify(rows))
})

test("removerLogo grava logo_empresa vazio (remove a logo)", async function () {
  const { window, registro } = await preparar()
  await window.eval("pageConfiguracoes()")
  await esperarAssentar(window)
  await window.eval("removerLogo()")
  await esperarAssentar(window)
  const rows = (registro.upsert.configuracoes || []).flat()
  const removeu = rows.find((r) => r && r.chave === "logo_empresa" && r.valor === "")
  assert.ok(removeu, "removerLogo deveria gravar logo_empresa='' : " + JSON.stringify(rows))
})
