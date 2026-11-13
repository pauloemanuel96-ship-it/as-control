'use strict';
const { db, tx, getConfig } = require('./db');
const { hoje, addDias, addMeses, competenciaDe, diffDias } = require('./util');

const MESES_POR_PERIODO = { mensal: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 };
const STATUS_ABERTOS = ['aguardando_fatura', 'fatura_recebida', 'pendente_conferencia', 'aguardando_pagamento', 'aprovado', 'atrasado'];

function passo(servico) {
  if (servico.periodicidade === 'personalizada') {
    return { qtd: Math.max(1, servico.intervalo_qtd || 1), unidade: servico.intervalo_unidade || 'meses' };
  }
  return { qtd: MESES_POR_PERIODO[servico.periodicidade], unidade: 'meses' };
}
// Ocorrência k a partir da data-base (k = 0, 1, 2...)
function ocorrencia(servico, k) {
  const p = passo(servico);
  if (p.unidade === 'dias') return addDias(servico.base_vencimento, p.qtd * k);
  return addMeses(servico.base_vencimento, p.qtd * k, servico.dia_cobranca || undefined);
}
// Fator para converter o valor do período em equivalente mensal
function fatorMensal(servico) {
  const p = passo(servico);
  return p.unidade === 'dias' ? 30.4375 / p.qtd : 1 / p.qtd;
}
function valorEmReais(servico, cfg = getConfig()) {
  if (servico.moeda === 'BRL') return servico.valor_centavos;
  const taxa = Number(cfg.cotacoes?.[servico.moeda]) || 0;
  return Math.round(servico.valor_centavos * taxa);
}

// Primeira ocorrência >= data
function proximaOcorrenciaDesde(servico, data) {
  for (let k = 0; k < 5000; k++) { const d = ocorrencia(servico, k); if (d >= data) return d; }
  return null;
}

const insertLanc = () => db.prepare(`INSERT OR IGNORE INTO lancamentos
  (servico_id, ocorrencia_ref, competencia, vencimento, valor_previsto_centavos, status, responsavel_id, fornecedor, categoria, descricao)
  VALUES (?, ?, ?, ?, ?, 'aguardando_fatura', ?, ?, ?, ?)`);

// Gera os lançamentos de um serviço até o horizonte. A chave (servico_id, ocorrencia_ref) impede duplicidade.
function gerarLancamentosServico(servico, cfg = getConfig()) {
  if (servico.status !== 'ativo') return 0;
  const horizonte = addDias(hoje(), Number(cfg.horizonte_geracao_dias) || 45);
  const valor = valorEmReais(servico, cfg);
  const stmt = insertLanc();
  let criados = 0;
  for (let k = 0; k < 2000; k++) {
    const venc = ocorrencia(servico, k);
    if (venc > horizonte && k > 0) break;
    const r = stmt.run(servico.id, venc, competenciaDe(venc), venc, valor, servico.responsavel_id, servico.fornecedor, servico.categoria, servico.nome);
    criados += Number(r.changes);
    if (venc > horizonte) break; // garante ao menos a próxima ocorrência
  }
  return criados;
}
function gerarTodos() {
  const cfg = getConfig();
  let total = 0;
  for (const s of db.prepare("SELECT * FROM servicos WHERE status = 'ativo'").all()) total += gerarLancamentosServico(s, cfg);
  return total;
}

// Remove lançamentos futuros "intocados" (sem cobrança, sem documento, sem pagamento) — usado quando a recorrência muda
function removerFuturosIntocados(servicoId) {
  const h = hoje();
  return db.prepare(`DELETE FROM lancamentos WHERE servico_id = ? AND vencimento >= ? AND status = 'aguardando_fatura'
    AND valor_cobrado_centavos IS NULL AND data_pagamento IS NULL
    AND id NOT IN (SELECT lancamento_id FROM documentos WHERE lancamento_id IS NOT NULL)
    AND id NOT IN (SELECT lancamento_id FROM cobrancas_recebidas WHERE lancamento_id IS NOT NULL)
    AND id NOT IN (SELECT lancamento_id FROM notificacoes WHERE lancamento_id IS NOT NULL)`).run(servicoId, h).changes;
}
// Atualiza o valor previsto dos lançamentos ainda abertos e sem cobrança registrada
function atualizarPrevistos(servico) {
  db.prepare(`UPDATE lancamentos SET valor_previsto_centavos = ?, responsavel_id = COALESCE(responsavel_id, ?), atualizado_em = datetime('now')
    WHERE servico_id = ? AND status = 'aguardando_fatura' AND valor_cobrado_centavos IS NULL AND vencimento >= ?`)
    .run(valorEmReais(servico), servico.responsavel_id, servico.id, hoje());
}
// Ao cancelar: lançamentos futuros não pagos viram "cancelado" (histórico preservado)
function cancelarFuturos(servicoId) {
  return db.prepare(`UPDATE lancamentos SET status = 'cancelado', cancelado_com_servico = 1, atualizado_em = datetime('now')
    WHERE servico_id = ? AND vencimento >= ? AND status IN ('aguardando_fatura','fatura_recebida','pendente_conferencia','aguardando_pagamento','aprovado')`)
    .run(servicoId, hoje()).changes;
}

// Ao reativar: lançamentos futuros que foram cancelados junto com o serviço voltam a ficar abertos
function restaurarFuturos(servicoId) {
  return db.prepare(`UPDATE lancamentos SET status = CASE WHEN valor_cobrado_centavos IS NULL THEN 'aguardando_fatura' ELSE 'aguardando_pagamento' END,
    cancelado_com_servico = 0, atualizado_em = datetime('now')
    WHERE servico_id = ? AND vencimento >= ? AND status = 'cancelado' AND cancelado_com_servico = 1`).run(servicoId, hoje()).changes;
}

function marcarAtrasados() {
  return db.prepare(`UPDATE lancamentos SET status = 'atrasado', atualizado_em = datetime('now')
    WHERE vencimento < ? AND status IN ('aguardando_fatura','fatura_recebida','pendente_conferencia','aguardando_pagamento','aprovado')`)
    .run(hoje()).changes;
}

// Detector de aumentos: compara valor cobrado com o previsto
function registrarAumentoSeHouver(lanc, valorNovo, cfg = getConfig()) {
  if (!lanc.servico_id || valorNovo == null || !lanc.valor_previsto_centavos) return null;
  const minimo = Number(cfg.aumento_minimo_percentual ?? 1) / 100;
  if (valorNovo <= lanc.valor_previsto_centavos * (1 + minimo)) return null;
  const ja = db.prepare('SELECT id FROM alteracoes_preco WHERE lancamento_id = ?').get(lanc.id);
  if (ja) {
    db.prepare('UPDATE alteracoes_preco SET valor_novo_centavos = ?, revisado = 0 WHERE id = ?').run(valorNovo, ja.id);
    return ja.id;
  }
  return Number(db.prepare(`INSERT INTO alteracoes_preco (servico_id, lancamento_id, valor_anterior_centavos, valor_novo_centavos, origem)
    VALUES (?, ?, ?, ?, 'cobranca')`).run(lanc.servico_id, lanc.id, lanc.valor_previsto_centavos, valorNovo).lastInsertRowid);
}

function exigeAprovacao(lanc, cfg = getConfig()) {
  if (!cfg.aprovacao_ativa) return false;
  const valor = lanc.valor_cobrado_centavos ?? lanc.valor_previsto_centavos;
  return valor >= Number(cfg.aprovacao_acima_centavos || 0);
}

function proximoVencimentoServico(servicoId) {
  return db.prepare(`SELECT MIN(vencimento) AS v FROM lancamentos WHERE servico_id = ? AND status NOT IN ('pago','cancelado')`).get(servicoId)?.v || null;
}

module.exports = {
  STATUS_ABERTOS, MESES_POR_PERIODO, ocorrencia, fatorMensal, valorEmReais, proximaOcorrenciaDesde,
  gerarLancamentosServico, gerarTodos, removerFuturosIntocados, atualizarPrevistos, cancelarFuturos, restaurarFuturos,
  marcarAtrasados, registrarAumentoSeHouver, exigeAprovacao, proximoVencimentoServico, diffDias, tx,
};
