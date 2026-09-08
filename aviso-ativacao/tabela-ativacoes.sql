-- ============================================================
-- Tabela que guarda os avisos de ativação dos chaveiros (lado MyKey).
-- Idempotente: pode rodar quantas vezes quiser, não apaga nada.
-- O workflow n8n já roda este CREATE TABLE sozinho, mas você pode
-- rodá-lo à mão no seu Postgres se preferir criar a tabela antes.
-- ============================================================
CREATE TABLE IF NOT EXISTS ativacoes (
  id                BIGSERIAL PRIMARY KEY,
  nome_chaveiro     TEXT,
  cidade            TEXT,
  whatsapp          TEXT,
  codigo_instalacao TEXT UNIQUE,   -- evita linha duplicada se o mesmo PC reavisar
  data_ativacao     TIMESTAMPTZ,   -- quando o chaveiro ativou (informado pelo app)
  recebido_em       TIMESTAMPTZ NOT NULL DEFAULT now()  -- quando a MyKey recebeu
);
