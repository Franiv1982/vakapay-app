// public/js/invitaciones.js — Unirse a un grupo por enlace de invitación
// (antes dentro de index.html; el orden de carga está en index.html)

// ═══ UNIRSE A UN GRUPO POR INVITACIÓN ═══════════════════════════════
// Si en el grupo hay participantes sin cuenta, se pregunta "¿Quién eres?":
// al elegir tu nombre, ese participante pasa a tu cuenta con sus gastos y saldos.
let _invitacion = null;
async function procesarInvitacion(token, manual = false) {
  const auth = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${vakaData.getToken()}` };
  let info;
  try {
    const r = await fetch(`${API_BASE}/api/v1/invite/${token}`, { headers: auth });
    if (r.status === 404) {
      localStorage.removeItem('vp_pending_invite');
      mostrarResultadoInvitacion({ icono: 'enlace', titulo: 'Enlace no válido',
        texto: 'El enlace de invitación no es válido o ha caducado. Pide a quien te invitó que te envíe uno nuevo.' });
      return;
    }
    if (!r.ok) throw new Error();
    info = await r.json();
  } catch (_) {
    // Sin conexión: si vino por el enlace se reintenta la próxima vez que abras la app
    if (manual) mostrarResultadoInvitacion({ icono: 'conexion', titulo: 'Sin conexión',
      texto: 'No se pudo comprobar la invitación. Revisa tu conexión e inténtalo de nuevo.' });
    return;
  }

  if (info.ya_miembro) {
    localStorage.removeItem('vp_pending_invite');
    mostrarResultadoInvitacion({ icono: 'miembro', titulo: 'Ya estás en este grupo',
      texto: `Ya eres miembro de "${info.group.name}".`, grupoId: info.group.id });
    return;
  }
  _invitacion = { token, info };
  if (info.sin_cuenta.length) mostrarModalQuienEres(info);
  else unirseAGrupo({});
}

// ── "Unirse con un enlace": pegar en la app el enlace recibido por WhatsApp, email... ──
// Necesario en la APK, porque al tocar el enlace Android lo abre en el navegador.
function abrirUnirseConEnlace() {
  const inp = document.getElementById('unirse-enlace-input');
  inp.value = '';
  document.getElementById('unirse-enlace-error').style.display = 'none';
  document.getElementById('modal-unirse-enlace').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}
function cerrarUnirseConEnlace() {
  document.getElementById('modal-unirse-enlace').style.display = 'none';
  document.body.style.overflow = '';
}
// Acepta el enlace completo (…/login.html?invite=XXXX) o solo el código
function extraerTokenInvitacion(texto) {
  const t = String(texto || '').trim();
  const m = t.match(/[?&]invite=([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{16,64}$/.test(t) ? t : null;
}
async function unirseConEnlace() {
  const token = extraerTokenInvitacion(document.getElementById('unirse-enlace-input').value);
  const err = document.getElementById('unirse-enlace-error');
  if (!token) {
    err.textContent = 'No parece un enlace de invitación de VakaPay. Copia el enlace completo que te enviaron.';
    err.style.display = 'block';
    return;
  }
  cerrarUnirseConEnlace();
  await procesarInvitacion(token, true);
}

// Iconos SVG de los modales (mismo estilo que el resto de la app)
const ICONOS_MODAL = {
  unido: ['#3DBA6F', '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/>'],
  miembro: ['#F5C800', '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'],
  enlace: ['#ff4d4d', '<path d="M18.84 12.25l1.72-1.71a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M5.17 11.75l-1.71 1.71a5 5 0 0 0 7.07 7.07l1.71-1.71"/><line x1="8" y1="2" x2="8" y2="5"/><line x1="2" y1="8" x2="5" y2="8"/><line x1="16" y1="19" x2="16" y2="22"/><line x1="19" y1="16" x2="22" y2="16"/>'],
  conexion: ['#ff4d4d', '<line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.58 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>'],
  error: ['#ff4d4d', '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'],
  correo: ['#ff4d4d', '<path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h9"/><polyline points="22 6 12 13 2 6"/><line x1="17" y1="17" x2="22" y2="22"/><line x1="22" y1="17" x2="17" y2="22"/>'],
  codigo: ['#ff4d4d', '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><line x1="12" y1="15" x2="12" y2="18"/>'],
  pronto: ['#F5C800', '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>']
};
function iconoModalSvg(nombre) {
  const [color, trazo] = ICONOS_MODAL[nombre] || ICONOS_MODAL.error;
  const r = parseInt(color.slice(1, 3), 16), g = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16);
  return `<div style="width:56px;height:56px;margin:0 auto;border-radius:50%;background:rgba(${r},${g},${b},.12);display:flex;align-items:center;justify-content:center;">` +
    `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${trazo}</svg></div>`;
}

// Resultado de la invitación en un modal de la app (con "Ir al grupo" cuando procede)
let _invitacionGrupoId = null;
function mostrarResultadoInvitacion({ icono, titulo, texto, grupoId = null }) {
  _invitacionGrupoId = grupoId;
  document.getElementById('inv-res-texto').style.whiteSpace = '';
  document.getElementById('inv-res-icono').innerHTML = iconoModalSvg(icono);
  document.getElementById('inv-res-titulo').textContent = titulo;
  document.getElementById('inv-res-texto').textContent = texto;
  document.getElementById('inv-res-ir').style.display = grupoId ? 'block' : 'none';
  document.getElementById('inv-res-cerrar').textContent = grupoId ? 'Ahora no' : 'Entendido';
  document.getElementById('inv-res-cerrar').style.cssText = grupoId
    ? 'width:100%;padding:12px;border-radius:12px;font-weight:bold;cursor:pointer;border:1px solid var(--line-strong);color:var(--text);background:none;margin-top:10px;'
    : 'width:100%;padding:14px;border-radius:12px;font-weight:bold;cursor:pointer;border:none;color:#000;background:#F5C800;';
  document.getElementById('modal-invitacion-resultado').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}
// Aviso genérico con el mismo modal (icono de error y botón «Entendido»)
function mostrarModalInfo(titulo, texto, icono = 'error') {
  mostrarResultadoInvitacion({ icono, titulo, texto });
  document.getElementById('inv-res-texto').style.whiteSpace = 'pre-line';
}
function cerrarResultadoInvitacion() {
  document.getElementById('modal-invitacion-resultado').style.display = 'none';
  document.body.style.overflow = '';
}
function irAlGrupoInvitado() {
  cerrarResultadoInvitacion();
  const idx = groups.findIndex(g => String(g.id) === String(_invitacionGrupoId));
  if (idx >= 0) openGroup(idx);
}

function mostrarModalQuienEres(info, sugerido) {
  const norm = t => String(t || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const marcado = sugerido || info.sin_cuenta.find(n => norm(n) === norm(info.tu_nombre)) || null;
  document.getElementById('quien-titulo').textContent = `Te uniste a "${info.group.name}"`;
  document.getElementById('quien-opciones').innerHTML = info.sin_cuenta.map(n => `
    <label style="display:flex;align-items:center;gap:10px;padding:12px 12px;border:1.5px solid ${n === marcado ? 'var(--gold)' : '#333'};border-radius:var(--r-md);margin-bottom:8px;cursor:pointer;">
      <input class="u-accent-gold" type="radio" name="quienEres" value="${escaparHtml(n)}" ${n === marcado ? 'checked' : ''} onchange="document.querySelectorAll('#quien-opciones label').forEach(l=>l.style.borderColor='var(--line)');this.parentNode.style.borderColor='var(--gold)'">
      <span class="u-c-text u-fw-700">${escaparHtml(n)}</span>
    </label>`).join('') + `
    <label style="display:flex;align-items:center;gap:10px;padding:12px 12px;border:1.5px solid ${marcado ? '#333' : 'var(--gold)'};border-radius:var(--r-md);cursor:pointer;">
      <input class="u-accent-gold" type="radio" name="quienEres" value="" ${marcado ? '' : 'checked'} onchange="document.querySelectorAll('#quien-opciones label').forEach(l=>l.style.borderColor='var(--line)');this.parentNode.style.borderColor='var(--gold)'">
      <span class="u-c-text">Ninguno, soy nuevo <span class="u-c-muted">(entrar como ${escaparHtml(info.tu_nombre || 'tu nombre')})</span></span>
    </label>`;
  document.getElementById('modal-quien-eres').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function confirmarQuienEres() {
  const sel = document.querySelector('input[name="quienEres"]:checked');
  document.getElementById('modal-quien-eres').style.display = 'none';
  document.body.style.overflow = '';
  if (sel && sel.value) unirseAGrupo({ reclamar: sel.value });
  else unirseAGrupo({ confirmar_nuevo: true });
}

async function unirseAGrupo(opciones) {
  if (!_invitacion) return;
  const { token, info } = _invitacion;
  try {
    const r = await fetch(`${API_BASE}/api/v1/invite/${token}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${vakaData.getToken()}` },
      body: JSON.stringify({ display_name: profile.nombre || info.tu_nombre || '', ...opciones })
    });
    const data = await r.json().catch(() => ({}));
    if (r.status === 409 && data.conflicto) {
      // Hay alguien sin cuenta con tu mismo nombre: se pregunta si eres tú
      mostrarModalQuienEres({ ...info, sin_cuenta: data.sin_cuenta || info.sin_cuenta }, data.sugerido);
      return;
    }
    if (!r.ok) throw new Error(data.error || 'No se pudo unir al grupo');
    localStorage.removeItem('vp_pending_invite');
    _invitacion = null;
    groups = await vakaData.getGroups() || [];
    friends = await vakaData.getFriends() || [];
    renderGroupsList(); renderFriends();
    mostrarResultadoInvitacion(data.already_member
      ? { icono: 'miembro', titulo: 'Ya estás en este grupo', texto: `Ya eres miembro de "${data.group.name}".`, grupoId: data.group.id }
      : { icono: 'unido', titulo: '¡Te has unido!',
          texto: data.reclamado
            ? `Ya formas parte de "${data.group.name}" como ${data.display_name}. Conservas tus gastos y saldos.`
            : `Ya formas parte de "${data.group.name}".`,
          grupoId: data.group.id });
  } catch (err) {
    mostrarResultadoInvitacion({ icono: 'error', titulo: 'No se pudo unir', texto: err.message || 'No se pudo unir al grupo. Inténtalo de nuevo.' });
  }
}

async function saveFriends() { 
  try {
    await vakaData.saveFriends(friends);
  } catch (err) {
    console.error("Error al guardar amigos:", err);
  }
}

async function saveActivity() {
  // logActivity ya persiste en backend y localStorage. Solo actualizamos la vista.
}
