// src/routes/groups.js — PostgreSQL
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db      = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { logActivity }  = require('../utils/activity');

const router = express.Router();

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

async function ownsGroup(groupId, userId) {
  const r = await db.query('SELECT id FROM groups WHERE id = $1 AND owner_id = $2', [groupId, userId]);
  return r.rows[0];
}

// ── GET /groups ───────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const result = await db.query(`
      SELECT g.*,
        (SELECT COUNT(*)::int FROM group_members WHERE group_id = g.id) AS member_count,
        (SELECT COUNT(*)::int FROM expenses WHERE group_id = g.id) AS expense_count,
        COALESCE((SELECT SUM(amount_base) FROM expenses WHERE group_id = g.id AND NOT es_pago), 0)::float AS total
      FROM groups g
      LEFT JOIN group_members gm ON gm.group_id = g.id
      WHERE gm.user_id = $1
      GROUP BY g.id
      ORDER BY g.created_at DESC
    `, [req.user.id]);
    res.json(result.rows);
  } catch (err) { next(err); }
});

// ── POST /groups ──────────────────────────────────────────────────
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { name, type = 'viaje', date_start, date_end } = req.body;
    if (!name || !date_start || !date_end) {
      return res.status(400).json({ error: 'name, date_start y date_end son obligatorios' });
    }
    if (date_end < date_start) {
      return res.status(400).json({ error: 'date_end debe ser >= date_start' });
    }
    const result = await db.query(`
      INSERT INTO groups (owner_id, name, type, date_start, date_end)
      VALUES ($1, $2, $3, $4, $5) RETURNING *
    `, [req.user.id, name, type, date_start, date_end]);

    const groupId = result.rows[0].id;
    const userRes = await db.query('SELECT nombre FROM users WHERE id = $1', [req.user.id]);
    const ownerName = userRes.rows[0]?.nombre || req.user.email.split('@')[0];
    await db.query(`
      INSERT INTO group_members (group_id, user_id, display_name)
      VALUES ($1, $2, $3)
    `, [groupId, req.user.id, ownerName]);
    logActivity(req.user.id, 'group', `Grupo "${name}" creado`);
    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

// ── GET /groups/:id ───────────────────────────────────────────────
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const gRes = await db.query(`
      SELECT g.* FROM groups g
      LEFT JOIN group_members gm ON gm.group_id = g.id
      WHERE g.id = $1 AND gm.user_id = $2
      LIMIT 1
    `, [req.params.id, req.user.id]);
    const group = gRes.rows[0];
    if (!group) return res.status(404).json({ error: 'Grupo no encontrado' });

    const membersRes  = await db.query('SELECT * FROM group_members WHERE group_id = $1 ORDER BY joined_at', [group.id]);
    const expensesRes = await db.query('SELECT * FROM expenses WHERE group_id = $1 ORDER BY expense_date DESC', [group.id]);

    // La imagen del comprobante no se envía en el listado (pesa mucho): solo si existe.
    // Se descarga aparte, al abrir el gasto.
    const expenses = expensesRes.rows.map(({ ticket, ...ex }) => ({ ...ex, has_ticket: !!ticket }));
    for (const ex of expenses) {
      const splits = await db.query('SELECT * FROM expense_splits WHERE expense_id = $1', [ex.id]);
      ex.splits = splits.rows;
    }

    res.json({ ...group, members: membersRes.rows, expenses });
  } catch (err) { next(err); }
});

// ── PATCH /groups/:id ─────────────────────────────────────────────
router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    if (!await ownsGroup(req.params.id, req.user.id)) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }
    const { name, type, date_start, date_end, closed_at } = req.body;
    const fields = [], values = [];
    let i = 1;
    if (name       !== undefined) { fields.push(`name = $${i++}`);       values.push(name); }
    if (type       !== undefined) { fields.push(`type = $${i++}`);       values.push(type); }
    if (date_start !== undefined) { fields.push(`date_start = $${i++}`); values.push(date_start); }
    if (date_end   !== undefined) { fields.push(`date_end = $${i++}`);   values.push(date_end); }
    if (closed_at  !== undefined) { fields.push(`closed_at = $${i++}`);  values.push(closed_at); }
    if (!fields.length) return res.status(400).json({ error: 'Nada que actualizar' });

    values.push(req.params.id);
    const result = await db.query(`UPDATE groups SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`, values);
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

// ── DELETE /groups/:id ────────────────────────────────────────────
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const memberRes = await db.query(
      'SELECT * FROM group_members WHERE group_id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!memberRes.rows[0]) {
      return res.status(404).json({ error: 'No eres miembro de este grupo' });
    }

    const balance = parseFloat(memberRes.rows[0].balance);
    if (Math.abs(balance) > 0.005) {
      return res.status(422).json({
        error: balance > 0
          ? `Tienes un saldo positivo de ${balance.toFixed(2)}. Salda las cuentas antes de salir.`
          : `Tienes una deuda pendiente de ${Math.abs(balance).toFixed(2)}. Salda las cuentas antes de salir.`
      });
    }

    await db.query(
      'DELETE FROM group_members WHERE group_id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    const remaining = await db.query(
      'SELECT COUNT(*) FROM group_members WHERE group_id = $1',
      [req.params.id]
    );
    if (parseInt(remaining.rows[0].count) === 0) {
      await db.query('DELETE FROM groups WHERE id = $1', [req.params.id]);
    } else {
      const ownerCheck = await db.query(
        'SELECT id FROM groups WHERE id = $1 AND owner_id = $2',
        [req.params.id, req.user.id]
      );
      if (ownerCheck.rows[0]) {
        const nextMember = await db.query(
          'SELECT user_id FROM group_members WHERE group_id = $1 AND user_id IS NOT NULL LIMIT 1',
          [req.params.id]
        );
        if (nextMember.rows[0]) {
          await db.query(
            'UPDATE groups SET owner_id = $1 WHERE id = $2',
            [nextMember.rows[0].user_id, req.params.id]
          );
        }
      }
    }

    res.status(204).end();
  } catch (err) { next(err); }
});

// ── GET /groups/:id/members ───────────────────────────────────────
router.get('/:id/members', requireAuth, async (req, res, next) => {
  try {
    if (!await ownsGroup(req.params.id, req.user.id)) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }
    const result = await db.query('SELECT * FROM group_members WHERE group_id = $1 ORDER BY joined_at', [req.params.id]);
    res.json(result.rows);
  } catch (err) { next(err); }
});

// ── POST /groups/:id/members ──────────────────────────────────────
router.post('/:id/members', requireAuth, async (req, res, next) => {
  try {
    const memberCheck = await db.query(
      'SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    const isOwner = await ownsGroup(req.params.id, req.user.id);
    if (!isOwner && !memberCheck.rows[0]) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }
    const { display_name, user_id = null } = req.body;
    if (!display_name) return res.status(400).json({ error: 'display_name es obligatorio' });

    // Sin distinguir mayúsculas ni espacios: "Juan" y "juan " son el mismo participante
    const existing = await db.query(
      'SELECT display_name FROM group_members WHERE group_id = $1 AND LOWER(TRIM(display_name)) = LOWER(TRIM($2))',
      [req.params.id, display_name]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: `El participante "${existing.rows[0].display_name}" ya existe` });
    }

    const result = await db.query(`
      INSERT INTO group_members (group_id, user_id, display_name)
      VALUES ($1, $2, $3) RETURNING *
    `, [req.params.id, user_id, display_name]);

    logActivity(req.user.id, 'member', `${display_name} añadido al grupo`);
    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

// ── DELETE /groups/:id/members/:name ─────────────────────────────
router.delete('/:id/members/:name', requireAuth, async (req, res, next) => {
  try {
    if (!await ownsGroup(req.params.id, req.user.id)) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }
    const mRes = await db.query(
      'SELECT * FROM group_members WHERE group_id = $1 AND display_name = $2',
      [req.params.id, req.params.name]
    );
    const member = mRes.rows[0];
    if (!member) return res.status(404).json({ error: 'Participante no encontrado' });
    await db.query('DELETE FROM group_members WHERE id = $1', [member.id]);
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── GET /groups/:id/balances ──────────────────────────────────────
router.get('/:id/balances', requireAuth, async (req, res, next) => {
  try {
    if (!await ownsGroup(req.params.id, req.user.id)) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }
    const result = await db.query(
      'SELECT display_name, balance FROM group_members WHERE group_id = $1 ORDER BY balance DESC',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

// ── GET /groups/:id/debts ─────────────────────────────────────────
router.get('/:id/debts', requireAuth, async (req, res, next) => {
  try {
    if (!await ownsGroup(req.params.id, req.user.id)) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }
    const result = await db.query('SELECT * FROM group_members WHERE group_id = $1', [req.params.id]);
    res.json({ transactions: computeDebts(result.rows) });
  } catch (err) { next(err); }
});

// ── POST /groups/:id/share-link ───────────────────────────────────
router.post('/:id/share-link', requireAuth, async (req, res, next) => {
  try {
    if (!await ownsGroup(req.params.id, req.user.id)) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }
    const existing = await db.query('SELECT token FROM share_tokens WHERE group_id = $1', [req.params.id]);
    if (existing.rows.length > 0) {
      return res.json({ token: existing.rows[0].token, url: `/shared/${existing.rows[0].token}` });
    }
    const token = uuidv4().replace(/-/g, '');
    await db.query('INSERT INTO share_tokens (group_id, token) VALUES ($1, $2)', [req.params.id, token]);
    res.status(201).json({ token, url: `/shared/${token}` });
  } catch (err) { next(err); }
});

// ── GET /shared/:token ────────────────────────────────────────────
router.get('/shared/:token', async (req, res, next) => {
  try {
    const row = await db.query('SELECT group_id FROM share_tokens WHERE token = $1', [req.params.token]);
    if (!row.rows[0]) return res.status(404).json({ error: 'Enlace no válido o expirado' });

    const groupId = row.rows[0].group_id;
    const gRes    = await db.query('SELECT id, name, type, date_start, date_end FROM groups WHERE id = $1', [groupId]);
    const mRes    = await db.query('SELECT display_name, balance FROM group_members WHERE group_id = $1', [groupId]);
    const eRes    = await db.query('SELECT description, amount, currency, category, payer_name, expense_date FROM expenses WHERE group_id = $1 ORDER BY expense_date DESC', [groupId]);

    res.json({ group: gRes.rows[0], members: mRes.rows, expenses: eRes.rows, debts: computeDebts(mRes.rows) });
  } catch (err) { next(err); }
});

// ── GET /groups/:id/cobro/:name ───────────────────────────────────
// Cómo cobra un participante (Bizum / IBAN). Solo para miembros del grupo.
router.get('/:id/cobro/:name', requireAuth, async (req, res, next) => {
  try {
    const yo = await db.query('SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!yo.rows[0]) return res.status(404).json({ error: 'Grupo no encontrado' });
    const r = await db.query(`
      SELECT gm.display_name, gm.user_id, u.pago_bizum, u.pago_iban, u.nombre
      FROM group_members gm LEFT JOIN users u ON u.id = gm.user_id
      WHERE gm.group_id = $1 AND gm.display_name = $2
    `, [req.params.id, req.params.name]);
    const m = r.rows[0];
    if (!m) return res.status(404).json({ error: 'Participante no encontrado' });
    res.json({
      nombre: m.display_name,
      tiene_cuenta: !!m.user_id,
      titular: m.nombre || m.display_name,
      bizum: m.pago_bizum || null,
      iban: m.pago_iban || null,
    });
  } catch (err) { next(err); }
});

router.patch('/:id/members/:name/rename', requireAuth, async (req, res, next) => {
  try {
    if (!await ownsGroup(req.params.id, req.user.id)) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }
    const { display_name } = req.body;
    if (!display_name) return res.status(400).json({ error: 'display_name es obligatorio' });

    const existing = await db.query(
      'SELECT id FROM group_members WHERE group_id = $1 AND LOWER(TRIM(display_name)) = LOWER(TRIM($2)) AND display_name <> $3',
      [req.params.id, display_name, req.params.name]
    );
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Ya existe un participante con ese nombre' });

    await db.query(
      'UPDATE group_members SET display_name = $1 WHERE group_id = $2 AND display_name = $3',
      [display_name, req.params.id, req.params.name]
    );
    await db.query(
      'UPDATE expenses SET payer_name = $1 WHERE group_id = $2 AND payer_name = $3',
      [display_name, req.params.id, req.params.name]
    );
    await db.query(
      'UPDATE expense_splits SET member_name = $1 WHERE member_name = $2 AND expense_id IN (SELECT id FROM expenses WHERE group_id = $3)',
      [display_name, req.params.name, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
