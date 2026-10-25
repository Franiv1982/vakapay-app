// src/utils/activity.js — PostgreSQL
const db = require('../db/database');

async function logActivity(userId, type, message) {
  try {
    await db.query(
      'INSERT INTO activity_log (user_id, type, message) VALUES ($1, $2, $3)',
      [userId, type, message]
    );
  } catch (err) {
    console.error('Error logging activity:', err.message);
  }
}

// Nombre visible de quien hace el cambio (nombre del perfil o, si no, su nombre en el grupo)
async function actorName(groupId, userId) {
  try {
    const u = await db.query('SELECT nombre FROM users WHERE id = $1', [userId]);
    if (u.rows[0] && u.rows[0].nombre) return u.rows[0].nombre;
    const m = await db.query(
      'SELECT display_name FROM group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, userId]
    );
    if (m.rows[0]) return m.rows[0].display_name;
  } catch (_) {}
  return 'Alguien';
}

// Registra la misma entrada de actividad para TODOS los usuarios del grupo
// (propietario + participantes con cuenta), para que todos vean los cambios.
// `buildMessage` recibe (nombreDeQuienLoHizo, nombreDelGrupo) y devuelve el texto.
async function logGroupActivity(groupId, actorId, type, buildMessage) {
  try {
    const gRes = await db.query('SELECT name, owner_id FROM groups WHERE id = $1', [groupId]);
    const group = gRes.rows[0];
    if (!group) return;

    const mRes = await db.query(
      'SELECT DISTINCT user_id FROM group_members WHERE group_id = $1 AND user_id IS NOT NULL',
      [groupId]
    );
    const userIds = new Set(mRes.rows.map(r => r.user_id));
    if (group.owner_id) userIds.add(group.owner_id);
    userIds.add(actorId);

    const message = buildMessage(await actorName(groupId, actorId), group.name);
    for (const uid of userIds) {
      await db.query(
        'INSERT INTO activity_log (user_id, type, message, group_name) VALUES ($1, $2, $3, $4)',
        [uid, type, message, group.name]
      );
    }
    await mensajeSistema(groupId, `${type === 'payment' ? '💸' : '🧾'} ${message.replace(` en "${group.name}"`, '')}`);
  } catch (err) {
    console.error('Error logging group activity:', err.message);
  }
}

// Mensaje automático en el chat del grupo (gastos, pagos, altas y bajas)
async function mensajeSistema(groupId, texto, cliente = db) {
  try {
    await cliente.query("INSERT INTO mensajes (group_id, texto, tipo) VALUES ($1, $2, 'sistema')", [groupId, texto]);
  } catch (err) {
    console.error('Error en mensaje de sistema del chat:', err.message);
  }
}

module.exports = { logActivity, logGroupActivity, mensajeSistema };
