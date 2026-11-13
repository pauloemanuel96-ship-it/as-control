'use strict';
/*
 * Camada de WhatsApp desacoplada.
 * O restante do sistema só conhece enfileirar() e processarFila(). Trocar de provedor = mudar variáveis de ambiente.
 * Nada é simulado: sem provedor configurado, os envios ficam com status "pendente_conexao" e nada é marcado como enviado.
 *
 * Provedores:
 *   meta    → WhatsApp Business Cloud API oficial (graph.facebook.com)
 *   webhook → POST JSON para uma URL sua (n8n, Z-API, Evolution API, Twilio via função própria etc.)
 */
const crypto = require('node:crypto');
const { db } = require('../db');

const PROVEDOR = (process.env.WHATSAPP_PROVIDER || '').trim().toLowerCase();

const provedores = {
  meta: {
    nome: 'WhatsApp Business Cloud API (Meta)',
    configurado: () => !!(process.env.WHATSAPP_META_TOKEN && process.env.WHATSAPP_META_PHONE_NUMBER_ID),
    async enviar({ destino, mensagem, partes, tipo }) {
      const versao = process.env.WHATSAPP_META_API_VERSION || 'v21.0';
      const url = `https://graph.facebook.com/${versao}/${process.env.WHATSAPP_META_PHONE_NUMBER_ID}/messages`;
      const juridico = ['prazo', 'audiencia'].includes(tipo) && process.env.WHATSAPP_META_TEMPLATE_JURIDICO;
      const template = juridico || process.env.WHATSAPP_META_TEMPLATE;
      // Mensagens iniciadas pela empresa exigem template aprovado pela Meta. Sem template, só funciona dentro da janela de 24h.
      const body = template
        ? {
            messaging_product: 'whatsapp', to: destino, type: 'template',
            template: {
              name: template, language: { code: process.env.WHATSAPP_META_TEMPLATE_LANG || 'pt_BR' },
              components: [{ type: 'body', parameters: partes.map((t) => ({ type: 'text', text: String(t).slice(0, 1000) })) }],
            },
          }
        : { messaging_product: 'whatsapp', to: destino, type: 'text', text: { body: mensagem } };
      const r = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.WHATSAPP_META_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json?.error?.message || `HTTP ${r.status}`);
      return { id: json?.messages?.[0]?.id || null };
    },
  },
  webhook: {
    nome: 'Webhook (provedor compatível)',
    configurado: () => !!process.env.WHATSAPP_WEBHOOK_URL,
    async enviar({ destino, mensagem, tipo, partes }) {
      const payload = JSON.stringify({ origem: 'as-control', destino, mensagem, tipo, partes, enviado_em: new Date().toISOString() });
      const headers = { 'Content-Type': 'application/json' };
      if (process.env.WHATSAPP_WEBHOOK_SECRET) {
        headers['X-AS-Control-Signature'] = crypto.createHmac('sha256', process.env.WHATSAPP_WEBHOOK_SECRET).update(payload).digest('hex');
      }
      const r = await fetch(process.env.WHATSAPP_WEBHOOK_URL, { method: 'POST', headers, body: payload, signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = await r.json().catch(() => ({}));
      return { id: json?.id || json?.messageId || null };
    },
  },
};

function provedorAtivo() {
  const p = provedores[PROVEDOR];
  return p && p.configurado() ? { chave: PROVEDOR, ...p } : null;
}
function status() {
  const p = provedorAtivo();
  return {
    conectado: !!p,
    provedor: p ? p.nome : null,
    provedor_solicitado: PROVEDOR || null,
    usa_template: PROVEDOR === 'meta' ? !!process.env.WHATSAPP_META_TEMPLATE : null,
    mensagem: p ? `Conectado via ${p.nome}.`
      : PROVEDOR ? `Provedor "${PROVEDOR}" informado, mas faltam credenciais no servidor.`
        : 'Pendente de conexão. Nenhum provedor de WhatsApp configurado.',
  };
}

function normalizarNumero(n) {
  const d = String(n || '').replace(/\D/g, '');
  if (!d) return null;
  return d.startsWith('55') ? d : `55${d}`;
}

// Registra o envio. Nunca marca como enviado sem resposta real do provedor.
function enfileirar({ chave, notificacaoId, destino, destinoNome, tipo, mensagem, partes }) {
  const numero = normalizarNumero(destino);
  if (!numero) return null;
  const p = provedorAtivo();
  const r = db.prepare(`INSERT OR IGNORE INTO envios_whatsapp (chave, notificacao_id, destino, destino_nome, tipo, mensagem, provedor, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(chave, notificacaoId ?? null, numero, destinoNome ?? null, tipo,
    JSON.stringify({ texto: mensagem, partes: partes || [] }), p?.chave ?? null, p ? 'na_fila' : 'pendente_conexao');
  return r.changes ? Number(r.lastInsertRowid) : null;
}

let processando = false;
async function processarFila() {
  const p = provedorAtivo();
  if (!p || processando) return { enviados: 0, falhas: 0 };
  processando = true;
  let enviados = 0; let falhas = 0;
  try {
    // Ao conectar um provedor, pendências recentes (últimos 2 dias) entram na fila; antigas ficam só no histórico
    db.prepare(`UPDATE envios_whatsapp SET status = 'na_fila', provedor = ? WHERE status = 'pendente_conexao' AND criado_em >= datetime('now','-2 days')`).run(p.chave);
    const fila = db.prepare(`SELECT * FROM envios_whatsapp WHERE status = 'na_fila' OR (status = 'falhou' AND tentativas < 3) ORDER BY id LIMIT 50`).all();
    for (const e of fila) {
      const { texto, partes } = JSON.parse(e.mensagem);
      try {
        const r = await p.enviar({ destino: e.destino, mensagem: texto, partes, tipo: e.tipo });
        db.prepare(`UPDATE envios_whatsapp SET status = 'enviado', provedor = ?, provedor_msg_id = ?, tentativas = tentativas + 1, erro = NULL, atualizado_em = datetime('now') WHERE id = ?`)
          .run(p.chave, r.id, e.id);
        enviados++;
      } catch (err) {
        db.prepare(`UPDATE envios_whatsapp SET status = 'falhou', tentativas = tentativas + 1, erro = ?, atualizado_em = datetime('now') WHERE id = ?`)
          .run(String(err.message).slice(0, 500), e.id);
        falhas++;
      }
    }
  } finally { processando = false; }
  return { enviados, falhas };
}

// Atualizações de status vindas da Meta (entregue/lido)
function registrarStatusMeta(body) {
  const mapa = { delivered: 'entregue', read: 'lido', failed: 'falhou', sent: 'enviado' };
  for (const entry of body?.entry || []) for (const ch of entry.changes || []) for (const st of ch.value?.statuses || []) {
    const novo = mapa[st.status];
    if (novo) db.prepare(`UPDATE envios_whatsapp SET status = ?, erro = COALESCE(?, erro), atualizado_em = datetime('now') WHERE provedor_msg_id = ?`)
      .run(novo, st.errors?.[0]?.title || null, st.id);
  }
}

module.exports = { status, enfileirar, processarFila, registrarStatusMeta, provedorAtivo, normalizarNumero };
