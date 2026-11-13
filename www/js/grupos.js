// public/js/grupos.js — Grupos: crear, lista de Mis grupos, abrir un grupo, editar y eliminar o salir
// (antes dentro de index.html; el orden de carga está en index.html)

// ═══ CREATE GROUP ═════════════════════════════════════════════════════
async function createGroup(){
  const nameInput = document.getElementById('groupName');
  if(!nameInput) return;

  const name = nameInput.value.trim() || 'Mi Grupo';
  // Nombre del usuario logueado, que debe quedar como primer participante
  const myName = (profile && profile.nombre ? profile.nombre.trim() : '') || 'Yo';
  const ini = document.getElementById('dateStart')?.value, fin = document.getElementById('dateEnd')?.value;
  if (!ini || !fin) { toast('Elige la fecha de inicio y la de fin del grupo', 'e'); return; }
  if (fin < ini) { toast('La fecha de fin no puede ser anterior a la de inicio', 'e'); return; }

  const listo = bloquearBoton(document.getElementById('btnCrearGrupo'), 'Creando…');
  if (!listo) return;   // ya se está creando: un segundo toque no crea otro grupo
  try {
    const datosNuevo = { 
        name: name, 
        start: document.getElementById('dateStart')?.value || '', 
        end: document.getElementById('dateEnd')?.value || '', 
        type: typeof selectedType !== 'undefined' ? selectedType : 'trip', 
        members: { [myName]: 0 },   // ← el creador entra desde el inicio
        expenses: [] 
    };

    // 1. Enviamos al servidor y ESPERAMOS la respuesta (que trae el ID)
    const grupoServidor = await vakaData.createGroup(datosNuevo);

    // 2. Si el servidor nos devuelve el objeto con ID, usamos ese. 
    // Si falla, usamos el local (pero ya sabemos que no tendrá ID).
    const grupoFinal = grupoServidor || datosNuevo;

    // 3. FIX: nos aseguramos de que el creador quede como participante,
    // aunque el backend no lo haya incluido en la respuesta del POST /groups
    if (!grupoFinal.members || Object.keys(grupoFinal.members).length === 0) {
      grupoFinal.members = { [myName]: 0 };
    }

    // 4. Si el grupo ya tiene ID (se creó bien en el servidor), damos de alta
    // al creador como miembro real vía la API, igual que con cualquier otro participante
    if (grupoFinal.id) {
      try {
        await fetch(`${API_BASE}/api/v1/groups/${grupoFinal.id}/members`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${vakaData.getToken()}` },
          body: JSON.stringify({ display_name: myName })
        });
      } catch(err) {
        console.warn('No se pudo registrar al creador como miembro en el servidor:', err);
      }
    }

    // 5. Actualizamos la lista global con el grupo que YA tiene ID y participante
    groups.unshift(grupoFinal);

    // 6. Guardamos en el PC
    localStorage.setItem('vaka_groups', JSON.stringify(groups));

    hideNewGroupForm();
    renderGroupsList();
    toast(`¡Grupo "${name}" creado!`,'s');
    
  } catch(e) {
    console.error("Error al crear:", e);
    toast(textoError(e, 'No se pudo crear el grupo.'), 'e');
  } finally { listo(); }
}

// ═══ GROUPS LIST ══════════════════════════════════════════════════════

function toggleGroupsList() {
  const wrap = document.getElementById('groupsListWrap');
  const chevron = document.getElementById('groupsChevron');
  const open = wrap.style.display === 'block';
  wrap.style.display = open ? 'none' : 'block';
  chevron.style.transform = open ? '' : 'rotate(180deg)';
}
// Formatea una fecha ISO (2026-07-13T00:00:00.000Z) o YYYY-MM-DD a DD/MM/AAAA legible.
// Si la fecha viene vacía o inválida, devuelve el valor original tal cual.
function fmtDate(raw) {
  if (!raw) return '';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
}
function renderGroupsList() {
  const sym0 = (vakaData && vakaData.settings) ? getCurrencySymbol(vakaData.settings.baseCurrency) : '€';
  const el = document.getElementById('groupsList');
  
  if (!el) return; // Validación de QA para evitar errores si el elemento no existe
  const counter = document.getElementById('groupsCounter');
  if (counter) {
    // Mientras carga por primera vez no se pone «(0)», que parecería que no tienes grupos
    if (cargandoInicial && groups.length === 0) counter.innerHTML = '<span class="sk" style="display:inline-block;width:26px;height:13px;vertical-align:middle;border-radius:var(--r-sm);"></span>';
    else counter.textContent = `(${groups.length})`;
  }
  if (groups.length === 0) {
    if (cargandoInicial) el.innerHTML = skGrupos();
    else if (vakaData.cargaFallida) {
      if (counter) counter.textContent = '';
      el.innerHTML = '<div class="no-items sin-conexion"><div class="ni">'+icono('alerta', 28)+'</div>'
        + '<div class="sc-titulo">No se pudieron cargar tus grupos</div>'
        + '<div>Revisa tu conexión a internet. Tus datos no se han perdido.</div>'
        + '<button type="button" class="btn btn-outline btn-sm" id="btnReintentarCarga" onclick="reintentarCarga()">'+icono('recargar',14)+' Reintentar</button></div>';
    }
    else el.innerHTML = '<div class="no-items"><div class="ni">'+icono('carpeta', 28)+'</div><div>No tienes grupos creados aún</div></div>';
    return;
  }

  el.innerHTML = groups.map((g, i) => {
    // Cálculo seguro del total: forzamos a número y manejamos valores nulos
    const total = (g.expenses || []).filter(e => !e.es_pago).reduce((s, e) => {
      const val = Number(e.baseAmt) || 0;
      return s + val;
    }, 0);
    
    const nm = Object.keys(g.members || {}).length;

    return `
      <div class="group-card" data-gid="${g.id}" onclick="openGroup(${i})">
        <div class="gc-icon" style="position:relative;">${iconoTipo(g.type, 22)}<span class="chat-dot" title="Mensajes nuevos en el chat" style="display:${(typeof chatNoLeidos !== 'undefined' && chatNoLeidos[g.id] > 0) ? 'block' : 'none'}"></span></div>
        <div class="gc-info">
          <div class="gc-name">${g.name}</div>
          <div class="gc-meta">${nm} participante${nm !== 1 ? 's' : ''} · total ${sym0}${Number(total || 0).toFixed(2)}</div>
        </div>
        ${(() => {
          // Lo que le importa a cada uno: su saldo en el grupo
          const yo = miNombreEnGrupo(g);
          const sd = yo ? Number((g.members || {})[yo]) || 0 : 0;
          if (!yo) return '';
          if (sd > 0.05) return `<div class="gc-saldo"><small>Te deben</small><b class="verde">${sym0}${sd.toFixed(2)}</b></div>`;
          if (sd < -0.05) return `<div class="gc-saldo"><small>Debes</small><b class="rojo">${sym0}${Math.abs(sd).toFixed(2)}</b></div>`;
          return `<div class="gc-saldo"><small>Al día</small><b class="verde">${icono('check',18)}</b></div>`;
        })()}
        <svg class="gc-flecha" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </div>`;
  }).join('');
}

const renderGroups = renderGroupsList;

async function openGroup(idx){
  currentGroupIdx = idx;
  resetMemberAccordions();
  const g = groups[idx];

  pintarTituloGrupo(g);
  document.getElementById('detMeta').textContent = fmtDate(g.start)+' → '+fmtDate(g.end);
  document.getElementById('hbadge').innerHTML = iconoTipo(g.type, 13) + ' ' + escaparHtml(g.name);
  document.getElementById('hbadge').style.display = 'block';
  posicionarBadge();
  if (typeof actualizarNoLeidos === 'function') actualizarNoLeidos();
  _enlaceInvitacion = null;   // cada grupo tiene su propio enlace

  // Cargar datos frescos del backend
  try {
    const res = await fetch(`${API_BASE}/api/v1/groups/${g.id}`, {
      headers: { 'Authorization': `Bearer ${vakaData.getToken()}` }
    });
    const fresh = await res.json();
    if (fresh && !fresh.error) {
      groups[idx] = {
          ...groups[idx],
          // Aquí fusionamos lo local con lo que llega del servidor:
          members: (Array.isArray(fresh.members))
            ? { ...groups[idx].members, ...Object.fromEntries(fresh.members.map(m => [m.display_name, m.balance || 0])) }
            : groups[idx].members,
          // Qué participante corresponde a cada cuenta (para saber quién es "yo" en Cuentas finales)
          memberIds: (Array.isArray(fresh.members))
            ? Object.fromEntries(fresh.members.filter(m => m.user_id).map(m => [m.display_name, m.user_id]))
            : groups[idx].memberIds,
          expenses: (fresh.expenses || []).sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).map(e => ({
            ...e,
            desc: e.description || e.desc || 'Sin descripción',
            payer: e.payer_name || e.payer || 'Desconocido',
            date: e.expense_date || e.date || 'Sin fecha',
            baseAmt: Number(e.amount_base || e.baseAmt) || 0,
            cat: e.category || e.cat || 'other',
            involved: e.splits ? e.splits.map(s => s.member_name) : (e.involved || [])
          }))
        };
    }
  } catch(_) {}

  // Recalculamos tras la actualización
  updateBalances();
  renderAll();
  renderFriendPicker();
  
  switchPage('page-detalle', null);
  document.querySelectorAll('.nav-btn').forEach(b=>{if(b.dataset.page==='page-grupos')b.classList.add('active');});
}

let currentExpenseIdx = null;

// Un pago solo lo anulan (o cambian su comprobante) quien pagó, quien cobró
// o quien lo registró (p. ej. al «pagar también por…» otra persona)
function puedoGestionarPago(g, e) {
  if (!e || !e.es_pago) return true;
  const yo = miNombreEnGrupo(g);
  return (!!yo && (yo === e.payer || (e.involved || []).includes(yo))) || (profile.id && Number(e.member_id) === Number(profile.id));
}

// origen: 'gastos' (Lista de gastos) o 'pagos' (Cuentas finales → Pagos realizados), para volver al mismo sitio
let _origenDetalle = 'gastos';
function openGasto(idx, origen) {
  if (origen) _origenDetalle = origen;
  currentExpenseIdx = idx;
  const g = groups[currentGroupIdx];
  const e = g.expenses[idx];
  if (!e) return;
  const puede = puedoGestionarPago(g, e);
  const tieneTicket = !!(e.ticket || e.has_ticket);
  const base = getBase();
  const sym = SYMBOLS[base] || '€';
  const displaySym = SYMBOLS[e.currency || base] || '€';

  const iconoGasto = e.es_pago ? iconoCat('pago', 20) : iconoCat(e.cat, 20);
  // Pagos: quién pagó por otro («Pagar también por…») y quién lo registró
  const pagoPorPago = e.es_pago ? ((String(e.desc || '').match(/\(pagó ([^)]+)\)$/) || [])[1] || '') : '';
  const registroPago = e.es_pago ? (Object.entries(g.memberIds || {}).find(([, id]) => Number(id) === Number(e.member_id)) || [])[0] || '' : '';
  document.getElementById('gastoTitle').innerHTML = iconoGasto + ' ' + escaparHtml(e.desc);
  document.getElementById('gastoMeta').textContent = e.es_pago
    ? `${fmtDate(e.date)} · ${e.payer} → ${(e.involved || [])[0] || ''}`
    : fmtDate(e.date) + ' · Pagó ' + e.payer;

  const ticketHTML = e.ticket ? `
    <div style="margin-top:12px;">
      <img src="${e.ticket}" alt="Foto del ticket" style="width:100%;max-height:200px;object-fit:contain;border-radius:var(--r-md);border:1px solid var(--border);">
      <button onclick="downloadTicket(${idx})" class="btn btn-outline btn-full" style="margin-top:8px;color:var(--gold-text);border-color:var(--gold);">
        <svg class="icono" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Descargar comprobante
      </button>
    </div>` : '';

  document.getElementById('gastoDetail').innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px;">
      <div class="exp-ico ${e.es_pago ? 'c-other' : CAT_CSS[e.cat]}" style="width:52px;height:52px;">${e.es_pago ? iconoCat('pago', 26) : iconoCat(e.cat, 26)}</div>
      <div>
        <div translate="no" style="font-size:var(--fs-lg);font-weight:800;color:var(--text);">${escaparHtml(e.desc)}</div>
        <div style="font-size:var(--fs-sm);color:var(--muted);">${fmtDate(e.date)}</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
      <div class="card" style="padding:12px;text-align:center;">
        <div style="font-size:var(--fs-xl);font-weight:800;color:var(--gold-text);">${displaySym}${Number(e.amount).toFixed(2)}</div>
        <div style="font-size:var(--fs-2xs);color:var(--muted);text-transform:uppercase;letter-spacing:.5px;">Monto</div>
        ${e.currency !== base ? `<div style="font-size:var(--fs-xs);color:var(--muted);">≈ ${sym}${Number(e.baseAmt).toFixed(2)}</div>` : ''}
      </div>
      <div class="card" style="padding:12px;text-align:center;">
        <div translate="no" style="font-size:var(--fs-lg);font-weight:800;color:var(--text);">${e.es_pago ? `${escaparHtml(e.payer)} → ${escaparHtml((e.involved || [])[0] || '')}` : escaparHtml(e.payer)}</div>
        <div style="font-size:var(--fs-2xs);color:var(--muted);text-transform:uppercase;letter-spacing:.5px;">${e.es_pago ? (pagoPorPago ? 'Deuda' : 'Pagó → Cobró') : 'Pagó'}</div>
      </div>
    </div>

${e.es_pago ? `
    <div class="card" style="padding:12px;margin-bottom:16px;">
      ${(pagoPorPago
          ? [['Deuda de', e.payer], ['Pagó', pagoPorPago], ['Cobró', (e.involved || [])[0] || ''], ['Registró', registroPago]]
          : [['Pagó', e.payer], ['Cobró', (e.involved || [])[0] || ''], ['Registró', registroPago]])
        .filter(([, v]) => v)
        .map(([k, v]) => `<div style="display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--tint-1);font-size:var(--fs-base);"><span style="color:var(--muted);">${k}</span><strong translate="no" style="color:var(--text);text-align:right;">${escaparHtml(v)}</strong></div>`).join('')}
    </div>

` : `
    <div class="card" style="padding:12px;margin-bottom:16px;">
      <div style="font-size:var(--fs-xs);color:var(--text);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text);vertical-align:middle;margin-right:4px"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>Participantes</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">
        ${(e.involved || []).map(p => `<div class="chip" style="font-size:var(--fs-sm);padding:4px 10px;"><div class="av" style="width:20px;height:20px;font-size:var(--fs-2xs);">${escaparHtml(p[0].toUpperCase())}</div>${escaparHtml(p)}</div>`).join('')}
      </div>
    </div>

    <div class="card" style="padding:12px;margin-bottom:16px;">
      <div style="font-size:var(--fs-xs);color:var(--text);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text);vertical-align:middle;margin-right:4px"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>Categoría</div>
      <div style="font-weight:700;">${iconoCat(e.cat, 15)} ${{food:'Comida',transport:'Transporte',hotel:'Alojamiento',activity:'Actividad',other:'Otro'}[e.cat]||e.cat}</div>
    </div>

`}    <div class="card" style="padding:12px;margin-bottom:16px;">
      <div style="font-size:var(--fs-xs);color:var(--text);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text);vertical-align:middle;margin-right:4px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>Comprobante</div>
      <div style="display:flex;gap:8px;align-items:center;background:var(--dark3);border:1px solid var(--border);border-radius:var(--r-md);padding:8px 12px;">
        ${puede ? `<button type="button" onclick="document.getElementById('gastoTicketFile').click()"
          style="flex-shrink:0;background:rgba(245,200,0,.1);border:1px solid rgba(245,200,0,.3);border-radius:var(--r-sm);padding:6px 12px;cursor:pointer;font-size:var(--fs-base);color:var(--gold-text);font-weight:700;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg> ${tieneTicket ? 'Cambiar' : 'Adjuntar'}
        </button>
        <input type="file" id="gastoTicketFile" accept="image/*" style="display:none" onchange="attachGastoTicket(event,${idx})">` : ''}
        <div style="flex:1;overflow:hidden;">
          <div style="color:var(--muted);font-size:var(--fs-xs);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${tieneTicket ? 'Comprobante adjunto · toca la imagen para verlo' : 'Sin comprobante'}
          </div>
          ${tieneTicket ? `<div style="font-size:var(--fs-2xs);color:var(--success);">${icono('ok',12)} Guardado</div>` : ''}
        </div>
        ${tieneTicket ? `
          <img id="gastoTicketThumb" alt="Ver ticket" src="${e.ticket || ''}" style="width:40px;height:40px;object-fit:cover;border-radius:var(--r-sm);border:1px solid var(--border);flex-shrink:0;cursor:pointer;background:var(--dark4);" onclick="verTicket(${idx})" title="Ver comprobante">
          ${puede ? `<button onclick="removeGastoTicket(${idx})" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:var(--fs-sm);flex-shrink:0;padding:2px 4px;border:1px solid var(--border);border-radius:var(--r-sm);" title="Quitar comprobante" aria-label="Quitar comprobante">${icono('cerrar',12)}</button>` : ''}
        ` : ''}
      </div>
    </div>

    <div style="display:flex;gap:10px;margin-top:18px;">
      ${e.es_pago ? '' : `<button onclick="openEditModal(${idx})" class="btn btn-gold" style="flex:1">Editar</button>`}
      ${puede
        ? `<button onclick="openDeleteExpenseModal(${idx})" class="btn btn-danger" style="flex:1"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg> ${e.es_pago ? 'Anular pago' : 'Eliminar'}</button>`
        : `<div style="flex:1;text-align:center;font-size:var(--fs-sm);color:var(--muted);line-height:1.4;">Solo ${escaparHtml(e.payer)} o ${escaparHtml((e.involved || [])[0] || '')} pueden anular este pago.</div>`}
    </div>
  `;

  switchPage('page-gasto', null);

  // La imagen del comprobante se descarga aparte (no viene en el listado del grupo)
  if (!e.ticket && e.has_ticket) {
    cargarTicket(idx).then(t => {
      const thumb = document.getElementById('gastoTicketThumb');
      if (t && thumb && currentExpenseIdx === idx) thumb.src = t;
    });
  }
}

function goBackToGroup() {
  // Abierto desde Estadísticas: vuelve allí, con la categoría o el pagador que estaba abierto
  if (_origenDetalle === 'stats') {
    _origenDetalle = 'gastos';
    switchPage('page-stats', document.querySelector('.nav-btn[data-page="page-stats"]'));
    renderStats();
    return;
  }
  switchPage('page-detalle', null);
  document.querySelectorAll('.nav-btn').forEach(b => {
    if (b.dataset.page === 'page-grupos') b.classList.add('active');
  });

  // Volver a la sección desde la que se abrió: «Lista de gastos» o «Cuentas finales → Pagos realizados»
  const abrir = (wrapId, chevId, abierta) => {
    const w = document.getElementById(wrapId), c = document.getElementById(chevId);
    if (!w) return;
    w.style.display = abierta ? 'block' : 'none';
    if (c) c.style.transform = abierta ? 'rotate(180deg)' : '';
  };
  const desdePagos = _origenDetalle === 'pagos';
  abrir('gastosListSectionWrap', 'gastosListChevron', !desdePagos);
  if (desdePagos) {
    abrir('pagosSectionWrap', 'pagosChevron', true);
    renderPagosRealizados();
    requestAnimationFrame(() => {
      document.getElementById('secPagos')?.scrollIntoView({ block: 'start', behavior: 'instant' });
      window.scrollBy(0, -150);   // que no quede debajo de la cabecera fija
    });
  }
}

async function deleteGroup(idx) {
  const g = groups[idx];
  if (!g) return;

  const groupId = g.id || g._id;

  try {
    if (groupId) {
      const res = await fetch(`${API_BASE}/api/v1/groups/${groupId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${vakaData.getToken()}` }
      });
      if (res.status === 422) {
        const data = await res.json();
        mostrarAviso(data.titulo || 'Aún no puedes salir del grupo', data.error);
        return;
      }
      if (!res.ok && res.status !== 404) {
        toast('No se pudo salir del grupo.', 'e');
        return;
      }
    }

    groups.splice(idx, 1);
    save();

    renderGroupsList();
    updateStats();

    await logActivity(`Saliste del grupo "${g.name}"`);
    toast(window._grupoSaliendo ? 'Has salido del grupo' : 'Grupo eliminado', 's');

    if (currentGroupIdx === idx) {
      goBack();
      const badge = document.getElementById('hbadge');
      if (badge) badge.style.display = 'none';
    }
  } catch (e) {
    console.error("Error al salir del grupo:", e);
    toast('No se pudo salir del grupo.', 'e');
  }
}

let groupToDeleteIdx = null;

/* ============================================================
   GESTIÓN DE BORRADO DE GRUPOS (LÓGICA Y MODAL)
   ============================================================ */

/**
 * 1. Abre el modal y prepara los datos del grupo a eliminar.
 */
async function openDeleteGroupModal(idx) {
    groupToDeleteIdx = idx;
    let g = groups[idx];
    // Saldo al día antes de decidir qué ventana mostrar (si alguien acaba de pagar, que cuente)
    if (g.id && typeof recargarGrupoDelServidor === 'function') {
      try { await recargarGrupoDelServidor(g); g = groups[idx]; updateBalances(); } catch (_) {}
    }
    
    // Rellenamos el modal con nombre e icono
    document.getElementById('delete-group-name').textContent = g.name;
    document.getElementById('delete-group-icon').innerHTML = iconoTipo(g.type, 26);
    const volver = document.getElementById('del-grupo-volver'), ok = document.getElementById('del-grupo-ok');

    // Con dinero pendiente no se puede salir: en vez de preguntar «¿Salir?» y luego
    // decir que no, se explica directamente qué falta y se ofrece ir a Cuentas finales.
    const yo = miNombreEnGrupo(g);
    const saldo = yo ? Number(g.members[yo]) || 0 : 0;
    const pagoSinConfirmar = yo ? (g.expenses || []).find(e => e.es_pago && e.por_confirmar && e.payer === yo) : null;
    if (yo && (Math.abs(saldo) > 0.05 || pagoSinConfirmar)) {
      const txs = deudasPendientes(g);
      // Texto corto: con una persona se nombra; con varias, solo cuántas (el detalle está en «Ver cuentas»)
      const debo = txs.filter(t => t.from === yo), meDeben = txs.filter(t => t.to === yo);
      let texto;
      if (saldo < -0.05) {
        texto = (debo.length === 1 ? `Debes ${formatAmountBase(-saldo)} a ${debo[0].to}` : `Debes ${formatAmountBase(-saldo)} a ${debo.length} personas`)
          + '. Podrás salir cuando hayas pagado.';
      } else if (saldo > 0.05) {
        texto = (meDeben.length === 1 ? `${meDeben[0].from} te debe ${formatAmountBase(saldo)}` : `Aún te deben ${formatAmountBase(saldo)} entre ${meDeben.length} personas`)
          + '. Podrás salir cuando te hayan pagado.';
      } else {
        const para = (pagoSinConfirmar.involved || [])[0] || '';
        texto = `Tu pago de ${formatAmountBase(Number(pagoSinConfirmar.baseAmt) || 0)} a ${para} está pendiente de que lo confirme. Podrás salir cuando lo confirme`
          + (pagoSinConfirmar.pago_confirmar_antes ? `, o el ${fechaDiaMes(pagoSinConfirmar.pago_confirmar_antes)} si no responde.` : '.');
      }
      document.getElementById('del-grupo-titulo').textContent = 'Aún no puedes salir del grupo';
      document.getElementById('del-grupo-texto').textContent = texto;
      const conCuentas = Math.abs(saldo) > 0.05;
      volver.className = conCuentas ? 'btn btn-outline' : 'btn btn-gold';
      volver.innerHTML = conCuentas ? 'Entendido' : icono('check', 15) + ' Entendido';
      ok.className = 'btn btn-gold'; ok.style.display = conCuentas ? '' : 'none';
      ok.innerHTML = icono('billete', 15) + ' Ver cuentas';
      ok.onclick = () => { cerrarModalBorrar(); irASeccion('sec5', toggleCuentasSection, 'cuentasSectionWrap'); };
      document.getElementById('modal-borrar-grupo').style.display = 'flex';
      document.body.style.overflow = 'hidden';
      return;
    }
    // Sin nada pendiente: la ventana de siempre, con sus botones normales
    volver.className = 'btn btn-outline'; ok.className = 'btn btn-peligro'; ok.style.display = ''; ok.onclick = ejecutarBorradoFinal;

    // Misma ventana para los dos casos, con el texto y los iconos de lo que de verdad pasa
    const salir = otrosConCuenta(g) > 0;
    document.getElementById('del-grupo-titulo').textContent = salir ? '¿Salir del grupo?' : '¿Eliminar grupo?';
    document.getElementById('del-grupo-texto').textContent = salir
      ? 'El grupo seguirá existiendo para los demás. Podrán volver a invitarte.'
      : 'Eres la única persona del grupo: se eliminará con todos sus gastos. Esta acción no se puede deshacer.';
    document.getElementById('del-grupo-volver').innerHTML = icono(salir ? 'quedarse' : 'deshacer', 15) + ' No, volver';
    document.getElementById('del-grupo-ok').innerHTML = icono(salir ? 'salir' : 'papelera', 15) + (salir ? ' Sí, salir' : ' Sí, eliminar');
    window._grupoSaliendo = salir;
    document.getElementById('modal-borrar-grupo').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

/**
 * 2. Cierra el modal y libera el índice.
 */
function cerrarModalBorrar() {
    document.getElementById('modal-borrar-grupo').style.display = 'none';
    document.body.style.overflow = '';
    groupToDeleteIdx = null;
	
}

/**
 * 3. Ejecuta la función de borrado técnico y cierra el modal.
 */
function ejecutarBorradoFinal() {
    if (groupToDeleteIdx !== null) {
        deleteGroup(groupToDeleteIdx); 
        cerrarModalBorrar();
    }
}

// ═══ GROUP EDIT MODAL (CORREGIDO) ════════════════════════════════════════════
let editingGroupIdx = null;

function openEditGroupModal(idx) {
  editingGroupIdx = idx;
  const g = groups[idx];
  const inputNombre = document.getElementById('edit-group-name');

  if (inputNombre) {
    inputNombre.value = g.name;
    document.getElementById('modal-editar-grupo').style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }
}

function cerrarModalEditar() {
  document.getElementById('modal-editar-grupo').style.display = 'none';
  document.body.style.overflow = '';
  editingGroupIdx = null;
}

async function guardarCambiosGrupo() {
  if (editingGroupIdx === null) return;

  const inputNombre = document.getElementById('edit-group-name');
  const nuevoNombre = inputNombre.value.trim();

  if (!nuevoNombre) {
    toast('El nombre del grupo no puede estar vacío', 'e');
    return;
  }

  const nombreAnterior = groups[editingGroupIdx].name;
  if (nuevoNombre === nombreAnterior) { cerrarModalEditar(); return; }
  const listo = bloquearBoton(document.getElementById('btnGuardarGrupo'), 'Guardando…');
  if (!listo) return;
  try {
    await vakaData.updateGroupName(editingGroupIdx, nuevoNombre);   // antes solo cambiaba en este móvil
  } catch (err) {
    listo();
    toast(err.status === 404 ? 'Solo quien creó el grupo puede cambiarle el nombre.' : textoError(err, 'No se pudo cambiar el nombre.'), 'e');
    return;
  }
  listo();
  await logActivity(`Grupo "${nombreAnterior}" renombrado a "${nuevoNombre}"`);

  if (typeof renderGroupsList === 'function') renderGroupsList();
  if (typeof renderAll === 'function' && currentGroupIdx === editingGroupIdx) renderAll();
  cerrarModalEditar();
  toast("Nombre del grupo cambiado", "s");
}
