// ============================================================
// versao-schema.test.js — a versão do schema tem que estar CONSISTENTE nos
// quatro lugares do online: index.html (SCHEMA_VERSION_EXIGIDA), criar-banco.sql
// (insert do schema_version) e atualizar-banco.sql (comentário histórico + o
// insert final). Se alguém subir o banco e esquecer de um lugar, o app pede
// atualização eternamente (ou nunca) — este teste barra isso.
// ============================================================

const { test } = require("node:test")
const assert = require("node:assert")
const fs = require("node:fs")
const path = require("node:path")

const RAIZ = path.join(__dirname, "..")
const VERSAO_ESPERADA = "2026082703"

function lerArquivo(nome) {
  return fs.readFileSync(path.join(RAIZ, nome), "utf8")
}

test("index.html define SCHEMA_VERSION_EXIGIDA na versão esperada", function () {
  const html = lerArquivo("index.html")
  const casou = html.match(/const\s+SCHEMA_VERSION_EXIGIDA\s*=\s*(\d+)/)
  assert.ok(casou, "não achei SCHEMA_VERSION_EXIGIDA no index.html")
  assert.strictEqual(
    casou[1],
    VERSAO_ESPERADA,
    "SCHEMA_VERSION_EXIGIDA precisa ser " + VERSAO_ESPERADA,
  )
})

test("criar-banco.sql semeia schema_version na versão esperada", function () {
  const sql = lerArquivo("criar-banco.sql")
  const casou = sql.match(/'schema_version'\s*,\s*'(\d+)'/)
  assert.ok(casou, "não achei o schema_version no criar-banco.sql")
  assert.strictEqual(casou[1], VERSAO_ESPERADA)
})

test("atualizar-banco.sql grava schema_version na versão esperada (último insert)", function () {
  const sql = lerArquivo("atualizar-banco.sql")
  const todos = [...sql.matchAll(/'schema_version'\s*,\s*'(\d+)'/g)]
  assert.ok(todos.length > 0, "não achei schema_version no atualizar-banco.sql")
  const ultimo = todos[todos.length - 1][1]
  assert.strictEqual(
    ultimo,
    VERSAO_ESPERADA,
    "o último insert de schema_version precisa ser " + VERSAO_ESPERADA,
  )
})

test("os_salvar (SQL) grava as colunas estruturadas do veículo e a garantia por-OS", function () {
  const criar = lerArquivo("criar-banco.sql")
  const atualizar = lerArquivo("atualizar-banco.sql")
  const colunas = ["placa", "marca", "modelo", "ano", "chassi", "senha_veiculo", "garantia_dias"]
  for (const arquivo of [criar, atualizar]) {
    for (const coluna of colunas) {
      assert.ok(
        arquivo.includes("p_dados->>'" + coluna + "'"),
        "os_salvar precisa ler p_dados->>'" + coluna + "'",
      )
    }
  }
})

test("as colunas do veículo existem na definição/migração de servicos", function () {
  const criar = lerArquivo("criar-banco.sql")
  const atualizar = lerArquivo("atualizar-banco.sql")
  // atualizar-banco: add column if not exists (idempotente)
  const idempotentes = [
    "alter table servicos add column if not exists placa text",
    "alter table servicos add column if not exists garantia_dias integer",
  ]
  for (const trecho of idempotentes) {
    assert.ok(
      atualizar.toLowerCase().includes(trecho),
      "atualizar-banco.sql precisa ter: " + trecho,
    )
  }
  // criar-banco: colunas na definição da tabela
  assert.ok(criar.includes("senha_veiculo text"), "criar-banco define senha_veiculo")
  assert.ok(criar.includes("garantia_dias integer"), "criar-banco define garantia_dias")
})
