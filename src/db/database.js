// src/db/database.js — PostgreSQL
const { Pool, types } = require('pg');
types.setTypeParser(1082, (valor) => valor);

if (!process.env.DATABASE_URL) {
  console.error("❌ Error: La variable de entorno DATABASE_URL no está configurada.");
}

// Forzar la lectura de variables de entorno si existiera un archivo .env
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("❌ Error grave: DATABASE_URL no está definida en el entorno.");
}

const pool = new Pool({
  connectionString: connectionString,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const initSchema = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id             SERIAL PRIMARY KEY,
        nombre         TEXT    NOT NULL DEFAULT '',
        apellido       TEXT    NOT NULL DEFAULT '',
        email          TEXT    UNIQUE,
        password_hash TEXT,
        tel            TEXT,
        bio            TEXT,
        avatar_url     TEXT,
        created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS groups (
        id         SERIAL PRIMARY KEY,
        owner_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
        name       TEXT    NOT NULL,
        type       TEXT    NOT NULL DEFAULT 'viaje'
                   CHECK (type IN ('viaje','casa','pareja','otros')),
        date_start TEXT    NOT NULL,
        date_end   TEXT    NOT NULL,
        closed_at  TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS group_members (
        id           SERIAL PRIMARY KEY,
        group_id     INTEGER NOT NULL REFERENCES groups(id)  ON DELETE CASCADE,
        user_id      INTEGER          REFERENCES users(id)   ON DELETE SET NULL,
        display_name TEXT    NOT NULL,
        balance      REAL    NOT NULL DEFAULT 0.0,
        joined_at    TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE (group_id, display_name)
      );

      CREATE TABLE IF NOT EXISTS friends (
        id         SERIAL PRIMARY KEY,
        owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name       TEXT    NOT NULL,
        email      TEXT,
        phone      TEXT,
        notes      TEXT,
        avatar_url TEXT,
        added_at   TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE (owner_id, name)
      );

      CREATE TABLE IF NOT EXISTS expenses (
        id           SERIAL PRIMARY KEY,
        group_id     INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        description  TEXT    NOT NULL,
        amount       REAL    NOT NULL CHECK (amount > 0),
        currency     TEXT    NOT NULL DEFAULT 'EUR',
        amount_base  REAL    NOT NULL,
        category     TEXT    NOT NULL DEFAULT 'other'
                     CHECK (category IN ('food','transport','hotel','activity','other')),
        payer_name   TEXT    NOT NULL,
        expense_date TEXT    NOT NULL,
        created_at   TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS expense_splits (
        id          SERIAL PRIMARY KEY,
        expense_id  INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
        member_name TEXT    NOT NULL,
        share       REAL    NOT NULL
      );

      CREATE TABLE IF NOT EXISTS activity_log (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
        type       TEXT    NOT NULL DEFAULT 'other',
        message    TEXT    NOT NULL,
        group_name TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS share_tokens (
        id         SERIAL PRIMARY KEY,
        group_id   INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        token      TEXT    NOT NULL UNIQUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id);
      CREATE INDEX IF NOT EXISTS idx_expenses_group      ON expenses(group_id);
      CREATE INDEX IF NOT EXISTS idx_expense_splits_exp  ON expense_splits(expense_id);
      CREATE INDEX IF NOT EXISTS idx_activity_user       ON activity_log(user_id);
      CREATE INDEX IF NOT EXISTS idx_friends_owner       ON friends(owner_id);

      ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS group_name TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_otp TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_otp_expires TIMESTAMP;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_attempts INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE expenses ADD COLUMN IF NOT EXISTS ticket TEXT;
    `);
    console.log('✅ Schema PostgreSQL inicializado u optimizado');
  } catch (err) {
    console.error('❌ Error inicializando schema:', err.message);
  }
};

// Ejecutar de forma asíncrona controlada sin colgar el hilo principal
initSchema();

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};