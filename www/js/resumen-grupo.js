// public/js/resumen-grupo.js — Resumen del grupo: saldos, «Te deben / Debes», cuentas finales
// (antes dentro de index.html; el orden de carga está en index.html)

// ═══ SECCIÓN DE RENDERIZADO CONSOLIDADA ══════════════════════════════

function renderAll() {
  if (currentGroupIdx === null) return;
  // Ejecutamos todos los sub-renders
  renderMembers();
  renderExpenses();
  renderBalances();
  pintarResumenSaldo();
  if (typeof renderGroupsList === 'function') renderGroupsList();
}

// ─── RESUMEN DEL GRUPO: tu saldo y la acción principal ───────────────
// Mismo formato de importes que el resto de la app
const importeEs = n => formatAmountBase(Math.abs(n));
function pintarResumenSaldo() {
  const el = document.getElementById('resumenSaldo');
  const g = currentGroupIdx !== null ? groups[currentGroupIdx] : null;
  if (!el || !g) return;
  const yo = miNombreEnGrupo(g);
  const txs = deudasPendientes(g);
  const saldo = yo ? Number(g.members[yo]) || 0 : 0;
  const debo = txs.map((t, i) => ({ ...t, i })).filter(t => t.from === yo);
  const meDeben = txs.filter(t => t.to === yo);
  const nGastos = (g.expenses || []).filter(e => !e.es_pago).length;
  const total = (g.expenses || []).filter(e => !e.es_pago).reduce((s, e) => s + (Number(e.baseAmt) || 0), 0);
  let estado, cifra, detalle, botones;
  const btnGasto = (clase) => `<button type="button" class="btn ${clase}" onclick="irARegistrarGasto()">${icono('mas',15)} Añadir gasto</button>`;
  if (!yo) {
    estado = 'Total del grupo'; cifra = `<span>${importeEs(total)}</span>`; detalle = `${nGastos} gasto${nGastos !== 1 ? 's' : ''}`;
    botones = btnGasto('btn-gold');
  } else if (debo.length) {
    const t = debo[0];
    const de = escaparHtml(t.from).replace(/'/g, '&#39;'), a = escaparHtml(t.to).replace(/'/g, '&#39;');
    estado = 'Debes'; cifra = `<span class="rojo">${importeEs(-saldo)}</span>`;
    // Con una persona se nombra; con varias, solo cuántas (el detalle está en «Ver cuentas»)
    detalle = debo.length === 1 ? `a ${escaparHtml(t.to)}` : `a ${debo.length} personas`;
    // A una persona: «Pagar a X» directo. A varias: «Ver cuentas», donde están todos los pagos
    botones = debo.length === 1
      ? `<button type="button" class="btn btn-gold" onclick="openPayModal(${t.i},'${de}','${a}',${t.amount})">Pagar a ${escaparHtml(t.to)}</button>${btnGasto('btn-outline')}`
      : `<button type="button" class="btn btn-gold" onclick="irASeccion('sec5', toggleCuentasSection, 'cuentasSectionWrap')">Ver cuentas</button>${btnGasto('btn-outline')}`;
  } else if (meDeben.length) {
    estado = 'Te deben'; cifra = `<span class="verde">${importeEs(saldo)}</span>`;
    detalle = meDeben.length === 1 ? escaparHtml(meDeben[0].from) : `entre ${meDeben.length} personas`;
    botones = btnGasto('btn-gold') + `<button type="button" class="btn btn-outline" onclick="irASeccion('sec5', toggleCuentasSection, 'cuentasSectionWrap')">Ver cuentas</button>`;
  } else {
    estado = 'Estás al día'; cifra = `<span class="verde">${icono('ok',34)}</span>`;
    detalle = nGastos ? `${nGastos} gasto${nGastos !== 1 ? 's' : ''} · total ${importeEs(total)}` : 'Aún no hay gastos';
    botones = btnGasto('btn-gold');
  }
  el.innerHTML = `
    <div class="rs-arriba">
      <div class="rs-estado">${estado}</div>
      <div class="rs-cifra">${cifra}</div>
      <div class="rs-detalle">${detalle}</div>
    </div>
    <div class="rs-botones">${botones}</div>`;
}
// Abre una sección (si está cerrada) y la lleva a la vista
function irASeccion(idTitulo, abrir, idWrap) {
  const w = document.getElementById(idWrap);
  if (w && w.style.display !== 'block') abrir();
  document.getElementById(idTitulo)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function irARegistrarGasto() {
  irASeccion('sec3', toggleGastoSection, 'gastoSectionWrap');
  setTimeout(() => document.getElementById('expDesc')?.focus({ preventScroll: true }), 350);
}
// Menú «⋯» del grupo (editar / eliminar), que antes estaba en cada tarjeta del inicio
// Salir o eliminar: si en el grupo hay más personas con cuenta, tú solo sales y el
// grupo sigue para ellas; si eres la única, el grupo se elimina.
function otrosConCuenta(g) {
  return Object.values((g && g.memberIds) || {}).filter(id => String(id) !== String(profile.id)).length;
}
function esCreadorDelGrupo(g) {
  return !!(g && profile.id && g.owner_id && String(profile.id) === String(g.owner_id));
}
function abrirMenuGrupo(e) {
  e.stopPropagation();
  const g = groups[currentGroupIdx];
  // El menú dice exactamente lo que va a pasar
  document.getElementById('menuGrupoSalir').textContent = otrosConCuenta(g) ? 'Salir del grupo' : 'Eliminar grupo';
  // Solo quien creó el grupo puede editarlo (el servidor rechaza a los demás)
  document.getElementById('menuGrupoEditar').style.display = esCreadorDelGrupo(g) ? '' : 'none';
  const m = document.getElementById('menuGrupo');
  m.style.display = m.style.display === 'none' ? 'block' : 'none';
}
function cerrarMenuGrupo() { const m = document.getElementById('menuGrupo'); if (m) m.style.display = 'none'; }
document.addEventListener('click', e => { if (!e.target.closest('#menuGrupo')) cerrarMenuGrupo(); });

function resetMemberAccordions() {
  const memberWrap = document.getElementById('memberListWrap');
  const memberChevron = document.getElementById('memberChevron');
  const friendWrap = document.getElementById('friendPickerWrap');
  const manualWrap = document.getElementById('manualAddWrap');
  const participantesWrap = document.getElementById('participantesSectionWrap');
  const participantesChevron = document.getElementById('participantesChevron');
  const gastoWrap = document.getElementById('gastoSectionWrap');
  const gastoChevron = document.getElementById('gastoChevron');
  const gastosListWrap = document.getElementById('gastosListSectionWrap');
  const gastosListChevron = document.getElementById('gastosListChevron');
  const cuentasWrap = document.getElementById('cuentasSectionWrap');
  const cuentasChevron = document.getElementById('cuentasChevron');
  const resumenWrap = document.getElementById('resumenSectionWrap');
  const resumenChevron = document.getElementById('resumenChevron');
  if (resumenWrap) resumenWrap.style.display = 'none';
  if (resumenChevron) resumenChevron.style.transform = '';
  if (cuentasWrap) cuentasWrap.style.display = 'none';
  if (cuentasChevron) cuentasChevron.style.transform = '';
  if (gastosListWrap) gastosListWrap.style.display = 'none';
  if (gastosListChevron) gastosListChevron.style.transform = '';
  if (gastoWrap) gastoWrap.style.display = 'none';
  if (gastoChevron) gastoChevron.style.transform = '';
  if (participantesWrap) participantesWrap.style.display = 'none';
  if (participantesChevron) participantesChevron.style.transform = '';
  if (memberWrap) memberWrap.style.display = 'none';
  if (memberChevron) memberChevron.style.transform = '';
  if (friendWrap) friendWrap.style.display = 'none';
  if (manualWrap) manualWrap.style.display = 'none';
}

function toggleGastoSection() {
  const wrap = document.getElementById('gastoSectionWrap');
  const chevron = document.getElementById('gastoChevron');
  if (!wrap) return;
  const open = wrap.style.display === 'block';
  wrap.style.display = open ? 'none' : 'block';
  chevron.style.transform = open ? '' : 'rotate(180deg)';
}

function toggleGastosListSection() {
  const wrap = document.getElementById('gastosListSectionWrap');
  const chevron = document.getElementById('gastosListChevron');
  if (!wrap) return;
  const open = wrap.style.display === 'block';
  wrap.style.display = open ? 'none' : 'block';
  chevron.style.transform = open ? '' : 'rotate(180deg)';
}

function toggleCuentasSection() {
  const wrap = document.getElementById('cuentasSectionWrap');
  const chevron = document.getElementById('cuentasChevron');
  if (!wrap) return;
  const open = wrap.style.display === 'block';
  wrap.style.display = open ? 'none' : 'block';
  chevron.style.transform = open ? '' : 'rotate(180deg)';
  if (!open) calcDebts({ silencioso: true });   // al abrir: datos al día y deudas calculadas
}
function togglePagosSection() {
  const wrap = document.getElementById('pagosSectionWrap');
  const chevron = document.getElementById('pagosChevron');
  if (!wrap) return;
  const open = wrap.style.display === 'block';
  wrap.style.display = open ? 'none' : 'block';
  chevron.style.transform = open ? '' : 'rotate(180deg)';
  if (!open && currentGroupIdx !== null && groups[currentGroupIdx]) recargarGrupoDelServidor(groups[currentGroupIdx]);
}
function toggleParticipantesSection() {
  const wrap = document.getElementById('participantesSectionWrap');
  const chevron = document.getElementById('participantesChevron');
  if (!wrap) return;
  const open = wrap.style.display === 'block';
  wrap.style.display = open ? 'none' : 'block';
  chevron.style.transform = open ? '' : 'rotate(180deg)';
}
function toggleResumenSection() {
  const wrap = document.getElementById('resumenSectionWrap');
  const chevron = document.getElementById('resumenChevron');
  if (!wrap) return;
  const open = wrap.style.display === 'block';
  wrap.style.display = open ? 'none' : 'block';
  chevron.style.transform = open ? '' : 'rotate(180deg)';
  if (!open) {   // al abrir: datos al día y vista previa del mensaje
    const pintar = () => { const v = document.getElementById('resumenVista'); if (v) v.textContent = textoResumen().replace(/[*_]/g, ''); };
    pintar();
    if (currentGroupIdx !== null && groups[currentGroupIdx]) recargarGrupoDelServidor(groups[currentGroupIdx]).then(pintar);
  }
}
function toggleMemberList() {
  const wrap = document.getElementById('memberListWrap');
  const chevron = document.getElementById('memberChevron');
  const open = wrap.style.display === 'block';
  wrap.style.display = open ? 'none' : 'block';
  chevron.style.transform = open ? '' : 'rotate(180deg)';
}

function toggleFriendPicker() {
  const wrap = document.getElementById('friendPickerWrap');
  wrap.style.display = wrap.style.display === 'block' ? 'none' : 'block';
  document.getElementById('manualAddWrap').style.display = 'none';
}

function toggleManualAdd() {
  const wrap = document.getElementById('manualAddWrap');
  wrap.style.display = wrap.style.display === 'block' ? 'none' : 'block';
  document.getElementById('friendPickerWrap').style.display = 'none';
}

let _contactoParticipante = null; // { name, email, phone } elegido de la agenda para «Añadir participante»

async function addFromContacts() {
  if (!window.Capacitor || !Capacitor.isNativePlatform() || !Capacitor.Plugins.Contacts) {
    toast('Tu navegador no soporta acceso a contactos. Usa la opción manual.', 'e');
    return;
  }
  try {
    const { Contacts } = Capacitor.Plugins;
    const permission = await Contacts.requestPermissions();
    if (permission.contacts !== 'granted') {
      toast('Necesitas dar permiso de contactos', 'e');
      return;
    }
    const result = await Contacts.pickContact({
      projection: { name: true, phones: true, emails: true }
    });
    const c = result.contact;
    const name = c.name?.display || '';
    const tel = c.phones?.[0]?.number || '';
    const email = c.emails?.[0]?.address || '';
    if (!name) { toast('El contacto no tiene nombre', 'e'); return; }
    // Si ya es amigo (mismo teléfono o email), se usa el nombre con el que está guardado
    const yaAmigo = buscarAmigoDuplicado({ email, phone: tel });
    const nombreFinal = yaAmigo ? yaAmigo.amigo.name : name;
    if (yaAmigo) toast(`Ya está en tus amigos como "${yaAmigo.amigo.name}"`, 'i');
    document.getElementById('memberName').value = nombreFinal.slice(0, 20);
    _contactoParticipante = { name: nombreFinal.slice(0, 20), email, phone: tel };
    document.getElementById('manualAddWrap').style.display = 'block';
    document.getElementById('friendPickerWrap').style.display = 'none';
    if (!yaAmigo) toast(`Contacto "${name}" cargado. Pulsa Añadir para confirmar.`, 's');
  } catch(err) {
    console.error('Error accediendo a contactos:', err);
    toast('No se pudo acceder a los contactos', 'e');
  }
}

function renderMembers() {
  const g = groups[currentGroupIdx];
  const mbs = Object.keys(g.members || {});
  const countEl = document.getElementById('memberCount');
  if (countEl) countEl.textContent = `(${mbs.length})`;
  const pc = document.getElementById('participantesCounter');
  if (pc) pc.textContent = `(${mbs.length})`;
  const el = document.getElementById('memberChips');
  if (!el) return;

  el.innerHTML = mbs.length === 0
  ? '<span style="color:var(--muted);font-size:var(--fs-sm)">Sin participantes aún...</span>'
  : mbs.map(m => {
    const isOwner = profile.id && g.owner_id && profile.id === g.owner_id;
    const editBtn = isOwner ? `<span class="chip-edit" aria-label="Cambiar el nombre de ${m}" onclick="event.stopPropagation();openRenameMember('${m}')"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span>` : '';

    // Sin importes: el saldo de cada uno está en «Cuentas finales»
    return `<div class="chip" data-name="${m}">
              <div class="av">${m[0].toUpperCase()}</div>
              ${m}
              ${editBtn}
              <span class="chip-x" aria-label="Quitar a ${m}" onclick="event.stopPropagation();removeMember('${m}')">${icono('cerrar',11)}</span>
            </div>`;
  }).join('');
  
  const ps = document.getElementById('expPayer');
  if (ps) {
    const prev = ps.value;
    const myName = (profile.nombre || '').trim();
const sorted = myName && mbs.includes(myName)
  ? [myName, ...mbs.filter(m => m !== myName)]
  : mbs;
ps.innerHTML = sorted.map(m => `<option value="${m}">${m}</option>`).join('') || '<option value="">--</option>';
if (mbs.includes(prev)) ps.value = prev;
  }

  const ic = document.getElementById('involvedChips');
  if (ic) {
    if (mbs.length === 0) {
      ic.innerHTML = '<span style="color:var(--muted);font-size:var(--fs-sm)">Primero añade participantes</span>';
    } else {
      const wasSel = [...document.querySelectorAll('#involvedChips .chip.sel')].map(c => c.dataset.name);
      ic.innerHTML = mbs.map(m => `<div class="chip ${wasSel.includes(m) ? 'sel' : ''}" data-name="${m}" onclick="this.classList.toggle('sel');updateSelectAllBtn()"><div class="av">${m[0].toUpperCase()}</div>${m}</div>`).join('');
      updateSelectAllBtn();
    }
  }
}

function openRenameMember(oldName) {
  window._miembroARenombrar = oldName;
  document.getElementById('rename-miembro-avatar').textContent = oldName[0].toUpperCase();
  document.getElementById('rename-miembro-name').textContent = oldName;
  document.getElementById('rename-miembro-input').value = oldName;
  document.getElementById('modal-renombrar-miembro').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('rename-miembro-input').focus(), 100);
}

function cerrarModalRenombrarMiembro() {
  document.getElementById('modal-renombrar-miembro').style.display = 'none';
  document.body.style.overflow = '';
  window._miembroARenombrar = null;
}

async function ejecutarRenombrarMiembro() {
  const oldName = window._miembroARenombrar;
  if (!oldName) return;
  const trimmed = document.getElementById('rename-miembro-input').value.trim();
  if (!trimmed || trimmed === oldName) { cerrarModalRenombrarMiembro(); return; }
  const g = groups[currentGroupIdx];
  if (Object.keys(g.members).includes(trimmed)) {
    toast('Ya existe un participante con ese nombre', 'e'); return;
  }
  g.members[trimmed] = g.members[oldName];
  delete g.members[oldName];
  g.expenses.forEach(ex => {
    if (ex.payer === oldName) ex.payer = trimmed;
    ex.involved = ex.involved.map(p => p === oldName ? trimmed : p);
  });
  try {
    await fetch(`${API_BASE}/api/v1/groups/${g.id}/members/${encodeURIComponent(oldName)}/rename`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${vakaData.getToken()}` },
      body: JSON.stringify({ display_name: trimmed })
    });
  } catch(_) {}
  save();
  cerrarModalRenombrarMiembro();
  renderMembers();
  renderExpenses();
  toast(`"${oldName}" renombrado a "${trimmed}"`, 's');
}

function renderExpenses() {
  const g = groups[currentGroupIdx];
  const el = document.getElementById('expenseList');
  const sg = document.getElementById('summaryGrid');
  if (!g || !el) return;
  const gc = document.getElementById('gastosCounter');
  const nGastos = g.expenses.filter(e => !e.es_pago).length;
  if (gc) gc.textContent = nGastos > 0 ? `(${nGastos})` : '';

  // Los pagos de deudas no se listan aquí: están en Cuentas finales → Pagos realizados
  if (nGastos === 0) {
    el.innerHTML = '<div class="no-items"><div class="ni"><svg style="color:var(--text)" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></div><div>Sin gastos registrados</div></div>';
    if (sg) sg.style.display = 'none';
    return;
  }

  const base = getBase();
  const sym = SYMBOLS[base] || '€';
  // Los pagos entre participantes no son gastos: no cuentan en el total
  const { total, porPersona } = resumenPorPersona(g);

  if (sg) {
    sg.style.display = 'grid';
    document.getElementById('statTotal').textContent = sym + total.toFixed(2);
    document.getElementById('statPP').textContent = sym + porPersona.toFixed(2);
  }

  el.innerHTML = g.expenses.map((e, i) => {
    if (e.es_pago) return '';
    const displayCurrency = e.currency || base;
    const displaySym = SYMBOLS[displayCurrency] || '€';
    // Normalización de seguridad para evitar "undefined"
    const desc = e.desc || e.description || 'Sin descripción';
    const payer = e.payer || e.payer_name || 'Desconocido';
    const date = e.date || e.expense_date || 'Sin fecha';
    const amount = Number(e.amount || e.amount_base || 0);

    if (e.es_pago) {
      const destino = (e.involved && e.involved[0]) || (e.splits && e.splits[0] && e.splits[0].member_name) || '';
      return `<div class="group-card" onclick="openGasto(${i},'gastos')" style="cursor:pointer;border-style:dashed;">
      <div class="exp-ico c-other">${iconoCat('pago', 18)}</div>
      <div class="gc-info">
        <div class="gc-name">Pago a ${destino}</div>
        <div class="gc-meta"><strong>${payer}</strong> saldó deuda · ${fmtDate(date)}</div>
      </div>
      <div style="text-align:right;">
        <div class="exp-amt" style="color:var(--success);">${displaySym}${amount.toFixed(2)}</div>
        ${(e.ticket || e.has_ticket) ? '<div style="color:var(--text2);line-height:1;" title="Con comprobante">'+icono('ticket',13)+'</div>' : ''}
      </div>
    </div>`;
    }
    return `<div class="group-card" onclick="openGasto(${i},'gastos')" style="cursor:pointer;">
      <div class="exp-ico ${CAT_CSS[e.cat] || 'c-other'}">${iconoCat(e.cat, 18)}</div>
      <div class="gc-info">
        <div class="gc-name">${desc}</div>
        <div class="gc-meta">Pagó <strong>${payer}</strong> · ${fmtDate(date)}</div>
      </div>
      <div style="text-align:right;">
        <div class="exp-amt">${displaySym}${amount.toFixed(2)}</div>
        ${displayCurrency !== base ? `<div style="font-size:var(--fs-xs);color:var(--muted);">≈ ${sym}${(Number(e.baseAmt)||0).toFixed(2)}</div>` : ''}
        ${(e.ticket || e.has_ticket) ? '<div style="color:var(--text2);line-height:1;" title="Con comprobante">'+icono('ticket',13)+'</div>' : ''}
      </div>
    </div>`;
  }).join('');
}

// Saldos en céntimos exactos, igual que el servidor: cada gasto se reparte con las
// partes que guardó el servidor (repartidas al céntimo; p. ej. 237,56 € entre 13 →
// unos 18,27 y otros 18,28). Antes se dividía sin redondear y, tras saldar todo,
// quedaban restos de 0,01-0,02 € en el servidor que impedían borrar el grupo.
const _claveNombre = n => String(n || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
function repartirCentimos(totalCent, nombres) {
  const cada = Math.floor(totalCent / nombres.length), resto = totalCent - cada * nombres.length;
  return nombres.map((n, i) => [n, cada + (i < resto ? 1 : 0)]);
}
function updateBalances() {
  const g = groups[currentGroupIdx];
  if (!g || !g.members) return;
  const cent = {};
  const claves = {};
  Object.keys(g.members).forEach(m => { cent[m] = 0; claves[_claveNombre(m)] = m; });
  const miembro = n => claves[_claveNombre(n)];
  (g.expenses || []).forEach(e => {
    const totalCent = Math.round((Number(e.baseAmt || e.amount_base || e.amount) || 0) * 100);
    const partes = (e.splits && e.splits.length)
      ? e.splits.map(x => [x.member_name, Math.round(Number(x.share) * 100)])
      : repartirCentimos(totalCent, [...new Set(e.involved || [])]);
    if (!partes.length) { console.warn('Gasto sin participantes (ignorado en el balance):', e.desc); return; }
    const pagador = miembro(e.payer || e.payer_name);
    if (pagador) cent[pagador] += totalCent; else console.warn('Pagador no encontrado:', e.payer || e.payer_name);
    partes.forEach(([n, c]) => {
      const m = miembro(n);
      if (m) cent[m] -= c; else console.warn('Participante no encontrado:', n);
    });
  });
  g.members = Object.fromEntries(Object.entries(cent).map(([m, c]) => [m, c / 100]));
}
function renderBalances(){
  const g = groups[currentGroupIdx];
    
  updateBalances(); 
  renderPagosRealizados();

  const bl = document.getElementById('balanceList');
  const mbs = Object.entries(g.members);
  
  if(mbs.length === 0){
    bl.innerHTML = '<div class="no-items"><div class="ni"><svg style="color:var(--text)" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></div><div>Sin datos</div></div>';
    return;
  }

  const base2 = getBase();
  const sym2 = SYMBOLS[base2] || '€';
  
  bl.innerHTML = mbs.map(([n,v]) => `
    <div class="bal-row">
      <div style="display:flex;align-items:center;gap:8px">
        <div class="av-s">${n[0].toUpperCase()}</div>
        <span translate="no" style="font-weight:700">${escaparHtml(n)}</span>
      </div>
      <span class="${Number(v) > 0.01 ? 'bal-pos' : Number(v) < -0.01 ? 'bal-neg' : 'bal-zer'}">
        ${Number(v) > 0.01 ? '+' : ''}${sym2}${Number(v || 0).toFixed(2)}
      </span>
    </div>`).join('');
    
  document.getElementById('debtList').innerHTML = '<div class="no-items"><div class="ni"><svg class="icono" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg></div><div>Pulsa «Actualizar cuentas» para verlas</div></div>';
}
