// src/middleware/auth.js
// ================================================================
// Verifica el JWT en el header Authorization: Bearer <token>
// Inyecta req.user = { id, email } si es válido.
// ================================================================

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'vakapay_dev_secret_change_in_prod';

function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'No autenticado. Incluye Authorization: Bearer <token>' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

module.exports = { requireAuth, signToken };
