// public/js/avisos.js — Avisos y errores: toast, ventana de error, mensajes claros, bloquear botones
// (antes dentro de index.html; el orden de carga está en index.html)

// ═══ AVISOS ══════════════════════════════════════════════════════════════
// Avisos de la app:
//   'e' (error)  → ventana que hay que cerrar con «Entendido»: un error no puede pasar desapercibido
//   's' (hecho)  → aviso verde con ✓ abajo, que se va solo
//   'i' (info)   → aviso amarillo abajo, que se va solo
let toastT;
function toast(msg, type = 'i') {
  if (type === 'e') { mostrarError(msg); return; }
  const el = document.getElementById('toast');
  if (!el) return;
  el.innerHTML = `<span class="t-ico">${icono(type === 's' ? 'check' : 'info', type === 's' ? 15 : 17)}</span><span></span>`;
  el.lastChild.textContent = msg;
  el.className = 'toast show ' + (type === 's' ? 'toast-s' : 'toast-i');
  clearTimeout(toastT);
  toastT = setTimeout(() => { el.className = 'toast'; }, 3800);
}

function mostrarError(msg, titulo) {
  let m = document.getElementById('modal-error');
  if (!m) {
    m = document.createElement('div');
    m.className = 'modal-overlay'; m.id = 'modal-error';
    m.style.cssText = 'display:none;z-index:10001;';
    m.setAttribute('onclick', 'if(event.target===this)cerrarError()');
    m.innerHTML = `<div class="ventana" role="alertdialog" aria-modal="true" aria-labelledby="me-titulo" aria-describedby="me-texto" tabindex="-1">
      <div class="me-ico">${icono('alerta', 26)}</div>
      <div class="me-titulo" id="me-titulo"></div>
      <p class="me-texto" id="me-texto"></p>
      <button type="button" class="btn btn-gold u-w-100p" onclick="cerrarError()">Entendido</button></div>`;
    document.body.appendChild(m);
  }
  // Red de seguridad: si llega un texto técnico (del navegador o del código), se cambia por uno comprensible
  if (!msg || /failed to fetch|networkerror|load failed|typeerror|referenceerror|undefined|null|unexpected token|json|\(\d{3}\)|^error\b/i.test(String(msg)))
    msg = 'No se pudo completar la acción. Revisa tu conexión e inténtalo de nuevo.';
  m.querySelector('#me-titulo').textContent = titulo || 'No se ha podido hacer';
  m.querySelector('#me-texto').textContent = msg;
  m.style.display = 'flex';
  setTimeout(() => m.querySelector('button').focus({ preventScroll: true }), 60);
}
function cerrarError() { const m = document.getElementById('modal-error'); if (m) m.style.display = 'none'; }

// Texto de error comprensible: sin conexión, servidor caído o el motivo que da el servidor
function textoError(err, porDefecto = 'No se pudo completar la acción.') {
  if (!/[.!?]$/.test(porDefecto)) porDefecto += '.';
  if (!err) return porDefecto;
  if (!navigator.onLine) return 'No tienes conexión a internet. Cuando vuelvas a tenerla, inténtalo de nuevo.';
  if (!err.status) return porDefecto + ' No hubo respuesta del servidor; revisa tu conexión e inténtalo de nuevo.';
  if (err.status >= 500) return porDefecto + ' El servidor ha tenido un problema; inténtalo de nuevo en un momento.';
  return err.message || porDefecto;
}

// Bloquea un botón mientras se guarda (el servidor puede tardar) para que un
// segundo toque no repita la acción. Devuelve la función que lo desbloquea,
// o null si ya estaba bloqueado.
function bloquearBoton(btn, texto = 'Guardando…') {
  if (!btn) return () => {};
  if (btn.dataset.ocupado) return null;
  btn.dataset.ocupado = '1';
  const antes = btn.innerHTML;
  btn.disabled = true; btn.setAttribute('aria-busy', 'true'); btn.textContent = texto;
  return () => { delete btn.dataset.ocupado; btn.disabled = false; btn.removeAttribute('aria-busy'); btn.innerHTML = antes; };
}

// «Reintentar» cuando no se pudieron cargar los grupos
async function reintentarCarga() {
  const listo = bloquearBoton(document.getElementById('btnReintentarCarga'), 'Cargando…');
  if (!listo) return;
  groups = await vakaData.getGroups() || [];
  if (groups.length && typeof updateBalances === 'function') updateBalances();
  renderGroupsList();
  if (vakaData.cargaFallida) toast('Sigue sin haber conexión. Inténtalo de nuevo en un momento.', 'i');
  else { refrescarActividad(); toast('Datos actualizados', 's'); }
}
