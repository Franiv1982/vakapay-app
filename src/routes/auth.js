// src/routes/auth.js — PostgreSQL
const express  = require('express');
const bcrypt   = require('bcryptjs');
const { normalizarTelefono } = require('../utils/telefono');
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
    // Teléfono obligatorio, con prefijo y válido para su país
    const telefono = normalizarTelefono(req.body.tel);
    if (!telefono.ok) return res.status(400).json({ error: telefono.error, campo: 'tel' });
    const tel = telefono.valor;

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
const MAX_FALLOS  = 5;   // intentos fallidos seguidos permitidos
const BLOQUEO_MIN = 15;  // minutos de bloqueo después
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
    }

    const result = await db.query(
      `SELECT *, GREATEST(0, CEIL(EXTRACT(EPOCH FROM (login_bloqueado_hasta - NOW())) / 60))::int AS minutos_bloqueo
       FROM users WHERE LOWER(email) = LOWER(TRIM($1))`, [email]);
    const user   = result.rows[0];

    if (!user) return res.status(401).json({ error: 'Credenciales incorrectas' });

    // Límite de intentos: tras MAX_FALLOS contraseñas incorrectas seguidas,
    // la cuenta queda bloqueada BLOQUEO_MIN minutos (evita probar contraseñas sin fin)
    if (user.minutos_bloqueo > 0) {
      return res.status(429).json({
        error: `Demasiados intentos fallidos. Vuelve a intentarlo en ${user.minutos_bloqueo} minuto${user.minutos_bloqueo === 1 ? '' : 's'} o restablece tu contraseña.`,
        minutos: user.minutos_bloqueo,
      });
    }

    let valid = false;
    if (!user.password_hash) {
      valid = process.env.NODE_ENV !== 'production';
    } else {
      valid = bcrypt.compareSync(password, user.password_hash);
    }
    if (!valid) {
      const fallos = (user.login_fallos || 0) + 1;
      if (fallos >= MAX_FALLOS) {
        await db.query(`UPDATE users SET login_fallos = 0, login_bloqueado_hasta = NOW() + INTERVAL '${BLOQUEO_MIN} minutes' WHERE id = $1`, [user.id]);
        return res.status(429).json({
          error: `Demasiados intentos fallidos. Vuelve a intentarlo en ${BLOQUEO_MIN} minutos o restablece tu contraseña.`,
          minutos: BLOQUEO_MIN,
        });
      }
      await db.query('UPDATE users SET login_fallos = $1 WHERE id = $2', [fallos, user.id]);
      return res.status(401).json({ error: 'Credenciales incorrectas', intentos_restantes: MAX_FALLOS - fallos });
    }

    if (user.login_fallos || user.login_bloqueado_hasta) {
      await db.query('UPDATE users SET login_fallos = 0, login_bloqueado_hasta = NULL WHERE id = $1', [user.id]);
    }

    const token = signToken(user);
    // No se devuelven datos internos (contraseña, códigos de recuperación, contadores)
    const { password_hash, reset_otp, reset_otp_expires, reset_attempts, login_fallos, login_bloqueado_hasta, minutos_bloqueo, ...safeUser } = user;
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

// ── POST /auth/forgot-password ──────────────────────────────────
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'El email es obligatorio' });

    // 1. Verificar si el usuario existe
    const result = await db.query('SELECT id, nombre FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No existe una cuenta con ese correo' });
    }

    const user = result.rows[0];
    
    // 2. Generar un código OTP aleatorio de 6 dígitos
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    // 3. Guardar el código en la base de datos con expiración
    await db.query(
      'UPDATE users SET reset_otp = $1, reset_otp_expires = NOW() + INTERVAL \'3 minutes\', reset_attempts = 0 WHERE id = $2',
      [otpCode, user.id]
    );

    // 4. Enviar el correo usando Resend 
    // Resend no lanza error si rechaza el envío: devuelve { error }. Hay que comprobarlo,
    // si no la app diría "código enviado" y el usuario esperaría un correo que no llega.
    let envio;
    try {
      const { Resend } = require('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      envio = await resend.emails.send({
      from: 'VakaPay <onboarding@resend.dev>',
      to: email,
      subject: 'Código de recuperación de contraseña - VakaPay',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#121212;color:#F2F2F2;border-radius:12px;overflow:hidden;">
          <div style="background:#1a1a1a;padding:24px;text-align:center;border-bottom:2px solid #F5C800;">
            <h1 style="color:#F5C800;letter-spacing:3px;margin:0;font-size:2rem;">VAKAPAY</h1>
            <p style="color:#aaa;font-size:.8rem;margin:4px 0 0;">Recuperación de acceso</p>
          </div>
          <div style="padding:32px 24px;text-align:center;">
            <h2 style="color:#F2F2F2;margin-bottom:8px;">Hola, ${user.nombre || 'usuario'}</h2>
            <p style="color:#ccc;line-height:1.6;">Has solicitado restablecer tu contraseña. Utiliza el siguiente código de 6 dígitos:</p>
            <div style="background:#1e1e1e;border:1px solid #F5C800;border-radius:8px;padding:20px;margin:24px 0;">
              <span style="color:#F5C800;font-size:2rem;font-weight:bold;letter-spacing:6px;">${otpCode}</span>
            </div>
            <p style="color:#aaa;font-size:.85rem;">Este código expira en 3 minutos.</p>
          </div>
          <div style="background:#1a1a1a;padding:16px;text-align:center;border-top:1px solid #333;">
            <p style="color:#555;font-size:.75rem;margin:0;">© 2026 VakaPay · Divide gastos, no amistades</p>
          </div>
        </div>
      `
    });
    } catch (e) {
      envio = { error: e };
    }
    if (!envio || envio.error) {
      console.error('No se pudo enviar el correo de recuperación:', envio && envio.error && (envio.error.message || envio.error));
      // El código sigue siendo válido, y durante más tiempo (30 min), para que
      // soporte pueda facilitárselo al usuario y este lo escriba en la app
      await db.query('UPDATE users SET reset_otp_expires = NOW() + INTERVAL \'30 minutes\' WHERE id = $1', [user.id]);
      return res.status(502).json({
        error: 'No hemos podido enviarte el correo con el código. Contacta con soporte para que te lo facilite y pulsa «Tengo un código» para escribirlo.',
        email_no_enviado: true,
      });
    }


    res.json({ ok: true, message: 'Código enviado correctamente' });
  } catch (err) { next(err); }
});

// ── Comprobación del código de recuperación ───────────────────────
// Máximo 5 intentos por código: después hay que pedir uno nuevo.
// Evita que alguien pruebe los 6 dígitos uno a uno hasta acertar.
const MAX_INTENTOS_CODIGO = 5;
async function comprobarCodigo(email, codigo) {
  const r = await db.query(
    'SELECT id, reset_otp, reset_attempts, (reset_otp_expires > NOW()) AS vigente FROM users WHERE email = $1',
    [email]
  );
  const u = r.rows[0];
  if (!u || !u.reset_otp || !u.vigente) {
    return { status: 400, error: 'El código no es válido o ha expirado. Solicita uno nuevo.' };
  }
  if ((u.reset_attempts || 0) >= MAX_INTENTOS_CODIGO) {
    return { status: 429, error: 'Demasiados intentos. Solicita un código nuevo.' };
  }
  if (String(codigo) !== String(u.reset_otp)) {
    await db.query('UPDATE users SET reset_attempts = COALESCE(reset_attempts, 0) + 1 WHERE id = $1', [u.id]);
    return { status: 400, error: 'El código ingresado no es válido o ha expirado' };
  }
  return { user: { id: u.id } };
}

// ── POST /auth/verify-reset-code ─────────────────────────────────
router.post('/verify-reset-code', async (req, res, next) => {
  try {
    const { email, codigo } = req.body;
    if (!email || !codigo) return res.status(400).json({ error: 'Email y código son obligatorios' });

    // Validar el código, su expiración y el número de intentos
    const check = await comprobarCodigo(email, codigo);
    if (check.error) return res.status(check.status).json({ error: check.error });

    res.json({ ok: true, message: 'Código verificado correctamente' });
  } catch (err) { next(err); }
});

// ── POST /auth/reset-password ────────────────────────────────────
router.post('/reset-password', async (req, res, next) => {
  try {
    const { email, codigo, newPassword } = req.body;
    if (!email || !codigo || !newPassword) {
      return res.status(400).json({ error: 'Todos los campos son obligatorios' });
    }

    // 1. Verificar nuevamente que el código sea válido y no haya expirado
    const check = await comprobarCodigo(email, codigo);
    if (check.error) return res.status(check.status).json({ error: check.error });
    const user = check.user;

    // 2. Cifrar la nueva contraseña con bcrypt
    const hash = bcrypt.hashSync(newPassword, 10);

    // 3. Actualizar la contraseña en la base de datos y limpiar los campos de OTP
    await db.query(
      'UPDATE users SET password_hash = $1, reset_otp = NULL, reset_otp_expires = NULL, reset_attempts = 0, login_fallos = 0, login_bloqueado_hasta = NULL WHERE id = $2',
      [hash, user.id]
    );

    res.json({ ok: true, message: 'Contraseña actualizada correctamente' });
  } catch (err) { next(err); }
});

module.exports = router;
