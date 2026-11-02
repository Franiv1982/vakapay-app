// src/utils/pagos.js — Pagos pendientes de confirmar
// ================================================================
// Cuando quien paga registra un pago, quien cobra tiene DIAS_CONFIRMAR días
// para confirmarlo, indicar que recibió otro importe o rechazarlo.
// Mientras tanto el pago cuenta en los saldos, pero quien pagó no puede salir
// del grupo, borrar su cuenta ni ser eliminado: así no se va dejando una deuda
// si el pago no era real o era menor. Pasado el plazo, se da por confirmado
// (no hace falta ningún proceso: se mira la fecha límite).
// ================================================================
const db = require('../db/database');

const DIAS_CONFIRMAR = 5;

// Pagos de `nombre` (como deudor) aún sin confirmar en el grupo
async function pagosSinConfirmar(groupId, nombre, cliente = db) {
  const r = await cliente.query(`
    SELECT e.id, e.amount_base, e.pago_confirmar_antes AS hasta,
           (SELECT s.member_name FROM expense_splits s WHERE s.expense_id = e.id LIMIT 1) AS para
    FROM expenses e
    WHERE e.group_id = $1 AND e.es_pago AND e.payer_name = $2
      AND e.pago_estado = 'pendiente' AND e.pago_confirmar_antes > NOW()
    ORDER BY e.pago_confirmar_antes`, [groupId, nombre]);
  return r.rows.map(x => ({ id: x.id, importe: Number(x.amount_base) || 0, para: x.para, hasta: x.hasta }));
}

// dd/mm en hora de España (la misma que verán los usuarios en el móvil)
const fechaCorta = d => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'numeric' })
    .formatToParts(new Date(d)).map(x => [x.type, x.value]));
  return `${String(p.day).padStart(2, '0')}/${String(p.month).padStart(2, '0')}`;
};

// "Tu pago de 20.00 a Ana está pendiente..." / "El pago de Luis de 20.00 a Ana..."
function textoPagoPendiente(p, { quien = null, accion = 'salir del grupo' } = {}) {
  const imp = p.importe.toFixed(2);
  return quien
    ? `El pago de ${quien} de ${imp} a ${p.para} está pendiente de que ${p.para} lo confirme. Podrás eliminarlo cuando lo confirme, o el ${fechaCorta(p.hasta)} si no responde.`
    : `Tu pago de ${imp} a ${p.para} está pendiente de que lo confirme. Podrás ${accion} cuando lo confirme, o el ${fechaCorta(p.hasta)} si no responde.`;
}

// Para las respuestas a la app: ¿este pago espera confirmación?
const porConfirmar = e => !!(e && e.es_pago && e.pago_estado === 'pendiente' && e.pago_confirmar_antes && new Date(e.pago_confirmar_antes) > new Date());

module.exports = { DIAS_CONFIRMAR, pagosSinConfirmar, textoPagoPendiente, porConfirmar, fechaCorta };
