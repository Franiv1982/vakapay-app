// public/js/amigos.js — Amigos: lista, ficha, contactos del móvil y deslizar para actualizar
// (antes dentro de index.html; el orden de carga está en index.html)

// ═══ FRIENDS ════════════════════════════════════════════════════════
function populateFriendGroupSelect(){
  const sel=document.getElementById('friendGroupLink');
  if(!sel)return;
  const prev=sel.value;
  sel.innerHTML='<option value="">— Sin vincular —</option>'+
    groups.map(g=>`<option value="${g.id}">${g.name}</option>`).join('');
  if(prev)sel.value=prev;
}
// ── Detección de contactos duplicados ────────────────────────────
// Mismo contacto si coincide el email, el teléfono (últimos 9 dígitos) o el nombre
// (sin distinguir mayúsculas ni espacios). Igual que en el servidor.
const _normEmail  = e => String(e || '').trim().toLowerCase();
const _normNombre = n => String(n || '').trim().replace(/\s+/g, ' ').toLowerCase();
const _normTel    = t => { const d = String(t || '').replace(/\D/g, ''); return d.length >= 6 ? d.slice(-9) : ''; };
function buscarAmigoDuplicado({ name, email, phone }, excluirIdx = null) {
  const em = _normEmail(email), tel = _normTel(phone), nom = _normNombre(name);
  for (let i = 0; i < friends.length; i++) {
    if (i === excluirIdx) continue;
    const f = friends[i];
    if (em && _normEmail(f.email) === em) return { amigo: f, motivo: 'email' };
    if (tel && _normTel(f.phone) === tel) return { amigo: f, motivo: 'teléfono' };
    if (nom && _normNombre(f.name) === nom) return { amigo: f, motivo: 'nombre' };
  }
  return null;
}

// Modal de la app que avisa de que el contacto o participante ya existe
function mostrarModalDuplicado({ titulo = 'Contacto duplicado', nombre, motivo, valor }) {
  document.getElementById('dup-titulo').textContent = titulo;
  document.getElementById('dup-nombre').textContent = nombre || '';
  const det = motivo === 'email' ? `Coincide el email${valor ? ': ' + valor : ''}`
            : motivo === 'teléfono' ? `Coincide el teléfono${valor ? ': ' + valor : ''}`
            : motivo === 'participante' ? 'Ya forma parte de este grupo'
            : 'Ya existe con el mismo nombre';
  document.getElementById('dup-motivo').textContent = det;
  document.getElementById('modal-duplicado').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}
function cerrarModalDuplicado() {
  document.getElementById('modal-duplicado').style.display = 'none';
  document.body.style.overflow = '';
}
const _valorDup = (dup, datos) => dup.motivo === 'email' ? datos.email : dup.motivo === 'teléfono' ? datos.phone : '';

async function addFriend(){
  const n=document.getElementById('friendName').value.trim();
  const last=document.getElementById('friendLastName').value.trim();
  const email=document.getElementById('friendEmail')?.value.trim()||'';
  const phone=document.getElementById('friendPhone')?.value.trim()||'';
  if(!n){toast('Escribe un nombre','e');return;}
  if(n.length>20){toast('El nombre no puede superar 20 caracteres','e');return;}
  if(last.length>20){toast('El apellido no puede superar 20 caracteres','e');return;}
  const fullName=last?n+' '+last:n;
  const dup = buscarAmigoDuplicado({ name: fullName, email, phone });
  if (dup) { mostrarModalDuplicado({ titulo: 'Este amigo ya existe', nombre: dup.amigo.name, motivo: dup.motivo, valor: _valorDup(dup, { email, phone }) }); return; }
  try {
    const friend = await vakaData.addFriend({name:fullName, email, phone, notes:''});
    friends.push({...friend, name:fullName, email, phone, contact:email||phone, addedAt:new Date().toISOString()});
    await saveFriends();
    // «Vincular a un grupo»: se añade también como participante de ese grupo
    const gidSel = document.getElementById('friendGroupLink').value;
    const gSel = gidSel ? groups.find(x => String(x.id) === String(gidSel)) : null;
    let vinculado = false;
    if (gSel) {
      const res = await agregarAmigoAGrupo(gSel, fullName, { email, phone });
      vinculado = res.ok;
      if (!res.ok) toast(`${fullName} se guardó como amigo, pero no se pudo añadir a "${gSel.name}": ${res.error || 'inténtalo desde el grupo'}`, 'e');
      await refrescarGruposYAmigos();
    }
    renderFriends();renderFriendPicker();updateStats();
    document.getElementById('friendName').value='';
    document.getElementById('friendLastName').value='';
    if(document.getElementById('friendEmail')) document.getElementById('friendEmail').value='';
    if(document.getElementById('friendPhone')) document.getElementById('friendPhone').value='';
    document.getElementById('friendGroupLink').value='';
    if (!gSel) toast(`${fullName} añadido como amigo`,'s');
    else if (vinculado) toast(`${fullName} añadido como amigo y a "${gSel.name}"`,'s');
    saveActivity();renderActivity();
  } catch(err) {
    // 409: el servidor detectó que ya existe (p. ej. añadido desde otro dispositivo o por invitación)
    if (err.status === 409) {
      friends = await vakaData.getFriends() || friends; renderFriends();
      const d = buscarAmigoDuplicado({ name: fullName, email, phone });
      mostrarModalDuplicado({ titulo: 'Este amigo ya existe', nombre: d ? d.amigo.name : fullName, motivo: d ? d.motivo : 'nombre', valor: d ? _valorDup(d, { email, phone }) : '' });
    } else {
      toast('No se pudo añadir amigo.', 'e');
    }
    console.error(err);
  }
}

// Sección Amigos: rellena el formulario con un contacto de la agenda (solo en la app del móvil)
async function rellenarAmigoDesdeContactos() {
  if (!window.Capacitor || !Capacitor.isNativePlatform() || !Capacitor.Plugins.Contacts) {
    toast('Tu navegador no permite leer los contactos. Escríbelo a mano.', 'e'); return;
  }
  try {
    const { Contacts } = Capacitor.Plugins;
    const permiso = await Contacts.requestPermissions();
    if (permiso.contacts !== 'granted') { toast('Necesitas dar permiso de contactos', 'e'); return; }
    const { contact: c } = await Contacts.pickContact({ projection: { name: true, phones: true, emails: true } });
    const nombre = (c.name?.given || '').trim(), apellido = (c.name?.family || '').trim();
    const completo = (c.name?.display || '').trim();
    const tel = c.phones?.[0]?.number || '', email = c.emails?.[0]?.address || '';
    if (!nombre && !completo) { toast('El contacto no tiene nombre', 'e'); return; }
    const dup = buscarAmigoDuplicado({ name: completo, email, phone: tel });
    if (dup) { mostrarModalDuplicado({ titulo: 'Este amigo ya existe', nombre: dup.amigo.name, motivo: dup.motivo, valor: _valorDup(dup, { email, phone: tel }) }); return; }
    document.getElementById('friendName').value = (nombre || completo).slice(0, 20);
    document.getElementById('friendLastName').value = (nombre ? apellido : '').slice(0, 20);
    document.getElementById('friendEmail').value = email;
    document.getElementById('friendPhone').value = tel;
    toast('Contacto cargado. Revisa los datos y pulsa Añadir Amigo.', 's');
  } catch (err) {
    if (/cancel/i.test(err?.message || '')) return;
    console.error('Error accediendo a contactos:', err);
    toast('No se pudo acceder a los contactos', 'e');
  }
}
(function () {
  const b = document.getElementById('btnAmigoContactos');
  if (b && window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()) b.style.display = 'flex';
})();

function removeFriend(idx){
  const name=friends[idx].name;
  groups.forEach(g=>{if(g.members.hasOwnProperty(name)&&!g.expenses.some(e=>e.payer===name||e.involved.includes(name))){delete g.members[name];}});
  save();
  friends.splice(idx,1);saveFriends();renderFriends();renderFriendPicker();updateStats();
}
function renderFriends(){
  populateFriendGroupSelect();
  const el=document.getElementById('friendsList');
  if(friends.length===0&&cargandoInicial){el.innerHTML=skFilas(4,true);return;}
  if(friends.length===0){el.innerHTML='<div class="no-items"><div class="ni"><svg class="u-c-text" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div><div>Sin amigos añadidos aún</div></div>';return;}
  el.innerHTML=friends.map((f,i)=>{
    const inGroups=groups.filter(g=>g.members.hasOwnProperty(f.name)).map(g=>iconoTipo(g.type, 12)+' '+escaparHtml(g.name));
    const avatarContent=f.avatar
      ?`<img class="u-w-100p u-h-100p u-fit-cover u-r-50p" src="${f.avatar}" alt="">`
      :`<span class="u-fs-md u-fw-900 u-c-gold-text">${f.name[0].toUpperCase()}</span>`;
    return`<div class="friend-item">
      <div class="fi-av">${avatarContent}</div>
      <div class="fi-info">
        <div class="fi-name">${f.name}</div>
        <div class="fi-sub">${[f.email,f.phone].filter(Boolean).join(' · ')||f.contact||'Sin contacto'}</div>
        ${f.notes?`<div class="u-fs-xs u-c-muted u-mt-1 u-fst-italic">${f.notes}</div>`:''}
        ${inGroups.length?`<div class="u-mt-4 u-d-flex u-wrap-wrap u-gap-4">${inGroups.map(g=>`<span class="u-bg-xbdf8a u-b-x1b470 u-r-lg u-p-1-8 u-fs-2xs u-c-gold-text u-fw-700">${g}</span>`).join('')}</div>`:''}
      </div>
      <div class="u-d-flex u-gap-6">
        <button class="btn btn-outline btn-sm" onclick="openFriendModal(${i})" title="Editar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn btn-outline btn-sm u-c-danger u-bc-danger" onclick="confirmDeleteFriend(${i})" title="Eliminar">
          <svg class="u-c-danger" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>
      </div>
    </div>`;
  }).join('');
}

// ═══ FRIEND EDIT MODAL ════════════════════════════════════════════════
let editingFriendIdx = null;

function openFriendModal(idx){
  editingFriendIdx=idx;
  const f=friends[idx];
  const parts=f.name.split(' ');
  document.getElementById('editFriendName').value=parts[0]||'';
  document.getElementById('editFriendLastName').value=parts.slice(1).join(' ')||'';
  document.getElementById('editFriendEmail').value=f.email||f.contact||'';
  document.getElementById('editFriendPhone').value=f.phone||'';
  document.getElementById('editFriendNotes').value=f.notes||'';
  document.getElementById('friendModalTitle').innerHTML='<svg class="u-va-middle u-mr-6" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Editar: '+f.name;
  const av=document.getElementById('friendModalAvatar');
  av.innerHTML=f.avatar?`<img class="u-w-100p u-h-100p u-fit-cover" src="${f.avatar}" alt="">`:f.name[0].toUpperCase();
  const gc=document.getElementById('editFriendGroups');
  if(groups.length===0){gc.innerHTML='<span class="u-c-muted u-fs-sm">No hay grupos creados aún</span>';}
  else{gc.innerHTML=groups.map((g,gi)=>{
    const inGroup=g.members.hasOwnProperty(f.name);
    return`<div class="modal-chip ${inGroup?'sel':''}" data-gidx="${gi}" onclick="toggleFriendGroupChip(this,'${f.name.replace(/'/g,'\\\'')}')">`+
      `<span class="u-fs-md">${iconoTipo(g.type, 14)}</span>${g.name}</div>`;
  }).join('');}
  document.getElementById('friendModal').style.display = '';
  document.getElementById('friendModal').classList.add('open');
  document.body.style.overflow='hidden';
}
function closeFriendModal(){
  document.getElementById('friendModal').classList.remove('open');
  document.body.style.overflow='';
  editingFriendIdx=null;
}
// Añade un amigo como participante de un grupo en el servidor (lo ven todos los miembros)
async function agregarAmigoAGrupo(g, nombre, { email = '', phone = '' } = {}) {
  if (Object.keys(g.members || {}).some(m => _normNombre(m) === _normNombre(nombre))) return { ok: true, yaEstaba: true };
  const r = await fetch(`${API_BASE}/api/v1/groups/${g.id}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${vakaData.getToken()}` },
    body: JSON.stringify({ display_name: nombre, email, phone })
  });
  if (!r.ok) { const d = await r.json().catch(() => ({})); return { ok: false, error: d.error }; }
  g.members[nombre] = 0;
  return { ok: true };
}
// ─── DESLIZAR HACIA ABAJO PARA ACTUALIZAR ───────────────────────────
// Con la pantalla arriba del todo, arrastrar hacia abajo y soltar vuelve a
// pedir los datos al servidor: el grupo abierto o, si no hay ninguno, la
// lista de grupos, amigos y actividad. No actúa con una ventana abierta ni
// en el chat (que se actualiza solo).
(function () {
  const UMBRAL = 70, MAX = 110;
  let y0 = null, x0 = 0, tirando = false, dist = 0, ocupado = false;
  const ind = () => document.getElementById('ptr');
  const hayVentanaAbierta = () => {
    if (document.body.style.overflow === 'hidden') return true;                 // las ventanas bloquean el scroll
    const chat = document.getElementById('page-chat');
    if (chat && getComputedStyle(chat).display !== 'none') return true;
    return [...document.querySelectorAll('.modal-overlay')].some(m => getComputedStyle(m).display !== 'none');
  };
  // ¿El dedo está sobre algo con su propio scroll que no está arriba del todo?
  const dentroDeScroll = el => {
    for (; el && el !== document.body; el = el.parentElement) {
      if (el.scrollTop > 0) return true;
      if (el.classList && el.classList.contains('zoom-area')) return true;
    }
    return false;
  };
  const pintar = d => {
    const p = ind(); if (!p) return;
    const prog = Math.min(d / UMBRAL, 1);
    p.style.transform = `translateY(${d - 50}px)`;
    p.style.opacity = String(Math.min(1, d / 40));
    p.querySelector('svg').style.transform = `rotate(${prog * 270}deg)`;
    p.classList.toggle('listo', d >= UMBRAL);
  };
  const esconder = () => {
    const p = ind(); if (!p) return;
    p.classList.add('vuelve'); p.classList.remove('cargando', 'listo');
    p.style.transform = 'translateY(-60px)'; p.style.opacity = '0';
    setTimeout(() => p.classList.remove('vuelve'), 260);
  };
  document.addEventListener('touchstart', e => {
    y0 = null; tirando = false; dist = 0;
    if (ocupado || e.touches.length !== 1) return;
    if ((document.scrollingElement || document.documentElement).scrollTop > 0) return;
    if (hayVentanaAbierta() || dentroDeScroll(e.target)) return;
    y0 = e.touches[0].clientY; x0 = e.touches[0].clientX;
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (y0 === null) return;
    const dy = e.touches[0].clientY - y0, dx = Math.abs(e.touches[0].clientX - x0);
    if (!tirando) {
      if (dy < 10) { if (dy < 0 || dx > 10) y0 = null; return; }   // hacia arriba o de lado: no es este gesto
      if (dx > dy) { y0 = null; return; }
      tirando = true;
    }
    if ((document.scrollingElement || document.documentElement).scrollTop > 0) { y0 = null; esconder(); return; }
    dist = Math.min(MAX, (dy - 10) * 0.5);
    pintar(dist);
  }, { passive: true });
  document.addEventListener('touchend', async () => {
    if (y0 === null || !tirando) { y0 = null; return; }
    y0 = null; tirando = false;
    if (dist < UMBRAL) { esconder(); return; }
    const p = ind();
    p.classList.add('vuelve', 'cargando'); p.style.transform = 'translateY(14px)'; p.style.opacity = '1';
    ocupado = true;
    try { await actualizarDesdeServidor(); }
    finally { ocupado = false; esconder(); }
  });
  document.addEventListener('touchcancel', () => { if (tirando) esconder(); y0 = null; tirando = false; });
})();

async function actualizarDesdeServidor() {
  if (!navigator.onLine) { toast('Sin conexión. Inténtalo cuando vuelvas a tener internet.', 'e'); return; }
  const pagina = document.querySelector('.page.active')?.id;
  const g = currentGroupIdx !== null ? groups[currentGroupIdx] : null;
  if (g && g.id && (pagina === 'page-detalle' || pagina === 'page-gasto')) {
    const ok = await recargarGrupoDelServidor(g);
    if (ok === false) { toast('No se pudo actualizar. Revisa tu conexión.', 'e'); return; }
    refrescarActividad();
  } else {
    await refrescarGruposYAmigos();
  }
  toast('Actualizado', 's');
}

async function refrescarGruposYAmigos() {
  try { groups = await vakaData.getGroups() || groups; } catch (_) {}
  try { friends = await vakaData.getFriends() || friends; } catch (_) {}
  renderGroupsList(); renderFriends(); renderFriendPicker(); updateStats();
  if (currentGroupIdx !== null && groups[currentGroupIdx]) renderAll();
  refrescarActividad();
}

// Ficha del amigo → «Grupos vinculados»: añadir o quitar del grupo (se guarda en el servidor)
async function toggleFriendGroupChip(el, friendName) {
  if (el.dataset.ocupado) return;
  const g = groups[parseInt(el.dataset.gidx)];
  const f = friends.find(x => x.name === friendName) || {};
  el.dataset.ocupado = '1'; el.style.opacity = '.5';
  try {
    if (el.classList.contains('sel')) {
      if (g.expenses.some(e => (e.payer || e.payer_name) === friendName || (e.involved || []).includes(friendName))) {
        toast('Tiene gastos en ese grupo, no se puede desvincular', 'e'); return;
      }
      if (g.memberIds && g.memberIds[friendName]) {
        toast(`${friendName} tiene cuenta y está en el grupo con ella; no se puede quitar desde aquí`, 'e'); return;
      }
      const r = await fetch(`${API_BASE}/api/v1/groups/${g.id}/members/${encodeURIComponent(friendName)}`, {
        method: 'DELETE', headers: { 'Authorization': `Bearer ${vakaData.getToken()}` }
      });
      if (!r.ok) { toast('Solo quien creó el grupo puede quitar participantes', 'e'); return; }
      delete g.members[friendName];
      el.classList.remove('sel');
      toast(`${friendName} quitado de "${g.name}"`, 's');
    } else {
      const res = await agregarAmigoAGrupo(g, friendName, { email: f.email || '', phone: f.phone || '' });
      if (!res.ok) { toast(res.error || 'No se pudo añadir al grupo', 'e'); return; }
      el.classList.add('sel');
      toast(res.yaEstaba ? `${friendName} ya estaba en "${g.name}"` : `${friendName} añadido a "${g.name}"`, 's');
    }
    await refrescarGruposYAmigos();
  } catch (_) {
    toast('Sin conexión. Inténtalo de nuevo.', 'e');
  } finally {
    delete el.dataset.ocupado; el.style.opacity = '';
  }
}
function handleFriendAvatarChange(ev){
  const file=ev.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=function(e){
    // Se reduce a 256 px para que ocupe poco al guardarla en la base de datos
    const img=new Image();
    img.onload=function(){
      const max=256, scale=Math.min(1,max/Math.max(img.width,img.height));
      const canvas=document.createElement('canvas');
      canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);
      canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
      const data=canvas.toDataURL('image/jpeg',0.8);
      document.getElementById('friendModalAvatar').innerHTML=`<img class="u-w-100p u-h-100p u-fit-cover" src="${data}" alt="">`;
      if(editingFriendIdx!==null)friends[editingFriendIdx]._tmpAvatar=data;
    };
    img.src=e.target.result;
  };
  reader.readAsDataURL(file);
}
async function saveEditFriend(){
  if(editingFriendIdx===null)return;
  const f=friends[editingFriendIdx];
  const firstName=document.getElementById('editFriendName').value.trim();
  const lastName=document.getElementById('editFriendLastName').value.trim();
  const email=document.getElementById('editFriendEmail').value.trim();
  const phone=document.getElementById('editFriendPhone').value.trim();
  const notes=document.getElementById('editFriendNotes').value.trim();
 if(!firstName){toast('El nombre no puede estar vacío','e');return;}
  if(firstName.length>20){toast('El nombre no puede superar 20 caracteres','e');return;}
  if(lastName.length>20){toast('El apellido no puede superar 20 caracteres','e');return;}
  const newName=lastName?firstName+' '+lastName:firstName;
  const oldName=f.name;
  const dupEdit = buscarAmigoDuplicado({ name: newName, email, phone }, editingFriendIdx);
  if (dupEdit) { mostrarModalDuplicado({ titulo: 'Ya tienes este contacto', nombre: dupEdit.amigo.name, motivo: dupEdit.motivo, valor: _valorDup(dupEdit, { email, phone }) }); return; }
  if(newName!==oldName){
    groups.forEach(g=>{
      if(g.members.hasOwnProperty(oldName)){
        g.members[newName]=g.members[oldName];delete g.members[oldName];
        g.expenses.forEach(ex=>{
          if(ex.payer===oldName)ex.payer=newName;
          ex.involved=ex.involved.map(p=>p===oldName?newName:p);
        });
      }
    });
    save();
  }
  friends[editingFriendIdx]={...f,name:newName,email,phone,notes,contact:email||phone||'',avatar:f._tmpAvatar||f.avatar||null};
  delete friends[editingFriendIdx]._tmpAvatar;
  const cambiosAmigo = { name: newName, email, phone, notes };
  if (f._tmpAvatar) cambiosAmigo.avatar_url = f._tmpAvatar; // la foto nueva también se guarda en el servidor
  if (f.id) { try { await vakaData.updateFriend(f.id, cambiosAmigo); } catch(_) { toast('No se pudo guardar en el servidor','e'); } }
saveFriends();logActivity(`Amigo "${newName}" actualizado`);saveActivity();renderActivity();
  closeFriendModal();renderFriends();renderFriendPicker();updateStats();
  toast('Amigo actualizado','s');
}

// ─── MODAL BORRAR AMIGO ──────────────────────────────────────────
let amigoABorrarIdx = null;

function openDeleteFriendModal(idx) {
  const f = friends[idx];
  if (!f) return;
  amigoABorrarIdx = idx;

  const inGroups = groups.filter(g => g.members.hasOwnProperty(f.name)).map(g => g.name);

  document.getElementById('del-amigo-avatar').textContent = f.name[0].toUpperCase();
  document.getElementById('del-amigo-name').textContent = f.name;
  document.getElementById('del-amigo-contact').textContent = f.email || f.phone || f.contact || 'Sin contacto';
  document.getElementById('del-amigo-groups').textContent = inGroups.length ? inGroups.join(', ') : 'Sin grupos vinculados';

  document.getElementById('modal-borrar-amigo').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function cerrarModalBorrarAmigo() {
  document.getElementById('modal-borrar-amigo').style.display = 'none';
  document.body.style.overflow = '';
  amigoABorrarIdx = null;
}

async function ejecutarBorradoAmigo() {
  const idx = amigoABorrarIdx;
  if (idx === null) return;
  const friend = friends[idx];
  const name = friend.name;

  try {
    const res = await fetch(`${API_BASE}/api/v1/friends/${friend.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${vakaData.getToken()}` }
    });
    if (!res.ok && res.status !== 404) {
      toast('No se pudo eliminar el amigo.', 'e');
      return;
    }
  } catch(err) {
    console.error('Error borrando amigo:', err);
    toast('No se pudo eliminar el amigo.', 'e');
    return;
  }

  friends.splice(idx, 1);
  await saveFriends();
  renderFriends();
  renderFriendPicker();
  updateStats();
  cerrarModalBorrarAmigo();
  closeFriendModal();
  toast(`${name} eliminado`, 's');
  refrescarActividad();
}

function confirmDeleteFriend(idx) {
  if (idx !== undefined) {
    openDeleteFriendModal(idx);
  } else if (editingFriendIdx !== null) {
    openDeleteFriendModal(editingFriendIdx);
  }
}
