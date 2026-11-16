// src/utils/importe.js — Importes con el formato de España en los textos del servidor
// (actividad, chat, avisos): 1.234,56 € · −7,00 € · 7,00 US$
// Igual que formatoImporte() de la app (public/js/datos.js).
const SIMBOLO = { EUR: '€', USD: 'US$', GBP: '£', ARS: 'ARS' };

// Solo el número: 1.234,56 (para textos donde no se sabe la moneda)
function formatoNumero(n) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  const [ent, dec] = Math.abs(v).toFixed(2).split('.');
  return `${v < 0 ? '−' : ''}${ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`;
}

// Número y moneda: 20,00 €
function formatoImporte(n, moneda = 'EUR') {
  return `${formatoNumero(n)}\u00a0${SIMBOLO[moneda] || moneda || '€'}`;
}

module.exports = { formatoNumero, formatoImporte };
