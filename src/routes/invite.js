 // src/routes/invite.js
const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');

const router = express.Router();

router.post('/:token/join', requireAuth, async (req, res, next) => {
  try {
    const row = await db.query('SELECT group_id FROM share_tokens WHERE token = $1', [req.params.token]);
    if (!row.rows[0]) return res.status(404).json({ error: 'Enlace no válido o expirado' });

    const groupId = row.rows[0].group_id;
    const gRes = await db.query('SELECT * FROM groups WHERE id = $1', [groupId]);
    if (!gRes.rows[0]) return res.status(404).json({ error: 'Grupo no encontrado' });

    const displayName = req.body.display_name || req.user.nombre || req.user.email.split('@')[0];

    const existing = await db.query(
      'SELECT id FROM group_members WHERE group_id = $1 AND display_name = $2',
      [groupId, displayName]
    );
    if (existing.rows.length > 0) {
      return res.json({ already_member: true, group: gRes.rows[0] });
    }

    await db.query(`
      INSERT INTO group_members (group_id, user_id, display_name)
      VALUES ($1, $2, $3)
    `, [groupId, req.user.id, displayName]);

    logActivity(req.user.id, 'member', `Te uniste al grupo "${gRes.rows[0].name}"`);
    res.status(201).json({ joined: true, group: gRes.rows[0], display_name: displayName });
  } catch (err) { next(err); }
});

module.exports = router;
