// src/utils/texto.js — Textos seguros
// ================================================================
// Los nombres, descripciones, notas, etc. se muestran en la app dentro de HTML.
// Para que nadie pueda colar código (por ejemplo un participante llamado
// <img onerror=...>), el servidor cambia los caracteres peligrosos por otros
// que se ven casi igual pero no son código:
//   <  >  "  '  `  \  &   →   ‹  ›  ”  ’  ´  /  ＆
// Se aplica a todo lo que llega en el cuerpo de las peticiones, salvo a los
// campos de la lista NO_TOCAR (contraseñas, imágenes, texto del chat, que la
// app ya muestra de forma segura, etc.).
// ================================================================

const DE   = '<>"\'`\\&';
const A    = '‹›”’´/＆';
const PELIGROSOS = /[<>"'`\\&]/g;

const limpiarTexto = s => String(s).replace(PELIGROSOS, c => A[DE.indexOf(c)]);

const NO_TOCAR = new Set([
  'password', 'newPassword', 'codigo',          // se comparan tal cual
  'ticket', 'imagen', 'image', 'avatar_url',    // imágenes en base64
  'gif', 'media_type',                          // URL de GIPHY / tipo de imagen
  'texto',                                      // mensajes del chat (la app los escapa)
]);

function limpiar(valor, clave) {
  if (typeof valor === 'string') return NO_TOCAR.has(clave) ? valor : limpiarTexto(valor);
  if (Array.isArray(valor)) return valor.map(v => limpiar(v, clave));
  if (valor && typeof valor === 'object') {
    const r = {};
    for (const [k, v] of Object.entries(valor)) r[k] = limpiar(v, k);
    return r;
  }
  return valor;
}

// Middleware: limpia req.body antes de que llegue a las rutas
function textosSeguros(req, res, next) {
  if (req.body && typeof req.body === 'object') req.body = limpiar(req.body, '');
  next();
}

module.exports = { textosSeguros, limpiarTexto, DE, A };
