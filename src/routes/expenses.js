// src/routes/expenses.js
// ================================================================
// GET    /groups/:id/expenses         — Lista gastos del grupo
// POST   /groups/:id/expenses         — Crea gasto + recalcula balances
// GET    /groups/:id/expenses/:expId  — Detalle de gasto
// PUT    /groups/:id/expenses/:expId  — Reemplaza gasto (revierte + recalcula)
// DELETE /groups/:id/expenses/:expId  — Elimina gasto + revierte balances
// ================================================================

const express = require('express');
const db      = require('../db/database');
const { requireAuth }  = require('../middleware/auth');
const { logActivity }  = require('../utils/activity');

const router = express.Router({ mergeParams: true });

// Tasas de conversión a EUR (simplificado — en Fase 3 usar API de divisas)
const RATES = { EUR: 1, USD: 1 / 1.08, GBP: 1 / 0.86, ARS: 1 / 1100 };

function toBase(amount, currency) {
  return +(amount * (RATES[currency] || 1)).toFixed(2);
}

function ownsGroup(groupId, userId) {
  return db.prepare('SELECT id FROM groups WHERE id = ? AND owner_id = ?').get(groupId, userId);
}

// ── Recalcula balances de un grupo desde cero ─────────────────────
function recalcBalances(groupId) {
  const members  = db.prepare('SELECT display_name FROM group_members WHERE group_id = ?').all(groupId);
  const expenses = db.prepare('SELECT * FROM expenses WHERE group_id = ?').all(groupId);

  // Reset todos a 0
  const balances = {};
  members.forEach(m => { balances[m.display_name] = 0; });

  expenses.forEach(ex => {
    const splits = db.prepare('SELECT * FROM expense_splits WHERE expense_id = ?').all(ex.id);
    // El pagador cobra el total
    if (balances[ex.payer_name] !== undefined) {
      balances[ex.payer_name] = +(balances[ex.payer_name] + ex.amount_base).toFixed(2);
    }
    // Cada involucrado debe su parte
    splits.forEach(s => {
      if (balances[s.member_name] !== undefined) {
        balances[s.member_name] = +(balances[s.member_name] - s.share).toFixed(2);
      }
    });
  });

  const update = db.prepare(`
    UPDATE group_members SET balance = ? WHERE group_id = ? AND display_name = ?
  `);
  Object.entries(balances).forEach(([name, bal]) => update.run(bal, groupId, name));
}

// ── GET /groups/:id/expenses ──────────────────────────────────────
router.get('/', requireAuth, (req, res, next) => {
  try {
    if (!ownsGroup(req.params.id, req.user.id)) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }
    const expenses = db.prepare(`
      SELECT * FROM expenses WHERE group_id = ? ORDER BY expense_date DESC, created_at DESC
    `).all(req.params.id);

    expenses.forEach(ex => {
      ex.splits = db.prepare('SELECT * FROM expense_splits WHERE expense_id = ?').all(ex.id);
    });
    res.json(expenses);
  } catch (err) { next(err); }
});

// ── POST /groups/:id/expenses ─────────────────────────────────────
router.post('/', requireAuth, (req, res, next) => {
  try {
    if (!ownsGroup(req.params.id, req.user.id)) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }

    const { description, amount, currency = 'EUR', category = 'other', payer_name, expense_date, involved } = req.body;

    if (!description || !amount || !payer_name || !expense_date || !involved?.length) {
      return res.status(400).json({ error: 'Faltan campos obligatorios: description, amount, payer_name, expense_date, involved' });
    }

    const amount_base = toBase(amount, currency);
    const shareBase   = +(amount_base / involved.length).toFixed(2);

    const createExpense = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO expenses (group_id, description, amount, currency, amount_base, category, payer_name, expense_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(req.params.id, description, amount, currency, amount_base, category, payer_name, expense_date);

      const expId = result.lastInsertRowid;
      const addSplit = db.prepare('INSERT INTO expense_splits (expense_id, member_name, share) VALUES (?, ?, ?)');
      involved.forEach(name => addSplit.run(expId, name, shareBase));

      recalcBalances(req.params.id);
      return expId;
    });

    const expId  = createExpense();
    const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(expId);
    expense.splits = db.prepare('SELECT * FROM expense_splits WHERE expense_id = ?').all(expId);

    logActivity(req.user.id, 'expense', `${payer_name} registró "${description}" · ${amount} ${currency}`);
    res.status(201).json(expense);
  } catch (err) { next(err); }
});

// ── GET /groups/:id/expenses/:expId ──────────────────────────────
router.get('/:expId', requireAuth, (req, res, next) => {
  try {
    if (!ownsGroup(req.params.id, req.user.id)) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }
    const expense = db.prepare('SELECT * FROM expenses WHERE id = ? AND group_id = ?')
      .get(req.params.expId, req.params.id);
    if (!expense) return res.status(404).json({ error: 'Gasto no encontrado' });
    expense.splits = db.prepare('SELECT * FROM expense_splits WHERE expense_id = ?').all(expense.id);
    res.json(expense);
  } catch (err) { next(err); }
});

// ── PUT /groups/:id/expenses/:expId ──────────────────────────────
router.put('/:expId', requireAuth, (req, res, next) => {
  try {
    if (!ownsGroup(req.params.id, req.user.id)) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }
    const existing = db.prepare('SELECT id FROM expenses WHERE id = ? AND group_id = ?')
      .get(req.params.expId, req.params.id);
    if (!existing) return res.status(404).json({ error: 'Gasto no encontrado' });

    const { description, amount, currency = 'EUR', category = 'other', payer_name, expense_date, involved } = req.body;

    if (!description || !amount || !payer_name || !expense_date || !involved?.length) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    const amount_base = toBase(amount, currency);
    const shareBase   = +(amount_base / involved.length).toFixed(2);

    const updateExpense = db.transaction(() => {
      db.prepare(`
        UPDATE expenses SET description=?, amount=?, currency=?, amount_base=?, category=?, payer_name=?, expense_date=?
        WHERE id=?
      `).run(description, amount, currency, amount_base, category, payer_name, expense_date, req.params.expId);

      db.prepare('DELETE FROM expense_splits WHERE expense_id = ?').run(req.params.expId);
      const addSplit = db.prepare('INSERT INTO expense_splits (expense_id, member_name, share) VALUES (?, ?, ?)');
      involved.forEach(name => addSplit.run(req.params.expId, name, shareBase));

      recalcBalances(req.params.id);
    });

    updateExpense();
    const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.expId);
    expense.splits = db.prepare('SELECT * FROM expense_splits WHERE expense_id = ?').all(expense.id);
    res.json(expense);
  } catch (err) { next(err); }
});

// ── DELETE /groups/:id/expenses/:expId ───────────────────────────
router.delete('/:expId', requireAuth, (req, res, next) => {
  try {
    if (!ownsGroup(req.params.id, req.user.id)) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }
    const expense = db.prepare('SELECT id FROM expenses WHERE id = ? AND group_id = ?')
      .get(req.params.expId, req.params.id);
    if (!expense) return res.status(404).json({ error: 'Gasto no encontrado' });

    const deleteExpense = db.transaction(() => {
      db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.expId);
      recalcBalances(req.params.id);
    });
    deleteExpense();
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
