// public/js/atras.js — Botón atrás: Android y navegador (historial de la web)
// (antes dentro de index.html; el orden de carga está en index.html)

// «Atrás»: el mismo recorrido en la APK (botón de Android) y en la web (botón,
// gesto o tecla de atrás del navegador): ventana → chat → gasto → grupo →
// Mis grupos → «¿Deseas salir?».
function manejarAtras() {
    // Editando «Mis datos»: atrás es como «Cancelar»
    const edPerfil = document.getElementById('profileEditMode');
    const hayVentana = [...document.querySelectorAll('.modal-overlay, #modalLogout, #visorTicketModal, #origenImagenModal')].some(m => getComputedStyle(m).display !== 'none');
    if (!hayVentana && edPerfil && edPerfil.style.display !== 'none' && document.getElementById('page-cuenta')?.classList.contains('active')) {
      toggleEditProfile(); return;
    }
    // Chat abierto: primero se cierra su menú/diálogo, después el chat
    if (typeof chatAtras === 'function' && chatAtras()) return;
    // Visores a pantalla completa (comprobante, elegir cámara/galería): se cierran primero
    const visor = ['visorTicketModal', 'origenImagenModal'].map(id => document.getElementById(id))
      .find(v => v && getComputedStyle(v).display !== 'none');
    if (visor) { visor.style.display = 'none'; return; }
    // Si hay algún modal visible, ciérralo primero en vez de navegar.
    // Los que se abren con la clase «open» (Pagar, Comprobante, editar gasto, ficha de
    // amigo) se cierran con su propia función: ocultarlos con style.display='none'
    // los dejaba ocultos para siempre, y al volver a abrirlos no aparecían pero
    // la página quedaba sin scroll.
    const cierres = { payModal: closePayModal, proofModal: closeProofModal, editModal: closeEditModal, friendModal: closeFriendModal };
    const openModal = [...document.querySelectorAll('.modal-overlay')]
      .find(m => getComputedStyle(m).display !== 'none');
    if (openModal) {
      if (cierres[openModal.id]) cierres[openModal.id]();
      else if (openModal.classList.contains('open')) openModal.classList.remove('open');
      else openModal.style.display = 'none';
      document.body.style.overflow = '';
      return;
    }

    const currentPage = document.querySelector('.page.active').id;
    if (currentPage === 'page-gasto') {
      // Mismo comportamiento que el botón "← Volver" del detalle de gasto
      goBackToGroup();
    } else if (currentPage === 'page-grupos') {
      document.getElementById('modal-salir-app').style.display = 'flex';
      document.body.style.overflow = 'hidden';
    } else {
      goBack();
    }
}

const esAppNativa = !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());
if (esAppNativa && Capacitor.Plugins.App) {
  Capacitor.Plugins.App.addListener('backButton', manejarAtras);
} else {
  // Web: el historial del navegador sigue la «profundidad» de la app (Mis grupos → grupo →
  // chat/gasto → ventana). Chrome tiene una protección contra webs que secuestran el botón
  // atrás: si la página añade UN solo paso sin que el usuario haya tocado nada desde el
  // último «atrás», se salta TODOS los pasos de la app. Por eso solo se añaden pasos si
  // ha habido un toque o tecla del usuario después del último «atrás» (variable «activo»).
  let pasos = 0;           // pasos añadidos por la app encima de la página
  let ignorar = 0;         // «atrás» lanzados por la propia app que no hay que procesar
  let activo = false;      // toque/tecla del usuario desde el último «atrás»
  let saliendoDeLaWeb = false;
  // ¿Hay una página anterior a la app en esta pestaña? Si no, no hay a dónde «salir»:
  // en Mis grupos el atrás del navegador se comporta como en cualquier web.
  let hayPaginaAnterior = true;
  try {
    if (sessionStorage.getItem('vp_hay_anterior') === null)
      sessionStorage.setItem('vp_hay_anterior', history.length > 1 ? '1' : '0');
    hayPaginaAnterior = sessionStorage.getItem('vp_hay_anterior') === '1';
  } catch (_) {}
  const profundidad = () => {
    const ventana = [...document.querySelectorAll('.modal-overlay, #modalLogout')].some(m => getComputedStyle(m).display !== 'none');
    const pagina = (document.querySelector('.page.active') || {}).id;
    const chat = document.getElementById('page-chat')?.classList.contains('active');
    let d = hayPaginaAnterior ? 1 : 0;                    // 1 = guarda en «Mis grupos» (para «¿Deseas salir?»)
    if (pagina && pagina !== 'page-grupos') d = 2;        // grupo, Amigos, Estadísticas…
    if (pagina === 'page-gasto' || chat) d = 3;           // dentro del grupo
    const editandoPerfil = pagina === 'page-cuenta' && document.getElementById('profileEditMode')?.style.display !== 'none';
    return d + (ventana || editandoPerfil ? 1 : 0);
  };
  const sincronizarHistorial = () => {
    if (saliendoDeLaWeb) return;
    const objetivo = profundidad();
    try {
      if (pasos < objetivo && activo) {
        while (pasos < objetivo) { history.pushState({ vakapay: pasos + 1 }, ''); pasos++; }
      } else if (pasos > objetivo) {   // se volvió con los botones de la app: se quitan los pasos sobrantes
        const sobran = pasos - objetivo; ignorar += sobran; pasos = objetivo; history.go(-sobran);
      }
    } catch (_) {}
  };
  const marcarActivo = e => { if (e.isTrusted) activo = true; };
  ['pointerdown', 'touchend', 'keydown'].forEach(t => document.addEventListener(t, marcarActivo, true));
  // Tras cada toque o tecla, y cada poco por si una pantalla tarda en abrir (o se cambia deslizando)
  const trasInteraccion = () => { setTimeout(sincronizarHistorial, 60); setTimeout(sincronizarHistorial, 900); };
  ['click', 'touchend', 'keyup'].forEach(t => document.addEventListener(t, trasInteraccion, true));
  setInterval(sincronizarHistorial, 700);
  // Diagnóstico (solo si se abre con «?depurar-atras»): muestra en una esquina lo que ve la app
  let depurar = false;
  try {
    if (location.search.includes('depurar-atras')) sessionStorage.setItem('vp_depurar_atras', '1');
    depurar = sessionStorage.getItem('vp_depurar_atras') === '1';
  } catch (_) {}
  const registro = [];
  const anotar = txt => {
    if (!depurar) return;
    registro.unshift(new Date().toLocaleTimeString('es-ES') + ' ' + txt); registro.length = Math.min(registro.length, 6);
    let c = document.getElementById('depurarAtras');
    if (!c) { c = document.createElement('div'); c.id = 'depurarAtras';
      c.style.cssText = 'position:fixed;left:6px;bottom:70px;z-index:2147483646;background:rgba(0,0,0,.82);color:#9f9;font:11px/1.35 monospace;padding:6px 8px;border-radius:6px;pointer-events:none;max-width:70vw;white-space:pre-wrap';
      document.body.appendChild(c); }
    c.textContent = `pasos ${pasos} · prof ${profundidad()} · hist ${history.length} · toque ${activo ? 'sí' : 'no'} · anterior ${hayPaginaAnterior ? 'sí' : 'no'}\n` + registro.join('\n');
  };
  if (depurar) setInterval(() => anotar('·'), 1500);
  const pushOriginal = history.pushState.bind(history);
  history.pushState = (...a) => { anotar('añade paso' + (activo ? '' : ' SIN TOQUE')); return pushOriginal(...a); };
  window.addEventListener('popstate', () => {
    anotar('atrás' + (ignorar > 0 ? ' (de la app)' : ''));
    if (saliendoDeLaWeb) return;
    if (ignorar > 0) { ignorar--; return; }
    activo = false;                               // Chrome exige un nuevo toque antes de añadir pasos
    pasos = Math.max(0, pasos - 1);
    if (profundidad() > pasos) manejarAtras();    // un paso de la app por cada «atrás»
  });
  // «Sí, salir» en la web: vuelve a la página anterior a la app (sin cerrar la sesión)
  window.salirDeLaWeb = function () {
    cerrarModalSalir();
    saliendoDeLaWeb = true;
    history.go(-(pasos + 1));
    setTimeout(() => {   // si no había a dónde volver
      if (document.visibilityState === 'visible') {
        saliendoDeLaWeb = false; hayPaginaAnterior = false;
        try { sessionStorage.setItem('vp_hay_anterior', '0'); } catch (_) {}
        toast('Ya puedes cerrar esta pestaña. Tu sesión sigue abierta.', 'i');
      }
    }, 800);
  };
}

function cerrarModalSalir() {
  document.getElementById('modal-salir-app').style.display = 'none';
  document.body.style.overflow = '';
}
