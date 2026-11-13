'use strict';
const router = require('express').Router();
const { db, getConfig } = require('../db');
const A = require('../auth');
const fin = require('../financeiro');
const { STATUS_LABEL } = require('../jobs');
const { hoje, addDias, addMeses, competenciaDe, inicioMes, fimMes, mesAnterior, dataBR } = require('../util');

const efetivo = 'COALESCE(l.valor_cobrado_centavos, l.valor_previsto_centavos)';

function somaMes(comp) {
  return db.prepare(`SELECT COALESCE(SUM(${efetivo}),0) AS previsto,
    COALESCE(SUM(CASE WHEN l.status = 'pago' THEN l.valor_cobrado_centavos ELSE 0 END),0) AS pago,
    COUNT(*) AS qtd FROM lancamentos l WHERE l.vencimento BETWEEN ? AND ? AND l.status != 'cancelado'`).get(inicioMes(comp), fimMes(comp));
}

router.get('/dashboard', A.exigir('lancamentos.ver'), (req, res) => {
  const cfg = getConfig();
  const h = hoje(); const comp = competenciaDe(h);
  const ativos = db.prepare("SELECT * FROM servicos WHERE status = 'ativo'").all();
  const mensal = ativos.reduce((t, s) => t + fin.valorEmReais(s, cfg) * fin.fatorMensal(s), 0);
  const mes = somaMes(comp);
  const vencidas = db.prepare(`SELECT COUNT(*) AS qtd, COALESCE(SUM(${efetivo}),0) AS total FROM lancamentos l WHERE l.status = 'atrasado'`).get();
  const renov = db.prepare("SELECT id, nome, data_renovacao, prazo_cancelamento_dias FROM servicos WHERE status != 'cancelado' AND data_renovacao BETWEEN ? AND ? ORDER BY data_renovacao").all(h, addDias(h, 60));

  const abertos = (de, ate) => db.prepare(`SELECT l.id, l.descricao, l.fornecedor, l.vencimento, l.status, ${efetivo} AS valor, u.nome AS responsavel_nome
    FROM lancamentos l LEFT JOIN usuarios u ON u.id = l.responsavel_id
    WHERE l.status NOT IN ('pago','cancelado') AND l.vencimento BETWEEN ? AND ? ORDER BY l.vencimento, l.descricao`).all(de, ate);

  const evolucao = [];
  for (let i = 11; i >= 0; i--) { const c = mesAnterior(comp, i); evolucao.push({ competencia: c, ...somaMes(c) }); }

  const porCategoria = {};
  for (const s of ativos) porCategoria[s.categoria] = (porCategoria[s.categoria] || 0) + fin.valorEmReais(s, cfg) * fin.fatorMensal(s);

  // Linha do tempo: próximos 30 dias, todos os lançamentos (inclusive pagos) para ver o ritmo de vencimentos
  const linhaTempo = db.prepare(`SELECT l.id, l.descricao, l.vencimento, l.status, ${efetivo} AS valor FROM lancamentos l
    WHERE l.status != 'cancelado' AND l.vencimento BETWEEN ? AND ? ORDER BY l.vencimento`).all(addDias(h, -7), addDias(h, 30));

  res.json({
    hoje: h, competencia: comp,
    indicadores: {
      recorrente_mensal: Math.round(mensal), projecao_anual: Math.round(mensal * 12),
      previsto_mes: mes.previsto, pago_mes: mes.pago, pendente_mes: mes.previsto - mes.pago,
      vencidas_qtd: vencidas.qtd, vencidas_total: vencidas.total, servicos_ativos: ativos.length, renovacoes_proximas: renov.length,
    },
    atencao: {
      hoje: abertos(h, h), amanha: abertos(addDias(h, 1), addDias(h, 1)),
      sete_dias: abertos(addDias(h, 2), addDias(h, 7)), trinta_dias: abertos(addDias(h, 8), addDias(h, 30)),
      atrasados: db.prepare(`SELECT l.id, l.descricao, l.fornecedor, l.vencimento, l.status, ${efetivo} AS valor, u.nome AS responsavel_nome
        FROM lancamentos l LEFT JOIN usuarios u ON u.id = l.responsavel_id WHERE l.status = 'atrasado' ORDER BY l.vencimento`).all(),
      cobrancas_pendentes: db.prepare("SELECT COUNT(*) AS n FROM cobrancas_recebidas WHERE status = 'pendente'").get().n,
      aumentos: db.prepare(`SELECT a.*, s.nome FROM alteracoes_preco a JOIN servicos s ON s.id = a.servico_id WHERE a.revisado = 0 ORDER BY a.detectado_em DESC LIMIT 10`).all(),
      renovacoes: renov,
    },
    evolucao,
    categorias: Object.entries(porCategoria).map(([categoria, v]) => ({ categoria, mensal: Math.round(v) })).sort((a, b) => b.mensal - a.mensal),
    comparacao: { atual: mes, anterior: somaMes(mesAnterior(comp)), ano_anterior: somaMes(mesAnterior(comp, 12)) },
    linha_tempo: linhaTempo,
  });
});

// ---------- Relatórios ----------
const AGRUPAMENTOS = {
  mes: 'l.competencia', categoria: 'l.categoria', fornecedor: 'l.fornecedor', status: 'l.status',
  servico: "COALESCE(l.descricao, 'Sem descrição')", responsavel: "COALESCE(u.nome, 'Sem responsável')",
};
function filtrosRel(q) {
  const w = ["l.status != 'cancelado' OR ? = 'cancelado'"]; const a = [q.status || ''];
  const h = hoje();
  const de = q.de || `${h.slice(0, 4)}-01-01`; const ate = q.ate || `${h.slice(0, 4)}-12-31`;
  w.push('l.vencimento BETWEEN ? AND ?'); a.push(de, ate);
  for (const [k, col] of [['categoria', 'l.categoria'], ['fornecedor', 'l.fornecedor'], ['responsavel_id', 'l.responsavel_id'], ['servico_id', 'l.servico_id']]) {
    if (q[k]) { w.push(`${col} = ?`); a.push(q[k]); }
  }
  if (q.status === 'abertos') w.push("l.status NOT IN ('pago','cancelado')");
  else if (q.status) { w.push('l.status = ?'); a.push(q.status); }
  return { where: `WHERE (${w[0]}) AND ${w.slice(1).join(' AND ')}`, args: a, de, ate };
}

router.get('/relatorios', A.exigir('relatorios.ver'), (req, res) => {
  const { where, args, de, ate } = filtrosRel(req.query);
  const col = AGRUPAMENTOS[req.query.agrupar] || AGRUPAMENTOS.mes;
  const grupos = db.prepare(`SELECT ${col} AS grupo, COUNT(*) AS qtd, SUM(${efetivo}) AS total,
    SUM(CASE WHEN l.status = 'pago' THEN l.valor_cobrado_centavos ELSE 0 END) AS pago,
    SUM(CASE WHEN l.status NOT IN ('pago','cancelado') THEN ${efetivo} ELSE 0 END) AS pendente
    FROM lancamentos l LEFT JOIN usuarios u ON u.id = l.responsavel_id ${where} GROUP BY grupo ORDER BY ${req.query.agrupar === 'mes' || !req.query.agrupar ? 'grupo' : 'total DESC'}`).all(...args);
  const totais = grupos.reduce((t, g) => ({ qtd: t.qtd + g.qtd, total: t.total + (g.total || 0), pago: t.pago + (g.pago || 0), pendente: t.pendente + (g.pendente || 0) }), { qtd: 0, total: 0, pago: 0, pendente: 0 });
  res.json({ de, ate, agrupar: req.query.agrupar || 'mes', grupos: grupos.map((g) => ({ ...g, rotulo: req.query.agrupar === 'status' ? STATUS_LABEL[g.grupo] : g.grupo })), totais });
});

router.get('/relatorios/indicadores', A.exigir('relatorios.ver'), (req, res) => {
  const cfg = getConfig();
  const h = hoje();
  const ativos = db.prepare("SELECT * FROM servicos WHERE status = 'ativo'").all();
  // Projeção dos próximos 12 meses a partir das recorrências ativas
  const projecao = {};
  for (let i = 0; i < 12; i++) projecao[competenciaDe(addMeses(`${competenciaDe(h)}-01`, i, 1))] = 0;
  const limite = fimMes(Object.keys(projecao).at(-1));
  for (const s of ativos) {
    const v = fin.valorEmReais(s, cfg);
    for (let k = 0; k < 400; k++) {
      const d = fin.ocorrencia(s, k);
      if (d > limite) break;
      if (d >= `${competenciaDe(h)}-01` && projecao[competenciaDe(d)] !== undefined) projecao[competenciaDe(d)] += v;
    }
  }
  res.json({
    mais_caros: ativos.map((s) => ({ id: s.id, nome: s.nome, fornecedor: s.fornecedor, categoria: s.categoria, mensal: Math.round(fin.valorEmReais(s, cfg) * fin.fatorMensal(s)) }))
      .sort((a, b) => b.mensal - a.mensal).slice(0, 10),
    cancelados: db.prepare("SELECT id, nome, fornecedor, categoria, valor_centavos, moeda, atualizado_em FROM servicos WHERE status = 'cancelado' ORDER BY atualizado_em DESC").all(),
    aumentos: db.prepare(`SELECT a.*, s.nome FROM alteracoes_preco a JOIN servicos s ON s.id = a.servico_id ORDER BY a.detectado_em DESC LIMIT 50`).all(),
    projecao: Object.entries(projecao).map(([competencia, total]) => ({ competencia, total: Math.round(total) })),
  });
});

router.get('/relatorios/csv', A.exigir('relatorios.ver'), (req, res) => {
  const { where, args, de, ate } = filtrosRel(req.query);
  const rows = db.prepare(`SELECT l.*, u.nome AS responsavel_nome FROM lancamentos l LEFT JOIN usuarios u ON u.id = l.responsavel_id ${where} ORDER BY l.vencimento`).all(...args);
  const esc = (v) => { const s = v == null ? '' : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const reais = (c) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','));
  const linhas = [['ID', 'Serviço/Despesa', 'Fornecedor', 'Categoria', 'Competência', 'Vencimento', 'Valor previsto', 'Valor cobrado', 'Status', 'Data pagamento', 'Responsável', 'Nº fatura', 'Avulsa']];
  for (const l of rows) linhas.push([l.id, l.descricao, l.fornecedor, l.categoria, l.competencia, dataBR(l.vencimento), reais(l.valor_previsto_centavos), reais(l.valor_cobrado_centavos),
    STATUS_LABEL[l.status], l.data_pagamento ? dataBR(l.data_pagamento) : '', l.responsavel_nome || '', l.numero_fatura || '', l.avulsa ? 'Sim' : 'Não']);
  A.auditar(req, 'exportou relatório CSV', 'relatorio', null, null, { de, ate, linhas: rows.length });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="as-control_${de}_${ate}.csv"`);
  res.send(`\uFEFF${linhas.map((l) => l.map(esc).join(';')).join('\r\n')}`);
});

module.exports = router;
