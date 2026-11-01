// src/middleware/auth.js
// ================================================================
// Verifica el JWT en el header Authorization: Bearer <token>
// Inyecta req.user = { id, email } si es válido.
// ================================================================

const jwt = require('jsonwebtoken');
const db  = require('../db/database');

const JWT_SECRET = process.env.JWT_SECRET || 'vakapay_dev_secret_change_in_prod';

// Mensaje para una cuenta bloqueada (con el motivo, si se ha escrito en Supabase)
function textoBloqueo(motivo) {
  const m = String(motivo || '').trim().replace(/\.+$/, '');
  return 'Tu cuenta está desactivada' + (m ? `: ${m}.` : '.') + ' Si crees que es un error, contacta con el soporte de VakaPay.';
}

// Estado de la cuenta (existe / bloqueada). Se guarda 20 s en memoria para no
// consultar la base de datos en cada petición seguida de la misma persona.
const _estado = new Map();
async function estadoCuenta(userId) {
  const c = _estado.get(userId);
  if (c && Date.now() - c.t < 20000) return c;
  const r = await db.query('SELECT bloqueado, bloqueo_motivo FROM users WHERE id = $1', [userId]);
  const e = { t: Date.now(), existe: !!r.rows[0], bloqueado: !!(r.rows[0] && r.rows[0].bloqueado), motivo: r.rows[0] && r.rows[0].bloqueo_motivo };
  _estado.set(userId, e);
  return e;
}

async function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'No autenticado. Incluye Authorization: Bearer <token>' });
  }

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado', sesion_invalida: true });
  }
  try {
    const e = await estadoCuenta(payload.sub);
    if (!e.existe) return res.status(401).json({ error: 'Esta cuenta ya no existe.', sesion_invalida: true });
    if (e.bloqueado) return res.status(403).json({ error: textoBloqueo(e.motivo), cuenta_bloqueada: true });
  } catch (err) {
    return next(err);
  }
  req.user = { id: payload.sub, email: payload.email };
  next();
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

module.exports = { requireAuth, signToken, textoBloqueo };
