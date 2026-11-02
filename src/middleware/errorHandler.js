// src/middleware/errorHandler.js
// ================================================================
// Captura todos los errores no manejados y devuelve JSON limpio.
// Los detalles internos (mensajes de la base de datos, etc.) solo van al log
// del servidor: a la app le llega un mensaje genérico.
// ================================================================

function errorHandler(err, req, res, next) {
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path} —`, err.message);

  // PostgreSQL: dato repetido (email, nombre de participante...)
  if (err.code === '23505' || err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({ error: 'Ya existe un registro con esos datos' });
  }
  // PostgreSQL: dato con formato incorrecto (un id que no es número, una fecha mal escrita...)
  if (['22P02', '22007', '22008', '22003', '23502'].includes(err.code)) {
    return res.status(400).json({ error: 'Datos no válidos' });
  }
  // JSON mal formado o petición demasiado grande
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Datos no válidos' });
  if (err.type === 'entity.too.large')    return res.status(413).json({ error: 'La petición es demasiado grande' });

  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: status < 500 && err.expose !== false && err.message ? err.message : 'Error interno del servidor',
  });
}

module.exports = errorHandler;
