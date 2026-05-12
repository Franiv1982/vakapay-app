// src/routes/activity.js
// ================================================================
// GET    /activity   — Historial (últimas 40 entradas)
// DELETE /activity   — Limpia historial
// ================================================================

const express = require('express');
const db      = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, (req, res, next) => {
  try {
    const entries = db.prepare(`
      SELECT id, type, message, created_at
      FROM activity_log
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 40
    `).all(req.user.id);
    res.json(entries);
  } catch (err) { next(err); }
});

router.delete('/', requireAuth, (req, res, next) => {
  try {
    db.prepare('DELETE FROM activity_log WHERE user_id = ?').run(req.user.id);
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
