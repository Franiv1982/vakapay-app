// src/middleware/errorHandler.js
// ================================================================
// Captura todos los errores no manejados y devuelve JSON limpio.
// ================================================================

function errorHandler(err, req, res, next) {
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path} —`, err.message);

  // Errores de unique constraint de SQLite
  if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({ error: 'Ya existe un recurso con ese identificador' });
  }

  const status = err.status || 500;
  res.status(status).json({
    error: err.message || 'Error interno del servidor'
  });
}

module.exports = errorHandler;
