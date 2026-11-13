'use strict';
const router = require('express').Router();
const { db } = require('../db');
const A = require('../auth');
const { HttpError, txt } = require('../util');

// Lista simples para selects de "responsável" — qualquer usuário logado
router.get('/opcoes', A.exigirLogin, (_req, res) => {
  res.json(db.prepare('SELECT id, nome FROM usuarios WHERE ativo = 1 ORDER BY nome').all());
});

router.use(A.exigir('usuarios.gerenciar'));

router.get('/', (_req, res) => {
  res.json(db.prepare('SELECT * FROM usuarios ORDER BY ativo DESC, nome').all().map(A.usuarioPublico));
});

function limparExtras(x) {
  const ok = (arr) => (Array.isArray(arr) ? arr.filter((p) => A.PERMISSOES[p]) : []);
  return { add: ok(x?.add), remove: ok(x?.remove) };
}
const adminsAtivos = () => db.prepare("SELECT COUNT(*) AS n FROM usuarios WHERE perfil = 'administrador' AND ativo = 1").get().n;

router.post('/', (req, res) => {
  const nome = txt(req.body.nome, 120); const email = txt(req.body.email, 200)?.toLowerCase();
  const perfil = req.body.perfil;
  if (!nome || !email || !/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Informe nome e e-mail válidos.');
  if (!A.PERFIS[perfil]) throw new HttpError(400, 'Perfil inválido.');
  A.validarSenha(req.body.senha);
  if (db.prepare('SELECT 1 FROM usuarios WHERE email = ?').get(email)) throw new HttpError(409, 'Já existe um usuário com este e-mail.');
  const id = Number(db.prepare(`INSERT INTO usuarios (nome, email, senha_hash, perfil, whatsapp, permissoes_extra) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(nome, email, A.hashSenha(req.body.senha), perfil, txt(req.body.whatsapp, 30), JSON.stringify(limparExtras(req.body.permissoes_extra))).lastInsertRowid);
  const novo = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
  A.auditar(req, 'criou usuário', 'usuario', id, null, novo);
  res.status(201).json(A.usuarioPublico(novo));
});

router.put('/:id', (req, res) => {
  const antes = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.params.id);
  if (!antes) throw new HttpError(404, 'Usuário não encontrado.');
  const perfil = req.body.perfil ?? antes.perfil;
  if (!A.PERFIS[perfil]) throw new HttpError(400, 'Perfil inválido.');
  const ativo = req.body.ativo === undefined ? antes.ativo : (req.body.ativo ? 1 : 0);
  const deixaDeSerAdmin = antes.perfil === 'administrador' && antes.ativo && (perfil !== 'administrador' || !ativo);
  if (deixaDeSerAdmin && adminsAtivos() <= 1) throw new HttpError(400, 'É preciso manter pelo menos um administrador ativo.');
  const extras = req.body.permissoes_extra ? JSON.stringify(limparExtras(req.body.permissoes_extra)) : antes.permissoes_extra;
  db.prepare('UPDATE usuarios SET nome = ?, perfil = ?, whatsapp = ?, ativo = ?, permissoes_extra = ? WHERE id = ?').run(
    txt(req.body.nome, 120) || antes.nome, perfil, req.body.whatsapp === undefined ? antes.whatsapp : txt(req.body.whatsapp, 30), ativo, extras, antes.id,
  );
  if (!ativo) db.prepare('DELETE FROM sessoes WHERE usuario_id = ?').run(antes.id);
  const depois = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(antes.id);
  A.auditar(req, 'alterou usuário', 'usuario', antes.id, antes, depois);
  res.json(A.usuarioPublico(depois));
});

router.put('/:id/senha', (req, res) => {
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.params.id);
  if (!u) throw new HttpError(404, 'Usuário não encontrado.');
  A.validarSenha(req.body.senha);
  db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(A.hashSenha(req.body.senha), u.id);
  db.prepare('DELETE FROM sessoes WHERE usuario_id = ?').run(u.id);
  A.auditar(req, 'redefiniu a senha de um usuário', 'usuario', u.id);
  res.json({ ok: true });
});

module.exports = router;
