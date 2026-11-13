// public/js/chat.js — Chat del grupo: mensajes, fotos y GIF
// (antes dentro de index.html; el orden de carga está en index.html)

// ═══ CHAT DEL GRUPO ═══════════════════════════════════════════════════
// Un chat por grupo. Mientras está abierto, la app pide los mensajes cada 4 s.
// Los mensajes automáticos (gastos, pagos, altas y bajas) los crea el servidor.
const CHAT_EMOJIS = ['👍', '❤️', '😂', '😮', '🙏', '💸'];
var chatNoLeidos = {};          // { idGrupo: nº de mensajes sin leer } (var: se usa también al pintar las tarjetas de grupo)
let _chatGrupoId = null, _chatTimer = null, _chatFirma = '', _chatMensajes = [];
let _chatMenuMsg = null, _chatPulsacion = null;
let _chatRespuestaA = null;     // id del mensaje al que se está respondiendo

const chatAbierto = () => document.getElementById('page-chat').classList.contains('active');

function apiChat(ruta = '', opciones = {}) {
  return fetch(`${API_BASE}/api/v1/groups/${_chatGrupoId}/chat${ruta}`, {
    ...opciones,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${vakaData.getToken()}` }
  });
}

// ── Avisos de mensajes sin leer (sección 7 y tarjeta del grupo) ──────
async function actualizarNoLeidos() {
  try {
    const r = await fetch(`${API_BASE}/api/v1/groups/chat/no-leidos`, { headers: { 'Authorization': `Bearer ${vakaData.getToken()}` } });
    if (!r.ok) return;
    chatNoLeidos = await r.json();
  } catch (_) { return; }
  pintarAvisosChat();
}
function pintarAvisosChat() {
  const g = groups[currentGroupIdx];
  const badge = document.getElementById('chatBadge');
  if (badge) {
    const n = (g && chatNoLeidos[g.id]) || 0;
    badge.textContent = n === 1 ? '1 nuevo' : `${n} nuevos`;
    badge.style.display = n > 0 && !chatAbierto() ? 'inline-block' : 'none';
  }
  document.querySelectorAll('.group-card[data-gid]').forEach(card => {
    const dot = card.querySelector('.chat-dot');
    if (dot) dot.style.display = (chatNoLeidos[card.dataset.gid] || 0) > 0 ? 'block' : 'none';
  });
}
setInterval(() => { if (document.visibilityState === 'visible' && !chatAbierto()) actualizarNoLeidos(); }, 30000);
setTimeout(actualizarNoLeidos, 2500);

// ── Abrir / cerrar ───────────────────────────────────────────────────
function abrirChat() {
  const g = groups[currentGroupIdx];
  if (!g || !g.id) { toast('Abre un grupo primero', 'e'); return; }
  _chatGrupoId = g.id; _chatFirma = ''; _chatMensajes = [];
  document.getElementById('chatTitulo').innerHTML = `${iconoTipo(g.type, 16)} ${escaparHtml(g.name)} · Chat`;
  document.getElementById('chatMiembros').textContent = Object.keys(g.members || {}).join(', ');
  document.getElementById('chatLista').innerHTML = skChat();
  document.getElementById('page-chat').classList.add('active');
  const hb = document.getElementById('hbadge'); if (hb) hb.style.visibility = 'hidden';
  // En escritorio el chat es un panel al costado y el grupo sigue usable
  if (esEscritorio()) document.body.classList.add('chat-abierto');
  else document.body.style.overflow = 'hidden';
  pintarAvisosChat();
  cargarChat(true);
  clearInterval(_chatTimer);
  _chatTimer = setInterval(() => { if (document.visibilityState === 'visible') cargarChat(); }, 4000);
}
// Cambiar de grupo con el chat abierto: se cierra lo que era del grupo anterior
// (menús, respuesta a medias, adjuntos, texto escrito) y se abre el del nuevo
function cambiarChatDeGrupo() {
  cerrarMenuChat(); cerrarDialogoChat(); cancelarRespuestaChat();
  cerrarAdjuntosChat(); cerrarGifChat(); cerrarFotoPreviaChat(); cerrarVisorChat();
  const t = document.getElementById('chatTexto'); if (t) { t.value = ''; t.style.height = 'auto'; }
  abrirChat();
}
const esEscritorio = () => window.matchMedia('(min-width: 1100px)').matches;
function cerrarChat() {
  document.body.classList.remove('chat-abierto');
  clearInterval(_chatTimer); _chatTimer = null;
  cerrarMenuChat(); cerrarDialogoChat(); cancelarRespuestaChat();
  cerrarAdjuntosChat(); cerrarGifChat(); cerrarFotoPreviaChat(); cerrarVisorChat();
  document.getElementById('page-chat').classList.remove('active');
  const hb = document.getElementById('hbadge'); if (hb) hb.style.visibility = '';
  document.body.style.overflow = '';
  actualizarNoLeidos();
}
// Botón atrás de Android: devuelve true si lo ha gestionado el chat
function chatAtras() {
  if (!chatAbierto()) return false;
  if (document.getElementById('chatDialogo').style.display === 'flex') { cerrarDialogoChat(); return true; }
  if (document.getElementById('chatVisor').style.display === 'flex') { cerrarVisorChat(); return true; }
  if (document.getElementById('chatFotoPrevia').style.display === 'flex') { cerrarFotoPreviaChat(); return true; }
  if (document.getElementById('chatGif').style.display === 'flex') { cerrarGifChat(); return true; }
  if (document.getElementById('chatAdjuntos').style.display === 'flex') { cerrarAdjuntosChat(); return true; }
  if (_chatMenuMsg !== null) { cerrarMenuChat(); return true; }
  if (_chatRespuestaA !== null) { cancelarRespuestaChat(); return true; }
  cerrarChat(); return true;
}

// ── Cargar y pintar ──────────────────────────────────────────────────
async function cargarChat(forzar = false) {
  if (!_chatGrupoId) return;
  let datos;
  try {
    const r = await apiChat();
    if (!r.ok) throw new Error();
    datos = await r.json();
  } catch (_) {
    if (forzar) document.getElementById('chatLista').innerHTML = '<div class="chat-vacio">No se pudieron cargar los mensajes. Revisa tu conexión.</div>';
    return;
  }
  const firma = JSON.stringify(datos.mensajes);
  if (!forzar && firma === _chatFirma) return;
  _chatFirma = firma; _chatMensajes = datos.mensajes;
  if (_chatMenuMsg === null) pintarChat(forzar);
  // Marcar como leído
  const ultimo = datos.mensajes.length ? datos.mensajes[datos.mensajes.length - 1].id : 0;
  if (ultimo > (datos.ultimo_leido || 0)) {
    apiChat('/leido', { method: 'POST', body: JSON.stringify({ ultimo }) }).catch(() => {});
  }
  chatNoLeidos[_chatGrupoId] = 0;
  pintarAvisosChat();
}

function diaChat(fecha) {
  const d = new Date(fecha), hoy = new Date();
  const ayer = new Date(); ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === hoy.toDateString()) return 'Hoy';
  if (d.toDateString() === ayer.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
}
const horaChat = f => new Date(f).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

function pintarChat(alFinal = false) {
  const lista = document.getElementById('chatLista');
  const cercaDelFinal = lista.scrollHeight - lista.scrollTop - lista.clientHeight < 80;
  if (!_chatMensajes.length) {
    lista.innerHTML = '<div class="chat-vacio">Todavía no hay mensajes.<br>Escribe el primero.<br><br>Aquí aparecerán también los gastos y pagos del grupo.</div>';
    return;
  }
  let html = '', diaAnterior = '', autorAnterior = '';
  for (const m of _chatMensajes) {
    const dia = diaChat(m.created_at);
    if (dia !== diaAnterior) { html += `<div class="chat-dia">${escaparHtml(dia)}</div>`; diaAnterior = dia; autorAnterior = ''; }
    const reacciones = Object.entries(m.reacciones || {}).map(([emoji, nombres]) =>
      `<button class="${m.mi_reaccion === emoji ? 'mia' : ''}" onclick="event.stopPropagation();reaccionarChat(${m.id},'${emoji}')">${emoji} ${nombres.length}</button>`).join('');
    const bloqueReacc = reacciones ? `<div class="reacc">${reacciones}</div>` : '';
    const cita = m.respuesta
      ? `<span class="cita" onclick="event.stopPropagation();irAMensajeChat(${m.respuesta.id})"><span class="c-autor">${escaparHtml(m.respuesta.autor)}</span><span class="c-texto">${escaparHtml(m.respuesta.texto)}</span></span>`
      : '';
    if (m.tipo === 'sistema') {
      html += `<div class="chat-sis" data-id="${m.id}">${(() => { const x = iconoDeMensaje(m.texto); return x.icono + (x.icono ? ' ' : '') + escaparHtml(x.resto); })()}<span class="hora">${horaChat(m.created_at)}</span></div>${bloqueReacc ? `<div class="u-as-center">${bloqueReacc}</div>` : ''}`;
      autorAnterior = '';
      continue;
    }
    const mostrarAutor = !m.mio && m.autor !== autorAnterior;
    autorAnterior = m.autor;
    const adjunto = m.borrado ? '' : htmlAdjuntoChat(m);
    const cuerpo = m.borrado ? 'Mensaje eliminado'
      : adjunto ? `${adjunto}${m.texto ? `<span class="pie">${escaparHtml(m.texto)}</span>` : ''}`
      : escaparHtml(m.texto);
    html += `<div class="msg ${m.mio ? 'yo' : ''} ${m.borrado ? 'borrado' : ''}" data-id="${m.id}">
      ${mostrarAutor ? `<div class="autor">${escaparHtml(m.autor || 'Alguien')}</div>` : ''}
      <div class="burb${adjunto ? ' media' : ''}">${m.borrado ? '' : cita}${cuerpo}<span class="hora">${horaChat(m.created_at)}</span></div>
      ${bloqueReacc}
    </div>`;
  }
  lista.innerHTML = html;
  if (alFinal || cercaDelFinal) lista.scrollTop = lista.scrollHeight;
  _chatPegadoAlFinal = alFinal || cercaDelFinal;
  cargarFotosChat();
}

// ── Enviar ───────────────────────────────────────────────────────────
async function enviarMensajeChat() {
  const caja = document.getElementById('chatTexto');
  const texto = caja.value.trim();
  if (!texto || !_chatGrupoId) return;
  const btn = document.getElementById('chatEnviar');
  btn.disabled = true;
  try {
    const r = await apiChat('', { method: 'POST', body: JSON.stringify({ texto, respuesta_a: _chatRespuestaA }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'No se pudo enviar');
    caja.value = ''; caja.style.height = 'auto';
    cancelarRespuestaChat();
    await cargarChat(true);
  } catch (err) {
    toast(textoError(err, 'No se pudo enviar el mensaje'), 'e');
  } finally {
    btn.disabled = false;
  }
}
document.getElementById('chatTexto').addEventListener('keydown', e => {
  // En ordenador, Enter envía y Mayús+Enter hace salto de línea
  if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) { e.preventDefault(); enviarMensajeChat(); }
});

// ── Reacciones ───────────────────────────────────────────────────────
async function reaccionarChat(id, emoji) {
  cerrarMenuChat();
  try {
    const r = await apiChat(`/${id}/reaccion`, { method: 'PUT', body: JSON.stringify({ emoji }) });
    if (!r.ok) throw new Error();
    await cargarChat(true);
  } catch (_) { toast('No se pudo guardar la reacción', 'e'); }
}

// ── Mantener pulsado: reacciones + menú ──────────────────────────────
(function () {
  const lista = document.getElementById('chatLista');
  const objetivo = e => e.target.closest('.msg .burb, .chat-sis');
  lista.addEventListener('pointerdown', e => {
    const el = objetivo(e); if (!el) return;
    const x = e.clientX, y = e.clientY;
    _chatPulsacion = { el, x, y, t: setTimeout(() => { _chatPulsacion = null; abrirMenuChat(el); }, 450) };
  });
  const cancelar = () => { if (_chatPulsacion) { clearTimeout(_chatPulsacion.t); _chatPulsacion = null; } };
  lista.addEventListener('pointermove', e => {
    if (_chatPulsacion && (Math.abs(e.clientX - _chatPulsacion.x) > 10 || Math.abs(e.clientY - _chatPulsacion.y) > 10)) cancelar();
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => lista.addEventListener(ev, cancelar));
  lista.addEventListener('scroll', cancelar, { passive: true });
  lista.addEventListener('contextmenu', e => { const el = objetivo(e); if (!el) return; e.preventDefault(); cancelar(); abrirMenuChat(el); });
})();

function abrirMenuChat(el) {
  const cont = el.classList.contains('chat-sis') ? el : el.closest('.msg');
  const id = Number(cont.dataset.id);
  const m = _chatMensajes.find(x => x.id === id);
  if (!m || m.borrado) return;
  cerrarMenuChat();
  _chatMenuMsg = id;
  if (navigator.vibrate) { try { navigator.vibrate(15); } catch (_) {} }
  const pagina = document.getElementById('page-chat');
  const marco = pagina.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  cont.classList.add('enfocado');
  document.getElementById('chatCapa').style.display = 'block';

  const picker = document.createElement('div');
  picker.className = 'chat-picker'; picker.id = 'chatPicker';
  picker.innerHTML = CHAT_EMOJIS.map(e => `<button class="${m.mi_reaccion === e ? 'mia' : ''}" onclick="reaccionarChat(${id},'${e}')">${e}</button>`).join('');
  const menu = document.createElement('div');
  menu.className = 'chat-menu'; menu.id = 'chatMenu';
  const tieneReacc = Object.keys(m.reacciones || {}).length > 0;
  menu.innerHTML =
    `<button onclick="responderMensajeChat(${id})">Responder</button>` +
    (m.texto ? `<button onclick="copiarMensajeChat(${id})">Copiar</button>` : '') +
    (m.imagen ? `<button onclick="cerrarMenuChat();verFotoChat(${id})">Ver / descargar foto</button>` : '') +
    (tieneReacc ? `<button onclick="verReaccionesChat(${id})">Ver quién reaccionó</button>` : '') +
    (m.mio && m.tipo === 'usuario' ? `<button class="rojo" onclick="confirmarBorrarChat(${id})">Borrar</button>` : '');
  pagina.appendChild(picker); pagina.appendChild(menu);

  // Posición: emojis encima del mensaje y menú debajo (o al revés si no cabe)
  const ancho = marco.width;
  const izq = el.closest('.yo') ? Math.max(8, r.right - marco.left - picker.offsetWidth) : Math.max(8, r.left - marco.left);
  picker.style.left = Math.min(izq, ancho - picker.offsetWidth - 8) + 'px';
  let arriba = r.top - marco.top - picker.offsetHeight - 8;
  if (arriba < 60) arriba = r.bottom - marco.top + 8 + menu.offsetHeight + 8;
  picker.style.top = arriba + 'px';
  const izqMenu = el.closest('.yo') ? Math.max(8, r.right - marco.left - menu.offsetWidth) : Math.max(8, r.left - marco.left);
  menu.style.left = Math.min(izqMenu, ancho - menu.offsetWidth - 8) + 'px';
  let abajo = r.bottom - marco.top + 8;
  if (abajo + menu.offsetHeight > marco.height - 70) abajo = Math.max(60, r.top - marco.top - menu.offsetHeight - 8 - (arriba < r.top - marco.top ? picker.offsetHeight + 8 : 0));
  menu.style.top = abajo + 'px';
}
function cerrarMenuChat() {
  _chatMenuMsg = null;
  ['chatPicker', 'chatMenu'].forEach(id => { const x = document.getElementById(id); if (x) x.remove(); });
  const capa = document.getElementById('chatCapa'); if (capa) capa.style.display = 'none';
  document.querySelectorAll('#chatLista .enfocado').forEach(x => x.classList.remove('enfocado'));
}

// ── Responder ────────────────────────────────────────────────────────
function responderMensajeChat(id) {
  const m = _chatMensajes.find(x => x.id === id);
  cerrarMenuChat();
  if (!m) return;
  _chatRespuestaA = id;
  document.getElementById('chatRespAutor').textContent = m.tipo === 'sistema' ? 'VakaPay' : (m.mio ? 'Tú' : (m.autor || 'Alguien'));
  document.getElementById('chatRespTexto').innerHTML = m.texto ? escaparHtml(m.texto) : (m.imagen ? icono('camara',13) + ' Foto' : m.gif ? 'GIF' : '');
  document.getElementById('chatRespondiendo').style.display = 'flex';
  document.getElementById('chatTexto').focus();
}
function cancelarRespuestaChat() {
  _chatRespuestaA = null;
  const barra = document.getElementById('chatRespondiendo');
  if (barra) barra.style.display = 'none';
}
// Al tocar una cita, se va al mensaje original y se resalta un momento
function irAMensajeChat(id) {
  const el = document.querySelector(`#chatLista [data-id="${id}"]`);
  if (!el) { toast('Ese mensaje es antiguo y ya no se muestra', 'i'); return; }
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('resaltado');
  setTimeout(() => el.classList.remove('resaltado'), 1500);
}

function copiarMensajeChat(id) {
  const m = _chatMensajes.find(x => x.id === id);
  cerrarMenuChat();
  if (m) copiarTexto(m.texto);
}

// ── Diálogo (quién reaccionó / borrar) ───────────────────────────────
function abrirDialogoChat(html) {
  document.getElementById('chatDialogoCaja').innerHTML = html;
  document.getElementById('chatDialogo').style.display = 'flex';
}
function cerrarDialogoChat() {
  const d = document.getElementById('chatDialogo'); if (d) d.style.display = 'none';
}
function verReaccionesChat(id) {
  const m = _chatMensajes.find(x => x.id === id);
  cerrarMenuChat();
  if (!m) return;
  const filas = Object.entries(m.reacciones || {}).map(([emoji, nombres]) =>
    `<div class="u-d-flex u-gap-10 u-ai-flex-start u-t-left u-p-8-0 u-bb-1-solid-line">
       <span class="u-fs-lg">${emoji}</span><span class="u-c-text u-fs-base u-lh-1_5">${nombres.map(escaparHtml).join(', ')}</span></div>`).join('');
  abrirDialogoChat(`<div class="u-c-text u-fs-lg u-fw-700 u-mb-10">Reacciones</div>${filas}
    <button onclick="cerrarDialogoChat()" class="btn btn-gold u-w-100p u-mt-16">Cerrar</button>`);
}
function confirmarBorrarChat(id) {
  cerrarMenuChat();
  abrirDialogoChat(`<div class="u-c-text u-fs-lg u-fw-700 u-mb-8">¿Borrar mensaje?</div>
    <p class="u-c-text u-fs-base u-op-_8 u-mb-20">Se mostrará como «Mensaje eliminado» para todo el grupo.</p>
    <div class="u-d-flex u-gap-12">
      <button onclick="cerrarDialogoChat()" class="btn btn-outline u-f-1"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg> No, volver</button>
      <button onclick="borrarMensajeChat(${id})" class="btn btn-peligro u-f-1"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg> Sí, borrar</button>
    </div>`);
}
async function borrarMensajeChat(id) {
  cerrarDialogoChat();
  try {
    const r = await apiChat(`/${id}`, { method: 'DELETE' });
    if (!r.ok) throw new Error();
    await cargarChat(true);
  } catch (_) { toast('No se pudo borrar el mensaje', 'e'); }
}

// ═══ ADJUNTOS: FOTOS Y GIF ═══════════════════════════════════════════
// Botón «+» junto al campo de texto: Cámara, Galería o GIF.
// Las fotos se guardan en el servidor; el listado solo dice que hay foto y la
// app la pide aparte una vez (se queda en memoria mientras la app está abierta).
// Los GIF vienen de GIPHY y solo se guarda su dirección.
const PIXEL_VACIO = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
const _chatFotos = {};             // id del mensaje → foto (data:image/...)
const _chatFotosPidiendo = new Set();
let _chatPegadoAlFinal = true;
let _chatFotoNueva = null, _chatVisorId = null;

function htmlAdjuntoChat(m) {
  if (m.imagen) {
    const src = _chatFotos[m.id];
    return `<img class="chat-foto${src ? '' : ' cargando'}" data-foto="${m.id}" src="${src || PIXEL_VACIO}" alt="Foto" draggable="false" onclick="if(_chatMenuMsg===null)verFotoChat(${m.id})" onload="adjuntoCargadoChat()">`;
  }
  if (m.gif) return `<img class="chat-gif" src="${escaparHtml(m.gif)}" alt="GIF" draggable="false" onload="adjuntoCargadoChat()">`;
  return '';
}
// Si estabas al final del chat, sigue al final cuando termina de cargar una imagen
function adjuntoCargadoChat() {
  if (!_chatPegadoAlFinal) return;
  const lista = document.getElementById('chatLista');
  lista.scrollTop = lista.scrollHeight;
}
document.getElementById('chatLista').addEventListener('scroll', function () {
  _chatPegadoAlFinal = this.scrollHeight - this.scrollTop - this.clientHeight < 120;
}, { passive: true });

async function pedirFotoChat(id) {
  if (_chatFotos[id]) return _chatFotos[id];
  try {
    const r = await apiChat(`/${id}/imagen`);
    if (!r.ok) return null;
    const d = await r.json();
    if (d.imagen) _chatFotos[id] = d.imagen;
    return d.imagen || null;
  } catch (_) { return null; }
}
function cargarFotosChat() {
  document.querySelectorAll('#chatLista img.chat-foto.cargando').forEach(img => {
    const id = img.dataset.foto;
    if (_chatFotosPidiendo.has(id)) return;
    _chatFotosPidiendo.add(id);
    pedirFotoChat(id).then(src => {
      if (!src) return;
      document.querySelectorAll(`#chatLista img.chat-foto[data-foto="${id}"]`).forEach(x => { x.src = src; x.classList.remove('cargando'); });
    }).finally(() => _chatFotosPidiendo.delete(id));
  });
}

// ── Menú «+» ─────────────────────────────────────────────────────────
function alternarAdjuntosChat() {
  if (document.getElementById('chatAdjuntos').style.display === 'flex') { cerrarAdjuntosChat(); return; }
  cerrarMenuChat();
  const pagina = document.getElementById('page-chat').getBoundingClientRect();
  const entrada = document.querySelector('#page-chat .chat-input').getBoundingClientRect();
  const panel = document.getElementById('chatAdjuntos');
  // En el ordenador no hay cámara para hacer la foto: solo Galería (las carpetas) y GIF
  const cam = panel.querySelector('[onclick*="\'camara\'"]');
  if (cam) cam.style.display = puedeHacerFoto() ? '' : 'none';
  panel.style.bottom = (pagina.bottom - entrada.top + 8) + 'px';
  panel.style.display = 'flex';
  document.getElementById('chatCapaAdj').style.display = 'block';
  document.getElementById('chatMas').classList.add('abierto');
}
function cerrarAdjuntosChat() {
  const p = document.getElementById('chatAdjuntos'); if (p) p.style.display = 'none';
  const c = document.getElementById('chatCapaAdj'); if (c) c.style.display = 'none';
  const b = document.getElementById('chatMas'); if (b) b.classList.remove('abierto');
}
function elegirAdjuntoChat(tipo) {
  cerrarAdjuntosChat();
  if (tipo === 'gif') { abrirGifChat(); return; }
  const input = document.getElementById('chatImagenFile');
  input.value = '';
  if (tipo === 'camara') input.setAttribute('capture', 'environment');
  else input.removeAttribute('capture');
  _abriendoImagen = true;          // sin pasar por la ventana «Hacer foto / Galería»: ya se ha elegido
  try { input.click(); } finally { _abriendoImagen = false; }
}

// ── Fotos ────────────────────────────────────────────────────────────
// Reduce la foto a JPEG (máx. 1280 px) para que suba rápido y no pase de ~1,5 MB
function reducirFotoChat(file, max = 1280, calidad = 0.75) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onerror = () => reject(new Error('No se pudo leer la foto'));
    lector.onload = e => {
      const img = new Image();
      img.onerror = () => reject(new Error('El archivo no es una imagen válida'));
      img.onload = () => {
        const escala = Math.min(1, max / Math.max(img.width, img.height));
        const lienzo = document.createElement('canvas');
        lienzo.width = Math.round(img.width * escala);
        lienzo.height = Math.round(img.height * escala);
        lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height);
        resolve(lienzo.toDataURL('image/jpeg', calidad));
      };
      img.src = e.target.result;
    };
    lector.readAsDataURL(file);
  });
}
async function imagenElegidaChat(ev) {
  const file = ev.target.files && ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  try {
    let foto = await reducirFotoChat(file);
    if (foto.length > 1900000) foto = await reducirFotoChat(file, 960, 0.6);
    _chatFotoNueva = foto;
    document.getElementById('chatFotoPreviaImg').src = foto;
    document.getElementById('chatFotoPie').value = document.getElementById('chatTexto').value.trim();
    document.getElementById('chatFotoPrevia').style.display = 'flex';
  } catch (err) { toast(textoError(err, 'No se pudo abrir la foto'), 'e'); }
}
function cerrarFotoPreviaChat() {
  _chatFotoNueva = null;
  const p = document.getElementById('chatFotoPrevia'); if (p) p.style.display = 'none';
}
async function enviarAdjuntoChat(cuerpo) {
  const r = await apiChat('', { method: 'POST', body: JSON.stringify({ ...cuerpo, respuesta_a: _chatRespuestaA }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'No se pudo enviar');
  cancelarRespuestaChat();
  return d;
}
async function enviarFotoChat() {
  if (!_chatFotoNueva) return;
  const btn = document.getElementById('chatFotoEnviar');
  btn.disabled = true;
  const foto = _chatFotoNueva, pie = document.getElementById('chatFotoPie').value.trim();
  try {
    const d = await enviarAdjuntoChat({ imagen: foto, texto: pie });
    _chatFotos[d.id] = foto;
    // El comentario de la foto sustituye a lo que hubiera escrito en el campo
    if (pie && pie === document.getElementById('chatTexto').value.trim()) {
      const caja = document.getElementById('chatTexto'); caja.value = ''; caja.style.height = 'auto';
    }
    cerrarFotoPreviaChat();
    await cargarChat(true);
  } catch (err) {
    toast(textoError(err, 'No se pudo enviar la foto'), 'e');
  } finally { btn.disabled = false; }
}
async function verFotoChat(id) {
  const src = await pedirFotoChat(id);
  if (!src) { toast('No se pudo cargar la foto', 'e'); return; }
  _chatVisorId = id;
  document.getElementById('chatVisorImg').src = src;
  reiniciarZoom(document.getElementById('chatVisorImg'));
  document.getElementById('chatVisor').style.display = 'flex';
}
function cerrarVisorChat() {
  _chatVisorId = null;
  const v = document.getElementById('chatVisor'); if (v) v.style.display = 'none';
}
function descargarFotoChat() {
  const src = _chatFotos[_chatVisorId];
  if (src) guardarImagenDataUrl(src, `vakapay_foto_${_chatVisorId}.jpg`, 'Guardar o compartir foto');
}

// ── GIF (GIPHY) ──────────────────────────────────────────────────────
// Categorías rápidas: [id, texto del botón, búsqueda en GIPHY]
const GIF_CATEGORIAS = [
  ['recientes', 'Recientes'], ['tendencias', 'Tendencias'],
  ['hola', 'Hola', 'hello'], ['jaja', 'Jajaja', 'lol'], ['amor', 'Te quiero', 'love'],
  ['cumple', 'Feliz cumpleaños', 'happy birthday'], ['gracias', 'Gracias', 'thank you'],
  ['entusiasmo', 'Entusiasmo', 'excited'], ['si', 'Sí', 'yes'], ['no', 'No', 'no'],
  ['perdon', 'Lo siento', 'sorry'], ['feliz', 'Feliz', 'happy'], ['triste', 'Triste', 'sad'],
  ['pulgar', 'Pulgares arriba', 'thumbs up'], ['susto', 'Asustado', 'scared'], ['adios', 'Adiós', 'bye'],
  ['confuso', 'Confundido', 'confused'], ['enojado', 'Enojado', 'angry'], ['hambre', 'Hambriento', 'hungry'],
  ['beso', 'Beso', 'kiss'], ['aplausos', 'Aplausos', 'applause'], ['fiesta', 'Fiesta', 'party'],
  ['salud', 'Salud', 'cheers'], ['bailar', 'Bailar', 'dance'], ['sorpresa', 'Sorpresa', 'surprised'],
  ['cansado', 'Cansado', 'tired'], ['ojos', 'Ojos en blanco', 'eye roll'], ['ok', 'OK', 'ok'],
  ['dinero', 'Dinero', 'money'], ['pagame', '¡Págame!', 'pay me'], ['vacaciones', 'Vacaciones', 'vacation'],
];
const GIF_RECIENTES_KEY = 'vp_gif_recientes';
let _gifConfig = null;
const _gifCache = new Map();
const _gifEstado = { cat: 'tendencias', q: '', offset: 0, mas: false, cargando: false, peticion: 0 };
let _gifTimer = null;

function gifsRecientes() {
  try { return JSON.parse(localStorage.getItem(GIF_RECIENTES_KEY) || '[]').slice(0, 30); } catch (_) { return []; }
}
function guardarGifReciente(g) {
  try {
    const lista = [g, ...gifsRecientes().filter(x => x.url !== g.url)].slice(0, 30);
    localStorage.setItem(GIF_RECIENTES_KEY, JSON.stringify(lista));
  } catch (_) {}
}
async function configGif() {
  if (_gifConfig) return _gifConfig;
  try {
    const r = await apiChat('/gif-config');
    if (r.ok) _gifConfig = await r.json();
  } catch (_) {}
  return _gifConfig || { disponible: false };
}

async function abrirGifChat() {
  cerrarMenuChat();
  document.getElementById('chatGif').style.display = 'flex';
  document.getElementById('chatGifBuscar').value = '';
  _gifEstado.q = '';
  _gifEstado.cat = gifsRecientes().length ? 'recientes' : 'tendencias';
  pintarChipsGif();
  const cfg = await configGif();
  if (!cfg.disponible) {
    document.getElementById('chatGifRejilla').innerHTML = '';
    avisoGif('Los GIF todavía no están activados en VakaPay. Vuelve a intentarlo más adelante.');
    return;
  }
  cargarGifs(true);
}
function cerrarGifChat() {
  clearTimeout(_gifTimer);
  _gifEstado.peticion++;
  const p = document.getElementById('chatGif'); if (p) p.style.display = 'none';
}
function avisoGif(t) { document.getElementById('chatGifAviso').textContent = t; }

function pintarChipsGif() {
  const cont = document.getElementById('chatGifChips');
  cont.innerHTML = GIF_CATEGORIAS.map(([id, nombre]) => {
    const icono = id === 'recientes'
      ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>'
      : id === 'tendencias'
        ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>'
        : '';
    return `<button type="button" data-cat="${id}" class="${!_gifEstado.q && _gifEstado.cat === id ? 'activa' : ''}" onclick="elegirCategoriaGif('${id}')">${icono}${escaparHtml(nombre)}</button>`;
  }).join('');
}
function elegirCategoriaGif(id) {
  _gifEstado.cat = id; _gifEstado.q = '';
  document.getElementById('chatGifBuscar').value = '';
  pintarChipsGif();
  cargarGifs(true);
}
function buscarGifEscrito() {
  clearTimeout(_gifTimer);
  _gifTimer = setTimeout(() => {
    const q = document.getElementById('chatGifBuscar').value.trim();
    if (!q) { elegirCategoriaGif(gifsRecientes().length ? 'recientes' : 'tendencias'); return; }
    _gifEstado.q = q;
    pintarChipsGif();
    cargarGifs(true);
  }, 600);   // espera a que termines de escribir (ahorra búsquedas)
}

async function pedirGifsGiphy(q, idioma, offset) {
  const clave = `${q || '#tendencias'}|${idioma}|${offset}`;
  if (_gifCache.has(clave)) return _gifCache.get(clave);
  const cfg = await configGif();
  const params = new URLSearchParams({ api_key: cfg.clave, limit: '24', offset: String(offset), rating: 'pg-13' });
  if (q) { params.set('q', q); params.set('lang', idioma); }
  const r = await fetch(`https://api.giphy.com/v1/gifs/${q ? 'search' : 'trending'}?${params}`);
  if (!r.ok) throw new Error(r.status === 429 ? 'limite' : 'error');
  const d = await r.json();
  const lista = (d.data || []).map(g => {
    const im = g.images || {};
    return {
      vista: (im.fixed_width_small || im.fixed_width || {}).url,
      url: (im.fixed_width || im.downsized || {}).url,
    };
  }).filter(g => g.vista && g.url);
  const p = d.pagination || {};
  const res = { lista, mas: lista.length > 0 && (p.offset || 0) + (p.count || 0) < (p.total_count || 0) };
  _gifCache.set(clave, res);
  return res;
}
const celdaGif = g =>
  `<button type="button" class="gif-celda" data-url="${escaparHtml(g.url)}" data-vista="${escaparHtml(g.vista)}" onclick="enviarGifChat(this)"><img src="${escaparHtml(g.vista)}" alt="GIF" loading="lazy" draggable="false"></button>`;

async function cargarGifs(desdeCero) {
  const st = _gifEstado, rejilla = document.getElementById('chatGifRejilla');
  const peticion = ++st.peticion;
  if (desdeCero) { st.offset = 0; st.mas = false; rejilla.innerHTML = ''; document.getElementById('chatGifCuerpo').scrollTop = 0; }
  if (!st.q && st.cat === 'recientes') {
    const rec = gifsRecientes();
    rejilla.innerHTML = rec.map(celdaGif).join('');
    avisoGif(rec.length ? '' : 'Aquí aparecerán los GIF que envíes.');
    return;
  }
  const cat = GIF_CATEGORIAS.find(c => c[0] === st.cat);
  const q = st.q || (cat && cat[2]) || '';
  st.cargando = true;
  avisoGif('Cargando GIF...');
  try {
    const res = await pedirGifsGiphy(q, st.q ? 'es' : 'en', st.offset);
    if (peticion !== st.peticion) return;
    rejilla.insertAdjacentHTML('beforeend', res.lista.map(celdaGif).join(''));
    st.offset += res.lista.length;
    st.mas = res.mas;
    avisoGif(!rejilla.children.length ? 'No se encontraron GIF. Prueba con otra palabra.' : '');
  } catch (err) {
    if (peticion !== st.peticion) return;
    avisoGif(err.message === 'limite'
      ? 'Se ha alcanzado el límite de búsquedas de GIF. Prueba de nuevo en un rato.'
      : 'No se pudieron cargar los GIF. Revisa tu conexión.');
  } finally {
    if (peticion === st.peticion) st.cargando = false;
  }
}
// Al llegar al final de la lista se cargan más
document.getElementById('chatGifCuerpo').addEventListener('scroll', function () {
  if (_gifEstado.mas && !_gifEstado.cargando && this.scrollHeight - this.scrollTop - this.clientHeight < 200) cargarGifs(false);
}, { passive: true });

async function enviarGifChat(btn) {
  const g = { url: btn.dataset.url, vista: btn.dataset.vista };
  cerrarGifChat();
  guardarGifReciente(g);
  try {
    await enviarAdjuntoChat({ gif: g.url });
    await cargarChat(true);
  } catch (err) { toast(textoError(err, 'No se pudo enviar el GIF'), 'e'); }
}
