'use strict';
const TZ = 'America/Sao_Paulo';

// Data de hoje (YYYY-MM-DD) no fuso de São Paulo
function hoje() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function agoraIso() { return new Date().toISOString(); }

function parseData(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return dt;
}
function fmtData(dt) { return dt.toISOString().slice(0, 10); }
function addDias(s, n) { const d = parseData(s); d.setUTCDate(d.getUTCDate() + n); return fmtData(d); }
function diffDias(a, b) { return Math.round((parseData(a) - parseData(b)) / 86400000); } // a - b
function diasNoMes(y, m0) { return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate(); }

// Soma meses mantendo o dia habitual (ex.: dia 31 vira 30/28 nos meses curtos)
function addMeses(s, n, diaPreferido) {
  const d = parseData(s);
  const dia = diaPreferido || d.getUTCDate();
  const totalM = d.getUTCMonth() + n;
  const y = d.getUTCFullYear() + Math.floor(totalM / 12);
  const m0 = ((totalM % 12) + 12) % 12;
  return fmtData(new Date(Date.UTC(y, m0, Math.min(dia, diasNoMes(y, m0)))));
}
function competenciaDe(s) { return String(s).slice(0, 7); }
function inicioMes(comp) { return `${comp}-01`; }
function fimMes(comp) { const [y, m] = comp.split('-').map(Number); return `${comp}-${String(diasNoMes(y, m - 1)).padStart(2, '0')}`; }
function mesAnterior(comp, n = 1) { return competenciaDe(addMeses(inicioMes(comp), -n, 1)); }

// "389,90" | "1.234,56" | 389.9 -> centavos
function parseValor(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Math.round(v * 100);
  let s = String(v).trim().replace(/[R$\s]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return NaN;
  return Math.round(n * 100);
}
function brl(centavos) {
  if (centavos === null || centavos === undefined) return '—';
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function dataBR(s) { if (!s) return '—'; const [y, m, d] = s.slice(0, 10).split('-'); return `${d}/${m}/${y}`; }

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const txt = (v, max = 500) => (v === undefined || v === null ? null : String(v).trim().slice(0, max) || null);
const int = (v) => (v === undefined || v === null || v === '' ? null : Number.parseInt(v, 10));

module.exports = {
  TZ, hoje, agoraIso, parseData, fmtData, addDias, diffDias, addMeses, competenciaDe, inicioMes, fimMes, mesAnterior,
  parseValor, brl, dataBR, HttpError, txt, int,
};
