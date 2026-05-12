// src/routes/users.js — PostgreSQL
const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const db       = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads/avatars');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `user_${req.user.id}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// ── GET /users/me ────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const result = await db.query(`
      SELECT id, nombre, apellido, email, tel, bio, avatar_url, created_at, updated_at
      FROM users WHERE id = $1
    `, [req.user.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

// ── PATCH /users/me ──────────────────────────────────────────────
router.patch('/me', requireAuth, async (req, res, next) => {
  try {
    const { nombre, apellido, email, tel, bio } = req.body;
    const fields = [], values = [];
    let i = 1;
    if (nombre   !== undefined) { fields.push(`nombre = $${i++}`);   values.push(nombre); }
    if (apellido !== undefined) { fields.push(`apellido = $${i++}`); values.push(apellido); }
    if (email    !== undefined) { fields.push(`email = $${i++}`);    values.push(email); }
    if (tel      !== undefined) { fields.push(`tel = $${i++}`);      values.push(tel); }
    if (bio      !== undefined) { fields.push(`bio = $${i++}`);      values.push(bio); }
    if (!fields.length) return res.status(400).json({ error: 'Nada que actualizar' });

    fields.push(`updated_at = NOW()`);
    values.push(req.user.id);

    const result = await db.query(`
      UPDATE users SET ${fields.join(', ')} WHERE id = $${i} RETURNING id, nombre, apellido, email, tel, bio, avatar_url, created_at, updated_at
    `, values);
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

// ── PUT /users/me/avatar ─────────────────────────────────────────
router.put('/me/avatar', requireAuth, upload.single('avatar'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    await db.query('UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2', [avatarUrl, req.user.id]);
    res.json({ avatar_url: avatarUrl });
  } catch (err) { next(err); }
});

module.exports = router;
