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

module.exports = { logActivity };
