// src/routes/auth.js — PostgreSQL
const express  = require('express');
const bcrypt   = require('bcryptjs');
const db       = require('../db/database');
const { signToken, requireAuth } = require('../middleware/auth');

const router = express.Router();

// ── POST /auth/register ──────────────────────────────────────────
router.post('/register', async (req, res, next) => {
  try {
    const { nombre = '', apellido = '', email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
    }

    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Ya existe una cuenta con ese email' });
    }

    const hash = bcrypt.hashSync(password, 10);

    const result = await db.query(`
      INSERT INTO users (nombre, apellido, email, password_hash)
      VALUES ($1, $2, $3, $4) RETURNING id, nombre, apellido, email, created_at
    `, [nombre, apellido, email, hash]);

    const user  = result.rows[0];
    const token = signToken(user);
    res.status(201).json({ token, user });
  } catch (err) { next(err); }
});

// ── POST /auth/login ─────────────────────────────────────────────
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
    }

    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    const user   = result.rows[0];

    if (!user) return res.status(401).json({ error: 'Credenciales incorrectas' });

    if (!user.password_hash) {
      if (process.env.NODE_ENV === 'production') {
        return res.status(401).json({ error: 'Credenciales incorrectas' });
      }
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
router.post('/logout', requireAuth, (req, res) => {
  res.status(204).end();
});

module.exports = router;
