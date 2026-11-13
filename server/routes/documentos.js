'use strict';
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const router = require('express').Router();
const multer = require('multer');
const { db, DATA_DIR } = require('../db');
const A = require('../auth');
const { HttpError, int, competenciaDe } = require('../util');

const PASTA = path.join(DATA_DIR, 'documentos');
fs.mkdirSync(PASTA, { recursive: true });
const TIPOS = ['boleto', 'fatura', 'nota_fiscal', 'comprovante', 'contrato', 'proposta', 'renovacao', 'outro'];
// Documentos de demandas usam uma lista própria, guardada em tipo_juridico (a coluna "tipo" fica como 'outro')
const TIPOS_JURIDICO = ['peticao_inicial', 'contestacao', 'citacao_intimacao', 'procuracao_preposicao', 'ata_audiencia', 'sentenca_decisao', 'acordo', 'reclamacao', 'resposta', 'comprovante', 'outro'];
const PERMITIDOS = {
  '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.xml': 'application/xml', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.txt': 'text/plain',
};

const upload = multer({
  storage: multer.diskStorage({
    destination: PASTA,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!PERMITIDOS[ext]) return cb(new HttpError(400, 'Formato não aceito. Envie PDF, imagem, XML, DOCX, XLSX ou TXT.'));
    cb(null, true);
  },
});

router.get('/', A.exigir('documentos.ver'), (req, res) => {
  const w = []; const a = [];
  // Documentos de demandas jurídicas só aparecem para quem tem acesso ao jurídico
  if (!A.tem(req, 'juridico.ver')) w.push('d.demanda_id IS NULL');
  if (req.query.origem === 'juridico') w.push('d.demanda_id IS NOT NULL');
  if (req.query.origem === 'contas') w.push('d.demanda_id IS NULL');
  if (req.query.tipo) { w.push('d.tipo = ?'); a.push(req.query.tipo); }
  if (req.query.servico_id) { w.push('d.servico_id = ?'); a.push(req.query.servico_id); }
  if (req.query.competencia) { w.push('d.competencia = ?'); a.push(req.query.competencia); }
  if (req.query.fornecedor) { w.push('COALESCE(s.fornecedor, l.fornecedor) = ?'); a.push(req.query.fornecedor); }
  if (req.query.busca) { w.push('(d.nome_original LIKE ? OR s.nome LIKE ? OR l.descricao LIKE ?)'); a.push(...Array(3).fill(`%${req.query.busca}%`)); }
  res.json(db.prepare(`SELECT d.id, d.tipo, d.tipo_juridico, d.nome_original, d.tamanho, d.competencia, d.criado_em, d.lancamento_id, d.servico_id,
    d.demanda_id, dm.titulo AS demanda_titulo, dm.numero AS demanda_numero,
    COALESCE(s.nome, l.descricao) AS servico_nome, COALESCE(s.fornecedor, l.fornecedor, dm.parte_nome) AS fornecedor, u.nome AS enviado_por_nome
    FROM documentos d LEFT JOIN servicos s ON s.id = d.servico_id LEFT JOIN lancamentos l ON l.id = d.lancamento_id LEFT JOIN demandas dm ON dm.id = d.demanda_id
    LEFT JOIN usuarios u ON u.id = d.enviado_por ${w.length ? `WHERE ${w.join(' AND ')}` : ''} ORDER BY d.criado_em DESC LIMIT 500`).all(...a));
});

// Pré-checagem antes de gravar o arquivo; a permissão exata é conferida depois de ler os campos
const podeEnviarAlgo = (req, _res, next) => {
  if (!req.usuario) return next(new HttpError(401, 'Sessão expirada. Entre novamente.'));
  if (!A.tem(req, 'documentos.enviar') && !A.tem(req, 'juridico.editar')) return next(new HttpError(403, 'Seu perfil não tem permissão para esta ação.'));
  next();
};
router.post('/', podeEnviarAlgo, upload.single('arquivo'), (req, res) => {
  const f = req.file;
  if (!f) throw new HttpError(400, 'Selecione um arquivo.');
  const remover = () => fs.rm(f.path, { force: true }, () => {});
  try {
    let tipo = req.body.tipo; let tipoJuridico = null;
    if (int(req.body.demanda_id)) {
      if (!TIPOS_JURIDICO.includes(tipo)) throw new HttpError(400, 'Tipo de documento inválido.');
      tipoJuridico = tipo; tipo = 'outro';
    } else if (!TIPOS.includes(tipo)) throw new HttpError(400, 'Tipo de documento inválido.');
    let lancamentoId = int(req.body.lancamento_id); let servicoId = int(req.body.servico_id);
    const demandaId = int(req.body.demanda_id);
    let competencia = /^\d{4}-\d{2}$/.test(req.body.competencia || '') ? req.body.competencia : null;
    if (demandaId) {
      if (!A.tem(req, 'juridico.editar')) throw new HttpError(403, 'Seu perfil não tem permissão para anexar documentos jurídicos.');
      if (!db.prepare('SELECT 1 FROM demandas WHERE id = ?').get(demandaId)) throw new HttpError(404, 'Demanda não encontrada.');
      lancamentoId = null; servicoId = null;
    } else if (!A.tem(req, 'documentos.enviar')) throw new HttpError(403, 'Seu perfil não tem permissão para esta ação.');
    if (demandaId) { /* vínculo jurídico já validado */ } else if (lancamentoId) {
      const l = db.prepare('SELECT * FROM lancamentos WHERE id = ?').get(lancamentoId);
      if (!l) throw new HttpError(404, 'Lançamento não encontrado.');
      servicoId = l.servico_id; competencia = competencia || l.competencia;
    } else if (servicoId) {
      if (!db.prepare('SELECT 1 FROM servicos WHERE id = ?').get(servicoId)) throw new HttpError(404, 'Serviço não encontrado.');
    } else if (!req.body.avulso) throw new HttpError(400, 'Vincule o documento a um serviço ou lançamento.');
    const ext = path.extname(f.originalname).toLowerCase();
    const id = Number(db.prepare(`INSERT INTO documentos (lancamento_id, servico_id, demanda_id, tipo, tipo_juridico, nome_original, arquivo, mime, tamanho, competencia, enviado_por)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(lancamentoId, servicoId, demandaId, tipo, tipoJuridico, f.originalname.slice(0, 200), path.basename(f.path),
      PERMITIDOS[ext], f.size, competencia || competenciaDe(new Date().toISOString()), req.usuario.id).lastInsertRowid);
    A.auditar(req, 'anexou documento', demandaId ? 'demanda' : 'documento', demandaId || id, null, { documento_id: id, tipo, nome: f.originalname, lancamento_id: lancamentoId, servico_id: servicoId, demanda_id: demandaId });
    res.status(201).json({ id });
  } catch (e) { remover(); throw e; }
});

router.get('/:id/arquivo', A.exigirLogin, (req, res) => {
  const d = db.prepare('SELECT * FROM documentos WHERE id = ?').get(req.params.id);
  if (!d) throw new HttpError(404, 'Documento não encontrado.');
  if (!A.tem(req, d.demanda_id ? 'juridico.ver' : 'documentos.ver')) throw new HttpError(403, 'Seu perfil não tem permissão para abrir este documento.');
  const caminho = path.join(PASTA, path.basename(d.arquivo));
  if (!fs.existsSync(caminho)) throw new HttpError(404, 'Arquivo não encontrado no servidor.');
  const modo = req.query.baixar ? 'attachment' : 'inline';
  res.setHeader('Content-Type', d.mime);
  res.setHeader('Content-Disposition', `${modo}; filename*=UTF-8''${encodeURIComponent(d.nome_original)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  fs.createReadStream(caminho).pipe(res);
});

router.delete('/:id', A.exigir('config.gerenciar'), (req, res) => {
  const d = db.prepare('SELECT * FROM documentos WHERE id = ?').get(req.params.id);
  if (!d) throw new HttpError(404, 'Documento não encontrado.');
  if (db.prepare('SELECT 1 FROM cobrancas_recebidas WHERE documento_id = ?').get(d.id)) throw new HttpError(400, 'Este documento está vinculado a uma cobrança conferida e não pode ser excluído.');
  db.prepare('DELETE FROM documentos WHERE id = ?').run(d.id);
  fs.rm(path.join(PASTA, path.basename(d.arquivo)), { force: true }, () => {});
  A.auditar(req, 'excluiu documento', 'documento', d.id, d, null);
  res.json({ ok: true });
});

module.exports = router;
