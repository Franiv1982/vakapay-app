// src/utils/telefono.js — Validación de teléfonos
// ================================================================
// Usa libphonenumber-js (los datos de numeración de Google) para comprobar
// que el número es posible en su país: "+34 123" o "+34 600" no lo son.
// Se guarda siempre como "+<prefijo> <número>", p. ej. "+34 608534056".
// ================================================================
const { parsePhoneNumberFromString } = require('libphonenumber-js/min');

function normalizarTelefono(texto) {
  const t = String(texto || '').trim();
  if (!t) return { ok: false, error: 'El teléfono es obligatorio' };
  if (!t.startsWith('+')) return { ok: false, error: 'Falta el prefijo del país (ej: +34)' };
  const n = parsePhoneNumberFromString(t);
  if (!n || !n.isValid()) return { ok: false, error: 'El número de teléfono no es válido para ese país' };
  return { ok: true, valor: `+${n.countryCallingCode} ${n.nationalNumber}` };
}

module.exports = { normalizarTelefono };
