'use strict';
const router = require('express').Router();
const { db, tx, getConfig } = require('../db');
const A = require('../auth');
const fin = require('../financeiro');
const { calcularPrazo, normalizarCNJ } = require('../juridico-prazos');
const { HttpError, txt, int, parseValor, parseData, hoje, addDias, addMeses, competenciaDe, inicioMes, fimMes, dataBR, mesAnterior } = require('../util');

const TIPOS = { jec: 'JEC', justica_comum: 'Justiça Comum', procon: 'Procon', consumidor_gov: 'Consumidor.gov', reclame_aqui: 'Reclame Aqui', notificacao: 'Notificação extrajudicial', chargeback: 'Chargeback' };
const JUDICIAIS = ['jec', 'justica_comum'];
const STATUS = ['nova', 'em_andamento', 'aguardando', 'acordo', 'encerrada'];
const STATUS_TXT = { nova: 'Nova', em_andamento: 'Em andamento', aguardando: 'Aguardando terceiros', acordo: 'Em acordo', encerrada: 'Encerrada' };
const RESULTADOS = { favoravel: 'Favorável', desfavoravel: 'Desfavorável', parcial: 'Parcialmente favorável', acordo: 'Acordo', arquivada: 'Arquivada' };
const TIPOS_VALOR = { pedido: 'Pedido', acordo: 'Acordo', condenacao: 'Condenação', custas: 'Custas', honorarios: 'Honorários', reembolso: 'Reembolso', chargeback: 'Valor contestado', outro: 'Outro' };
const GERA_CONTA = ['acordo', 'condenacao', 'custas', 'honorarios', 'reembolso', 'outro'];

const ver = A.exigir('juridico.ver');
const editar = A.exigir('juridico.editar');

const andamentoSistema = (demandaId, descricao, usuarioId) => db.prepare(
  `INSERT INTO juridico_andamentos (demanda_id, data, descricao, tipo, usuario_id) VALUES (?, ?, ?, 'sistema', ?)`).run(demandaId, hoje(), descricao, usuarioId ?? null);
const obterDemanda = (id) => {
  const d = db.prepare('SELECT * FROM demandas WHERE id = ?').get(id);
  if (!d) throw new HttpError(404, 'Demanda não encontrada.');
  return d;
};

function validarDemanda(b, atual = {}) {
  const v = (k) => (b[k] === undefined ? atual[k] : b[k]);
  const d = {
    tipo: v('tipo'), titulo: txt(v('titulo'), 200), parte_nome: txt(v('parte_nome'), 200), parte_contato: txt(v('parte_contato'), 200),
    orgao: txt(v('orgao'), 200), localidade: txt(v('localidade'), 120), evento: txt(v('evento'), 150), pedido: txt(v('pedido'), 4000),
    risco: v('risco') || null, prioridade: v('prioridade') || 'normal', status: v('status') || 'nova',
    responsavel_id: int(v('responsavel_id')), advogado: txt(v('advogado'), 200), data_recebimento: txt(v('data_recebimento'), 10), observacoes: txt(v('observacoes'), 4000),
  };
  d.valor_causa_centavos = b.valor_causa === undefined ? atual.valor_causa_centavos ?? null : parseValor(b.valor_causa);
  d.valor_pedido_centavos = b.valor_pedido === undefined ? atual.valor_pedido_centavos ?? null : parseValor(b.valor_pedido);
  if (!TIPOS[d.tipo]) throw new HttpError(400, 'Escolha o tipo da demanda.');
  if (!d.titulo) throw new HttpError(400, 'Informe um título (ex.: Cliente pede reembolso do transporte BTS).');
  if (Number.isNaN(d.valor_causa_centavos) || Number.isNaN(d.valor_pedido_centavos)) throw new HttpError(400, 'Valor inválido.');
  if (d.risco && !['provavel', 'possivel', 'remoto'].includes(d.risco)) throw new HttpError(400, 'Risco inválido.');
  if (!['baixa', 'normal', 'alta', 'urgente'].includes(d.prioridade)) throw new HttpError(400, 'Prioridade inválida.');
  if (!STATUS.includes(d.status) || (d.status === 'encerrada' && atual.status !== 'encerrada')) throw new HttpError(400, 'Para encerrar, use o botão "Encerrar demanda".');
  if (d.data_recebimento && !parseData(d.data_recebimento)) throw new HttpError(400, 'Data de recebimento inválida.');
  const numero = b.numero === undefined ? atual.numero : b.numero;
  if (JUDICIAIS.includes(d.tipo) && numero) {
    const cnj = normalizarCNJ(numero);
    if (cnj.valido === false) throw new HttpError(400, 'O número do processo não confere com o dígito verificador do padrão CNJ. Confira os números.');
    d.numero = cnj.formatado;
  } else d.numero = txt(numero, 80);
  return d;
}

// ---------- Painel ----------
router.get('/painel', ver, (_req, res) => {
  const h = hoje(); const cfg = getConfig();
  const abertas = db.prepare("SELECT * FROM demandas WHERE status != 'encerrada'").all();
  const compSQL = `SELECT c.*, d.tipo AS demanda_tipo, d.numero, d.titulo AS demanda_titulo, d.parte_nome, u.nome AS responsavel_nome
    FROM juridico_compromissos c JOIN demandas d ON d.id = c.demanda_id LEFT JOIN usuarios u ON u.id = COALESCE(c.responsavel_id, d.responsavel_id)
    WHERE c.status = 'pendente' AND d.status != 'encerrada'`;
  const proximos = db.prepare(`${compSQL} AND c.data BETWEEN ? AND ? ORDER BY c.data, c.hora`).all(h, addDias(h, 30));
  const vencidos = db.prepare(`${compSQL} AND c.data < ? AND c.tipo != 'audiencia' ORDER BY c.data`).all(h);
  const audSemResultado = db.prepare(`${compSQL} AND c.data < ? AND c.tipo = 'audiencia' ORDER BY c.data`).all(h);
  const limiteParada = addDias(h, -(Number(cfg.juridico_dias_sem_andamento) || 30));
  const paradas = db.prepare(`SELECT id, tipo, numero, titulo, parte_nome, COALESCE(ultimo_andamento_em, data_recebimento, substr(criado_em,1,10)) AS ultimo
    FROM demandas WHERE status != 'encerrada' AND COALESCE(ultimo_andamento_em, data_recebimento, substr(criado_em,1,10)) < ?
    AND id NOT IN (SELECT demanda_id FROM juridico_compromissos WHERE status = 'pendente' AND data >= ?) ORDER BY ultimo LIMIT 20`).all(limiteParada, h);
  const inicio12 = `${mesAnterior(competenciaDe(h), 11)}-01`;
  const encerradas12 = db.prepare('SELECT resultado, COUNT(*) AS n FROM demandas WHERE status = \'encerrada\' AND data_encerramento >= ? GROUP BY resultado').all(inicio12);
  const totalEnc = encerradas12.reduce((t, r) => t + r.n, 0);
  const exito = encerradas12.filter((r) => ['favoravel', 'parcial', 'acordo', 'arquivada'].includes(r.resultado)).reduce((t, r) => t + r.n, 0);
  const acordosAbertos = db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(COALESCE(valor_cobrado_centavos, valor_previsto_centavos)),0) AS total FROM lancamentos
    WHERE demanda_id IS NOT NULL AND status NOT IN ('pago','cancelado')`).get();
  const porTipo = {}; const porRisco = { provavel: 0, possivel: 0, remoto: 0, sem: 0 };
  for (const d of abertas) {
    porTipo[d.tipo] = (porTipo[d.tipo] || 0) + 1;
    porRisco[d.risco || 'sem'] += d.valor_pedido_centavos || 0;
  }
  res.json({
    hoje: h,
    indicadores: {
      abertas: abertas.length,
      prazos_7_dias: proximos.filter((c) => c.tipo !== 'audiencia' && c.data <= addDias(h, 7)).length,
      audiencias_30_dias: proximos.filter((c) => c.tipo === 'audiencia').length,
      valor_em_discussao: abertas.reduce((t, d) => t + (d.valor_pedido_centavos || 0), 0),
      prazos_vencidos: vencidos.length, paradas: paradas.length,
      encerradas_mes: db.prepare("SELECT COUNT(*) AS n FROM demandas WHERE status = 'encerrada' AND data_encerramento BETWEEN ? AND ?").get(inicioMes(competenciaDe(h)), fimMes(competenciaDe(h))).n,
      taxa_exito: totalEnc ? Math.round((exito / totalEnc) * 100) : null, encerradas_12m: totalEnc,
      acordos_a_pagar: acordosAbertos,
    },
    proximos, vencidos, audiencias_sem_resultado: audSemResultado, paradas,
    por_tipo: Object.entries(porTipo).map(([tipo, n]) => ({ tipo, n })).sort((a, b) => b.n - a.n),
    por_risco: porRisco,
    resultados_12m: encerradas12,
  });
});

// ---------- Demandas ----------
function filtros(q) {
  const w = []; const a = [];
  if (q.status === 'abertas' || q.status === undefined) w.push("d.status != 'encerrada'");
  else if (q.status) { w.push('d.status = ?'); a.push(q.status); }
  if (q.tipo) { w.push('d.tipo = ?'); a.push(q.tipo); }
  if (q.responsavel_id) { w.push('d.responsavel_id = ?'); a.push(q.responsavel_id); }
  if (q.risco) { w.push('d.risco = ?'); a.push(q.risco); }
  if (q.busca) { w.push('(d.titulo LIKE ? OR d.numero LIKE ? OR d.parte_nome LIKE ? OR d.evento LIKE ? OR d.orgao LIKE ?)'); a.push(...Array(5).fill(`%${q.busca}%`)); }
  return { where: w.length ? `WHERE ${w.join(' AND ')}` : '', args: a };
}
const SQL_LISTA = `SELECT d.*, u.nome AS responsavel_nome,
  (SELECT c.data || '|' || c.tipo || '|' || c.titulo FROM juridico_compromissos c WHERE c.demanda_id = d.id AND c.status = 'pendente' ORDER BY c.data, c.hora LIMIT 1) AS proximo
  FROM demandas d LEFT JOIN usuarios u ON u.id = d.responsavel_id`;
const expandir = (d) => {
  if (!d.proximo) return { ...d, proximo: null };
  const [data, tipo, ...t] = d.proximo.split('|');
  return { ...d, proximo: { data, tipo, titulo: t.join('|') } };
};

router.get('/demandas', ver, (req, res) => {
  const { where, args } = filtros(req.query);
  const ordem = "CASE d.prioridade WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END";
  res.json(db.prepare(`${SQL_LISTA} ${where} ORDER BY d.status = 'encerrada', ${ordem}, d.criado_em DESC LIMIT 1000`).all(...args).map(expandir));
});

router.get('/demandas/csv', ver, (req, res) => {
  const { where, args } = filtros(req.query);
  const rows = db.prepare(`${SQL_LISTA} ${where} ORDER BY d.criado_em DESC`).all(...args).map(expandir);
  const esc = (v) => { const s = v == null ? '' : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const reais = (c) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','));
  const linhas = [['ID', 'Tipo', 'Número', 'Título', 'Parte', 'Órgão', 'Localidade', 'Evento', 'Status', 'Resultado', 'Risco', 'Prioridade', 'Valor da causa', 'Valor pedido', 'Recebida em', 'Encerrada em', 'Próximo compromisso', 'Responsável']];
  for (const d of rows) linhas.push([d.id, TIPOS[d.tipo], d.numero, d.titulo, d.parte_nome, d.orgao, d.localidade, d.evento, STATUS_TXT[d.status], RESULTADOS[d.resultado] || '',
    d.risco || '', d.prioridade, reais(d.valor_causa_centavos), reais(d.valor_pedido_centavos), d.data_recebimento ? dataBR(d.data_recebimento) : '', d.data_encerramento ? dataBR(d.data_encerramento) : '',
    d.proximo ? `${dataBR(d.proximo.data)} - ${d.proximo.titulo}` : '', d.responsavel_nome || '']);
  A.auditar(req, 'exportou demandas jurídicas (CSV)', 'relatorio', null, null, { linhas: rows.length });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="demandas-juridicas_${hoje()}.csv"`);
  res.send(`\uFEFF${linhas.map((l) => l.map(esc).join(';')).join('\r\n')}`);
});

router.get('/demandas/:id', ver, (req, res) => {
  const d = db.prepare(`${SQL_LISTA} WHERE d.id = ?`).get(req.params.id);
  if (!d) throw new HttpError(404, 'Demanda não encontrada.');
  res.json({
    ...expandir(d),
    compromissos: db.prepare(`SELECT c.*, u.nome AS responsavel_nome, p.nome AS cumprido_por_nome FROM juridico_compromissos c
      LEFT JOIN usuarios u ON u.id = c.responsavel_id LEFT JOIN usuarios p ON p.id = c.cumprido_por WHERE c.demanda_id = ? ORDER BY c.status = 'pendente' DESC, c.data, c.hora`).all(d.id),
    andamentos: db.prepare(`SELECT a.*, u.nome AS usuario_nome FROM juridico_andamentos a LEFT JOIN usuarios u ON u.id = a.usuario_id
      WHERE a.demanda_id = ? ORDER BY a.data DESC, a.id DESC`).all(d.id),
    valores: db.prepare('SELECT * FROM juridico_valores WHERE demanda_id = ? ORDER BY criado_em').all(d.id),
    lancamentos: db.prepare('SELECT id, descricao, vencimento, status, valor_previsto_centavos, valor_cobrado_centavos, juridico_valor_id FROM lancamentos WHERE demanda_id = ? ORDER BY vencimento').all(d.id),
    documentos: db.prepare('SELECT id, tipo, tipo_juridico, nome_original, tamanho, criado_em FROM documentos WHERE demanda_id = ? ORDER BY criado_em DESC').all(d.id),
    pode_gerar_contas: A.tem(req, 'lancamentos.editar'),
  });
});

router.post('/demandas', editar, (req, res) => {
  const d = validarDemanda(req.body);
  const id = tx(() => {
    const novo = Number(db.prepare(`INSERT INTO demandas (tipo, numero, titulo, parte_nome, parte_contato, orgao, localidade, evento, pedido, valor_causa_centavos,
      valor_pedido_centavos, risco, prioridade, status, responsavel_id, advogado, data_recebimento, observacoes, ultimo_andamento_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(d.tipo, d.numero, d.titulo, d.parte_nome, d.parte_contato, d.orgao, d.localidade, d.evento,
      d.pedido, d.valor_causa_centavos, d.valor_pedido_centavos, d.risco, d.prioridade, d.status, d.responsavel_id, d.advogado, d.data_recebimento || hoje(),
      d.observacoes, d.data_recebimento || hoje()).lastInsertRowid);
    andamentoSistema(novo, 'Demanda cadastrada no AS Control.', req.usuario.id);
    A.auditar(req, 'cadastrou demanda jurídica', 'demanda', novo, null, db.prepare('SELECT * FROM demandas WHERE id = ?').get(novo));
    return novo;
  });
  res.status(201).json({ id });
});

router.put('/demandas/:id', editar, (req, res) => {
  const antes = obterDemanda(req.params.id);
  const d = validarDemanda(req.body, antes);
  db.prepare(`UPDATE demandas SET tipo=?, numero=?, titulo=?, parte_nome=?, parte_contato=?, orgao=?, localidade=?, evento=?, pedido=?, valor_causa_centavos=?,
    valor_pedido_centavos=?, risco=?, prioridade=?, status=?, responsavel_id=?, advogado=?, data_recebimento=?, observacoes=?, atualizado_em=datetime('now') WHERE id = ?`)
    .run(d.tipo, d.numero, d.titulo, d.parte_nome, d.parte_contato, d.orgao, d.localidade, d.evento, d.pedido, d.valor_causa_centavos, d.valor_pedido_centavos,
      d.risco, d.prioridade, d.status, d.responsavel_id, d.advogado, d.data_recebimento, d.observacoes, antes.id);
  if (antes.status !== d.status) andamentoSistema(antes.id, `Status alterado de "${STATUS_TXT[antes.status]}" para "${STATUS_TXT[d.status]}".`, req.usuario.id);
  A.auditar(req, 'editou demanda jurídica', 'demanda', antes.id, antes, db.prepare('SELECT * FROM demandas WHERE id = ?').get(antes.id));
  res.json({ ok: true });
});

router.post('/demandas/:id/encerrar', editar, (req, res) => {
  const antes = obterDemanda(req.params.id);
  if (antes.status === 'encerrada') throw new HttpError(400, 'Esta demanda já está encerrada.');
  const resultado = req.body.resultado;
  if (!RESULTADOS[resultado]) throw new HttpError(400, 'Informe o resultado.');
  const data = req.body.data || hoje();
  if (!parseData(data)) throw new HttpError(400, 'Data inválida.');
  tx(() => {
    db.prepare(`UPDATE demandas SET status = 'encerrada', resultado = ?, data_encerramento = ?, ultimo_andamento_em = ?, atualizado_em = datetime('now') WHERE id = ?`).run(resultado, data, data, antes.id);
    let canc = 0;
    if (req.body.cancelar_pendentes !== false) canc = db.prepare(`UPDATE juridico_compromissos SET status = 'cancelado', atualizado_em = datetime('now') WHERE demanda_id = ? AND status = 'pendente'`).run(antes.id).changes;
    andamentoSistema(antes.id, `Demanda encerrada. Resultado: ${RESULTADOS[resultado]}.${txt(req.body.observacao, 1000) ? ` ${txt(req.body.observacao, 1000)}` : ''}${canc ? ` ${canc} compromisso(s) pendente(s) cancelado(s).` : ''}`, req.usuario.id);
    A.auditar(req, 'encerrou demanda jurídica', 'demanda', antes.id, antes, db.prepare('SELECT * FROM demandas WHERE id = ?').get(antes.id));
  });
  res.json({ ok: true });
});

router.post('/demandas/:id/reabrir', editar, (req, res) => {
  const antes = obterDemanda(req.params.id);
  if (antes.status !== 'encerrada') throw new HttpError(400, 'Esta demanda não está encerrada.');
  const motivo = txt(req.body.motivo, 500);
  if (!motivo) throw new HttpError(400, 'Informe o motivo da reabertura.');
  db.prepare(`UPDATE demandas SET status = 'em_andamento', resultado = NULL, data_encerramento = NULL, ultimo_andamento_em = ?, atualizado_em = datetime('now') WHERE id = ?`).run(hoje(), antes.id);
  andamentoSistema(antes.id, `Demanda reaberta: ${motivo}`, req.usuario.id);
  A.auditar(req, 'reabriu demanda jurídica', 'demanda', antes.id, antes, db.prepare('SELECT * FROM demandas WHERE id = ?').get(antes.id));
  res.json({ ok: true });
});

// ---------- Andamentos ----------
router.post('/demandas/:id/andamentos', editar, (req, res) => {
  const d = obterDemanda(req.params.id);
  const descricao = txt(req.body.descricao, 4000);
  const data = req.body.data || hoje();
  if (!descricao) throw new HttpError(400, 'Descreva o andamento.');
  if (!parseData(data) || data > hoje()) throw new HttpError(400, 'Data inválida (não pode ser futura).');
  const tipo = req.body.tipo === 'nota' ? 'nota' : 'andamento';
  const id = Number(db.prepare('INSERT INTO juridico_andamentos (demanda_id, data, descricao, tipo, usuario_id) VALUES (?, ?, ?, ?, ?)').run(d.id, data, descricao, tipo, req.usuario.id).lastInsertRowid);
  db.prepare(`UPDATE demandas SET ultimo_andamento_em = MAX(COALESCE(ultimo_andamento_em, ''), ?), status = CASE WHEN status = 'nova' THEN 'em_andamento' ELSE status END, atualizado_em = datetime('now') WHERE id = ?`).run(data, d.id);
  A.auditar(req, 'registrou andamento jurídico', 'demanda', d.id, null, { andamento_id: id, data, descricao });
  res.status(201).json({ id });
});

// ---------- Prazos, audiências e tarefas ----------
function validarCompromisso(b, atual = {}) {
  const v = (k) => (b[k] === undefined ? atual[k] : b[k]);
  const c = {
    tipo: v('tipo'), titulo: txt(v('titulo'), 200), data: v('data'), hora: txt(v('hora'), 5), modalidade: v('modalidade') || null,
    local: txt(v('local'), 500), responsavel_id: int(v('responsavel_id')), observacoes: txt(v('observacoes'), 2000),
  };
  if (!['prazo', 'audiencia', 'tarefa'].includes(c.tipo)) throw new HttpError(400, 'Tipo inválido.');
  if (!c.titulo) throw new HttpError(400, 'Informe o título (ex.: Contestação, Audiência de conciliação).');
  if (!parseData(c.data)) throw new HttpError(400, 'Informe a data.');
  if (c.hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(c.hora)) throw new HttpError(400, 'Hora inválida (use HH:MM).');
  if (c.tipo !== 'audiencia') c.modalidade = null;
  if (c.modalidade && !['presencial', 'virtual', 'hibrida'].includes(c.modalidade)) throw new HttpError(400, 'Modalidade inválida.');
  return c;
}
const ROT_COMP = { prazo: 'Prazo', audiencia: 'Audiência', tarefa: 'Tarefa' };
const G = { prazo: 'o', audiencia: 'a', tarefa: 'a' }; // concordância: agendado/agendada

router.post('/demandas/:id/compromissos', editar, (req, res) => {
  const d = obterDemanda(req.params.id);
  if (d.status === 'encerrada') throw new HttpError(400, 'Reabra a demanda para incluir novos compromissos.');
  const c = validarCompromisso(req.body);
  const id = Number(db.prepare(`INSERT INTO juridico_compromissos (demanda_id, tipo, titulo, data, hora, modalidade, local, responsavel_id, observacoes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(d.id, c.tipo, c.titulo, c.data, c.hora, c.modalidade, c.local, c.responsavel_id ?? d.responsavel_id, c.observacoes).lastInsertRowid);
  andamentoSistema(d.id, `${ROT_COMP[c.tipo]} agendad${G[c.tipo]}: ${c.titulo} em ${dataBR(c.data)}${c.hora ? ` às ${c.hora}` : ''}.`, req.usuario.id);
  A.auditar(req, `agendou ${c.tipo === 'prazo' ? 'prazo' : c.tipo === 'audiencia' ? 'audiência' : 'tarefa'}`, 'demanda', d.id, null, { compromisso_id: id, ...c });
  res.status(201).json({ id });
});

router.put('/compromissos/:id', editar, (req, res) => {
  const antes = db.prepare('SELECT * FROM juridico_compromissos WHERE id = ?').get(req.params.id);
  if (!antes) throw new HttpError(404, 'Compromisso não encontrado.');
  if (antes.status !== 'pendente') throw new HttpError(400, 'Só é possível editar compromissos pendentes.');
  const c = validarCompromisso(req.body, antes);
  db.prepare(`UPDATE juridico_compromissos SET tipo=?, titulo=?, data=?, hora=?, modalidade=?, local=?, responsavel_id=?, observacoes=?, atualizado_em=datetime('now') WHERE id = ?`)
    .run(c.tipo, c.titulo, c.data, c.hora, c.modalidade, c.local, c.responsavel_id, c.observacoes, antes.id);
  if (antes.data !== c.data || antes.hora !== c.hora) andamentoSistema(antes.demanda_id, `${ROT_COMP[c.tipo]} "${c.titulo}" remarcad${G[c.tipo]} de ${dataBR(antes.data)} para ${dataBR(c.data)}${c.hora ? ` às ${c.hora}` : ''}.`, req.usuario.id);
  A.auditar(req, 'editou compromisso jurídico', 'demanda', antes.demanda_id, antes, { ...antes, ...c });
  res.json({ ok: true });
});

router.post('/compromissos/:id/:acao(cumprir|cancelar)', editar, (req, res) => {
  const c = db.prepare('SELECT * FROM juridico_compromissos WHERE id = ?').get(req.params.id);
  if (!c || c.status !== 'pendente') throw new HttpError(400, 'Este compromisso não está pendente.');
  const nota = txt(req.body.observacao, 2000);
  if (req.params.acao === 'cancelar' && !nota) throw new HttpError(400, 'Informe o motivo do cancelamento.');
  tx(() => {
    if (req.params.acao === 'cumprir') {
      db.prepare(`UPDATE juridico_compromissos SET status = 'cumprido', cumprido_em = datetime('now'), cumprido_por = ?, observacoes = trim(COALESCE(observacoes,'') || char(10) || COALESCE(?, '')), atualizado_em = datetime('now') WHERE id = ?`).run(req.usuario.id, nota, c.id);
      const desc = c.tipo === 'audiencia' ? `Audiência realizada: ${c.titulo}.${nota ? ` Resultado: ${nota}` : ''}` : `${c.tipo === 'tarefa' ? 'Tarefa concluída' : 'Prazo cumprido'}: ${c.titulo}.${nota ? ` ${nota}` : ''}`;
      db.prepare(`INSERT INTO juridico_andamentos (demanda_id, data, descricao, tipo, usuario_id) VALUES (?, ?, ?, 'andamento', ?)`).run(c.demanda_id, hoje(), desc, req.usuario.id);
      db.prepare("UPDATE demandas SET ultimo_andamento_em = ?, status = CASE WHEN status = 'nova' THEN 'em_andamento' ELSE status END WHERE id = ?").run(hoje(), c.demanda_id);
    } else {
      db.prepare(`UPDATE juridico_compromissos SET status = 'cancelado', observacoes = trim(COALESCE(observacoes,'') || char(10) || ?), atualizado_em = datetime('now') WHERE id = ?`).run(`Cancelado: ${nota}`, c.id);
      andamentoSistema(c.demanda_id, `${ROT_COMP[c.tipo]} cancelad${G[c.tipo]}: ${c.titulo}. Motivo: ${nota}`, req.usuario.id);
    }
    A.auditar(req, req.params.acao === 'cumprir' ? 'marcou compromisso como cumprido' : 'cancelou compromisso jurídico', 'demanda', c.demanda_id, c, null);
  });
  res.json({ ok: true });
});

router.get('/agenda', ver, (req, res) => {
  const mes = /^\d{4}-\d{2}$/.test(req.query.mes || '') ? req.query.mes : competenciaDe(hoje());
  res.json({
    mes, hoje: hoje(),
    itens: db.prepare(`SELECT c.*, d.tipo AS demanda_tipo, d.numero, d.titulo AS demanda_titulo, d.parte_nome FROM juridico_compromissos c JOIN demandas d ON d.id = c.demanda_id
      WHERE c.data BETWEEN ? AND ? AND c.status != 'cancelado' ORDER BY c.data, c.hora`).all(inicioMes(mes), fimMes(mes)),
  });
});

router.post('/calcular-prazo', ver, (req, res) => {
  try { res.json(calcularPrazo(req.body.inicio, req.body.dias, { recesso: req.body.recesso !== false })); }
  catch (e) { throw new HttpError(400, e.message); }
});

// ---------- Valores ----------
router.post('/demandas/:id/valores', editar, (req, res) => {
  const d = obterDemanda(req.params.id);
  const tipo = req.body.tipo;
  if (!TIPOS_VALOR[tipo]) throw new HttpError(400, 'Tipo de valor inválido.');
  const valor = parseValor(req.body.valor);
  if (valor == null || Number.isNaN(valor) || valor <= 0) throw new HttpError(400, 'Informe um valor válido.');
  const parcelas = Math.min(60, Math.max(1, int(req.body.parcelas) || 1));
  const primeiro = req.body.primeiro_vencimento || null;
  if (primeiro && !parseData(primeiro)) throw new HttpError(400, 'Data do primeiro vencimento inválida.');
  const id = Number(db.prepare(`INSERT INTO juridico_valores (demanda_id, tipo, descricao, valor_centavos, parcelas, primeiro_vencimento, criado_por) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(d.id, tipo, txt(req.body.descricao, 300), valor, parcelas, primeiro, req.usuario.id).lastInsertRowid);
  if (tipo === 'acordo' && d.status !== 'encerrada') db.prepare("UPDATE demandas SET status = 'acordo' WHERE id = ?").run(d.id);
  andamentoSistema(d.id, `${TIPOS_VALOR[tipo]} registrado: ${(valor / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}${parcelas > 1 ? ` em ${parcelas} parcelas` : ''}.`, req.usuario.id);
  A.auditar(req, 'registrou valor jurídico', 'demanda', d.id, null, { valor_id: id, tipo, valor, parcelas, primeiro });
  res.status(201).json({ id });
});

router.delete('/valores/:id', editar, (req, res) => {
  const v = db.prepare('SELECT * FROM juridico_valores WHERE id = ?').get(req.params.id);
  if (!v) throw new HttpError(404, 'Valor não encontrado.');
  if (v.gerou_contas) throw new HttpError(400, 'Este valor já gerou contas a pagar. Cancele os lançamentos em Contas a pagar se precisar desfazer.');
  db.prepare('DELETE FROM juridico_valores WHERE id = ?').run(v.id);
  andamentoSistema(v.demanda_id, `Valor removido: ${TIPOS_VALOR[v.tipo]} de ${(v.valor_centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`, req.usuario.id);
  A.auditar(req, 'removeu valor jurídico', 'demanda', v.demanda_id, v, null);
  res.json({ ok: true });
});

// Integração com Contas a pagar: acordo/condenação/custas viram lançamentos (uma conta por parcela)
router.post('/valores/:id/gerar-contas', A.exigir('juridico.editar', 'lancamentos.editar'), (req, res) => {
  const v = db.prepare('SELECT * FROM juridico_valores WHERE id = ?').get(req.params.id);
  if (!v) throw new HttpError(404, 'Valor não encontrado.');
  if (!GERA_CONTA.includes(v.tipo)) throw new HttpError(400, 'Este tipo de valor não é uma conta a pagar.');
  if (v.gerou_contas) throw new HttpError(400, 'As contas deste valor já foram geradas.');
  if (!v.primeiro_vencimento) throw new HttpError(400, 'Informe a data do primeiro vencimento no valor antes de gerar as contas.');
  const d = obterDemanda(v.demanda_id);
  const ref = d.numero ? `${TIPOS[d.tipo]} ${d.numero}` : d.titulo;
  const base = Math.floor(v.valor_centavos / v.parcelas); const resto = v.valor_centavos - base * v.parcelas;
  const ids = tx(() => {
    const criados = [];
    for (let i = 0; i < v.parcelas; i++) {
      const venc = addMeses(v.primeiro_vencimento, i);
      const valor = base + (i === 0 ? resto : 0);
      criados.push(Number(db.prepare(`INSERT INTO lancamentos (avulsa, descricao, fornecedor, categoria, competencia, vencimento, valor_previsto_centavos, valor_cobrado_centavos,
        status, responsavel_id, observacoes, demanda_id, juridico_valor_id) VALUES (1, ?, ?, 'Jurídico', ?, ?, ?, ?, 'aguardando_pagamento', ?, ?, ?, ?)`).run(
        `${TIPOS_VALOR[v.tipo]} · ${ref}${v.parcelas > 1 ? ` (${i + 1}/${v.parcelas})` : ''}`, d.parte_nome || 'Parte contrária', competenciaDe(venc), venc, valor, valor,
        d.responsavel_id, v.descricao, d.id, v.id).lastInsertRowid));
    }
    db.prepare('UPDATE juridico_valores SET gerou_contas = 1 WHERE id = ?').run(v.id);
    fin.marcarAtrasados();
    andamentoSistema(d.id, `${v.parcelas} conta(s) a pagar gerada(s) a partir do valor de ${TIPOS_VALOR[v.tipo].toLowerCase()}.`, req.usuario.id);
    A.auditar(req, 'gerou contas a pagar de valor jurídico', 'demanda', d.id, null, { valor_id: v.id, lancamentos: criados });
    return criados;
  });
  res.status(201).json({ lancamentos: ids });
});

module.exports = router;
