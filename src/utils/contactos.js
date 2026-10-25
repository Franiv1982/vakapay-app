// src/utils/contactos.js — Detección de contactos duplicados
// ================================================================
// Un mismo amigo puede llegar por varias vías (alta manual, agenda del
// móvil, invitación a un grupo...) con el nombre escrito distinto.
// Se considera el mismo contacto si coincide el email, el teléfono
// o el nombre (sin distinguir mayúsculas ni espacios).
// ================================================================
const db = require('../db/database');

const normEmail  = e => String(e || '').trim().toLowerCase();
const normNombre = n => String(n || '').trim().replace(/\s+/g, ' ').toLowerCase();
// Solo dígitos; se comparan los 9 últimos para que "+34 600 000 000" y "600000000" coincidan
const normTel = t => {
  const d = String(t || '').replace(/\D/g, '');
  return d.length >= 6 ? d.slice(-9) : '';
};

// Devuelve { amigo, motivo } si ya existe un contacto equivalente; si no, null
async function buscarAmigoDuplicado(ownerId, { name, email, phone }, excluirId = null) {
  const r = await db.query('SELECT * FROM friends WHERE owner_id = $1', [ownerId]);
  const em = normEmail(email), tel = normTel(phone), nom = normNombre(name);
  for (const f of r.rows) {
    if (excluirId && String(f.id) === String(excluirId)) continue;
    if (em && normEmail(f.email) === em) return { amigo: f, motivo: 'email' };
    if (tel && normTel(f.phone) === tel) return { amigo: f, motivo: 'teléfono' };
    if (nom && normNombre(f.name) === nom) return { amigo: f, motivo: 'nombre' };
  }
  return null;
}

// Si el contacto ya existe, completa los datos que le falten (email/teléfono)
async function completarAmigo(amigo, { email, phone }) {
  const nuevoEmail = !amigo.email && email ? email : amigo.email;
  const nuevoTel   = !amigo.phone && phone ? phone : amigo.phone;
  if (nuevoEmail !== amigo.email || nuevoTel !== amigo.phone) {
    await db.query('UPDATE friends SET email = $1, phone = $2 WHERE id = $3', [nuevoEmail || '', nuevoTel || '', amigo.id]);
  }
}

module.exports = { buscarAmigoDuplicado, completarAmigo, normEmail, normTel, normNombre };
