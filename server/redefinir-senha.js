'use strict';
// Redefine a senha de um usuário direto no banco (uso local, por quem tem acesso à pasta do sistema).
// Uso:
//   node server/redefinir-senha.js                      -> lista os usuários cadastrados
//   node server/redefinir-senha.js email@x.com NovaSenha -> redefine a senha e encerra as sessões abertas
process.env.TZ = 'America/Sao_Paulo';
const { db } = require('./db');
const { hashSenha } = require('./auth');

const [email, senha] = process.argv.slice(2);
const PERFIL = { administrador: 'Administrador', financeiro: 'Financeiro', gestor: 'Gestor', consulta: 'Consulta' };

if (!email) {
  const lista = db.prepare('SELECT nome, email, perfil, ativo FROM usuarios ORDER BY perfil, nome').all();
  if (!lista.length) { console.log('Nenhum usuário cadastrado. Abra o sistema no navegador para criar o administrador.'); process.exit(0); }
  console.log('\nUsuários cadastrados:\n');
  for (const u of lista) console.log(`  ${u.email.padEnd(36)} ${PERFIL[u.perfil].padEnd(14)} ${u.nome}${u.ativo ? '' : '  (inativo)'}`);
  console.log('\nPara redefinir: node --disable-warning=ExperimentalWarning server/redefinir-senha.js EMAIL NOVA_SENHA\n');
  process.exit(0);
}

const u = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email.trim().toLowerCase());
if (!u) { console.log(`\nNão existe usuário com o e-mail ${email}. Rode o comando sem nada depois para ver a lista.\n`); process.exit(1); }
if (!senha || senha.length < 10) { console.log('\nA nova senha precisa ter pelo menos 10 caracteres.\n'); process.exit(1); }

db.prepare('UPDATE usuarios SET senha_hash = ?, ativo = 1 WHERE id = ?').run(hashSenha(senha), u.id);
db.prepare('DELETE FROM sessoes WHERE usuario_id = ?').run(u.id);
db.prepare(`INSERT INTO auditoria (usuario_id, usuario_nome, acao, entidade, entidade_id, ip) VALUES (?, 'Terminal do servidor', 'redefiniu a senha pelo terminal', 'usuario', ?, 'local')`).run(u.id, u.id);
console.log(`\nSenha de ${u.nome} (${u.email}) redefinida. Entre no sistema com a nova senha.\n`);
