// src/utils/push.js — Notificaciones push en la APK (#68), con Firebase Cloud Messaging
// ================================================================
// Necesita en Vercel la variable FIREBASE_SERVICE_ACCOUNT (el contenido entero del
// .json de «Cuentas de servicio» de Firebase). Sin ella no se envía nada y la app
// funciona igual.
//
// Tipos de aviso (cada usuario puede desactivarlos en Cuenta):
//   pagos     te registraron un pago que tienes que confirmar
//   rechazos  rechazaron un pago tuyo o lo confirmaron con otro importe
//   gastos    nuevo gasto en un grupo tuyo
//   chat      mensajes del chat (uno por grupo, que se va actualizando)
//
// Los avisos se envían sin hacer esperar a quien hizo la acción.
// ================================================================
const db = require('../db/database');

const TIPOS = ['pagos', 'rechazos', 'gastos', 'chat'];
const CANAL = { pagos: 'avisos', rechazos: 'avisos', gastos: 'avisos', chat: 'chat' };   // canales de Android
const MAX_CUERPO = 160;

// En las pruebas automáticas no se habla con Firebase: se guarda lo que se habría enviado
const PRUEBAS = process.env.NODE_ENV === 'test';
const enviadosEnPruebas = [];

let _mensajeria;   // undefined: sin preparar · null: sin configurar
function mensajeria() {
  if (_mensajeria !== undefined) return _mensajeria;
  const cfg = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!cfg) return (_mensajeria = null);
  try {
    const admin = require('firebase-admin');
    const app = admin.apps.length ? admin.app() : admin.initializeApp({ credential: admin.credential.cert(JSON.parse(cfg)) });
    _mensajeria = admin.messaging(app);
  } catch (e) {
    console.error('❌ Firebase: FIREBASE_SERVICE_ACCOUNT no es válida:', e.message);
    _mensajeria = null;
  }
  return _mensajeria;
}

// En Vercel, waitUntil deja terminar el envío después de responder a la app
let waitUntil = null;
try { ({ waitUntil } = require('@vercel/functions')); } catch (_) { /* fuera de Vercel no hace falta */ }

const recortar = (t) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > MAX_CUERPO ? t.slice(0, MAX_CUERPO - 1) + '…' : t; };

async function enviar(userIds, tipo, { titulo, cuerpo, datos = {}, etiqueta = null }) {
  if (!TIPOS.includes(tipo)) throw new Error(`Tipo de aviso desconocido: ${tipo}`);
  const ids = [...new Set(userIds.filter(Boolean).map(Number))];
  if (!ids.length) return;
  const r = await db.query(`
    SELECT d.token, d.user_id FROM dispositivos d JOIN users u ON u.id = d.user_id
    WHERE d.user_id = ANY($1::int[]) AND COALESCE((u.avisos ->> $2)::boolean, true)`, [ids, tipo]);
  if (!r.rows.length) return;

  const data = { tipo };
  for (const [k, v] of Object.entries(datos)) if (v != null) data[k] = String(v);
  const mensaje = {
    notification: { title: recortar(titulo), body: recortar(cuerpo) },
    data,
    android: {
      priority: 'high',
      notification: {
        channelId: CANAL[tipo],
        icon: 'ic_stat_vakapay',
        color: '#F5C800',
        ...(etiqueta ? { tag: etiqueta } : {}),   // misma etiqueta = sustituye al aviso anterior
      },
    },
  };

  if (PRUEBAS) { for (const x of r.rows) enviadosEnPruebas.push({ user_id: x.user_id, ...mensaje }); return; }
  const m = mensajeria();
  if (!m) return;
  const tokens = r.rows.map(x => x.token);
  const res = await m.sendEachForMulticast({ tokens, ...mensaje });
  // Móviles que ya no existen (app desinstalada, sesión cerrada…): se olvidan
  const caducados = [];
  res.responses.forEach((x, i) => {
    const c = x.error && x.error.code;
    if (c === 'messaging/registration-token-not-registered' || c === 'messaging/invalid-registration-token') caducados.push(tokens[i]);
  });
  if (caducados.length) await db.query('DELETE FROM dispositivos WHERE token = ANY($1::text[])', [caducados]);
}

// Prepara y envía avisos sin hacer esperar a la respuesta; un fallo (base de datos,
// Firebase…) nunca rompe la acción del usuario. Uso: enSegundoPlano(async () => { … enviar(…) })
function enSegundoPlano(fn) {
  const p = Promise.resolve().then(fn).catch(e => console.error('❌ Aviso push:', e.message));
  if (waitUntil) { try { waitUntil(p); } catch (_) { /* fuera de una petición de Vercel */ } }
  return p;
}

// Usuarios con cuenta de un grupo (menos quien hizo la acción)
async function usuariosDelGrupo(groupId, salvo) {
  const r = await db.query(`
    SELECT DISTINCT user_id FROM group_members WHERE group_id = $1 AND user_id IS NOT NULL AND user_id <> $2`, [groupId, Number(salvo) || 0]);
  return r.rows.map(x => x.user_id);
}
async function usuarioDeMiembro(groupId, nombre) {
  const r = await db.query('SELECT user_id FROM group_members WHERE group_id = $1 AND display_name = $2', [groupId, nombre]);
  return r.rows[0] ? r.rows[0].user_id : null;
}
async function nombreEnGrupo(groupId, userId) {
  const r = await db.query('SELECT display_name FROM group_members WHERE group_id = $1 AND user_id = $2', [groupId, userId]);
  return r.rows[0] ? r.rows[0].display_name : 'Alguien';
}
async function nombreGrupo(groupId) {
  const r = await db.query('SELECT name FROM groups WHERE id = $1', [groupId]);
  return r.rows[0] ? r.rows[0].name : 'tu grupo';
}

module.exports = { TIPOS, enviar, enSegundoPlano, usuariosDelGrupo, usuarioDeMiembro, nombreEnGrupo, nombreGrupo, enviadosEnPruebas, PRUEBAS };
