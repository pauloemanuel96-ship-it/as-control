'use strict';
const crypto = require('node:crypto');
const { db } = require('./db');
const { HttpError } = require('./util');

// ---------- Permissões ----------
const PERMISSOES = {
  'servicos.ver': 'Ver serviços e assinaturas',
  'servicos.editar': 'Cadastrar e editar serviços',
  'lancamentos.ver': 'Ver contas a pagar e vencimentos',
  'lancamentos.editar': 'Registrar cobranças e editar lançamentos',
  'lancamentos.pagar': 'Registrar pagamentos',
  'lancamentos.aprovar': 'Aprovar pagamentos',
  'documentos.ver': 'Visualizar e baixar documentos',
  'documentos.enviar': 'Anexar documentos',
  'cobrancas.conferir': 'Conferir cobranças recebidas',
  'relatorios.ver': 'Ver relatórios',
  'usuarios.gerenciar': 'Gerenciar usuários e permissões',
  'config.gerenciar': 'Configurar alertas e integrações',
  'auditoria.ver': 'Consultar histórico de auditoria',
  'juridico.ver': 'Ver demandas jurídicas, prazos e audiências',
  'juridico.editar': 'Cadastrar e atualizar demandas jurídicas',
};
const PERFIS = {
  administrador: Object.keys(PERMISSOES),
  financeiro: ['servicos.ver', 'servicos.editar', 'lancamentos.ver', 'lancamentos.editar', 'lancamentos.pagar',
    'documentos.ver', 'documentos.enviar', 'cobrancas.conferir', 'relatorios.ver'],
  gestor: ['servicos.ver', 'lancamentos.ver', 'lancamentos.aprovar', 'documentos.ver', 'relatorios.ver', 'juridico.ver'],
  consulta: ['servicos.ver', 'lancamentos.ver'],
};

function permissoesDe(usuario) {
  const base = new Set(PERFIS[usuario.perfil] || []);
  let extra = { add: [], remove: [] };
  try { extra = JSON.parse(usuario.permissoes_extra || '{}'); } catch { /* ignora */ }
  for (const p of extra.add || []) if (PERMISSOES[p]) base.add(p);
  // O administrador nunca perde a gestão de usuários (evita trancar o sistema)
  for (const p of extra.remove || []) if (!(usuario.perfil === 'administrador' && p === 'usuarios.gerenciar')) base.delete(p);
  return [...base];
}

// ---------- Senhas (scrypt nativo) ----------
function hashSenha(senha) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(senha, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
function verificarSenha(senha, armazenado) {
  const [alg, saltHex, hashHex] = String(armazenado).split('$');
  if (alg !== 'scrypt') return false;
  const hash = crypto.scryptSync(senha, Buffer.from(saltHex, 'hex'), 64, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(hash, Buffer.from(hashHex, 'hex'));
}
function validarSenha(senha) {
  if (typeof senha !== 'string' || senha.length < 10) throw new HttpError(400, 'A senha precisa ter pelo menos 10 caracteres.');
}

// ---------- Sessões ----------
const COOKIE = 'asc_sessao';
const DURACAO_H = 12;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function criarSessao(res, usuarioId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expira = new Date(Date.now() + DURACAO_H * 3600e3).toISOString();
  db.prepare('INSERT INTO sessoes (token_hash, usuario_id, expira_em) VALUES (?, ?, ?)').run(sha(token), usuarioId, expira);
  db.prepare("UPDATE usuarios SET ultimo_acesso = datetime('now') WHERE id = ?").run(usuarioId);
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${DURACAO_H * 3600}${secure}`);
}
function lerCookie(req) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return v.join('=');
  }
  return null;
}
function encerrarSessao(req, res) {
  const token = lerCookie(req);
  if (token) db.prepare('DELETE FROM sessoes WHERE token_hash = ?').run(sha(token));
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

// Carrega o usuário da sessão (não bloqueia)
function carregarUsuario(req, _res, next) {
  const token = lerCookie(req);
  if (token) {
    const row = db.prepare(`SELECT u.* FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.token_hash = ? AND s.expira_em > ? AND u.ativo = 1`).get(sha(token), new Date().toISOString());
    if (row) { req.usuario = row; req.permissoes = new Set(permissoesDe(row)); }
  }
  next();
}
function exigirLogin(req, _res, next) {
  if (!req.usuario) return next(new HttpError(401, 'Sessão expirada. Entre novamente.'));
  next();
}
// Verificação de permissão SEMPRE no backend
function exigir(...perms) {
  return (req, _res, next) => {
    if (!req.usuario) return next(new HttpError(401, 'Sessão expirada. Entre novamente.'));
    if (!perms.every((p) => req.permissoes.has(p))) return next(new HttpError(403, 'Seu perfil não tem permissão para esta ação.'));
    next();
  };
}
function tem(req, perm) { return !!req.permissoes && req.permissoes.has(perm); }

// Proteção simples contra CSRF: requisições que alteram dados precisam deste cabeçalho
function exigirCabecalhoApp(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.headers['x-as-control'] !== '1') return next(new HttpError(403, 'Requisição bloqueada.'));
  next();
}

// Limite de tentativas de login (memória)
const tentativas = new Map();
function limitarLogin(chave) {
  const agora = Date.now();
  const t = (tentativas.get(chave) || []).filter((x) => agora - x < 15 * 60e3);
  if (t.length >= 8) throw new HttpError(429, 'Muitas tentativas. Aguarde 15 minutos e tente novamente.');
  t.push(agora); tentativas.set(chave, t);
}
function limparTentativas(chave) { tentativas.delete(chave); }

// ---------- Auditoria ----------
function auditar(req, acao, entidade, entidadeId, antes, depois) {
  const limpar = (o) => {
    if (!o) return null;
    const c = { ...o }; delete c.senha_hash; return JSON.stringify(c);
  };
  db.prepare(`INSERT INTO auditoria (usuario_id, usuario_nome, acao, entidade, entidade_id, antes, depois, ip)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    req?.usuario?.id ?? null, req?.usuario?.nome ?? 'Sistema', acao, entidade, entidadeId ?? null,
    limpar(antes), limpar(depois), req?.ip ?? null,
  );
}

function usuarioPublico(u) {
  if (!u) return null;
  let preferencias = {};
  try { preferencias = JSON.parse(u.preferencias || '{}'); } catch { /* */ }
  let permissoes_extra = { add: [], remove: [] };
  try { permissoes_extra = JSON.parse(u.permissoes_extra || '{}'); } catch { /* */ }
  return {
    id: u.id, nome: u.nome, email: u.email, perfil: u.perfil, whatsapp: u.whatsapp, ativo: !!u.ativo,
    ultimo_acesso: u.ultimo_acesso, criado_em: u.criado_em, preferencias, permissoes_extra, permissoes: permissoesDe(u),
  };
}

module.exports = {
  PERMISSOES, PERFIS, permissoesDe, hashSenha, verificarSenha, validarSenha, criarSessao, encerrarSessao,
  carregarUsuario, exigirLogin, exigir, tem, exigirCabecalhoApp, limitarLogin, limparTentativas, auditar, usuarioPublico,
};
