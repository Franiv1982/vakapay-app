// src/routes/friends.js
// ================================================================
// GET    /friends              — Lista amigos
// POST   /friends              — Añade amigo
// GET    /friends/:id          — Detalle
// PATCH  /friends/:id          — Actualiza
// DELETE /friends/:id          — Elimina
// PUT    /friends/:id/avatar   — Sube foto
// ================================================================

const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const db      = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');

const router = express.Router();

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads/avatars');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `friend_${req.params.id}_${Date.now()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// ── GET /friends ──────────────────────────────────────────────────
router.get('/', requireAuth, (req, res, next) => {
  try {
    const friends = db.prepare(`
      SELECT * FROM friends WHERE owner_id = ? ORDER BY name ASC
    `).all(req.user.id);
    res.json(friends);
  } catch (err) { next(err); }
});

// ── POST /friends ─────────────────────────────────────────────────
router.post('/', requireAuth, (req, res, next) => {
  try {
    const { name, email = '', phone = '', notes = '' } = req.body;
    if (!name) return res.status(400).json({ error: 'name es obligatorio' });

    const result = db.prepare(`
      INSERT INTO friends (owner_id, name, email, phone, notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(req.user.id, name, email, phone, notes);

    const friend = db.prepare('SELECT * FROM friends WHERE id = ?').get(result.lastInsertRowid);
    logActivity(req.user.id, 'friend', `${name} añadido a tus contactos`);
    res.status(201).json(friend);
  } catch (err) { next(err); }
});

// ── GET /friends/:id ──────────────────────────────────────────────
router.get('/:id', requireAuth, (req, res, next) => {
  try {
    const friend = db.prepare('SELECT * FROM friends WHERE id = ? AND owner_id = ?')
      .get(req.params.id, req.user.id);
    if (!friend) return res.status(404).json({ error: 'Amigo no encontrado' });
    res.json(friend);
  } catch (err) { next(err); }
});

// ── PATCH /friends/:id ────────────────────────────────────────────
router.patch('/:id', requireAuth, (req, res, next) => {
  try {
    const friend = db.prepare('SELECT * FROM friends WHERE id = ? AND owner_id = ?')
      .get(req.params.id, req.user.id);
    if (!friend) return res.status(404).json({ error: 'Amigo no encontrado' });

    const { name, email, phone, notes } = req.body;
    const fields = [], values = [];
    if (name  !== undefined) { fields.push('name = ?');  values.push(name); }
    if (email !== undefined) { fields.push('email = ?'); values.push(email); }
    if (phone !== undefined) { fields.push('phone = ?'); values.push(phone); }
    if (notes !== undefined) { fields.push('notes = ?'); values.push(notes); }
    if (!fields.length) return res.status(400).json({ error: 'Nada que actualizar' });

    values.push(req.params.id);
    db.prepare(`UPDATE friends SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    res.json(db.prepare('SELECT * FROM friends WHERE id = ?').get(req.params.id));
  } catch (err) { next(err); }
});

// ── DELETE /friends/:id ───────────────────────────────────────────
router.delete('/:id', requireAuth, (req, res, next) => {
  try {
    const friend = db.prepare('SELECT id FROM friends WHERE id = ? AND owner_id = ?')
      .get(req.params.id, req.user.id);
    if (!friend) return res.status(404).json({ error: 'Amigo no encontrado' });
    db.prepare('DELETE FROM friends WHERE id = ?').run(req.params.id);
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── PUT /friends/:id/avatar ───────────────────────────────────────
router.put('/:id/avatar', requireAuth, upload.single('avatar'), (req, res, next) => {
  try {
    const friend = db.prepare('SELECT id FROM friends WHERE id = ? AND owner_id = ?')
      .get(req.params.id, req.user.id);
    if (!friend) return res.status(404).json({ error: 'Amigo no encontrado' });
    if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });

    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    db.prepare('UPDATE friends SET avatar_url = ? WHERE id = ?').run(avatarUrl, req.params.id);
    res.json({ avatar_url: avatarUrl });
  } catch (err) { next(err); }
});

module.exports = router;
