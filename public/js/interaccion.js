// public/js/interaccion.js — Interacción: altura de cabecera, deslizar entre pantallas, cámara o galería, botón Grupos
// (antes dentro de index.html; el orden de carga está en index.html)

function ajustarAlturaHeader() {
  const header = document.querySelector('header');
  if (header) {
    document.documentElement.style.setProperty('--header-h', header.offsetHeight + 'px');
  }
  posicionarBadge();
}
window.addEventListener('load', ajustarAlturaHeader);
document.addEventListener('click', (e) => {
  const el = e.target;
  if (el && el.matches && el.matches('input[type="date"]') && typeof el.showPicker === 'function') {
    try { el.showPicker(); } catch (_) {}
  }
});
window.addEventListener('resize', ajustarAlturaHeader);

function posicionarBadge() {
  const detBar = document.querySelector('.page.active .det-bar');
  const badge = document.getElementById('hbadge');
  if (!detBar || !badge) return;
  const rect = detBar.getBoundingClientRect();
  const centerY = rect.top + rect.height / 2;
  badge.style.top = (centerY - badge.offsetHeight / 2) + 'px';
}

// ═══ SCROLL: DESBLOQUEO DE SEGURIDAD ══════════════════════════════
// Los modales y el chat bloquean el scroll de la página mientras están abiertos
// (body overflow:hidden). Si alguno se cerraba por un camino que no lo
// desbloqueaba (botón atrás, cambiar de pestaña, dos modales seguidos…), la app
// se quedaba sin scroll. Esto lo desbloquea en cuanto no queda ninguna capa abierta.
const CAPAS_QUE_BLOQUEAN = '.modal-overlay, [id^="modal-"], [id$="Modal"], #modalLogout, #page-chat';
function desbloquearScrollSiProcede() {
  if (document.body.style.overflow !== 'hidden') return;
  const abierta = [...document.querySelectorAll(CAPAS_QUE_BLOQUEAN)].some(el =>
    el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden');
  if (!abierta) document.body.style.overflow = '';
}
['click', 'touchend', 'keyup'].forEach(ev =>
  document.addEventListener(ev, () => setTimeout(desbloquearScrollSiProcede, 350), true));
setInterval(desbloquearScrollSiProcede, 1500);

// ═══ NAVEGACIÓN POR DESLIZAMIENTO (SWIPE) ══════════════════════════
// Adicional al tap en los botones de abajo — no lo reemplaza.
const MAIN_PAGES = ['page-grupos', 'page-amigos', 'page-stats', 'page-actividad', 'page-cuenta'];

(function setupSwipeNav() {
  let touchStartX = 0, touchStartY = 0;
  const THRESHOLD = 70; // píxeles mínimos para considerarlo un swipe intencional

  document.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    const touchEndX = e.changedTouches[0].screenX;
    const touchEndY = e.changedTouches[0].screenY;
    handleSwipeGesture(touchEndX - touchStartX, touchEndY - touchStartY);
  }, { passive: true });

    function handleSwipeGesture(deltaX, deltaY) {
    // Solo si el movimiento es claramente horizontal (evita pelear con el scroll vertical)
    if (Math.abs(deltaX) < THRESHOLD || Math.abs(deltaX) < Math.abs(deltaY) * 1.5) return;

    const activePage = document.querySelector('.page.active');
    if (!activePage) return;

    // El detalle de un grupo cuenta como la pestaña "Grupos"
    const currentId = activePage.id === 'page-detalle' ? 'page-grupos' : activePage.id;
    const currentIdx = MAIN_PAGES.indexOf(currentId);
    if (currentIdx === -1) return; // ej: detalle de un gasto, ahí no hay carrusel

    let nextIdx = currentIdx;
    if (deltaX < 0 && currentIdx < MAIN_PAGES.length - 1) nextIdx = currentIdx + 1; // swipe a la izquierda → siguiente
    if (deltaX > 0 && currentIdx > 0) nextIdx = currentIdx - 1;                     // swipe a la derecha → anterior
    if (nextIdx === currentIdx) return;

    const nextPageId = MAIN_PAGES[nextIdx];

    // Si vuelve a "Grupos" y había un grupo seleccionado, regresa a ese grupo
    const hayGrupo = currentGroupIdx !== null && currentGroupIdx >= 0 && groups[currentGroupIdx];
    if (nextPageId === 'page-grupos' && hayGrupo) {
      volverAlGrupoActual();
      return;
    }

    const nextBtn = document.querySelector(`.nav-btn[data-page="${nextPageId}"]`);
    switchPage(nextPageId, nextBtn);
    if (nextPageId === 'page-stats' && typeof renderStats === 'function') renderStats();
  }
})();


// ═══ CÁMARA O GALERÍA ═════════════════════════════════════════════════
// Cualquier botón que pide una imagen (ticket, comprobante, foto de perfil o de un amigo)
// muestra primero dos opciones: hacer una foto con la cámara o elegirla de la galería.
// En el ordenador no hay «Hacer foto»: los navegadores de escritorio ignoran la
// cámara en estos campos y abren siempre las carpetas. Ahí se va directo a elegir archivo.
let _inputImagenPendiente = null;
let _abriendoImagen = false;
const puedeHacerFoto = () =>
  esAppNativa ||
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
  (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);   // iPad con iPadOS

document.addEventListener('click', (e) => {
  const input = e.target;
  if (!input || input.tagName !== 'INPUT' || input.type !== 'file') return;
  if (!/image/.test(input.accept || '')) return;
  if (_abriendoImagen) return;           // la abrimos nosotros tras elegir opción: dejar pasar
  if (!puedeHacerFoto()) { input.removeAttribute('capture'); return; }   // ordenador: directo a las carpetas
  e.preventDefault();                    // se cancela el selector y se muestran las opciones
  _inputImagenPendiente = input;
  document.getElementById('origenImagenModal').style.display = 'flex';
}, true);

function elegirOrigenImagen(origen) {
  const input = _inputImagenPendiente;
  cerrarOrigenImagen();
  if (!input) return;
  if (origen === 'camara') input.setAttribute('capture', 'environment');
  else input.removeAttribute('capture');
  _abriendoImagen = true;
  try { input.click(); } finally { _abriendoImagen = false; }
}

function cerrarOrigenImagen() {
  document.getElementById('origenImagenModal').style.display = 'none';
}

// Evita que una doble pulsación ejecute dos veces la misma acción
// (crear dos grupos iguales, añadir dos veces el mismo amigo o participante...)
function sinDoblePulsacion(fn) {
  let ocupado = false;
  return async function (...args) {
    if (ocupado) return;
    ocupado = true;
    try { return await fn.apply(this, args); }
    finally { ocupado = false; }
  };
}
createGroup = sinDoblePulsacion(createGroup);
addFriend   = sinDoblePulsacion(addFriend);
addMember   = sinDoblePulsacion(addMember);

// Reabre el grupo seleccionado sin volver a pedirlo al servidor
function volverAlGrupoActual() {
  const g = groups[currentGroupIdx];
  if (!g) return;
  switchPage('page-detalle', document.querySelector('.nav-btn[data-page="page-grupos"]'));
  pintarTituloGrupo(g);
  document.getElementById('detMeta').textContent = fmtDate(g.start) + ' → ' + fmtDate(g.end);
  const badge = document.getElementById('hbadge');
  badge.innerHTML = iconoTipo(g.type, 13) + ' ' + escaparHtml(g.name);
  badge.style.display = 'block';
  renderAll();
  requestAnimationFrame(posicionarBadge);
}


// Botón "Grupos" de la barra inferior:
// - si hay un grupo seleccionado y no estás ya dentro de él → vuelve a ese grupo
// - si ya estás dentro del grupo (o no hay ninguno) → muestra la lista de grupos
function tocarBotonGrupos(btn) {
  const activa = document.querySelector('.page.active');
  const enDetalle = activa && activa.id === 'page-detalle';
  const hayGrupo = currentGroupIdx !== null && currentGroupIdx >= 0 && groups[currentGroupIdx];
  if (hayGrupo && !enDetalle) {
    volverAlGrupoActual();
  } else {
    switchPage('page-grupos', btn);
  }
}
