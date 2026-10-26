// src/routes/chat.js — Chat de cada grupo
// ================================================================
// Montado en /api/v1/groups/:id/chat. Solo para participantes con cuenta.
// La app consulta cada pocos segundos mientras el chat está abierto.
// ================================================================
const express = require('express');
const db      = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

const EMOJIS = ['👍', '❤️', '😂', '😮', '🙏', '💸'];
const MAX_TEXTO = 1000;
const LIMITE = 150; // últimos mensajes que se envían a la app
const MAX_IMAGEN = 2 * 1024 * 1024; // ~1,5 MB; la app reduce la foto antes de enviarla

// Fotos: data:image/... en texto. GIF: solo URLs https de GIPHY.
const imagenValida = t => typeof t === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(t) && t.length <= MAX_IMAGEN;
function gifValido(u) {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' && (x.hostname === 'giphy.com' || x.hostname.endsWith('.giphy.com')) && u.length <= 500;
  } catch (_) { return false; }
}
// Texto que se ve en una cita o en la barra de "respondiendo"
const resumenMensaje = (texto, tieneImagen, gif) =>
  String(texto || '').slice(0, 140) || (tieneImagen ? '📷 Foto' : gif ? 'GIF' : '');

// Devuelve el nombre del usuario dentro del grupo, o null si no es participante
async function miembro(groupId, userId) {
  const r = await db.query('SELECT display_name FROM group_members WHERE group_id = $1 AND user_id = $2', [groupId, userId]);
  return r.rows[0] ? r.rows[0].display_name : null;
}

// ── GET /groups/:id/chat — últimos mensajes con sus reacciones ─────
router.get('/', requireAuth, async (req, res, next) => {
  try {
    if (!await miembro(req.params.id, req.user.id)) return res.status(404).json({ error: 'Grupo no encontrado' });
    const m = await db.query(`
      SELECT t.*, o.autor AS r_autor, o.texto AS r_texto, o.tipo AS r_tipo, o.borrado AS r_borrado,
             (o.imagen IS NOT NULL) AS r_imagen, o.gif AS r_gif
      FROM (
        SELECT id, user_id, autor, texto, tipo, borrado, created_at, respuesta_a,
               (imagen IS NOT NULL) AS tiene_imagen, gif
        FROM mensajes WHERE group_id = $1 ORDER BY id DESC LIMIT $2
      ) t
      LEFT JOIN mensajes o ON o.id = t.respuesta_a
      ORDER BY t.id ASC
    `, [req.params.id, LIMITE]);
    const ids = m.rows.map(x => x.id);
    const reacc = ids.length ? (await db.query(`
      SELECT r.mensaje_id, r.emoji, r.user_id,
             COALESCE(gm.display_name, u.nombre, 'Alguien') AS nombre
      FROM reacciones r
      JOIN mensajes ms ON ms.id = r.mensaje_id
      LEFT JOIN group_members gm ON gm.group_id = ms.group_id AND gm.user_id = r.user_id
      LEFT JOIN users u ON u.id = r.user_id
      WHERE r.mensaje_id = ANY($1::int[])
      ORDER BY r.created_at
    `, [ids])).rows : [];
    const lect = await db.query('SELECT ultimo_leido FROM chat_lecturas WHERE group_id = $1 AND user_id = $2', [req.params.id, req.user.id]);

    const porMensaje = {};
    for (const r of reacc) {
      const x = (porMensaje[r.mensaje_id] ||= { reacciones: {}, mia: null });
      (x.reacciones[r.emoji] ||= []).push(r.nombre);
      if (r.user_id === req.user.id) x.mia = r.emoji;
    }
    res.json({
      ultimo_leido: lect.rows[0] ? lect.rows[0].ultimo_leido : 0,
      mensajes: m.rows.map(x => ({
        id: x.id,
        autor: x.autor,
        texto: x.borrado ? '' : x.texto,
        tipo: x.tipo,
        borrado: x.borrado,
        // La foto no va en el listado (se pide aparte y la app la guarda en memoria)
        imagen: !x.borrado && x.tiene_imagen,
        gif: x.borrado ? null : (x.gif || null),
        mio: x.user_id === req.user.id,
        created_at: x.created_at,
        reacciones: x.borrado ? {} : (porMensaje[x.id]?.reacciones || {}),
        // Mensaje al que responde (cita corta)
        respuesta: (!x.borrado && x.respuesta_a) ? {
          id: x.respuesta_a,
          autor: x.r_tipo === 'sistema' ? 'VakaPay' : (x.r_autor || 'Alguien'),
          texto: x.r_borrado ? 'Mensaje eliminado' : resumenMensaje(x.r_texto, x.r_imagen, x.r_gif),
          imagen: !x.r_borrado && x.r_imagen,
          borrado: !!x.r_borrado,
        } : null,
        mi_reaccion: x.borrado ? null : (porMensaje[x.id]?.mia || null),
      })),
    });
  } catch (err) { next(err); }
});

// ── POST /groups/:id/chat — enviar mensaje ─────────────────────────
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const autor = await miembro(req.params.id, req.user.id);
    if (!autor) return res.status(404).json({ error: 'Grupo no encontrado' });
    const texto = String(req.body.texto || '').trim();
    const imagen = req.body.imagen || null;
    const gif = req.body.gif || null;
    if (imagen && gif) return res.status(400).json({ error: 'Envía la foto y el GIF por separado' });
    if (imagen && !imagenValida(imagen)) return res.status(400).json({ error: 'La foto no es válida o es demasiado grande' });
    if (gif && !gifValido(gif)) return res.status(400).json({ error: 'GIF no válido' });
    if (gif && texto) return res.status(400).json({ error: 'Un GIF no lleva texto' });
    if (!texto && !imagen && !gif) return res.status(400).json({ error: 'El mensaje está vacío' });
    if (texto.length > MAX_TEXTO) return res.status(400).json({ error: `Máximo ${MAX_TEXTO} caracteres` });
    // Respuesta a otro mensaje del mismo grupo (opcional)
    let respuestaA = null;
    if (req.body.respuesta_a) {
      const o = await db.query('SELECT id FROM mensajes WHERE id = $1 AND group_id = $2', [req.body.respuesta_a, req.params.id]);
      if (!o.rows[0]) return res.status(400).json({ error: 'El mensaje al que respondes ya no existe' });
      respuestaA = o.rows[0].id;
    }
    const r = await db.query(
      'INSERT INTO mensajes (group_id, user_id, autor, texto, respuesta_a, imagen, gif) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, created_at',
      [req.params.id, req.user.id, autor, texto, respuestaA, imagen, gif]
    );
    await marcarLeido(req.params.id, req.user.id, r.rows[0].id);
    res.status(201).json({ id: r.rows[0].id, created_at: r.rows[0].created_at });
  } catch (err) { next(err); }
});

// ── GET /groups/:id/chat/gif-config — clave de GIPHY para buscar GIF ─
// GIPHY exige que las búsquedas salgan del móvil de cada usuario, así que la
// app necesita la clave. Se guarda en Vercel (GIPHY_API_KEY); sin ella, no hay GIF.
router.get('/gif-config', requireAuth, async (req, res, next) => {
  try {
    if (!await miembro(req.params.id, req.user.id)) return res.status(404).json({ error: 'Grupo no encontrado' });
    const clave = process.env.GIPHY_API_KEY || '';
    res.json({ disponible: !!clave, proveedor: 'giphy', clave });
  } catch (err) { next(err); }
});

// ── GET /groups/:id/chat/:msgId/imagen — la foto de un mensaje ─────
router.get('/:msgId/imagen', requireAuth, async (req, res, next) => {
  try {
    if (!await miembro(req.params.id, req.user.id)) return res.status(404).json({ error: 'Grupo no encontrado' });
    const r = await db.query(
      'SELECT imagen FROM mensajes WHERE id = $1 AND group_id = $2 AND NOT borrado AND imagen IS NOT NULL',
      [req.params.msgId, req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Foto no encontrada' });
    res.set('Cache-Control', 'private, max-age=86400');
    res.json({ imagen: r.rows[0].imagen });
  } catch (err) { next(err); }
});

// ── DELETE /groups/:id/chat/:msgId — borrar un mensaje propio ──────
router.delete('/:msgId', requireAuth, async (req, res, next) => {
  try {
    const r = await db.query(
      `UPDATE mensajes SET borrado = TRUE, texto = '', imagen = NULL, gif = NULL
       WHERE id = $1 AND group_id = $2 AND user_id = $3 AND tipo = 'usuario' RETURNING id`,
      [req.params.msgId, req.params.id, req.user.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Mensaje no encontrado' });
    await db.query('DELETE FROM reacciones WHERE mensaje_id = $1', [req.params.msgId]);
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── PUT /groups/:id/chat/:msgId/reaccion — reaccionar ──────────────
// Una reacción por persona y mensaje: el mismo emoji la quita, otro la cambia.
router.put('/:msgId/reaccion', requireAuth, async (req, res, next) => {
  try {
    if (!await miembro(req.params.id, req.user.id)) return res.status(404).json({ error: 'Grupo no encontrado' });
    const { emoji } = req.body;
    if (!EMOJIS.includes(emoji)) return res.status(400).json({ error: 'Reacción no válida' });
    const msg = await db.query('SELECT id FROM mensajes WHERE id = $1 AND group_id = $2 AND NOT borrado', [req.params.msgId, req.params.id]);
    if (!msg.rows[0]) return res.status(404).json({ error: 'Mensaje no encontrado' });
    const actual = await db.query('SELECT emoji FROM reacciones WHERE mensaje_id = $1 AND user_id = $2', [req.params.msgId, req.user.id]);
    if (actual.rows[0] && actual.rows[0].emoji === emoji) {
      await db.query('DELETE FROM reacciones WHERE mensaje_id = $1 AND user_id = $2', [req.params.msgId, req.user.id]);
      return res.json({ mi_reaccion: null });
    }
    await db.query(`
      INSERT INTO reacciones (mensaje_id, user_id, emoji) VALUES ($1, $2, $3)
      ON CONFLICT (mensaje_id, user_id) DO UPDATE SET emoji = EXCLUDED.emoji, created_at = NOW()
    `, [req.params.msgId, req.user.id, emoji]);
    res.json({ mi_reaccion: emoji });
  } catch (err) { next(err); }
});

// ── POST /groups/:id/chat/leido — marcar como leído hasta un mensaje ─
async function marcarLeido(groupId, userId, ultimo) {
  await db.query(`
    INSERT INTO chat_lecturas (group_id, user_id, ultimo_leido) VALUES ($1, $2, $3)
    ON CONFLICT (group_id, user_id) DO UPDATE SET ultimo_leido = GREATEST(chat_lecturas.ultimo_leido, EXCLUDED.ultimo_leido)
  `, [groupId, userId, ultimo]);
}
router.post('/leido', requireAuth, async (req, res, next) => {
  try {
    if (!await miembro(req.params.id, req.user.id)) return res.status(404).json({ error: 'Grupo no encontrado' });
    const ultimo = parseInt(req.body.ultimo, 10);
    if (!Number.isFinite(ultimo) || ultimo < 0) return res.status(400).json({ error: 'ultimo no válido' });
    await marcarLeido(req.params.id, req.user.id, ultimo);
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
