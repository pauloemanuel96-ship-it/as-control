'use strict';
process.env.TZ = 'America/Sao_Paulo';
const path = require('node:path');
const fs = require('node:fs');

// Carrega .env simples (sem dependência externa)
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const linha of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const express = require('express');
const multer = require('multer');
const A = require('./auth');
const { HttpError } = require('./util');
const { iniciarAgendador } = require('./jobs');
const cobrancas = require('./routes/cobrancas');
const sistema = require('./routes/sistema');

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : process.env.TRUST_PROXY);

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; frame-src 'self'; frame-ancestors 'none'");
  next();
});

// Webhooks externos (antes do parser global e sem sessão)
app.use('/api/webhooks/whatsapp', sistema.webhookWhatsapp);
app.use('/api/webhooks/cobrancas', express.json({ limit: '200kb' }), cobrancas.webhook);

app.use('/api', express.json({ limit: '1mb' }), A.carregarUsuario, A.exigirCabecalhoApp);
app.get('/api/saude', (_req, res) => res.json({ ok: true }));
app.use('/api', require('./routes/acesso'));
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/servicos', require('./routes/servicos'));
app.use('/api/lancamentos', require('./routes/lancamentos'));
app.use('/api/documentos', require('./routes/documentos'));
app.use('/api/cobrancas', cobrancas.router);
app.use('/api/juridico', require('./routes/juridico'));
app.use('/api', require('./routes/painel'));
app.use('/api', sistema.router);
app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Rota não encontrada.')));

app.use(express.static(path.join(__dirname, '..', 'public'), { index: 'index.html', maxAge: '1h' }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) err = new HttpError(400, err.code === 'LIMIT_FILE_SIZE' ? 'Arquivo maior que 15 MB.' : 'Falha no envio do arquivo.');
  if (err.type === 'entity.parse.failed') err = new HttpError(400, 'Dados enviados em formato inválido.');
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ erro: status >= 500 ? 'Erro interno. Tente novamente ou fale com o administrador.' : err.message });
});

const PORTA = Number(process.env.PORT || 3000);
app.listen(PORTA, () => {
  console.log(`AS Control rodando em http://localhost:${PORTA}`);
  if (process.env.DISABLE_JOBS !== 'true') iniciarAgendador();
});
