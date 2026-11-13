// public/js/gastos.js — Gastos: registrar, lista, detalle, editar y borrar
// (antes dentro de index.html; el orden de carga está en index.html)

// ═══ GASTOS ══════════════════════════════════════════════════════════════
function toggleAddRate() {
  const currency = document.getElementById('expCurrency').value;
  const container = document.getElementById('addRateContainer');
  if (!container) return;
  if (currency === getBase()) {
    container.style.display = 'none';
    document.getElementById('expExchangeRate').value = '';
  } else {
    container.style.display = 'block';
    const rateInput = document.getElementById('expExchangeRate');
    if (!rateInput.value) rateInput.value = RATES[currency] || '';
  }
}

function selectEditCurrency(el) {
  document.querySelectorAll('#editModal .currency-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('editCurrency').value = el.dataset.currency;
}

let guardandoGasto = false;
async function addExpense() {
  if (guardandoGasto) return;
  if (currentGroupIdx === null) return;
  const g = groups[currentGroupIdx];
  const mbs = Object.keys(g.members);
  
  if (mbs.length < 2) {
    toast('Necesitas al menos 2 participantes', 'e');
    return;
  }

  // 1. Recogida de datos del formulario
  const desc = document.getElementById('expDesc').value.trim();
  const amount = parseFloat(document.getElementById('expAmount').value);
  const currency = document.getElementById('expCurrency').value;
  const cat = document.getElementById('expCat').value;
  const payer = document.getElementById('expPayer').value;
  const date = document.getElementById('expDate').value;
  const manualRate = parseFloat(document.getElementById('expExchangeRate').value);
  
  // CORRECCIÓN DE QA: Buscamos '.chip.sel' (clase estándar) o '.modal-chip.sel' por si acaso
  const involved = [...document.querySelectorAll('#involvedChips .chip.sel, #involvedChips .modal-chip.sel')]
                    .map(c => c.dataset.name);

  // 2. Validaciones
  if (!desc) { toast('Añade una descripción', 'e'); return; }
  if (!amount || amount <= 0) { toast('Monto inválido', 'e'); return; }
  if (!payer) { toast('Selecciona quién pagó', 'e'); return; }
  
  // Ahora involucrados ya no debería dar 0 si has seleccionado chips
  if (involved.length === 0) { toast('Selecciona al menos un consumidor', 'e'); return; }
  
  const gStart = (g.start || '').slice(0, 10);
  const gEnd = (g.end || '').slice(0, 10);
  if (date < gStart || date > gEnd) { toast('Fecha fuera del rango del grupo', 'e'); return; }

  // 3. Lógica de Conversión
  const rateToUse = (currency === getBase()) ? 1 : (manualRate || RATES[currency] || 1);
    const baseAmt = +(amount / rateToUse).toFixed(2);

  guardandoGasto = true;
  const btnGuardar = document.getElementById('btnGuardarGasto');
  if (btnGuardar) { btnGuardar.disabled = true; btnGuardar.textContent = 'Guardando...'; }

  try {

    const nuevoGasto = { 
      desc, 
      amount: Number(amount), 
      cat, 
      payer, 
      date, 
      involved, 
      currency,
      baseAmt,
      exchangeRate: rateToUse,
	  ticket: window._ticketNuevo || null  // imagen reducida del ticket escaneado
    };

    await vakaData.addExpense(currentGroupIdx, nuevoGasto);
    
    // Sincronización de totales
    g.total = g.expenses.filter(e => !e.es_pago).reduce((sum, e) => sum + (Number(e.baseAmt) || 0), 0);

    // 4. Limpieza y refresco
    document.getElementById('expDesc').value = '';
    document.getElementById('expAmount').value = '';
    document.getElementById('addRateContainer').style.display = 'none';
    
    // Limpiamos los chips (usando ambas clases posibles)
    document.querySelectorAll('#involvedChips .chip, #involvedChips .modal-chip')
            .forEach(c => c.classList.remove('sel'));

    // Recargar grupo fresco del backend para tener orden correcto
    try {
      const res = await fetch(`${API_BASE}/api/v1/groups/${g.id}`, {
        headers: { 'Authorization': `Bearer ${vakaData.getToken()}` }
      });
      const fresh = await res.json();
      if (fresh && !fresh.error) {
        const freshMembers = Array.isArray(fresh.members)
          ? Object.fromEntries(fresh.members.map(m => [m.display_name, m.balance || 0]))
          : (fresh.members || {});        
        const mergedMembers = { ...groups[currentGroupIdx].members, ...freshMembers };
        groups[currentGroupIdx] = {
          ...groups[currentGroupIdx],
          members: mergedMembers,
          expenses: (fresh.expenses || []).sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).map(e => ({
            ...e,
            desc: e.description || e.desc,
            payer: e.payer_name || e.payer,
            date: e.expense_date || e.date,
            baseAmt: Number(e.amount_base || e.baseAmt) || 0,
            cat: e.category || e.cat,
            involved: e.splits ? e.splits.map(s => s.member_name) : (e.involved || [])
          }))
        };
      }
    } catch(_) {}
    renderAll();
    renderGroups();
    await refrescarActividad(); // el servidor ya registró el gasto para todo el grupo
    clearOCR();
    toast('Gasto registrado', 's');
    } catch (err) {
    toast(textoError(err, 'No se pudo guardar el gasto.'), 'e');
  } finally {
    guardandoGasto = false;
    const btnGuardar = document.getElementById('btnGuardarGasto');
    if (btnGuardar) { btnGuardar.disabled = false; btnGuardar.textContent = 'Guardar Gasto'; }
  }
}

async function deleteExpense(idx) {
  if (currentGroupIdx === null) return;
  const g = groups[currentGroupIdx];
  const e = g.expenses[idx];
  if (!e) return;

  try {
    await vakaData.deleteExpense(currentGroupIdx, idx);
    g.total = g.expenses.filter(e => !e.es_pago).reduce((sum, exp) => sum + (Number(exp.baseAmt) || 0), 0);
    await refrescarActividad(); // el servidor ya registró el borrado para todo el grupo
    renderAll();
    if (typeof renderGroups === 'function') renderGroups();
    toast('Gasto eliminado', 's');
  } catch (err) {
    console.error("Error al eliminar:", err);
    toast(textoError(err, 'No se pudo eliminar el gasto.'), 'e');
  }
}

// ═══ EDITAR GASTO ════════════════════════════════════════════════════════
editingExpenseIdx = null;

function openEditModal(idx) {
  editingExpenseIdx = idx;
  if (currentGroupIdx === null) return;
  const g = groups[currentGroupIdx];
  const e = g.expenses[idx];
  
  // PROTECCIÓN DE QA:
  if (!e) {
    console.error("Gasto no encontrado en el índice:", idx);
    toast("Error: El gasto no existe", "e");
    return;
  }

  const mbs = Object.keys(g.members);
  
  // ASEGURAR INVOLUCRADOS: Si no existe, usamos array vacío [] en lugar de undefined
  const involved = e.involved || [];

  // 1. Carga de datos básicos
  document.getElementById('editDesc').value = e.desc || '';
  document.getElementById('editAmount').value = e.amount || '';
  // El campo de fecha solo acepta AAAA-MM-DD: se recortan horas o zonas horarias si las hubiera
  const fechaOriginal = String(e.date || e.expense_date || '').slice(0, 10);
  document.getElementById('editDate').value = /^\d{4}-\d{2}-\d{2}$/.test(fechaOriginal) ? fechaOriginal : '';
  document.getElementById('editCat').value = e.cat || 'other';

  // ... (el resto de tu lógica original sigue aquí) ...
  document.getElementById('editAmount').value = e.amount;
  document.getElementById('editCat').value = e.cat;
  // 2. Persistencia de Moneda
  document.getElementById('editCurrency').value = e.currency || getBase();
  document.querySelectorAll('#editModal .currency-chip').forEach(c => {
  c.classList.toggle('active', c.dataset.currency === (e.currency || getBase()));
});
  // 3. Lógica de Tasa de Cambio
  const rateContainer = document.getElementById('editRateContainer');
  const rateInput = document.getElementById('editExchangeRate');
  // Si no se guardó el tipo de cambio, se deduce del importe original y el convertido
  const tasaDeducida = (Number(e.amount) > 0 && Number(e.baseAmt) > 0) ? +(Number(e.amount) / Number(e.baseAmt)).toFixed(4) : null;
  rateInput.value = e.exchangeRate || tasaDeducida || (RATES[e.currency] || "");
  if (e.currency === getBase()) {
    rateContainer.style.display = 'none';
  } else {
    rateContainer.style.display = 'block';
  }
  // 4. Selector del pagador
  const ps = document.getElementById('editPayer');
  ps.innerHTML = mbs.map(m => `<option value="${m}">${m}</option>`).join('');
  ps.value = e.payer;
  // 5. Chips de involucrados
  const ic = document.getElementById('editInvolvedChips');
  const invList = e.involved || [];
  
  ic.innerHTML = mbs.map(m => `
  <div class="modal-chip ${invList.includes(m) ? 'sel' : ''}" 
       data-name="${m}" 
       onclick="this.classList.toggle('sel');updateEditSelectAllBtn()">
    <div class="av">${m[0].toUpperCase()}</div>${m}
  </div>`).join('');
  // 6. Cargar ticket si existe
  clearEditOCR();
  window._editTicketDeleted = false;
  if (!e.ticket && e.has_ticket) {
    cargarTicket(idx).then(t => { if (t) document.getElementById('editOcrPreview').src = t; });
  }
  if (e.ticket || e.has_ticket) {
	document.getElementById('editOcrBtn').innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg> Adjuntar <span class="u-pos-absolute u-top-3 u-right-3 u-w-7 u-h-7 u-bg-success u-r-50p u-b-1_5-solid-dark" id="editOcrDot" style="display:none"></span>';
    document.getElementById('editOcrPreview').src = e.ticket || '';
    document.getElementById('editOcrPreview').style.display = 'block';
    document.getElementById('editOcrFileName').textContent = 'Comprobante guardado';
    document.getElementById('editOcrDot').style.display = 'block';
    document.getElementById('editOcrClearBtn').style.display = 'block';
    document.getElementById('editOcrBtn').innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg> Cambiar <span class="u-pos-absolute u-top-3 u-right-3 u-w-7 u-h-7 u-bg-success u-r-50p u-b-1_5-solid-dark" id="editOcrDot" style="display:none"></span>';
    document.getElementById('editOcrSuccess').innerHTML = icono('ok',12) + ' Guardado';
    document.getElementById('editOcrSuccess').style.display = 'block';
  }
  // 7. Actualizar estado visual y abrir modal
  updateEditSelectAllBtn();
  document.getElementById('editModal').style.display = '';
  document.getElementById('editModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeEditModal(){
  document.getElementById('editModal').classList.remove('open');
  document.body.style.overflow='';
  clearEditOCR();
  // Si veníamos de la pantalla de detalle del gasto, volver ahí
  const fromGasto = currentExpenseIdx !== null && document.getElementById('page-gasto').classList.contains('active') === false;
  if (editingExpenseIdx !== null && fromGasto) {
    openGasto(editingExpenseIdx);
  }
  editingExpenseIdx = null;
}

function updateEditSelectAllBtn(){
  const chips=document.querySelectorAll('#editInvolvedChips .modal-chip');
  const allSel=[...chips].every(c=>c.classList.contains('sel'));
  document.getElementById('btnEditSelectAll').innerHTML=allSel?icono('casilla',13)+' Ninguno':icono('casillaOk',13)+' Todos';
}

function toggleEditSelectAll(){
  const chips=document.querySelectorAll('#editInvolvedChips .modal-chip');
  const allSel=[...chips].every(c=>c.classList.contains('sel'));
  chips.forEach(c=>c.classList.toggle('sel',!allSel));
  updateEditSelectAllBtn();
}

async function saveEditExpense() {
  if (currentGroupIdx === null || editingExpenseIdx === null) return;
  
  // 1. Bloqueo de UI para evitar múltiples clics
  const saveBtn = document.querySelector('button[onclick="saveEditExpense()"]');
  if (saveBtn) saveBtn.disabled = true;

  const g = groups[currentGroupIdx];
  const old = g.expenses[editingExpenseIdx];

  const desc = document.getElementById('editDesc').value.trim();
  const amount = parseFloat(document.getElementById('editAmount').value);
  const currency = document.getElementById('editCurrency').value;
  const cat = document.getElementById('editCat').value;
  const payer = document.getElementById('editPayer').value;
  const date = document.getElementById('editDate').value;
  // Tipo de cambio: el manual si lo hay; si no, el de la tabla
  const editRate = parseFloat(document.getElementById('editExchangeRate').value);
  const rateEdit = (currency === getBase()) ? 1 : (editRate || RATES[currency] || 1);
  const baseAmtEdit = +(amount / rateEdit).toFixed(2);
  // Comprobante: nuevo → se envía; quitado → null; sin cambios → no se envía (se conserva)
  const teniaTicket = !!(old.ticket || old.has_ticket);
  const ticketEdit = window._editTicketNuevo ? window._editTicketNuevo
                   : (window._editTicketDeleted && teniaTicket ? null : undefined);
  const involved = [...document.querySelectorAll('#editInvolvedChips .modal-chip.sel')].map(c => c.dataset.name);

  if (!desc) { toast('Añade una descripción', 'e'); if (saveBtn) saveBtn.disabled = false; return; }
  if (!amount || amount <= 0) { toast('Monto inválido', 'e'); if (saveBtn) saveBtn.disabled = false; return; }
  if (involved.length === 0) { toast('Selecciona al menos un consumidor', 'e'); if (saveBtn) saveBtn.disabled = false; return; }

  try {
    const expId = old.id || old._id;
    const response = await fetch(`${API_BASE}/api/v1/groups/${g.id}/expenses/${expId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${vakaData.getToken()}` },
        body: JSON.stringify({ description: desc, amount, amount_base: baseAmtEdit, currency, category: cat, payer_name: payer, expense_date: date, involved, ticket: ticketEdit })
    });

    if (!response.ok) {
      let msg = `Error del servidor (${response.status})`;
      try { const errData = await response.json(); if (errData.error) msg = errData.error; } catch(_) {}
      throw Object.assign(new Error(msg), { status: response.status });
    }

    // Confirmado por el servidor: se actualiza en pantalla
    g.expenses[editingExpenseIdx] = { 
        ...g.expenses[editingExpenseIdx], 
        desc, amount, currency, cat, payer, date, involved, baseAmt: baseAmtEdit, exchangeRate: rateEdit,
        ...(ticketEdit !== undefined ? { ticket: ticketEdit, has_ticket: !!ticketEdit } : {})
    };

    // Sincronización final: Recargamos el estado completo del grupo desde el servidor
    const resFresh = await fetch(`${API_BASE}/api/v1/groups/${g.id}`, {
        headers: { 'Authorization': `Bearer ${vakaData.getToken()}` }
    });
    
    if (resFresh.ok) {
    const freshData = await resFresh.json();
    groups[currentGroupIdx] = { 
      ...groups[currentGroupIdx], 
      ...freshData,
      members: normalizeMembersField(freshData.members, groups[currentGroupIdx].members),
      expenses: (freshData.expenses || []).sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).map(e => ({
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

    renderAll();
    renderGroups();
    document.getElementById('editModal').classList.remove('open');
    document.body.style.overflow = '';
        toast('Gasto actualizado', 's');
    await refrescarActividad(); // el servidor ya registró la edición para todo el grupo

    // Si la ficha del gasto está abierta, se vuelve a dibujar con los datos nuevos
    if (document.getElementById('page-gasto').classList.contains('active')) {
      const expId = old.id || old._id;
      const lista = groups[currentGroupIdx].expenses;
      const nuevoIdx = lista.findIndex(x => (x.id || x._id) === expId);
      openGasto(nuevoIdx >= 0 ? nuevoIdx : editingExpenseIdx);
    }
  } catch (err) {
    console.error(err);
    toast(textoError(err, 'No se pudo guardar el cambio.'), 'e');
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}
// ═══ BORRAR GASTO ════════════════════════════════════════════════════════
// «Actualizar cuentas»: primero descarga el grupo del servidor (pagos y gastos que
// otros hayan registrado mientras tenías la app abierta) y después calcula.
// Antes se calculaba con los datos cargados al abrir el grupo: si alguien había
// confirmado un pago entretanto, ese pago no contaba y el deudor seguía apareciendo.
async function calcDebts(opciones = {}) {
  if (currentGroupIdx === null) return;
  const g = groups[currentGroupIdx];
  const btn = document.getElementById('btnCalcularDeudas');
  if (btn) { btn.disabled = true; btn.textContent = 'Actualizando…'; }
  const ok = await recargarGrupoDelServidor(g, { aviso: !opciones.silencioso });
  if (btn) { btn.disabled = false; btn.innerHTML = icono('recargar',14) + ' Actualizar cuentas'; }
  if (!ok && !opciones.silencioso) toast('Sin conexión: las cuentas se calculan con los últimos datos descargados.', 'i');
}

function calcularDeudas(aviso = true){
  if(currentGroupIdx===null)return;
  updateBalances();
  const g=groups[currentGroupIdx];
  const base=document.getElementById('baseCurrency')?.value||'EUR';
  // Restos de redondeo de hasta 5 céntimos se consideran saldados (igual que el servidor)
  const d=Object.entries(g.members).filter(([,v])=>v<-0.05).map(([k,v])=>[k,v]);
  const c=Object.entries(g.members).filter(([,v])=>v>0.05).map(([k,v])=>[k,v]);
  const txs=[];
  while(d.length&&c.length){
    d.sort((a,b)=>a[1]-b[1]);c.sort((a,b)=>b[1]-a[1]);
    const amt=Math.min(Math.abs(d[0][1]),c[0][1]);
    txs.push({from:d[0][0],to:c[0][0],amount:amt});
    d[0][1]=+(d[0][1]+amt).toFixed(2);c[0][1]=+(c[0][1]-amt).toFixed(2);
    if(Math.abs(d[0][1])<=0.05)d.shift();if(Math.abs(c[0][1])<=0.05)c.shift();
  }
  _deudasActuales = txs;
  renderPagosRealizados();
  const dl=document.getElementById('debtList');
  dl.innerHTML=txs.length===0
    ?'<div class="all-good">'+icono('ok',18)+' ¡Todas las cuentas están cuadradas!</div>'
   :txs.map((t,i)=>`
      <div class="debt-item u-wrap-wrap u-gap-8" id="debt-${i}">
        <div class="u-d-flex u-ai-center u-gap-8 u-w-100p">
          <span class="u-c-gold-text">→</span>
          <div class="debt-txt"><em>${t.from}</em> debe pagar a <em>${t.to}</em></div>
          <div class="debt-amt">${formatAmountBase(t.amount,base)}</div>
        </div>
        <div class="u-d-flex u-gap-6 u-w-100p u-jc-flex-end u-ai-center">
          ${(() => {
            // Solo el deudor puede pagar y solo el acreedor puede confirmar el cobro.
            // El resto del grupo ve la deuda, sin botones.
            const g = groups[currentGroupIdx];
            const myName = miNombreEnGrupo(g);
            const de = escaparHtml(t.from).replace(/'/g, '&#39;'), a = escaparHtml(t.to).replace(/'/g, '&#39;');
            if (myName === t.from) return `<button class="btn btn-gold btn-sm" onclick="openPayModal(${i},'${de}','${a}',${t.amount})"><svg class="u-va-middle u-mr-4" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>Pagar</button>`;
            if (myName === t.to) return `<span class="u-d-flex u-ai-center u-gap-4 u-fs-sm u-c-muted u-fw-700 u-mr-auto"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>Pendiente de cobro</span>
              <button class="btn btn-outline btn-sm" onclick="openProofModal(${i},'${de}','${a}',${t.amount})"><svg class="u-va-middle u-mr-4" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>Confirmar cobro</button>`;
            return '';
          })()}
        </div>
      </div>`).join(''); 
  if (aviso) toast('Cuentas actualizadas','s');
}

// ─── MODAL BORRAR GASTO ──────────────────────────────────────────
let gastoABorrarIdx = null;

function openDeleteExpenseModal(idx) {
  if (currentGroupIdx === null) return;
  const g = groups[currentGroupIdx];
  const e = g.expenses[idx];
  if (!e) return;

  gastoABorrarIdx = idx;

  const base = getBase();
  const sym = SYMBOLS[e.currency] || '€';
  const symBase = SYMBOLS[base] || '€';

  document.getElementById('del-gasto-icon').innerHTML = e.es_pago ? iconoCat('pago', 24) : iconoCat(e.cat, 24);
  document.getElementById('del-gasto-desc').textContent = e.desc;
  document.getElementById('del-gasto-amount').textContent = 
    e.currency !== base 
      ? `${sym}${Number(e.amount).toFixed(2)} ≈ ${symBase}${Number(e.baseAmt).toFixed(2)}`
      : `${sym}${Number(e.amount).toFixed(2)}`;
  document.getElementById('del-gasto-payer').textContent = e.payer;
  document.getElementById('del-gasto-date').textContent = fmtDate(e.date);

  document.getElementById('modal-borrar-gasto').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function cerrarModalBorrarGasto() {
  document.getElementById('modal-borrar-gasto').style.display = 'none';
  document.body.style.overflow = '';
  gastoABorrarIdx = null;
}

async function ejecutarBorradoGasto() {
  if (gastoABorrarIdx === null) return;
  const idx = gastoABorrarIdx;
  cerrarModalBorrarGasto();
  closeEditModal(); // cierra edición si estaba abierta
  // El gasto se quita de la lista al instante; el servidor se actualiza en segundo plano
  const borrado = deleteExpense(idx);
  renderAll();
  goBackToGroup();
  await borrado;
}

function openDeleteFromEdit() {
  if (editingExpenseIdx === null) return;
  openDeleteExpenseModal(editingExpenseIdx);
}
