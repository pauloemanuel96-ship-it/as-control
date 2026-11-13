'use strict';
// Banco de dados SQLite nativo do Node (node:sqlite) — sem dependências nativas para compilar.
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'storage');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'as-control.db');

const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  senha_hash TEXT NOT NULL,
  perfil TEXT NOT NULL CHECK (perfil IN ('administrador','financeiro','gestor','consulta')),
  permissoes_extra TEXT NOT NULL DEFAULT '{"add":[],"remove":[]}',
  whatsapp TEXT,
  preferencias TEXT NOT NULL DEFAULT '{}',
  ativo INTEGER NOT NULL DEFAULT 1,
  ultimo_acesso TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessoes (
  token_hash TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira_em TEXT NOT NULL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS servicos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  fornecedor TEXT NOT NULL,
  categoria TEXT NOT NULL,
  descricao TEXT,
  tipo_valor TEXT NOT NULL DEFAULT 'fixo' CHECK (tipo_valor IN ('fixo','variavel')),
  valor_centavos INTEGER NOT NULL DEFAULT 0,
  moeda TEXT NOT NULL DEFAULT 'BRL',
  periodicidade TEXT NOT NULL CHECK (periodicidade IN ('mensal','bimestral','trimestral','semestral','anual','personalizada')),
  intervalo_qtd INTEGER,
  intervalo_unidade TEXT CHECK (intervalo_unidade IN ('dias','meses') OR intervalo_unidade IS NULL),
  base_vencimento TEXT NOT NULL,
  dia_cobranca INTEGER,
  forma_pagamento TEXT,
  responsavel_id INTEGER REFERENCES usuarios(id),
  email_fornecedor TEXT,
  telefone TEXT,
  link_fornecedor TEXT,
  link_pagamento TEXT,
  data_contratacao TEXT,
  data_renovacao TEXT,
  prazo_cancelamento_dias INTEGER,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','pausado','cancelado')),
  observacoes TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lancamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  servico_id INTEGER REFERENCES servicos(id),
  ocorrencia_ref TEXT,
  avulsa INTEGER NOT NULL DEFAULT 0,
  descricao TEXT,
  fornecedor TEXT,
  categoria TEXT,
  competencia TEXT NOT NULL,
  vencimento TEXT NOT NULL,
  valor_previsto_centavos INTEGER NOT NULL DEFAULT 0,
  valor_cobrado_centavos INTEGER,
  data_pagamento TEXT,
  status TEXT NOT NULL DEFAULT 'aguardando_fatura' CHECK (status IN (
    'aguardando_fatura','fatura_recebida','pendente_conferencia','aguardando_pagamento','aprovado','pago','atrasado','cancelado')),
  responsavel_id INTEGER REFERENCES usuarios(id),
  numero_fatura TEXT,
  observacoes TEXT,
  aprovado_por INTEGER REFERENCES usuarios(id),
  aprovado_em TEXT,
  pago_por INTEGER REFERENCES usuarios(id),
  cancelado_com_servico INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (servico_id, ocorrencia_ref)
);
CREATE INDEX IF NOT EXISTS idx_lanc_venc ON lancamentos(vencimento);
CREATE INDEX IF NOT EXISTS idx_lanc_status ON lancamentos(status);

CREATE TABLE IF NOT EXISTS documentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lancamento_id INTEGER REFERENCES lancamentos(id),
  servico_id INTEGER REFERENCES servicos(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('boleto','fatura','nota_fiscal','comprovante','contrato','proposta','renovacao','outro')),
  nome_original TEXT NOT NULL,
  arquivo TEXT NOT NULL,
  mime TEXT NOT NULL,
  tamanho INTEGER NOT NULL,
  competencia TEXT,
  enviado_por INTEGER REFERENCES usuarios(id),
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notificacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  chave TEXT NOT NULL,
  titulo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  lancamento_id INTEGER REFERENCES lancamentos(id),
  servico_id INTEGER REFERENCES servicos(id),
  lida_em TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (usuario_id, chave)
);

CREATE TABLE IF NOT EXISTS envios_whatsapp (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chave TEXT NOT NULL UNIQUE,
  notificacao_id INTEGER REFERENCES notificacoes(id) ON DELETE SET NULL,
  destino TEXT NOT NULL,
  destino_nome TEXT,
  tipo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  provedor TEXT,
  status TEXT NOT NULL CHECK (status IN ('pendente_conexao','na_fila','enviado','entregue','lido','falhou')),
  tentativas INTEGER NOT NULL DEFAULT 0,
  erro TEXT,
  provedor_msg_id TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS alteracoes_preco (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  servico_id INTEGER NOT NULL REFERENCES servicos(id),
  lancamento_id INTEGER REFERENCES lancamentos(id),
  valor_anterior_centavos INTEGER NOT NULL,
  valor_novo_centavos INTEGER NOT NULL,
  origem TEXT NOT NULL CHECK (origem IN ('cadastro','cobranca')),
  revisado INTEGER NOT NULL DEFAULT 0,
  detectado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cobrancas_recebidas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  origem TEXT NOT NULL CHECK (origem IN ('manual','email','integracao')),
  fornecedor TEXT,
  servico_id INTEGER REFERENCES servicos(id),
  valor_centavos INTEGER,
  vencimento TEXT,
  competencia TEXT,
  numero_fatura TEXT,
  remetente TEXT,
  assunto TEXT,
  documento_id INTEGER REFERENCES documentos(id),
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','confirmada','descartada')),
  lancamento_id INTEGER REFERENCES lancamentos(id),
  observacoes TEXT,
  criado_por INTEGER REFERENCES usuarios(id),
  revisado_por INTEGER REFERENCES usuarios(id),
  revisado_em TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER REFERENCES usuarios(id),
  usuario_nome TEXT,
  acao TEXT NOT NULL,
  entidade TEXT NOT NULL,
  entidade_id INTEGER,
  antes TEXT,
  depois TEXT,
  ip TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_data ON auditoria(criado_em);

CREATE TABLE IF NOT EXISTS configuracoes (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
`;
db.exec(SCHEMA);

// ---------- Módulo jurídico (v2) ----------
db.exec(`
CREATE TABLE IF NOT EXISTS demandas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL CHECK (tipo IN ('jec','justica_comum','procon','consumidor_gov','reclame_aqui','notificacao','chargeback')),
  numero TEXT,
  titulo TEXT NOT NULL,
  parte_nome TEXT,
  parte_contato TEXT,
  orgao TEXT,
  localidade TEXT,
  evento TEXT,
  pedido TEXT,
  valor_causa_centavos INTEGER,
  valor_pedido_centavos INTEGER,
  risco TEXT CHECK (risco IN ('provavel','possivel','remoto') OR risco IS NULL),
  prioridade TEXT NOT NULL DEFAULT 'normal' CHECK (prioridade IN ('baixa','normal','alta','urgente')),
  status TEXT NOT NULL DEFAULT 'nova' CHECK (status IN ('nova','em_andamento','aguardando','acordo','encerrada')),
  resultado TEXT CHECK (resultado IN ('favoravel','desfavoravel','parcial','acordo','arquivada') OR resultado IS NULL),
  responsavel_id INTEGER REFERENCES usuarios(id),
  advogado TEXT,
  data_recebimento TEXT,
  data_encerramento TEXT,
  observacoes TEXT,
  ultimo_andamento_em TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_dem_status ON demandas(status);

CREATE TABLE IF NOT EXISTS juridico_compromissos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  demanda_id INTEGER NOT NULL REFERENCES demandas(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('prazo','audiencia','tarefa')),
  titulo TEXT NOT NULL,
  data TEXT NOT NULL,
  hora TEXT,
  modalidade TEXT CHECK (modalidade IN ('presencial','virtual','hibrida') OR modalidade IS NULL),
  local TEXT,
  responsavel_id INTEGER REFERENCES usuarios(id),
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','cumprido','cancelado')),
  cumprido_em TEXT,
  cumprido_por INTEGER REFERENCES usuarios(id),
  observacoes TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_comp_data ON juridico_compromissos(data);

CREATE TABLE IF NOT EXISTS juridico_andamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  demanda_id INTEGER NOT NULL REFERENCES demandas(id),
  data TEXT NOT NULL,
  descricao TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'andamento' CHECK (tipo IN ('andamento','nota','sistema')),
  usuario_id INTEGER REFERENCES usuarios(id),
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS juridico_valores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  demanda_id INTEGER NOT NULL REFERENCES demandas(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('pedido','acordo','condenacao','custas','honorarios','reembolso','chargeback','outro')),
  descricao TEXT,
  valor_centavos INTEGER NOT NULL,
  parcelas INTEGER NOT NULL DEFAULT 1,
  primeiro_vencimento TEXT,
  gerou_contas INTEGER NOT NULL DEFAULT 0,
  criado_por INTEGER REFERENCES usuarios(id),
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
`);
// Colunas novas em tabelas existentes (migração segura: só adiciona se faltar)
function adicionarColuna(tabela, coluna, def) {
  const existe = db.prepare(`PRAGMA table_info(${tabela})`).all().some((c) => c.name === coluna);
  if (!existe) db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${def}`);
}
adicionarColuna('documentos', 'demanda_id', 'INTEGER REFERENCES demandas(id)');
adicionarColuna('documentos', 'tipo_juridico', 'TEXT');
adicionarColuna('lancamentos', 'demanda_id', 'INTEGER REFERENCES demandas(id)');
adicionarColuna('notificacoes', 'demanda_id', 'INTEGER REFERENCES demandas(id)');
adicionarColuna('lancamentos', 'juridico_valor_id', 'INTEGER REFERENCES juridico_valores(id)');

const DEFAULT_CONFIG = {
  alertas_dias_antes: [7, 3, 1, 0],
  alerta_atraso_diario: true,
  alertas_renovacao_dias: [30, 7],
  aprovacao_ativa: false,
  aprovacao_acima_centavos: 50000,
  cotacoes: { USD: 5.5, EUR: 6.0 },
  horizonte_geracao_dias: 45,
  aumento_minimo_percentual: 1,
  whatsapp_destinatarios_extras: [],
  juridico_alertas_prazo: [5, 2, 1, 0],
  juridico_alertas_audiencia: [7, 1, 0],
  juridico_dias_sem_andamento: 30,
};
for (const [k, v] of Object.entries(DEFAULT_CONFIG)) {
  db.prepare('INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES (?, ?)').run(k, JSON.stringify(v));
}

function getConfig() {
  const out = {};
  for (const row of db.prepare('SELECT chave, valor FROM configuracoes').all()) out[row.chave] = JSON.parse(row.valor);
  return out;
}
function setConfig(chave, valor) {
  db.prepare('INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor')
    .run(chave, JSON.stringify(valor));
}

// Transação simples (node:sqlite não tem helper próprio)
function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}

module.exports = { db, tx, getConfig, setConfig, DATA_DIR, DEFAULT_CONFIG };
