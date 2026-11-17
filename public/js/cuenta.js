// public/js/cuenta.js — Cuenta: perfil, estadísticas propias, borrar datos y eliminar cuenta
// (antes dentro de index.html; el orden de carga está en index.html)

// ═══ PERFIL ══════════════════════════════════════════════════════════════
function loadProfile(){
  if(!profile) return;
  pintarAvisoFoto();
  // También los vacíos: si no, al cancelar se quedaba lo escrito en Bizum o IBAN
  const set = (id, val) => { const el = document.getElementById(id); if(el) el.value = val || ''; };
  set('profNombre', profile.nombre);
  set('profEmail',  profile.email);
  set('profTel',    profile.tel);
  set('profBizum',  profile.pago_bizum);
  set('profIban',   formatearIban(profile.pago_iban));

  // Avatar
  const wrap = document.getElementById('avatarDisplay');
  if (wrap) {
    const inicial = profile.nombre ? profile.nombre.charAt(0).toUpperCase() : '';
    if (profile.avatar) {
      const img = document.createElement('img');
      img.id = 'avatarDisplay'; img.className = 'avatar-img';
      img.src = profile.avatar; img.alt = 'Avatar';
      hacerAmpliable(img);
      img.onerror = function() {
        profile.avatar = null;
        const ph = document.createElement('div');
        ph.id = 'avatarDisplay'; ph.className = 'avatar-placeholder'; hacerInicialAmpliable(ph);
        if (inicial) ph.textContent = inicial; else ph.innerHTML = icono('usuario', 40);
        if (this.parentNode) this.parentNode.replaceChild(ph, this);
      };
      if (wrap.parentNode) wrap.parentNode.replaceChild(img, wrap);
    } else {
      const ph = document.createElement('div');
      ph.id = 'avatarDisplay'; ph.className = 'avatar-placeholder'; hacerInicialAmpliable(ph);
      if (inicial) ph.textContent = inicial; else ph.innerHTML = icono('usuario', 40);
      if (wrap.parentNode) wrap.parentNode.replaceChild(ph, wrap);
    }
  }

    // Nav inicial
  const navImg = document.getElementById('user-nav-photo');
  const navInitials = document.getElementById('user-nav-initials');
  if (navImg && navInitials) {
    if (profile.nombre) navInitials.textContent = profile.nombre.charAt(0).toUpperCase(); else navInitials.innerHTML = icono('usuario', 15);
    if (profile.avatar) {
      navImg.src = profile.avatar;
      navImg.style.display = 'block';
      navInitials.style.display = 'none';
    } else {
      navImg.style.display = 'none';
      navInitials.style.display = 'block';
      if (profile.nombre) navInitials.textContent = profile.nombre.charAt(0).toUpperCase(); else navInitials.innerHTML = icono('usuario', 15);
    }
  }

  updateProfilePreview();
  updateReadMode();
}

// ═══ VENTANAS DE CUENTA (Mis datos · Datos de cobro · Apariencia) ═════════
// Cada fila de Cuenta abre su ventana. Al abrir, los campos se rellenan con lo
// guardado; «Cancelar», «Cerrar», tocar fuera o atrás la cierran sin guardar.
let ventanaCuenta = null, guardandoPerfil = false;
function abrirVentanaCuenta(id) {
  loadProfile();   // siempre con los datos guardados
  ventanaCuenta = id;
  document.getElementById(id).classList.add('open');
  document.body.style.overflow = 'hidden';
  if (id === 'modalApariencia') pintarResumenTema();
  const primero = document.querySelector(`#${id} input, #${id} .opciones-tema .activa`);
  setTimeout(() => primero?.focus({ preventScroll: true }), 50);
}
function cerrarVentanaCuenta() {
  if (guardandoPerfil || !ventanaCuenta) return;
  const id = ventanaCuenta;
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = '';
  ventanaCuenta = null;
  loadProfile();   // lo escrito sin guardar no se queda
  const fila = { modalMisDatos: 'btnMisDatos', modalCobros: 'btnCobros', modalApariencia: 'btnApariencia' }[id];
  document.getElementById(fila)?.focus({ preventScroll: true });
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && ventanaCuenta) cerrarVentanaCuenta(); });

// Apariencia: elegir aplica al momento; la fila muestra la elegida
const NOMBRE_TEMA = { auto: 'Automático', oscuro: 'Oscuro', claro: 'Claro' };
function elegirTema(t) { cambiarTema(t); pintarResumenTema(); }
function pintarResumenTema() {
  const t = (window.temaActual && temaActual()) || 'auto';
  const r = document.getElementById('resumenTema');
  if (r) r.textContent = NOMBRE_TEMA[t] || 'Automático';
  document.querySelectorAll('.opciones-tema [data-tema-opcion]').forEach(b => {
    const activa = b.dataset.temaOpcion === t;
    b.classList.toggle('activa', activa);
    b.setAttribute('aria-checked', activa ? 'true' : 'false');
  });
}
document.addEventListener('DOMContentLoaded', pintarResumenTema);

// «Grupos ›» y «Amigos ›»: van a su sección
function irAPantalla(id) {
  const boton = document.querySelector(`.nav-btn[data-page="${id}"]`);
  if (boton) boton.click(); else switchPage(id);
}

function updateReadMode() {
  const p = profile;
  if (!p) return;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '—'; };
  set('resumenMisDatos', [p.nombre || p.name, p.tel].filter(Boolean).join(' · ') || 'Nombre, email y teléfono');
  const cobros = [p.pago_bizum ? 'Bizum' : '', p.pago_iban ? 'Transferencia' : ''].filter(Boolean);
  set('readCobro', cobros.length ? cobros.join(' · ') : 'Sin configurar');
}

async function saveProfile() {
  const data = {
    nombre: document.getElementById('profNombre').value.trim(),
    email: document.getElementById('profEmail').value.trim(),
    tel: document.getElementById('profTel').value.trim(),
    pago_bizum: (document.getElementById('profBizum')?.value || '').trim(),
    pago_iban: (document.getElementById('profIban')?.value || '').replace(/\s+/g, '').toUpperCase(),
    avatar: profile.avatar || null
  };
  if (data.nombre.length < 3) return toast('El nombre debe tener al menos 3 caracteres', 'e');
  // Teléfono obligatorio, con prefijo y válido para su país (se guarda como "+34 608534056")
  if (!data.tel) return toast('Escribe tu teléfono con el prefijo del país (ej: +34 600 000 000)', 'e');
  if (!data.tel.startsWith('+')) return toast('Añade el prefijo del país al teléfono (ej: +34)', 'e');
  if (window.libphonenumber) {
    const n = libphonenumber.parsePhoneNumberFromString(data.tel);
    if (!n || !n.isValid()) return toast('El número de teléfono no es válido para ese país', 'e');
    data.tel = `+${n.countryCallingCode} ${n.nationalNumber}`;
  }
  if (data.pago_bizum && !/^\+?[\d\s-]{9,20}$/.test(data.pago_bizum)) return toast('El teléfono para Bizum no es válido', 'e');
  if (data.pago_iban && !ibanValido(data.pago_iban)) return toast('El IBAN no es válido. Revisa que esté completo.', 'e');
  // Mientras se guarda: «Guardando…» y la ventana quieta, sin poder cerrarla
  const id = ventanaCuenta;
  const soltarBoton = bloquearBoton(document.querySelector(`#${id} .btn-gold`), 'Guardando…');
  if (!soltarBoton) return;
  const soltarVentana = bloquearZona(document.querySelector(`#${id} .modal-sheet`));
  guardandoPerfil = true;
  try {
    profile = await vakaData.saveProfile(data);
    guardandoPerfil = false; soltarVentana(); soltarBoton();
    cerrarVentanaCuenta();
    updateProfilePreview();
    updateReadMode();
    await logActivity('Perfil actualizado');
    renderActivity();
    toast('Perfil guardado', 's');
    // Si cambió el nombre, en los grupos ya aparece con el nuevo: se recargan
    if (typeof refrescarGruposYAmigos === 'function') refrescarGruposYAmigos();
  } catch (error) {
    guardandoPerfil = false; soltarVentana(); soltarBoton();
    toast(error.status === 400 && error.message ? error.message : textoError(error, 'No se pudo guardar el perfil.'), 'e');
    console.error("Error en saveProfile:", error);
  }
}

function updateProfilePreview() {
  const n = document.getElementById('profNombre')?.value.trim() || profile.nombre || '';
  const e = document.getElementById('profEmail')?.value.trim() || profile.email || '';
  
  const displayName = document.getElementById('profileDisplayName');
  const displayEmail = document.getElementById('profileDisplayEmail');
  if (displayName) displayName.textContent = n || 'Tu Nombre';
  if (displayEmail) displayEmail.textContent = e || 'tu@email.com';

  const navImg = document.getElementById('user-nav-photo');
  const navInitials = document.getElementById('user-nav-initials');
  
    if (navImg && navInitials) {
    if (n) navInitials.textContent = n.charAt(0).toUpperCase(); else navInitials.innerHTML = icono('usuario', 15);
    if (profile.avatar) {
      navImg.src = profile.avatar;
      navImg.style.display = 'block';
      navInitials.style.display = 'none';
    } else {
      navImg.style.display = 'none';
      navInitials.style.display = 'block';
      if (n) navInitials.textContent = n.charAt(0).toUpperCase(); else navInitials.innerHTML = icono('usuario', 15);
    }
  }
}

async function handleAvatarChange(ev) {
  const file = ev.target.files[0];
  if (!file) return;

  // Mostrar preview inmediato
  const reader = new FileReader();
  reader.onload = function(e) {
    const data = e.target.result;
    const wrap = document.getElementById('avatarDisplay');
    if (wrap.tagName === 'DIV') {
      const img = document.createElement('img');
      img.id = 'avatarDisplay';
      img.className = 'avatar-img';
      img.src = data;
      img.alt = 'Avatar';
      hacerAmpliable(img);
      wrap.replaceWith(img);
    } else {
      wrap.src = data;
    }
    const navImg = document.getElementById('user-nav-photo');
    const navInitials = document.getElementById('user-nav-initials');
    if (navImg && navInitials) {
      navImg.src = data;
      navImg.style.display = 'block';
      navInitials.style.display = 'none';
    }
  };
  reader.readAsDataURL(file);

  // Subir al backend
  try {
    const formData = new FormData();
        const reducida = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const max = 256;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(b => resolve(b || file), 'image/jpeg', 0.8);
      };
      img.onerror = () => resolve(file);
      img.src = URL.createObjectURL(file);
    });
    formData.append('avatar', reducida, 'avatar.jpg');
    const urlTemporal = URL.createObjectURL(reducida);
    const mini = await hacerMiniatura(urlTemporal);
    URL.revokeObjectURL(urlTemporal);
    if (mini) formData.append('mini', mini);
    const res = await fetch(`${API_BASE}/api/v1/users/me/avatar`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${vakaData.getToken()}` },
      body: formData
    });
    const data = await res.json();
    if (data.avatar_url) {
      profile.avatar = data.avatar_url;
      profile.tiene_mini = !!data.tiene_mini;
      await vakaData.saveProfile(profile);
      pintarAvisoFoto();
      toast('Foto actualizada', 's');
    }
  } catch(err) {
    console.error('Error subiendo avatar:', err);
    toast('No se pudo subir la foto.', 'e');
  }
}

// ═══ MIS ESTADÍSTICAS ════════════════════════════════════════════════════
function updateStats(){
  document.getElementById('statGroups').textContent=groups.length;
  document.getElementById('statFriends').textContent=friends.length;
}

// ═══ BORRAR MIS DATOS ════════════════════════════════════════════════════
function clearAll(){
  groups=[];friends=[];activity=[];profile={};
  ['vp_groups','vp_friends','vp_activity','vp_profile'].forEach(k=>localStorage.removeItem(k));
  renderGroupsList();renderFriends();renderActivity();loadProfile();updateStats();
  toast('Datos borrados','s');
}

function cerrarModalBorrarDatos() {
  document.getElementById('modal-borrar-datos').style.display = 'none';
  document.body.style.overflow = '';
}

// ── Borrar datos / eliminar cuenta ───────────────────────────────
// 1. Se consulta al servidor qué pasaría.
// 2. Si hay saldos pendientes en grupos compartidos → modal con la lista (no se puede continuar).
// 3. Si no → modal de confirmación que explica exactamente qué se borra.
async function abrirBorrado(tipo) {
  let plan;
  try {
    const res = await fetch(`${API_BASE}/api/v1/users/me/borrado`, {
      headers: { 'Authorization': `Bearer ${vakaData.getToken()}` }
    });
    if (!res.ok) throw new Error();
    plan = await res.json();
  } catch (_) {
    toast('Necesitas conexión a internet para hacer esto', 'e');
    return;
  }
  if (plan.pendientes && plan.pendientes.length) {
    mostrarModalPendientes(plan.pendientes, tipo);
    return;
  }
  const n = plan.grupos_a_borrar.length, m = plan.grupos_a_salir.length;
  const partes = [];
  if (n) partes.push(`Se borrarán ${n === 1 ? 'el grupo' : `${n} grupos`} que solo usas tú, con sus gastos.`);
  if (m) partes.push(`Saldrás de ${m === 1 ? '1 grupo compartido' : `${m} grupos compartidos`}; tus gastos pasados seguirán en su historial para el resto.`);
  partes.push('También se borrarán tus amigos y tu actividad.');
  if (tipo === 'cuenta') {
    document.getElementById('eliminar-cuenta-resumen').innerHTML =
      `Se eliminará tu cuenta. ${partes.join(' ')} Esta acción <strong>no se puede deshacer</strong>.`;
    document.getElementById('modal-eliminar-cuenta').style.display = 'flex';
  } else {
    document.getElementById('borrar-datos-resumen').textContent = `${partes.join(' ')} Esta acción no se puede deshacer.`;
    document.getElementById('modal-borrar-datos').style.display = 'flex';
  }
  document.body.style.overflow = 'hidden';
}

function mostrarModalPendientes(pendientes, tipo) {
  const accion = tipo === 'cuenta' ? 'eliminar tu cuenta' : 'borrar tus datos';
  document.getElementById('pendientes-titulo').textContent = `Aún no puedes ${accion}`;
  document.getElementById('pendientes-intro').textContent =
    `Tienes dinero pendiente en ${pendientes.length === 1 ? 'este grupo' : 'estos grupos'}. Cuando esté saldado, podrás ${accion}.`;
  // Cada grupo es un botón que lleva a sus Cuentas finales
  document.getElementById('pendientes-lista').innerHTML = pendientes.map(p => {
    let estado;
    // Dos líneas: el nombre del grupo arriba (entero) y el estado debajo
    if (p.por_confirmar && Math.abs(p.balance) <= 0.05) {
      const c = p.por_confirmar;
      estado = `<span class="pd-estado u-c-gold-text">${icono('reloj',13)} ${escaparHtml(c.para)} debe confirmar tu pago`
        + (c.importe ? ` de ${formatAmountBase(c.importe)}` : '') + (c.hasta ? ` (hasta el ${fechaDiaMes(c.hasta)})` : '') + `</span>`;
    } else estado = `<span class="pd-estado ${p.balance < 0 ? 'rojo' : 'verde'}">${p.balance < 0 ? 'Debes' : 'Te deben'} ${formatAmountBase(Math.abs(p.balance))}</span>`;
    return `<button type="button" class="pd-fila" onclick="irACuentasDeGrupo(${Number(p.id)})" aria-label="${escaparHtml(p.name)}: ver cuentas">
      <span class="pd-texto"><span class="pd-nombre">${escaparHtml(p.name)}</span>${estado}</span><span class="pd-flecha" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></span>
    </button>`;
  }).join('');
  document.getElementById('modal-pendientes').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}
// Desde «Aún no puedes eliminar tu cuenta»: abre el grupo en Cuentas finales
async function irACuentasDeGrupo(id) {
  cerrarModalPendientes();
  const idx = groups.findIndex(g => String(g.id) === String(id));
  if (idx < 0) return;
  await openGroup(idx);
  setTimeout(() => irASeccion('sec5', toggleCuentasSection, 'cuentasSectionWrap'), 350);
}
function cerrarModalPendientes() {
  document.getElementById('modal-pendientes').style.display = 'none';
  document.body.style.overflow = '';
}

function resumenBorrado(r) {
  const p = [];
  if (r.grupos_borrados) p.push(`${r.grupos_borrados} grupo(s) borrado(s)`);
  if (r.grupos_abandonados) p.push(`saliste de ${r.grupos_abandonados} grupo(s)`);
  return p.length ? ` (${p.join(', ')})` : '';
}

async function ejecutarBorradoDatos() {
  cerrarModalBorrarDatos();
  try {
    const r = await vakaData.deleteAllData();
    clearAll();
    toast('Datos borrados' + resumenBorrado(r), 's');
  } catch (err) {
    if (err.status === 409 && err.datos?.pendientes) { mostrarModalPendientes(err.datos.pendientes, 'datos'); return; }
    toast('No se pudieron borrar los datos. No se ha cambiado nada.', 'e');
  }
}

async function ejecutarEliminarCuenta() {
  document.getElementById('modal-eliminar-cuenta').style.display = 'none';
  document.body.style.overflow = '';
  try {
    await vakaData.deleteAccount();
  } catch (err) {
    if (err.status === 409 && err.datos?.pendientes) { mostrarModalPendientes(err.datos.pendientes, 'cuenta'); return; }
    toast('No se pudo eliminar la cuenta. No se ha cambiado nada.', 'e');
    return;
  }
  clearAll();
  { const _tema = localStorage.getItem('vp_tema'); localStorage.clear(); if (_tema) localStorage.setItem('vp_tema', _tema); }
  location.replace('login.html');
}

// ═══ FOTO DE PERFIL AMPLIADA ═════════════════════════════════════════
// Al tocar la foto de Cuenta (o la de un amigo en su ficha) se ve en grande, redonda
// y sobre el fondo difuminado, como en Instagram. Se cierra tocando en cualquier
// sitio, con atrás o con Escape.
function hacerAmpliable(img) {
  img.classList.add('ampliable');
  img.setAttribute('role', 'button');
  img.tabIndex = 0;
  img.setAttribute('aria-label', 'Ver tu foto de perfil en grande');
  img.onclick = () => abrirFotoPerfil(img.src);
  img.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirFotoPerfil(img.src); } };
}
// Sin foto: tocar tu inicial la amplía (como con los amigos)
function hacerInicialAmpliable(ph) {
  ph.classList.add('ampliable');
  ph.setAttribute('role', 'button');
  ph.tabIndex = 0;
  ph.setAttribute('aria-label', 'Ver tu inicial en grande');
  ph.onclick = () => abrirInicialAmpliada(profile.nombre || '?');
  ph.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ph.onclick(); } };
}
function abrirFotoPerfil(src) {
  if (!src) return;
  document.getElementById('fotoPerfilInicial').style.display = 'none';
  const img = document.getElementById('fotoPerfilGrande');
  img.style.display = ''; img.src = src;
  document.querySelector('#fotoPerfilModal .foto-perfil-caja').setAttribute('aria-label', 'Foto en grande');
  document.getElementById('fotoPerfilModal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}
// Sin foto: se amplía la inicial, igual que una foto
function abrirInicialAmpliada(nombre) {
  const letra = String(nombre || '?').trim().charAt(0).toUpperCase() || '?';
  document.getElementById('fotoPerfilGrande').style.display = 'none';
  const ini = document.getElementById('fotoPerfilInicial');
  ini.textContent = letra; ini.style.display = 'flex';
  document.querySelector('#fotoPerfilModal .foto-perfil-caja').setAttribute('aria-label', `Inicial de ${nombre}`);
  document.getElementById('fotoPerfilModal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}
function cerrarFotoPerfil() {
  document.getElementById('fotoPerfilModal').style.display = 'none';
  // Si debajo sigue abierta la ficha de un amigo, la página sigue sin desplazarse
  const otraVentana = [...document.querySelectorAll('.modal-overlay')].some(m => m.id !== 'fotoPerfilModal' && getComputedStyle(m).display !== 'none');
  if (!otraVentana) document.body.style.overflow = '';
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.getElementById('fotoPerfilModal')?.style.display === 'flex') cerrarFotoPerfil();
});

// Foto de otra persona: se abre al momento con la pequeña y se cambia por la grande al llegar
async function abrirFotoDeCuenta(idUsuario, miniatura) {
  abrirFotoPerfil(miniatura);
  try {
    const r = await fetch(`${API_BASE}/api/v1/users/${encodeURIComponent(idUsuario)}/foto`, { headers: { 'Authorization': `Bearer ${vakaData.getToken()}` } });
    if (!r.ok) return;
    const { avatar } = await r.json();
    const grande = document.getElementById('fotoPerfilGrande');
    if (avatar && document.getElementById('fotoPerfilModal').style.display === 'flex') grande.src = avatar;
  } catch (_) {}
}

// ═══ MINIATURA DE TU FOTO ════════════════════════════════════════════
// Lo que ven tus grupos y amigos es una versión de 96 px (pesa ~5 KB), para que
// un grupo de muchas personas cargue rápido. La grande solo se pide al ampliarla.
function hacerMiniatura(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const lado = 96, c = document.createElement('canvas');
      c.width = lado; c.height = lado;
      const m = Math.min(img.width, img.height);            // recorte cuadrado centrado
      c.getContext('2d').drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, lado, lado);
      resolve(c.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
// Fotos subidas antes de que existiera la miniatura: se hace una vez, al entrar
async function completarMiniatura() {
  if (!profile.avatar || profile.tiene_mini !== false) return;
  const mini = await hacerMiniatura(profile.avatar);
  if (!mini) return;
  try {
    const r = await fetch(`${API_BASE}/api/v1/users/me/avatar-mini`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${vakaData.getToken()}` },
      body: JSON.stringify({ mini }),
    });
    if (r.ok) profile.tiene_mini = true;
  } catch (_) {}
}

// ═══ QUITAR TU FOTO ══════════════════════════════════════════════════
function pintarAvisoFoto() {
  const aviso = document.getElementById('avisoFotoPerfil');
  if (aviso) aviso.style.display = profile.avatar ? '' : 'none';
}
async function quitarFotoPerfil() {
  const btn = document.getElementById('btnQuitarFoto');
  const listo = bloquearBoton(btn, 'Quitando…');
  if (!listo) return;
  try {
    const r = await fetch(`${API_BASE}/api/v1/users/me/avatar`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${vakaData.getToken()}` } });
    if (!r.ok) throw new Error('No se pudo quitar la foto');
    profile.avatar = null; profile.tiene_mini = false;
    await vakaData.saveProfile(profile);
    loadProfile();
    toast('Foto quitada', 's');
  } catch (e) { toast(textoError(e, 'No se pudo quitar la foto.'), 'e'); }
  finally { listo(); }
}

// Al abrir la Política o los Términos desde Cuenta, al volver se regresa a Cuenta
function recordarVolverACuenta() {
  try { sessionStorage.setItem('vp_volver_a', 'page-cuenta'); } catch (_) {}
}

// Pie de Cuenta: qué versión de la app tiene cada uno («VakaPay · versión 1.1 (2)»).
// El número entre paréntesis es el de APP_VERSION_MINIMA en Vercel. La web
// siempre es la última, así que solo dice «versión web».
(async function pintarVersionApp() {
  const el = document.getElementById('versionApp');
  const App = window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform() && Capacitor.Plugins && Capacitor.Plugins.App;
  if (!el || !App || !App.getInfo) return;
  try {
    const info = await App.getInfo();
    if (info && info.version) el.textContent = `VakaPay · versión ${info.version}${info.build ? ` (${info.build})` : ''}`;
  } catch (_) { /* se queda el texto de la web */ }
})();
