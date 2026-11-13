'use strict';
const router = require('express').Router();
const { db, tx, getConfig } = require('../db');
const A = require('../auth');
const fin = require('../financeiro');
const { notificarAumento } = require('../jobs');
const { HttpError, txt, int, parseValor, parseData, hoje } = require('../util');

const PERIODOS = ['mensal', 'bimestral', 'trimestral', 'semestral', 'anual', 'personalizada'];
const MOEDAS = ['BRL', 'USD', 'EUR'];

function validar(b, atual = {}) {
  const v = (k) => (b[k] === undefined ? atual[k] : b[k]);
  const s = {
    nome: txt(v('nome'), 150), fornecedor: txt(v('fornecedor'), 150), categoria: txt(v('categoria'), 80),
    descricao: txt(v('descricao'), 2000), tipo_valor: v('tipo_valor') || 'fixo', moeda: (v('moeda') || 'BRL').toUpperCase(),
    periodicidade: v('periodicidade'), intervalo_qtd: int(v('intervalo_qtd')), intervalo_unidade: v('intervalo_unidade') || null,
    base_vencimento: b.proximo_vencimento ?? atual.base_vencimento, dia_cobranca: int(v('dia_cobranca')),
    forma_pagamento: txt(v('forma_pagamento'), 80), responsavel_id: int(v('responsavel_id')),
    email_fornecedor: txt(v('email_fornecedor'), 200), telefone: txt(v('telefone'), 40),
    link_fornecedor: txt(v('link_fornecedor'), 500), link_pagamento: txt(v('link_pagamento'), 500),
    data_contratacao: txt(v('data_contratacao'), 10), data_renovacao: txt(v('data_renovacao'), 10),
    prazo_cancelamento_dias: int(v('prazo_cancelamento_dias')), observacoes: txt(v('observacoes'), 4000),
  };
  s.valor_centavos = b.valor === undefined ? atual.valor_centavos : parseValor(b.valor);
  if (!s.nome || !s.fornecedor || !s.categoria) throw new HttpError(400, 'Nome, fornecedor e categoria são obrigatórios.');
  if (!['fixo', 'variavel'].includes(s.tipo_valor)) throw new HttpError(400, 'Tipo de valor inválido.');
  if (!MOEDAS.includes(s.moeda)) throw new HttpError(400, 'Moeda não suportada.');
  if (s.valor_centavos == null || Number.isNaN(s.valor_centavos)) throw new HttpError(400, 'Informe um valor válido (para valor variável, use uma estimativa).');
  if (!PERIODOS.includes(s.periodicidade)) throw new HttpError(400, 'Periodicidade inválida.');
  if (s.periodicidade === 'personalizada') {
    if (!s.intervalo_qtd || s.intervalo_qtd < 1 || !['dias', 'meses'].includes(s.intervalo_unidade)) throw new HttpError(400, 'Na periodicidade personalizada, informe o intervalo (ex.: a cada 4 meses).');
  } else { s.intervalo_qtd = null; s.intervalo_unidade = null; }
  if (!parseData(s.base_vencimento)) throw new HttpError(400, 'Informe a data do próximo vencimento.');
  if (s.dia_cobranca != null && (s.dia_cobranca < 1 || s.dia_cobranca > 31)) throw new HttpError(400, 'Dia de cobrança deve estar entre 1 e 31.');
  for (const k of ['data_contratacao', 'data_renovacao']) if (s[k] && !parseData(s[k])) throw new HttpError(400, 'Data inválida.');
  if (s.responsavel_id && !db.prepare('SELECT 1 FROM usuarios WHERE id = ?').get(s.responsavel_id)) throw new HttpError(400, 'Responsável não encontrado.');
  return s;
}

const SQL_LISTA = `SELECT s.*, u.nome AS responsavel_nome,
  (SELECT MIN(vencimento) FROM lancamentos l WHERE l.servico_id = s.id AND l.status NOT IN ('pago','cancelado')) AS proximo_vencimento
  FROM servicos s LEFT JOIN usuarios u ON u.id = s.responsavel_id`;

function enriquecer(s, cfg) {
  const brl = fin.valorEmReais(s, cfg);
  return { ...s, valor_brl_centavos: brl, mensal_equivalente_centavos: Math.round(brl * fin.fatorMensal(s)) };
}

router.get('/', A.exigir('servicos.ver'), (req, res) => {
  const cfg = getConfig();
  const where = []; const args = [];
  if (req.query.status) { where.push('s.status = ?'); args.push(req.query.status); }
  if (req.query.categoria) { where.push('s.categoria = ?'); args.push(req.query.categoria); }
  if (req.query.busca) { where.push('(s.nome LIKE ? OR s.fornecedor LIKE ?)'); args.push(`%${req.query.busca}%`, `%${req.query.busca}%`); }
  const rows = db.prepare(`${SQL_LISTA} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY s.status = 'cancelado', s.nome`).all(...args);
  res.json(rows.map((s) => enriquecer(s, cfg)));
});

router.get('/categorias', A.exigirLogin, (_req, res) => {
  const usadas = db.prepare('SELECT DISTINCT categoria FROM servicos UNION SELECT DISTINCT categoria FROM lancamentos WHERE categoria IS NOT NULL').all().map((r) => r.categoria);
  const base = ['Telefonia', 'Inteligência artificial', 'Hospedagem e domínios', 'Certificados', 'Marketing', 'Automação', 'Atendimento', 'Software', 'Serviços terceirizados', 'Contratos', 'Administrativo', 'Jurídico'];
  res.json([...new Set([...base, ...usadas])].sort((a, b) => a.localeCompare(b, 'pt-BR')));
});

router.get('/:id', A.exigir('servicos.ver'), (req, res) => {
  const s = db.prepare(`${SQL_LISTA} WHERE s.id = ?`).get(req.params.id);
  if (!s) throw new HttpError(404, 'Serviço não encontrado.');
  const lancamentos = db.prepare('SELECT * FROM lancamentos WHERE servico_id = ? ORDER BY vencimento DESC').all(s.id);
  const aumentos = db.prepare('SELECT * FROM alteracoes_preco WHERE servico_id = ? ORDER BY detectado_em DESC').all(s.id);
  const documentos = A.tem(req, 'documentos.ver')
    ? db.prepare('SELECT id, tipo, nome_original, tamanho, competencia, lancamento_id, criado_em FROM documentos WHERE servico_id = ? ORDER BY criado_em DESC').all(s.id) : null;
  res.json({ ...enriquecer(s, getConfig()), lancamentos, aumentos, documentos });
});

router.post('/', A.exigir('servicos.editar'), (req, res) => {
  const s = validar(req.body);
  const id = tx(() => {
    const novoId = Number(db.prepare(`INSERT INTO servicos (nome, fornecedor, categoria, descricao, tipo_valor, valor_centavos, moeda, periodicidade,
      intervalo_qtd, intervalo_unidade, base_vencimento, dia_cobranca, forma_pagamento, responsavel_id, email_fornecedor, telefone,
      link_fornecedor, link_pagamento, data_contratacao, data_renovacao, prazo_cancelamento_dias, observacoes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      s.nome, s.fornecedor, s.categoria, s.descricao, s.tipo_valor, s.valor_centavos, s.moeda, s.periodicidade,
      s.intervalo_qtd, s.intervalo_unidade, s.base_vencimento, s.dia_cobranca, s.forma_pagamento, s.responsavel_id,
      s.email_fornecedor, s.telefone, s.link_fornecedor, s.link_pagamento, s.data_contratacao, s.data_renovacao,
      s.prazo_cancelamento_dias, s.observacoes).lastInsertRowid);
    const criado = db.prepare('SELECT * FROM servicos WHERE id = ?').get(novoId);
    fin.gerarLancamentosServico(criado);
    fin.marcarAtrasados();
    A.auditar(req, 'cadastrou serviço', 'servico', novoId, null, criado);
    return novoId;
  });
  res.status(201).json({ id });
});

router.put('/:id', A.exigir('servicos.editar'), (req, res) => {
  const antes = db.prepare('SELECT * FROM servicos WHERE id = ?').get(req.params.id);
  if (!antes) throw new HttpError(404, 'Serviço não encontrado.');
  const s = validar(req.body, antes);
  let aumentoId = null;
  tx(() => {
    db.prepare(`UPDATE servicos SET nome=?, fornecedor=?, categoria=?, descricao=?, tipo_valor=?, valor_centavos=?, moeda=?, periodicidade=?,
      intervalo_qtd=?, intervalo_unidade=?, base_vencimento=?, dia_cobranca=?, forma_pagamento=?, responsavel_id=?, email_fornecedor=?, telefone=?,
      link_fornecedor=?, link_pagamento=?, data_contratacao=?, data_renovacao=?, prazo_cancelamento_dias=?, observacoes=?, atualizado_em=datetime('now')
      WHERE id = ?`).run(s.nome, s.fornecedor, s.categoria, s.descricao, s.tipo_valor, s.valor_centavos, s.moeda, s.periodicidade,
      s.intervalo_qtd, s.intervalo_unidade, s.base_vencimento, s.dia_cobranca, s.forma_pagamento, s.responsavel_id, s.email_fornecedor,
      s.telefone, s.link_fornecedor, s.link_pagamento, s.data_contratacao, s.data_renovacao, s.prazo_cancelamento_dias, s.observacoes, antes.id);
    const depois = db.prepare('SELECT * FROM servicos WHERE id = ?').get(antes.id);
    const mudouRecorrencia = ['periodicidade', 'intervalo_qtd', 'intervalo_unidade', 'base_vencimento', 'dia_cobranca'].some((k) => antes[k] !== depois[k]);
    if (mudouRecorrencia) fin.removerFuturosIntocados(antes.id);
    if (antes.valor_centavos !== depois.valor_centavos || antes.moeda !== depois.moeda || antes.nome !== depois.nome) {
      fin.atualizarPrevistos(depois);
      db.prepare(`UPDATE lancamentos SET descricao = ?, fornecedor = ?, categoria = ? WHERE servico_id = ? AND status NOT IN ('pago','cancelado')`)
        .run(depois.nome, depois.fornecedor, depois.categoria, depois.id);
    }
    if (depois.moeda === antes.moeda && depois.valor_centavos > antes.valor_centavos && antes.valor_centavos > 0) {
      aumentoId = Number(db.prepare(`INSERT INTO alteracoes_preco (servico_id, valor_anterior_centavos, valor_novo_centavos, origem) VALUES (?, ?, ?, 'cadastro')`)
        .run(antes.id, fin.valorEmReais(antes), fin.valorEmReais(depois)).lastInsertRowid);
    }
    fin.gerarLancamentosServico(depois);
    fin.marcarAtrasados();
    A.auditar(req, 'editou serviço', 'servico', antes.id, antes, depois);
  });
  if (aumentoId) notificarAumento(aumentoId);
  res.json({ ok: true });
});

router.post('/:id/:acao(pausar|cancelar|reativar)', A.exigir('servicos.editar'), (req, res) => {
  const antes = db.prepare('SELECT * FROM servicos WHERE id = ?').get(req.params.id);
  if (!antes) throw new HttpError(404, 'Serviço não encontrado.');
  const acao = req.params.acao;
  tx(() => {
    if (acao === 'pausar') {
      if (antes.status !== 'ativo') throw new HttpError(400, 'Só é possível pausar um serviço ativo.');
      db.prepare("UPDATE servicos SET status = 'pausado', atualizado_em = datetime('now') WHERE id = ?").run(antes.id);
      fin.removerFuturosIntocados(antes.id);
    } else if (acao === 'cancelar') {
      if (antes.status === 'cancelado') throw new HttpError(400, 'Este serviço já está cancelado.');
      db.prepare("UPDATE servicos SET status = 'cancelado', atualizado_em = datetime('now') WHERE id = ?").run(antes.id);
      fin.cancelarFuturos(antes.id);
    } else {
      if (antes.status === 'ativo') throw new HttpError(400, 'Este serviço já está ativo.');
      // Retoma a partir da próxima ocorrência — não cria cobranças retroativas do período pausado
      const proxima = fin.proximaOcorrenciaDesde(antes, hoje());
      fin.restaurarFuturos(antes.id);
      db.prepare("UPDATE servicos SET status = 'ativo', base_vencimento = ?, atualizado_em = datetime('now') WHERE id = ?").run(proxima, antes.id);
      fin.gerarLancamentosServico(db.prepare('SELECT * FROM servicos WHERE id = ?').get(antes.id));
    }
    const depois = db.prepare('SELECT * FROM servicos WHERE id = ?').get(antes.id);
    A.auditar(req, { pausar: 'pausou serviço', cancelar: 'cancelou serviço', reativar: 'reativou serviço' }[acao], 'servico', antes.id, antes, depois);
  });
  res.json({ ok: true });
});

router.post('/aumentos/:id/revisar', A.exigir('lancamentos.editar'), (req, res) => {
  const a = db.prepare('SELECT * FROM alteracoes_preco WHERE id = ?').get(req.params.id);
  if (!a) throw new HttpError(404, 'Registro não encontrado.');
  db.prepare('UPDATE alteracoes_preco SET revisado = 1 WHERE id = ?').run(a.id);
  A.auditar(req, 'marcou aumento como revisado', 'alteracao_preco', a.id, a, { ...a, revisado: 1 });
  res.json({ ok: true });
});

module.exports = router;
