// src/routes/users.js
// ================================================================
// GET    /users/me        — Perfil del usuario autenticado
// PATCH  /users/me        — Actualiza perfil
// PUT    /users/me/avatar — Sube foto de perfil
// ================================================================

const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const db       = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Almacenamiento de avatares
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
router.get('/me', requireAuth, (req, res, next) => {
  try {
    const user = db.prepare(`
      SELECT id, nombre, apellido, email, tel, bio, avatar_url, created_at, updated_at
      FROM users WHERE id = ?
    `).get(req.user.id);

    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(user);
  } catch (err) { next(err); }
});

// ── PATCH /users/me ──────────────────────────────────────────────
router.patch('/me', requireAuth, (req, res, next) => {
  try {
    const { nombre, apellido, email, tel, bio } = req.body;
    const fields = [];
    const values = [];

    if (nombre   !== undefined) { fields.push('nombre = ?');   values.push(nombre); }
    if (apellido !== undefined) { fields.push('apellido = ?'); values.push(apellido); }
    if (email    !== undefined) { fields.push('email = ?');    values.push(email); }
    if (tel      !== undefined) { fields.push('tel = ?');      values.push(tel); }
    if (bio      !== undefined) { fields.push('bio = ?');      values.push(bio); }

    if (!fields.length) return res.status(400).json({ error: 'Nada que actualizar' });

    fields.push('updated_at = datetime(\'now\')');
    values.push(req.user.id);

    db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare(`
      SELECT id, nombre, apellido, email, tel, bio, avatar_url, created_at, updated_at
      FROM users WHERE id = ?
    `).get(req.user.id);

    res.json(updated);
  } catch (err) { next(err); }
});

// ── PUT /users/me/avatar ─────────────────────────────────────────
router.put('/me/avatar', requireAuth, upload.single('avatar'), (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });

    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    db.prepare(`UPDATE users SET avatar_url = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(avatarUrl, req.user.id);

    res.json({ avatar_url: avatarUrl });
  } catch (err) { next(err); }
});

module.exports = router;
