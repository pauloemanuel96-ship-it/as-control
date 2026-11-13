'use strict';
const router = require('express').Router();
const { db, tx, getConfig } = require('../db');
const A = require('../auth');
const fin = require('../financeiro');
const { notificarAumento } = require('../jobs');
const { HttpError, txt, int, parseValor, parseData, hoje, competenciaDe, inicioMes, fimMes } = require('../util');

const SQL = `SELECT l.*, u.nome AS responsavel_nome, s.status AS servico_status, s.link_pagamento, s.forma_pagamento,
  (SELECT COUNT(*) FROM documentos d WHERE d.lancamento_id = l.id) AS qtd_documentos
  FROM lancamentos l LEFT JOIN usuarios u ON u.id = l.responsavel_id LEFT JOIN servicos s ON s.id = l.servico_id`;
const EDITAVEIS = ['aguardando_fatura', 'fatura_recebida', 'pendente_conferencia', 'aguardando_pagamento'];

function filtros(q) {
  const w = []; const a = [];
  if (q.de) { w.push('l.vencimento >= ?'); a.push(q.de); }
  if (q.ate) { w.push('l.vencimento <= ?'); a.push(q.ate); }
  if (q.competencia) { w.push('l.competencia = ?'); a.push(q.competencia); }
  if (q.status === 'abertos') w.push("l.status NOT IN ('pago','cancelado')");
  else if (q.status) { w.push('l.status = ?'); a.push(q.status); }
  if (q.servico_id) { w.push('l.servico_id = ?'); a.push(q.servico_id); }
  if (q.categoria) { w.push('l.categoria = ?'); a.push(q.categoria); }
  if (q.fornecedor) { w.push('l.fornecedor = ?'); a.push(q.fornecedor); }
  if (q.responsavel_id) { w.push('l.responsavel_id = ?'); a.push(q.responsavel_id); }
  if (q.avulsa === '1') w.push('l.avulsa = 1');
  if (q.busca) { w.push('(l.descricao LIKE ? OR l.fornecedor LIKE ? OR l.numero_fatura LIKE ?)'); a.push(`%${q.busca}%`, `%${q.busca}%`, `%${q.busca}%`); }
  return { where: w.length ? `WHERE ${w.join(' AND ')}` : '', args: a };
}

router.get('/', A.exigir('lancamentos.ver'), (req, res) => {
  const { where, args } = filtros(req.query);
  const ordem = req.query.ordem === 'desc' ? 'DESC' : 'ASC';
  res.json(db.prepare(`${SQL} ${where} ORDER BY l.vencimento ${ordem}, l.id LIMIT 1000`).all(...args));
});

router.get('/calendario', A.exigir('lancamentos.ver'), (req, res) => {
  const mes = /^\d{4}-\d{2}$/.test(req.query.mes || '') ? req.query.mes : competenciaDe(hoje());
  const de = inicioMes(mes); const ate = fimMes(mes);
  const lancamentos = db.prepare(`${SQL} WHERE l.vencimento BETWEEN ? AND ? ORDER BY l.vencimento`).all(de, ate);
  const renovacoes = db.prepare(`SELECT id, nome, data_renovacao, prazo_cancelamento_dias FROM servicos
    WHERE status != 'cancelado' AND data_renovacao BETWEEN ? AND ?`).all(de, ate);
  res.json({ mes, hoje: hoje(), lancamentos, renovacoes });
});

router.get('/:id', A.exigir('lancamentos.ver'), (req, res) => {
  const l = db.prepare(`${SQL} WHERE l.id = ?`).get(req.params.id);
  if (!l) throw new HttpError(404, 'Lançamento não encontrado.');
  const extra = {
    documentos: A.tem(req, 'documentos.ver')
      ? db.prepare('SELECT id, tipo, nome_original, tamanho, criado_em FROM documentos WHERE lancamento_id = ? ORDER BY criado_em DESC').all(l.id) : null,
    aprovado_por_nome: l.aprovado_por ? db.prepare('SELECT nome FROM usuarios WHERE id = ?').get(l.aprovado_por)?.nome : null,
    pago_por_nome: l.pago_por ? db.prepare('SELECT nome FROM usuarios WHERE id = ?').get(l.pago_por)?.nome : null,
    exige_aprovacao: fin.exigeAprovacao(l),
    aumento: db.prepare('SELECT * FROM alteracoes_preco WHERE lancamento_id = ?').get(l.id) || null,
    historico: A.tem(req, 'auditoria.ver')
      ? db.prepare("SELECT usuario_nome, acao, criado_em FROM auditoria WHERE entidade = 'lancamento' AND entidade_id = ? ORDER BY id DESC LIMIT 30").all(l.id) : null,
  };
  res.json({ ...l, ...extra });
});

// Despesa avulsa (não recorrente)
router.post('/', A.exigir('lancamentos.editar'), (req, res) => {
  const b = req.body;
  const descricao = txt(b.descricao, 200); const fornecedor = txt(b.fornecedor, 150); const categoria = txt(b.categoria, 80);
  const valor = parseValor(b.valor);
  if (!descricao || !fornecedor || !categoria) throw new HttpError(400, 'Descrição, fornecedor e categoria são obrigatórios.');
  if (valor == null || Number.isNaN(valor)) throw new HttpError(400, 'Informe um valor válido.');
  if (!parseData(b.vencimento)) throw new HttpError(400, 'Informe a data de vencimento.');
  const competencia = /^\d{4}-\d{2}$/.test(b.competencia || '') ? b.competencia : competenciaDe(b.vencimento);
  const id = Number(db.prepare(`INSERT INTO lancamentos (avulsa, descricao, fornecedor, categoria, competencia, vencimento, valor_previsto_centavos,
    valor_cobrado_centavos, status, responsavel_id, numero_fatura, observacoes) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    descricao, fornecedor, categoria, competencia, b.vencimento, valor, valor, 'aguardando_pagamento', int(b.responsavel_id),
    txt(b.numero_fatura, 80), txt(b.observacoes, 4000)).lastInsertRowid);
  fin.marcarAtrasados();
  A.auditar(req, 'criou despesa avulsa', 'lancamento', id, null, db.prepare('SELECT * FROM lancamentos WHERE id = ?').get(id));
  res.status(201).json({ id });
});

router.put('/:id', A.exigir('lancamentos.editar'), (req, res) => {
  const antes = db.prepare('SELECT * FROM lancamentos WHERE id = ?').get(req.params.id);
  if (!antes) throw new HttpError(404, 'Lançamento não encontrado.');
  if (['pago', 'cancelado'].includes(antes.status)) throw new HttpError(400, 'Lançamentos pagos ou cancelados não podem ser editados.');
  const b = req.body;
  const valorCobrado = b.valor_cobrado === undefined ? antes.valor_cobrado_centavos : parseValor(b.valor_cobrado);
  if (Number.isNaN(valorCobrado)) throw new HttpError(400, 'Valor cobrado inválido.');
  const vencimento = b.vencimento ?? antes.vencimento;
  if (!parseData(vencimento)) throw new HttpError(400, 'Data de vencimento inválida.');
  let status = b.status ?? antes.status;
  if (status !== antes.status && !EDITAVEIS.includes(status)) throw new HttpError(400, 'Use as ações de aprovar ou pagar para este status.');
  // Registrou o valor da fatura e o status ainda era "aguardando fatura" → passa para "fatura recebida"
  if (b.status === undefined && antes.status === 'aguardando_fatura' && valorCobrado != null && antes.valor_cobrado_centavos == null) status = 'fatura_recebida';
  // Mudou o valor depois de aprovado → precisa nova aprovação
  if (antes.status === 'aprovado' && valorCobrado !== antes.valor_cobrado_centavos) status = 'aguardando_pagamento';
  if (antes.status === 'atrasado' && b.status === undefined) status = 'atrasado';
  let aumentoId = null;
  tx(() => {
    db.prepare(`UPDATE lancamentos SET valor_cobrado_centavos = ?, vencimento = ?, competencia = ?, status = ?, responsavel_id = ?, numero_fatura = ?,
      observacoes = ?, aprovado_por = CASE WHEN ? = 'aprovado' THEN aprovado_por ELSE NULL END, aprovado_em = CASE WHEN ? = 'aprovado' THEN aprovado_em ELSE NULL END,
      atualizado_em = datetime('now') WHERE id = ?`).run(
      valorCobrado, vencimento, /^\d{4}-\d{2}$/.test(b.competencia || '') ? b.competencia : antes.competencia, status,
      b.responsavel_id === undefined ? antes.responsavel_id : int(b.responsavel_id), b.numero_fatura === undefined ? antes.numero_fatura : txt(b.numero_fatura, 80),
      b.observacoes === undefined ? antes.observacoes : txt(b.observacoes, 4000), status, status, antes.id);
    if (vencimento >= hoje() && status === 'atrasado') {
      db.prepare('UPDATE lancamentos SET status = ? WHERE id = ?').run(valorCobrado == null ? 'aguardando_fatura' : 'aguardando_pagamento', antes.id);
    }
    fin.marcarAtrasados();
    if (valorCobrado != null && valorCobrado !== antes.valor_cobrado_centavos) aumentoId = fin.registrarAumentoSeHouver(antes, valorCobrado);
    A.auditar(req, 'editou lançamento', 'lancamento', antes.id, antes, db.prepare('SELECT * FROM lancamentos WHERE id = ?').get(antes.id));
  });
  if (aumentoId) notificarAumento(aumentoId);
  res.json({ ok: true });
});

router.post('/:id/aprovar', A.exigir('lancamentos.aprovar'), (req, res) => {
  const antes = db.prepare('SELECT * FROM lancamentos WHERE id = ?').get(req.params.id);
  if (!antes) throw new HttpError(404, 'Lançamento não encontrado.');
  if (['pago', 'cancelado', 'aprovado'].includes(antes.status)) throw new HttpError(400, 'Este lançamento não pode ser aprovado no status atual.');
  db.prepare(`UPDATE lancamentos SET status = 'aprovado', aprovado_por = ?, aprovado_em = datetime('now'), atualizado_em = datetime('now') WHERE id = ?`).run(req.usuario.id, antes.id);
  A.auditar(req, 'aprovou pagamento', 'lancamento', antes.id, antes, db.prepare('SELECT * FROM lancamentos WHERE id = ?').get(antes.id));
  res.json({ ok: true });
});

router.post('/:id/pagar', A.exigir('lancamentos.pagar'), (req, res) => {
  const antes = db.prepare('SELECT * FROM lancamentos WHERE id = ?').get(req.params.id);
  if (!antes) throw new HttpError(404, 'Lançamento não encontrado.');
  if (['pago', 'cancelado'].includes(antes.status)) throw new HttpError(400, 'Este lançamento já está pago ou cancelado.');
  const valor = req.body.valor_pago === undefined || req.body.valor_pago === '' ? (antes.valor_cobrado_centavos ?? antes.valor_previsto_centavos) : parseValor(req.body.valor_pago);
  if (valor == null || Number.isNaN(valor)) throw new HttpError(400, 'Informe o valor pago.');
  const data = req.body.data_pagamento || hoje();
  if (!parseData(data) || data > hoje()) throw new HttpError(400, 'Data de pagamento inválida (não pode ser futura).');
  const cfg = getConfig();
  if (fin.exigeAprovacao({ ...antes, valor_cobrado_centavos: valor }, cfg) && antes.status !== 'aprovado') {
    throw new HttpError(400, 'Este valor exige aprovação antes do pagamento. Peça a um gestor ou administrador para aprovar.');
  }
  let aumentoId = null;
  tx(() => {
    db.prepare(`UPDATE lancamentos SET status = 'pago', valor_cobrado_centavos = ?, data_pagamento = ?, pago_por = ?, atualizado_em = datetime('now') WHERE id = ?`)
      .run(valor, data, req.usuario.id, antes.id);
    if (valor !== antes.valor_cobrado_centavos) aumentoId = fin.registrarAumentoSeHouver(antes, valor, cfg);
    A.auditar(req, 'registrou pagamento', 'lancamento', antes.id, antes, db.prepare('SELECT * FROM lancamentos WHERE id = ?').get(antes.id));
  });
  if (aumentoId) notificarAumento(aumentoId);
  res.json({ ok: true });
});

router.post('/:id/desfazer-pagamento', A.exigir('lancamentos.pagar'), (req, res) => {
  const antes = db.prepare('SELECT * FROM lancamentos WHERE id = ?').get(req.params.id);
  if (!antes || antes.status !== 'pago') throw new HttpError(400, 'Este lançamento não está pago.');
  const motivo = txt(req.body.motivo, 500);
  if (!motivo) throw new HttpError(400, 'Informe o motivo para desfazer o pagamento.');
  db.prepare(`UPDATE lancamentos SET status = 'aguardando_pagamento', data_pagamento = NULL, pago_por = NULL, aprovado_por = NULL, aprovado_em = NULL,
    observacoes = trim(COALESCE(observacoes,'') || char(10) || ?), atualizado_em = datetime('now') WHERE id = ?`).run(`Pagamento desfeito: ${motivo}`, antes.id);
  fin.marcarAtrasados();
  A.auditar(req, 'desfez pagamento', 'lancamento', antes.id, antes, db.prepare('SELECT * FROM lancamentos WHERE id = ?').get(antes.id));
  res.json({ ok: true });
});

router.post('/:id/cancelar', A.exigir('lancamentos.editar'), (req, res) => {
  const antes = db.prepare('SELECT * FROM lancamentos WHERE id = ?').get(req.params.id);
  if (!antes) throw new HttpError(404, 'Lançamento não encontrado.');
  if (['pago', 'cancelado'].includes(antes.status)) throw new HttpError(400, 'Este lançamento não pode ser cancelado.');
  const motivo = txt(req.body.motivo, 500);
  if (!motivo) throw new HttpError(400, 'Informe o motivo do cancelamento.');
  db.prepare(`UPDATE lancamentos SET status = 'cancelado', observacoes = trim(COALESCE(observacoes,'') || char(10) || ?), atualizado_em = datetime('now') WHERE id = ?`)
    .run(`Cancelado: ${motivo}`, antes.id);
  A.auditar(req, 'cancelou lançamento', 'lancamento', antes.id, antes, db.prepare('SELECT * FROM lancamentos WHERE id = ?').get(antes.id));
  res.json({ ok: true });
});

module.exports = router;
