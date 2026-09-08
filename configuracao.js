// ============================================================
// CONFIGURAÇÃO DO SEU CHAVEIRO  —  preencha UMA vez.
// ============================================================
// Este arquivo guarda os dados do SEU Supabase (endereço e chave).
//
// IMPORTANTE: nas ATUALIZAÇÕES, você troca o "index.html" e roda o SQL,
// mas NÃO troca este arquivo — a sua configuração fica preservada aqui,
// sem precisar preencher de novo.
//
// Onde achar os dados: Supabase > seu projeto > "Project overview" >
// a caixa suspensa de conexão:
//   • SUPABASE_URL  = Project URL       (ex.: https://xxxxxxxx.supabase.co)
//   • SUPABASE_KEY  = Publishable key   (começa com sb_publishable_...)
//
// NUNCA use a "Secret key" (sb_secret_...) nem a "Database URL" (postgres://).
// ============================================================

window.SUPABASE_URL = ''
window.SUPABASE_KEY = ''

// ============================================================
// AVISO DE ATIVAÇÃO PARA A MyKey  —  NÃO precisa mexer.
// ============================================================
// Quando o chaveiro ativa o sistema, além de salvar no Supabase dele,
// o cadastro dele (nome, cidade, WhatsApp) é avisado à MyKey, para
// registro e suporte. Isso NÃO envia o código de liberação nem senhas.
//
// Esta URL é preenchida pela MyKey (Thiago), com o endereço do webhook
// n8n que recebe o aviso. Enquanto estiver com o texto de exemplo abaixo,
// nenhum aviso é enviado (o sistema simplesmente ignora). A ativação
// funciona normalmente com ou sem esta URL.
window.URL_AVISO_ATIVACAO = 'COLE_AQUI_A_URL_DO_WEBHOOK_DA_MYKEY'
