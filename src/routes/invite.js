 // src/routes/invite.js
const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');

const router = express.Router();

async function addFriendIfNotExists(ownerId, name, email, phone) {
  const existing = await db.query(
    'SELECT id FROM friends WHERE owner_id = $1 AND name = $2',
    [ownerId, name]
  );
  if (existing.rows.length === 0) {
    await db.query(
      'INSERT INTO friends (owner_id, name, email, phone) VALUES ($1, $2, $3, $4)',
      [ownerId, name, email || '', phone || '']
    );
  }
}

router.post('/:token/join', requireAuth, async (req, res, next) => {
  try {
    const row = await db.query('SELECT group_id FROM share_tokens WHERE token = $1', [req.params.token]);
    if (!row.rows[0]) return res.status(404).json({ error: 'Enlace no válido o expirado' });

    const groupId = row.rows[0].group_id;
    const gRes = await db.query('SELECT * FROM groups WHERE id = $1', [groupId]);
    if (!gRes.rows[0]) return res.status(404).json({ error: 'Grupo no encontrado' });

    // Datos del nuevo miembro
    const newUserRes = await db.query('SELECT id, nombre, email, tel FROM users WHERE id = $1', [req.user.id]);
    const newUser = newUserRes.rows[0];
    const displayName = req.body.display_name || newUser?.nombre || req.user.email.split('@')[0];

    // Verificar si ya es miembro
    const existing = await db.query(
      'SELECT id FROM group_members WHERE group_id = $1 AND display_name = $2',
      [groupId, displayName]
    );
    if (existing.rows.length > 0) {
      return res.json({ already_member: true, group: gRes.rows[0] });
    }

    // Añadir al grupo
    await db.query(`
      INSERT INTO group_members (group_id, user_id, display_name)
      VALUES ($1, $2, $3)
    `, [groupId, req.user.id, displayName]);

    // Obtener todos los miembros existentes del grupo con sus datos de usuario
    const membersRes = await db.query(`
      SELECT gm.display_name, gm.user_id, u.email, u.tel
      FROM group_members gm
      LEFT JOIN users u ON u.id = gm.user_id
      WHERE gm.group_id = $1 AND gm.user_id != $2
    `, [groupId, req.user.id]);

    // Añadir mutuamente como amigos
    for (const member of membersRes.rows) {
      if (!member.user_id) continue;
      // El nuevo miembro añade a cada miembro existente
      await addFriendIfNotExists(req.user.id, member.display_name, member.email, member.tel);
      // Cada miembro existente añade al nuevo
      await addFriendIfNotExists(member.user_id, displayName, newUser?.email, newUser?.tel);
    }

    logActivity(req.user.id, 'member', `Te uniste al grupo "${gRes.rows[0].name}"`);
    res.status(201).json({ joined: true, group: gRes.rows[0], display_name: displayName });
  } catch (err) { next(err); }
});

module.exports = router;
