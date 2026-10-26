 // src/routes/invite.js
const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { logActivity, mensajeSistema } = require('../utils/activity');
const { sincronizarAmigosGrupo } = require('../utils/contactos');

const router = express.Router();

const normNombre = n => String(n || '').trim().replace(/\s+/g, ' ').toLowerCase();

async function grupoDelEnlace(token) {
  const row = await db.query('SELECT group_id FROM share_tokens WHERE token = $1', [token]);
  if (!row.rows[0]) return null;
  const g = await db.query('SELECT * FROM groups WHERE id = $1', [row.rows[0].group_id]);
  return g.rows[0] || null;
}

// ── GET /invite/:token — información para unirse ───────────────────
// Dice si ya eres miembro y qué participantes del grupo aún no tienen
// cuenta, para que la app pregunte "¿Quién eres en este grupo?".
router.get('/:token', requireAuth, async (req, res, next) => {
  try {
    const grupo = await grupoDelEnlace(req.params.token);
    if (!grupo) return res.status(404).json({ error: 'Enlace no válido o expirado' });
    const miembros = await db.query('SELECT display_name, user_id FROM group_members WHERE group_id = $1 ORDER BY joined_at', [grupo.id]);
    const yo = miembros.rows.find(m => m.user_id === req.user.id);
    const u = await db.query('SELECT nombre FROM users WHERE id = $1', [req.user.id]);
    res.json({
      group: { id: grupo.id, name: grupo.name, type: grupo.type },
      ya_miembro: !!yo,
      mi_nombre: yo ? yo.display_name : null,
      tu_nombre: (u.rows[0] && u.rows[0].nombre) || '',
      sin_cuenta: miembros.rows.filter(m => !m.user_id).map(m => m.display_name),
    });
  } catch (err) { next(err); }
});

// ── POST /invite/:token/join ────────────────────────────────────────
// body.reclamar: nombre de un participante sin cuenta que eres tú → se le
//   asigna tu cuenta y conserva todos sus gastos y saldos.
// body.display_name: si entras como participante nuevo.
router.post('/:token/join', requireAuth, async (req, res, next) => {
  try {
    const grupo = await grupoDelEnlace(req.params.token);
    if (!grupo) return res.status(404).json({ error: 'Enlace no válido o expirado' });
    const groupId = grupo.id;

    const newUserRes = await db.query('SELECT id, nombre, email, tel FROM users WHERE id = $1', [req.user.id]);
    const newUser = newUserRes.rows[0];
    const miembros = (await db.query('SELECT id, display_name, user_id FROM group_members WHERE group_id = $1', [groupId])).rows;

    // 1. ¿Ya eres miembro? Se comprueba por tu cuenta, no por el nombre
    const yo = miembros.find(m => m.user_id === req.user.id);
    if (yo) return res.json({ already_member: true, group: grupo, display_name: yo.display_name });

    let displayName;
    if (req.body.reclamar) {
      // 2. Reclamar un participante sin cuenta
      const sinCuenta = miembros.find(m => !m.user_id && m.display_name === req.body.reclamar);
      if (!sinCuenta) return res.status(409).json({ error: 'Ese participante ya no está disponible. Elige otro o entra como nuevo.' });
      await db.query('UPDATE group_members SET user_id = $1 WHERE id = $2 AND user_id IS NULL', [req.user.id, sinCuenta.id]);
      displayName = sinCuenta.display_name;
    } else {
      // 3. Participante nuevo. Si su nombre coincide con alguien sin cuenta, se pregunta antes
      const deseado = String(req.body.display_name || newUser?.nombre || req.user.email.split('@')[0]).trim().slice(0, 40);
      const coincide = miembros.find(m => !m.user_id && normNombre(m.display_name) === normNombre(deseado));
      if (coincide && !req.body.confirmar_nuevo) {
        return res.status(409).json({
          error: `En el grupo ya hay un participante llamado "${coincide.display_name}". ¿Eres tú?`,
          conflicto: true, sugerido: coincide.display_name,
          sin_cuenta: miembros.filter(m => !m.user_id).map(m => m.display_name),
        });
      }
      // Nombre único dentro del grupo: "Luis", "Luis (2)", ...
      const usados = new Set(miembros.map(m => normNombre(m.display_name)));
      displayName = deseado;
      for (let n = 2; usados.has(normNombre(displayName)); n++) displayName = `${deseado} (${n})`;
      await db.query('INSERT INTO group_members (group_id, user_id, display_name) VALUES ($1, $2, $3)', [groupId, req.user.id, displayName]);
    }

    // El nuevo tiene en Amigos a todo el grupo, y quienes tienen cuenta le tienen a él
    await sincronizarAmigosGrupo(groupId);

    logActivity(req.user.id, 'member', `Te uniste al grupo "${grupo.name}"`);
    await mensajeSistema(groupId, req.body.reclamar
      ? `👋 ${displayName} se unió al grupo con su cuenta`
      : `👋 ${displayName} se unió al grupo`);
    res.status(201).json({ joined: true, group: grupo, display_name: displayName, reclamado: !!req.body.reclamar });
  } catch (err) { next(err); }
});

module.exports = router;