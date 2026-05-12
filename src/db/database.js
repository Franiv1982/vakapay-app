// src/db/database.js
// ================================================================
// Inicializa la conexión SQLite y aplica el schema si no existe.
// Usa better-sqlite3 (síncrono, sin callbacks) para simplicidad.
// ================================================================

const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

const DB_PATH  = process.env.DB_PATH || path.join(__dirname, '../../data/vakapay.db');
const DATA_DIR = path.dirname(DB_PATH);

// Asegura que el directorio data/ existe
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);

// WAL mode: mejor rendimiento en lecturas concurrentes
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── SCHEMA ──────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre     TEXT    NOT NULL DEFAULT '',
    apellido   TEXT    NOT NULL DEFAULT '',
    email      TEXT    UNIQUE,
    tel        TEXT,
    bio        TEXT,
    avatar_url TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS groups (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    name       TEXT    NOT NULL,
    type       TEXT    NOT NULL DEFAULT 'viaje'
               CHECK (type IN ('viaje','casa','pareja','otros')),
    date_start TEXT    NOT NULL,
    date_end   TEXT    NOT NULL,
    closed_at  TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS group_members (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id     INTEGER NOT NULL REFERENCES groups(id)  ON DELETE CASCADE,
    user_id      INTEGER          REFERENCES users(id)   ON DELETE SET NULL,
    display_name TEXT    NOT NULL,
    balance      REAL    NOT NULL DEFAULT 0.0,
    joined_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE (group_id, display_name)
  );

  CREATE TABLE IF NOT EXISTS friends (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT    NOT NULL,
    email      TEXT,
    phone      TEXT,
    notes      TEXT,
    avatar_url TEXT,
    added_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE (owner_id, name)
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id     INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    description  TEXT    NOT NULL,
    amount       REAL    NOT NULL CHECK (amount > 0),
    currency     TEXT    NOT NULL DEFAULT 'EUR',
    amount_base  REAL    NOT NULL,
    category     TEXT    NOT NULL DEFAULT 'other'
                 CHECK (category IN ('food','transport','hotel','activity','other')),
    payer_name   TEXT    NOT NULL,
    expense_date TEXT    NOT NULL,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS expense_splits (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_id  INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    member_name TEXT    NOT NULL,
    share       REAL    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
    type       TEXT    NOT NULL DEFAULT 'other',
    message    TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS share_tokens (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id   INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    token      TEXT    NOT NULL UNIQUE,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  -- Índices
  CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id);
  CREATE INDEX IF NOT EXISTS idx_expenses_group      ON expenses(group_id);
  CREATE INDEX IF NOT EXISTS idx_expense_splits_exp  ON expense_splits(expense_id);
  CREATE INDEX IF NOT EXISTS idx_activity_user       ON activity_log(user_id);
  CREATE INDEX IF NOT EXISTS idx_friends_owner       ON friends(owner_id);
`);

module.exports = db;
