'use strict';
// Carrega o arquivo .env da raiz do projeto (sem dependência externa).
// Usado pelo servidor e por todos os comandos avulsos (backup, rotinas, redefinir senha).
// Variáveis já definidas no ambiente têm prioridade sobre o arquivo.
const path = require('node:path');
const fs = require('node:fs');

const arquivo = path.join(__dirname, '..', '.env');
if (fs.existsSync(arquivo)) {
  for (const linha of fs.readFileSync(arquivo, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
