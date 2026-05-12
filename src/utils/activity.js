// src/utils/activity.js
// Utilidad para registrar actividad desde cualquier route
const db = require('../db/database');

function logActivity(userId, type, message) {
  try {
    db.prepare(`
      INSERT INTO activity_log (user_id, type, message)
      VALUES (?, ?, ?)
    `).run(userId, type, message);

    // Mantener máximo 40 entradas por usuario
    db.prepare(`
      DELETE FROM activity_log
      WHERE user_id = ?
        AND id NOT IN (
          SELECT id FROM activity_log
          WHERE user_id = ?
          ORDER BY created_at DESC
          LIMIT 40
        )
    `).run(userId, userId);
  } catch (_) { /* no bloquear si falla el log */ }
}

module.exports = { logActivity };
