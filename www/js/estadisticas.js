// public/js/estadisticas.js — Pantalla Estadísticas: dona, barras y desglose
// (antes dentro de index.html; el orden de carga está en index.html)

// ═══ STATISTICS ═══════════════════════════════════════════════════════
const CAT_COLORS = { food:'#FFA032', transport:'#64B4FF', hotel:'#B464FF', activity:'#50DC96', other:'#F5C800' };

function renderStats() {
  const pane = document.getElementById('page-stats');
  const mainContent = pane.querySelector('main');
  const base = getBase();
  const sym = SYMBOLS[base] || '€';
  const g = groups[currentGroupIdx];

  // 1. GESTIÓN DEL MENSAJE (SIN BORRAR EL <MAIN>)
  let warning = document.getElementById('stats-warning');

  if (!g || currentGroupIdx === -1 || currentGroupIdx === null) {
    if (mainContent) mainContent.style.display = 'none';

    let warning = document.getElementById('stats-warning');
    if (!warning) { warning = document.createElement('div'); pane.appendChild(warning); }
    {
      warning.id = 'stats-warning';
      warning.style = 'text-align:center; padding:60px 20px; color:var(--muted);';
      warning.innerHTML = `
        <div style="margin-bottom:14px;color:var(--gold-text);">
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="20" x2="18" y2="10"></line>
            <line x1="12" y1="20" x2="12" y2="4"></line>
            <line x1="6" y1="20" x2="6" y2="14"></line>
          </svg>
        </div>
        <h2 style="color:var(--gold-text); margin-bottom:10px;">Aquí no hay nada... aún</h2>
        <p style="color:var(--text);">${groups.length
          ? 'Abre uno de tus grupos y vuelve aquí para ver en qué se va el dinero.'
          : 'Cuando crees un grupo y apuntes gastos, aquí verás en qué se va el dinero.'}</p>
      `;
    }
    warning.style.display = 'block';
    return;
  }

  const warning2 = document.getElementById('stats-warning');
  if (warning2) warning2.style.display = 'none';

  // 2. SI HAY GRUPO: Mostramos el contenido y quitamos el aviso
  if (mainContent) mainContent.style.display = 'block';
  if (warning) warning.remove();

  // 3. FILTRADO DE GASTOS
  let allExp = [];
  if (g.expenses) {
    g.expenses.forEach((e, idx) => {
      if (e.es_pago) return;                              // los pagos no son gastos
      const baseAmt = convertToBase(e.amount, e.currency || base);
      allExp.push({...e, baseAmt, idx});
    });
  }

  const total = allExp.reduce((s, e) => s + (Number(e.baseAmt) || 0), 0);
  const count = allExp.length;
  const avg = count ? total / count : 0;
  const maxE = allExp.reduce((m, e) => (Number(e.baseAmt) || 0) > m ? (Number(e.baseAmt) || 0) : m, 0);

  // 4. ACTUALIZACIÓN DE TEXTOS Y KPIs
  // Usamos comprobaciones para no romper el código si el usuario cambia de página rápido
  const sub = document.getElementById('statsSubtitle');
  if (sub) sub.textContent = count + ' gastos en este grupo'
  
  if (document.getElementById('skpi1')) {
    document.getElementById('skpi1').textContent = sym + total.toFixed(2);
    document.getElementById('skpi2').textContent = count;
    document.getElementById('skpi3').textContent = sym + avg.toFixed(2);
    document.getElementById('skpi4').textContent = sym + maxE.toFixed(2);
  }

  // 5. LLAMADA A TUS FUNCIONES DE DIBUJO
  // Lo elegido se mantiene al volver de un gasto, pero no al cambiar de grupo
  if (_statSel.grupo !== g.id) _statSel = { grupo: g.id, cat: null, payer: null };
  _statGastos = allExp;
  const catMap = {};
  allExp.forEach(e => { catMap[e.cat] = (catMap[e.cat] || 0) + (Number(e.baseAmt) || 0); });
  renderDonut(catMap, total, sym);

  const payerMap = {};
  allExp.forEach(e => { payerMap[e.payer] = (payerMap[e.payer] || 0) + (Number(e.baseAmt) || 0); });
  renderPayerBars(payerMap, total, sym);
}

function renderDonut(catMap, total, sym) {
  const svg = document.getElementById('donutSvg');
  const legend = document.getElementById('catLegend');
  document.getElementById('donutCenter').textContent = sym + total.toFixed(2);
  const cx=80, cy=80, r=58, strokeW=22;
  const circumference = 2 * Math.PI * r;
  const cats = Object.entries(catMap).sort((a,b)=>b[1]-a[1]);
  let offset = -circumference/4; // start at top
  let svgContent = '';
  let legendContent = '';
  if(total === 0) {
    svgContent = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="${strokeW}"/>`;
  } else {
    cats.forEach(([cat, amt]) => {
      const pct = amt/total;
      const dashLen = pct * circumference;
      const color = CAT_COLORS[cat] || '#F5C800';
      const icon = iconoCat(cat, 14);
      const sel = _statSel.cat, esta = sel === cat;
      svgContent += `<circle data-cat="${cat}" onclick="elegirStatCat('${cat}')" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${esta ? strokeW + 6 : strokeW}" stroke-dasharray="${dashLen} ${circumference-dashLen}" stroke-dashoffset="${-offset}" stroke-linecap="butt" style="transform:rotate(-90deg);transform-origin:${cx}px ${cy}px;opacity:${sel && !esta ? .25 : 1}"/>`;
      offset += dashLen;
      const catLabel = CAT_NOMBRES[cat] || cat;
      const n = _statGastos.filter(e => e.cat === cat).length;
      legendContent += `<button type="button" class="legend-item stat-sel" onclick="elegirStatCat('${cat}')" aria-expanded="${esta}" aria-label="${catLabel}, ${sym}${amt.toFixed(2)}, ${(pct*100).toFixed(0)}%, ${n} ${n === 1 ? 'gasto' : 'gastos'}"><div class="legend-dot" style="background:${color}"></div><span>${icon} ${catLabel}</span><span style="margin-left:auto;font-weight:700;font-size:var(--fs-sm)">${sym}${amt.toFixed(2)}</span><span class="legend-pct" style="margin-left:0;min-width:34px;text-align:right">${(pct*100).toFixed(0)}%</span><span class="stat-chev">${icono('abajo', 16)}</span></button>`;
      if (esta) legendContent += detalleStat(_statGastos.filter(e => e.cat === cat), sym, 'cat', catLabel);
    });
  }
  if(cats.length===0) legendContent = '<div style="color:var(--muted);font-size:var(--fs-sm);text-align:center;padding:8px">Sin gastos aún</div>';
  svg.innerHTML = svgContent;
  svg.setAttribute('aria-hidden', 'true');   // la lista de debajo hace lo mismo y se lee mejor
  legend.innerHTML = legendContent;
  legend.classList.toggle('stats-con-sel', !!_statSel.cat);
  // En el centro, lo de la categoría elegida
  const centro = document.getElementById('donutCenter'), rotulo = centro.nextElementSibling;
  if (_statSel.cat && catMap[_statSel.cat] != null) {
    centro.textContent = sym + catMap[_statSel.cat].toFixed(2);
    if (rotulo) rotulo.textContent = CAT_NOMBRES[_statSel.cat] || _statSel.cat;
  } else if (rotulo) rotulo.textContent = 'Total';
}

// ── Estadísticas: desglose al tocar una categoría o un pagador ──
let _statSel = { grupo: null, cat: null, payer: null };
let _statGastos = [];
const CAT_NOMBRES = { food: 'Comida', transport: 'Transporte', hotel: 'Alojamiento', activity: 'Actividad', other: 'Otro' };
function elegirStatCat(cat) { _statSel.cat = _statSel.cat === cat ? null : cat; renderStats(); }
function elegirStatPagador(i) {
  const nombre = (_statPagadores[i] || [])[0];
  _statSel.payer = _statSel.payer === nombre ? null : nombre; renderStats();
}
let _statPagadores = [];
function detalleStat(lista, sym, tipo, titulo) {
  const orden = [...lista].sort((a, b) => (b.baseAmt || 0) - (a.baseAmt || 0));
  const total = orden.reduce((t, e) => t + (Number(e.baseAmt) || 0), 0);
  const filas = orden.map(e => {
    const nombre = escaparHtml(e.desc || e.description || 'Sin descripción');
    const meta = tipo === 'cat'
      ? `${escaparHtml(e.payer || e.payer_name || '')} · ${fmtDate(e.date || e.expense_date)}`
      : `${CAT_NOMBRES[e.cat] || 'Otro'} · ${fmtDate(e.date || e.expense_date)}`;
    return `<button type="button" class="stat-gasto" onclick="openGasto(${e.idx},'stats')">
      <span class="exp-ico ${CAT_CSS[e.cat] || 'c-other'}">${iconoCat(e.cat, 15)}</span>
      <span class="stat-gasto-info"><span class="stat-gasto-nombre" style="display:block">${nombre}</span><span class="stat-gasto-meta" style="display:block">${meta}</span></span>
      <span class="stat-gasto-imp">${sym}${(Number(e.baseAmt) || 0).toFixed(2)}</span></button>`;
  }).join('');
  const n = orden.length;
  return `<div class="stat-detalle" role="region" aria-label="Gastos de ${escaparHtml(titulo)}">
    <div class="stat-det-cab">${n} ${n === 1 ? 'gasto' : 'gastos'} · ${sym}${total.toFixed(2)}</div>${filas}</div>`;
}

function renderPayerBars(payerMap, total, sym) {
  const el = document.getElementById('payerBars');
  const sorted = Object.entries(payerMap).sort((a,b)=>b[1]-a[1]);
  if(sorted.length===0){el.innerHTML='<div style="color:var(--muted);font-size:var(--fs-sm);text-align:center;padding:8px">Sin gastos aún</div>';return;}
  const max = sorted[0][1];
  _statPagadores = sorted;
  el.classList.toggle('stats-con-sel', !!_statSel.payer);
  el.innerHTML = sorted.map(([name,amt],i)=>{
    const esta = _statSel.payer === name;
    const suyos = _statGastos.filter(e => (e.payer || e.payer_name) === name);
    return `<button type="button" class="bar-row stat-sel" onclick="elegirStatPagador(${i})" aria-expanded="${esta}" aria-label="${escaparHtml(name)}, pagó ${sym}${amt.toFixed(2)}, ${suyos.length} ${suyos.length === 1 ? 'gasto' : 'gastos'}">
      <div class="bar-name">${escaparHtml(name)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${max?((amt/max)*100).toFixed(1):0}%"></div></div>
      <div class="bar-val">${sym}${amt.toFixed(2)}</div>
      <span class="stat-chev">${icono('abajo', 16)}</span>
    </button>${esta ? detalleStat(suyos, sym, 'payer', name) : ''}`;
  }).join('');
}
