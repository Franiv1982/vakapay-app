// src/utils/nombres.js — Nombres de los participantes en los grupos
// ================================================================
// Regla (como Splitwise y similares):
//   · Participante SIN cuenta: su nombre lo pone y lo cambia quien creó el grupo.
//   · Participante CON cuenta: aparece con el primer nombre de su cuenta
//     y solo cambia si él cambia su nombre en Cuenta. Nadie más puede renombrarlo.
//   · Si dos personas del grupo se llamarían igual, a la segunda se le añade la
//     inicial del apellido («Pepe G.») o, si aun así coincide, un número («Pepe 2»).
// Los gastos, repartos, pagos y mensajes guardan el nombre, así que al renombrar
// se cambia en todos a la vez.
// ================================================================
const db = require('../db/database');

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

// Nombre libre en el grupo a partir del deseado (ignorando al propio participante)
async function nombreLibre(groupId, deseado, { apellido = '', salvoId = null } = {}) {
  const r = await db.query('SELECT id, display_name FROM group_members WHERE group_id = $1', [groupId]);
  const usados = new Set(r.rows.filter(m => m.id !== salvoId).map(m => norm(m.display_name)));
  const base = String(deseado || '').trim().slice(0, 30) || 'Participante';
  if (!usados.has(norm(base))) return base;
  const inicial = String(apellido || '').trim()[0];
  if (inicial) {
    const conInicial = `${base} ${inicial.toUpperCase()}.`;
    if (!usados.has(norm(conInicial))) return conInicial;
  }
  for (let n = 2; ; n++) { const c = `${base} ${n}`; if (!usados.has(norm(c))) return c; }
}

// Cambia el nombre de un participante en todo el grupo
async function renombrarParticipante(groupId, viejo, nuevo) {
  if (viejo === nuevo) return;
  const enGrupo = 'expense_id IN (SELECT id FROM expenses WHERE group_id = $3)';
  await db.query('UPDATE group_members SET display_name = $1 WHERE group_id = $3 AND display_name = $2', [nuevo, viejo, groupId]);
  await db.query('UPDATE expenses SET payer_name = $1 WHERE group_id = $3 AND payer_name = $2', [nuevo, viejo, groupId]);
  await db.query(`UPDATE expense_splits SET member_name = $1 WHERE member_name = $2 AND ${enGrupo}`, [nuevo, viejo, groupId]);
  await db.query('UPDATE mensajes SET autor = $1 WHERE group_id = $3 AND autor = $2', [nuevo, viejo, groupId]);
}

// Pone a un participante con cuenta el nombre de su cuenta. Devuelve { viejo, nuevo } o null si no cambió.
async function ponerNombreDeCuenta(groupId, userId) {
  const m = (await db.query('SELECT id, display_name FROM group_members WHERE group_id = $1 AND user_id = $2', [groupId, userId])).rows[0];
  if (!m) return null;
  const u = (await db.query('SELECT nombre, apellido, email FROM users WHERE id = $1', [userId])).rows[0];
  if (!u) return null;
  // En los grupos se usa el primer nombre («Hector»); si coincide con otro del grupo,
  // se añade la inicial del apellido («Hector R.»). En el registro se escribe el
  // nombre completo en un solo campo, así que el apellido es su última palabra.
  const palabras = String(u.nombre || '').trim().split(/\s+/).filter(Boolean);
  const deseado = palabras[0] || String(u.email || '').split('@')[0];
  const apellido = String(u.apellido || '').trim() || (palabras.length > 1 ? palabras[palabras.length - 1] : '');
  // Si ya se llama así (o así con su inicial / número), no se toca
  const actual = m.display_name;
  const variante = norm(actual).slice(norm(deseado).length);   // '' · ' g.' · ' 2'
  if (norm(actual).startsWith(norm(deseado)) && /^( [a-z]\.| \d+)?$/.test(variante)) {
    const libre = await nombreLibre(groupId, actual, { salvoId: m.id });
    if (libre === actual) return null;
  }
  const nuevo = await nombreLibre(groupId, deseado, { apellido, salvoId: m.id });
  if (nuevo === actual) return null;
  await renombrarParticipante(groupId, actual, nuevo);
  return { viejo: actual, nuevo };
}

// En todos los grupos del usuario (tras cambiar su nombre en Cuenta)
async function ponerNombreDeCuentaEnTodos(userId) {
  const r = await db.query('SELECT DISTINCT group_id FROM group_members WHERE user_id = $1', [userId]);
  const cambios = [];
  for (const { group_id } of r.rows) {
    const c = await ponerNombreDeCuenta(group_id, userId);
    if (c) cambios.push({ group_id, ...c });
  }
  return cambios;
}

module.exports = { nombreLibre, renombrarParticipante, ponerNombreDeCuenta, ponerNombreDeCuentaEnTodos, norm };

// Una sola vez: los participantes con cuenta pasan a llamarse como su cuenta
async function migrarNombresDeCuenta() {
  try {
    const r = await db.query("INSERT INTO migraciones (nombre) VALUES ('nombres_de_cuenta_v1') ON CONFLICT DO NOTHING RETURNING nombre");
    if (!r.rows[0]) return;   // ya se hizo
    const m = await db.query('SELECT DISTINCT group_id, user_id FROM group_members WHERE user_id IS NOT NULL');
    let n = 0;
    for (const { group_id, user_id } of m.rows) if (await ponerNombreDeCuenta(group_id, user_id)) n++;
    if (n) console.log(`✅ Nombres de cuenta: ${n} participantes renombrados`);
  } catch (err) {
    console.error('❌ Migración de nombres de cuenta:', err.message);
  }
}
module.exports.migrarNombresDeCuenta = migrarNombresDeCuenta;
