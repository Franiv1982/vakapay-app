// src/index.js
// ================================================================
// VakaPay Backend — Express + SQLite
// ================================================================

const express      = require('express');
const cors         = require('cors');
const path         = require('path');
const errorHandler = require('./middleware/errorHandler');

// Routes
const authRoutes     = require('./routes/auth');
const usersRoutes    = require('./routes/users');
const groupsRoutes   = require('./routes/groups');
const expensesRoutes = require('./routes/expenses');
const friendsRoutes  = require('./routes/friends');
const activityRoutes = require('./routes/activity');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware global ─────────────────────────────────────────────
const allowedOrigins = [
  'https://vakapay-app.vercel.app',   // la propia web
  'https://localhost',                 // WebView de Capacitor en Android (tu APK)
  'capacitor://localhost',             // variante usada en algunas versiones/plataformas
  'http://localhost',                  // por si pruebas en local
];

app.use(cors({
  origin: function (origin, callback) {
    // Permite peticiones sin "origin" (apps nativas, curl, Postman) y las de la lista
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('No permitido por CORS: ' + origin));
    }
  },
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
// Nombres, descripciones, etc. sin caracteres que puedan colar código en la app
app.use(require('./utils/texto').textosSeguros);

// Cabeceras de seguridad: el navegador no adivina tipos de archivo, la web no se
// puede meter dentro de otra página (clickjacking) y no se envía la URL a terceros
app.disable('x-powered-by');
// Lista de sitios permitidos (CSP): la web solo puede cargar código, imágenes y
// conexiones de VakaPay y de los servicios que usa. Si algún día se colara algo,
// el navegador no le dejaría traer código de fuera ni enviar datos a otro sitio.
//   · 'unsafe-inline': la app usa onclick="…" y style="…" en el HTML (se quitará
//     cuando esos estilos y eventos pasen a clases; ver issue #65)
//   · cdn.jsdelivr.net + tessdata.projectnaptha.com + wasm: lector de tickets
//     en el móvil (Tesseract) cuando el escaneo del servidor no está disponible
//   · giphy.com: búsqueda y GIF del chat · fonts: tipografías de Google
// Solo afecta a la web: la APK sirve sus archivos desde el propio móvil.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net",
  "worker-src 'self' blob: https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://*.giphy.com https://giphy.com",
  "connect-src 'self' data: blob: https://api.giphy.com https://cdn.jsdelivr.net https://tessdata.projectnaptha.com",
  "media-src 'self' data: blob: https://*.giphy.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Strict-Transport-Security': 'max-age=31536000',
    'Content-Security-Policy': CSP,
  });
  next();
});

// Servir avatares subidos
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use(express.static(path.join(__dirname, '../public'), { index: false }));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

// ── Health check ──────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
  });
});

// ── API v1 ────────────────────────────────────────────────────────
const api = express.Router();

api.use('/auth',     authRoutes);
api.use('/users',    usersRoutes);
api.use('/groups',   groupsRoutes);
api.use('/groups/:id/expenses', expensesRoutes);   // /groups/:id/expenses (mergeParams)
api.use('/groups/:id/chat',     require('./routes/chat'));
api.use('/friends',  friendsRoutes);
api.use('/activity', activityRoutes);
api.use('/invite',   require('./routes/invite'));
api.use('/ocr',      require('./routes/ocr'));

// Vista pública compartida (sin auth, fuera del prefix /api/v1)
app.use('/shared', require('./routes/groups'));

app.use('/api/v1', api);

// ── 404 ───────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.path}` });
});

// ── Error handler ─────────────────────────────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 VakaPay API corriendo en http://localhost:${PORT}`);
  console.log(`   Entorno:  ${process.env.NODE_ENV || 'development'}`);
  console.log(`   DB:       ${process.env.DB_PATH || 'data/vakapay.db'}`);
  console.log(`   Docs:     http://localhost:${PORT}/health\n`);
});

module.exports = app;
