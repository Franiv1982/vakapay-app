// public/google-login.js — «Seguir con Google» (#69)
// ================================================================
// · Web: botón oficial de Google (Google Identity Services).
// · APK: hoja de cuentas de Google del móvil (plugin @capgo/capacitor-social-login).
// Las dos dan un «ID token» de Google que se envía a POST /auth/google:
//   · si ya hay cuenta con ese email → se entra;
//   · si no → pantalla «Completa tu registro»: nombre, teléfono y aceptar
//     Términos y Privacidad (POST /auth/google/registro).
// Si en Vercel no está GOOGLE_CLIENT_ID, el botón sigue diciendo «Próximamente».
// ================================================================
(function () {
  const API = 'https://vakapay-app.vercel.app/api/v1';
  let clientId = null, billete = null;

  const nativa = () => !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());
  const plugin = () => window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.SocialLogin;
  const tema = () => document.documentElement.getAttribute('data-theme') === 'light' ? 'outline' : 'filled_black';

  function entrar() { location.replace('index.html'); }

  function errorGoogle(err, porDefecto) {
    const msg = (err && err.status && err.message) ? err.message
      : (!err || !err.status) ? 'No se pudo conectar con el servidor. Revisa tu conexión a internet e inténtalo de nuevo.' : porDefecto;
    mostrarAvisoLogin(err && err.data && err.data.cuenta_bloqueada ? 'Cuenta desactivada' : 'No se pudo entrar con Google', msg, 'error');
  }

  // Lo que devuelve Google (en la web o en la APK) se comprueba en el servidor
  async function enviarCredencial(credencial) {
    const boton = document.getElementById('btnGoogle');
    if (boton) boton.disabled = true;
    try {
      const r = await vakaData.loginGoogle(credencial);
      if (r.token) { entrar(); return; }
      if (r.registro_pendiente) {
        billete = r.billete;
        document.getElementById('g-email').textContent = r.email || '';
        document.getElementById('g-nombre').value = r.nombre || '';
        document.getElementById('g-tel').value = '';
        document.getElementById('g-acepta').checked = false;
        comprobarRegistroGoogle();
        switchPage('page-registro-google');
      }
    } catch (err) {
      errorGoogle(err, 'Google no ha confirmado tu identidad. Inténtalo de nuevo.');
    } finally {
      if (boton) boton.disabled = false;
    }
  }
  window.enviarCredencialGoogle = enviarCredencial;

  // APK: hoja de cuentas de Google del móvil
  async function entrarConGoogleApk() {
    const P = plugin();
    try {
      await P.initialize({ google: { webClientId: clientId, skipAuthOnlyAuthorizationAfterSignIn: true } });
      const res = await P.login({ provider: 'google', options: {} });
      const idToken = res && res.result && res.result.idToken;
      if (!idToken) throw new Error('sin token');
      await enviarCredencial(idToken);
    } catch (e) {
      if (/cancel/i.test(String(e && (e.message || e.code) || ''))) return;   // la persona cerró la hoja
      mostrarAvisoLogin('No se pudo entrar con Google', 'Google no ha respondido. Comprueba que tienes una cuenta de Google en el móvil e inténtalo de nuevo.', 'error');
    }
  }

  // Web: botón oficial de Google en lugar del nuestro
  function prepararWeb() {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => {
      try {
        google.accounts.id.initialize({ client_id: clientId, callback: r => enviarCredencial(r.credential), ux_mode: 'popup', context: 'signin' });
        const caja = document.getElementById('gisBoton'), nuestro = document.getElementById('btnGoogle');
        const ancho = Math.min(400, Math.max(200, Math.round((nuestro || caja).getBoundingClientRect().width || 320)));
        google.accounts.id.renderButton(caja, { type: 'standard', theme: tema(), size: 'large', shape: 'pill', text: 'continue_with', locale: 'es', width: ancho });
        caja.style.display = 'flex';
        if (nuestro) nuestro.style.display = 'none';
      } catch (_) { /* si falla, se queda nuestro botón con «Próximamente» */ }
    };
    document.head.appendChild(s);
  }

  async function preparar() {
    try {
      const r = await fetch(`${API}/auth/google-config`, { cache: 'no-store' });
      const cfg = r.ok ? await r.json() : null;
      if (!cfg || !cfg.disponible) return;   // sin configurar: «Próximamente»
      clientId = cfg.client_id;
      const boton = document.getElementById('btnGoogle');
      if (nativa() && plugin()) { if (boton) boton.onclick = entrarConGoogleApk; }
      else if (!nativa()) prepararWeb();
    } catch (_) { /* sin conexión: se queda como está */ }
  }

  // ── «Completa tu registro» ──
  window.comprobarRegistroGoogle = function () {
    const ok = document.getElementById('g-nombre').value.trim().length >= 3
      && document.getElementById('g-tel').value.trim().length >= 8
      && document.getElementById('g-acepta').checked;
    document.getElementById('btnRegistroGoogle').disabled = !ok;
  };
  window.completarRegistroGoogle = async function () {
    const b = document.getElementById('btnRegistroGoogle');
    if (b.disabled) return;
    let tel = document.getElementById('g-tel').value.trim();
    if (!tel.startsWith('+')) { mostrarAvisoLogin('Falta el prefijo', 'Escribe el teléfono con el prefijo del país, por ejemplo +34 600 000 000.', 'error'); return; }
    if (window.libphonenumber) {
      const n = libphonenumber.parsePhoneNumberFromString(tel);
      if (!n || !n.isValid()) { mostrarAvisoLogin('Teléfono no válido', 'El número de teléfono no es válido para ese país.', 'error'); return; }
      tel = `+${n.countryCallingCode} ${n.nationalNumber}`;
    }
    const texto = b.textContent;
    b.disabled = true; b.textContent = 'Creando cuenta…';
    try {
      await vakaData.registroGoogle({ billete, nombre: document.getElementById('g-nombre').value.trim(), tel, acepta: true });
      entrar();
    } catch (err) {
      b.textContent = texto; comprobarRegistroGoogle();
      if (err && err.status === 400 && /minutos/.test(err.message)) switchPage('page-login-inicio');
      errorGoogle(err, 'No se pudo crear la cuenta.');
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', preparar);
  else preparar();
})();
