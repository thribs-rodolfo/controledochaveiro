// ============================================================
// dashboard-controle-acesso.test.js — controle de acesso do Painel.
//
// Cobre a mudança de desenho:
//   (1) O Painel (dashboard) virou módulo CONTROLÁVEL (deixou de ser exceção fixa).
//   (2) A visão dos VALORES DE FATURAMENTO dentro do Painel é uma permissão
//       SEPARADA ('faturamento').
//   (3) Default seguro: não-admin sem 'faturamento' NÃO tem os números de
//       faturamento no DOM (não basta esconder por CSS — o dado nem é montado).
//   (4) Descartar a venda rápida (pdvSair) NÃO cai no Painel quando o usuário
//       não tem acesso a ele.
//
// Semeamos o CACHE com transações de entrada/saída para que, SE os cartões de
// faturamento fossem montados, o valor apareceria no DOM. Assim a ausência do
// valor prova que ele não foi renderizado (e não que o valor era zero).
// ============================================================

const { test } = require("node:test")
const assert = require("node:assert")
const { montarAmbiente, esperarAssentar } = require("./ambiente")

// ============================================================
// Regressões de CONTROLE DE ACESSO relatadas por Andre Anderson:
//   Bug 1 (flash): módulos não autorizados apareciam por alguns frames porque
//                  o menu era revelado (#app.show) ANTES de esconder os módulos.
//   Bug 2 (refresh): atualizar a página (F5) fazia os módulos desmarcados
//                    voltarem — a restauração da sessão não trazia 'permissoes'
//                    do banco, caindo no preset do perfil.
// ============================================================

// (F1) Sem flash: quando entrarNoApp roda, os itens de menu não autorizados já
// estão escondidos ANTES de o #app ficar visível (não renderiza tudo e esconde
// depois). Provamos verificando que, no instante em que o app é revelado, o
// item 'Produtos' (chaves) — desmarcado para este operador — está display:none.
test("Flash: menu já nasce filtrado antes de o app aparecer (Produtos escondido)", async function () {
  const { window, dom } = await montarAmbiente()
  const doc = dom.window.document
  // Operador SEM 'chaves' (Produtos), como no relato (admin desmarcou Produtos).
  window.eval(
    "SESSAO = { id: 7, perfil: 'operador', nome: 'Operador'," +
      " permissoes: JSON.stringify(['pdv','servicos','clientes','equivalencias']) };",
  )
  const appEl = doc.getElementById("app")
  const linkProdutos = doc.querySelector('#nav a[data-page="chaves"]')
  // Sentinela: no exato momento em que o app ganha a classe 'show', o item
  // Produtos JÁ tem de estar escondido. Se estivesse visível aqui, seria o flash.
  let produtosEscondidoQuandoApareceu = null
  const observer = new dom.window.MutationObserver(function () {
    if (appEl.classList.contains("show") && produtosEscondidoQuandoApareceu === null) {
      produtosEscondidoQuandoApareceu = linkProdutos.style.display === "none"
    }
  })
  observer.observe(appEl, { attributes: true, attributeFilter: ["class"] })
  await window.eval("entrarNoApp()")
  await esperarAssentar(window)
  observer.disconnect()
  assert.strictEqual(
    produtosEscondidoQuandoApareceu,
    true,
    "Produtos deveria já estar escondido no instante em que o app apareceu (sem flash)",
  )
  // E ao final continua escondido.
  assert.strictEqual(
    linkProdutos.style.display,
    "none",
    "Produtos (desmarcado) não pode ficar visível no menu do operador",
  )
})

// (F2) Refresh: a restauração da sessão no init() traz 'permissoes' do banco,
// então módulos desmarcados (Produtos) NUNCA voltam a aparecer após um F5.
test("Refresh: init() restaura as permissoes do funcionário (Produtos continua bloqueado)", async function () {
  const { window, clienteFake } = await montarAmbiente()
  // Simula o refresh: há uma sessão salva (só o id importa para o init buscar).
  window.eval(
    "SESSAO = { id: 7, perfil: 'operador', nome: 'Operador' };" +
      "localStorage.setItem('chaveiro_sessao', JSON.stringify(SESSAO));",
  )
  // O banco (fake) devolve o funcionário COM as permissoes reais — Produtos
  // (chaves) NÃO está entre elas. É exatamente o que o select do init precisa ler.
  clienteFake.__registro.__loginUser = {
    id: 7,
    usuario: "operador",
    nome: "Operador",
    perfil: "operador",
    ativo: true,
    permissoes: JSON.stringify(["pdv", "servicos", "clientes", "equivalencias"]),
  }
  // Faz o banco fake respeitar a projeção do .select(): se o app NÃO pedir a
  // coluna 'permissoes' no refresh (o bug), ela não vem — e o teste falha. Assim
  // este teste prova a correção do select do init().
  clienteFake.__registro.__projetarSelect = true
  // Ativação e login-por-refresh: sela a ativação como válida para o init seguir
  // até o ramo de restauração da sessão (sem depender de crypto/licenças reais).
  window.eval("estadoAtivacao = async function () { return 'ativado' }")
  window.eval("consolidarAtualizacao = async function () {}")
  window.eval("testarConexao = async function () {}")
  await window.eval("init()")
  await esperarAssentar(window)
  await esperarAssentar(window)
  // As permissoes personalizadas foram restauradas (não caiu no preset do perfil).
  const permissoesRestauradas = window.eval(
    "SESSAO && SESSAO.permissoes ? SESSAO.permissoes : null",
  )
  assert.ok(
    permissoesRestauradas,
    "após o refresh, SESSAO.permissoes deve ser restaurado do banco (não undefined)",
  )
  assert.ok(
    !JSON.parse(permissoesRestauradas).includes("chaves"),
    "as permissoes restauradas NÃO devem incluir 'chaves' (Produtos foi desmarcado)",
  )
  // E o gating reflete isso: sem acesso a Produtos.
  assert.strictEqual(
    window.eval("temAcesso('chaves')"),
    false,
    "após o refresh, o operador NÃO pode ter acesso a Produtos (chaves)",
  )
})

// Semeia o CACHE mínimo que o renderDashboard() usa e define a SESSAO pedida.
// Injeta uma transação de entrada (faturamento) e uma de saída (despesa) com a
// data de hoje, além de um serviço pendente (a receber). Se os cartões de
// faturamento entrarem no DOM, esses valores aparecem formatados (R$ ...).
function semearDashboard(window, sessao) {
  const hoje = window.eval("hojeISO()")
  window.eval(
    "CACHE.servicos = [" +
      "  { id: 1, criado_em: '" + hoje + "T10:00:00', status: 'concluido', status_pagamento: 'pendente', total: 500, valor_pago: 0, itens: [] }" +
      "];" +
      "CACHE.transacoes = [" +
      "  { id: 1, tipo: 'entrada', valor: 777, criado_em: '" + hoje + "T10:00:00' }," +
      "  { id: 2, tipo: 'saida', valor: 123, criado_em: '" + hoje + "T11:00:00' }" +
      "];" +
      "CACHE.chaves = [];" +
      "CACHE.fabricantes = [];" +
      "CACHE.categorias = [];" +
      "CACHE.tipos = [];",
  )
  window.eval("SESSAO = " + JSON.stringify(sessao))
  // renderDashboard() escreve em #dashContent (criado por pageDashboard()).
  // Como semeamos o CACHE à mão (sem os carregar* que zerariam tudo), criamos
  // o container manualmente e chamamos renderDashboard() direto.
  window.document.getElementById("main").innerHTML = '<div id="dashContent"></div>'
}

// (b) Admin: os cartões de faturamento SÃO montados no DOM do Painel.
test("Painel: admin vê os números de faturamento no DOM", async function () {
  const { window, dom } = await montarAmbiente()
  semearDashboard(window, { id: 1, perfil: "admin", nome: "Admin" })
  window.eval("renderDashboard()")
  await esperarAssentar(window)
  const html = dom.window.document.getElementById("dashContent").innerHTML
  assert.match(html, /Faturamento Hoje/, "admin deveria ver o cartão de Faturamento Hoje")
  assert.match(html, /Faturamento do Mês/, "admin deveria ver Faturamento do Mês")
  assert.match(html, /Despesas do Mês/, "admin deveria ver Despesas do Mês")
  assert.match(html, /A Receber/, "admin deveria ver A Receber")
  assert.ok(html.includes("777"), "o valor de faturamento (777) deveria estar no DOM do admin")
})

// (a) Não-admin sem 'faturamento': os números NÃO existem no DOM.
test("Painel: operador sem permissão de faturamento NÃO tem os números no DOM", async function () {
  const { window, dom } = await montarAmbiente()
  // operador com o Painel liberado, MAS sem a permissão 'faturamento'
  semearDashboard(window, {
    id: 2,
    perfil: "operador",
    nome: "Operador",
    permissoes: JSON.stringify(["dashboard", "pdv"]),
  })
  window.eval("renderDashboard()")
  await esperarAssentar(window)
  const html = dom.window.document.getElementById("dashContent").innerHTML
  // Os rótulos e o valor sensível NÃO podem estar no DOM.
  assert.ok(!/Faturamento Hoje/.test(html), "operador NÃO deveria ver Faturamento Hoje")
  assert.ok(!/Faturamento do Mês/.test(html), "operador NÃO deveria ver Faturamento do Mês")
  assert.ok(!/Despesas do Mês/.test(html), "operador NÃO deveria ver Despesas do Mês")
  assert.ok(!html.includes("777"), "o valor de faturamento (777) NÃO pode ir para o DOM do operador")
  // Mas os cartões não sensíveis (contagem de OS/vendas) continuam presentes.
  assert.match(html, /OS \/ Vendas Hoje/, "cartões não sensíveis devem continuar visíveis")
})

// (a+) Não-admin COM 'faturamento': passa a ver os números.
test("Painel: operador COM permissão de faturamento vê os números no DOM", async function () {
  const { window, dom } = await montarAmbiente()
  semearDashboard(window, {
    id: 3,
    perfil: "operador",
    nome: "Operador",
    permissoes: JSON.stringify(["dashboard", "pdv", "faturamento"]),
  })
  window.eval("renderDashboard()")
  await esperarAssentar(window)
  const html = dom.window.document.getElementById("dashContent").innerHTML
  assert.match(html, /Faturamento Hoje/, "com a permissão, o operador vê Faturamento Hoje")
  assert.ok(html.includes("777"), "com a permissão, o valor deve aparecer no DOM")
})

// (d) O Painel (dashboard) aparece na lista de módulos controláveis.
test("Módulos: 'dashboard' está na lista controlável (MODULOS)", async function () {
  const { window } = await montarAmbiente()
  const temDashboard = window.eval("MODULOS.some((m) => m.k === 'dashboard')")
  assert.strictEqual(temDashboard, true, "MODULOS deve conter o módulo dashboard (Painel)")
  // E o formulário de funcionário passa a renderizar o checkbox do Painel.
  window.eval("SESSAO = { id: 1, perfil: 'admin', nome: 'Admin' }")
  window.eval("funcForm()")
  await esperarAssentar(window)
  // Troca o perfil para operador para os checkboxes de módulos aparecerem.
  const doc = window.document
  const seletorPerfil = doc.getElementById("ffPerfil")
  if (seletorPerfil) {
    seletorPerfil.value = "operador"
    window.eval("funcRenderModulos(false)")
    await esperarAssentar(window)
  }
  const checkboxDashboard = doc.querySelector('.ffMod[value="dashboard"]')
  assert.ok(checkboxDashboard, "o formulário deve ter o checkbox do módulo Painel (dashboard)")
  // E a marcação SEPARADA de faturamento também deve existir.
  const marcaFaturamento = doc.getElementById("ffFaturamento")
  assert.ok(marcaFaturamento, "o formulário deve ter a marcação de 'Ver valores de faturamento'")
})

// (c) Descartar a venda rápida NÃO cai no Painel quando o usuário não tem acesso.
test("pdvSair: operador SEM o Painel não navega para o Painel ao descartar a venda", async function () {
  const { window, dom } = await montarAmbiente()
  // operador sem 'dashboard' nas permissoes → não acessa o Painel
  window.eval(
    "SESSAO = { id: 4, perfil: 'operador', nome: 'Operador', permissoes: JSON.stringify(['pdv','servicos','clientes']) };" +
      "CACHE.chaves = []; CACHE.clientes = []; CACHE.formas = []; CACHE.fabricantes = [];",
  )
  await window.eval("pagePDV()")
  await esperarAssentar(window)
  window.eval("PDV_CART = [{ chave_id: 10, quantidade: 1, preco_unit: 10, estoque: 3 }]")
  // confirm dublado devolve true → descarta mesmo com itens
  window.eval("pdvSair()")
  await esperarAssentar(window)
  assert.strictEqual(window.eval("PDV_CART.length"), 0, "carrinho zerado ao descartar")
  const html = dom.window.document.getElementById("main").innerHTML
  // A "home" após descartar deve ser a primeira página permitida (pdv), NÃO o Painel.
  assert.ok(!/<h2>Painel<\/h2>/.test(html), "não deveria abrir o Painel restrito após descartar")
  assert.strictEqual(
    window.eval("primeiraPaginaPermitida()"),
    "pdv",
    "a primeira página permitida do operador é o pdv (Venda Rápida)",
  )
})

// (c+) Guard central de navegação: navigate('dashboard') redireciona quem não
// pode ver o Painel para a primeira página permitida.
test("navigate: sem acesso ao Painel, navegar para 'dashboard' redireciona para a primeira página permitida", async function () {
  const { window, dom } = await montarAmbiente()
  window.eval(
    "SESSAO = { id: 5, perfil: 'operador', nome: 'Operador', permissoes: JSON.stringify(['servicos','clientes']) };" +
      "CACHE.servicos = []; CACHE.clientes = [];",
  )
  window.eval("navigate('dashboard')")
  await esperarAssentar(window)
  const html = dom.window.document.getElementById("main").innerHTML
  assert.ok(!/<h2>Painel<\/h2>/.test(html), "não deve renderizar o Painel para quem não tem acesso")
})
