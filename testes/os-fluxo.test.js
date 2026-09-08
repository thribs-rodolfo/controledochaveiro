// ============================================================
// os-fluxo.test.js — fluxo de Ordem de Serviço (OS) do controle-chaveiro
//
// Roda o <script> inline do index.html DE VERDADE num DOM jsdom, com o
// Supabase dublado que REGISTRA as escritas (insert/update) por tabela em
// clienteFake.__registro. Assim afirmamos EXATAMENTE o que foi (ou não foi)
// gravado em 'servicos', 'transacoes', 'chaves', 'movimentacoes' e
// 'os_historico'.
//
// Funções cobertas (grep no index): osForm, osRecalc, osItemAdd, renderOsItens,
// osItemFiltrar, osItemPick, osDescontoValor, osSalvar, registrarHistoricoOS,
// osDocTexto, osQRConteudo (e, de raspão, renderOsFotos via osForm).
//
// DESCONTO (bug corrigido): o campo de desconto tem id proprio "osDesconto",
// separado da <textarea> de Descricao ("osDesc"). Antes os dois dividiam o id
// "osDesc"; o getElementById devolvia a descricao, entao osDescontoValor lia o
// TEXTO da descricao (parseFloat => NaN => 0) e o desconto nunca entrava no
// total. Agora osDescontoValor() le o campo real "osDesconto".
// ============================================================

const { test } = require("node:test")
const assert = require("node:assert")
const {
  montarAmbiente,
  semearCache,
  semearProdutos,
  esperarAssentar,
} = require("./ambiente")

// ------------------------------------------------------------
// Helpers de preparação
// ------------------------------------------------------------

// Monta o app já semeado (cache + produtos) e abre o formulário de OS.
// Sequência: pageServicos() -> carregarServicos/Chaves ZERAM o CACHE ->
// RE-SEMEIA cache e produtos -> osForm() abre o modal com os campos.
async function abrirFormularioOS() {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  // Renderiza a página (isto dispara carregar* que zeram o CACHE)
  window.eval("pageServicos()")
  await esperarAssentar(window)
  // RE-SEMEIA depois de pageServicos (senão CACHE.chaves/clientes/etc vêm vazios)
  semearCache(window)
  semearProdutos(window)
  // Abre o modal do formulário de OS (cria osTitulo, osMaoObra, osDesc, etc.)
  window.eval("osForm()")
  await esperarAssentar(window)
  return {
    window: window,
    doc: window.document,
    registro: ambiente.clienteFake.__registro,
  }
}

// Ajusta o valor de um campo do formulário pelo id (via DOM, direto).
function definirCampo(doc, id, valor) {
  const el = doc.getElementById(id)
  if (!el) throw new Error("Campo não encontrado no formulário de OS: " + id)
  el.value = valor
  return el
}

// O campo de desconto agora tem id proprio "osDesconto" (separado da <textarea>
// de Descricao "osDesc"). osDescontoValor() le o osDesconto.
function campoDescontoReal(doc) {
  return doc.getElementById("osDesconto")
}

// ------------------------------------------------------------
// CASO 1: sem título → toast de erro e NÃO grava em 'servicos'
// ------------------------------------------------------------
test("osSalvar sem título não grava em servicos e emite erro", async function () {
  const { window, doc, registro } = await abrirFormularioOS()

  // título vazio (é o default do form, mas garantimos)
  definirCampo(doc, "osTitulo", "   ")

  await window.eval("osSalvar()")
  await esperarAssentar(window)

  const inseridosServicos = registro.insert.servicos || []
  assert.strictEqual(
    inseridosServicos.length,
    0,
    "não deve inserir nada em servicos quando o título está vazio",
  )
})

// ------------------------------------------------------------
// CASO 2: título + mão de obra "100,00", status aberto/pendente
//         → grava em servicos com total=100 e desconto=0
// ------------------------------------------------------------
test("osSalvar grava servicos com total=100 e desconto=0", async function () {
  const { window, doc, registro } = await abrirFormularioOS()

  definirCampo(doc, "osTitulo", "Cópia de chave")
  definirCampo(doc, "osMaoObra", "100,00")
  definirCampo(doc, "osStatus", "orcamento") // "aberto" = orçamento (não conclui)
  definirCampo(doc, "osStatusPag", "pendente")
  // sem valor pago
  definirCampo(doc, "osValorPago", "")

  await window.eval("osSalvar()")
  await esperarAssentar(window)

  const inseridos = registro.insert.servicos || []
  assert.strictEqual(inseridos.length, 1, "deve inserir 1 serviço")
  const payload = inseridos[0]
  assert.strictEqual(payload.titulo, "Cópia de chave")
  assert.strictEqual(payload.mao_de_obra, 100, "mão de obra parseada = 100")
  assert.strictEqual(payload.total, 100, "total = subtotal (100) - desconto (0)")
  assert.strictEqual(payload.desconto, 0, "sem desconto")
  assert.strictEqual(payload.status, "orcamento")
  assert.strictEqual(
    payload.status_pagamento,
    "pendente",
    "sem pagamento, segue pendente",
  )
})

// ------------------------------------------------------------
// CASO 3: com desconto → total = subtotal - desconto no payload
// osDescontoValor lê $("osDesconto") e $("osDescTipo").
// Tipo 'reais' (default do <select>): desconto = valor absoluto.
// ------------------------------------------------------------
test("osSalvar aplica desconto em reais: total = subtotal - desconto", async function () {
  const { window, doc, registro } = await abrirFormularioOS()

  definirCampo(doc, "osTitulo", "Serviço com desconto")
  definirCampo(doc, "osMaoObra", "100,00") // subtotal = 100
  // Escreve o desconto no campo real de desconto (osDesconto).
  campoDescontoReal(doc).value = "30"
  // osDescTipo default é "reais"
  definirCampo(doc, "osStatus", "orcamento")

  // sanidade: osRecalc deve mostrar 70 no display #osTotal
  window.eval("osRecalc()")
  assert.match(
    doc.getElementById("osTotal").value,
    /70/,
    "display do total deve refletir 100 - 30 = 70",
  )

  await window.eval("osSalvar()")
  await esperarAssentar(window)

  const payload = (registro.insert.servicos || [])[0]
  assert.ok(payload, "deve gravar o serviço")
  assert.strictEqual(payload.desconto, 30, "desconto de R$ 30")
  assert.strictEqual(payload.total, 70, "total = 100 - 30")
})

// ------------------------------------------------------------
// REGRESSÃO (id duplicado osDesc): com a Descrição preenchida com TEXTO e o
// desconto de 10% no campo próprio, o desconto TEM que entrar no total. Antes
// osDescontoValor lia a descrição (texto) → 0 → total sem desconto (exatamente
// o print do Thiago: mão de obra 200 + 10% mostrava 200 em vez de 180).
// ------------------------------------------------------------
test("desconto % aplica no total mesmo com Descrição preenchida (regressão id duplicado)", async function () {
  const { window, doc } = await abrirFormularioOS()

  definirCampo(doc, "osTitulo", "Abertura de veículo")
  definirCampo(doc, "osDesc", "Abertura de porta automotiva") // Descrição com texto
  definirCampo(doc, "osMaoObra", "200,00") // subtotal = 200
  campoDescontoReal(doc).value = "10" // campo próprio de desconto
  definirCampo(doc, "osDescTipo", "pct") // 10%

  window.eval("osRecalc()")
  assert.match(
    doc.getElementById("osTotal").value,
    /180/,
    "200 − 10% = 180 (o desconto não pode ler a descrição)",
  )
})

// ------------------------------------------------------------
// CASO 4: valor pago >= total e statusPag 'pendente' → vira 'pago';
//         gera insert em transacoes (entrada) com valor = pago.
// ------------------------------------------------------------
test("osSalvar com pago >= total: statusPag vira 'pago' e lança transação de entrada", async function () {
  const { window, doc, registro } = await abrirFormularioOS()

  definirCampo(doc, "osTitulo", "OS paga na hora")
  definirCampo(doc, "osMaoObra", "100,00") // total = 100
  definirCampo(doc, "osStatus", "orcamento")
  definirCampo(doc, "osStatusPag", "pendente")
  definirCampo(doc, "osValorPago", "100,00") // pago = total

  await window.eval("osSalvar()")
  await esperarAssentar(window)

  const payload = (registro.insert.servicos || [])[0]
  assert.ok(payload, "deve gravar o serviço")
  assert.strictEqual(
    payload.status_pagamento,
    "pago",
    "pago >= total e estava pendente → vira 'pago'",
  )
  assert.strictEqual(payload.valor_pago, 100)

  const transacoes = registro.insert.transacoes || []
  assert.strictEqual(transacoes.length, 1, "deve lançar 1 transação")
  assert.strictEqual(transacoes[0].tipo, "entrada", "recebimento = entrada")
  assert.strictEqual(transacoes[0].valor, 100, "valor da transação = pago (100)")
})

// ------------------------------------------------------------
// CASO 5: status 'concluido' (OS nova) com item FÍSICO (chave_id 10, qtd 1)
//         → update em chaves (estoque) e insert em movimentacoes 'saida'.
// ------------------------------------------------------------
test("osSalvar concluída com item físico baixa estoque e movimenta saída", async function () {
  const { window, doc, registro } = await abrirFormularioOS()

  definirCampo(doc, "osTitulo", "OS concluída com peça física")
  definirCampo(doc, "osMaoObra", "50,00")
  definirCampo(doc, "osStatus", "concluido")

  // Adiciona um item físico (chave_id 10) via OS_ITENS + renderiza.
  window.eval(
    "OS_ITENS = [{ chave_id: 10, descricao: 'Chave Fisica', quantidade: 1, preco_unit: 10 }];" +
      "renderOsItens(); osRecalc();",
  )

  await window.eval("osSalvar()")
  await esperarAssentar(window)

  const payloadServico = (registro.insert.servicos || [])[0]
  assert.ok(payloadServico, "deve gravar o serviço")
  assert.strictEqual(payloadServico.status, "concluido")

  // Commit C: NÃO edita mais chaves.estoque no cliente. O estoque é derivado
  // pelo trigger a partir da movimentação (fonte única). Antes o app fazia um
  // chaves.update({estoque}) redundante; agora esse update NÃO deve existir.
  const updatesChaves = (registro.update.chaves || []).filter(function (u) {
    return u && Object.prototype.hasOwnProperty.call(u, "estoque")
  })
  assert.strictEqual(
    updatesChaves.length,
    0,
    "não deve mais editar chaves.estoque no cliente (fonte única = movimentação)",
  )

  // insert em movimentacoes 'saida' para a chave 10 (a fonte única do estoque)
  const movs = (registro.insert.movimentacoes || []).filter(
    (m) => m && m.chave_id == 10,
  )
  assert.strictEqual(movs.length, 1, "deve gerar 1 movimentação da chave 10")
  assert.strictEqual(movs[0].tipo, "saida")
  assert.strictEqual(movs[0].quantidade, 1)

  // O cache local reflete o valor derivado (3 − 1 = 2), espelhando o trigger.
  const estoqueCache = window.eval(
    "(CACHE.chaves.find(function(x){return x.id==10})||{}).estoque",
  )
  assert.strictEqual(estoqueCache, 2, "cache otimista: estoque da chave 10 = 2")
})

// ------------------------------------------------------------
// CASO 6: OS concluída SÓ com item de SERVIÇO não movimenta estoque.
// O loop de baixa do osSalvar pula `k.tipo_produto === 'servico'`, então um
// item de serviço (chave_id 20, tipo_produto 'servico') NÃO gera movimentação
// de saída nem update de estoque (serviço é mão de obra, sem estoque físico).
// ------------------------------------------------------------
test("OS concluída com item de SERVIÇO não movimenta estoque", async function () {
  const { window, doc, registro } = await abrirFormularioOS()

  definirCampo(doc, "osTitulo", "OS concluída só com serviço")
  definirCampo(doc, "osMaoObra", "0,00")
  definirCampo(doc, "osStatus", "concluido")

  // item de SERVIÇO: chave_id 20 (tipo_produto 'servico')
  window.eval(
    "OS_ITENS = [{ chave_id: 20, descricao: 'Abertura de Porta', quantidade: 1, preco_unit: 80 }];" +
      "renderOsItens(); osRecalc();",
  )

  await window.eval("osSalvar()")
  await esperarAssentar(window)

  const movsServico = (registro.insert.movimentacoes || []).filter(
    (m) => m && m.chave_id == 20,
  )
  const updatesChaves = (registro.update.chaves || []).length

  assert.strictEqual(
    movsServico.length,
    0,
    "serviço não deve movimentar estoque. Movimentou: " +
      JSON.stringify(movsServico),
  )
  assert.strictEqual(
    updatesChaves,
    0,
    "sem update de estoque para item de serviço",
  )
})

// ------------------------------------------------------------
// CASO 7: registrarHistoricoOS insere em os_historico
// ------------------------------------------------------------
test("registrarHistoricoOS insere em os_historico", async function () {
  const { window, registro } = await abrirFormularioOS()

  await window.eval("registrarHistoricoOS(999, 'OS criada', 'obs teste')")
  await esperarAssentar(window)

  const hist = registro.insert.os_historico || []
  assert.strictEqual(hist.length, 1, "deve inserir 1 linha de histórico")
  assert.strictEqual(hist[0].os_id, 999)
  assert.strictEqual(hist[0].acao, "OS criada")
  assert.strictEqual(hist[0].observacao, "obs teste")
  assert.strictEqual(
    hist[0].usuario,
    "Teste",
    "usa SESSAO.nome ('Teste') semeado",
  )
})

// ------------------------------------------------------------
// CASO 8: osRecalc atualiza o total exibido (#osTotal)
// subtotal = mão de obra + soma(qtd * preco_unit)
// ------------------------------------------------------------
test("osRecalc atualiza o display #osTotal com subtotal - desconto", async function () {
  const { window, doc } = await abrirFormularioOS()

  definirCampo(doc, "osMaoObra", "40,00")
  // item de 2 x R$ 30 = 60 → subtotal = 40 + 60 = 100
  window.eval(
    "OS_ITENS = [{ chave_id: 10, descricao: 'x', quantidade: 2, preco_unit: 30 }];",
  )
  // sem desconto
  campoDescontoReal(doc).value = "0"

  window.eval("osRecalc()")
  assert.match(
    doc.getElementById("osTotal").value,
    /100/,
    "total exibido = 40 (mão de obra) + 2*30 (itens) = 100",
  )
})

// ------------------------------------------------------------
// EXTRA: osDocTexto e osQRConteudo (funções puras de texto do doc/QR)
// ------------------------------------------------------------
test("osDocTexto monta orçamento e recibo; osQRConteudo monta o resumo", async function () {
  const { window } = await abrirFormularioOS()

  window.eval(
    "CACHE.servicos = [{ id: 5, titulo: 'Troca de segredo', cliente_id: 1," +
      " tipo: 'residencial', status: 'concluido', status_pagamento: 'pago'," +
      " total: 150, valor_pago: 150, mao_de_obra: 100, desconto: 0," +
      " forma_pagamento: 'Dinheiro', itens: [" +
      "  { descricao: 'Cilindro', quantidade: 1, preco_unit: 50, total: 50 }" +
      "] }];",
  )

  const orcamento = window.eval("osDocTexto(CACHE.servicos[0], 'orcamento')")
  assert.match(orcamento, /ORÇAMENTO — OS #5/, "cabeçalho de orçamento")
  assert.match(orcamento, /Troca de segredo/, "inclui o título do serviço")
  assert.match(orcamento, /Cilindro/, "lista os itens")

  const recibo = window.eval("osDocTexto(CACHE.servicos[0], 'recibo')")
  assert.match(recibo, /RECIBO — OS #5/, "cabeçalho de recibo")
  assert.match(recibo, /Pago:/, "recibo mostra valor pago")

  const qr = window.eval("osQRConteudo(CACHE.servicos[0])")
  assert.match(qr, /OS #5/, "resumo do QR menciona a OS")
  assert.match(qr, /Troca de segredo/, "resumo do QR menciona o título")
})

// ------------------------------------------------------------
// EXTRA: nome de loja grande NÃO corta a mensagem do orçamento.
// Um nome enorme era inserido inteiro e estourava o link/mensagem, cortando o
// resto. Agora nomeLojaCurto limita o nome sem cortar o conteúdo do orçamento.
// ------------------------------------------------------------
test("osDocTexto encurta nome de loja grande sem cortar o resto do orçamento", async function () {
  const { window } = await abrirFormularioOS()

  const nomeGrande =
    "Chaveiro Super Mega Ultra Rapido 24 Horas do Bairro Central e Regiao Metropolitana"
  window.eval("CACHE.config = { nome_empresa: " + JSON.stringify(nomeGrande) + " };")
  window.eval(
    "CACHE.servicos = [{ id: 7, titulo: 'Abertura de porta', cliente_id: 1," +
      " tipo: 'residencial', status: 'concluido', status_pagamento: 'pago'," +
      " total: 80, valor_pago: 80, mao_de_obra: 80, desconto: 0," +
      " forma_pagamento: 'Pix', itens: [] }];",
  )

  const nomeCurto = window.eval(
    "nomeLojaCurto(" + JSON.stringify(nomeGrande) + ")",
  )
  // O nome foi de fato encurtado (menor que o original) e com reticências.
  assert.ok(nomeCurto.length < nomeGrande.length, "nome deveria ser encurtado")
  assert.ok(nomeCurto.endsWith("…"), "nome encurtado termina com reticências")

  const msg = window.eval("osDocTexto(CACHE.servicos[0], 'orcamento')")
  // O resto do orçamento continua presente (não foi cortado pelo nome grande).
  assert.match(msg, /ORÇAMENTO — OS #7/, "cabeçalho presente")
  assert.match(msg, /Abertura de porta/, "serviço presente")
  assert.match(msg, /Total:/, "total presente")
  assert.match(
    msg,
    /Proposta válida por 7 dias/,
    "rodapé do orçamento presente (não cortado)",
  )
  // O nome completo NÃO aparece inteiro na mensagem.
  assert.doesNotMatch(
    msg,
    /Regiao Metropolitana/,
    "nome completo não deveria caber inteiro na mensagem",
  )
})

// ------------------------------------------------------------
// EXTRA: osItemAdd + osItemPick manipulam OS_ITENS corretamente
// ------------------------------------------------------------
test("osItemAdd cria linha e osItemPick vincula produto do CACHE", async function () {
  const { window } = await abrirFormularioOS()

  // começa vazio
  assert.strictEqual(window.eval("OS_ITENS.length"), 0, "OS_ITENS começa vazio")

  window.eval("osItemAdd()")
  assert.strictEqual(window.eval("OS_ITENS.length"), 1, "osItemAdd cria 1 linha")

  // pick da chave 10 na linha 0
  window.eval("osItemPick(0, '10')")
  assert.strictEqual(
    window.eval("OS_ITENS[0].chave_id"),
    10,
    "osItemPick vincula a chave 10",
  )
  assert.strictEqual(
    window.eval("OS_ITENS[0].preco_unit"),
    10,
    "preço unitário vem do preco_venda da chave (10)",
  )
})

// ------------------------------------------------------------
// CASO EDIÇÃO: osSalvar(editId) faz UPDATE em 'servicos' (não insert)
// ------------------------------------------------------------
test("osSalvar em modo edição faz update em servicos e ajusta o pagamento", async function () {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  const registro = ambiente.clienteFake.__registro
  const doc = window.document
  window.eval("pageServicos()")
  await esperarAssentar(window)
  semearCache(window)
  semearProdutos(window)
  // OS existente, aberta, já com R$ 30 pagos.
  window.eval(
    "CACHE.servicos = [{ id: 500, titulo: 'Editar', tipo: 'residencial', status: 'aberta', status_pagamento: 'parcial', cliente_id: 1, funcionario_id: 1, total: 100, valor_pago: 30, mao_de_obra: 100, itens: [] }]",
  )
  window.eval("osForm(500)")
  await esperarAssentar(window)

  definirCampo(doc, "osTitulo", "Editado")
  definirCampo(doc, "osMaoObra", "100,00")
  definirCampo(doc, "osValorPago", "100,00") // paga o restante

  await window.eval("osSalvar(500)")
  await esperarAssentar(window)

  const upd = (registro.update.servicos || []).slice(-1)[0]
  assert.ok(upd, "edição deveria fazer UPDATE em servicos")
  assert.strictEqual(upd.titulo, "Editado", "título atualizado")
  assert.ok(
    !registro.insert.servicos || registro.insert.servicos.length === 0,
    "edição não insere nova OS",
  )
  // pago 100 e antes 30 -> diferença 70 lançada como entrada
  const tx = (registro.insert.transacoes || []).slice(-1)[0]
  assert.ok(tx, "deveria lançar o ajuste de pagamento")
  assert.strictEqual(tx.tipo, "entrada")
  assert.strictEqual(tx.valor, 70, "diferença de pagamento = 70")
})

// ------------------------------------------------------------
// CASO EDIÇÃO BLOQUEADA: OS já concluída não pode ser alterada
// ------------------------------------------------------------
test("osSalvar bloqueia edição de OS já concluída (não grava)", async function () {
  const ambiente = await montarAmbiente()
  const window = ambiente.window
  const registro = ambiente.clienteFake.__registro
  const doc = window.document
  window.eval("pageServicos()")
  await esperarAssentar(window)
  semearCache(window)
  // OS concluída no banco.
  window.eval(
    "CACHE.servicos = [{ id: 501, titulo: 'Fechada', tipo: 'residencial', status: 'concluido', status_pagamento: 'pago', cliente_id: 1, funcionario_id: 1, total: 100, valor_pago: 100, mao_de_obra: 100, itens: [] }]",
  )
  // osForm(501) já barra a abertura; chamamos osSalvar direto para exercitar a
  // defesa interna. Montamos um formulário mínimo via osForm() sem edição e
  // sobrescrevemos o título.
  window.eval("osForm()")
  await esperarAssentar(window)
  definirCampo(doc, "osTitulo", "Tentativa")
  await window.eval("osSalvar(501)")
  await esperarAssentar(window)
  assert.ok(
    !registro.update.servicos || registro.update.servicos.length === 0,
    "OS concluída não deveria ser atualizada",
  )
})

// ------------------------------------------------------------
// CASO FOTO: osSalvar insere as fotos novas (id null, não removidas) em 'imagens'
// ------------------------------------------------------------
test("osSalvar grava as fotos novas da OS em 'imagens'", async function () {
  const { window, doc, registro } = await abrirFormularioOS()
  definirCampo(doc, "osTitulo", "Com foto")
  // uma foto nova (será inserida) e uma existente marcada p/ remover (delete)
  window.eval(
    "OS_FOTOS = [{ id: null, imagem: 'data:foto-nova', remover: false }, { id: 9, imagem: 'data:foto-velha', remover: true }]",
  )
  await window.eval("osSalvar()")
  await esperarAssentar(window)

  const imgs = registro.insert.imagens || []
  const inseriu = imgs.find((p) => p && p.tipo === "servico" && p.imagem === "data:foto-nova")
  assert.ok(inseriu, "deveria inserir a foto nova em imagens: " + JSON.stringify(imgs))
  assert.ok(
    registro.delete.imagens && registro.delete.imagens.length >= 1,
    "deveria apagar a foto marcada para remover",
  )
})

// ------------------------------------------------------------
// CASO: Data de vencimento na OS pendente/fiado. Quando o pagamento NAO e
// 'pago' integral, o campo de vencimento aparece e a data e gravada em
// servicos.data_vencimento. Em 'pago' o campo fica oculto e nao grava.
// ------------------------------------------------------------
test("osSalvar pendente grava a data de vencimento em servicos.data_vencimento", async function () {
  const { window, doc, registro } = await abrirFormularioOS()

  definirCampo(doc, "osTitulo", "Servico fiado")
  definirCampo(doc, "osMaoObra", "100,00")
  definirCampo(doc, "osStatus", "orcamento")
  definirCampo(doc, "osStatusPag", "pendente")
  window.eval("osAtualizarVencimento()")
  const campo = doc.getElementById("osVencimentoCampo")
  assert.notStrictEqual(campo.style.display, "none", "campo de vencimento visivel em pendente")
  definirCampo(doc, "osVencimento", "2026-11-20")

  await window.eval("osSalvar()")
  await esperarAssentar(window)

  const inseridos = registro.insert.servicos || []
  assert.strictEqual(inseridos.length, 1, "deve inserir 1 servico")
  assert.strictEqual(
    inseridos[0].data_vencimento,
    "2026-11-20",
    "grava a data de vencimento informada",
  )
})

test("osSalvar pago NAO grava data de vencimento", async function () {
  const { window, doc, registro } = await abrirFormularioOS()

  definirCampo(doc, "osTitulo", "Servico pago")
  definirCampo(doc, "osMaoObra", "100,00")
  definirCampo(doc, "osStatus", "orcamento")
  definirCampo(doc, "osStatusPag", "pago")
  definirCampo(doc, "osValorPago", "100,00")
  window.eval("osAtualizarVencimento()")
  const campo = doc.getElementById("osVencimentoCampo")
  assert.strictEqual(campo.style.display, "none", "campo oculto quando pago")

  await window.eval("osSalvar()")
  await esperarAssentar(window)

  const inseridos = registro.insert.servicos || []
  assert.strictEqual(inseridos.length, 1, "deve inserir 1 servico")
  assert.strictEqual(
    inseridos[0].data_vencimento || null,
    null,
    "sem vencimento quando pago",
  )
})
