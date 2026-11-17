// public/enlaces-app.js — Enlaces de invitación que abren la APK (#70, App Links)
// ================================================================
// Si alguien con la app instalada toca https://vakapay-app.vercel.app/login.html?invite=…,
// Android abre la app (no el navegador) y le pasa el enlace. Aquí se recoge:
//   · con la app ya abierta  → evento «appUrlOpen»
//   · con la app cerrada     → App.getLaunchUrl() al arrancar
// La invitación se guarda como pendiente (vp_pending_invite), igual que en la web:
//   · con sesión, en la pantalla principal → se procesa al momento
//   · con sesión, en otra página           → se va a la principal, que la procesa
//   · sin sesión                           → se procesa al entrar o registrarse
// En la web no hace nada (el navegador ya abre login.html?invite=… directamente).
// ================================================================
(function () {
  const App = window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()
    && Capacitor.Plugins && Capacitor.Plugins.App;
  if (!App) return;

  const YA = 'vp_enlace_abierto';   // para no procesar dos veces el mismo enlace al arrancar

  function invitacionDe(url) {
    try {
      const u = new URL(url);
      if (u.hostname !== 'vakapay-app.vercel.app') return null;
      const t = u.searchParams.get('invite');
      return t && /^[\w-]{6,200}$/.test(t) ? t : null;
    } catch { return null; }
  }

  function abrir(url, alArrancar) {
    const token = invitacionDe(url);
    if (!token) return;
    const conSesion = !!localStorage.getItem('vp_token');
    // Al arrancar, Android repite el mismo enlace en cada página: solo se usa una vez con sesión
    if (alArrancar && conSesion && sessionStorage.getItem(YA) === url) return;
    try { localStorage.setItem('vp_pending_invite', token); } catch { return; }
    if (!conSesion) return;                          // sin sesión: tras entrar se procesa
    if (alArrancar) sessionStorage.setItem(YA, url);
    const enPrincipal = /index\.html$|\/$/.test(location.pathname);
    if (!enPrincipal) { location.replace('index.html'); return; }
    // En la principal: si ya terminó de cargar se procesa ya; si no, la carga la recoge
    if (typeof procesarInvitacion === 'function' && typeof cargandoInicial !== 'undefined' && !cargandoInicial) {
      procesarInvitacion(token);
    }
  }

  // Después de que la página haya hecho su limpieza inicial (login.html borra lo
  // que queda de sesiones anteriores al cargar, y se llevaría la invitación)
  function cuandoCargue(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  if (App.addListener) App.addListener('appUrlOpen', (e) => cuandoCargue(() => abrir(e && e.url, false)));
  if (App.getLaunchUrl) {
    App.getLaunchUrl().then(r => { if (r && r.url) cuandoCargue(() => abrir(r.url, true)); }).catch(() => {});
  }
})();
