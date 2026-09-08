// ============================================================
// config-relatorios-cadastros.test.js
//
// Cobre, rodando o <script> inline do index.html DE VERDADE num DOM jsdom
// (Supabase/XLSX/QRCode dublados):
//   - CONFIGURAÇÕES  (salvarConfigEmpresa, salvarConfigRegras, formas de pagamento)
//   - RELATÓRIOS     (renderRelatorios com CACHE semeado)
//   - BACKUP         (backupExportar nos 3 formatos — XLSX dublado)
//   - CADASTROS      (fabricantes, categorias, tipos, equivalências) + slugTipo
//   - FUNCIONÁRIOS   (funcSalvar → insert em funcionarios)
//
// O Supabase dublado (ambiente.js) REGISTRA insert/update por tabela em
// clienteFake.__registro. Os asserts são sobre esse registro e sobre o DOM.
//
// OBSERVAÇÃO IMPORTANTE — CONFIGURAÇÕES usam UPSERT, não insert/update:
// _salvarConfig() grava com sb.from("configuracoes").upsert(...). O dublê
// padrão do ambiente só REGISTRA insert e update (upsert é um método
// encadeável inerte). Por isso, nos testes de config, instalamos um espião
// leve em clienteFake.from que captura as chamadas .upsert(payload) numa lista
// própria (__upserts). Assim afirmamos o payload real gravado, sem tocar no
// ambiente.js compartilhado.
//
// O QUE FOI PULADO (e por quê):
//   - backupRestaurar: lê um File real via file.text() (input[type=file].files).
//     No jsdom não há File selecionável de forma confiável sem montar um mock
//     de FileReader/File; o fluxo de leitura é ortogonal ao resto. Documentado,
//     não forçado. Apenas garantimos que chamar sem arquivo NÃO lança e exibe a
//     mensagem "Selecione um arquivo JSON primeiro." (caminho totalmente
//     testável em jsdom).
//   - salvarConfigLogo/cfgPreviewLogo: dependem de FileReader + <canvas>
//     getContext("2d") (não implementado em jsdom). Fora de escopo.
// ============================================================

const { test } = require("node:test")
const assert = require("node:assert")
const { montarAmbiente, semearCache, esperarAssentar } = require("./ambiente")

// ------------------------------------------------------------
// Helpers de preparação
// ------------------------------------------------------------

// Monta o app já semeado (CACHE + SESSAO admin). Devolve window/doc/registro.
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

// Instala um espião em clienteFake.from que registra as chamadas .upsert(payload)
// por tabela em clienteFake.__upserts[tabela]. Preserva todo o resto do dublê
// (encadeamento, then, insert/update/registro). Retorna a lista __upserts.
function espiarUpserts(clienteFake) {
  const upserts = {}
  clienteFake.__upserts = upserts
  const fromOriginal = clienteFake.from.bind(clienteFake)
  clienteFake.from = function (tabela) {
    const consulta = fromOriginal(tabela)
    const upsertOriginal = consulta.upsert
    consulta.upsert = function (payload) {
      if (!upserts[tabela]) upserts[tabela] = []
      upserts[tabela].push(payload)
      return upsertOriginal ? upsertOriginal.apply(consulta, arguments) : consulta
    }
    return consulta
  }
  return upserts
}

// Ajusta o valor de um campo pelo id (via DOM direto).
function definirCampo(doc, id, valor) {
  const el = doc.getElementById(id)
  if (!el) throw new Error("Campo não encontrado: " + id)
  el.value = valor
  return el
}

// ============================================================
// CONFIGURAÇÕES
// ============================================================

// CASO 1 — salvarConfigEmpresa grava os pares da empresa via upsert em
// "configuracoes" (cada par vira {chave, valor}).
test("salvarConfigEmpresa faz upsert dos dados da empresa em configuracoes", async function () {
  const { window, doc, clienteFake } = await montarSemeado()
  const upserts = espiarUpserts(clienteFake)

  // Renderiza a tela de config (cria os inputs cfgNome/cfgDoc/cfgTel/cfgEnd).
  window.eval("pageConfiguracoes()")
  await esperarAssentar(window)

  definirCampo(doc, "cfgNome", "MyKey Chaveiro")
  definirCampo(doc, "cfgDoc", "12.345.678/0001-90")
  definirCampo(doc, "cfgTel", "(35) 99999-8888")
  definirCampo(doc, "cfgEnd", "Rua das Chaves, 10 - Centro")

  window.eval("salvarConfigEmpresa()")
  await esperarAssentar(window)

  const linhas = upserts["configuracoes"] || []
  assert.ok(linhas.length >= 1, "deveria ter feito upsert em configuracoes")
  // Achata todos os pares gravados (cada upsert recebe um array de {chave,valor}).
  const pares = linhas.flat()
  const mapa = {}
  pares.forEach((p) => {
    mapa[p.chave] = p.valor
  })
  assert.strictEqual(mapa["nome_empresa"], "MyKey Chaveiro")
  assert.strictEqual(mapa["documento_empresa"], "12.345.678/0001-90")
  assert.strictEqual(mapa["telefone_empresa"], "(35) 99999-8888")
  assert.strictEqual(mapa["endereco_empresa"], "Rua das Chaves, 10 - Centro")
})

// CASO 1b — sem nome de empresa NÃO grava (validação obrigatória).
test("salvarConfigEmpresa sem nome não grava em configuracoes", async function () {
  const { window, doc, clienteFake } = await montarSemeado()
  const upserts = espiarUpserts(clienteFake)
  window.eval("pageConfiguracoes()")
  await esperarAssentar(window)

  definirCampo(doc, "cfgNome", "   ") // vazio após trim
  window.eval("salvarConfigEmpresa()")
  await esperarAssentar(window)

  assert.strictEqual(
    (upserts["configuracoes"] || []).length,
    0,
    "não deveria gravar config sem nome de empresa",
  )
})

// CASO 2 — salvarConfigRegras grava garantia_dias e termos_garantia.
test("salvarConfigRegras faz upsert das regras em configuracoes", async function () {
  const { window, doc, clienteFake } = await montarSemeado()
  const upserts = espiarUpserts(clienteFake)
  window.eval("pageConfiguracoes()")
  await esperarAssentar(window)

  definirCampo(doc, "cfgGarantia", "120")
  definirCampo(doc, "cfgTermos", "Garantia de 120 dias para defeitos.")

  window.eval("salvarConfigRegras()")
  await esperarAssentar(window)

  const pares = (upserts["configuracoes"] || []).flat()
  const mapa = {}
  pares.forEach((p) => {
    mapa[p.chave] = p.valor
  })
  assert.strictEqual(mapa["garantia_dias"], "120")
  assert.strictEqual(mapa["termos_garantia"], "Garantia de 120 dias para defeitos.")
})

// CASO 3 — formaPagSalvar (nova) → insert em "formas_pagamento" com o nome.
test("formaPagSalvar nova forma faz insert em formas_pagamento", async function () {
  const { window, doc, registro } = await montarSemeado()

  // Abre o modal de nova forma (cria o input fpNome).
  window.eval("formaPagForm()")
  await esperarAssentar(window)

  definirCampo(doc, "fpNome", "Cartão de crédito")
  window.eval("formaPagSalvar(0)") // id 0 = nova
  await esperarAssentar(window)

  const inserts = registro.insert["formas_pagamento"] || []
  assert.strictEqual(inserts.length, 1, "deveria inserir 1 forma de pagamento")
  assert.strictEqual(inserts[0].nome, "Cartão de crédito")
})

// CASO 3b — formaPagSalvar sem nome NÃO insere.
test("formaPagSalvar sem nome não insere forma de pagamento", async function () {
  const { window, doc, registro } = await montarSemeado()
  window.eval("formaPagForm()")
  await esperarAssentar(window)
  definirCampo(doc, "fpNome", "   ")
  window.eval("formaPagSalvar(0)")
  await esperarAssentar(window)
  assert.strictEqual((registro.insert["formas_pagamento"] || []).length, 0)
})

// ============================================================
// CADASTROS: FABRICANTES
// ============================================================

// CASO 4 — fabSalvar (novo) → insert em "fabricantes" com nome e tipo.
test("fabSalvar novo faz insert em fabricantes com nome e tipo", async function () {
  const { window, doc, registro } = await montarSemeado()

  window.eval("fabForm()") // sem arg = novo; cria fabNome, fabTipo, etc.
  await esperarAssentar(window)

  definirCampo(doc, "fabNome", "Gold")
  definirCampo(doc, "fabTipo", "automotivo")
  definirCampo(doc, "fabCidade", "Poços de Caldas")
  definirCampo(doc, "fabUf", "mg")

  window.eval("fabSalvar(0)")
  await esperarAssentar(window)

  const inserts = registro.insert["fabricantes"] || []
  assert.strictEqual(inserts.length, 1, "deveria inserir 1 fabricante")
  assert.strictEqual(inserts[0].nome, "Gold")
  assert.strictEqual(inserts[0].tipo, "automotivo")
  assert.strictEqual(inserts[0].uf, "MG", "uf deve ser normalizada para maiúsculas")
  assert.strictEqual(inserts[0].cidade, "Poços de Caldas")
})

// CASO 4b — fabSalvar sem nome NÃO insere.
test("fabSalvar sem nome não insere fabricante", async function () {
  const { window, doc, registro } = await montarSemeado()
  window.eval("fabForm()")
  await esperarAssentar(window)
  definirCampo(doc, "fabNome", "  ")
  window.eval("fabSalvar(0)")
  await esperarAssentar(window)
  assert.strictEqual((registro.insert["fabricantes"] || []).length, 0)
})

// CASO 4c — fabExcluir com confirm=true chama delete em "fabricantes".
// O confirm do ambiente devolve true; a contagem de chaves usa .select com
// head (o dublê resolve count indefinido → não bloqueia). Espionamos o
// encadeável para saber se .delete() foi chamado.
test("fabExcluir chama delete em fabricantes quando confirmado", async function () {
  const { window, clienteFake } = await montarSemeado()

  // Espião: marca quando .delete() é invocado na tabela fabricantes.
  let deletouFabricantes = false
  const fromOriginal = clienteFake.from.bind(clienteFake)
  clienteFake.from = function (tabela) {
    const consulta = fromOriginal(tabela)
    if (tabela === "fabricantes") {
      const deleteOriginal = consulta.delete
      consulta.delete = function () {
        deletouFabricantes = true
        return deleteOriginal.apply(consulta, arguments)
      }
    }
    return consulta
  }

  window.eval("fabExcluir(7)")
  await esperarAssentar(window)

  assert.ok(deletouFabricantes, "deveria chamar delete em fabricantes")
})

// CASO 10a — renderFabricantes mostra os itens do CACHE no #main (fabList).
test("renderFabricantes lista os fabricantes do CACHE no DOM", async function () {
  const { window, doc } = await montarSemeado()
  window.eval("pageFabricantes()") // cria o container #fabList (e zera o CACHE)
  await esperarAssentar(window)
  // Re-semeia DEPOIS da página e injeta um fabricante nomeado.
  semearCache(window)
  window.eval(
    "CACHE.fabricantes = [{ id: 5, nome: 'Fabricante Ômega', tipo: 'ambos', cidade: 'Alfenas', uf: 'MG' }]; renderFabricantes();",
  )
  await esperarAssentar(window)

  const html = doc.getElementById("fabList").innerHTML
  assert.ok(html.includes("Fabricante Ômega"), "deveria mostrar o nome do fabricante")
  assert.ok(html.includes("Alfenas"), "deveria mostrar a cidade")
})

// ============================================================
// CADASTROS: CATEGORIAS
// ============================================================

// CASO 5 — catSalvar (nova) → insert em "categorias" com nome.
test("catSalvar nova faz insert em categorias", async function () {
  const { window, doc, registro } = await montarSemeado()
  window.eval("catForm()")
  await esperarAssentar(window)
  definirCampo(doc, "catNome", "Transponder")
  window.eval("catSalvar(0)")
  await esperarAssentar(window)

  const inserts = registro.insert["categorias"] || []
  assert.strictEqual(inserts.length, 1, "deveria inserir 1 categoria")
  assert.strictEqual(inserts[0].nome, "Transponder")
})

// CASO 10b — renderCategorias mostra os itens do CACHE.
test("renderCategorias lista as categorias do CACHE no DOM", async function () {
  const { window, doc } = await montarSemeado()
  window.eval("pageCategorias()")
  await esperarAssentar(window)
  semearCache(window)
  window.eval(
    "CACHE.categorias = [{ id: 1, nome: 'Tetra' }, { id: 2, nome: 'Yale' }]; renderCategorias();",
  )
  await esperarAssentar(window)

  const html = doc.getElementById("catList").innerHTML
  assert.ok(html.includes("Tetra"))
  assert.ok(html.includes("Yale"))
})

// ============================================================
// CADASTROS: TIPOS
// ============================================================

// CASO 6a — slugTipo gera o slug correto (minúsculo, sem acento, sem espaço).
test("slugTipo gera slug minúsculo sem acento nem espaço", async function () {
  const { window } = await montarSemeado()
  assert.strictEqual(window.eval("slugTipo('Chave')"), "chave")
  assert.strictEqual(window.eval("slugTipo('Fechadura Elétrica')"), "fechaduraeletrica")
  assert.strictEqual(window.eval("slugTipo('Peça 123')"), "peca123")
  assert.strictEqual(window.eval("slugTipo('  Ação  ')"), "acao")
})

// CASO 6b — tipoSalvar (novo) → insert em "tipos_produto" com chave (slug),
// rotulo e ícone.
test("tipoSalvar novo faz insert em tipos_produto com slug", async function () {
  const { window, doc, registro } = await montarSemeado()
  window.eval("tipoForm()")
  await esperarAssentar(window)
  definirCampo(doc, "tipoRotulo", "Fechadura Elétrica")
  definirCampo(doc, "tipoIcone", "🔒")
  window.eval("tipoSalvar(0)")
  await esperarAssentar(window)

  const inserts = registro.insert["tipos_produto"] || []
  assert.strictEqual(inserts.length, 1, "deveria inserir 1 tipo")
  assert.strictEqual(inserts[0].rotulo, "Fechadura Elétrica")
  assert.strictEqual(inserts[0].chave, "fechaduraeletrica")
  assert.strictEqual(inserts[0].icone, "🔒")
})

// CASO 10c — renderTipos mostra os itens do CACHE.
test("renderTipos lista os tipos do CACHE no DOM", async function () {
  const { window, doc } = await montarSemeado()
  window.eval("pageTipos()")
  await esperarAssentar(window)
  semearCache(window)
  window.eval(
    "CACHE.tipos = [{ id: 1, chave: 'chave', rotulo: 'Chave', icone: '🔑' }, { id: 2, chave: 'cadeado', rotulo: 'Cadeado', icone: '🔒' }]; renderTipos();",
  )
  await esperarAssentar(window)

  const html = doc.getElementById("tipoList").innerHTML
  assert.ok(html.includes("Chave"))
  assert.ok(html.includes("Cadeado"))
})

// ============================================================
// CADASTROS: EQUIVALÊNCIAS
// ============================================================

// CASO 7 — eqSalvar (nova) → insert em "equivalencias" com marca/modelo/códigos.
test("eqSalvar nova faz insert em equivalencias", async function () {
  const { window, doc, registro } = await montarSemeado()
  window.eval("eqForm()")
  await esperarAssentar(window)
  definirCampo(doc, "eqMarca", "Yale")
  definirCampo(doc, "eqModelo", "Y1")
  definirCampo(doc, "eqDovale", "D1")
  definirCampo(doc, "eqGold", "G1")
  window.eval("eqSalvar(0)")
  await esperarAssentar(window)

  const inserts = registro.insert["equivalencias"] || []
  assert.strictEqual(inserts.length, 1, "deveria inserir 1 equivalência")
  assert.strictEqual(inserts[0].marca, "Yale")
  assert.strictEqual(inserts[0].modelo, "Y1")
  assert.strictEqual(inserts[0].dovale, "D1")
  assert.strictEqual(inserts[0].gold, "G1")
})

// CASO 7b — eqSalvar sem marca/modelo NÃO insere.
test("eqSalvar sem marca/modelo não insere equivalência", async function () {
  const { window, doc, registro } = await montarSemeado()
  window.eval("eqForm()")
  await esperarAssentar(window)
  definirCampo(doc, "eqMarca", "Yale")
  definirCampo(doc, "eqModelo", "  ") // modelo vazio
  window.eval("eqSalvar(0)")
  await esperarAssentar(window)
  assert.strictEqual((registro.insert["equivalencias"] || []).length, 0)
})

// ============================================================
// FUNCIONÁRIOS
// ============================================================

// CASO 8 — funcSalvar (novo) → chama o RPC funcionario_salvar, que
// hasheia a senha NO SERVIDOR. O navegador NÃO faz mais insert direto na tabela
// (não manda senha em texto puro pra uma coluna legível). Aqui provamos que o
// caminho é a RPC, com os campos certos, e que a tabela não recebe insert cru.
test("funcSalvar novo chama RPC funcionario_salvar com usuario/nome/perfil (sem insert cru)", async function () {
  const { window, doc, registro } = await montarSemeado()

  // pageFuncionarios cria o container #funcList que o reload pós-save
  // (carregarFuncionarios) precisa escrever; sem ele o app lançaria num timer.
  window.eval("pageFuncionarios()")
  await esperarAssentar(window)
  window.eval("funcForm()") // cria ffUser/ffNome/ffSenha/ffPerfil/ffAtivo...
  await esperarAssentar(window)

  definirCampo(doc, "ffUser", "joao")
  definirCampo(doc, "ffNome", "João Silva")
  definirCampo(doc, "ffSenha", "segredo123")
  definirCampo(doc, "ffPerfil", "operador")

  window.eval("funcSalvar(0)")
  await esperarAssentar(window)

  // NADA de insert direto na tabela funcionarios (a senha em texto puro não
  // trafega pra uma coluna legível): tudo passa pelo RPC security definer.
  assert.strictEqual(
    (registro.insert["funcionarios"] || []).length,
    0,
    "não deve fazer insert cru em funcionarios (usa o RPC)",
  )
  const chamadas = registro.funcionarioSalvar || []
  assert.strictEqual(chamadas.length, 1, "deveria chamar o RPC uma vez")
  const args = chamadas[0]
  assert.strictEqual(args.p_id, 0, "novo funcionário → p_id 0")
  assert.strictEqual(args.p_usuario, "joao")
  assert.strictEqual(args.p_nome, "João Silva")
  assert.strictEqual(args.p_perfil, "operador")
  assert.strictEqual(args.p_senha, "segredo123")
  // Operador não é admin → permissoes é um JSON (array) com os módulos marcados.
  const perms = JSON.parse(args.p_permissoes)
  assert.ok(Array.isArray(perms), "permissoes deve ser um array JSON")
  assert.ok(
    perms.includes("pdv"),
    "preset operador deve conter os módulos de venda (ex.: pdv)",
  )
  assert.ok(
    !perms.includes("dashboard"),
    "Painel não deve mais ser forçado no array de permissoes do operador",
  )
  assert.ok(
    !perms.includes("faturamento"),
    "operador não deve receber a permissão de faturamento por padrão",
  )
})

// CASO 8b — funcSalvar novo SEM senha não chama o RPC (senha obrigatória na
// criação; o front barra antes). Nada de insert cru também.
test("funcSalvar novo sem senha não cadastra funcionário", async function () {
  const { window, doc, registro } = await montarSemeado()
  window.eval("funcForm()")
  await esperarAssentar(window)
  definirCampo(doc, "ffUser", "maria")
  definirCampo(doc, "ffNome", "Maria")
  definirCampo(doc, "ffSenha", "") // sem senha
  window.eval("funcSalvar(0)")
  await esperarAssentar(window)
  assert.strictEqual((registro.insert["funcionarios"] || []).length, 0)
  assert.strictEqual((registro.funcionarioSalvar || []).length, 0)
})

// CASO 8c — funcSalvar EDIÇÃO sem senha nova → RPC com p_senha null (mantém a
// atual no servidor). O navegador nunca precisa da senha existente pra editar.
test("funcSalvar edição sem senha nova chama RPC com p_senha null", async function () {
  const { window, doc, registro } = await montarSemeado()
  window.eval("pageFuncionarios()")
  await esperarAssentar(window)
  // Edita um funcionário id=7 (funcForm com objeto → modo edição).
  window.eval(
    'funcForm({ id: 7, usuario: "ana", nome: "Ana", perfil: "operador", ativo: true, permissoes: null })',
  )
  await esperarAssentar(window)
  definirCampo(doc, "ffNome", "Ana Paula")
  definirCampo(doc, "ffSenha", "") // não troca a senha
  window.eval("funcSalvar(7)")
  await esperarAssentar(window)
  const chamadas = registro.funcionarioSalvar || []
  assert.strictEqual(chamadas.length, 1)
  assert.strictEqual(chamadas[0].p_id, 7)
  assert.strictEqual(chamadas[0].p_nome, "Ana Paula")
  assert.strictEqual(
    chamadas[0].p_senha,
    null,
    "edição sem senha nova → p_senha null (servidor mantém a atual)",
  )
})

// ============================================================
// RELATÓRIOS
// ============================================================

// CASO 9 — renderRelatorios com CACHE semeado → totais/valores aparecem no DOM.
test("renderRelatorios exibe faturamento e vendas do CACHE no DOM", async function () {
  const { window, doc } = await montarSemeado()

  // pageRelatorios cria os elementos (relContent, relDe, relFunc...) e zera o
  // CACHE via carregar*. Re-semeamos DEPOIS com transações + serviços + func.
  window.eval("pageRelatorios()")
  await esperarAssentar(window)
  semearCache(window)
  window.eval(
    "CACHE.funcionarios = [{ id: 1, nome: 'João Vendedor', comissao_percentual: 0 }];" +
      "CACHE.transacoes = [" +
      "  { id: 1, tipo: 'entrada', valor: 150, forma_pagamento: 'Dinheiro', funcionario_id: 1, criado_em: '2026-07-01T10:00:00' }," +
      "  { id: 2, tipo: 'saida',   valor: 40,  forma_pagamento: 'Dinheiro', funcionario_id: 1, criado_em: '2026-07-01T11:00:00' }" +
      "];" +
      "CACHE.servicos = [" +
      "  { id: 1, status: 'concluido', total: 150, funcionario_id: 1, forma_pagamento: 'Dinheiro', criado_em: '2026-07-01T10:00:00'," +
      "    itens: [{ chave_id: 10, quantidade: 1, total: 150 }] }" +
      "];" +
      "CACHE.chaves = [{ id: 10, codigo: 'CH1', descricao: 'Chave Fisica' }];" +
      "renderRelatorios();",
  )
  await esperarAssentar(window)

  const html = doc.getElementById("relContent").innerHTML
  // Vendas por funcionário: o nome do vendedor aparece.
  assert.ok(html.includes("João Vendedor"), "deveria listar o vendedor no relatório")
  // Faturamento por dia: entrada de 150 formatada (fmt usa R$). Verificamos o
  // dígito do valor e o rótulo da seção.
  assert.ok(html.includes("Faturamento por dia"), "deveria ter a seção de faturamento")
  assert.ok(/150/.test(html), "deveria exibir o valor de entrada (150)")
  // Produto mais vendido aparece pelo código.
  assert.ok(html.includes("CH1"), "deveria listar o produto mais vendido")
})

// ============================================================
// BACKUP
// ============================================================

// CASO 11 — backupExportar roda sem lançar nos 3 formatos (XLSX dublado).
// O dublê de XLSX (criarSilenciador) devolve utils.book_new/json_to_sheet/etc.
// e XLSX.write silenciado; _baixarArquivo cria um <a> e clica (jsdom aceita).
// Precisa dos botões (bkJsonBtn/bkXlsxBtn/bkSqlBtn) → renderiza pageBackup antes.
test("backupExportar não lança nos formatos json/xlsx/sql", async function () {
  const { window } = await montarSemeado()
  window.eval("pageBackup()")
  await esperarAssentar(window)

  // URL.createObjectURL/revokeObjectURL podem não existir no jsdom; garantimos
  // dublês inertes para o _baixarArquivo não quebrar (não altera comportamento).
  window.eval(
    "if (!URL.createObjectURL) URL.createObjectURL = function(){ return 'blob:x' };" +
      "if (!URL.revokeObjectURL) URL.revokeObjectURL = function(){};",
  )

  await assert.doesNotReject(async function () {
    await window.eval("backupExportar('json')")
    await esperarAssentar(window)
    await window.eval("backupExportar('sql')")
    await esperarAssentar(window)
    await window.eval("backupExportar('xlsx')")
    await esperarAssentar(window)
  }, "backupExportar não deveria lançar em nenhum formato")
})

// CASO 11b (documentado) — backupRestaurar SEM arquivo selecionado não lança e
// exibe a mensagem de orientação. O fluxo COM arquivo depende de File real
// (file.text()) e foi PULADO (ver cabeçalho).
test("backupRestaurar sem arquivo apenas orienta o usuário", async function () {
  const { window, doc } = await montarSemeado()
  window.eval("pageBackup()")
  await esperarAssentar(window)

  await assert.doesNotReject(async function () {
    await window.eval("backupRestaurar()")
    await esperarAssentar(window)
  })

  const msg = doc.getElementById("bkRestoreMsg")
  assert.ok(
    msg && /selecione um arquivo/i.test(msg.textContent),
    "deveria pedir para selecionar um arquivo JSON",
  )
})
