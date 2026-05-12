// src/routes/groups.js
// ================================================================
// GET    /groups                    — Lista grupos del usuario
// POST   /groups                    — Crea grupo
// GET    /groups/:id                — Detalle completo
// PATCH  /groups/:id                — Edita grupo
// DELETE /groups/:id                — Elimina grupo
// GET    /groups/:id/members        — Participantes con balances
// POST   /groups/:id/members        — Añade participante
// DELETE /groups/:id/members/:name  — Elimina participante
// GET    /groups/:id/balances       — Saldo neto por participante
// GET    /groups/:id/debts          — Transacciones mínimas (greedy)
// POST   /groups/:id/share-link     — Genera enlace público
// GET    /shared/:token             — Vista pública (sin auth)
// ================================================================

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db      = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { logActivity }  = require('../utils/activity');

const router = express.Router();

// ── helpers ──────────────────────────────────────────────────────
function ownsGroup(groupId, userId) {
  return db.prepare('SELECT id FROM groups WHERE id = ? AND owner_id = ?').get(groupId, userId);
}

function computeDebts(members) {
  const pos = [], neg = [];
  members.forEach(m => {
    if (m.balance > 0.005)  pos.push({ name: m.display_name, amt:  m.balance });
    if (m.balance < -0.005) neg.push({ name: m.display_name, amt: -m.balance });
  });
  pos.sort((a, b) => b.amt - a.amt);
  neg.sort((a, b) => b.amt - a.amt);
  const txns = [];
  let pi = 0, ni = 0;
  while (pi < pos.length && ni < neg.length) {
    const p = pos[pi], n = neg[ni];
    const amt = Math.min(p.amt, n.amt);
    txns.push({ from: n.name, to: p.name, amount: +amt.toFixed(2) });
    p.amt -= amt; n.amt -= amt;
    if (p.amt < 0.005) pi++;
    if (n.amt < 0.005) ni++;
  }
  return txns;
}

// ── GET /groups ───────────────────────────────────────────────────
router.get('/', requireAuth, (req, res, next) => {
  try {
    const groups = db.prepare(`
      SELECT g.*,
        COUNT(DISTINCT gm.id) AS member_count,
        COUNT(DISTINCT e.id)  AS expense_count,
        COALESCE(SUM(e.amount_base), 0) AS total
      FROM groups g
      LEFT JOIN group_members gm ON gm.group_id = g.id
      LEFT JOIN expenses e       ON e.group_id  = g.id
      WHERE g.owner_id = ?
      GROUP BY g.id
      ORDER BY g.created_at DESC
    `).all(req.user.id);

    res.json(groups);
  } catch (err) { next(err); }
});

// ── POST /groups ──────────────────────────────────────────────────
router.post('/', requireAuth, (req, res, next) => {
  try {
    const { name, type = 'viaje', date_start, date_end } = req.body;
    if (!name || !date_start || !date_end) {
      return res.status(400).json({ error: 'name, date_start y date_end son obligatorios' });
    }
    if (date_end < date_start) {
      return res.status(400).json({ error: 'date_end debe ser >= date_start' });
    }

    const result = db.prepare(`
      INSERT INTO groups (owner_id, name, type, date_start, date_end)
      VALUES (?, ?, ?, ?, ?)
    `).run(req.user.id, name, type, date_start, date_end);

    const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(result.lastInsertRowid);
    logActivity(req.user.id, 'group', `Grupo "${name}" creado`);
    res.status(201).json(group);
  } catch (err) { next(err); }
});

// ── GET /groups/:id ───────────────────────────────────────────────
router.get('/:id', requireAuth, (req, res, next) => {
  try {
    const group = db.prepare('SELECT * FROM groups WHERE id = ? AND owner_id = ?')
      .get(req.params.id, req.user.id);
    if (!group) return res.status(404).json({ error: 'Grupo no encontrado' });

    const members  = db.prepare('SELECT * FROM group_members WHERE group_id = ? ORDER BY joined_at').all(group.id);
    const expenses = db.prepare('SELECT * FROM expenses WHERE group_id = ? ORDER BY expense_date DESC').all(group.id);

    expenses.forEach(ex => {
      ex.splits = db.prepare('SELECT * FROM expense_splits WHERE expense_id = ?').all(ex.id);
    });

    res.json({ ...group, members, expenses });
  } catch (err) { next(err); }
});

// ── PATCH /groups/:id ─────────────────────────────────────────────
router.patch('/:id', requireAuth, (req, res, next) => {
  try {
    if (!ownsGroup(req.params.id, req.user.id)) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }
    const { name, type, date_start, date_end, closed_at } = req.body;
    const fields = [], values = [];
    if (name       !== undefined) { fields.push('name = ?');       values.push(name); }
    if (type       !== undefined) { fields.push('type = ?');       values.push(type); }
    if (date_start !== undefined) { fields.push('date_start = ?'); values.push(date_start); }
    if (date_end   !== undefined) { fields.push('date_end = ?');   values.push(date_end); }
    if (closed_at  !== undefined) { fields.push('closed_at = ?');  values.push(closed_at); }
    if (!fields.length) return res.status(400).json({ error: 'Nada que actualizar' });

    values.push(req.params.id);
    db.prepare(`UPDATE groups SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    res.json(db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id));
  } catch (err) { next(err); }
});

// ── DELETE /groups/:id ────────────────────────────────────────────
router.delete('/:id', requireAuth, (req, res, next) => {
  try {
    const group = ownsGroup(req.params.id, req.user.id);
    if (!group) return res.status(404).json({ error: 'Grupo no encontrado' });
    db.prepare('DELETE FROM groups WHERE id = ?').run(req.params.id);
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── GET /groups/:id/members ───────────────────────────────────────
router.get('/:id/members', requireAuth, (req, res, next) => {
  try {
    if (!ownsGroup(req.params.id, req.user.id)) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }
    const members = db.prepare('SELECT * FROM group_members WHERE group_id = ? ORDER BY joined_at').all(req.params.id);
    res.json(members);
  } catch (err) { next(err); }
});

// ── POST /groups/:id/members ──────────────────────────────────────
router.post('/:id/members', requireAuth, (req, res, next) => {
  try {
    if (!ownsGroup(req.params.id, req.user.id)) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }
    const { display_name, user_id = null } = req.body;
    if (!display_name) return res.status(400).json({ error: 'display_name es obligatorio' });

    const existing = db.prepare(
      'SELECT id FROM group_members WHERE group_id = ? AND display_name = ?'
    ).get(req.params.id, display_name);
    if (existing) return res.status(409).json({ error: `El participante "${display_name}" ya existe` });

    const result = db.prepare(`
      INSERT INTO group_members (group_id, user_id, display_name)
      VALUES (?, ?, ?)
    `).run(req.params.id, user_id, display_name);

    logActivity(req.user.id, 'member', `${display_name} añadido al grupo`);
    res.status(201).json(db.prepare('SELECT * FROM group_members WHERE id = ?').get(result.lastInsertRowid));
  } catch (err) { next(err); }
});

// ── DELETE /groups/:id/members/:name ─────────────────────────────
router.delete('/:id/members/:name', requireAuth, (req, res, next) => {
  try {
    if (!ownsGroup(req.params.id, req.user.id)) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }
    const member = db.prepare(
      'SELECT * FROM group_members WHERE group_id = ? AND display_name = ?'
    ).get(req.params.id, req.params.name);

    if (!member) return res.status(404).json({ error: 'Participante no encontrado' });
    if (Math.abs(member.balance) > 0.005) {
      return res.status(422).json({ error: 'No se puede eliminar un participante con balance distinto de 0' });
    }

    db.prepare('DELETE FROM group_members WHERE id = ?').run(member.id);
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── GET /groups/:id/balances ──────────────────────────────────────
router.get('/:id/balances', requireAuth, (req, res, next) => {
  try {
    if (!ownsGroup(req.params.id, req.user.id)) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }
    const members = db.prepare(
      'SELECT display_name, balance FROM group_members WHERE group_id = ? ORDER BY balance DESC'
    ).all(req.params.id);
    res.json(members);
  } catch (err) { next(err); }
});

// ── GET /groups/:id/debts ─────────────────────────────────────────
router.get('/:id/debts', requireAuth, (req, res, next) => {
  try {
    if (!ownsGroup(req.params.id, req.user.id)) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }
    const members = db.prepare('SELECT * FROM group_members WHERE group_id = ?').all(req.params.id);
    res.json({ transactions: computeDebts(members) });
  } catch (err) { next(err); }
});

// ── POST /groups/:id/share-link ───────────────────────────────────
router.post('/:id/share-link', requireAuth, (req, res, next) => {
  try {
    if (!ownsGroup(req.params.id, req.user.id)) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }
    // Reutilizar token existente si ya tiene uno
    const existing = db.prepare('SELECT token FROM share_tokens WHERE group_id = ?').get(req.params.id);
    if (existing) return res.json({ token: existing.token, url: `/shared/${existing.token}` });

    const token = uuidv4().replace(/-/g, '');
    db.prepare('INSERT INTO share_tokens (group_id, token) VALUES (?, ?)').run(req.params.id, token);
    res.status(201).json({ token, url: `/shared/${token}` });
  } catch (err) { next(err); }
});

// ── GET /shared/:token (público, sin auth) ────────────────────────
router.get('/shared/:token', (req, res, next) => {
  try {
    const row = db.prepare('SELECT group_id FROM share_tokens WHERE token = ?').get(req.params.token);
    if (!row) return res.status(404).json({ error: 'Enlace no válido o expirado' });

    const group   = db.prepare('SELECT id, name, type, date_start, date_end FROM groups WHERE id = ?').get(row.group_id);
    const members = db.prepare('SELECT display_name, balance FROM group_members WHERE group_id = ?').all(row.group_id);
    const expenses = db.prepare('SELECT description, amount, currency, category, payer_name, expense_date FROM expenses WHERE group_id = ? ORDER BY expense_date DESC').all(row.group_id);

    res.json({ group, members, expenses, debts: computeDebts(members) });
  } catch (err) { next(err); }
});

module.exports = router;
