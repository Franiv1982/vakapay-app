// src/routes/expenses.js — PostgreSQL
const express = require('express');
const db      = require('../db/database');
const { requireAuth }  = require('../middleware/auth');
const { logGroupActivity } = require('../utils/activity');
const { DIAS_CONFIRMAR, porConfirmar, fechaCorta } = require('../utils/pagos');

const router = express.Router({ mergeParams: true });

const RATES = { EUR: 1, USD: 1 / 1.08, GBP: 1 / 0.86, ARS: 1 / 1100 };
function toBase(amount, currency) {
  return +(amount * (RATES[currency] || 1)).toFixed(2);
}

// Importe en moneda base: se usa el que calcula la app (respeta el tipo de cambio
// manual del usuario). Solo si no llega uno válido se usa la tabla fija de arriba.
function importeBase(body, amount, currency) {
  const enviado = Number(body.amount_base);
  return Number.isFinite(enviado) && enviado > 0 ? +enviado.toFixed(2) : toBase(amount, currency);
}

// ── Comprobantes (foto del ticket) ────────────────────────────────
// Se guardan como imagen en texto (data:image/...) en la columna expenses.ticket.
const MAX_TICKET = 2 * 1024 * 1024; // ~1,5 MB de imagen; la app la reduce antes de enviarla
function ticketValido(t) {
  return t === null || (typeof t === 'string' && /^data:image\/(?!svg)[a-z0-9.+-]+;base64,/i.test(t) && t.length <= MAX_TICKET);
}
// Quita la imagen de la respuesta y deja solo si existe (los listados no la necesitan)
// Añade por_confirmar (true si el pago espera a que quien cobra lo confirme)
const conEstado = e => ({ ...e, por_confirmar: porConfirmar(e) });
function sinTicket(row) {
  const { ticket, ...resto } = row;
  return { ...resto, has_ticket: !!ticket };
}

// Importe positivo y razonable, participantes como lista de nombres
const MAX_IMPORTE = 10000000;
function errorDeDatos({ amount, amount_base, involved, payer_name, description }) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_IMPORTE) return 'El importe no es válido';
  if (amount_base !== undefined && amount_base !== null && amount_base !== '') {
    const b = Number(amount_base);
    if (!Number.isFinite(b) || b <= 0 || b > MAX_IMPORTE) return 'El importe no es válido';
  }
  if (!Array.isArray(involved) || involved.length > 200 || involved.some(x => typeof x !== 'string' || !x.trim())) return 'Participantes no válidos';
  if (typeof payer_name !== 'string' || typeof description !== 'string' || description.length > 500) return 'Algún dato no es válido. Revísalo e inténtalo de nuevo.';
  return null;
}

// Reparte un importe entre varias personas sin perder céntimos:
// 100 € entre 3 → 33.34, 33.33, 33.33 (suma exactamente 100).
function repartir(total, nombres) {
  const centimos = Math.round(Number(total) * 100);
  const cada = Math.floor(centimos / nombres.length);
  const resto = centimos - cada * nombres.length;
  return nombres.map((nombre, i) => ({ nombre, share: (cada + (i < resto ? 1 : 0)) / 100 }));
}

// ── Textos para el historial de actividad ─────────────────────────
const CAT_NAMES = { food: 'Comida', transport: 'Transporte', hotel: 'Alojamiento', activity: 'Actividad', other: 'Otro' };
const catName = c => CAT_NAMES[c] || c || 'Otro';
function fechaTexto(v) {
  if (!v) return '';
  const iso = v instanceof Date ? v.toISOString() : String(v);
  const [y, m, d] = iso.slice(0, 10).split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}
const importe = (a, c) => `${Number(a).toFixed(2)} ${c || 'EUR'}`;

// Describe qué cambió entre la versión anterior y la nueva de un gasto
function describirCambios(antes, despues) {
  const cambios = [];
  if (antes.description !== despues.description) cambios.push(`descripción "${antes.description}" → "${despues.description}"`);
  if (Number(antes.amount) !== Number(despues.amount) || antes.currency !== despues.currency)
    cambios.push(`monto ${importe(antes.amount, antes.currency)} → ${importe(despues.amount, despues.currency)}`);
  if (antes.category !== despues.category) cambios.push(`categoría ${catName(antes.category)} → ${catName(despues.category)}`);
  if (antes.payer_name !== despues.payer_name) cambios.push(`pagó ${antes.payer_name} → ${despues.payer_name}`);
  if (fechaTexto(antes.expense_date) !== fechaTexto(despues.expense_date))
    cambios.push(`fecha ${fechaTexto(antes.expense_date)} → ${fechaTexto(despues.expense_date)}`);
  const a = [...(antes.involved || [])].sort().join(', ');
  const b = [...(despues.involved || [])].sort().join(', ');
  if (a !== b) cambios.push(`participantes ${a} → ${b}`);
  return cambios;
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

// Un pago no puede ser mayor que lo que debe quien paga ni que lo que se le debe
// a quien lo recibe. Evita pagos repetidos (doble pulsación, o dos móviles con la
// lista de deudas sin actualizar), que dejarían a alguien sin gastos como acreedor.
const MARGEN_PAGO = 0.05; // céntimos de redondeo
async function errorDePago(groupId, de, para, importeBase) {
  await recalcBalances(groupId);
  const r = await db.query('SELECT display_name, balance FROM group_members WHERE group_id = $1 AND display_name = ANY($2::text[])', [groupId, [de, para]]);
  const saldo = Object.fromEntries(r.rows.map(x => [x.display_name, Number(x.balance) || 0]));
  if (saldo[de] === undefined || saldo[para] === undefined) return 'Participante no encontrado en el grupo';
  if (de === para) return 'Quien paga y quien cobra deben ser personas distintas';
  const debe = -saldo[de], leDeben = saldo[para];
  if (debe < MARGEN_PAGO) return `${de} no tiene deudas pendientes en este grupo. Puede que este pago ya se haya registrado.`;
  if (leDeben < MARGEN_PAGO) return `A ${para} ya no se le debe nada en este grupo. Puede que este pago ya se haya registrado.`;
  const maximo = Math.min(debe, leDeben);
  if (importeBase > maximo + MARGEN_PAGO) {
    return `El pago (${importeBase.toFixed(2)}) es mayor de lo pendiente (${maximo.toFixed(2)}). Puede que parte ya se haya registrado: vuelve a calcular las deudas.`;
  }
  return null;
}

// Un pago (es_pago) solo lo anula o cambia su comprobante quien pagó, quien
// cobró o quien lo registró
async function puedeGestionarPago(groupId, userId, gasto) {
  if (!gasto.es_pago) return true;
  if (Number(gasto.member_id) === Number(userId)) return true;
  const yo = (await db.query('SELECT display_name FROM group_members WHERE group_id = $1 AND user_id = $2', [groupId, userId])).rows[0];
  if (!yo) return false;
  if (yo.display_name === gasto.payer_name) return true;
  const r = await db.query('SELECT 1 FROM expense_splits WHERE expense_id = $1 AND member_name = $2', [gasto.id, yo.display_name]);
  return r.rows.length > 0;
}
const NO_PUEDE_PAGO = 'Solo quien pagó o quien cobró puede anular o cambiar este pago';

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

    const expenses = expensesRes.rows.map(r => conEstado(sinTicket(r)));
    for (const ex of expenses) {
      const splits = await db.query('SELECT * FROM expense_splits WHERE expense_id = $1', [ex.id]);
      ex.splits = splits.rows;
    }
    res.json(expenses);
  } catch (err) { next(err); }
});

// ── POST /groups/:id/expenses ─────────────────────────────────────
router.post('/', requireAuth, async (req, res, next) => {
  let candado = null;
  try {
    const isOwner = await ownsGroup(req.params.id, req.user.id);
    const member = await isMember(req.params.id, req.user.id);
    if (!isOwner && !member) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }

    const { description, amount, currency = 'EUR', category = 'other', payer_name, expense_date, involved } = req.body;
    const ticket = req.body.ticket ?? null;
    // es_pago: liquidación de una deuda (quien debía paga a quien le debían).
    // Ajusta los saldos como un gasto, pero no cuenta en totales ni estadísticas.
    const es_pago = req.body.es_pago === true;
    if (es_pago && involved?.length !== 1) {
      return res.status(400).json({ error: 'Un pago debe tener un único destinatario' });
    }

    if (!description || !amount || !payer_name || !expense_date || !involved?.length) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }
    const errDatos = errorDeDatos(req.body);
    if (errDatos) return res.status(400).json({ error: errDatos });
    if (!ticketValido(ticket)) return res.status(400).json({ error: 'Comprobante no válido o demasiado grande' });

    const amount_base = importeBase(req.body, amount, currency);
    // «Pagar también por…»: quién pagó de verdad esta deuda (solo para la actividad)
    const pagadoPor = es_pago && typeof req.body.pagado_por === 'string' ? req.body.pagado_por.trim().slice(0, 40) : '';

    // Pagos: solo los registra quien paga (el deudor, o quien paga por él con
    // «Pagar también por…») o quien cobra (el acreedor confirma el cobro)
    if (es_pago) {
      const yo = (await db.query('SELECT display_name FROM group_members WHERE group_id = $1 AND user_id = $2', [req.params.id, req.user.id])).rows[0];
      const miNombre = yo && yo.display_name;
      const permitido = miNombre && (pagadoPor
        ? pagadoPor === miNombre
        : (miNombre === payer_name || miNombre === involved[0]));
      if (!permitido) {
        return res.status(403).json({ error: 'Solo quien paga o quien cobra puede registrar este pago' });
      }
    }

    // Pago registrado por alguien que no es quien cobra: queda pendiente de que
    // quien cobra lo confirme (si tiene cuenta; si no, nadie podría confirmarlo)
    let pendiente = false;
    if (es_pago) {
      const cobra = (await db.query('SELECT user_id FROM group_members WHERE group_id = $1 AND display_name = $2', [req.params.id, involved[0]])).rows[0];
      pendiente = !!(cobra && cobra.user_id && Number(cobra.user_id) !== Number(req.user.id));
    }

    // Pagos: se comprueban y registran de uno en uno por grupo (bloqueo en la base de datos)
    if (es_pago) {
      candado = await db.pool.connect();
      await candado.query('SELECT pg_advisory_lock($1)', [Number(req.params.id)]);
      const error = await errorDePago(req.params.id, payer_name, involved[0], Number(amount_base));
      if (error) return res.status(409).json({ error, pago_rechazado: true });
    }

    const expRes = await db.query(`
      INSERT INTO expenses (group_id, description, amount, currency, amount_base, category, payer_name, expense_date, member_id, ticket, es_pago,
                            pago_estado, pago_confirmar_antes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *
    `, [req.params.id, description, amount, currency, amount_base, category, payer_name, expense_date, req.user.id, ticket, es_pago,
        es_pago ? (pendiente ? 'pendiente' : 'confirmado') : null,
        pendiente ? new Date(Date.now() + DIAS_CONFIRMAR * 86400000) : null]);

    const expense = conEstado(sinTicket(expRes.rows[0]));

    for (const { nombre, share } of repartir(amount_base, involved)) {
      await db.query(
        'INSERT INTO expense_splits (expense_id, member_name, share) VALUES ($1, $2, $3)',
        [expense.id, nombre, share]
      );
    }

    await recalcBalances(req.params.id);

    const splits = await db.query('SELECT * FROM expense_splits WHERE expense_id = $1', [expense.id]);
    expense.splits = splits.rows;

    await logGroupActivity(req.params.id, req.user.id, es_pago ? 'payment' : 'expense', (quien, grupo) => es_pago
      ? `${quien} registró un pago: ${pagadoPor ? `${pagadoPor} pagó por ${payer_name}` : `${payer_name} pagó`} ${importe(amount, currency)} a ${involved[0]} en "${grupo}"${ticket ? ' (con comprobante)' : ''}`
        + (pendiente ? `. ${involved[0]}, confírmalo en «Pagos realizados» antes del ${fechaCorta(expense.pago_confirmar_antes)}` : '')
      : `${quien} registró "${description}" · ${importe(amount, currency)} (pagó ${payer_name}) en "${grupo}"`);
    res.status(201).json(expense);
  } catch (err) { next(err); }
  finally {
    if (candado) {
      await candado.query('SELECT pg_advisory_unlock($1)', [Number(req.params.id)]).catch(() => {});
      candado.release();
    }
  }
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
    const existing = await db.query('SELECT * FROM expenses WHERE id = $1 AND group_id = $2', [req.params.expId, req.params.id]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'Gasto no encontrado' });
    // Los pagos no se editan (cambiaría quién debe a quién): se anulan y se registran de nuevo
    if (existing.rows[0].es_pago) return res.status(400).json({ error: 'Los pagos no se editan: anúlalo y vuelve a registrarlo' });
    // Guardamos cómo era el gasto antes de editarlo, para el historial
    const antes = existing.rows[0];
    const antesSplits = await db.query('SELECT member_name FROM expense_splits WHERE expense_id = $1', [req.params.expId]);
    antes.involved = antesSplits.rows.map(s => s.member_name);

    const { description, amount, currency = 'EUR', category = 'other', payer_name, expense_date, involved } = req.body;
    if (!description || !amount || !payer_name || !expense_date || !involved?.length) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }
    const errDatos = errorDeDatos(req.body);
    if (errDatos) return res.status(400).json({ error: errDatos });
    // ticket: si no viene, se conserva el que hubiera; null lo elimina; una imagen lo sustituye
    const cambiaTicket = req.body.ticket !== undefined;
    if (cambiaTicket && !ticketValido(req.body.ticket)) {
      return res.status(400).json({ error: 'Comprobante no válido o demasiado grande' });
    }

    const amount_base = importeBase(req.body, amount, currency);

    await db.query(`
      UPDATE expenses 
      SET description=$1, amount=$2, currency=$3, amount_base=$4, category=$5, payer_name=$6, expense_date=$7
      WHERE id=$8 AND group_id=$9
    `, [description, amount, currency, amount_base, category, payer_name, expense_date, req.params.expId, req.params.id]);
    if (cambiaTicket) {
      await db.query('UPDATE expenses SET ticket = $1 WHERE id = $2', [req.body.ticket, req.params.expId]);
    }

    await db.query('DELETE FROM expense_splits WHERE expense_id = $1', [req.params.expId]);
    for (const { nombre, share } of repartir(amount_base, involved)) {
      await db.query(
        'INSERT INTO expense_splits (expense_id, member_name, share) VALUES ($1, $2, $3)',
        [req.params.expId, nombre, share]
      );
    }

    await recalcBalances(req.params.id);

    const expRes = await db.query('SELECT * FROM expenses WHERE id = $1', [req.params.expId]);
    const expense = sinTicket(expRes.rows[0]);
    const splits  = await db.query('SELECT * FROM expense_splits WHERE expense_id = $1', [expense.id]);
    expense.splits = splits.rows;

    const cambios = describirCambios(antes, { description, amount, currency, category, payer_name, expense_date, involved });
    if (cambiaTicket && (req.body.ticket || null) !== (antes.ticket || null)) {
      cambios.push(!req.body.ticket ? 'comprobante eliminado' : (antes.ticket ? 'comprobante cambiado' : 'comprobante adjuntado'));
    }
    if (cambios.length) {
      await logGroupActivity(req.params.id, req.user.id, 'expense', (quien, grupo) =>
        `${quien} editó "${antes.description}" en "${grupo}": ${cambios.join('; ')}`);
    }
    res.json(expense);
  } catch (err) { next(err); }
});

// ── PUT /groups/:id/expenses/:expId/ticket ───────────────────────
// Adjunta, cambia o elimina (ticket: null) el comprobante sin tocar el resto del gasto
router.put('/:expId/ticket', requireAuth, async (req, res, next) => {
  try {
    const isOwner = await ownsGroup(req.params.id, req.user.id);
    const member = await isMember(req.params.id, req.user.id);
    if (!isOwner && !member) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }
    const ticket = req.body.ticket ?? null;
    if (!ticketValido(ticket)) return res.status(400).json({ error: 'Comprobante no válido o demasiado grande' });

    const expRes = await db.query('SELECT id, description, ticket, es_pago, payer_name, member_id FROM expenses WHERE id = $1 AND group_id = $2', [req.params.expId, req.params.id]);
    const gasto = expRes.rows[0];
    if (!gasto) return res.status(404).json({ error: 'Gasto no encontrado' });
    if (!await puedeGestionarPago(req.params.id, req.user.id, gasto)) return res.status(403).json({ error: NO_PUEDE_PAGO });

    await db.query('UPDATE expenses SET ticket = $1 WHERE id = $2', [ticket, gasto.id]);
    const accion = !ticket ? 'eliminó el comprobante de' : (gasto.ticket ? 'cambió el comprobante de' : 'adjuntó un comprobante a');
    await logGroupActivity(req.params.id, req.user.id, 'expense', (quien, grupo) =>
      `${quien} ${accion} "${gasto.description}" en "${grupo}"`);
    res.json({ ok: true, has_ticket: !!ticket });
  } catch (err) { next(err); }
});

// ── POST /groups/:id/expenses/:expId/confirmar ───────────────────
// Quien cobra confirma un pago pendiente. body.importe (opcional): lo que
// recibió de verdad si fue menos; el pago queda por ese importe y el resto
// sigue como deuda.
router.post('/:expId/confirmar', requireAuth, async (req, res, next) => {
  try {
    const gasto = (await db.query('SELECT * FROM expenses WHERE id = $1 AND group_id = $2', [req.params.expId, req.params.id])).rows[0];
    if (!gasto || !gasto.es_pago) return res.status(404).json({ error: 'Pago no encontrado' });
    const para = (await db.query('SELECT member_name FROM expense_splits WHERE expense_id = $1 LIMIT 1', [gasto.id])).rows[0]?.member_name;
    const yo = (await db.query('SELECT display_name FROM group_members WHERE group_id = $1 AND user_id = $2', [req.params.id, req.user.id])).rows[0];
    if (!yo || yo.display_name !== para) return res.status(403).json({ error: 'Solo quien cobra puede confirmar este pago' });
    if (!porConfirmar(gasto)) return res.status(409).json({ error: 'Este pago ya está confirmado' });

    const total = Number(gasto.amount_base);
    let recibido = total;
    if (req.body.importe !== undefined && req.body.importe !== null && req.body.importe !== '') {
      recibido = Math.round(Number(req.body.importe) * 100) / 100;
      if (!Number.isFinite(recibido) || recibido <= 0) return res.status(400).json({ error: 'Escribe un importe mayor que cero. Si no recibiste nada, rechaza el pago.' });
      if (recibido > total + 0.001) return res.status(400).json({ error: `El importe no puede ser mayor que el pago registrado (${total.toFixed(2)})` });
    }
    const parcial = recibido < total - 0.001;
    // Importe en la divisa original, en proporción
    const nuevoAmount = parcial ? Math.round(Number(gasto.amount) * (recibido / total) * 100) / 100 : Number(gasto.amount);
    const r = await db.query(`
      UPDATE expenses SET pago_estado = 'confirmado', amount = $1, amount_base = $2
      WHERE id = $3 AND pago_estado = 'pendiente' RETURNING id`, [nuevoAmount, recibido, gasto.id]);
    if (!r.rows[0]) return res.status(409).json({ error: 'Este pago ya está confirmado' });
    if (parcial) {
      await db.query('UPDATE expense_splits SET share = $1 WHERE expense_id = $2', [recibido, gasto.id]);
      await recalcBalances(req.params.id);
    }
    await logGroupActivity(req.params.id, req.user.id, 'payment', (quien, grupo) => parcial
      ? `${quien} confirmó que recibió ${importe(nuevoAmount, gasto.currency)} de ${gasto.payer_name} (registró ${importe(gasto.amount, gasto.currency)}) en "${grupo}". ${gasto.payer_name} sigue debiendo ${importe(Number(gasto.amount) - nuevoAmount, gasto.currency)}`
      : `${quien} confirmó el pago de ${gasto.payer_name} (${importe(gasto.amount, gasto.currency)}) en "${grupo}"`);
    res.json({ ok: true, importe: recibido, parcial });
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
    const expRes = await db.query('SELECT * FROM expenses WHERE id = $1 AND group_id = $2', [req.params.expId, req.params.id]);
    const borrado = expRes.rows[0];
    const rechazo = borrado && porConfirmar(borrado);
    const textoBorrado = borrado && borrado.es_pago
      ? (quien, grupo) => `${quien} ${rechazo ? 'rechazó' : 'anuló'} el pago de ${borrado.payer_name} (${importe(borrado.amount, borrado.currency)}) en "${grupo}"`
          + (rechazo ? `. La deuda vuelve a «Cuentas finales»` : '')
      : (quien, grupo) => `${quien} eliminó "${borrado.description}" · ${importe(borrado.amount, borrado.currency)} en "${grupo}"`;
    if (!borrado) return res.status(404).json({ error: 'Gasto no encontrado' });
    if (!await puedeGestionarPago(req.params.id, req.user.id, borrado)) return res.status(403).json({ error: NO_PUEDE_PAGO });

    await db.query('DELETE FROM expenses WHERE id = $1', [req.params.expId]);
    await recalcBalances(req.params.id);
    await logGroupActivity(req.params.id, req.user.id, borrado.es_pago ? 'payment' : 'expense', textoBorrado);
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
module.exports.recalcBalances = recalcBalances;
