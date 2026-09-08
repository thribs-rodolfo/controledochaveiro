// ============================================================
// categorias-tipo.test.js — categorias EDITAVEIS de receita e despesa
// (paridade com a versao de computador). Antes, a tabela 'categorias' era so
// de produto e as de receita/despesa eram constantes fixas no codigo. Agora:
//   (a) as categorias filtram por tipo (produto/receita/despesa);
//   (b) o CRUD grava/edita a categoria com o seu tipo;
//   (c) o lancamento financeiro usa as categorias do banco do tipo certo, e
//       cai no FALLBACK das constantes quando o banco nao tem nenhuma daquele
//       tipo (banco antigo, nao migrado);
//   (d) a versao do schema esta consistente entre index.html e os SQLs (esse
//       ponto tem seu proprio arquivo versao-schema.test.js; aqui so reforcamos
//       a 2026082703 no index x criar-banco).
// ============================================================

const { test } = require("node:test")
const assert = require("node:assert")
const fs = require("node:fs")
const path = require("node:path")
const {
  montarAmbiente,
  semearCache,
  esperarAssentar,
} = require("./ambiente")

function ultimo(lista) {
  return lista && lista.length ? lista[lista.length - 1] : null
}

// Semeia CACHE.categorias com as tres secoes (produto/receita/despesa).
function semearCategorias(window) {
  window.eval(
    "CACHE.categorias = [" +
      "  { id: 1, nome: 'Tetra', tipo: 'produto', ativo: true }," +
      "  { id: 2, nome: 'Yale', tipo: 'produto', ativo: true }," +
      "  { id: 3, nome: 'Serviços', tipo: 'receita', ativo: true }," +
      "  { id: 4, nome: 'Venda de produtos', tipo: 'receita', ativo: true }," +
      "  { id: 5, nome: 'Aluguel', tipo: 'despesa', ativo: true }," +
      "  { id: 6, nome: 'Energia / Água', tipo: 'despesa', ativo: true }" +
      "];",
  )
}

async function preparar() {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  semearCache(window)
  return {
    window: window,
    doc: window.document,
    registro: ambiente.clienteFake.__registro,
  }
}

// ------------------------------------------------------------
// (a) categoriasPorTipo filtra por tipo (e trata as antigas sem tipo como
// produto)
// ------------------------------------------------------------
test("categoriasPorTipo filtra por tipo; sem tipo conta como produto", async function () {
  const { window } = await preparar()
  semearCategorias(window)
  // Uma categoria antiga sem coluna 'tipo' deve entrar em 'produto'.
  window.eval(
    "CACHE.categorias.push({ id: 9, nome: 'Antiga', ativo: true });",
  )

  const produto = window.eval("categoriasPorTipo('produto').map(c=>c.nome)")
  const receita = window.eval("categoriasPorTipo('receita').map(c=>c.nome)")
  const despesa = window.eval("categoriasPorTipo('despesa').map(c=>c.nome)")

  assert.ok(produto.includes("Tetra") && produto.includes("Yale"))
  assert.ok(produto.includes("Antiga"), "categoria sem tipo cai em produto")
  assert.ok(!produto.includes("Serviços"), "receita nao aparece em produto")
  assert.strictEqual(
    JSON.stringify(receita.slice().sort()),
    JSON.stringify(["Serviços", "Venda de produtos"]),
  )
  assert.ok(despesa.includes("Aluguel") && despesa.includes("Energia / Água"))
})

// ------------------------------------------------------------
// (b) CRUD de categoria de receita/despesa grava o tipo certo
// ------------------------------------------------------------
test("catSalvar (nova receita) insere em 'categorias' com tipo 'receita'", async function () {
  const { window, doc, registro } = await preparar()
  semearCategorias(window)
  window.eval("catForm(null, 'receita')")
  await esperarAssentar(window)

  doc.getElementById("catNome").value = "Comissões"
  await window.eval("catSalvar(0, 'receita')")
  await esperarAssentar(window)

  const dados = ultimo(registro.insert.categorias)
  assert.ok(dados, "deveria inserir a categoria")
  assert.strictEqual(dados.nome, "Comissões")
  assert.strictEqual(dados.tipo, "receita")
})

test("catForm de despesa mostra 'Categoria de Despesa' no titulo", async function () {
  const { window, doc } = await preparar()
  semearCategorias(window)
  window.eval("catForm(null, 'despesa')")
  await esperarAssentar(window)
  const titulo = doc.querySelector("#modal .modal-h h3").textContent
  assert.ok(/Despesa/.test(titulo), "titulo do modal indica Despesa: " + titulo)
})

test("catSalvar (edicao) atualiza mantendo o tipo despesa", async function () {
  const { window, doc, registro } = await preparar()
  semearCategorias(window)
  // Edita a categoria de despesa id 5 (Aluguel).
  window.eval(
    "catForm({ id: 5, nome: 'Aluguel', tipo: 'despesa', ativo: true }, 'despesa')",
  )
  await esperarAssentar(window)
  doc.getElementById("catNome").value = "Aluguel da loja"
  await window.eval("catSalvar(5, 'despesa')")
  await esperarAssentar(window)

  const dados = ultimo(registro.update.categorias)
  assert.ok(dados, "deveria atualizar a categoria")
  assert.strictEqual(dados.nome, "Aluguel da loja")
  assert.strictEqual(dados.tipo, "despesa", "edicao preserva o tipo")
})

test("catCriarRapido (do cadastro de produto) insere sempre como produto", async function () {
  const { window, registro } = await preparar()
  semearCategorias(window)
  window.__promptRespostas = ["Chaveiro Automotivo"]
  await window.eval("catCriarRapido()")
  await esperarAssentar(window)
  const dados = ultimo(registro.insert.categorias)
  assert.ok(dados, "deveria inserir a categoria rapida")
  assert.strictEqual(dados.tipo, "produto")
})

// ------------------------------------------------------------
// (c) lancamento financeiro usa as categorias do banco; cai no fallback quando
// o banco nao tem nenhuma daquele tipo
// ------------------------------------------------------------
test("txCategoriasDatalist usa as categorias de RECEITA do banco (entrada)", async function () {
  const { window } = await preparar()
  semearCategorias(window)
  window.eval("CACHE.transacoes = [];")
  const html = window.eval("txCategoriasDatalist('entrada')")
  assert.ok(html.includes("Serviços"), "deve listar categoria de receita do banco")
  assert.ok(
    html.includes("Venda de produtos"),
    "deve listar a outra receita do banco",
  )
  assert.ok(!html.includes("Aluguel"), "nao deve misturar despesa na entrada")
})

test("txCategoriasDatalist usa as categorias de DESPESA do banco (saida)", async function () {
  const { window } = await preparar()
  semearCategorias(window)
  window.eval("CACHE.transacoes = [];")
  const html = window.eval("txCategoriasDatalist('saida')")
  assert.ok(html.includes("Aluguel"), "deve listar categoria de despesa do banco")
  assert.ok(!html.includes("Serviços"), "nao deve misturar receita na saida")
})

test("txCategoriasDatalist cai no FALLBACK das constantes quando o banco nao tem o tipo", async function () {
  const { window } = await preparar()
  // Banco antigo: SO categorias de produto, nenhuma de receita/despesa.
  window.eval(
    "CACHE.categorias = [{ id: 1, nome: 'Tetra', tipo: 'produto', ativo: true }];" +
      "CACHE.transacoes = [];",
  )
  const receita = window.eval("txCategoriasDatalist('entrada')")
  const despesa = window.eval("txCategoriasDatalist('saida')")
  // Constantes fixas (CATEGORIAS_RECEITA / CATEGORIAS_DESPESA).
  assert.ok(receita.includes("Serviços"), "fallback traz a receita fixa 'Serviços'")
  assert.ok(
    despesa.includes("Compras / Estoque"),
    "fallback traz a despesa fixa 'Compras / Estoque'",
  )
})

// ------------------------------------------------------------
// (d) versao 2026082703 consistente index x criar-banco (reforco)
// ------------------------------------------------------------
test("versao 2026082703 consistente entre index.html e criar-banco.sql", function () {
  const raiz = path.join(__dirname, "..")
  const html = fs.readFileSync(path.join(raiz, "index.html"), "utf8")
  const criar = fs.readFileSync(path.join(raiz, "criar-banco.sql"), "utf8")
  const noIndex = html.match(/const\s+SCHEMA_VERSION_EXIGIDA\s*=\s*(\d+)/)
  const noSql = criar.match(/'schema_version'\s*,\s*'(\d+)'/)
  assert.ok(noIndex && noSql)
  assert.strictEqual(noIndex[1], "2026082703")
  assert.strictEqual(noSql[1], "2026082703")
})

// ------------------------------------------------------------
// (extra) o SQL adiciona a coluna 'tipo' e semeia receita/despesa idempotente
// ------------------------------------------------------------
test("SQL: criar/atualizar-banco definem a coluna 'tipo' e semeiam receita/despesa", function () {
  const raiz = path.join(__dirname, "..")
  const criar = fs.readFileSync(path.join(raiz, "criar-banco.sql"), "utf8")
  const atualizar = fs.readFileSync(path.join(raiz, "atualizar-banco.sql"), "utf8")
  // criar-banco: coluna na definicao da tabela
  assert.ok(
    /tipo\s+text\s+not\s+null\s+default\s+'produto'/.test(criar),
    "criar-banco define categorias.tipo default produto",
  )
  // atualizar-banco: add column if not exists (idempotente)
  assert.ok(
    atualizar
      .toLowerCase()
      .includes("alter table categorias add column if not exists tipo"),
    "atualizar-banco tem add column if not exists tipo",
  )
  // seed idempotente (where not exists) para receita e despesa, nos dois SQLs
  for (const sql of [criar, atualizar]) {
    assert.ok(
      /where not exists \(select 1 from categorias where tipo = 'receita'\)/.test(
        sql,
      ),
      "seed de receita idempotente (where not exists)",
    )
    assert.ok(
      /where not exists \(select 1 from categorias where tipo = 'despesa'\)/.test(
        sql,
      ),
      "seed de despesa idempotente (where not exists)",
    )
  }
})
