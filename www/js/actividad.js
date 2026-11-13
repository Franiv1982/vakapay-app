// public/js/actividad.js — Pantalla Actividad
// (antes dentro de index.html; el orden de carga está en index.html)

// ═══ ACTIVITY ════════════════════════════════════════════════════════
// Recarga la actividad desde el servidor (incluye los cambios de otros participantes)
async function refrescarActividad() {
  try {
    activity = (await vakaData.getActivity() || []).map(a => ({ ...a, groupName: a.groupName || a.group_name || null }));
    renderActivity();
  } catch (_) {}
}

async function logActivity(msg) {
  const groupName = (currentGroupIdx !== null && currentGroupIdx >= 0 && groups[currentGroupIdx])
    ? groups[currentGroupIdx].name
    : null;
  const entry = { msg, time: new Date().toISOString(), groupName };
  activity.unshift(entry);
  if (activity.length > 100) activity.pop();
  await vakaData.logActivity(msg, groupName);
}

function renderActivity() {
  const el = document.getElementById('activityList');
  const sub = document.getElementById('activitySubtitle');
  if (!el) return;

  const filterGroup = currentGroupIdx !== null && currentGroupIdx >= 0 && groups[currentGroupIdx];
  const filtered = filterGroup
    ? activity.filter(a => a.groupName === groups[currentGroupIdx].name)
    : activity;

  if (sub) sub.innerHTML = filterGroup
    ? 'Grupo: ' + groups[currentGroupIdx].name
    : '<span style="color:var(--text);">Todas las acciones</span>';

  if (filtered.length === 0 && cargandoInicial) { el.innerHTML = skFilas(5, false); return; }
  if (filtered.length === 0) {
    el.innerHTML = '<div class="no-items"><div class="ni"><svg style="color:var(--text)" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div><div style="color:var(--text);">Sin actividad' + (filterGroup ? ' en este grupo' : ' reciente') + '</div></div>';
    return;
  }

  const byDate = {};
  filtered.forEach(a => {
    const d = new Date(a.time || a.created_at);
    const hoy = new Date();
    const ayer = new Date(); ayer.setDate(hoy.getDate() - 1);
    let fecha;
    if (d.toDateString() === hoy.toDateString()) {
      fecha = 'Hoy';
    } else if (d.toDateString() === ayer.toDateString()) {
      fecha = 'Ayer';
    } else {
      fecha = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    }
    if (!byDate[fecha]) byDate[fecha] = [];
    byDate[fecha].push(a);
  });

  el.innerHTML = Object.entries(byDate).map(([fecha, items], idx) => {
    const id = 'actDay_' + idx;
    const isHoy = fecha === 'Hoy';
    return `
    <div style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;margin:14px 0 6px 0;" onclick="toggleActDay('${id}')" data-controla="${id}">
      <div style="font-size:var(--fs-xs);color:var(--gold-text);text-transform:uppercase;letter-spacing:.8px;font-weight:700;">${fecha} <span style="color:var(--muted);font-weight:400">(${items.length})</span></div>
      <svg id="${id}_chv" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transition:transform .25s;transform:${isHoy ? 'rotate(180deg)' : ''}"><polyline points="6 9 12 15 18 9"/></svg>
    </div>
    <div id="${id}" style="display:${isHoy ? 'block' : 'none'}">
      <div class="card" style="margin-bottom:4px;">
        ${items.map(a => `
          <div class="act-item">
            <div class="act-dot"></div>
            <div class="act-txt">${escaparHtml(a.msg || a.message || '')}
              <div class="act-time">${formatRelTime(new Date(a.time || a.created_at))}${a.groupName && !filterGroup ? ' · ' + escaparHtml(a.groupName) : ''}</div>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
  }).join('');
}

function toggleActDay(id) {
  const wrap = document.getElementById(id);
  const chv = document.getElementById(id + '_chv');
  if (!wrap) return;
  const open = wrap.style.display === 'block';
  wrap.style.display = open ? 'none' : 'block';
  if (chv) chv.style.transform = open ? '' : 'rotate(180deg)';
}

function formatRelTime(d){
  const diff=Date.now()-d.getTime();
  if(diff<60000)return'Ahora mismo';
  if(diff<3600000)return`Hace ${Math.floor(diff/60000)} min`;
  if(diff<86400000)return`Hace ${Math.floor(diff/3600000)} h`;
  return d.toLocaleDateString('es-ES');
}
