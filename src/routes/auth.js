// src/routes/auth.js
// ================================================================
// POST /auth/register   — Registro de nuevo usuario
// POST /auth/login      — Login, devuelve JWT
// POST /auth/logout     — Invalida el token (client-side)
// ================================================================

const express  = require('express');
const bcrypt   = require('bcryptjs');
const db       = require('../db/database');
const { signToken, requireAuth } = require('../middleware/auth');

const router = express.Router();

// ── POST /auth/register ──────────────────────────────────────────
router.post('/register', (req, res, next) => {
  try {
    const { nombre = '', apellido = '', email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
    }

    // Verificar si el email ya existe
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'Ya existe una cuenta con ese email' });
    }

    const hash = bcrypt.hashSync(password, 10);

    // Guardar contraseña en columna separada (no en el schema público)
    // Añadir columna password_hash si no existe
    try {
      db.exec('ALTER TABLE users ADD COLUMN password_hash TEXT');
    } catch (_) { /* ya existe */ }

    const result = db.prepare(`
      INSERT INTO users (nombre, apellido, email, password_hash)
      VALUES (?, ?, ?, ?)
    `).run(nombre, apellido, email, hash);

    const user = db.prepare('SELECT id, nombre, apellido, email, created_at FROM users WHERE id = ?')
      .get(result.lastInsertRowid);

    const token = signToken(user);
    res.status(201).json({ token, user });
  } catch (err) { next(err); }
});

// ── POST /auth/login ─────────────────────────────────────────────
router.post('/login', (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
    }

    // Asegura que la columna existe
    try { db.exec('ALTER TABLE users ADD COLUMN password_hash TEXT'); } catch (_) {}

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (!user) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    // Usuario seed sin contraseña — acceso directo en desarrollo
    if (!user.password_hash) {
      if (process.env.NODE_ENV === 'production') {
        return res.status(401).json({ error: 'Credenciales incorrectas' });
      }
      // En desarrollo, acepta cualquier contraseña para el usuario demo
    } else {
      const valid = bcrypt.compareSync(password, user.password_hash);
      if (!valid) return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const token = signToken(user);
    const { password_hash, ...safeUser } = user;
    res.json({ token, user: safeUser });
  } catch (err) { next(err); }
});

// ── POST /auth/logout ────────────────────────────────────────────
// JWT es stateless — el cliente simplemente descarta el token.
// En Fase 3 se puede añadir una tabla de tokens revocados.
router.post('/logout', requireAuth, (req, res) => {
  res.status(204).end();
});

module.exports = router;
