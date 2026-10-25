// src/routes/users.js — PostgreSQL
const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const db       = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Almacenamiento de avatares
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads/avatars');
let storage;

if (process.env.NODE_ENV === 'production') {
  // En Vercel (Producción), guardamos temporalmente el archivo en memoria
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
      cb(null, `user_${req.user.id}${ext}`);
    },
  });
}

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
// Se guarda la imagen como base64 dentro de la columna
    const buffer = req.file.buffer || fs.readFileSync(req.file.path);
    const avatarUrl = `data:${req.file.mimetype || 'image/jpeg'};base64,${buffer.toString('base64')}`;
    await db.query('UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2', [avatarUrl, req.user.id]);
    res.json({ avatar_url: avatarUrl });
  } catch (err) { next(err); }
});

// ── Borrar datos / eliminar cuenta ───────────────────────────────
// Reglas en src/utils/borrado.js. Si hay saldos pendientes en grupos
// compartidos se responde 409 con la lista y no se borra nada.
const { previsualizar, borrarDatosUsuario } = require('../utils/borrado');
const MSG_PENDIENTES = 'Tienes cuentas pendientes en grupos compartidos. Sáldalas antes de continuar.';

// GET /users/me/borrado — qué pasaría al borrar (vista previa)
router.get('/me/borrado', requireAuth, async (req, res, next) => {
  try { res.json(await previsualizar(req.user.id)); } catch (err) { next(err); }
});

// DELETE /users/me/datos — borra grupos propios, sale de los compartidos, amigos y actividad
router.delete('/me/datos', requireAuth, async (req, res, next) => {
  try {
    const r = await borrarDatosUsuario(req.user.id);
    if (r.pendientes) return res.status(409).json({ error: MSG_PENDIENTES, pendientes: r.pendientes });
    res.json(r);
  } catch (err) { next(err); }
});

// DELETE /users/me — lo mismo que /me/datos y además elimina la cuenta
router.delete('/me', requireAuth, async (req, res, next) => {
  try {
    const r = await borrarDatosUsuario(req.user.id, { eliminarCuenta: true });
    if (r.pendientes) return res.status(409).json({ error: MSG_PENDIENTES, pendientes: r.pendientes });
    res.json(r);
  } catch (err) { next(err); }
});

module.exports = router;
