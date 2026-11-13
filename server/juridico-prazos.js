'use strict';
// Apoio ao cálculo de prazos. É uma ESTIMATIVA: considera fins de semana, feriados nacionais e (opcionalmente)
// o recesso forense de 20/12 a 20/01 (art. 220 do CPC). Feriados estaduais/municipais e suspensões do tribunal
// não entram — a data final sempre deve ser conferida antes de ser usada.
const { addDias, parseData } = require('./util');

function pascoa(ano) {
  const a = ano % 19; const b = Math.floor(ano / 100); const c = ano % 100;
  const d = Math.floor(b / 4); const e = b % 4; const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3); const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4); const k = c % 4; const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31); const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

const cache = {};
function feriados(ano) {
  if (cache[ano]) return cache[ano];
  const p = pascoa(ano);
  const lista = {
    [`${ano}-01-01`]: 'Confraternização Universal',
    [addDias(p, -48)]: 'Carnaval', [addDias(p, -47)]: 'Carnaval',
    [addDias(p, -2)]: 'Sexta-feira Santa',
    [`${ano}-04-21`]: 'Tiradentes', [`${ano}-05-01`]: 'Dia do Trabalho',
    [addDias(p, 60)]: 'Corpus Christi',
    [`${ano}-09-07`]: 'Independência', [`${ano}-10-12`]: 'Nossa Senhora Aparecida',
    [`${ano}-11-02`]: 'Finados', [`${ano}-11-15`]: 'Proclamação da República',
    [`${ano}-11-20`]: 'Dia Nacional de Zumbi e da Consciência Negra', [`${ano}-12-25`]: 'Natal',
  };
  cache[ano] = lista;
  return lista;
}

function motivoNaoUtil(data, recesso) {
  const d = parseData(data);
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return dow === 0 ? 'Domingo' : 'Sábado';
  const f = feriados(d.getUTCFullYear())[data];
  if (f) return f;
  if (recesso) {
    const md = data.slice(5);
    if (md >= '12-20' || md <= '01-20') return 'Recesso forense';
  }
  return null;
}

// Conta N dias úteis excluindo o dia do começo (art. 224 do CPC)
function calcularPrazo(inicio, dias, { recesso = true } = {}) {
  if (!parseData(inicio)) throw new Error('Data inicial inválida.');
  const n = Number(dias);
  if (!Number.isInteger(n) || n < 1 || n > 365) throw new Error('Informe a quantidade de dias (1 a 365).');
  let data = inicio; let contados = 0; const ignorados = [];
  while (contados < n) {
    data = addDias(data, 1);
    const motivo = motivoNaoUtil(data, recesso);
    if (motivo) { if (motivo !== 'Sábado' && motivo !== 'Domingo') ignorados.push({ data, motivo }); } else contados++;
  }
  return { data, ignorados: ignorados.slice(0, 40) };
}

// Número CNJ: NNNNNNN-DD.AAAA.J.TR.OOOO (Resolução CNJ 65/2008)
function normalizarCNJ(numero) {
  const d = String(numero || '').replace(/\D/g, '');
  if (d.length !== 20) return { valido: null, formatado: String(numero || '').trim() || null };
  const [n, dv, a, j, tr, o] = [d.slice(0, 7), d.slice(7, 9), d.slice(9, 13), d.slice(13, 14), d.slice(14, 16), d.slice(16, 20)];
  const calc = 98n - (BigInt(`${n}${a}${j}${tr}${o}00`) % 97n);
  return { valido: String(calc).padStart(2, '0') === dv, formatado: `${n}-${dv}.${a}.${j}.${tr}.${o}` };
}

module.exports = { calcularPrazo, normalizarCNJ, feriados };
