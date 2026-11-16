// src/routes/estado.js — Versión mínima de la app y modo mantenimiento (#73)
// ================================================================
// La app y la web preguntan aquí al abrirse. Todo se cambia en Vercel
// (Settings → Environment Variables), sin tocar el código:
//
//   APP_VERSION_MINIMA  Número de versión (versionCode de la APK) más bajo que
//                       se deja usar. Si la APK instalada tiene uno menor, sale
//                       el aviso «Hay una versión nueva». Vacío = sin aviso.
//   APP_URL_DESCARGA    Enlace de descarga de la APK (Google Drive, Google Play…)
//                       para el botón «Descargar». Vacío = el aviso dice que la
//                       pidan a quien les pasó la app.
//   APP_MANTENIMIENTO   Texto que se enseña en lugar de la app mientras dura un
//                       mantenimiento (en la APK y en la web). Vacío = normal.
//
// Tras cambiar una variable hay que volver a desplegar (Deployments → Redeploy).
// ================================================================
const express = require('express');

const router = express.Router();

function estadoActual() {
  const minima = parseInt(process.env.APP_VERSION_MINIMA, 10);
  const url = String(process.env.APP_URL_DESCARGA || '').trim();
  const mantenimiento = String(process.env.APP_MANTENIMIENTO || '').trim();
  return {
    version_minima: Number.isInteger(minima) && minima > 0 ? minima : 0,
    url_descarga: /^https:\/\//i.test(url) ? url : null,
    mantenimiento: mantenimiento ? mantenimiento.slice(0, 500) : null,
  };
}

router.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(estadoActual());
});

module.exports = router;
module.exports.estadoActual = estadoActual;
