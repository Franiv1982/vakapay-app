// src/utils/cobro.js — Datos para cobrar (Bizum e IBAN)
// ================================================================
// Cada usuario puede guardar cómo quiere cobrar. Solo se muestran a
// quien comparte grupo con él, en el momento de pagarle una deuda.
// ================================================================

// Teléfono para Bizum: se guardan solo dígitos (y + inicial). 9 a 15 dígitos.
function normalizarBizum(t) {
  if (t === undefined) return { ok: true, valor: undefined };
  const s = String(t || '').trim();
  if (!s) return { ok: true, valor: null };
  const limpio = s.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
  const digitos = limpio.replace(/\D/g, '');
  if (digitos.length < 9 || digitos.length > 15) return { ok: false, error: 'El teléfono para Bizum no es válido' };
  return { ok: true, valor: limpio };
}

// IBAN: mayúsculas sin espacios y comprobación oficial (módulo 97)
function ibanValido(iban) {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  const reordenado = iban.slice(4) + iban.slice(0, 4);
  const numerico = reordenado.replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55));
  let resto = 0;
  for (const d of numerico) resto = (resto * 10 + Number(d)) % 97;
  return resto === 1;
}
function normalizarIban(v) {
  if (v === undefined) return { ok: true, valor: undefined };
  const s = String(v || '').replace(/\s+/g, '').toUpperCase();
  if (!s) return { ok: true, valor: null };
  if (!ibanValido(s)) return { ok: false, error: 'El IBAN no es válido' };
  return { ok: true, valor: s };
}

module.exports = { normalizarBizum, normalizarIban, ibanValido };
