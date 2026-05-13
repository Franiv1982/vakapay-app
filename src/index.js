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
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Servir avatares subidos
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use(express.static(path.join(__dirname, '../public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/Login.html'));
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
api.use('/friends',  friendsRoutes);
api.use('/activity', activityRoutes);
api.use('/invite',   groupsRoutes);

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
