// src/utils/perfil.js — Validación de los textos del perfil en el servidor
// ================================================================
// La app ya limita estos campos en el formulario, pero alguien podría
// llamar a la API directamente. Aquí se comprueba de verdad:
//   · que sean texto (no objetos ni listas)
//   · su longitud (nombre 2–40, apellido hasta 40, «sobre mí» hasta 140)
// ================================================================
const LIMITES = {
  nombre:   { min: 2, max: 40,  etiqueta: 'El nombre' },
  apellido: { min: 0, max: 40,  etiqueta: 'El apellido' },
  bio:      { min: 0, max: 140, etiqueta: '«Sobre mí»' },
};

// Devuelve { ok, valor } o { ok:false, error }. valor undefined = el campo no viene
function validarTextoPerfil(campo, valor) {
  if (valor === undefined) return { ok: true, valor: undefined };
  const { min, max, etiqueta } = LIMITES[campo];
  if (valor === null) valor = '';
  if (typeof valor !== 'string') return { ok: false, error: `${etiqueta} no es válido` };
  const limpio = valor.trim().replace(/\s+/g, ' ');
  if (limpio.length < min) return { ok: false, error: `${etiqueta} debe tener al menos ${min} caracteres` };
  if (limpio.length > max) return { ok: false, error: `${etiqueta} puede tener como máximo ${max} caracteres` };
  return { ok: true, valor: limpio };
}

module.exports = { validarTextoPerfil, LIMITES };
