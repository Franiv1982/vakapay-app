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
    return res.status(409).json({ error: 'Eso ya existe (por ejemplo, un nombre repetido). Prueba con otro.' });
  }
  // PostgreSQL: dato con formato incorrecto (un id que no es número, una fecha mal escrita...)
  if (['22P02', '22007', '22008', '22003', '23502'].includes(err.code)) {
    return res.status(400).json({ error: 'Algún dato no es válido. Revísalo e inténtalo de nuevo.' });
  }
  // JSON mal formado o petición demasiado grande
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Algún dato no es válido. Revísalo e inténtalo de nuevo.' });
  if (err.type === 'entity.too.large')    return res.status(413).json({ error: 'Es demasiado grande para enviarlo. Prueba con una imagen más pequeña.' });

  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: status < 500 && err.expose !== false && err.message ? err.message : 'El servidor ha tenido un problema. Inténtalo de nuevo en un momento.',
  });
}

module.exports = errorHandler;
