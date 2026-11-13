'use strict';
const router = require('express').Router();
const { db } = require('../db');
const A = require('../auth');
const { HttpError, txt } = require('../util');
const { TIPOS_ALERTA, TIPOS_WPP_PADRAO } = require('../jobs');

const totalUsuarios = () => db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n;

router.get('/estado', (req, res) => {
  res.json({
    precisa_configurar: totalUsuarios() === 0,
    usuario: A.usuarioPublico(req.usuario),
    permissoes_disponiveis: A.PERMISSOES, perfis: A.PERFIS, tipos_alerta: TIPOS_ALERTA, tipos_wpp_padrao: TIPOS_WPP_PADRAO,
  });
});

// Primeiro acesso: cria o administrador. Só funciona enquanto não houver nenhum usuário.
router.post('/setup', (req, res) => {
  if (totalUsuarios() > 0) throw new HttpError(409, 'O sistema já foi configurado.');
  const nome = txt(req.body.nome, 120); const email = txt(req.body.email, 200)?.toLowerCase();
  if (!nome || !email || !/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Informe nome e e-mail válidos.');
  A.validarSenha(req.body.senha);
  const id = Number(db.prepare(`INSERT INTO usuarios (nome, email, senha_hash, perfil, preferencias) VALUES (?, ?, ?, 'administrador', ?)`)
    .run(nome, email, A.hashSenha(req.body.senha), JSON.stringify({ receber_todos: true })).lastInsertRowid);
  req.usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
  A.auditar(req, 'criou o primeiro administrador', 'usuario', id, null, req.usuario);
  A.criarSessao(res, id);
  res.status(201).json({ ok: true });
});

router.post('/login', (req, res) => {
  const email = txt(req.body.email, 200)?.toLowerCase() || '';
  const chave = `${req.ip}|${email}`;
  A.limitarLogin(chave);
  const u = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email);
  if (!u || !u.ativo || !A.verificarSenha(String(req.body.senha || ''), u.senha_hash)) {
    throw new HttpError(401, 'E-mail ou senha incorretos.');
  }
  A.limparTentativas(chave);
  A.criarSessao(res, u.id);
  req.usuario = u; A.auditar(req, 'entrou no sistema', 'sessao', u.id);
  res.json({ ok: true });
});

router.post('/logout', (req, res) => { A.encerrarSessao(req, res); res.json({ ok: true }); });

router.put('/eu', A.exigirLogin, (req, res) => {
  const antes = req.usuario;
  const nome = txt(req.body.nome, 120) || antes.nome;
  const whatsapp = txt(req.body.whatsapp, 30);
  const p = req.body.preferencias || {};
  const preferencias = {
    receber_todos: !!p.receber_todos,
    whatsapp_tipos: Array.isArray(p.whatsapp_tipos) ? p.whatsapp_tipos.filter((t) => TIPOS_ALERTA[t]) : TIPOS_WPP_PADRAO,
  };
  db.prepare('UPDATE usuarios SET nome = ?, whatsapp = ?, preferencias = ? WHERE id = ?').run(nome, whatsapp, JSON.stringify(preferencias), antes.id);
  const depois = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(antes.id);
  A.auditar(req, 'atualizou o próprio perfil', 'usuario', antes.id, antes, depois);
  res.json(A.usuarioPublico(depois));
});

router.put('/eu/senha', A.exigirLogin, (req, res) => {
  if (!A.verificarSenha(String(req.body.atual || ''), req.usuario.senha_hash)) throw new HttpError(400, 'A senha atual não confere.');
  A.validarSenha(req.body.nova);
  db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(A.hashSenha(req.body.nova), req.usuario.id);
  A.auditar(req, 'alterou a própria senha', 'usuario', req.usuario.id);
  res.json({ ok: true });
});

module.exports = router;
