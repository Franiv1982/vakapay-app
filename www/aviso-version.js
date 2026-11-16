// public/aviso-version.js — «Hay una versión nueva» y modo mantenimiento (#73)
// ================================================================
// Al abrir la app (y al volver a ella) pregunta al servidor por
// /api/v1/estado, que se configura en Vercel (ver src/routes/estado.js):
//
//   · Mantenimiento: si hay texto, tapa la app con ese mensaje y un botón
//     «Reintentar». En la APK y en la web.
//   · Versión mínima: solo en la APK. Si su versionCode
//     (android/app/build.gradle) es menor que el mínimo, tapa la app con
//     «Hay una versión nueva» y el botón «Descargar».
//
// La web no necesita aviso de versión: siempre carga la última de Vercel.
// Sin conexión o si el servidor no responde, no se enseña nada.
// ================================================================
(function () {
  const URL_ESTADO = 'https://vakapay-app.vercel.app/api/v1/estado';
  const ESPERA_MAX = 6000;        // ms; si tarda más, se sigue sin aviso
  const ENTRE_CONSULTAS = 60000;  // ms; como mucho una consulta por minuto al volver

  const nativa = () => !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());

  const css = `
  .aviso-app{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;
    padding:24px;background:var(--dark);color:var(--text);font-family:var(--font)}
  .aviso-app-caja{width:100%;max-width:360px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:var(--s-3)}
  .aviso-app-icono{width:72px;height:72px;border-radius:50%;display:flex;align-items:center;justify-content:center;
    background:var(--gold-soft);color:var(--gold-text);margin-bottom:var(--s-2)}
  .aviso-app h1{font-family:var(--font-display);font-weight:400;font-size:2rem;letter-spacing:1px;line-height:1.1;margin:0;color:var(--text)}
  .aviso-app p{margin:0;font-size:var(--fs-base);line-height:1.5;color:var(--text2);white-space:pre-line;overflow-wrap:anywhere}
  .aviso-app-boton{margin-top:var(--s-4);width:100%;min-height:var(--alto-control);padding:12px 16px;border:none;border-radius:var(--r-md);
    background:var(--gold);color:var(--on-gold);font-family:var(--font);font-weight:800;font-size:var(--fs-base);
    letter-spacing:.4px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;text-decoration:none}
  .aviso-app-boton:focus-visible{outline:3px solid var(--gold-line);outline-offset:3px}
  .aviso-app-boton[disabled]{opacity:.6;cursor:default}
  .aviso-app-nota{font-size:var(--fs-sm)!important;color:var(--muted)!important}
  html.con-aviso-app body{overflow:hidden}`;

  const ICONO = {
    descargar: '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    herramienta: '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
  };

  let ultimaConsulta = 0;
  let consultando = false;

  function ponerEstilos() {
    if (document.getElementById('aviso-app-estilos')) return;
    const st = document.createElement('style');
    st.id = 'aviso-app-estilos';
    st.textContent = css;
    document.head.appendChild(st);
  }

  function quitarAviso() {
    const viejo = document.getElementById('avisoApp');
    if (viejo) viejo.remove();
    document.documentElement.classList.remove('con-aviso-app');
  }

  // tipo: 'version' | 'mantenimiento'
  function mostrarAviso(tipo, datos) {
    ponerEstilos();
    quitarAviso();
    const caja = document.createElement('div');
    caja.id = 'avisoApp';
    caja.className = 'aviso-app';
    caja.setAttribute('role', 'alertdialog');
    caja.setAttribute('aria-modal', 'true');
    caja.setAttribute('aria-labelledby', 'avisoAppTitulo');
    caja.setAttribute('aria-describedby', 'avisoAppTexto');
    caja.dataset.tipo = tipo;

    const interior = document.createElement('div');
    interior.className = 'aviso-app-caja';
    const icono = document.createElement('div');
    icono.className = 'aviso-app-icono';
    icono.innerHTML = tipo === 'version' ? ICONO.descargar : ICONO.herramienta;
    const h1 = document.createElement('h1');
    h1.id = 'avisoAppTitulo';
    const p = document.createElement('p');
    p.id = 'avisoAppTexto';
    interior.append(icono, h1, p);

    let boton = null;
    if (tipo === 'version') {
      h1.textContent = 'Hay una versión nueva';
      p.textContent = 'Para seguir usando VakaPay, instala la última versión de la app. Tus grupos y gastos no se pierden.';
      if (datos.url_descarga) {
        boton = document.createElement('a');
        boton.className = 'aviso-app-boton';
        boton.href = datos.url_descarga;
        // Sin target: en la APK, abrir un enlace de fuera lo manda al navegador del móvil
        boton.rel = 'noopener';
        boton.textContent = 'Descargar';
        const nota = document.createElement('p');
        nota.className = 'aviso-app-nota';
        nota.textContent = 'Cuando se descargue, ábrela e instálala encima de esta.';
        interior.append(boton, nota);
      } else {
        const nota = document.createElement('p');
        nota.className = 'aviso-app-nota';
        nota.textContent = 'Pide la versión nueva a quien te pasó la app.';
        interior.append(nota);
      }
    } else {
      h1.textContent = 'Estamos en mantenimiento';
      p.textContent = datos.mantenimiento;
      boton = document.createElement('button');
      boton.type = 'button';
      boton.className = 'aviso-app-boton';
      boton.textContent = 'Reintentar';
      boton.addEventListener('click', async () => {
        boton.disabled = true;
        boton.textContent = 'Comprobando…';
        await comprobar(true);
        // Si sigue en mantenimiento, comprobar() ha vuelto a pintar el aviso
        const b = document.querySelector('#avisoApp .aviso-app-boton');
        if (b && b !== boton) b.focus();
      });
      interior.append(boton);
    }

    caja.appendChild(interior);
    document.body.appendChild(caja);
    document.documentElement.classList.add('con-aviso-app');
    // Que nada de detrás reciba el foco ni lo lea el lector de pantalla
    for (const hijo of document.body.children) if (hijo !== caja) hijo.setAttribute('inert', '');
    h1.tabIndex = -1;
    (boton || h1).focus({ preventScroll: true });
  }

  function liberarFondo() {
    for (const hijo of document.body.children) hijo.removeAttribute('inert');
  }

  async function versionInstalada() {
    try {
      const App = Capacitor.Plugins && Capacitor.Plugins.App;
      if (!App || !App.getInfo) return null;
      const info = await App.getInfo();
      const n = parseInt(info && info.build, 10);
      return Number.isInteger(n) ? n : null;
    } catch { return null; }
  }

  async function pedirEstado() {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ESPERA_MAX);
    try {
      const r = await fetch(URL_ESTADO, { cache: 'no-store', signal: ctl.signal });
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
    finally { clearTimeout(t); }
  }

  async function comprobar(forzar) {
    if (consultando) return;
    if (!forzar && Date.now() - ultimaConsulta < ENTRE_CONSULTAS) return;
    consultando = true;
    ultimaConsulta = Date.now();
    try {
      const estado = await pedirEstado();
      if (!estado) {
        // Sin respuesta: si estaba el aviso de mantenimiento, se deja (no sabemos si acabó)
        const b = document.querySelector('#avisoApp[data-tipo="mantenimiento"] .aviso-app-boton');
        if (b) { b.disabled = false; b.textContent = 'Reintentar'; }
        return;
      }
      if (estado.mantenimiento) { mostrarAviso('mantenimiento', estado); return; }
      if (nativa() && estado.version_minima > 0) {
        const v = await versionInstalada();
        if (v !== null && v < estado.version_minima) { mostrarAviso('version', estado); return; }
      }
      if (document.getElementById('avisoApp')) { quitarAviso(); liberarFondo(); }
    } finally {
      consultando = false;
    }
  }

  function arrancar() {
    comprobar(true);
    // Al volver a la app (APK en segundo plano, o pestaña de la web)
    if (nativa() && Capacitor.Plugins && Capacitor.Plugins.App && Capacitor.Plugins.App.addListener) {
      Capacitor.Plugins.App.addListener('resume', () => comprobar(false));
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') comprobar(false);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar);
  else arrancar();
})();
