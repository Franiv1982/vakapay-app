// src/routes/activity.js — PostgreSQL
const express = require('express');
const db      = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const result = await db.query(`
      SELECT id, type, message, group_name, created_at
      FROM activity_log
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 40
    `, [req.user.id]);
    res.json(result.rows);
  } catch (err) { next(err); }
});
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { message, type = 'other', group_name = null } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });
    const result = await db.query(
      `INSERT INTO activity_log (user_id, message, type, group_name, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id, type, message, group_name, created_at`,
      [req.user.id, message, type, group_name]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});
router.delete('/', requireAuth, async (req, res, next) => {
  try {
    await db.query('DELETE FROM activity_log WHERE user_id = $1', [req.user.id]);
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
