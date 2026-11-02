// src/routes/auth.js — PostgreSQL
const express  = require('express');
const bcrypt   = require('bcryptjs');
const { normalizarTelefono } = require('../utils/telefono');
const db       = require('../db/database');
const crypto   = require('crypto');
const { signToken, requireAuth, textoBloqueo, olvidarEstado } = require('../middleware/auth');

const router = express.Router();

// Emails siempre en minúsculas y sin espacios: "Ana@X.com " y "ana@x.com" son la misma cuenta
const normEmail = e => String(e || '').trim().toLowerCase();
const emailValido = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;
// Mismo mínimo que pide la app al registrarse o cambiar la contraseña
const MIN_PASSWORD = 8;
const passwordValida = p => typeof p === 'string' && p.length >= MIN_PASSWORD && p.length <= 200;
const ERROR_PASSWORD = `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`;
const escHtml = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── POST /auth/register ──────────────────────────────────────────
router.post('/register', async (req, res, next) => {
  try {
    const { nombre = '', apellido = '', password } = req.body;
    const email = normEmail(req.body.email);
    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
    }
    if (!emailValido(email)) return res.status(400).json({ error: 'El email no es válido' });
    if (!passwordValida(password)) return res.status(400).json({ error: ERROR_PASSWORD });
    // Teléfono obligatorio, con prefijo y válido para su país
    const telefono = normalizarTelefono(req.body.tel);
    if (!telefono.ok) return res.status(400).json({ error: telefono.error, campo: 'tel' });
    const tel = telefono.valor;

    const existing = await db.query('SELECT id FROM users WHERE LOWER(TRIM(email)) = $1', [email]);
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
// Límite de intentos en dos niveles:
//  · Por dispositivo/conexión (IP): 5 fallos seguidos → esa conexión espera 15 min.
//    Así un desconocido que prueba tu email solo se bloquea a sí mismo, no a ti.
//  · Por cuenta: 30 fallos seguidos desde cualquier sitio → la cuenta espera 15 min.
//    Frena a quien pruebe contraseñas desde muchas conexiones distintas.
const MAX_FALLOS        = 5;
const MAX_FALLOS_CUENTA = 30;
const BLOQUEO_MIN       = 15;
// IP del cliente. En Vercel la pone la propia plataforma (no se puede falsificar)
function ipCliente(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return String(req.headers['x-real-ip'] || xff || req.socket?.remoteAddress || 'desconocida').slice(0, 64);
}
const textoEspera = m => `Demasiados intentos fallidos. Vuelve a intentarlo en ${m} minuto${m === 1 ? '' : 's'} o restablece tu contraseña.`;

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
    }
    const correo = normEmail(email);
    const ip = ipCliente(req);

    // ¿Esta conexión está esperando por fallos anteriores con este email?
    const intento = (await db.query(
      `SELECT fallos, GREATEST(0, CEIL(EXTRACT(EPOCH FROM (bloqueado_hasta - NOW())) / 60))::int AS minutos
       FROM login_intentos WHERE email = $1 AND ip = $2`, [correo, ip])).rows[0];
    if (intento && intento.minutos > 0) {
      return res.status(429).json({ error: textoEspera(intento.minutos), minutos: intento.minutos });
    }

    const result = await db.query(
      `SELECT *, GREATEST(0, CEIL(EXTRACT(EPOCH FROM (login_bloqueado_hasta - NOW())) / 60))::int AS minutos_bloqueo
       FROM users WHERE LOWER(TRIM(email)) = $1 ORDER BY id LIMIT 1`, [correo]);
    const user   = result.rows[0];

    // Bloqueo de toda la cuenta (muchos fallos desde sitios distintos, o puesto a mano en Supabase)
    if (user && user.minutos_bloqueo > 0) {
      return res.status(429).json({ error: textoEspera(user.minutos_bloqueo), minutos: user.minutos_bloqueo });
    }

    // Una cuenta sin contraseña guardada no puede entrar con ninguna
    const valid = !!user && !!user.password_hash && bcrypt.compareSync(String(password), user.password_hash);
    if (!valid) {
      // Fallo de esta conexión (también si el email no existe: así no se distingue)
      const r = await db.query(`
        INSERT INTO login_intentos (email, ip, fallos, actualizado) VALUES ($1, $2, 1, NOW())
        ON CONFLICT (email, ip) DO UPDATE SET
          fallos = CASE WHEN login_intentos.bloqueado_hasta IS NOT NULL OR login_intentos.actualizado < NOW() - INTERVAL '1 day'
                        THEN 1 ELSE login_intentos.fallos + 1 END,
          bloqueado_hasta = NULL, actualizado = NOW()
        RETURNING fallos`, [correo, ip]);
      const fallos = r.rows[0].fallos;
      if (user) {
        const totales = (user.login_fallos || 0) + 1;
        if (totales >= MAX_FALLOS_CUENTA) {
          await db.query(`UPDATE users SET login_fallos = 0, login_bloqueado_hasta = NOW() + INTERVAL '${BLOQUEO_MIN} minutes' WHERE id = $1`, [user.id]);
          return res.status(429).json({ error: textoEspera(BLOQUEO_MIN), minutos: BLOQUEO_MIN });
        }
        await db.query('UPDATE users SET login_fallos = $1 WHERE id = $2', [totales, user.id]);
      }
      if (fallos >= MAX_FALLOS) {
        await db.query(`UPDATE login_intentos SET bloqueado_hasta = NOW() + INTERVAL '${BLOQUEO_MIN} minutes' WHERE email = $1 AND ip = $2`, [correo, ip]);
        return res.status(429).json({ error: textoEspera(BLOQUEO_MIN), minutos: BLOQUEO_MIN });
      }
      return res.status(401).json({ error: 'Credenciales incorrectas', intentos_restantes: MAX_FALLOS - fallos });
    }

    // Contraseña correcta: se olvidan los fallos de esta conexión y los de la cuenta
    if (intento) await db.query('DELETE FROM login_intentos WHERE email = $1 AND ip = $2', [correo, ip]);
    if (user.login_fallos || user.login_bloqueado_hasta) {
      await db.query('UPDATE users SET login_fallos = 0, login_bloqueado_hasta = NULL WHERE id = $1', [user.id]);
    }
    if (user.bloqueado) {
      return res.status(403).json({ error: textoBloqueo(user.bloqueo_motivo), cuenta_bloqueada: true });
    }

    const token = signToken(user);
    // No se devuelven datos internos (contraseña, códigos de recuperación, contadores)
    const { password_hash, reset_otp, reset_otp_expires, reset_attempts, login_fallos, login_bloqueado_hasta, minutos_bloqueo, bloqueado, bloqueo_motivo,
            sesiones_desde, reset_pedidos, reset_pedidos_desde, ocr_usos, ocr_dia, ...safeUser } = user;
    res.json({ token, user: safeUser });
  } catch (err) { next(err); }
});

// ── POST /auth/logout ────────────────────────────────────────────
router.post('/logout', requireAuth, (req, res) => {
  res.status(204).end();
});

// ── POST /auth/send-confirmation ────────────────────────────────
// Solo con sesión iniciada y siempre al email de la propia cuenta: así nadie
// puede usar VakaPay para enviar correos a quien quiera.
router.post('/send-confirmation', requireAuth, async (req, res, next) => {
  try {
    const u = (await db.query('SELECT email, nombre FROM users WHERE id = $1', [req.user.id])).rows[0];
    if (!u || !u.email) return res.status(404).json({ error: 'Usuario no encontrado' });
    const email = u.email, nombre = escHtml(u.nombre || 'usuario');

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
              <p style="color:#F5C800;font-weight:bold;margin:0;">${escHtml(email)}</p>
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
    const email = normEmail(req.body.email);
    if (!email) return res.status(400).json({ error: 'El email es obligatorio' });

    // 1. Verificar si el usuario existe
    const result = await db.query(
      `SELECT id, nombre, email, reset_pedidos,
              (reset_pedidos_desde IS NULL OR reset_pedidos_desde < NOW() - INTERVAL '1 hour') AS ventana_nueva
       FROM users WHERE LOWER(TRIM(email)) = $1 ORDER BY id LIMIT 1`, [email]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No existe una cuenta con ese correo' });
    }

    const user = result.rows[0];

    // Máximo de códigos por hora. Sin este límite, alguien podría pedir códigos
    // sin parar (cada uno con 5 intentos) hasta adivinar uno, y llenar de
    // correos el buzón de la víctima.
    const MAX_CODIGOS_HORA = 5;
    if (!user.ventana_nueva && (user.reset_pedidos || 0) >= MAX_CODIGOS_HORA) {
      return res.status(429).json({ error: 'Has pedido demasiados códigos. Espera una hora o usa el último que recibiste.' });
    }

    // 2. Generar un código aleatorio de 6 dígitos (generador seguro)
    const otpCode = String(crypto.randomInt(100000, 1000000));

    // 3. Guardar el código en la base de datos con expiración
    await db.query(
      `UPDATE users SET reset_otp = $1, reset_otp_expires = NOW() + INTERVAL '3 minutes', reset_attempts = 0,
              reset_pedidos = CASE WHEN $3 THEN 1 ELSE reset_pedidos + 1 END,
              reset_pedidos_desde = CASE WHEN $3 THEN NOW() ELSE reset_pedidos_desde END
       WHERE id = $2`,
      [otpCode, user.id, user.ventana_nueva]
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
      to: user.email,
      subject: 'Código de recuperación de contraseña - VakaPay',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#121212;color:#F2F2F2;border-radius:12px;overflow:hidden;">
          <div style="background:#1a1a1a;padding:24px;text-align:center;border-bottom:2px solid #F5C800;">
            <h1 style="color:#F5C800;letter-spacing:3px;margin:0;font-size:2rem;">VAKAPAY</h1>
            <p style="color:#aaa;font-size:.8rem;margin:4px 0 0;">Recuperación de acceso</p>
          </div>
          <div style="padding:32px 24px;text-align:center;">
            <h2 style="color:#F2F2F2;margin-bottom:8px;">Hola, ${escHtml(user.nombre || 'usuario')}</h2>
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
    'SELECT id, reset_otp, reset_attempts, (reset_otp_expires > NOW()) AS vigente FROM users WHERE LOWER(TRIM(email)) = $1 ORDER BY id LIMIT 1',
    [normEmail(email)]
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
    if (!passwordValida(newPassword)) return res.status(400).json({ error: ERROR_PASSWORD });
    const check = await comprobarCodigo(email, codigo);
    if (check.error) return res.status(check.status).json({ error: check.error });
    const user = check.user;

    // 2. Cifrar la nueva contraseña con bcrypt
    const hash = bcrypt.hashSync(newPassword, 10);

    // 3. Actualizar la contraseña en la base de datos y limpiar los campos de OTP
    await db.query(
      'UPDATE users SET password_hash = $1, reset_otp = NULL, reset_otp_expires = NULL, reset_attempts = 0, login_fallos = 0, login_bloqueado_hasta = NULL, sesiones_desde = NOW() WHERE id = $2',
      [hash, user.id]
    );
    await db.query('DELETE FROM login_intentos WHERE email = (SELECT LOWER(TRIM(email)) FROM users WHERE id = $1)', [user.id]);
    // Las sesiones abiertas antes del cambio dejan de valer (por si alguien entró con la contraseña antigua)
    olvidarEstado(user.id);

    res.json({ ok: true, message: 'Contraseña actualizada correctamente' });
  } catch (err) { next(err); }
});

module.exports = router;
