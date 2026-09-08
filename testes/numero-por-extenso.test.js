// ============================================================
// numero-por-extenso.test.js — testes de UNIDADE para as funções puras
// numeroDeDiasPorExtenso e montarLinhaDeGarantia do <script> real do
// index.html. Ambas convertem um número de dias de garantia para texto
// por extenso em português do Brasil.
//
// Estas funções JÁ eram exercitadas de forma INDIRETA (via renderização
// da linha de garantia em garantia-documentos.test.js), mas nunca como
// unidade — vários ramos ("cem", "cento e ...", "mil", singular "dia",
// faixa fora de 1..9999) ficavam sem asserção direta. Este arquivo cobre
// esses ramos chamando as funções diretamente por window.eval, no mesmo
// estilo de helpers-puros.test.js.
//
// Rode com:
//   node --test numero-por-extenso.test.js
// ============================================================

const { test } = require("node:test")
const assert = require("node:assert")
const { montarAmbiente } = require("./ambiente")

// Avalia uma expressão no escopo léxico global do app (onde vivem as funções
// internas do <script> inline), trazendo o valor de volta ao lado do Node.
function avaliar(window, expressao) {
  return window.eval("(" + expressao + ")")
}

// ---------------------------------------------------------------------------
// numeroDeDiasPorExtenso — cláusulas de guarda da faixa útil (1 a 9999).
// Fora dessa faixa devolve "" (quem chama simplesmente omite o por extenso).
// ---------------------------------------------------------------------------
test("numeroDeDiasPorExtenso devolve vazio para zero (abaixo da faixa)", async function numeroZeroVazio() {
  const { window } = await montarAmbiente()
  assert.strictEqual(avaliar(window, "numeroDeDiasPorExtenso(0)"), "")
})

test("numeroDeDiasPorExtenso devolve vazio para número negativo", async function numeroNegativoVazio() {
  const { window } = await montarAmbiente()
  assert.strictEqual(avaliar(window, "numeroDeDiasPorExtenso(-5)"), "")
})

test("numeroDeDiasPorExtenso devolve vazio acima de nove mil novecentos e noventa e nove", async function numeroAcimaDaFaixaVazio() {
  const { window } = await montarAmbiente()
  assert.strictEqual(avaliar(window, "numeroDeDiasPorExtenso(10000)"), "")
})

test("numeroDeDiasPorExtenso trunca a parte fracionária antes de converter", async function numeroFracionarioTruncado() {
  const { window } = await montarAmbiente()
  // Math.floor(1.9) === 1 -> "um"
  assert.strictEqual(avaliar(window, "numeroDeDiasPorExtenso(1.9)"), "um")
})

// ---------------------------------------------------------------------------
// numeroDeDiasPorExtenso — unidades e a faixa dos "teens" (1 a 19), que usam
// a tabela de unidades diretamente (sem dezena separada).
// ---------------------------------------------------------------------------
test("numeroDeDiasPorExtenso escreve a unidade um", async function unidadeUm() {
  const { window } = await montarAmbiente()
  assert.strictEqual(avaliar(window, "numeroDeDiasPorExtenso(1)"), "um")
})

test("numeroDeDiasPorExtenso escreve quinze (faixa dos teens)", async function teensQuinze() {
  const { window } = await montarAmbiente()
  assert.strictEqual(avaliar(window, "numeroDeDiasPorExtenso(15)"), "quinze")
})

test("numeroDeDiasPorExtenso escreve dezenove (limite superior dos teens)", async function teensDezenove() {
  const { window } = await montarAmbiente()
  assert.strictEqual(avaliar(window, "numeroDeDiasPorExtenso(19)"), "dezenove")
})

// ---------------------------------------------------------------------------
// numeroDeDiasPorExtenso — dezenas exatas (unidade 0) e dezena com unidade
// (usa o conector " e ").
// ---------------------------------------------------------------------------
test("numeroDeDiasPorExtenso escreve dezena exata vinte (sem unidade)", async function dezenaExataVinte() {
  const { window } = await montarAmbiente()
  assert.strictEqual(avaliar(window, "numeroDeDiasPorExtenso(20)"), "vinte")
})

test("numeroDeDiasPorExtenso escreve noventa (dezena exata alta)", async function dezenaExataNoventa() {
  const { window } = await montarAmbiente()
  assert.strictEqual(avaliar(window, "numeroDeDiasPorExtenso(90)"), "noventa")
})

test("numeroDeDiasPorExtenso liga dezena e unidade com 'e'", async function dezenaComUnidade() {
  const { window } = await montarAmbiente()
  assert.strictEqual(
    avaliar(window, "numeroDeDiasPorExtenso(45)"),
    "quarenta e cinco",
  )
})

// ---------------------------------------------------------------------------
// numeroDeDiasPorExtenso — centenas: "cem" (caso especial do 100 exato),
// "cento e ..." (101..199), centena exata e centena com resto.
// ---------------------------------------------------------------------------
test("numeroDeDiasPorExtenso trata cem exato como caso especial", async function centenaCemExato() {
  const { window } = await montarAmbiente()
  assert.strictEqual(avaliar(window, "numeroDeDiasPorExtenso(100)"), "cem")
})

test("numeroDeDiasPorExtenso usa 'cento e' para 101", async function centenaCentoEUm() {
  const { window } = await montarAmbiente()
  assert.strictEqual(avaliar(window, "numeroDeDiasPorExtenso(101)"), "cento e um")
})

test("numeroDeDiasPorExtenso escreve centena exata duzentos", async function centenaExataDuzentos() {
  const { window } = await montarAmbiente()
  assert.strictEqual(avaliar(window, "numeroDeDiasPorExtenso(200)"), "duzentos")
})

test("numeroDeDiasPorExtenso compõe centena, dezena e unidade (365)", async function centenaComRestoCompleto() {
  const { window } = await montarAmbiente()
  assert.strictEqual(
    avaliar(window, "numeroDeDiasPorExtenso(365)"),
    "trezentos e sessenta e cinco",
  )
})

test("numeroDeDiasPorExtenso escreve o maior valor da faixa (9999)", async function limiteSuperiorDaFaixa() {
  const { window } = await montarAmbiente()
  assert.strictEqual(
    avaliar(window, "numeroDeDiasPorExtenso(9999)"),
    "nove mil e novecentos e noventa e nove",
  )
})

// ---------------------------------------------------------------------------
// numeroDeDiasPorExtenso — milhares: "mil" (milhar exato = 1), "mil e ..."
// (resto do milhar), e "N mil" (milhar maior que 1).
// ---------------------------------------------------------------------------
test("numeroDeDiasPorExtenso escreve mil exato como 'mil'", async function milExato() {
  const { window } = await montarAmbiente()
  assert.strictEqual(avaliar(window, "numeroDeDiasPorExtenso(1000)"), "mil")
})

test("numeroDeDiasPorExtenso liga mil ao resto com 'e' (1001)", async function milComResto() {
  const { window } = await montarAmbiente()
  assert.strictEqual(avaliar(window, "numeroDeDiasPorExtenso(1001)"), "mil e um")
})

test("numeroDeDiasPorExtenso escreve milhar maior que um como 'dois mil'", async function milharMaiorQueUm() {
  const { window } = await montarAmbiente()
  assert.strictEqual(avaliar(window, "numeroDeDiasPorExtenso(2000)"), "dois mil")
})

test("numeroDeDiasPorExtenso compõe milhar e resto (2024)", async function milharComRestoCompleto() {
  const { window } = await montarAmbiente()
  assert.strictEqual(
    avaliar(window, "numeroDeDiasPorExtenso(2024)"),
    "dois mil e vinte e quatro",
  )
})

// ---------------------------------------------------------------------------
// montarLinhaDeGarantia — monta a frase final. Cláusula de guarda (0 -> "");
// singular "dia" para exatamente 1; plural "dias"; e o caso em que o por
// extenso vem vazio (fora da faixa) — a frase sai SEM o parêntese.
// ---------------------------------------------------------------------------
test("montarLinhaDeGarantia devolve vazio quando a garantia é zero", async function garantiaZeroVazia() {
  const { window } = await montarAmbiente()
  assert.strictEqual(avaliar(window, "montarLinhaDeGarantia(0)"), "")
})

test("montarLinhaDeGarantia usa o singular 'dia' para exatamente um dia", async function garantiaUmDiaSingular() {
  const { window } = await montarAmbiente()
  assert.strictEqual(
    avaliar(window, "montarLinhaDeGarantia(1)"),
    "Garantia: 1 dia (um dia)",
  )
})

test("montarLinhaDeGarantia usa o plural 'dias' e o por extenso (90)", async function garantiaNoventaDias() {
  const { window } = await montarAmbiente()
  assert.strictEqual(
    avaliar(window, "montarLinhaDeGarantia(90)"),
    "Garantia: 90 dias (noventa dias)",
  )
})

test("montarLinhaDeGarantia omite o parêntese quando o por extenso é vazio (fora da faixa)", async function garantiaForaDaFaixaSemParentese() {
  const { window } = await montarAmbiente()
  // 15000 está fora de 1..9999, então numeroDeDiasPorExtenso devolve "" e a
  // frase sai apenas com o número em algarismos, sem o "(...)".
  assert.strictEqual(
    avaliar(window, "montarLinhaDeGarantia(15000)"),
    "Garantia: 15000 dias",
  )
})

test("montarLinhaDeGarantia trunca a parte fracionária dos dias", async function garantiaFracionariaTruncada() {
  const { window } = await montarAmbiente()
  // Math.floor(90.7) === 90
  assert.strictEqual(
    avaliar(window, "montarLinhaDeGarantia(90.7)"),
    "Garantia: 90 dias (noventa dias)",
  )
})
