// public/js/compartir.js — Compartir: enlaces de invitación, resumen y PDF
// (antes dentro de index.html; el orden de carga está en index.html)

// ═══ LINK GENERATION ════════════════════════════════════════════════

// ═══ LOAD FROM URL PARAM ════════════════════════════════════════════
function loadFromHash(){
  const params=new URLSearchParams(window.location.search);
  const encoded=params.get('vp');
  if(!encoded)return;
  try{
    const payload=JSON.parse(decodeURIComponent(escape(atob(encoded))));
    // Check if group already exists (same name+start)
    const exists=groups.findIndex(g=>g.name===payload.n&&g.start===payload.s);
    let idx;
    if(exists>=0){idx=exists;}
    else{
      const g={id:Date.now(),name:payload.n,type:payload.t||'viaje',start:payload.s,end:payload.e,members:payload.m||{},expenses:payload.ex||[],createdAt:new Date().toISOString(),fromLink:true};
      groups.unshift(g);save();renderGroupsList();updateStats();
      idx=0;
    }
    // Clean URL
    window.history.replaceState({},'',window.location.pathname);
    setTimeout(()=>{openGroup(idx);toast('¡Grupo cargado desde el link!','s');},400);
  }catch(err){toast('Link inválido','e');}
}

// ═══ SHARE ══════════════════════════════════════════════════════════
// ═══ INVITAR CON ENLACE (Participantes) ══════════════════════════════
let _enlaceInvitacion = null;
function textoInvitacion(g, enlace) {
  const quien = (profile.nombre || '').trim() || 'Alguien';
  return `¡Hola! ${quien} te invita al grupo «${g.name}» en VakaPay. Únete aquí: ${enlace}`;
}
async function abrirInvitar() {
  const g = groups[currentGroupIdx];
  if (!g || !g.id) { toast('Abre un grupo primero', 'e'); return; }
  document.getElementById('invitarTitulo').textContent = `Invitar a «${g.name}»`;
  const caja = document.getElementById('invitarEnlace');
  caja.textContent = _enlaceInvitacion || 'Generando enlace…';
  document.getElementById('modal-invitar').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  const esCreador = !!(profile.id && g.owner_id && profile.id === g.owner_id);
  document.getElementById('invitarRenovar').style.display = esCreador ? 'block' : 'none';
  cancelarRenovarInvitacion();
  if (_enlaceInvitacion) return;
  try {
    const res = await fetch(`${API_BASE}/api/v1/groups/${g.id}/share-link`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${vakaData.getToken()}` }
    });
    const data = await res.json();
    if (!data.token) throw new Error();
    _enlaceInvitacion = `${API_BASE}/login.html?invite=${data.token}`;
    caja.textContent = _enlaceInvitacion;
  } catch (_) {
    caja.textContent = 'No se pudo generar el enlace. Revisa tu conexión.';
  }
}
// Cambiar el enlace de invitación (solo quien creó el grupo)
function pedirRenovarInvitacion() {
  document.getElementById('invitarRenovarBtn').style.display = 'none';
  document.getElementById('invitarRenovarConfirma').style.display = 'block';
}
function cancelarRenovarInvitacion() {
  document.getElementById('invitarRenovarBtn').style.display = 'flex';
  document.getElementById('invitarRenovarConfirma').style.display = 'none';
}
async function renovarInvitacion() {
  const g = groups[currentGroupIdx];
  const caja = document.getElementById('invitarEnlace');
  try {
    const res = await fetch(`${API_BASE}/api/v1/groups/${g.id}/share-link/renovar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${vakaData.getToken()}` }
    });
    const data = await res.json();
    if (!res.ok || !data.token) throw new Error(data.error || '');
    _enlaceInvitacion = `${API_BASE}/login.html?invite=${data.token}`;
    caja.textContent = _enlaceInvitacion;
    cancelarRenovarInvitacion();
    toast('Enlace cambiado. El anterior ya no funciona.', 's');
  } catch (e) {
    toast(textoError(e, 'No se pudo cambiar el enlace.'), 'e');
  }
}
function cerrarInvitar() {
  document.getElementById('modal-invitar').style.display = 'none';
  document.body.style.overflow = '';
}
function _invitacionLista() {
  if (!_enlaceInvitacion) { toast('El enlace aún se está generando', 'i'); return null; }
  return textoInvitacion(groups[currentGroupIdx], _enlaceInvitacion);
}
async function compartirInvitacion() {
  const t = _invitacionLista(); if (!t) return;
  await compartirTexto(t, 'Invitar al grupo');
}
function whatsappInvitacion() { const t = _invitacionLista(); if (t) abrirWhatsApp(t); }
function copiarInvitacion() { if (_enlaceInvitacion) copiarTexto(_enlaceInvitacion); else toast('El enlace aún se está generando', 'i'); }

// ═══ COMPARTIR (menú de compartir del móvil, WhatsApp o copiar) ══════
async function compartirTexto(texto, titulo) {
  const nativo = window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform() && Capacitor.Plugins && Capacitor.Plugins.Share;
  try {
    if (nativo) { await Capacitor.Plugins.Share.share({ title: titulo, text: texto, dialogTitle: titulo }); return; }
    if (navigator.share) { await navigator.share({ title: titulo, text: texto }); return; }
  } catch (err) {
    if (/cancel|abort/i.test(err?.message || err?.name || '')) return;   // cerró el menú
  }
  copiarTexto(texto);   // sin menú de compartir (ordenador): se copia
}
function abrirWhatsApp(texto) {
  window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
}

// ═══ COMPARTIR RESUMEN (sección 7) ═══════════════════════════════════
// Deudas pendientes con el mismo cálculo que «Cuentas finales»
function deudasPendientes(g) {
  updateBalances();
  const d = Object.entries(g.members).filter(([, v]) => v < -0.05).map(([k, v]) => [k, v]);
  const c = Object.entries(g.members).filter(([, v]) => v > 0.05).map(([k, v]) => [k, v]);
  const txs = [];
  while (d.length && c.length) {
    d.sort((a, b) => a[1] - b[1]); c.sort((a, b) => b[1] - a[1]);
    const amt = Math.min(Math.abs(d[0][1]), c[0][1]);
    txs.push({ from: d[0][0], to: c[0][0], amount: amt });
    d[0][1] = +(d[0][1] + amt).toFixed(2); c[0][1] = +(c[0][1] - amt).toFixed(2);
    if (Math.abs(d[0][1]) <= 0.05) d.shift(); if (Math.abs(c[0][1]) <= 0.05) c.shift();
  }
  return txs;
}
function textoResumen() {
  if (currentGroupIdx === null) return '';
  const g = groups[currentGroupIdx];
  const pp = resumenPorPersona(g);
  const sym = SYMBOLS[g.currency || 'EUR'] || '€';
  const imp = (n, cur) => `${SYMBOLS[cur] || sym}${(Number(n) || 0).toFixed(2)}`;
  const gastos = g.expenses.filter(e => !e.es_pago);
  let t = `💳 *VakaPay – ${g.name}* ${TYPE_ICONS[g.type] || ''}\n📅 ${fmtDate(g.start)} → ${fmtDate(g.end)}\n\n`;
  t += `💰 Total: ${imp(pp.total)}  |  Por persona: ${imp(pp.porPersona)}`;
  t += pp.participantes && pp.participantes !== pp.miembros ? ` (entre ${pp.participantes} participantes)\n` : `\n`;
  if (gastos.length) { t += `\n📋 Gastos:\n`; gastos.forEach(e => { t += `  • ${e.desc}: ${imp(e.amount, e.currency)} (pagó ${e.payer})\n`; }); }
  const deudas = deudasPendientes(g);
  t += deudas.length
    ? `\n💸 Pendiente de pagar:\n` + deudas.map(d => `  • ${d.from} → ${d.to}: ${imp(d.amount)}`).join('\n') + '\n'
    : `\n✅ Todas las cuentas están saldadas\n`;
  return t + '\n_Generado con VakaPay_';
}
async function compartirResumen() {
  const g = groups[currentGroupIdx];
  if (g) await recargarGrupoDelServidor(g);   // con los últimos pagos
  await compartirTexto(textoResumen(), 'Resumen del grupo');
}

function exportarPDF(){
  const g = groups[currentGroupIdx];
  if(!g){ toast('Abre un grupo primero','e'); return; }
  const jsPDFLib = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
  if(!jsPDFLib){ toast('No se pudo preparar el PDF. Inténtalo de nuevo.','e'); return; }
  const doc = new jsPDFLib({orientation:'portrait',unit:'mm',format:'a4'});
  const W = 210, pad = 16, lh = 7;
  let y = 20;
  const catNames={food:'Comida',transport:'Transporte',hotel:'Alojamiento',activity:'Actividad',other:'Otro'};
  const sc = (r,g2,b) => doc.setTextColor(r,g2,b);
  const sf = (r,g2,b) => doc.setFillColor(r,g2,b);
  const sd = (r,g2,b) => doc.setDrawColor(r,g2,b);

  // — CABECERA —
  sf(30,30,30); doc.rect(0,0,W,30,'F');
  doc.setFont('helvetica','bold');
  doc.setFontSize(20); sc(245,200,0);
  doc.text('VAKAPAY',pad,14);
  doc.setFontSize(10); sc(242,242,242);
  doc.text('Extracto del grupo',pad,21);
  doc.setFontSize(8); sc(150,150,150);
  doc.text(new Date().toLocaleDateString('es-ES',{day:'2-digit',month:'long',year:'numeric'}),W-pad,21,{align:'right'});
  y = 38;

  // — NOMBRE DEL GRUPO —
  doc.setFont('helvetica','bold');
  doc.setFontSize(16); sc(0,0,0);
  doc.text(g.name.toUpperCase(), pad, y);
  y += 5;
  sd(180,180,180); doc.setLineWidth(0.5);
  doc.line(pad, y, W-pad, y);
  y += 8;

  // — PARTICIPANTES —
  doc.setFont('helvetica','bold');
  doc.setFontSize(9); sc(0,0,0);
  doc.text('PARTICIPANTES', pad, y);
  y += 5;
  const mbs = Object.keys(g.members);
  const resPP = resumenPorPersona(g);
  const totalGastos = resPP.total;
  const porPersona = resPP.porPersona;
  mbs.forEach(m => {
    const bal = g.members[m];
    doc.setFont('helvetica','normal');
    doc.setFontSize(8); sc(0,0,0);
    doc.text(`• ${m}`, pad+3, y);
    const balStr = bal>=0 ? `+${bal.toFixed(2)}` : bal.toFixed(2);
    if(bal>=0) sc(0,130,60); else sc(180,0,0);
    doc.text(balStr, W-pad, y, {align:'right'});
    y += lh;
  });
  y += 3;

  // — RESUMEN —
  sd(180,180,180); doc.setLineWidth(0.3);
  doc.line(pad, y, W-pad, y);
  y += 6;
  doc.setFont('helvetica','bold');
  doc.setFontSize(9); sc(0,0,0);
  doc.text('RESUMEN', pad, y);
  y += 5;
  doc.setFont('helvetica','normal');
  doc.setFontSize(8); sc(0,0,0);
  doc.text(`Total gastado: ${g.currency||'EUR'} ${totalGastos.toFixed(2)}`, pad+3, y); y+=lh;
  doc.text(resPP.participantes && resPP.participantes !== mbs.length
    ? `Participantes: ${mbs.length} (${resPP.participantes} en los gastos)`
    : `Participantes: ${mbs.length}`, pad+3, y); y+=lh;
  doc.text(`Por persona: ${g.currency||'EUR'} ${porPersona.toFixed(2)}`, pad+3, y); y+=lh;
  doc.text(`Gastos registrados: ${g.expenses.filter(e=>!e.es_pago).length}`, pad+3, y); y+=lh;
  const gastosPdf = g.expenses.filter(e => !e.es_pago);
  if (gastosPdf.length) {
    const mayor = gastosPdf.reduce((m, e) => (Number(e.baseAmt) || 0) > (Number(m.baseAmt) || 0) ? e : m, gastosPdf[0]);
    doc.text(`Gasto medio: ${g.currency||'EUR'} ${(totalGastos / gastosPdf.length).toFixed(2)}`, pad+3, y); y+=lh;
    doc.text(`Gasto mayor: ${g.currency||'EUR'} ${(Number(mayor.baseAmt)||0).toFixed(2)} (${mayor.desc || 'Sin descripcion'})`, pad+3, y); y+=lh;
  }
  y += 3;

  // — ESTADÍSTICAS (igual que en la pestaña Estadísticas) —
  // Cada fila: color, etiqueta, barra proporcional, importe y porcentaje del total
  const hexRgb = h => { const n = parseInt(String(h || '#F5C800').slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const filaBarra = (etiqueta, importe, color) => {
    if (y > 270) { doc.addPage(); y = 20; }
    const pct = totalGastos > 0 ? importe / totalGastos : 0;
    const [r, g2, b] = hexRgb(color);
    sf(r, g2, b); doc.rect(pad + 3, y - 3, 3, 3, 'F');                 // marca de color
    doc.setFont('helvetica','normal'); doc.setFontSize(8); sc(0,0,0);
    doc.text(etiqueta, pad + 9, y);
    const barX = pad + 55, barW = 70;
    sf(235,235,235); doc.rect(barX, y - 3, barW, 3.2, 'F');            // fondo de la barra
    sf(r, g2, b); doc.rect(barX, y - 3, Math.max(0.5, barW * pct), 3.2, 'F');
    doc.text(`${g.currency||'EUR'} ${importe.toFixed(2)}`, W - pad - 18, y, {align:'right'});
    doc.setFont('helvetica','bold');
    doc.text(`${(pct * 100).toFixed(1)}%`, W - pad, y, {align:'right'});
    y += lh;
  };
  const seccion = titulo => {
    if (y > 255) { doc.addPage(); y = 20; }
    sd(180,180,180); doc.setLineWidth(0.3); doc.line(pad, y, W-pad, y);
    y += 6;
    doc.setFont('helvetica','bold'); doc.setFontSize(9); sc(0,0,0);
    doc.text(titulo, pad, y);
    y += 6;
  };
  if (gastosPdf.length) {
    seccion('GASTOS POR CATEGORÍA');
    const porCat = {};
    gastosPdf.forEach(e => { porCat[e.cat || 'other'] = (porCat[e.cat || 'other'] || 0) + (Number(e.baseAmt) || 0); });
    Object.entries(porCat).sort((a, b) => b[1] - a[1])
      .forEach(([cat, imp]) => filaBarra(catNames[cat] || cat, imp, CAT_COLORS[cat]));
    y += 3;

    seccion('PAGADO POR CADA PARTICIPANTE');
    const porPagador = {};
    gastosPdf.forEach(e => { const p = e.payer || '-'; porPagador[p] = (porPagador[p] || 0) + (Number(e.baseAmt) || 0); });
    Object.entries(porPagador).sort((a, b) => b[1] - a[1])
      .forEach(([nombre, imp]) => filaBarra(nombre, imp, '#F5C800'));
    y += 3;
  }

  // — GASTOS —
  sd(180,180,180); doc.line(pad, y, W-pad, y);
  y += 6;
  doc.setFont('helvetica','bold');
  doc.setFontSize(9); sc(0,0,0);
  doc.text('LISTA DE GASTOS', pad, y);
  y += 5;
  gastosPdf.forEach((e,i) => {
    if(y > 265){ doc.addPage(); y=20; }
    doc.setFont('helvetica','bold');
    doc.setFontSize(8); sc(20,60,160);
    doc.text(`${i+1}. ${e.desc||'Sin descripcion'}`, pad+3, y);
    sc(0,0,0);
    doc.text(`${g.currency||'EUR'} ${(Number(e.baseAmt)||0).toFixed(2)}`, W-pad, y, {align:'right'});
    y += 5;
    doc.setFont('helvetica','normal');
    doc.setFontSize(7); sc(80,80,80);
    const cat = catNames[e.cat]||e.cat||'';
    const fecha = e.date ? new Date(e.date).toLocaleDateString('es-ES') : '';
    doc.text(`Pagó: ${e.payer||'-'}  |  ${cat}  |  ${fecha}`, pad+6, y);
    y += lh;
  });
  y += 3;

  // — PAGOS ENTRE PARTICIPANTES (deudas ya saldadas) —
  const pagosPdf = g.expenses.filter(e => e.es_pago);
  if (pagosPdf.length) {
    seccion('PAGOS ENTRE PARTICIPANTES');
    pagosPdf.forEach(e => {
      if (y > 265) { doc.addPage(); y = 20; }
      const destino = (e.involved && e.involved[0]) || (e.splits && e.splits[0] && e.splits[0].member_name) || '-';
      const fecha = e.date ? new Date(e.date).toLocaleDateString('es-ES') : '';
      doc.setFont('helvetica','normal'); doc.setFontSize(8); sc(0,0,0);
      doc.text(`• ${e.payer || '-'}  pagó a  ${destino}   ${fecha}`, pad+3, y);
      sc(0,130,60);
      doc.text(`${g.currency||'EUR'} ${(Number(e.baseAmt)||0).toFixed(2)}`, W-pad, y, {align:'right'});
      y += lh;
    });
    y += 3;
  }

  // — DEUDAS —
  if(y > 250){ doc.addPage(); y=20; }
  sd(180,180,180); doc.line(pad, y, W-pad, y);
  y += 6;
  doc.setFont('helvetica','bold');
  doc.setFontSize(9); sc(0,0,0);
  doc.text('QUIEN PAGA A QUIEN', pad, y);
  y += 5;
  const d = Object.entries(g.members).filter(([,v])=>v<-0.05).map(([k,v])=>[k,+(v)]);
  const c = Object.entries(g.members).filter(([,v])=>v>0.05).map(([k,v])=>[k,+(v)]);
  const txsPDF = [];
  while(d.length&&c.length){
    d.sort((a,b)=>a[1]-b[1]); c.sort((a,b)=>b[1]-a[1]);
    const amt = Math.min(Math.abs(d[0][1]), c[0][1]);
    txsPDF.push({from:d[0][0], to:c[0][0], amount:amt});
    d[0][1] = +(d[0][1]+amt).toFixed(2); c[0][1] = +(c[0][1]-amt).toFixed(2);
    if(Math.abs(d[0][1])<=0.05) d.shift(); if(Math.abs(c[0][1])<=0.05) c.shift();
  }
  if(!txsPDF.length){
    doc.setFont('helvetica','normal');
    doc.setFontSize(8); sc(80,80,80);
    doc.text('Sin deudas pendientes', pad+3, y);
    y += lh;
  } else {
    txsPDF.forEach(t => {
      if(y > 265){ doc.addPage(); y=20; }
      doc.setFont('helvetica','normal');
      doc.setFontSize(8); sc(0,0,0);
      doc.text(`• ${t.from}  paga a  ${t.to}`, pad+3, y);
      sc(20,60,160);
      doc.text(`${g.currency||'EUR'} ${t.amount.toFixed(2)}`, W-pad, y, {align:'right'});
      y += lh;
    });
  }

  // — PIE —
  const pieY = Math.max(y + 10, 285);
  if(pieY > 285) { doc.addPage(); }
  const piePos = pieY > 285 ? 285 : pieY;
  sf(245,200,0); doc.rect(0,piePos,W,12,'F');
  doc.setFont('helvetica','bold');
  doc.setFontSize(7); sc(0,0,0);
  doc.text('Generado por VakaPay · Divide gastos, no amistades', W/2, piePos+7, {align:'center'});

  const fileName = `VakaPay_${g.name.replace(/\s+/g,'_')}.pdf`;
  savePdfCrossPlatform(doc, fileName);
}

// En el navegador (web), doc.save() simula un click en un <a download> con un
// blob URL y funciona bien. Pero dentro del WebView de una APK generada con
// Capacitor, ese <a download> NO dispara ningun guardado real: el click se
// ejecuta pero no hay gestor de descargas que lo intercepte, así que el PDF
// "se genera" (no salta ningún error) pero nunca llega al dispositivo.
// Esta función detecta si estamos en una app nativa de Capacitor y, en ese
// caso, usa Filesystem + Share (si los plugins están instalados) o
// navigator.share como alternativa; si no hay ninguna disponible, cae de
// vuelta al doc.save() clásico (comportamiento web sin cambios).
async function savePdfCrossPlatform(doc, fileName) {
  const isNative = !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());

  if (isNative && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem && window.Capacitor.Plugins.Share) {
    try {
      const base64 = doc.output('datauristring').split(',')[1];
      const { Filesystem, Share } = window.Capacitor.Plugins;

      // 1. Guardamos el archivo en la caché de la aplicación
      await Filesystem.writeFile({
        path: fileName,
        data: base64,
        directory: 'CACHE',
        recursive: true
      });

      // 2. Solicitamos la URI nativa correcta que Android e iOS pueden procesar
      const uriResult = await Filesystem.getUri({
        directory: 'CACHE',
        path: fileName
      });

      // 3. Compartimos utilizando la URI traducida
      await Share.share({
        title: fileName,
        url: uriResult.uri,
        dialogTitle: 'Abrir o guardar extracto VakaPay',
      });

      toast('PDF preparado para compartir/guardar', 's');
      return;
    } catch (err) {
      console.warn('Error al procesar el PDF de forma nativa:', err);
    }
  }

  try {
    doc.save(fileName);
    toast('PDF generado con éxito', 's');
  } catch (e) {
    doc.output('dataurlnewwindow');
    toast('PDF generado con éxito', 's');
  }
}
