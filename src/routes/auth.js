// src/routes/auth.js — PostgreSQL
const express  = require('express');
const bcrypt   = require('bcryptjs');
const db       = require('../db/database');
const { signToken, requireAuth } = require('../middleware/auth');

const router = express.Router();

// ── POST /auth/register ──────────────────────────────────────────
router.post('/register', async (req, res, next) => {
  try {
    const { nombre = '', apellido = '', email, password, tel = '' } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
    }

    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Ya existe una cuenta con ese email' });
    }

    const hash = bcrypt.hashSync(password, 10);

    const result = await db.query(`
      INSERT INTO users (nombre, apellido, email, password_hash, tel)
      VALUES ($1, $2, $3, $4, $5) RETURNING id, nombre, apellido, email, tel, created_at
    `, [nombre, apellido, email, hash, tel]);

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

// ── POST /auth/send-confirmation ────────────────────────────────
router.post('/send-confirmation', async (req, res, next) => {
  try {
    const { email, nombre } = req.body;
    if (!email || !nombre) return res.status(400).json({ error: 'Email y nombre son obligatorios' });

    const { Resend } = require('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);

    await resend.emails.send({
      from: 'VakaPay <onboarding@resend.dev>',
      to: email,
      subject: '¡Bienvenido a VakaPay!',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#121212;color:#F2F2F2;border-radius:12px;overflow:hidden;">
          <div style="background:#1a1a1a;padding:24px;text-align:center;border-bottom:2px solid #F5C800;">
            <h1 style="color:#F5C800;letter-spacing:3px;margin:0;font-size:2rem;">VAKAPAY</h1>
            <p style="color:#aaa;font-size:.8rem;margin:4px 0 0;">Divide gastos, no amistades</p>
          </div>
          <div style="padding:32px 24px;">
            <h2 style="color:#F2F2F2;margin-bottom:8px;">¡Hola, ${nombre}! 👋</h2>
            <p style="color:#ccc;line-height:1.6;">Tu cuenta en VakaPay ha sido creada correctamente. Ya puedes empezar a crear grupos, registrar gastos y dividir cuentas con tus amigos.</p>
            <div style="background:#1e1e1e;border:1px solid #333;border-radius:8px;padding:16px;margin:24px 0;text-align:center;">
              <p style="color:#aaa;font-size:.85rem;margin:0 0 4px;">Registrado con</p>
              <p style="color:#F5C800;font-weight:bold;margin:0;">${email}</p>
            </div>
            <p style="color:#ccc;line-height:1.6;">Si no has creado esta cuenta, puedes ignorar este mensaje.</p>
          </div>
          <div style="background:#1a1a1a;padding:16px;text-align:center;border-top:1px solid #333;">
            <p style="color:#555;font-size:.75rem;margin:0;">© 2026 VakaPay · Divide gastos, no amistades</p>
          </div>
        </div>
      `
    });

    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
