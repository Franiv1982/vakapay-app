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

// Busca en una lista de amigos ya cargada
function buscarEnLista(lista, { name, email, phone }, excluirId = null) {
  const em = normEmail(email), tel = normTel(phone), nom = normNombre(name);
  for (const f of lista) {
    if (excluirId && String(f.id) === String(excluirId)) continue;
    if (em && normEmail(f.email) === em) return { amigo: f, motivo: 'email' };
    if (tel && normTel(f.phone) === tel) return { amigo: f, motivo: 'teléfono' };
    if (nom && normNombre(f.name) === nom) return { amigo: f, motivo: 'nombre' };
  }
  return null;
}

// Devuelve { amigo, motivo } si ya existe un contacto equivalente; si no, null
async function buscarAmigoDuplicado(ownerId, datos, excluirId = null) {
  const r = await db.query('SELECT * FROM friends WHERE owner_id = $1', [ownerId]);
  return buscarEnLista(r.rows, datos, excluirId);
}

// Si el contacto ya existe, completa los datos que le falten (email/teléfono)
async function completarAmigo(amigo, { email, phone }) {
  const nuevoEmail = !amigo.email && email ? email : amigo.email;
  const nuevoTel   = !amigo.phone && phone ? phone : amigo.phone;
  if (nuevoEmail !== amigo.email || nuevoTel !== amigo.phone) {
    await db.query('UPDATE friends SET email = $1, phone = $2 WHERE id = $3', [nuevoEmail || '', nuevoTel || '', amigo.id]);
  }
}

// Añade el amigo salvo que ya exista; si existe, completa el email o teléfono que le falten
async function agregarAmigoSiNoExiste(ownerId, { name, email = '', phone = '', notes = '' }) {
  const dup = await buscarAmigoDuplicado(ownerId, { name, email, phone });
  if (dup) { await completarAmigo(dup.amigo, { email, phone }); return dup.amigo; }
  const r = await db.query(
    'INSERT INTO friends (owner_id, name, email, phone, notes) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [ownerId, name, email || '', phone || '', notes]
  );
  return r.rows[0];
}

// Cada participante con cuenta tiene en Amigos a todos los demás del grupo
// (tengan cuenta o no). No duplica: si ya existe por email, teléfono o nombre, lo completa.
async function sincronizarAmigosGrupo(groupId) {
  const g = await db.query('SELECT name FROM groups WHERE id = $1', [groupId]);
  if (!g.rows[0]) return;
  const nota = `Del grupo "${g.rows[0].name}"`;
  const miembros = (await db.query(`
    SELECT gm.display_name, gm.user_id, u.email, u.tel
    FROM group_members gm LEFT JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = $1
  `, [groupId])).rows;
  for (const yo of miembros.filter(m => m.user_id)) {
    const mios = (await db.query('SELECT * FROM friends WHERE owner_id = $1', [yo.user_id])).rows;
    for (const otro of miembros) {
      if (otro === yo || otro.user_id === yo.user_id) continue;
      if (normNombre(otro.display_name) === normNombre(yo.display_name)) continue; // no añadirse a uno mismo
      const datos = { name: otro.display_name, email: otro.email || '', phone: otro.tel || '' };
      const dup = buscarEnLista(mios, datos);
      if (dup) { await completarAmigo(dup.amigo, datos); continue; }
      const r = await db.query(
        'INSERT INTO friends (owner_id, name, email, phone, notes) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [yo.user_id, datos.name, datos.email, datos.phone, nota]
      );
      mios.push(r.rows[0]);
    }
  }
}

// Una sola vez: completa Amigos con los participantes de los grupos que ya existían
async function migrarAmigosDeGrupos() {
  try {
    await db.query('CREATE TABLE IF NOT EXISTS migraciones (nombre TEXT PRIMARY KEY, aplicada TIMESTAMP NOT NULL DEFAULT NOW())');
    const r = await db.query("INSERT INTO migraciones (nombre) VALUES ('amigos_de_grupos') ON CONFLICT DO NOTHING RETURNING nombre");
    if (!r.rows[0]) return; // ya se hizo
    const grupos = await db.query('SELECT id FROM groups');
    for (const g of grupos.rows) await sincronizarAmigosGrupo(g.id);
    console.log(`✅ Amigos completados en ${grupos.rows.length} grupos`);
  } catch (err) {
    console.error('❌ Error completando amigos de los grupos:', err.message);
  }
}

module.exports = {
  buscarAmigoDuplicado, completarAmigo, agregarAmigoSiNoExiste, sincronizarAmigosGrupo, migrarAmigosDeGrupos,
  normEmail, normTel, normNombre,
};
