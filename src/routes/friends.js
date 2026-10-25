// src/routes/friends.js — PostgreSQL
const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const db      = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { buscarAmigoDuplicado, completarAmigo } = require('../utils/contactos');

const router = express.Router();

// Almacenamiento de avatares/imágenes en amigos
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads/avatars');
let storage;

if (process.env.NODE_ENV === 'production') {
  // En Vercel (Producción), guardamos temporalmente en memoria
  storage = multer.memoryStorage();
} else {
  // En local (Desarrollo), seguimos creando la carpeta y guardando en disco
  try {
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
  } catch (error) {
    console.log("Ignorando la creación del directorio local de subidas.");
  }

  storage = multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `friend_${req.params.id}_${Date.now()}${ext}`);
    },
  });
}

const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// ── GET /friends ──────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const result = await db.query('SELECT * FROM friends WHERE owner_id = $1 ORDER BY name ASC', [req.user.id]);
    res.json(result.rows);
  } catch (err) { next(err); }
});

// ── POST /friends ─────────────────────────────────────────────────
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { name, email = '', phone = '', notes = '' } = req.body;
    if (!name) return res.status(400).json({ error: 'name es obligatorio' });

    // Evita duplicados: mismo email, teléfono o nombre que un amigo ya guardado
    const dup = await buscarAmigoDuplicado(req.user.id, { name, email, phone });
    if (dup) {
      await completarAmigo(dup.amigo, { email, phone }); // aprovecha los datos nuevos que falten
      return res.status(409).json({
        error: `Ya tienes a "${dup.amigo.name}" en tus amigos (mismo ${dup.motivo})`,
        friend: dup.amigo, motivo: dup.motivo,
      });
    }

    const result = await db.query(`
      INSERT INTO friends (owner_id, name, email, phone, notes)
      VALUES ($1, $2, $3, $4, $5) RETURNING *
    `, [req.user.id, name, email, phone, notes]);

    logActivity(req.user.id, 'friend', `${name} añadido a tus contactos`);
    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

// ── GET /friends/:id ──────────────────────────────────────────────
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await db.query('SELECT * FROM friends WHERE id = $1 AND owner_id = $2', [req.params.id, req.user.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Amigo no encontrado' });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

// ── PATCH /friends/:id ────────────────────────────────────────────
router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const existing = await db.query('SELECT * FROM friends WHERE id = $1 AND owner_id = $2', [req.params.id, req.user.id]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'Amigo no encontrado' });

    const { name, email, phone, notes, avatar_url } = req.body;
    const actual = existing.rows[0];
    const dup = await buscarAmigoDuplicado(req.user.id, {
      name:  name  !== undefined ? name  : actual.name,
      email: email !== undefined ? email : actual.email,
      phone: phone !== undefined ? phone : actual.phone,
    }, actual.id);
    if (dup) {
      return res.status(409).json({ error: `Ya tienes a "${dup.amigo.name}" en tus amigos (mismo ${dup.motivo})`, motivo: dup.motivo });
    }
    // La foto llega como imagen en texto (data:image/...); se guarda en la propia columna
    if (avatar_url !== undefined && avatar_url !== null) {
      if (typeof avatar_url !== 'string' || !avatar_url.startsWith('data:image/') || avatar_url.length > 500000) {
        return res.status(400).json({ error: 'Imagen no válida o demasiado grande' });
      }
    }
    const fields = [], values = [];
    let i = 1;
    if (avatar_url !== undefined) { fields.push(`avatar_url = $${i++}`); values.push(avatar_url); }
    if (name  !== undefined) { fields.push(`name = $${i++}`);  values.push(name); }
    if (email !== undefined) { fields.push(`email = $${i++}`); values.push(email); }
    if (phone !== undefined) { fields.push(`phone = $${i++}`); values.push(phone); }
    if (notes !== undefined) { fields.push(`notes = $${i++}`); values.push(notes); }
    if (!fields.length) return res.status(400).json({ error: 'Nada que actualizar' });

    values.push(req.params.id);
    const result = await db.query(`UPDATE friends SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`, values);
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

// ── DELETE /friends/:id ───────────────────────────────────────────
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const existing = await db.query('SELECT id FROM friends WHERE id = $1 AND owner_id = $2', [req.params.id, req.user.id]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'Amigo no encontrado' });
    await db.query('DELETE FROM friends WHERE id = $1', [req.params.id]);
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── PUT /friends/:id/avatar ───────────────────────────────────────
router.put('/:id/avatar', requireAuth, upload.single('avatar'), async (req, res, next) => {
  try {
    const existing = await db.query('SELECT id FROM friends WHERE id = $1 AND owner_id = $2', [req.params.id, req.user.id]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'Amigo no encontrado' });
    if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });

    // En Vercel no hay disco persistente: guardamos la imagen como base64 dentro de la columna
    const buffer = req.file.buffer || fs.readFileSync(req.file.path);
    const avatarUrl = `data:${req.file.mimetype || 'image/jpeg'};base64,${buffer.toString('base64')}`;
    await db.query('UPDATE friends SET avatar_url = $1 WHERE id = $2', [avatarUrl, req.params.id]);
    res.json({ avatar_url: avatarUrl });
  } catch (err) { next(err); }
});

module.exports = router;
