'use strict';
const crypto = require('node:crypto');
const express = require('express');
const { db, getConfig, setConfig } = require('../db');
const A = require('../auth');
const whatsapp = require('../whatsapp');
const { executarRotinas, TIPOS_ALERTA } = require('../jobs');
const { HttpError, txt, parseValor, int } = require('../util');

const router = express.Router();
const assincrono = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------- Notificações do usuário logado ----------
router.get('/notificacoes', A.exigirLogin, (req, res) => {
  const soNaoLidas = req.query.nao_lidas === '1';
  const itens = db.prepare(`SELECT n.*, (SELECT status FROM envios_whatsapp e WHERE e.notificacao_id = n.id LIMIT 1) AS whatsapp_status
    FROM notificacoes n WHERE n.usuario_id = ? ${soNaoLidas ? 'AND n.lida_em IS NULL' : ''} ORDER BY n.criado_em DESC, n.id DESC LIMIT 200`).all(req.usuario.id);
  const naoLidas = db.prepare('SELECT COUNT(*) AS n FROM notificacoes WHERE usuario_id = ? AND lida_em IS NULL').get(req.usuario.id).n;
  res.json({ itens, nao_lidas: naoLidas });
});
router.post('/notificacoes/ler-todas', A.exigirLogin, (req, res) => {
  db.prepare("UPDATE notificacoes SET lida_em = datetime('now') WHERE usuario_id = ? AND lida_em IS NULL").run(req.usuario.id);
  res.json({ ok: true });
});
router.post('/notificacoes/:id/lida', A.exigirLogin, (req, res) => {
  db.prepare("UPDATE notificacoes SET lida_em = COALESCE(lida_em, datetime('now')) WHERE id = ? AND usuario_id = ?").run(req.params.id, req.usuario.id);
  res.json({ ok: true });
});

// ---------- Configurações (administrador) ----------
router.get('/config', A.exigir('config.gerenciar'), (_req, res) => {
  const cfg = getConfig();
  res.json({
    ...cfg,
    whatsapp: whatsapp.status(),
    cobrancas_webhook_ativo: !!process.env.COBRANCAS_WEBHOOK_TOKEN,
    envios_recentes: db.prepare('SELECT id, destino, destino_nome, tipo, status, erro, provedor, tentativas, criado_em, atualizado_em FROM envios_whatsapp ORDER BY id DESC LIMIT 60').all(),
    tipos_alerta: TIPOS_ALERTA,
  });
});

router.put('/config', A.exigir('config.gerenciar'), (req, res) => {
  const antes = getConfig();
  const b = req.body;
  const listaDias = (v, max) => [...new Set((Array.isArray(v) ? v : String(v || '').split(/[,;\s]+/)).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= max))].sort((x, y) => y - x);
  if (b.alertas_dias_antes !== undefined) setConfig('alertas_dias_antes', listaDias(b.alertas_dias_antes, 60));
  if (b.alertas_renovacao_dias !== undefined) setConfig('alertas_renovacao_dias', listaDias(b.alertas_renovacao_dias, 180));
  if (b.juridico_alertas_prazo !== undefined) setConfig('juridico_alertas_prazo', listaDias(b.juridico_alertas_prazo, 60));
  if (b.juridico_alertas_audiencia !== undefined) setConfig('juridico_alertas_audiencia', listaDias(b.juridico_alertas_audiencia, 60));
  if (b.juridico_dias_sem_andamento !== undefined) { const n = int(b.juridico_dias_sem_andamento); if (!(n >= 5 && n <= 365)) throw new HttpError(400, 'Dias sem andamento: entre 5 e 365.'); setConfig('juridico_dias_sem_andamento', n); }
  if (b.alerta_atraso_diario !== undefined) setConfig('alerta_atraso_diario', !!b.alerta_atraso_diario);
  if (b.aprovacao_ativa !== undefined) setConfig('aprovacao_ativa', !!b.aprovacao_ativa);
  if (b.aprovacao_acima !== undefined) {
    const v = parseValor(b.aprovacao_acima);
    if (v == null || Number.isNaN(v)) throw new HttpError(400, 'Valor mínimo para aprovação inválido.');
    setConfig('aprovacao_acima_centavos', v);
  }
  if (b.cotacoes) {
    const c = {};
    for (const m of ['USD', 'EUR']) { const n = Number(String(b.cotacoes[m] ?? antes.cotacoes?.[m]).replace(',', '.')); if (!(n > 0)) throw new HttpError(400, `Cotação de ${m} inválida.`); c[m] = n; }
    setConfig('cotacoes', c);
  }
  if (b.horizonte_geracao_dias !== undefined) { const n = int(b.horizonte_geracao_dias); if (!(n >= 7 && n <= 400)) throw new HttpError(400, 'Horizonte deve ficar entre 7 e 400 dias.'); setConfig('horizonte_geracao_dias', n); }
  if (b.aumento_minimo_percentual !== undefined) { const n = Number(String(b.aumento_minimo_percentual).replace(',', '.')); if (!(n >= 0 && n <= 100)) throw new HttpError(400, 'Percentual inválido.'); setConfig('aumento_minimo_percentual', n); }
  if (b.whatsapp_destinatarios_extras !== undefined) {
    if (!Array.isArray(b.whatsapp_destinatarios_extras)) throw new HttpError(400, 'Lista de destinatários inválida.');
    setConfig('whatsapp_destinatarios_extras', b.whatsapp_destinatarios_extras.slice(0, 20).map((d) => ({
      nome: txt(d.nome, 80) || 'Destinatário', numero: whatsapp.normalizarNumero(d.numero),
      tipos: (d.tipos || []).filter((t) => TIPOS_ALERTA[t]), ativo: d.ativo !== false,
    })).filter((d) => d.numero));
  }
  A.auditar(req, 'alterou configurações', 'configuracao', null, antes, getConfig());
  res.json(getConfig());
});

router.post('/config/whatsapp/teste', A.exigir('config.gerenciar'), assincrono(async (req, res) => {
  const st = whatsapp.status();
  if (!st.conectado) throw new HttpError(409, st.mensagem);
  const numero = whatsapp.normalizarNumero(req.body.numero || req.usuario.whatsapp);
  if (!numero) throw new HttpError(400, 'Informe o número que vai receber o teste.');
  const chave = `teste:${numero}:${Date.now()}`;
  whatsapp.enfileirar({
    chave, destino: numero, destinoNome: req.usuario.nome, tipo: 'teste',
    mensagem: 'AS CONTROL | TESTE DE CONEXÃO\n\nSe você recebeu esta mensagem, os alertas do AS Control estão chegando por WhatsApp.',
    partes: ['TESTE DE CONEXÃO', 'Mensagem de teste do AS Control.', '-', '-', 'Teste', process.env.APP_URL || '-'],
  });
  await whatsapp.processarFila();
  const envio = db.prepare('SELECT status, erro FROM envios_whatsapp WHERE chave = ?').get(chave);
  A.auditar(req, 'enviou teste de WhatsApp', 'integracao', null, null, { numero, ...envio });
  if (envio.status === 'falhou') throw new HttpError(502, `O provedor recusou o envio: ${envio.erro}`);
  res.json({ ok: true, status: envio.status });
}));

router.post('/config/rotinas/executar', A.exigir('config.gerenciar'), assincrono(async (req, res) => {
  const r = await executarRotinas();
  A.auditar(req, 'executou rotinas manualmente', 'sistema', null, null, r);
  res.json(r || { aviso: 'As rotinas já estavam em execução.' });
}));

// ---------- Auditoria ----------
router.get('/auditoria', A.exigir('auditoria.ver'), (req, res) => {
  const w = []; const a = [];
  if (req.query.entidade) { w.push('entidade = ?'); a.push(req.query.entidade); }
  if (req.query.usuario_id) { w.push('usuario_id = ?'); a.push(req.query.usuario_id); }
  if (req.query.de) { w.push('criado_em >= ?'); a.push(req.query.de); }
  if (req.query.ate) { w.push("criado_em < date(?, '+1 day')"); a.push(req.query.ate); }
  if (req.query.busca) { w.push('(acao LIKE ? OR usuario_nome LIKE ?)'); a.push(`%${req.query.busca}%`, `%${req.query.busca}%`); }
  const pagina = Math.max(1, int(req.query.pagina) || 1);
  res.json(db.prepare(`SELECT * FROM auditoria ${w.length ? `WHERE ${w.join(' AND ')}` : ''} ORDER BY id DESC LIMIT 100 OFFSET ?`).all(...a, (pagina - 1) * 100));
});

// ---------- Webhook da Meta (verificação + status de entrega) ----------
const webhookWhatsapp = express.Router();
webhookWhatsapp.get('/', (req, res) => {
  const token = process.env.WHATSAPP_META_VERIFY_TOKEN;
  if (token && req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === token) return res.send(String(req.query['hub.challenge']));
  res.sendStatus(403);
});
webhookWhatsapp.post('/', express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }), (req, res) => {
  const segredo = process.env.WHATSAPP_META_APP_SECRET;
  if (segredo) {
    const assinatura = String(req.headers['x-hub-signature-256'] || '');
    const esperado = `sha256=${crypto.createHmac('sha256', segredo).update(req.rawBody || '').digest('hex')}`;
    if (assinatura.length !== esperado.length || !crypto.timingSafeEqual(Buffer.from(assinatura), Buffer.from(esperado))) return res.sendStatus(401);
  }
  whatsapp.registrarStatusMeta(req.body);
  res.sendStatus(200);
});

module.exports = { router, webhookWhatsapp };
