// public/js/pagos.js — Pagos: pagar, pagos realizados, pendientes de confirmar y comprobantes
// (antes dentro de index.html; el orden de carga está en index.html)

// ─── PAGAR TAMBIÉN POR… ─────────────────────────────────────────────
// Quien paga puede saldar a la vez las deudas de otras personas con el MISMO
// acreedor (p. ej. paga 36 € por él y por su pareja). Se registra un pago por
// cada deuda, con el mismo comprobante y anotando quién pagó de verdad.
let _deudasActuales = [];   // última lista de «quién paga a quién»
const totalPago = d => +(Number(d.amount) + (d.extras || []).reduce((s, x) => s + Number(x.amount), 0)).toFixed(2);
function pintarPagarTambien(idCont, datos, alCambiar) {
  const el = document.getElementById(idCont);
  datos.extras = [];
  const otros = (_deudasActuales || []).filter(t => t.to === datos.to && t.from !== datos.from);
  if (!otros.length) { el.style.display = 'none'; el.innerHTML = ''; return; }
  el.innerHTML = `<div class="pt-titulo">Pagar también por…</div>` +
    otros.map((t, i) => `<label><input type="checkbox" data-i="${i}"><span class="pt-nombre">${escaparHtml(t.from)}</span><span class="pt-imp">${formatAmountBase(t.amount, getBase())}</span></label>`).join('') +
    `<div class="pt-nota">Marca a quien también pagas a ${escaparHtml(datos.to)}. Se saldará la deuda de cada uno, con el mismo comprobante.</div>`;
  el.style.display = 'block';
  el.querySelectorAll('input').forEach(cb => cb.onchange = () => {
    datos.extras = [...el.querySelectorAll('input:checked')].map(c => otros[+c.dataset.i]);
    alCambiar();
  });
}

// ─── PAGOS REALIZADOS ───────────────────────────────────────────────
// Historial de deudas saldadas, visible para todo el grupo, con el comprobante si lo hay
function renderPagosRealizados() {
  const g = groups[currentGroupIdx];
  const cont = document.getElementById('pagosRealizados');
  if (!g || !cont) return;
  const nombrePorId = Object.fromEntries(Object.entries(g.memberIds || {}).map(([n, id]) => [String(id), n]));
  const pagos = (g.expenses || []).map((e, i) => ({ e, i })).filter(x => x.e.es_pago)
    .sort((a, b) => String(b.e.date).localeCompare(String(a.e.date)) || (b.e.id || 0) - (a.e.id || 0));
  const contador = document.getElementById('pagosCounter');
  if (contador) contador.textContent = pagos.length ? `(${pagos.length})` : '';
  if (!pagos.length) {
    cont.innerHTML = '<div class="no-items"><div class="ni"><svg class="icono" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg></div><div>Aún no hay pagos registrados.<br>Aparecerán aquí cuando se salden deudas en «Cuentas finales».</div></div>';
    return;
  }
  const base = getBase();
  cont.innerHTML = pagos.map(({ e, i }) => {
    const para = (e.involved || [])[0] || '';
    const pagoPor = (String(e.desc || '').match(/\(pagó ([^)]+)\)$/) || [])[1];
    const quien = nombrePorId[String(e.member_id)];
    const detalles = [fmtDate(e.date), pagoPor ? `pagó ${pagoPor}` : '', quien ? `registró ${quien}` : ''].filter(Boolean).join(' · ');
    if (e.por_confirmar) return tarjetaPagoPendiente(e, i, para, detalles, base);
    // Cada pago es una tarjeta (como en Lista de gastos): tocarla abre el detalle; 🧾 abre el comprobante
    return `<div class="group-card u-gap-10 u-p-12-12 u-mb-8" onclick="openGasto(${i},'pagos')">
      <div class="u-w-34 u-h-34 u-r-md u-bg-x05021 u-d-flex u-ai-center u-jc-center u-shrink-0">
        <svg class="u-c-success" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <div class="u-f-1 u-minw-0">
        <div class="u-fs-base u-c-text"><strong>${escaparHtml(e.payer)}</strong> → <strong>${escaparHtml(para)}</strong></div>
        <div class="u-fs-xs u-c-muted u-mt-2">${escaparHtml(detalles)}</div>
      </div>
      <div class="u-fw-800 u-c-success u-fs-base u-ws-nowrap">${formatAmountBase(Number(e.baseAmt) || 0, base)}</div>
      ${e.has_ticket || e.ticket
        ? `<button class="u-ai-center u-jc-center u-w-32 u-h-32 u-shrink-0 u-r-sm u-b-x6caa3 u-bg-none u-c-gold-text u-cur-pointer" type="button" title="Ver comprobante" onclick="event.stopPropagation();verTicket(${i})" style="display:flex"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg></button>`
        : ''}
      <svg class="u-shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
    </div>`;
  }).join('');
}

// ─── PAGOS PENDIENTES DE CONFIRMAR ──────────────────────────────────
// Un pago registrado por quien paga espera a que quien cobra lo confirme
// (5 días; después se confirma solo). Quien cobra: Confirmar / Recibí otro
// importe / Rechazar. Quien pagó no puede salir del grupo mientras tanto.
const fechaDiaMes = d => { const f = new Date(d); return `${String(f.getDate()).padStart(2, '0')}/${String(f.getMonth() + 1).padStart(2, '0')}`; };
function tarjetaPagoPendiente(e, i, para, detalles, base) {
  const g = groups[currentGroupIdx];
  const yo = miNombreEnGrupo(g);
  const hasta = fechaDiaMes(e.pago_confirmar_antes);
  const imp = formatAmountBase(Number(e.baseAmt) || 0, base);
  const etiqueta = yo === para ? `Confírmalo antes del ${hasta}. Si no respondes, se dará por recibido.`
    : yo === e.payer ? `Esperando que ${para} lo confirme. Si no responde, se confirmará solo el ${hasta}.`
    : `Pendiente de que ${para} lo confirme (como máximo hasta el ${hasta}).`;
  const botones = yo === para ? `
      <div class="u-d-flex u-dir-column u-gap-8 u-mt-10" onclick="event.stopPropagation()">
        <button type="button" class="btn btn-gold" onclick="confirmarPagoPendiente(${i})"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Confirmar: recibí ${imp}</button>
        <button type="button" class="btn btn-outline" onclick="abrirPagoPendiente(${i},'otro')">Recibí otro importe</button>
        <button type="button" class="btn btn-danger" onclick="abrirPagoPendiente(${i},'rechazar')">Rechazar: no he recibido nada</button>
      </div>` : '';
  return `<div class="u-b-x65d6c u-bg-x3c1ef u-r-md u-mb-8 u-p-12-12 u-cur-pointer" onclick="openGasto(${i},'pagos')">
    <div class="u-d-flex u-ai-center u-gap-10">
      <div class="u-w-34 u-h-34 u-r-md u-bg-x3cc9f u-d-flex u-ai-center u-jc-center u-shrink-0">
        <svg class="u-c-gold-text" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      </div>
      <div class="u-f-1 u-minw-0">
        <div class="u-fs-base u-c-text"><strong>${escaparHtml(e.payer)}</strong> → <strong>${escaparHtml(para)}</strong></div>
        <div class="u-fs-xs u-c-muted u-mt-2">${escaparHtml(detalles)}</div>
      </div>
      <div class="u-fw-800 u-c-gold-text u-fs-base u-ws-nowrap">${imp}</div>
    </div>
    <div class="u-d-inline-block u-fs-xs u-fw-800 u-c-gold-text u-bg-x3cc9f u-r-lg u-p-4-10 u-mt-8 u-lh-1_35">${escaparHtml(etiqueta)}</div>
    ${botones}
  </div>`;
}
async function enviarConfirmacionPago(e, importe) {
  const g = groups[currentGroupIdx];
  try {
    const res = await fetch(`${API_BASE}/api/v1/groups/${g.id}/expenses/${e.id}/confirmar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${vakaData.getToken()}` },
      body: JSON.stringify(importe === undefined ? {} : { importe })
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { toast(d.error || 'No se pudo confirmar el pago', 'e'); await recargarGrupoDelServidor(g); return false; }
    toast(d.parcial ? `Pago confirmado por ${formatAmountBase(d.importe)}. El resto sigue pendiente.` : 'Pago confirmado', 's');
    await recargarGrupoDelServidor(g);
    refrescarActividad();
    return true;
  } catch (_) { toast('Sin conexión. Inténtalo de nuevo.', 'e'); return false; }
}
function confirmarPagoPendiente(i) {
  const e = groups[currentGroupIdx].expenses[i];
  if (e) enviarConfirmacionPago(e);
}
let _pagoPendiente = null;
function abrirPagoPendiente(i, modo) {
  const e = groups[currentGroupIdx].expenses[i];
  if (!e) return;
  _pagoPendiente = { e, modo };
  const total = Number(e.baseAmt) || 0;
  const otro = modo === 'otro';
  document.getElementById('pp-titulo').textContent = otro ? `¿Cuánto recibiste de ${e.payer}?` : '¿Rechazar el pago?';
  document.getElementById('pp-texto').textContent = otro
    ? `${e.payer} registró un pago de ${formatAmountBase(total)}. Escribe lo que te llegó de verdad.`
    : `Úsalo si no has recibido nada de ${e.payer}. El pago de ${formatAmountBase(total)} se anula y la deuda vuelve a «Cuentas finales».`;
  document.getElementById('pp-importe-wrap').style.display = otro ? 'block' : 'none';
  const inp = document.getElementById('pp-importe');
  inp.value = ''; inp.max = total;
  document.getElementById('pp-resumen').style.display = 'none';
  const btn = document.getElementById('pp-aceptar');
  btn.textContent = otro ? 'Confirmar' : 'Sí, rechazar';
  btn.className = otro ? 'btn btn-gold' : 'btn btn-peligro';
  btn.disabled = otro;
  btn.style.opacity = otro ? '.5' : '1';
  document.getElementById('modal-pago-pendiente').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  if (otro) setTimeout(() => inp.focus(), 50);
}
function actualizarPagoPendiente() {
  if (!_pagoPendiente) return;
  const total = Number(_pagoPendiente.e.baseAmt) || 0;
  const v = Math.round(parseFloat(String(document.getElementById('pp-importe').value).replace(',', '.')) * 100) / 100;
  const res = document.getElementById('pp-resumen');
  const btn = document.getElementById('pp-aceptar');
  const ok = Number.isFinite(v) && v > 0 && v <= total;
  btn.disabled = !ok; btn.style.opacity = ok ? '1' : '.5';
  if (!Number.isFinite(v) || v <= 0) { res.style.display = 'none'; btn.textContent = 'Confirmar'; return; }
  res.style.display = 'block';
  res.innerHTML = '';
  const linea = (t, ic, color) => { const d = document.createElement('div'); if (ic) { const i = document.createElement('span'); i.innerHTML = icono(ic, 14) + ' '; if (color) i.style.color = color; d.appendChild(i); } d.appendChild(document.createTextNode(t)); res.appendChild(d); };
  if (v > total) { linea(`No puede ser más de ${formatAmountBase(total)}, lo que registró ${_pagoPendiente.e.payer}.`, 'alerta', 'var(--gold)'); return; }
  linea(`Pago confirmado por ${formatAmountBase(v)}`, 'ok', 'var(--success)');
  if (total - v > 0.004) linea(`${_pagoPendiente.e.payer} seguirá debiéndote ${formatAmountBase(total - v)} en «Cuentas finales»`, 'punto', 'var(--danger)');
  btn.textContent = `Confirmar ${formatAmountBase(v)}`;
}
function cerrarPagoPendiente() {
  document.getElementById('modal-pago-pendiente').style.display = 'none';
  document.body.style.overflow = '';
  _pagoPendiente = null;
}
async function aceptarPagoPendiente() {
  if (!_pagoPendiente) return;
  const { e, modo } = _pagoPendiente;
  const g = groups[currentGroupIdx];
  if (modo === 'otro') {
    const v = Math.round(parseFloat(String(document.getElementById('pp-importe').value).replace(',', '.')) * 100) / 100;
    if (!(v > 0)) return;
    cerrarPagoPendiente();
    await enviarConfirmacionPago(e, v);
    return;
  }
  cerrarPagoPendiente();
  try {
    const res = await fetch(`${API_BASE}/api/v1/groups/${g.id}/expenses/${e.id}`, {
      method: 'DELETE', headers: { 'Authorization': `Bearer ${vakaData.getToken()}` }
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})); toast(d.error || 'No se pudo rechazar el pago', 'e'); return; }
    toast('Pago rechazado. La deuda vuelve a «Cuentas finales».', 'i');
    await recargarGrupoDelServidor(g);
    refrescarActividad();
  } catch (_) { toast('Sin conexión. Inténtalo de nuevo.', 'e'); }
}

// Aviso con título y texto (por ejemplo, por qué aún no puedes salir de un grupo)
function mostrarAviso(titulo, texto) {
  document.getElementById('aviso-titulo').textContent = titulo;
  document.getElementById('aviso-texto').textContent = texto;
  document.getElementById('modal-aviso').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}
function cerrarAviso() {
  document.getElementById('modal-aviso').style.display = 'none';
  document.body.style.overflow = '';
}

// ─── VENTANA PAGAR ───────────────────────────────────────────────────────
let _payData = null;
function openPayModal(idx,from,to,amount){
  _payData={idx,from,to,amount};
  const base=document.getElementById('baseCurrency')?.value||'EUR';
  document.getElementById('pmTitle').textContent=`${from} → ${to}`;
  document.getElementById('pmAmount').textContent=formatAmountBase(amount,base);
  pintarPagarTambien('pmTambien', _payData, () => {
    document.getElementById('pmAmount').textContent = formatAmountBase(totalPago(_payData), base);
    const sel = document.querySelector('.pay-method-btn.selected');
    if (sel) sel.click();   // actualiza el importe del Bizum / transferencia
  });
  document.getElementById('pmProofThumb').style.display='none';
  document.getElementById('pmProofFile').value='';
  document.querySelectorAll('.pay-method-btn').forEach(b=>b.classList.remove('selected'));
  document.getElementById('pmDetalle').style.display='none';
  document.getElementById('payModal').style.display = '';
  document.getElementById('payModal').classList.add('open');
  document.body.style.overflow='hidden';
  // Pedimos cómo cobra el acreedor
  _cobro = 'cargando';
  const g = groups[currentGroupIdx];
  fetch(`${API_BASE}/api/v1/groups/${g.id}/cobro/${encodeURIComponent(to)}`, {
    headers: { 'Authorization': `Bearer ${vakaData.getToken()}` }
  }).then(r => r.ok ? r.json() : null).then(d => {
    _cobro = d;
    const sel = document.querySelector('.pay-method-btn.selected');
    if (sel) sel.click(); // refresca el detalle si ya había un método elegido
  }).catch(() => { _cobro = null; });
}
function closePayModal(){
  document.getElementById('payModal').classList.remove('open');
  document.body.style.overflow='';
  _payData=null;
}
// Datos de cobro del acreedor (se piden al abrir el modal de pago)
let _cobro = null;

function selectPayMethod(el, method) {
  document.querySelectorAll('.pay-method-btn').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  if (!_payData) return;
  const det = document.getElementById('pmDetalle');
  const base = document.getElementById('baseCurrency')?.value || 'EUR';
  const importe = totalPago(_payData).toFixed(2);
  const g = groups[currentGroupIdx];
  const concepto = `VakaPay · ${g ? g.name : 'deuda'}`;
  const to = _payData.to;
  const fila = (etiqueta, valor, copiar) => `
    <div class="u-d-flex u-ai-center u-jc-space-between u-gap-8 u-p-6-0 u-bb-1-solid-tint-1">
      <div class="u-minw-0"><div class="u-c-muted u-fs-xs u-tt-uppercase u-ls-_5">${etiqueta}</div>
      <div class="u-fw-800 u-c-text u-wb-break-all">${valor}</div></div>
      <button type="button" class="btn btn-outline btn-sm u-shrink-0 u-fs-xs u-p-4-10" onclick="copiarTexto(${JSON.stringify(copiar).replace(/"/g, '&quot;')})">Copiar</button>
    </div>`;
  let html = '';
  if (_cobro === 'cargando') {
    html = '<div aria-label="Cargando datos de cobro"><div class="sk u-h-10 u-w-30p u-mb-8"></div><div class="sk u-h-16 u-w-65p"></div></div>';
  } else if (method === 'bizum') {
    // 1º el teléfono que esa persona puso en su perfil para cobrar;
    // 2º si no lo puso, el teléfono que tú tienes guardado de ella en Amigos
    const amigo = (friends || []).find(f => _normNombre(f.name) === _normNombre(to) && _normTel(f.phone));
    const telBizum = (_cobro && _cobro.bizum) || (amigo && amigo.phone) || '';
    const desdeAmigos = !(_cobro && _cobro.bizum) && !!telBizum;
    html = telBizum
      ? `<div class="u-mb-6">Envía un Bizum a <strong>${to}</strong> desde la app de tu banco:</div>
         ${fila(desdeAmigos ? 'Teléfono (de tus amigos)' : 'Teléfono', telBizum, telBizum.replace(/\s+/g, ''))}${fila('Importe', formatAmountBase(Number(importe), base), importe.replace('.', ','))}${fila('Concepto', concepto, concepto)}
         ${desdeAmigos ? `<div class="u-mt-8 u-c-gold-text u-fs-sm">${to} no ha configurado Bizum en su perfil; es el número que tienes guardado en Amigos. Comprueba que sea el que usa para Bizum.</div>` : ''}`
      : `<strong>${to}</strong> aún no ha añadido su teléfono para Bizum, y tampoco lo tienes en Amigos. Puedes añadirlo en Amigos o elegir otro método.`;
  } else if (method === 'transferencia') {
    html = (_cobro && _cobro.iban)
      ? `<div class="u-mb-6">Haz una transferencia a <strong>${to}</strong> desde la app de tu banco:</div>
         ${fila('Titular', _cobro.titular || to, _cobro.titular || to)}${fila('IBAN', formatearIban(_cobro.iban), _cobro.iban)}${fila('Importe', formatAmountBase(Number(importe), base), importe.replace('.', ','))}${fila('Concepto', concepto, concepto)}`
      : `<strong>${to}</strong> aún no ha añadido su IBAN. Puedes pedírselo o elegir otro método.`;
  } else if (method === 'efectivo') {
    html = `Entrega <strong>${formatAmountBase(Number(importe), base)}</strong> en efectivo a <strong>${to}</strong> y después pulsa <strong>«Marcar saldado»</strong>.`;
  }
  if (method === 'transferencia' && _cobro && !_cobro.tiene_cuenta) {
    html = `<strong>${to}</strong> no tiene cuenta en VakaPay, así que no tiene datos de cobro guardados. Acordad el pago entre vosotros y pulsa «Marcar saldado».`;
  }
  det.innerHTML = html + (method !== 'efectivo' ? '<div class="u-mt-8 u-c-muted u-fs-sm">Cuando hayas pagado, adjunta la captura y pulsa «Marcar saldado».</div>' : '');
  det.style.display = 'block';
}

// Copiar al portapapeles (con alternativa para WebViews antiguos)
async function copiarTexto(texto) {
  try { await navigator.clipboard.writeText(texto); }
  catch (_) {
    const ta = document.createElement('textarea');
    ta.value = texto; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (__) {}
    ta.remove();
  }
  toast('Copiado', 's');
}

function formatearIban(iban) {
  return String(iban || '').replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
}
function ibanValido(iban) {
  const s = String(iban || '').replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  const num = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55));
  let resto = 0;
  for (const d of num) resto = (resto * 10 + Number(d)) % 97;
  return resto === 1;
}

// Qué participante del grupo soy yo (por mi cuenta; si no se sabe, por mi nombre)
function miNombreEnGrupo(g) {
  if (!g) return null;
  const porId = g.memberIds && Object.entries(g.memberIds).find(([, uid]) => Number(uid) === Number(profile.id));
  if (porId) return porId[0];
  const nombre = (profile.nombre || '').trim();
  return nombre && Object.keys(g.members || {}).includes(nombre) ? nombre : null;
}

// ═══ PAGOS ENTRE PARTICIPANTES ════════════════════════════════════════
// Saldar una deuda se guarda en el servidor como un "pago": quien debía paga a quien
// le debían. Ajusta los saldos de todos y queda en la Actividad del grupo, pero no
// cuenta como gasto en totales ni estadísticas. Se puede anular borrándolo.
let _registrandoPago = false;   // evita enviar el mismo pago dos veces (doble pulsación)
// extras: deudas de otras personas con el mismo acreedor que paga «from» («Pagar también por…»)
async function registrarPago({ from, to, amount }, archivoComprobante, extras = []) {
  const g = groups[currentGroupIdx];
  if (!g || _registrandoPago) return;
  _registrandoPago = true;
  try {
    if (!extras.length) { await _registrarPago(g, { from, to, amount }, archivoComprobante); return; }
    let ticket = null;
    if (archivoComprobante) { try { ticket = 'data:image/jpeg;base64,' + await fileToBase64(archivoComprobante); } catch (_) {} }
    const pagos = [{ from, to, amount }, ...extras.map(x => ({ from: x.from, to: x.to, amount: x.amount, pagadoPor: from }))];
    const hechos = [], rechazados = [];
    for (const p of pagos) {
      const r = await enviarPago(g, p, ticket);
      if (r.ok) hechos.push(p);
      else if (r.rechazado) rechazados.push(`${p.from}: ${r.error}`);
      else { rechazados.push(`${p.from}: ${r.error}`); break; }
    }
    await recargarGrupoDelServidor(g);
    if (typeof refrescarActividad === 'function') refrescarActividad();
    if (rechazados.length) {
      mostrarModalInfo(hechos.length ? 'Algunos pagos no se registraron' : 'Pago no registrado',
        (hechos.length ? `Registrados: ${hechos.map(p => p.from).join(', ')}.\n\n` : '') + rechazados.join('\n'));
    } else {
      toast(`${from} saldó ${formatAmountBase(pagos.reduce((s, p) => s + Number(p.amount), 0), getBase())} a ${to} (${pagos.map(p => p.from).join(', ')})`, 's');
    }
  } finally { _registrandoPago = false; }
}
// Envía un pago al servidor. Devuelve { ok } o { ok:false, rechazado, error }
async function enviarPago(g, { from, to, amount, pagadoPor }, ticket) {
  const hoy = new Date();
  const fecha = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
  const importe = +Number(amount).toFixed(2);
  try {
    const res = await fetch(`${API_BASE}/api/v1/groups/${g.id}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${vakaData.getToken()}` },
      body: JSON.stringify({
        description: pagadoPor ? `Pago de ${from} a ${to} (pagó ${pagadoPor})` : `Pago de ${from} a ${to}`,
        amount: importe, amount_base: importe, currency: getBase(),
        category: 'other', payer_name: from, expense_date: fecha,
        involved: [to], es_pago: true, ticket, pagado_por: pagadoPor || null
      })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true };
    return { ok: false, rechazado: res.status === 409 && !!data.pago_rechazado, error: data.error || 'No se pudo registrar el pago' };
  } catch (_) {
    return { ok: false, rechazado: false, error: 'Sin conexión. Revisa tu conexión e inténtalo de nuevo.' };
  }
}
async function _registrarPago(g, { from, to, amount }, archivoComprobante) {
  const hoy = new Date();
  const fecha = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
  let ticket = null;
  if (archivoComprobante) {
    try { ticket = 'data:image/jpeg;base64,' + await fileToBase64(archivoComprobante); } catch (_) {}
  }
  const importe = +Number(amount).toFixed(2);
  try {
    const res = await fetch(`${API_BASE}/api/v1/groups/${g.id}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${vakaData.getToken()}` },
      body: JSON.stringify({
        description: `Pago de ${from} a ${to}`,
        amount: importe, amount_base: importe, currency: getBase(),
        category: 'other', payer_name: from, expense_date: fecha,
        involved: [to], es_pago: true, ticket
      })
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 409 && data.pago_rechazado) {
      // La deuda ya no es la que se veía (p. ej. otro móvil ya registró este pago):
      // se recargan los saldos y la lista de deudas, y se explica por qué
      await recargarGrupoDelServidor(g);
      mostrarModalInfo('Pago no registrado', data.error);
      return;
    }
    if (!res.ok) throw new Error(data.error || 'No se pudo registrar el pago');
  } catch (err) {
    toast(textoError(err, 'No se pudo registrar el pago.'), 'e');
    return;
  }
  await recargarGrupoDelServidor(g);
  if (typeof refrescarActividad === 'function') refrescarActividad();
  toast(`Pago de ${from} a ${to} registrado`, 's');
}

// Recarga el grupo desde el servidor (saldos oficiales) y recalcula las deudas
async function recargarGrupoDelServidor(g, { aviso = false } = {}) {
  let ok = false;
  try {
    const resFresh = await fetch(`${API_BASE}/api/v1/groups/${g.id}`, {
      headers: { 'Authorization': `Bearer ${vakaData.getToken()}` }
    });
    if (resFresh.ok) {
      const fresh = await resFresh.json();
      groups[currentGroupIdx] = {
        ...groups[currentGroupIdx], ...fresh,
        members: normalizeMembersField(fresh.members, groups[currentGroupIdx].members),
        expenses: normalizeExpensesField(fresh.expenses)
      };
      ok = true;
    }
  } catch (_) {}
  renderAll(); calcularDeudas(aviso);
  return ok;
}

function confirmPayment(settle){
  if(!_payData)return;
  if(settle){
    const archivo = document.getElementById('pmProofFile')?.files?.[0] || null;
    registrarPago({ ..._payData }, archivo, _payData.extras);
  } else {
    toast('Pago registrado, pendiente de confirmación','i');
  }
  closePayModal();
}

// ─── VENTANA COMPROBANTE ─────────────────────────────────────────────────
let _proofData = null;
function openProofModal(idx,from,to,amount){
  _proofData={idx,from,to,amount};
  document.getElementById('proofTitle').textContent=`Confirmar cobro: ${from} → ${to}`;
  // Cualquier participante puede registrar el pago de otro (p. ej. alguien sin cuenta que pagó en efectivo).
  // Queda en la Actividad del grupo quién lo registró, y se puede anular.
  // Solo lo abre el acreedor: confirma que le han pagado (efectivo, alguien sin cuenta...)
  _proofData.extras = [];
  document.getElementById('proofTambien').style.display = 'none';
  document.getElementById('proofSubtitulo').textContent =
    `Confirma que ${from} te ha pagado ${formatAmountBase(amount, getBase())}. Puedes adjuntar una foto del pago (opcional).`;
  document.getElementById('proofThumbView').style.display='none';
  document.getElementById('proofFileInput').value='';
  document.getElementById('proofModal').style.display = '';
  document.getElementById('proofModal').classList.add('open');
  document.body.style.overflow='hidden';
}
function closeProofModal(){
  document.getElementById('proofModal').classList.remove('open');
  document.body.style.overflow='';
  _proofData=null;
}

function handleProofUpload(ev){
  const file=ev.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload = e => {
    const img = document.getElementById('pmProofThumb');
    if(img){
      img.src = e.target.result;
      img.style.display = 'block';
    }
  };
  reader.readAsDataURL(file);
}
function sendProof(settle){
  if(!_proofData)return;
  if(settle){
    const archivo = document.getElementById('proofFileInput')?.files?.[0] || null;
    registrarPago({ ..._proofData }, archivo, _proofData.extras); // el comprobante queda adjunto a cada pago
  } else {toast('Comprobante enviado al acreedor','s');}
  closeProofModal();
}
/* ============================================================
   SECCIÓN: GESTIÓN DE SESIÓN Y LOGOUT
   ============================================================ */

/**
 * 1. Prepara y muestra el modal de confirmación.
 * Prioriza el nombre escrito en el perfil antes que el del almacenamiento local.
 */
function handleLogout() {
    const modal = document.getElementById('modalLogout');
    const msg = document.getElementById('logoutMessage');
    
    // Intentamos capturar el nombre directamente del input de la pantalla de cuenta
    const nombreEnPantalla = document.getElementById('profNombre')?.value.trim();
    
    let nombreFinal;

    if (nombreEnPantalla && nombreEnPantalla !== "") {
        // Si hay un nombre escrito en el input del perfil, usamos ese
        nombreFinal = nombreEnPantalla;
    } else {
        // Si el input está vacío, recuperamos los datos del almacenamiento local
        const userData = JSON.parse(localStorage.getItem('vaka_user') || '{}');
        nombreFinal = userData.name || 'Usuario';
    }

    // Personalizamos el mensaje con el nombre detectado
    msg.innerText = `${nombreFinal}, ¿estás seguro de que quieres cerrar tu sesión ahora?`;
    
    modal.style.display = 'flex';
}

/**
 * 2. Cierra el modal de confirmación.
 * Se activa cuando el usuario decide NO cerrar sesión (botón Volver).
 */
function closeLogoutModal() {
    document.getElementById('modalLogout').style.display = 'none';
}

function confirmLogout() {
  localStorage.setItem('intentional_logout', 'true');
  vakaData.setToken(null);
  { // Se conservan el tema y cuántos grupos tenía cada cuenta (para las tarjetas grises de carga)
    const guardar = Object.keys(localStorage).filter(k => k === 'vp_tema' || k.startsWith('vp_n_grupos_')).map(k => [k, localStorage.getItem(k)]);
    localStorage.clear(); guardar.forEach(([k, v]) => localStorage.setItem(k, v)); }
  sessionStorage.clear();
  
  // Obtiene la ruta base actual y reemplaza el archivo actual por login.html
  const rutaBase = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
  location.replace(rutaBase + 'login.html');
}

function handleProofModalFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const thumb = document.getElementById('proofThumbView');
    if (thumb) {
      thumb.src = e.target.result;
      thumb.style.display = 'block';
    }
  };
  reader.readAsDataURL(file);
}
