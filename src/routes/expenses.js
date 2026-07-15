// src/routes/expenses.js — PostgreSQL
const express = require('express');
const db      = require('../db/database');
const { requireAuth }  = require('../middleware/auth');
const { logActivity }  = require('../utils/activity');

const router = express.Router({ mergeParams: true });

const RATES = { EUR: 1, USD: 1 / 1.08, GBP: 1 / 0.86, ARS: 1 / 1100 };
function toBase(amount, currency) {
  return +(amount * (RATES[currency] || 1)).toFixed(2);
}

async function ownsGroup(groupId, userId) {
  const r = await db.query('SELECT id FROM groups WHERE id = $1 AND owner_id = $2', [groupId, userId]);
  return r.rows[0];
}

async function isMember(groupId, userId) {
  const r = await db.query(
    'SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2',
    [groupId, userId]
  );
  return r.rows[0];
}

async function recalcBalances(groupId) {
  const membersRes  = await db.query('SELECT display_name FROM group_members WHERE group_id = $1', [groupId]);
  const expensesRes = await db.query('SELECT * FROM expenses WHERE group_id = $1', [groupId]);

  const balances = {};
  membersRes.rows.forEach(m => { balances[m.display_name] = 0; });

  for (const ex of expensesRes.rows) {
    const splitsRes = await db.query('SELECT * FROM expense_splits WHERE expense_id = $1', [ex.id]);
    if (balances[ex.payer_name] !== undefined) {
      // Línea corregida:
    balances[ex.payer_name] = +(balances[ex.payer_name] + Number(ex.amount_base || 0)).toFixed(2);
    }
    splitsRes.rows.forEach(s => {
      if (balances[s.member_name] !== undefined) {
        balances[s.member_name] = +(balances[s.member_name] - s.share).toFixed(2);
      }
    });
  }

  for (const [name, bal] of Object.entries(balances)) {
    await db.query(
      'UPDATE group_members SET balance = $1 WHERE group_id = $2 AND display_name = $3',
      [bal, groupId, name]
    );
  }
}

// ── GET /groups/:id/expenses ──────────────────────────────────────
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const isOwner = await ownsGroup(req.params.id, req.user.id);
    const member = await isMember(req.params.id, req.user.id);
    if (!isOwner && !member) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }
    const expensesRes = await db.query(`
      SELECT * FROM expenses WHERE group_id = $1 ORDER BY expense_date DESC, created_at DESC
    `, [req.params.id]);

    const expenses = expensesRes.rows;
    for (const ex of expenses) {
      const splits = await db.query('SELECT * FROM expense_splits WHERE expense_id = $1', [ex.id]);
      ex.splits = splits.rows;
    }
    res.json(expenses);
  } catch (err) { next(err); }
});

// ── POST /groups/:id/expenses ─────────────────────────────────────
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const isOwner = await ownsGroup(req.params.id, req.user.id);
    const member = await isMember(req.params.id, req.user.id);
    if (!isOwner && !member) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }

    const { description, amount, currency = 'EUR', category = 'other', payer_name, expense_date, involved } = req.body;

    if (!description || !amount || !payer_name || !expense_date || !involved?.length) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    const amount_base = toBase(amount, currency);
    const shareBase   = +(amount_base / involved.length).toFixed(2);

    const expRes = await db.query(`
      INSERT INTO expenses (group_id, description, amount, currency, amount_base, category, payer_name, expense_date, member_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *
    `, [req.params.id, description, amount, currency, amount_base, category, payer_name, expense_date, req.user.id]);

    const expense = expRes.rows[0];

    for (const name of involved) {
      await db.query(
        'INSERT INTO expense_splits (expense_id, member_name, share) VALUES ($1, $2, $3)',
        [expense.id, name, shareBase]
      );
    }

    await recalcBalances(req.params.id);

    const splits = await db.query('SELECT * FROM expense_splits WHERE expense_id = $1', [expense.id]);
    expense.splits = splits.rows;

    logActivity(req.user.id, 'expense', `${payer_name} registró "${description}" · ${amount} ${currency}`);
    res.status(201).json(expense);
  } catch (err) { next(err); }
});

// ── GET /groups/:id/expenses/:expId ──────────────────────────────
router.get('/:expId', requireAuth, async (req, res, next) => {
  try {
    const isOwner = await ownsGroup(req.params.id, req.user.id);
    const member = await isMember(req.params.id, req.user.id);
    if (!isOwner && !member) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }
    const expRes = await db.query('SELECT * FROM expenses WHERE id = $1 AND group_id = $2', [req.params.expId, req.params.id]);
    const expense = expRes.rows[0];
    if (!expense) return res.status(404).json({ error: 'Gasto no encontrado' });
    const splits = await db.query('SELECT * FROM expense_splits WHERE expense_id = $1', [expense.id]);
    expense.splits = splits.rows;
    res.json(expense);
  } catch (err) { next(err); }
});

// ── PUT /groups/:id/expenses/:expId ──────────────────────────────
router.put('/:expId', requireAuth, async (req, res, next) => {
  try {
    const isOwner = await ownsGroup(req.params.id, req.user.id);
    const member = await isMember(req.params.id, req.user.id);
    if (!isOwner && !member) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }
    const existing = await db.query('SELECT id FROM expenses WHERE id = $1 AND group_id = $2', [req.params.expId, req.params.id]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'Gasto no encontrado' });

    const { description, amount, currency = 'EUR', category = 'other', payer_name, expense_date, involved } = req.body;
    if (!description || !amount || !payer_name || !expense_date || !involved?.length) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    const amount_base = toBase(amount, currency);
    const shareBase   = +(amount_base / involved.length).toFixed(2);

    await db.query(`
      UPDATE expenses 
      SET description=$1, amount=$2, currency=$3, amount_base=$4, category=$5, payer_name=$6, expense_date=$7
      WHERE id=$8 AND group_id=$9
    `, [description, amount, currency, amount_base, category, payer_name, expense_date, req.params.expId, req.params.id]);

    await db.query('DELETE FROM expense_splits WHERE expense_id = $1', [req.params.expId]);
    for (const name of involved) {
      await db.query(
        'INSERT INTO expense_splits (expense_id, member_name, share) VALUES ($1, $2, $3)',
        [req.params.expId, name, shareBase]
      );
    }

    await recalcBalances(req.params.id);

    const expRes = await db.query('SELECT * FROM expenses WHERE id = $1', [req.params.expId]);
    const expense = expRes.rows[0];
    const splits  = await db.query('SELECT * FROM expense_splits WHERE expense_id = $1', [expense.id]);
    expense.splits = splits.rows;
    res.json(expense);
  } catch (err) { next(err); }
});

// ── DELETE /groups/:id/expenses/:expId ───────────────────────────
router.delete('/:expId', requireAuth, async (req, res, next) => {
  try {
    const isOwner = await ownsGroup(req.params.id, req.user.id);
    const member = await isMember(req.params.id, req.user.id);
    if (!isOwner && !member) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }
    const expRes = await db.query('SELECT id FROM expenses WHERE id = $1 AND group_id = $2', [req.params.expId, req.params.id]);
    if (!expRes.rows[0]) return res.status(404).json({ error: 'Gasto no encontrado' });

    await db.query('DELETE FROM expenses WHERE id = $1', [req.params.expId]);
    await recalcBalances(req.params.id);
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
