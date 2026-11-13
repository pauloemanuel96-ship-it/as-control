'use strict';
/*
 * Backup do AS Control: cópia consistente do banco (mesmo com o sistema rodando) + pasta de documentos.
 * Cada backup vira uma pasta datada em BACKUP_DIR. Os mais antigos além de BACKUP_KEEP são apagados.
 *
 * Uso manual:   npm run backup
 * Automático:   o servidor faz um backup ao iniciar (se o último tiver mais de 20h) e confere a cada hora.
 */
const path = require('node:path');
const fs = require('node:fs');
const { db, DATA_DIR } = require('./db');

const PASTA = path.resolve(process.env.BACKUP_DIR || path.join(DATA_DIR, '..', 'backups'));
const MANTER = Math.max(1, Number(process.env.BACKUP_KEEP) || 30);
const INTERVALO_H = 20;
const PREFIXO = 'as-control_';

function carimbo() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}_${p.hour}${p.minute}${p.second}`;
}

function listar() {
  if (!fs.existsSync(PASTA)) return [];
  return fs.readdirSync(PASTA, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith(PREFIXO) && fs.existsSync(path.join(PASTA, d.name, 'as-control.db')))
    .map((d) => d.name).sort();
}

function fazerBackup() {
  fs.mkdirSync(PASTA, { recursive: true });
  const destino = path.join(PASTA, `${PREFIXO}${carimbo()}`);
  const temp = `${destino}.parcial`;
  fs.rmSync(temp, { recursive: true, force: true });
  fs.mkdirSync(temp, { recursive: true });
  try {
    // VACUUM INTO gera um arquivo único e consistente, sem precisar parar o sistema
    const arquivoDb = path.join(temp, 'as-control.db').replace(/'/g, "''");
    db.exec(`VACUUM INTO '${arquivoDb}'`);
    const docs = path.join(DATA_DIR, 'documentos');
    let qtdDocs = 0;
    if (fs.existsSync(docs)) {
      fs.cpSync(docs, path.join(temp, 'documentos'), { recursive: true });
      qtdDocs = fs.readdirSync(docs).length;
    }
    const contar = (t) => { try { return db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n; } catch { return 0; } };
    fs.writeFileSync(path.join(temp, 'LEIA-ME.txt'), [
      'Backup do AS Control',
      `Gerado em: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
      `Serviços: ${contar('servicos')} · Lançamentos: ${contar('lancamentos')} · Demandas jurídicas: ${contar('demandas')} · Usuários: ${contar('usuarios')} · Documentos: ${qtdDocs}`,
      '',
      'Para restaurar:',
      '1. Pare o sistema (Ctrl + C na janela do npm start).',
      '2. Na pasta storage do projeto, apague as-control.db, as-control.db-wal e as-control.db-shm.',
      '3. Copie o as-control.db deste backup para a pasta storage.',
      '4. Copie a pasta documentos deste backup para dentro de storage (substituindo a atual).',
      '5. Inicie o sistema de novo (npm start).',
      '',
    ].join('\r\n'));
    fs.renameSync(temp, destino);
  } catch (e) {
    fs.rmSync(temp, { recursive: true, force: true });
    throw e;
  }
  const todos = listar();
  for (const velho of todos.slice(0, Math.max(0, todos.length - MANTER))) fs.rmSync(path.join(PASTA, velho), { recursive: true, force: true });
  return destino;
}

function ultimoBackupEm() {
  const ult = listar().at(-1);
  return ult ? fs.statSync(path.join(PASTA, ult, 'as-control.db')).mtimeMs : 0;
}

function backupSeNecessario() {
  if (Date.now() - ultimoBackupEm() < INTERVALO_H * 3600e3) return null;
  try {
    const d = fazerBackup();
    console.log(`[backup] salvo em ${d}`);
    return d;
  } catch (e) {
    console.error('[backup] falhou:', e.message);
    return null;
  }
}

function iniciarBackupAutomatico() {
  if (process.env.BACKUP_DISABLED === 'true') return;
  backupSeNecessario();
  setInterval(backupSeNecessario, 3600e3).unref();
}

module.exports = { fazerBackup, backupSeNecessario, iniciarBackupAutomatico, listar, PASTA };

if (require.main === module) {
  try {
    const d = fazerBackup();
    console.log(`\nBackup salvo em:\n  ${d}\n\nBackups guardados: ${listar().length} (mantém os ${MANTER} mais recentes)\n`);
  } catch (e) {
    console.error(`\nNão foi possível fazer o backup: ${e.message}\n`);
    process.exit(1);
  }
}
