// public/js/participantes.js — Participantes de un grupo
// (antes dentro de index.html; el orden de carga está en index.html)

async function addMember() {
  if (currentGroupIdx === null) { toast('Abre un grupo primero', 'e'); return; }
  const inp = document.getElementById('memberName');
  const n = inp.value.trim();
  if (!n) { toast('Escribe un nombre', 'e'); return; }
  if (n.length > 20) { toast('El nombre no puede superar 20 caracteres', 'e'); return; }
  const g = groups[currentGroupIdx];
  const yaEsta = Object.keys(g.members).find(m => _normNombre(m) === _normNombre(n));
  if (yaEsta) { mostrarModalDuplicado({ titulo: 'Participante repetido', nombre: yaEsta, motivo: 'participante' }); return; }

  // Si el nombre viene de la agenda, se guardan también su teléfono y email
  const contacto = (_contactoParticipante && _normNombre(_contactoParticipante.name) === _normNombre(n)) ? _contactoParticipante : null;
  _contactoParticipante = null;
  const eraAmigo = !!buscarAmigoDuplicado({ name: n, email: contacto?.email, phone: contacto?.phone });

  // 1. Añadimos al grupo
  g.members[n] = 0; 

  // 2. Sincronización backend (el servidor lo guarda también en Amigos, sin duplicar)
  try {
    await fetch(`${API_BASE}/api/v1/groups/${g.id}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${vakaData.getToken()}` },
      body: JSON.stringify({ display_name: n, email: contacto?.email || '', phone: contacto?.phone || '' })
    });
  } catch(err) { console.error('Error añadiendo miembro:', err); }

  // 3. Lista de amigos actualizada desde el servidor
  try { friends = await vakaData.getFriends() || friends; renderFriends(); renderFriendPicker(); updateStats(); } catch (_) {}
  toast(eraAmigo ? `${n} añadido` : `${n} añadido al grupo y a tus amigos`, 's');
  refrescarActividad();

  // 4. Refresco final
  inp.value = '';
  groups = await vakaData.getGroups() || [];
  renderAll();
  renderFriendPicker();
 
  saveActivity(); 
  renderActivity();
}

async function removeMember(n) {
  let g = groups[currentGroupIdx];
  // Saldo actualizado del servidor: si alguien acaba de pagar, que cuente
  if (g.id) { await recargarGrupoDelServidor(g); g = groups[currentGroupIdx]; }
  updateBalances();
  const getInvolved = e => e.involved || (e.splits ? e.splits.map(s => s.member_name) : []);
  const count = (g.expenses || []).filter(e => (e.payer || e.payer_name) === n || getInvolved(e).includes(n)).length;
  const saldo = Number(g.members[n]) || 0;
  const pagoSinConfirmar = (g.expenses || []).find(e => e.es_pago && e.por_confirmar && e.payer === n);
  const pendiente = Math.abs(saldo) > 0.05 || !!pagoSinConfirmar;   // mismo margen de redondeo que en Cuentas finales

  document.getElementById('del-miembro-avatar').textContent = n[0].toUpperCase();
  document.getElementById('del-miembro-name').textContent = n;
  document.getElementById('del-miembro-titulo').textContent = pendiente ? 'Aún no se puede eliminar' : '¿Eliminar participante?';
  document.getElementById('del-miembro-si').style.display = pendiente ? 'none' : '';
  // Si no se puede eliminar, «Entendido» es la única acción (principal); si se puede, «No, volver» es la opción segura (borde)
  const volver = document.getElementById('del-miembro-volver');
  if (!volver.dataset.html) volver.dataset.html = volver.innerHTML;
  volver.className = pendiente ? 'btn btn-gold' : 'btn btn-outline';
  if (pendiente) volver.textContent = 'Entendido'; else volver.innerHTML = volver.dataset.html;
  const info = document.getElementById('del-miembro-info');
  info.innerHTML = '';
  const linea = (t, ic, color) => { const sp = document.createElement('span'); if (ic) { const i = document.createElement('span'); i.innerHTML = icono(ic, 14) + ' '; if (color) i.style.color = color; sp.appendChild(i); } sp.appendChild(document.createTextNode(t)); info.appendChild(sp); };

  if (pendiente && Math.abs(saldo) <= 0.05) {
    // Saldo a cero, pero con un pago que quien cobra aún no ha confirmado
    const para = (pagoSinConfirmar.involved || [])[0] || '';
    document.getElementById('del-miembro-msg').textContent =
      `El pago de ${n} de ${formatAmountBase(Number(pagoSinConfirmar.baseAmt) || 0)} a ${para} está pendiente de que ${para} lo confirme.`;
    linea(`Podrás eliminarlo cuando ${para} lo confirme, o el ${fechaDiaMes(pagoSinConfirmar.pago_confirmar_antes)} si no responde.`, 'reloj', 'var(--gold)');
  } else if (pendiente) {
    // Con saldo pendiente se perdería la deuda: primero hay que saldarla
    const importe = formatAmountBase(Math.abs(saldo));
    document.getElementById('del-miembro-msg').textContent = saldo < 0
      ? `${n} todavía debe ${importe}. Si lo eliminas, esa deuda desaparecería y las cuentas del grupo no cuadrarían.`
      : `A ${n} todavía le deben ${importe}. Si lo eliminas, ese dinero desaparecería y las cuentas del grupo no cuadrarían.`;
    linea(saldo < 0 ? `Debe ${importe}` : `Le deben ${importe}`, 'punto', saldo < 0 ? 'var(--danger)' : 'var(--success)');
    linea('Primero registrad el pago en «Cuentas finales» (aunque se haya pagado fuera de la app). Con su saldo a cero ya podrás eliminarlo.', 'billete', 'var(--gold)');
  } else {
    document.getElementById('del-miembro-msg').textContent = 'Esta acción no se puede deshacer.';
    if (count) {
      linea(`${count} gasto${count !== 1 ? 's' : ''} con su nombre: se mantienen en la lista`, 'ticket', 'var(--gold)');
      linea('Sus cuentas están saldadas: los saldos del resto no cambian', 'ok', 'var(--success)');
    } else {
      linea('El participante será eliminado del grupo', 'alerta', 'var(--gold)');
    }
  }
  document.getElementById('modal-borrar-miembro').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  window._miembroABorrar = pendiente ? null : n;
}

function cerrarModalBorrarMiembro() {
  document.getElementById('modal-borrar-miembro').style.display = 'none';
  document.body.style.overflow = '';
  window._miembroABorrar = null;
}

async function ejecutarBorradoMiembro() {
  const n = window._miembroABorrar;
  if (!n) return;
  const g = groups[currentGroupIdx];
  try {
    const res = await fetch(`${API_BASE}/api/v1/groups/${g.id}/members/${encodeURIComponent(n)}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${vakaData.getToken()}` }
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast(d.error || 'No se pudo eliminar el participante.', 'e');
      cerrarModalBorrarMiembro();
      return;
    }
  } catch (err) { console.error('Error eliminando miembro:', err); toast('Sin conexión. Inténtalo de nuevo.', 'e'); return; }
  cerrarModalBorrarMiembro();
  // Los gastos se quedan como estaban: se recarga el grupo tal y como lo tiene el servidor
  delete g.members[n];
  await recargarGrupoDelServidor(groups[currentGroupIdx]);
  toast(`${n} eliminado del grupo`, 's');
  refrescarActividad();
}
function updateSelectAllBtn(){
  const chips=document.querySelectorAll('#involvedChips .chip');
  const allSel=[...chips].every(c=>c.classList.contains('sel'));
  const btn=document.getElementById('btnSelectAll');
  if(btn) btn.innerHTML=allSel?icono('casilla',13)+' Ninguno':icono('casillaOk',13)+' Todos';
}
function toggleSelectAll(){
  const chips=document.querySelectorAll('#involvedChips .chip');
  const allSel=[...chips].every(c=>c.classList.contains('sel'));
  chips.forEach(c=>c.classList.toggle('sel',!allSel));
  document.getElementById('btnSelectAll').innerHTML=allSel?icono('casillaOk',13)+' Todos':icono('casilla',13)+' Ninguno';
}
function renderFriendPicker() {
  const el = document.getElementById('friendPickerChips');
  if (!el) return;

  const g = currentGroupIdx !== null ? groups[currentGroupIdx] : null;
  const myName = (profile && profile.nombre) ? profile.nombre.trim() : null;

  // 1. Amigos (Excluyéndote a ti mismo)
  const friendNames = friends
    .map(f => f.name)
    .filter(name => name !== myName);

  // 2. Otros miembros del grupo (los que no son tus amigos "registrados" o tú mismo)
  const groupMembers = g ? Object.keys(g.members).filter(m => m !== myName && !friendNames.includes(m)) : [];
  
  const allPossibleParticipants = [...friendNames, ...groupMembers];

  if (allPossibleParticipants.length === 0) {
    el.innerHTML = '<span class="u-c-muted u-fs-sm">No hay contactos disponibles</span>';
    return;
  }

  el.innerHTML = allPossibleParticipants.map(name => {
    const inGroup = g && g.members.hasOwnProperty(name);
    
    return `<div class="chip friend-pick ${inGroup ? 'sel' : ''}" data-name="${name}" onclick="toggleFriendInGroup('${name}',this)">
      <div class="av">${name[0].toUpperCase()}</div>${name}
      ${inGroup ? '<span class="u-c-gold-text u-d-flex">'+icono('check',15)+'</span>' : '<span class="u-c-muted u-fs-sm">+</span>'}
    </div>`;
  }).join('');
}
async function toggleFriendInGroup(name, el) {
  if (currentGroupIdx === null) return;
  const g = groups[currentGroupIdx];
  const token = vakaData.getToken();

  if (g.members.hasOwnProperty(name)) {
    // 1. Lógica para QUITAR
    if (g.expenses.some(e => e.payer === name || e.involved.includes(name))) {
      toast('Tiene gastos, no se puede quitar', 'e');
      return;
    }
    
    // Petición al backend para borrar de group_members
    try {
      const r = await fetch(`${API_BASE}/api/v1/groups/${g.id}/members/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw Object.assign(new Error(d.error || ''), { status: r.status }); }
      delete g.members[name];
      toast(`${name} quitado del grupo`, 's');
    } catch (e) {
      toast(textoError(e, 'No se pudo quitar del grupo.'), 'e');
    }
  } else {
    // 2. Lógica para AÑADIR: primero el servidor; si no lo confirma, no se añade
    try {
      const r = await fetch(`${API_BASE}/api/v1/groups/${g.id}/members`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ display_name: name })
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw Object.assign(new Error(d.error || ''), { status: r.status }); }
      g.members[name] = 0;
      toast(`${name} añadido`, 's');
      refrescarActividad();
    } catch (e) {
      console.error("Error sincronizando miembro:", e);
      toast(textoError(e, `No se pudo añadir a ${name}.`), 'e');
    }
  }
  renderAll();
  renderFriendPicker();
}
