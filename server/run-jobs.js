'use strict';
// Executa as rotinas uma vez (para agendar via cron externo, ex.: a cada 15 minutos)
process.env.TZ = 'America/Sao_Paulo';
const { executarRotinas } = require('./jobs');
executarRotinas().then((r) => { console.log('Rotinas executadas:', r); process.exit(0); })
  .catch((e) => { console.error(e); process.exit(1); });
