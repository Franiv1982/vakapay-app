// public/js/notificaciones.js — Notificaciones push en la APK (#68)
// ================================================================
// · Al abrir la APK con sesión: pide permiso (Android 13+), registra el móvil en
//   Firebase y manda su identificador al servidor (POST /users/me/dispositivos).
// · Al tocar un aviso: abre el grupo (y el chat o «Pagos realizados» si toca).
// · Con la app abierta, el aviso no sale en la barra: se muestra como mensaje
//   dentro de la app y se actualizan los datos.
// · Cuenta → Notificaciones: activar o desactivar cada tipo de aviso
//   (se guarda en la cuenta, así que vale para todos sus móviles).
// En la web no hay avisos (solo se pueden cambiar las preferencias).
// ================================================================
const TIPOS_AVISO = ['pagos', 'rechazos', 'gastos', 'chat'];
const CLAVE_TOKEN_PUSH = 'vp_push_token';

function pluginPush() {
  const C = window.Capacitor;
  return C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.PushNotifications || null;
}

async function apiAvisos(metodo, ruta, cuerpo) {
  const r = await fetch(`${API_BASE}/api/v1/users/me${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vakaData.getToken()}` },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  if (!r.ok) throw Object.assign(new Error('No se pudo guardar'), { status: r.status });
  return r.status === 204 ? null : r.json();
}

// ── Al tocar un aviso: ir a su sitio (cuando los grupos ya estén cargados) ──
function irDesdeAviso(datos) {
  if (!datos || !datos.grupo_id) return;
  let intentos = 0;
  const ir = () => {
    if (typeof cargandoInicial !== 'undefined' && cargandoInicial && intentos++ < 50) { setTimeout(ir, 300); return; }
    const idx = groups.findIndex(g => String(g.id) === String(datos.grupo_id));
    if (idx < 0) return;
    Promise.resolve(openGroup(idx)).then(() => {
      if (datos.destino === 'chat' && typeof abrirChat === 'function') abrirChat();
      else if (datos.destino === 'pagos') {
        const wrap = document.getElementById('pagosSectionWrap');
        if (wrap && wrap.style.display !== 'block') togglePagosSection();
        document.getElementById('secPagos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  };
  ir();
}

// ── Con la app abierta: aviso dentro de la app y datos al día ──
function avisoConAppAbierta(n) {
  const d = (n && n.data) || {};
  if (d.tipo === 'chat') {
    if (typeof actualizarNoLeidos === 'function') actualizarNoLeidos();
    return;   // el chat ya se actualiza solo si está abierto
  }
  if (n.title || n.body) toast(`${n.title ? n.title + ': ' : ''}${n.body || ''}`, 'i');
  const g = currentGroupIdx !== null ? groups[currentGroupIdx] : null;
  if (g && String(g.id) === String(d.grupo_id) && typeof recargarGrupoDelServidor === 'function') recargarGrupoDelServidor(g);
}

let _permisoAvisos = null;   // 'granted' | 'denied' | null (web o aún sin saber)
async function iniciarNotificaciones() {
  const P = pluginPush();
  if (!P || !vakaData.getToken()) return;
  // Oyentes primero: un aviso tocado con la app cerrada se entrega al registrarlos
  P.addListener('registration', async ({ value }) => {
    try {
      await apiAvisos('POST', '/dispositivos', { token: value });
      localStorage.setItem(CLAVE_TOKEN_PUSH, value);
    } catch (e) { console.warn('[avisos] No se pudo registrar el móvil:', e.message); }
  });
  P.addListener('registrationError', e => console.warn('[avisos] Firebase no registró el móvil:', e && e.error));
  P.addListener('pushNotificationActionPerformed', a => irDesdeAviso(a && a.notification && a.notification.data));
  P.addListener('pushNotificationReceived', avisoConAppAbierta);
  try {
    // Canales de Android: cada uno se puede silenciar aparte desde los ajustes del móvil
    await P.createChannel({ id: 'avisos', name: 'Pagos y gastos', description: 'Pagos por confirmar, pagos rechazados y nuevos gastos', importance: 4 });
    await P.createChannel({ id: 'chat', name: 'Mensajes del chat', description: 'Mensajes nuevos en el chat de tus grupos', importance: 3 });
    let permiso = await P.checkPermissions();
    if (permiso.receive === 'prompt' || permiso.receive === 'prompt-with-rationale') permiso = await P.requestPermissions();
    _permisoAvisos = permiso.receive === 'granted' ? 'granted' : 'denied';
    pintarNotaAvisos();
    if (_permisoAvisos === 'granted') await P.register();
  } catch (e) { console.warn('[avisos] No se pudieron activar:', e.message); }
}

// Al cerrar sesión: este móvil deja de recibir los avisos de esta cuenta
async function olvidarMovilParaAvisos() {
  const token = localStorage.getItem(CLAVE_TOKEN_PUSH);
  if (!token || !vakaData.getToken()) return;
  try { await apiAvisos('DELETE', `/dispositivos/${encodeURIComponent(token)}`); } catch (_) { /* sin conexión: el servidor lo limpia cuando Firebase lo rechace */ }
}

// ── Cuenta → Notificaciones ──
function pintarNotaAvisos() {
  const nota = document.getElementById('avisosNota');
  if (!nota) return;
  if (!pluginPush()) nota.textContent = 'Los avisos llegan a la app de Android. Lo que elijas aquí vale para todos tus móviles.';
  else if (_permisoAvisos === 'denied') nota.textContent = 'Las notificaciones de VakaPay están desactivadas en tu móvil. Actívalas en Ajustes › Aplicaciones › VakaPay › Notificaciones.';
  else nota.textContent = 'Elige qué avisos quieres recibir en el móvil.';
}
function pintarAvisos(prefs) {
  for (const t of TIPOS_AVISO) {
    const c = document.querySelector(`input[data-aviso="${t}"]`);
    if (c) c.checked = prefs[t] !== false;
  }
}
async function cargarAvisos() {
  pintarNotaAvisos();
  try { pintarAvisos(await apiAvisos('GET', '/avisos')); } catch (_) { /* sin conexión: se quedan como están */ }
}
async function cambiarAviso(casilla) {
  const tipo = casilla.dataset.aviso;
  casilla.disabled = true;
  try {
    pintarAvisos(await apiAvisos('PUT', '/avisos', { [tipo]: casilla.checked }));
  } catch (_) {
    casilla.checked = !casilla.checked;   // vuelve a como estaba
    toast('No se pudo guardar. Revisa tu conexión.', 'e');
  } finally { casilla.disabled = false; }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { iniciarNotificaciones(); cargarAvisos(); });
else { iniciarNotificaciones(); cargarAvisos(); }
