'use strict';
/*
 * Central de cobranças: tudo que chega (cadastro manual hoje; e-mail/integração no futuro) entra numa fila.
 * Nada vira lançamento, e NADA é marcado como pago, sem a confirmação de uma pessoa.
 */
const crypto = require('node:crypto');
const express = require('express');
const { db, tx, getConfig } = require('../db');
const A = require('../auth');
const fin = require('../financeiro');
const { notificarAumento, notificarCobrancaRecebida } = require('../jobs');
const { HttpError, txt, int, parseValor, parseData, competenciaDe, diffDias } = require('../util');

const router = express.Router();

function sugestoes(c) {
  const termos = [];
  const args = [];
  if (c.servico_id) { termos.push('l.servico_id = ?'); args.push(c.servico_id); }
  if (c.fornecedor) { termos.push('l.fornecedor LIKE ?'); args.push(`%${c.fornecedor}%`); }
  if (!termos.length) return [];
  const rows = db.prepare(`SELECT l.id, l.descricao, l.fornecedor, l.vencimento, l.competencia, l.status, l.valor_previsto_centavos, l.valor_cobrado_centavos
    FROM lancamentos l WHERE (${termos.join(' OR ')}) AND l.status NOT IN ('pago','cancelado') ORDER BY l.vencimento LIMIT 30`).all(...args);
  const ref = c.vencimento || new Date().toISOString().slice(0, 10);
  return rows
    .map((l) => ({ ...l, distancia_dias: Math.abs(diffDias(l.vencimento, ref)), diferenca_centavos: c.valor_centavos == null ? null : c.valor_centavos - l.valor_previsto_centavos }))
    .sort((a, b) => a.distancia_dias - b.distancia_dias).slice(0, 5);
}

function criarCobranca(dados, origem, usuarioId) {
  const valor = parseValor(dados.valor);
  if (valor == null || Number.isNaN(valor)) throw new HttpError(400, 'Informe o valor da cobrança.');
  if (dados.vencimento && !parseData(dados.vencimento)) throw new HttpError(400, 'Vencimento inválido.');
  let servicoId = int(dados.servico_id);
  const fornecedor = txt(dados.fornecedor, 150);
  if (!servicoId && fornecedor) servicoId = db.prepare("SELECT id FROM servicos WHERE fornecedor LIKE ? AND status != 'cancelado' ORDER BY status = 'ativo' DESC LIMIT 1").get(`%${fornecedor}%`)?.id || null;
  const id = Number(db.prepare(`INSERT INTO cobrancas_recebidas (origem, fornecedor, servico_id, valor_centavos, vencimento, competencia, numero_fatura, remetente, assunto, documento_id, observacoes, criado_por)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(origem, fornecedor, servicoId, valor, dados.vencimento || null,
    /^\d{4}-\d{2}$/.test(dados.competencia || '') ? dados.competencia : (dados.vencimento ? competenciaDe(dados.vencimento) : null),
    txt(dados.numero_fatura, 80), txt(dados.remetente, 200), txt(dados.assunto, 300), int(dados.documento_id), txt(dados.observacoes, 2000), usuarioId ?? null).lastInsertRowid);
  return id;
}

router.get('/', A.exigir('cobrancas.conferir'), (req, res) => {
  const status = ['pendente', 'confirmada', 'descartada'].includes(req.query.status) ? req.query.status : 'pendente';
  const rows = db.prepare(`SELECT c.*, s.nome AS servico_nome, u.nome AS revisado_por_nome FROM cobrancas_recebidas c
    LEFT JOIN servicos s ON s.id = c.servico_id LEFT JOIN usuarios u ON u.id = c.revisado_por WHERE c.status = ? ORDER BY c.criado_em DESC LIMIT 300`).all(status);
  res.json(rows.map((c) => (status === 'pendente' ? { ...c, sugestoes: sugestoes(c) } : c)));
});

router.post('/', A.exigir('cobrancas.conferir'), (req, res) => {
  const id = criarCobranca(req.body, 'manual', req.usuario.id);
  A.auditar(req, 'registrou cobrança recebida', 'cobranca', id, null, db.prepare('SELECT * FROM cobrancas_recebidas WHERE id = ?').get(id));
  res.status(201).json({ id });
});

router.post('/:id/confirmar', A.exigir('cobrancas.conferir', 'lancamentos.editar'), (req, res) => {
  const c = db.prepare('SELECT * FROM cobrancas_recebidas WHERE id = ?').get(req.params.id);
  if (!c || c.status !== 'pendente') throw new HttpError(400, 'Esta cobrança já foi conferida.');
  let aumentoId = null; let lancId;
  tx(() => {
    if (req.body.modo === 'avulsa') {
      if (!c.vencimento) throw new HttpError(400, 'Informe o vencimento na cobrança antes de criar a despesa.');
      lancId = Number(db.prepare(`INSERT INTO lancamentos (avulsa, descricao, fornecedor, categoria, competencia, vencimento, valor_previsto_centavos, valor_cobrado_centavos, status, numero_fatura, responsavel_id)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?, 'aguardando_pagamento', ?, ?)`).run(txt(req.body.descricao, 200) || `Cobrança ${c.fornecedor || ''}`.trim(),
        c.fornecedor || 'Não informado', txt(req.body.categoria, 80) || 'Administrativo', c.competencia || competenciaDe(c.vencimento), c.vencimento,
        c.valor_centavos, c.valor_centavos, c.numero_fatura, req.usuario.id).lastInsertRowid);
    } else {
      const l = db.prepare('SELECT * FROM lancamentos WHERE id = ?').get(int(req.body.lancamento_id));
      if (!l) throw new HttpError(400, 'Escolha o lançamento correspondente.');
      if (['pago', 'cancelado'].includes(l.status)) throw new HttpError(400, 'O lançamento escolhido já está pago ou cancelado.');
      const diverge = l.valor_previsto_centavos && Math.abs(c.valor_centavos - l.valor_previsto_centavos) > l.valor_previsto_centavos * (Number(getConfig().aumento_minimo_percentual ?? 1) / 100);
      const novoStatus = l.status === 'atrasado' ? 'atrasado' : (diverge ? 'pendente_conferencia' : 'aguardando_pagamento');
      const usarVenc = req.body.usar_vencimento && c.vencimento;
      db.prepare(`UPDATE lancamentos SET valor_cobrado_centavos = ?, numero_fatura = COALESCE(?, numero_fatura), vencimento = ?, status = ?,
        aprovado_por = NULL, aprovado_em = NULL, atualizado_em = datetime('now') WHERE id = ?`)
        .run(c.valor_centavos, c.numero_fatura, usarVenc ? c.vencimento : l.vencimento, novoStatus, l.id);
      aumentoId = fin.registrarAumentoSeHouver(l, c.valor_centavos);
      fin.marcarAtrasados();
      A.auditar(req, 'vinculou cobrança ao lançamento', 'lancamento', l.id, l, db.prepare('SELECT * FROM lancamentos WHERE id = ?').get(l.id));
      lancId = l.id;
    }
    if (c.documento_id) db.prepare('UPDATE documentos SET lancamento_id = ?, servico_id = (SELECT servico_id FROM lancamentos WHERE id = ?) WHERE id = ?').run(lancId, lancId, c.documento_id);
    db.prepare(`UPDATE cobrancas_recebidas SET status = 'confirmada', lancamento_id = ?, revisado_por = ?, revisado_em = datetime('now') WHERE id = ?`).run(lancId, req.usuario.id, c.id);
    A.auditar(req, 'confirmou cobrança recebida', 'cobranca', c.id, c, db.prepare('SELECT * FROM cobrancas_recebidas WHERE id = ?').get(c.id));
  });
  if (aumentoId) notificarAumento(aumentoId);
  res.json({ ok: true, lancamento_id: lancId });
});

router.post('/:id/descartar', A.exigir('cobrancas.conferir'), (req, res) => {
  const c = db.prepare('SELECT * FROM cobrancas_recebidas WHERE id = ?').get(req.params.id);
  if (!c || c.status !== 'pendente') throw new HttpError(400, 'Esta cobrança já foi conferida.');
  const motivo = txt(req.body.motivo, 500);
  if (!motivo) throw new HttpError(400, 'Informe o motivo do descarte.');
  db.prepare(`UPDATE cobrancas_recebidas SET status = 'descartada', observacoes = trim(COALESCE(observacoes,'') || char(10) || ?), revisado_por = ?, revisado_em = datetime('now') WHERE id = ?`)
    .run(`Descartada: ${motivo}`, req.usuario.id, c.id);
  A.auditar(req, 'descartou cobrança recebida', 'cobranca', c.id, c, null);
  res.json({ ok: true });
});

// Entrada para integrações futuras (ex.: leitor da caixa de cobranças no Gmail via n8n).
// Só fica ativa se COBRANCAS_WEBHOOK_TOKEN estiver definido. Apenas cria itens na fila — nunca lança nem paga.
const webhook = express.Router();
webhook.post('/', (req, res) => {
  const token = process.env.COBRANCAS_WEBHOOK_TOKEN;
  if (!token) throw new HttpError(404, 'Integração de cobranças não configurada.');
  const enviado = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(enviado); const b = Buffer.from(token);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new HttpError(401, 'Token inválido.');
  const id = criarCobranca(req.body || {}, req.body?.origem === 'email' ? 'email' : 'integracao', null);
  A.auditar(null, 'recebeu cobrança por integração', 'cobranca', id, null, db.prepare('SELECT * FROM cobrancas_recebidas WHERE id = ?').get(id));
  notificarCobrancaRecebida(id);
  res.status(201).json({ id, status: 'pendente_conferencia' });
});

module.exports = { router, webhook };
