// ============================================================
// estoque-financeiro.test.js — cobertura de ESTOQUE e FINANCEIRO
//
// Roda o <script> inline do index.html DE VERDADE num DOM jsdom, com o
// Supabase dublado que REGISTRA as escritas (insert/update/delete) por tabela.
// Assim afirmamos exatamente o que foi (ou não foi) gravado em 'movimentacoes'
// e 'transacoes', além de conferir o DOM renderizado.
//
// Funções exercitadas (lidas do index canônico):
//   ESTOQUE:    estoqueMovForm, estoqueMovSalvar, renderEstoque, pageEstoque
//   FINANCEIRO: txForm, txSalvar, renderFinanceiro, pageFinanceiro
//
// Observações importantes sobre o ambiente:
//  - CACHE/SESSAO vivem no escopo léxico global do app (não em window). Mexemos
//    neles via window.eval, que roda naquele mesmo escopo.
//  - As páginas (pageEstoque/pageFinanceiro) chamam carregar* que ZERAM o CACHE
//    (o supabase fake devolve lista vazia). Por isso, quando o teste depende do
//    CACHE após abrir a página, RE-SEMEAMOS o CACHE depois de abrir.
//  - Inputs type=number: o jsdom (como o navegador) NÃO aceita "50,00" com
//    vírgula — sanitiza para "". Por isso valores válidos são preenchidos com
//    ponto ("50.00"), que é o que um input numérico realmente aceita.
// ============================================================

const { test } = require("node:test")
const assert = require("node:assert")
const {
  montarAmbiente,
  semearCache,
  semearProdutos,
  esperarAssentar,
} = require("./ambiente")

// Monta o app já semeado (cache básico + produtos de teste).
async function prepararComProdutos() {
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

// ============================================================
// ESTOQUE
// ============================================================

// ------------------------------------------------------------
// (1) estoqueMovForm abre o modal com os campos esperados.
// ------------------------------------------------------------
test("estoqueMovForm: abre modal com tipo/quantidade/motivo do produto físico", async function () {
  const { window, doc } = await prepararComProdutos()

  window.eval("estoqueMovForm(10)")

  const modal = doc.getElementById("modal")
  // Campos reais do formulário (ids exatos do canônico).
  const selTipo = doc.getElementById("estTipo")
  const inpQtd = doc.getElementById("estQtd")
  const inpMotivo = doc.getElementById("estMotivo")

  assert.ok(selTipo, "faltou o <select id='estTipo'>")
  assert.ok(inpQtd, "faltou o <input id='estQtd'>")
  assert.ok(inpMotivo, "faltou o <input id='estMotivo'>")

  // Opções de tipo: entrada / saída / ajuste.
  const valoresTipo = [...selTipo.options].map((o) => o.value)
  assert.deepStrictEqual(valoresTipo, ["entrada", "saida", "ajuste"])

  // O modal mostra a descrição e o estoque atual do produto.
  assert.match(modal.innerHTML, /Chave Fisica/, "modal deveria citar a descrição")
  // Botão de confirmar aponta para estoqueMovSalvar(10).
  assert.ok(
    doc.getElementById("estSaveBtn"),
    "faltou o botão de confirmar (estSaveBtn)",
  )
  assert.match(modal.innerHTML, /estoqueMovSalvar\(10\)/)
})

// ------------------------------------------------------------
// (1b) Registrar movimentação DENTRO da página de Estoque: o seletor de produto
//      lista os produtos físicos (não serviço) e, ao escolher, abre o
//      estoqueMovForm daquele produto.
// ------------------------------------------------------------
test("estoqueMovEscolherProduto: seletor lista produtos físicos e abre o form ao escolher", async function () {
  const { window, doc } = await prepararComProdutos()

  window.eval("estoqueMovEscolherProduto()")
  const box = doc.getElementById("estMovProdutos")
  assert.ok(box, "faltou a lista de produtos do seletor (estMovProdutos)")
  // Produto físico aparece; serviço (sem estoque) NÃO entra no seletor.
  assert.match(box.innerHTML, /Chave Fisica/, "produto físico deveria aparecer")
  assert.doesNotMatch(
    box.innerHTML,
    /Abertura de Porta/,
    "serviço não deveria aparecer no seletor de movimentação",
  )

  // Escolher o produto abre o estoqueMovForm daquele id (form de movimentação).
  window.eval("estoqueMovForm(10)")
  assert.ok(
    doc.getElementById("estSaveBtn"),
    "escolher o produto deveria abrir o form de movimentação",
  )
})

// ------------------------------------------------------------
// (2) estoqueMovSalvar ENTRADA de N unidades (produto físico id 10).
//     Deve inserir em 'movimentacoes' tipo 'entrada' com a quantidade N.
//     OBS: o app NÃO faz update do estoque — o trigger do banco recalcula a
//     partir das movimentações. Portanto não esperamos update em 'chaves'.
// ------------------------------------------------------------
test("estoqueMovSalvar: entrada de 5 unidades insere movimentação 'entrada' (sem update de estoque)", async function () {
  const { window, doc, registro } = await prepararComProdutos()

  window.eval("estoqueMovForm(10)")
  doc.getElementById("estTipo").value = "entrada"
  doc.getElementById("estQtd").value = "5"
  doc.getElementById("estMotivo").value = "compra do fornecedor"

  await window.eval("estoqueMovSalvar(10)")
  await esperarAssentar(window)

  const inseridas = registro.insert.movimentacoes || []
  assert.strictEqual(inseridas.length, 1, "deveria inserir 1 movimentação")
  const mov = inseridas[0]
  assert.strictEqual(mov.chave_id, 10)
  assert.strictEqual(mov.tipo, "entrada")
  assert.strictEqual(mov.quantidade, 5)
  assert.strictEqual(mov.motivo, "compra do fornecedor")
  assert.strictEqual(mov.funcionario_id, 1, "usa SESSAO.id como funcionário")

  // O estoque é recalculado por trigger — o app não escreve direto em 'chaves'.
  assert.strictEqual(
    (registro.update.chaves || []).length,
    0,
    "não deveria haver update direto de estoque em 'chaves' (trigger recalcula)",
  )
})

// ------------------------------------------------------------
// (3) estoqueMovSalvar SAÍDA → tipo 'saida'.
//     Produto id 10 tem estoque 3 (semearProdutos), então saída de 2 é válida.
// ------------------------------------------------------------
test("estoqueMovSalvar: saída de 2 unidades insere movimentação 'saida'", async function () {
  const { window, doc, registro } = await prepararComProdutos()

  window.eval("estoqueMovForm(10)")
  doc.getElementById("estTipo").value = "saida"
  doc.getElementById("estQtd").value = "2"
  doc.getElementById("estMotivo").value = "perda"

  await window.eval("estoqueMovSalvar(10)")
  await esperarAssentar(window)

  const inseridas = registro.insert.movimentacoes || []
  assert.strictEqual(inseridas.length, 1)
  assert.strictEqual(inseridas[0].tipo, "saida")
  assert.strictEqual(inseridas[0].quantidade, 2)
})

// ------------------------------------------------------------
// (4) renderEstoque monta a tabela com as movimentações do CACHE, resolvendo
//     o nome do produto (código · descrição) via CACHE.chaves.
//     A página zera o CACHE ao abrir; re-semeamos DEPOIS e populamos as
//     movimentações antes de renderizar.
// ------------------------------------------------------------
test("renderEstoque: lista as movimentações mostrando código/descrição do produto", async function () {
  const { window, doc } = await prepararComProdutos()

  await window.eval("pageEstoque()")
  await esperarAssentar(window)

  // pageEstoque zerou o CACHE (fake devolve vazio): re-semeia produtos e cria
  // uma movimentação apontando para o produto id 10.
  semearCache(window)
  semearProdutos(window)
  window.eval(
    "CACHE.movimentacoes = [" +
      "{ id: 1, chave_id: 10, tipo: 'entrada', quantidade: 5, motivo: 'compra', criado_em: '2026-07-30T12:00:00Z', funcionario_id: 1 }" +
      "]",
  )
  window.eval("renderEstoque()")

  const lista = doc.getElementById("estList")
  const html = lista.innerHTML
  // Aparece o código e a descrição do produto (montados por nomeChave).
  assert.match(html, /CH1/, "deveria mostrar o código do produto (CH1)")
  assert.match(html, /Chave Fisica/, "deveria mostrar a descrição do produto")
  assert.match(html, /entrada/, "deveria mostrar o tipo da movimentação")
  // É uma tabela com ao menos uma linha de dados.
  assert.ok(lista.querySelector("table"), "deveria renderizar uma <table>")
  assert.ok(
    lista.querySelectorAll("tbody tr").length >= 1,
    "deveria ter ao menos uma linha de movimentação",
  )
})

// ------------------------------------------------------------
// (5) GUARDA: estoqueMovSalvar com quantidade inválida (0) → toast de erro e
//     NÃO grava movimentação. Validação real: qtd <= 0 (após o isNaN/<0).
// ------------------------------------------------------------
test("estoqueMovSalvar: quantidade 0 não grava e mostra toast de erro", async function () {
  const { window, doc, registro } = await prepararComProdutos()

  window.eval("estoqueMovForm(10)")
  doc.getElementById("estTipo").value = "entrada"
  doc.getElementById("estQtd").value = "0"

  await window.eval("estoqueMovSalvar(10)")
  await esperarAssentar(window)

  assert.strictEqual(
    (registro.insert.movimentacoes || []).length,
    0,
    "quantidade 0 não deveria gravar nenhuma movimentação",
  )
  const toast = doc.getElementById("toast")
  assert.match(toast.className, /err/, "deveria exibir o toast de erro")
  assert.match(toast.textContent, /inválida/i, "toast deveria falar em quantidade inválida")
})

// ------------------------------------------------------------
// (5b) GUARDA extra: saída maior que o estoque disponível é bloqueada.
//     Produto id 10 tem estoque 3 → saída de 10 deve ser recusada.
// ------------------------------------------------------------
test("estoqueMovSalvar: saída maior que o estoque disponível não grava", async function () {
  const { window, doc, registro } = await prepararComProdutos()

  window.eval("estoqueMovForm(10)")
  doc.getElementById("estTipo").value = "saida"
  doc.getElementById("estQtd").value = "10"

  await window.eval("estoqueMovSalvar(10)")
  await esperarAssentar(window)

  assert.strictEqual(
    (registro.insert.movimentacoes || []).length,
    0,
    "saída acima do estoque não deveria gravar",
  )
  assert.match(
    doc.getElementById("toast").textContent,
    /insuficiente/i,
    "toast deveria avisar estoque insuficiente",
  )
})

// ============================================================
// FINANCEIRO
// ============================================================

// ------------------------------------------------------------
// (6) txForm abre o modal com os campos esperados (ids do canônico: txfTipo,
//     txfValor, txfDesc, txfForma).
// ------------------------------------------------------------
test("txForm: abre modal com tipo/valor/descrição/forma", async function () {
  const { window, doc } = await prepararComProdutos()

  window.eval("txForm()")

  const selTipo = doc.getElementById("txfTipo")
  const inpValor = doc.getElementById("txfValor")
  const inpDesc = doc.getElementById("txfDesc")
  const selForma = doc.getElementById("txfForma")

  assert.ok(selTipo, "faltou o <select id='txfTipo'>")
  assert.ok(inpValor, "faltou o <input id='txfValor'>")
  assert.ok(inpDesc, "faltou o <input id='txfDesc'>")
  assert.ok(selForma, "faltou o <select id='txfForma'>")

  const valoresTipo = [...selTipo.options].map((o) => o.value)
  assert.deepStrictEqual(valoresTipo, ["entrada", "saida"])

  // O botão de salvar chama txSalvar().
  assert.ok(doc.getElementById("txfSaveBtn"), "faltou o botão de salvar")
  assert.match(doc.getElementById("modal").innerHTML, /txSalvar\(\)/)
})

// ------------------------------------------------------------
// (7) txSalvar ENTRADA com valor 50 → insert em 'transacoes' tipo entrada
//     valor 50. (O input é type=number: usamos "50.00" — a vírgula "50,00" é
//     sanitizada para "" tanto no jsdom quanto no navegador; ver caso 9.)
// ------------------------------------------------------------
test("txSalvar: entrada de 50,00 insere transação 'entrada' com valor 50", async function () {
  const { window, doc, registro } = await prepararComProdutos()
  // Abre a página primeiro: txSalvar re-renderiza o financeiro no fim (precisa
  // dos contêineres #txStats/#txList). Re-semeia o CACHE que a página zerou.
  await window.eval("pageFinanceiro()")
  await esperarAssentar(window)
  semearCache(window)

  window.eval("txForm()")
  doc.getElementById("txfTipo").value = "entrada"
  doc.getElementById("txfValor").value = "50.00"
  doc.getElementById("txfDesc").value = "venda balcão"
  // Escolhe uma forma de pagamento se houver opção real.
  const selForma = doc.getElementById("txfForma")
  if (selForma.options.length > 1) selForma.selectedIndex = 1

  await window.eval("txSalvar()")
  await esperarAssentar(window)

  const inseridas = registro.insert.transacoes || []
  assert.strictEqual(inseridas.length, 1, "deveria inserir 1 transação")
  const tx = inseridas[0]
  assert.strictEqual(tx.tipo, "entrada")
  assert.strictEqual(tx.valor, 50)
  assert.strictEqual(tx.descricao, "venda balcão")
  assert.strictEqual(tx.funcionario_id, 1, "usa SESSAO.id como funcionário")
})

// ------------------------------------------------------------
// (8) txSalvar SAÍDA → tipo 'saida'.
// ------------------------------------------------------------
test("txSalvar: saída insere transação 'saida'", async function () {
  const { window, doc, registro } = await prepararComProdutos()
  await window.eval("pageFinanceiro()")
  await esperarAssentar(window)
  semearCache(window)

  window.eval("txForm()")
  doc.getElementById("txfTipo").value = "saida"
  doc.getElementById("txfValor").value = "30.50"
  doc.getElementById("txfDesc").value = "pagamento aluguel"

  await window.eval("txSalvar()")
  await esperarAssentar(window)

  const inseridas = registro.insert.transacoes || []
  assert.strictEqual(inseridas.length, 1)
  assert.strictEqual(inseridas[0].tipo, "saida")
  assert.strictEqual(inseridas[0].valor, 30.5)
})

// ------------------------------------------------------------
// (9) GUARDA: txSalvar sem valor válido não grava (validação real:
//     !valor || !descricao). Testamos dois casos:
//       - valor com vírgula "50,00" → input number sanitiza para "" → NaN
//       - sem descrição
// ------------------------------------------------------------
test("txSalvar: sem valor válido / sem descrição não grava", async function () {
  const { window, doc, registro } = await prepararComProdutos()

  // Caso A: valor com vírgula (sanitizado para "" pelo input number) + descrição.
  window.eval("txForm()")
  doc.getElementById("txfValor").value = "50,00"
  doc.getElementById("txfDesc").value = "com virgula"
  assert.strictEqual(
    doc.getElementById("txfValor").value,
    "",
    "input number deveria rejeitar a vírgula (comportamento real)",
  )
  await window.eval("txSalvar()")
  await esperarAssentar(window)

  assert.strictEqual(
    (registro.insert.transacoes || []).length,
    0,
    "valor inválido não deveria gravar",
  )
  assert.match(doc.getElementById("toast").className, /err/)

  // Caso B: valor válido, mas sem descrição.
  window.eval("txForm()")
  doc.getElementById("txfValor").value = "40.00"
  doc.getElementById("txfDesc").value = ""
  await window.eval("txSalvar()")
  await esperarAssentar(window)

  assert.strictEqual(
    (registro.insert.transacoes || []).length,
    0,
    "sem descrição não deveria gravar",
  )
  assert.match(
    doc.getElementById("toast").textContent,
    /obrigatóri/i,
    "toast deveria dizer que valor e descrição são obrigatórios",
  )
})

// ------------------------------------------------------------
// (10) renderFinanceiro exibe entradas/saídas/saldo a partir de
//      CACHE.transacoes. A página zera o CACHE ao abrir; re-semeamos as
//      transações DEPOIS e renderizamos. Saldo = entradas - saídas.
//      100,00 (entrada) - 40,00 (saída) = 60,00.
// ------------------------------------------------------------
test("renderFinanceiro: totaliza entradas, saídas e saldo a partir de CACHE.transacoes", async function () {
  const { window, doc } = await prepararComProdutos()

  await window.eval("pageFinanceiro()")
  await esperarAssentar(window)

  // pageFinanceiro zerou o CACHE: re-semeia e injeta transações.
  semearCache(window)
  window.eval(
    "CACHE.transacoes = [" +
      "{ id: 1, tipo: 'entrada', valor: 100, descricao: 'venda', forma_pagamento: 'Dinheiro', criado_em: '2026-07-30T10:00:00Z', funcionario_id: 1 }," +
      "{ id: 2, tipo: 'saida', valor: 40, descricao: 'aluguel', forma_pagamento: 'Dinheiro', criado_em: '2026-07-30T11:00:00Z', funcionario_id: 1 }" +
      "];" +
      "CACHE.funcionarios = CACHE.funcionarios || [];",
  )
  window.eval("renderFinanceiro()")

  const stats = doc.getElementById("txStats").innerHTML
  // Rótulos e valores formatados por fmt() → "R$ 100,00" etc.
  assert.match(stats, /Entradas/)
  assert.match(stats, /R\$ 100,00/, "total de entradas deveria ser R$ 100,00")
  assert.match(stats, /Saídas/)
  assert.match(stats, /R\$ 40,00/, "total de saídas deveria ser R$ 40,00")
  assert.match(stats, /Saldo/)
  assert.match(stats, /R\$ 60,00/, "saldo deveria ser R$ 60,00 (100 - 40)")

  // A lista mostra as duas transações.
  const lista = doc.getElementById("txList")
  assert.match(lista.innerHTML, /venda/)
  assert.match(lista.innerHTML, /aluguel/)
  assert.strictEqual(
    lista.querySelectorAll("tbody tr").length,
    2,
    "deveria listar as 2 transações",
  )
})
