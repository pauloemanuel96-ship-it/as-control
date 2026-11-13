'use strict';
const { db, getConfig } = require('./db');
const { hoje, addDias, diffDias, brl, dataBR } = require('./util');
const fin = require('./financeiro');
const { permissoesDe } = require('./auth');
const whatsapp = require('./whatsapp');

const STATUS_LABEL = {
  aguardando_fatura: 'Aguardando fatura', fatura_recebida: 'Fatura recebida', pendente_conferencia: 'Pendente de conferência',
  aguardando_pagamento: 'Aguardando pagamento', aprovado: 'Aprovado', pago: 'Pago', atrasado: 'Atrasado', cancelado: 'Cancelado',
};
const TIPOS_ALERTA = {
  vencimento: 'Vencimentos próximos', atraso: 'Contas vencidas', renovacao: 'Renovações de contrato', aumento: 'Aumentos de valor', cobranca: 'Cobranças para conferir',
  prazo: 'Prazos jurídicos', audiencia: 'Audiências',
};
const TIPOS_WPP_PADRAO = ['vencimento', 'atraso', 'prazo', 'audiencia'];
const appUrl = () => (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');

function prefs(u) { try { return JSON.parse(u.preferencias || '{}'); } catch { return {}; } }

// Quem recebe: o responsável pelo lançamento + quem marcou "receber todos os alertas" (precisa poder ver lançamentos)
function destinatarios(responsavelId, permissao = 'lancamentos.ver') {
  const usuarios = db.prepare('SELECT * FROM usuarios WHERE ativo = 1').all();
  return usuarios.filter((u) => {
    if (!permissoesDe(u).includes(permissao)) return false;
    const p = prefs(u);
    const recebeTodos = p.receber_todos ?? (u.perfil === 'administrador' || u.perfil === 'financeiro');
    return u.id === responsavelId || recebeTodos;
  });
}

function notificar({ usuarios, tipo, chave, titulo, mensagem, lancamentoId, servicoId, demandaId, whatsappTexto, partes }) {
  const cfg = getConfig();
  let criadas = 0;
  for (const u of usuarios) {
    const r = db.prepare(`INSERT OR IGNORE INTO notificacoes (usuario_id, tipo, chave, titulo, mensagem, lancamento_id, servico_id, demanda_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(u.id, tipo, chave, titulo, mensagem, lancamentoId ?? null, servicoId ?? null, demandaId ?? null);
    if (!r.changes) continue; // já notificado — evita duplicidade
    criadas++;
    const p = prefs(u);
    const tiposWpp = p.whatsapp_tipos ?? TIPOS_WPP_PADRAO;
    if (u.whatsapp && tiposWpp.includes(tipo)) {
      whatsapp.enfileirar({ chave: `u${u.id}:${chave}`, notificacaoId: Number(r.lastInsertRowid), destino: u.whatsapp, destinoNome: u.nome, tipo, mensagem: whatsappTexto, partes });
    }
  }
  // Destinatários extras configurados (ex.: número do financeiro). Mesma chave = sem duplicidade.
  for (const d of cfg.whatsapp_destinatarios_extras || []) {
    if (d.ativo === false || !(d.tipos || []).includes(tipo)) continue;
    whatsapp.enfileirar({ chave: `x${whatsapp.normalizarNumero(d.numero)}:${chave}`, destino: d.numero, destinoNome: d.nome, tipo, mensagem: whatsappTexto, partes });
  }
  return criadas;
}

function quando(dias) {
  if (dias === 0) return 'vence hoje';
  if (dias === 1) return 'vence amanhã';
  return `vence em ${dias} dias`;
}

function alertasVencimento() {
  const cfg = getConfig();
  const h = hoje();
  const dias = [...new Set((cfg.alertas_dias_antes || []).map(Number).filter((n) => n >= 0 && n <= 60))];
  const maxDias = Math.max(0, ...dias);
  const lancs = db.prepare(`SELECT l.*, u.nome AS responsavel_nome FROM lancamentos l LEFT JOIN usuarios u ON u.id = l.responsavel_id
    WHERE l.status NOT IN ('pago','cancelado') AND l.vencimento <= ?`).all(addDias(h, maxDias));
  let total = 0;
  for (const l of lancs) {
    const nome = l.descricao || 'Despesa';
    const valor = brl(l.valor_cobrado_centavos ?? l.valor_previsto_centavos);
    const link = `${appUrl()}/#/lancamentos/${l.id}`;
    const faltam = diffDias(l.vencimento, h);
    if (faltam >= 0 && dias.includes(faltam)) {
      const titulo = `${nome} ${quando(faltam)}`;
      const status = STATUS_LABEL[l.status];
      total += notificar({
        usuarios: destinatarios(l.responsavel_id), tipo: 'vencimento', chave: `venc:${l.id}:${l.vencimento}:${faltam}`,
        titulo, mensagem: `Valor ${valor} · vencimento ${dataBR(l.vencimento)} · ${status} · responsável: ${l.responsavel_nome || 'não definido'}`,
        lancamentoId: l.id, servicoId: l.servico_id,
        whatsappTexto: `AS CONTROL | ALERTA DE VENCIMENTO\n\nO serviço ${nome} ${quando(faltam)}.\n\nValor: ${valor}\nVencimento: ${dataBR(l.vencimento)}\nStatus: ${status}.\nResponsável: ${l.responsavel_nome || 'não definido'}\n\nAbrir lançamento: ${link}`,
        partes: ['ALERTA DE VENCIMENTO', `O serviço ${nome} ${quando(faltam)}.`, valor, dataBR(l.vencimento), status, link],
      });
    } else if (faltam < 0 && cfg.alerta_atraso_diario !== false) {
      total += notificar({
        usuarios: destinatarios(l.responsavel_id), tipo: 'atraso', chave: `atraso:${l.id}:${h}`,
        titulo: `${nome} está vencido há ${-faltam} dia(s)`,
        mensagem: `Valor ${valor} · venceu em ${dataBR(l.vencimento)} · responsável: ${l.responsavel_nome || 'não definido'}`,
        lancamentoId: l.id, servicoId: l.servico_id,
        whatsappTexto: `AS CONTROL | CONTA VENCIDA\n\nA cobrança do serviço ${nome} está vencida.\n\nValor: ${valor}\nVencimento: ${dataBR(l.vencimento)}.\n\nVerifique o pagamento: ${link}`,
        partes: ['CONTA VENCIDA', `A cobrança do serviço ${nome} está vencida.`, valor, dataBR(l.vencimento), STATUS_LABEL[l.status], link],
      });
    }
  }
  return total;
}

function alertasRenovacao() {
  const cfg = getConfig();
  const h = hoje();
  let total = 0;
  for (const s of db.prepare("SELECT * FROM servicos WHERE status != 'cancelado' AND data_renovacao IS NOT NULL AND data_renovacao >= ?").all(h)) {
    const faltam = diffDias(s.data_renovacao, h);
    const limiteCancelamento = s.prazo_cancelamento_dias ? addDias(s.data_renovacao, -s.prazo_cancelamento_dias) : null;
    for (const d of cfg.alertas_renovacao_dias || [30, 7]) {
      if (faltam !== Number(d)) continue;
      const extra = limiteCancelamento ? ` Para cancelar sem renovar, avise até ${dataBR(limiteCancelamento)}.` : '';
      const link = `${appUrl()}/#/servicos/${s.id}`;
      total += notificar({
        usuarios: destinatarios(s.responsavel_id), tipo: 'renovacao', chave: `renov:${s.id}:${s.data_renovacao}:${d}`,
        titulo: `Contrato de ${s.nome} renova em ${faltam} dias`, mensagem: `Renovação em ${dataBR(s.data_renovacao)}.${extra}`, servicoId: s.id,
        whatsappTexto: `AS CONTROL | RENOVAÇÃO DE CONTRATO\n\nO contrato de ${s.nome} renova em ${dataBR(s.data_renovacao)}.${extra}\n\n${link}`,
        partes: ['RENOVAÇÃO DE CONTRATO', `O contrato de ${s.nome} renova em ${faltam} dias.`, '-', dataBR(s.data_renovacao), extra.trim() || '-', link],
      });
    }
  }
  return total;
}

function notificarAumento(alteracaoId) {
  const a = db.prepare(`SELECT a.*, s.nome, s.responsavel_id FROM alteracoes_preco a JOIN servicos s ON s.id = a.servico_id WHERE a.id = ?`).get(alteracaoId);
  if (!a) return 0;
  const pct = ((a.valor_novo_centavos / a.valor_anterior_centavos - 1) * 100).toFixed(1).replace('.', ',');
  const link = `${appUrl()}/#/servicos/${a.servico_id}`;
  return notificar({
    usuarios: destinatarios(a.responsavel_id), tipo: 'aumento', chave: `aumento:${a.id}:${a.valor_novo_centavos}`,
    titulo: `Aumento em ${a.nome}: +${pct}%`, mensagem: `De ${brl(a.valor_anterior_centavos)} para ${brl(a.valor_novo_centavos)}.`,
    lancamentoId: a.lancamento_id, servicoId: a.servico_id,
    whatsappTexto: `AS CONTROL | AUMENTO DE VALOR\n\n${a.nome} passou de ${brl(a.valor_anterior_centavos)} para ${brl(a.valor_novo_centavos)} (+${pct}%).\n\nConfira antes de pagar: ${link}`,
    partes: ['AUMENTO DE VALOR', `${a.nome} subiu ${pct}%.`, brl(a.valor_novo_centavos), '-', `Antes: ${brl(a.valor_anterior_centavos)}`, link],
  });
}

function notificarCobrancaRecebida(cobrancaId) {
  const c = db.prepare('SELECT * FROM cobrancas_recebidas WHERE id = ?').get(cobrancaId);
  if (!c) return 0;
  const usuarios = db.prepare('SELECT * FROM usuarios WHERE ativo = 1').all().filter((u) => permissoesDe(u).includes('cobrancas.conferir'));
  const link = `${appUrl()}/#/cobrancas`;
  return notificar({
    usuarios, tipo: 'cobranca', chave: `cobranca:${c.id}`,
    titulo: `Nova cobrança para conferir${c.fornecedor ? `: ${c.fornecedor}` : ''}`,
    mensagem: `Valor ${brl(c.valor_centavos)}${c.vencimento ? ` · vencimento ${dataBR(c.vencimento)}` : ''}. Confirme antes de lançar.`,
    whatsappTexto: `AS CONTROL | COBRANÇA RECEBIDA\n\nUma cobrança${c.fornecedor ? ` de ${c.fornecedor}` : ''} entrou na fila de conferência.\nValor: ${brl(c.valor_centavos)}\n\n${link}`,
    partes: ['COBRANÇA RECEBIDA', `Cobrança${c.fornecedor ? ` de ${c.fornecedor}` : ''} aguardando conferência.`, brl(c.valor_centavos), c.vencimento ? dataBR(c.vencimento) : '-', 'Pendente de conferência', link],
  });
}

// ---------- Jurídico: prazos e audiências ----------
const TIPO_DEMANDA = { jec: 'JEC', justica_comum: 'Justiça Comum', procon: 'Procon', consumidor_gov: 'Consumidor.gov', reclame_aqui: 'Reclame Aqui', notificacao: 'Notificação extrajudicial', chargeback: 'Chargeback' };
const MODALIDADE = { presencial: 'presencial', virtual: 'virtual', hibrida: 'híbrida' };
function alertasJuridico() {
  const cfg = getConfig();
  const h = hoje();
  const diasPrazo = (cfg.juridico_alertas_prazo || [5, 2, 1, 0]).map(Number);
  const diasAud = (cfg.juridico_alertas_audiencia || [7, 1, 0]).map(Number);
  const maxDias = Math.max(0, ...diasPrazo, ...diasAud);
  const itens = db.prepare(`SELECT c.*, d.tipo AS demanda_tipo, d.numero, d.titulo AS demanda_titulo, d.parte_nome, d.responsavel_id AS demanda_resp, u.nome AS responsavel_nome
    FROM juridico_compromissos c JOIN demandas d ON d.id = c.demanda_id LEFT JOIN usuarios u ON u.id = COALESCE(c.responsavel_id, d.responsavel_id)
    WHERE c.status = 'pendente' AND d.status != 'encerrada' AND c.data <= ?`).all(addDias(h, maxDias));
  let total = 0;
  for (const c of itens) {
    const faltam = diffDias(c.data, h);
    const ref = c.numero ? `${TIPO_DEMANDA[c.demanda_tipo]} ${c.numero}` : `${TIPO_DEMANDA[c.demanda_tipo]} · ${c.demanda_titulo}`;
    const link = `${appUrl()}/#/juridico/demandas/${c.demanda_id}`;
    const usuarios = destinatarios(c.responsavel_id || c.demanda_resp, 'juridico.ver');
    const resp = c.responsavel_nome || 'não definido';
    const quandoTxt = faltam === 0 ? 'hoje' : faltam === 1 ? 'amanhã' : `em ${faltam} dias`;
    if (c.tipo === 'audiencia') {
      if (faltam >= 0 && diasAud.includes(faltam)) {
        const det = `${c.modalidade ? ` (${MODALIDADE[c.modalidade]})` : ''}`;
        total += notificar({
          usuarios, tipo: 'audiencia', chave: `aud:${c.id}:${c.data}:${c.hora || ''}:${faltam}`,
          titulo: `${c.titulo} ${quandoTxt}${c.hora ? ` às ${c.hora}` : ''}`,
          mensagem: `${ref}${c.parte_nome ? ` · parte: ${c.parte_nome}` : ''} · ${dataBR(c.data)}${det}${c.local ? ` · ${c.local}` : ''} · responsável: ${resp}`,
          demandaId: c.demanda_id,
          whatsappTexto: `AS CONTROL | AUDIÊNCIA\n\n${c.titulo}${det} ${quandoTxt}, ${dataBR(c.data)}${c.hora ? ` às ${c.hora}` : ''}.\n\n${ref}${c.parte_nome ? `\nParte: ${c.parte_nome}` : ''}${c.local ? `\nLocal/link: ${c.local}` : ''}\nResponsável: ${resp}\n\n${link}`,
          partes: ['AUDIÊNCIA', `${c.titulo}${det} ${quandoTxt}${c.hora ? ` às ${c.hora}` : ''}.`, ref, dataBR(c.data), resp, link],
        });
      } else if (faltam < 0 && faltam >= -3) {
        total += notificar({
          usuarios, tipo: 'audiencia', chave: `aud-res:${c.id}:${c.data}`,
          demandaId: c.demanda_id, titulo: `Registre o resultado: ${c.titulo}`, mensagem: `${ref} · audiência de ${dataBR(c.data)} ainda está pendente no sistema.`,
          whatsappTexto: `AS CONTROL | AUDIÊNCIA REALIZADA?\n\n${c.titulo} de ${dataBR(c.data)} (${ref}) ainda está pendente. Registre o resultado: ${link}`,
          partes: ['AUDIÊNCIA REALIZADA?', `Registre o resultado de ${c.titulo}.`, ref, dataBR(c.data), resp, link],
        });
      }
      continue;
    }
    if (faltam >= 0 && diasPrazo.includes(faltam)) {
      total += notificar({
        usuarios, tipo: 'prazo', chave: `prazo:${c.id}:${c.data}:${faltam}`, demandaId: c.demanda_id,
        titulo: `Prazo: ${c.titulo} vence ${quandoTxt}`,
        mensagem: `${ref}${c.parte_nome ? ` · parte: ${c.parte_nome}` : ''} · ${dataBR(c.data)} · responsável: ${resp}`,
        whatsappTexto: `AS CONTROL | PRAZO JURÍDICO\n\n${c.titulo} vence ${quandoTxt} (${dataBR(c.data)}).\n\n${ref}${c.parte_nome ? `\nParte: ${c.parte_nome}` : ''}\nResponsável: ${resp}\n\n${link}`,
        partes: ['PRAZO JURÍDICO', `${c.titulo} vence ${quandoTxt}.`, ref, dataBR(c.data), resp, link],
      });
    } else if (faltam < 0 && cfg.alerta_atraso_diario !== false) {
      total += notificar({
        usuarios, tipo: 'prazo', chave: `prazo-atraso:${c.id}:${h}`, demandaId: c.demanda_id,
        titulo: `Prazo vencido: ${c.titulo}`, mensagem: `${ref} · venceu em ${dataBR(c.data)} e não foi marcado como cumprido.`,
        whatsappTexto: `AS CONTROL | PRAZO VENCIDO\n\n${c.titulo} venceu em ${dataBR(c.data)} e não está marcado como cumprido.\n\n${ref}\nResponsável: ${resp}\n\n${link}`,
        partes: ['PRAZO VENCIDO', `${c.titulo} não está marcado como cumprido.`, ref, dataBR(c.data), resp, link],
      });
    }
  }
  return total;
}

let rodando = false;
async function executarRotinas() {
  if (rodando) return null;
  rodando = true;
  try {
    const gerados = fin.gerarTodos();
    const atrasados = fin.marcarAtrasados();
    const alertas = alertasVencimento() + alertasRenovacao() + alertasJuridico();
    const wpp = await whatsapp.processarFila();
    db.prepare('INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor')
      .run('ultima_rotina', JSON.stringify({ em: new Date().toISOString(), gerados, atrasados, alertas, ...wpp }));
    return { gerados, atrasados, alertas, ...wpp };
  } finally { rodando = false; }
}

function iniciarAgendador() {
  const minutos = Number(process.env.JOB_INTERVAL_MINUTES || 15);
  executarRotinas().catch((e) => console.error('[rotinas]', e));
  setInterval(() => executarRotinas().catch((e) => console.error('[rotinas]', e)), minutos * 60e3).unref();
}

module.exports = { executarRotinas, iniciarAgendador, notificarAumento, notificarCobrancaRecebida, STATUS_LABEL, TIPOS_ALERTA, TIPOS_WPP_PADRAO };
