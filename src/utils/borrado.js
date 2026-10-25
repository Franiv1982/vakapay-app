// src/utils/borrado.js — Borrar datos / eliminar cuenta
// ================================================================
// Reglas (VakaPay: "divide gastos, no amistades"):
//  · Si tienes saldo pendiente en un grupo COMPARTIDO (con otra persona
//    que tiene cuenta), no puedes borrar tus datos ni tu cuenta hasta
//    saldarlo: nadie se va dejando una deuda.
//  · Grupos donde eres el único con cuenta → se borran con sus gastos.
//  · Grupos compartidos con saldo 0 → sales del grupo; tus gastos pasados
//    quedan con tu nombre para que el historial de los demás siga cuadrando.
//  · Amigos y actividad → se borran.
// Todo se hace en una transacción: o se completa entero o no cambia nada.
// ================================================================
const db = require('../db/database');

// Tus grupos, tu saldo en cada uno y si hay más personas con cuenta
async function analizarGrupos(userId, cliente = db) {
  const r = await cliente.query(`
    SELECT g.id, g.name, gm.balance,
      EXISTS (
        SELECT 1 FROM group_members o
        WHERE o.group_id = g.id AND o.user_id IS NOT NULL AND o.user_id <> $1
      ) AS compartido
    FROM groups g
    JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = $1
    ORDER BY g.name
  `, [userId]);
  return r.rows.map(x => ({ id: x.id, name: x.name, balance: Number(x.balance) || 0, compartido: x.compartido }));
}

function resumen(grupos) {
  const pendientes = grupos
    .filter(g => g.compartido && Math.abs(g.balance) > 0.005)
    .map(g => ({ id: g.id, name: g.name, balance: +g.balance.toFixed(2) }));
  return {
    pendientes,                                                       // bloquean el borrado
    grupos_a_borrar: grupos.filter(g => !g.compartido).map(g => g.name), // solo tuyos
    grupos_a_salir:  grupos.filter(g => g.compartido).map(g => g.name),  // compartidos
  };
}

// Vista previa para la app (qué pasará si confirmas)
async function previsualizar(userId) {
  return resumen(await analizarGrupos(userId));
}

// Ejecuta el borrado. Con { eliminarCuenta: true } también borra el usuario.
// Devuelve { pendientes } si hay saldos que impiden continuar.
async function borrarDatosUsuario(userId, { eliminarCuenta = false } = {}) {
  const cliente = await db.pool.connect();
  try {
    await cliente.query('BEGIN');
    const grupos = await analizarGrupos(userId, cliente);
    const plan = resumen(grupos);
    if (plan.pendientes.length) {
      await cliente.query('ROLLBACK');
      return { pendientes: plan.pendientes };
    }

    const u = await cliente.query('SELECT nombre FROM users WHERE id = $1', [userId]);
    const nombre = (u.rows[0] && u.rows[0].nombre) || 'Un participante';

    for (const g of grupos) {
      if (!g.compartido) {
        // Solo tuyo: se borra el grupo con sus gastos, participantes y enlaces
        await cliente.query('DELETE FROM groups WHERE id = $1', [g.id]);
        continue;
      }
      // Compartido y con saldo 0: avisar al resto y salir del grupo
      const msg = eliminarCuenta
        ? `${nombre} eliminó su cuenta y salió del grupo "${g.name}" (sin saldos pendientes)`
        : `${nombre} salió del grupo "${g.name}" (sin saldos pendientes)`;
      await cliente.query(`
        INSERT INTO activity_log (user_id, type, message, group_name)
        SELECT user_id, 'member', $1, $2 FROM group_members
        WHERE group_id = $3 AND user_id IS NOT NULL AND user_id <> $4
      `, [msg, g.name, g.id, userId]);
      await cliente.query("INSERT INTO mensajes (group_id, texto, tipo) VALUES ($1, $2, 'sistema')",
        [g.id, eliminarCuenta ? `👋 ${nombre} eliminó su cuenta y salió del grupo` : `👋 ${nombre} salió del grupo`]);
      await cliente.query('DELETE FROM group_members WHERE group_id = $1 AND user_id = $2', [g.id, userId]);
      // Si eras el creador, el grupo pasa al siguiente participante con cuenta
      await cliente.query(`
        UPDATE groups SET owner_id = (
          SELECT user_id FROM group_members
          WHERE group_id = $1 AND user_id IS NOT NULL ORDER BY joined_at LIMIT 1
        ) WHERE id = $1 AND owner_id = $2
      `, [g.id, userId]);
    }

    // Restos de versiones anteriores: grupos tuyos que ya no tienen a nadie con cuenta
    await cliente.query(`
      DELETE FROM groups g WHERE g.owner_id = $1
        AND NOT EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = g.id AND m.user_id IS NOT NULL)
    `, [userId]);

    await cliente.query('DELETE FROM friends WHERE owner_id = $1', [userId]);
    await cliente.query('DELETE FROM activity_log WHERE user_id = $1', [userId]);
    if (eliminarCuenta) await cliente.query('DELETE FROM users WHERE id = $1', [userId]);

    await cliente.query('COMMIT');
    return {
      ok: true,
      grupos_borrados: plan.grupos_a_borrar.length,
      grupos_abandonados: plan.grupos_a_salir.length,
    };
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

module.exports = { previsualizar, borrarDatosUsuario };
