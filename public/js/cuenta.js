// public/js/cuenta.js — Cuenta: perfil, estadísticas propias, borrar datos y eliminar cuenta
// (antes dentro de index.html; el orden de carga está en index.html)

// ═══ PERFIL ══════════════════════════════════════════════════════════════
function loadProfile(){
  if(!profile) return;
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
      img.onerror = function() {
        profile.avatar = null;
        const ph = document.createElement('div');
        ph.id = 'avatarDisplay'; ph.className = 'avatar-placeholder';
        if (inicial) ph.textContent = inicial; else ph.innerHTML = icono('usuario', 40);
        if (this.parentNode) this.parentNode.replaceChild(ph, this);
      };
      if (wrap.parentNode) wrap.parentNode.replaceChild(img, wrap);
    } else {
      const ph = document.createElement('div');
      ph.id = 'avatarDisplay'; ph.className = 'avatar-placeholder';
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

function toggleEditProfile() {
  const readMode = document.getElementById('profileReadMode');
  const editMode = document.getElementById('profileEditMode');
  const btn = document.getElementById('btnEditProfile');
  const isEditing = editMode.style.display !== 'none';

  if (isEditing) {
    // Volver a lectura — restaurar valores originales
    loadProfile();
    readMode.style.display = 'block';
    editMode.style.display = 'none';
    btn.style.display = '';
    btn.focus({ preventScroll: true });   // el foco vuelve a «Editar» (lector de pantalla y teclado)
    btn.innerHTML = '<svg class="u-va-middle u-mr-4" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Editar';
  } else {
    loadProfile();   // al entrar a editar, siempre con los datos guardados
    readMode.style.display = 'none';
    editMode.style.display = 'block';
    // Mientras se edita, arriba no hay botón: se sale con «Cancelar» o «Guardar» de abajo
    // (o con atrás). Así no hay dos botones que hagan lo mismo.
    btn.style.display = 'none';
    document.getElementById('profNombre')?.focus({ preventScroll: true });
  }
}

function updateReadMode() {
  const p = profile;
  if (!p) return;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '—'; };
  set('readNombre', p.nombre || p.name || '—');
  set('readEmail', p.email);
  set('readTel', p.tel);
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
  try {
    profile = await vakaData.saveProfile(data);
    updateProfilePreview();
    updateReadMode();
    toggleEditProfile();
    await logActivity('Perfil actualizado');
    renderActivity();
    toast('Perfil guardado', 's');
  } catch (error) {
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
    const res = await fetch(`${API_BASE}/api/v1/users/me/avatar`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${vakaData.getToken()}` },
      body: formData
    });
    const data = await res.json();
    if (data.avatar_url) {
      profile.avatar = data.avatar_url;
      await vakaData.saveProfile(profile);
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
