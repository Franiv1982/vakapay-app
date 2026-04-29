-- ================================================================
-- VAKAPAY — DATABASE SCHEMA
-- Compatible con PostgreSQL y SQLite
-- ================================================================

-- ─── USUARIOS / PERFIL ──────────────────────────────────────────
CREATE TABLE users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,  -- SERIAL en PostgreSQL
    nombre      TEXT        NOT NULL DEFAULT '',
    apellido    TEXT        NOT NULL DEFAULT '',
    email       TEXT        UNIQUE,
    tel         TEXT,
    bio         TEXT,
    avatar_url  TEXT,                               -- URL o base64
    created_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ─── GRUPOS ─────────────────────────────────────────────────────
CREATE TABLE groups (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id    INTEGER     REFERENCES users(id) ON DELETE SET NULL,
    name        TEXT        NOT NULL,
    type        TEXT        NOT NULL DEFAULT 'viaje'
                            CHECK (type IN ('viaje','casa','pareja','otros')),
    date_start  DATE        NOT NULL,
    date_end    DATE        NOT NULL,
    created_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT dates_ok CHECK (date_end >= date_start)
);

-- ─── PARTICIPANTES DE UN GRUPO ──────────────────────────────────
-- Un participante puede ser un usuario registrado o solo un nombre (invitado)
CREATE TABLE group_members (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id    INTEGER     NOT NULL REFERENCES groups(id)  ON DELETE CASCADE,
    user_id     INTEGER     REFERENCES users(id)            ON DELETE SET NULL,
    display_name TEXT       NOT NULL,               -- nombre que aparece en splits
    balance     REAL        NOT NULL DEFAULT 0.0,   -- saldo calculado (+cobra, -debe)
    joined_at   TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (group_id, display_name)
);

-- ─── AMIGOS (contactos del usuario) ─────────────────────────────
CREATE TABLE friends (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id    INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT        NOT NULL,
    email       TEXT,
    phone       TEXT,
    notes       TEXT,
    avatar_url  TEXT,
    added_at    TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (owner_id, name)
);

-- ─── GASTOS ─────────────────────────────────────────────────────
CREATE TABLE expenses (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id    INTEGER     NOT NULL REFERENCES groups(id)  ON DELETE CASCADE,
    description TEXT        NOT NULL,
    amount      REAL        NOT NULL CHECK (amount > 0),
    category    TEXT        NOT NULL DEFAULT 'other'
                            CHECK (category IN ('food','transport','hotel','activity','other')),
    payer_name  TEXT        NOT NULL,               -- display_name del pagador
    expense_date DATE       NOT NULL,
    created_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ─── PARTICIPANTES DE CADA GASTO ────────────────────────────────
-- Quién consumió (y cuánto le corresponde) de cada gasto
CREATE TABLE expense_splits (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_id  INTEGER     NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    member_name TEXT        NOT NULL,               -- display_name del consumidor
    share       REAL        NOT NULL                -- monto que le corresponde pagar
);

-- ─── HISTORIAL DE ACTIVIDAD ─────────────────────────────────────
CREATE TABLE activity_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER     REFERENCES users(id) ON DELETE CASCADE,
    message     TEXT        NOT NULL,
    created_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ================================================================
-- ÍNDICES
-- ================================================================
CREATE INDEX idx_group_members_group  ON group_members(group_id);
CREATE INDEX idx_expenses_group       ON expenses(group_id);
CREATE INDEX idx_expense_splits_exp   ON expense_splits(expense_id);
CREATE INDEX idx_activity_user        ON activity_log(user_id);
CREATE INDEX idx_friends_owner        ON friends(owner_id);

-- ================================================================
-- DATOS DE PRUEBA (seed)
-- ================================================================
INSERT INTO users (nombre, apellido, email) VALUES ('Demo', 'User', 'demo@vakapay.app');

