// public/js/navegacion.js — Cambio de pantallas, selector de grupo y tipo de grupo
// (antes dentro de index.html; el orden de carga está en index.html)

// ═══ PAGE NAVIGATION ═════════════════════════════════════════════════
function switchPage(id, btn) {
  // 1. GESTIÓN DE CLASES ACTIVAS (Páginas y Botones)
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  
  const targetPage = document.getElementById(id);
  if (targetPage) targetPage.classList.add('active');
  if (btn) btn.classList.add('active');
  // El chat es de un grupo: al ir a una pantalla sin grupo (Mis grupos, Amigos, Cuenta)
  // se cierra; en escritorio, si no, quedaba abierto al costado
  if (['page-grupos', 'page-amigos', 'page-cuenta'].includes(id) && typeof chatAbierto === 'function' && chatAbierto()) cerrarChat();
  
  window.scrollTo(0, 0);
resetMemberAccordions();
if (typeof hideNewGroupForm === 'function') hideNewGroupForm();
const groupsWrap = document.getElementById('groupsListWrap');
const groupsChevron = document.getElementById('groupsChevron');
if (groupsWrap) groupsWrap.style.display = 'block';
if (groupsChevron) groupsChevron.style.transform = 'rotate(180deg)';

  // 2. LÓGICA DE SALIDA DE GRUPO (Al volver a la lista general)
  if (id === 'page-grupos') {
    currentGroupIdx = -1; // Reseteamos el índice para bloquear estadísticas

    // 3. OCULTAR LA ETIQUETA "hbadge"
    const headerBadge = document.getElementById('hbadge');
    if (headerBadge) {
      headerBadge.style.display = 'none'; // Esto lo quita de la vista inmediatamente
    }

    // Refrescamos la lista de grupos para que el estado sea limpio
    if (typeof renderGroups === 'function') renderGroups();
  }

  // Lógica adicional para otras páginas
  if (id === 'page-amigos') {
    populateFriendGroupSelect();
    document.getElementById('hbadge').style.display = 'none';
  }
  if (id === 'page-cuenta') {
    document.getElementById('hbadge').style.display = 'none';
  }

  if (id === 'page-stats') {
    const badge = document.getElementById('hbadge');
    const sub = document.getElementById('statsSubtitle');
    if (groups.length === 0) {
      badge.style.display = 'none';
      if (sub) sub.textContent = 'Resumen de todos tus grupos';
    } else if (currentGroupIdx === null || currentGroupIdx === -1) {
      badge.textContent = 'Elegir grupo';
      badge.style.display = 'block';
      if (sub) sub.textContent = 'Resumen de todos tus grupos';
    } else {
      const g = groups[currentGroupIdx];
      badge.innerHTML = iconoTipo(g.type, 13) + ' ' + escaparHtml(g.name);
      badge.style.display = 'block';
      if (sub) sub.textContent = g.expenses?.length + ' gastos · ' + fmtDate(g.start) + ' → ' + fmtDate(g.end);
    }
  }

  if (id === 'page-actividad') {
    const badge = document.getElementById('hbadge');
    if (groups.length === 0) {
      badge.style.display = 'none';
    } else if (currentGroupIdx === null || currentGroupIdx === -1) {
      badge.textContent = 'Elegir grupo';
      badge.style.display = 'block';
    } else {
      const g = groups[currentGroupIdx];
      badge.innerHTML = iconoTipo(g.type, 13) + ' ' + escaparHtml(g.name);
      badge.style.display = 'block';
    }
    renderActivity();
  }
  // El selector de grupo se coloca a mano a la altura de la cabecera de cada
  // pantalla: si no se recoloca aquí, conserva la altura de cuando estaba oculto
  // (0 px) y aparece pegado a la línea inferior hasta elegir un grupo
  requestAnimationFrame(posicionarBadge);
}

function goBack() {
  const currentPage = document.querySelector('.page.active').id;

  // Si estamos en detalle de gasto, volver a detalle de grupo
  if (currentPage === 'page-gasto') {
    switchPage('page-detalle', null);
  } 
  // Si estamos en detalle de grupo, volver a grupos
  else if (currentPage === 'page-detalle') {
    switchPage('page-grupos', document.querySelector('[data-page="page-grupos"]'));
  }
  // En cualquier otro caso, ir a grupos
  else {
    switchPage('page-grupos', document.querySelector('[data-page="page-grupos"]'));
  }
}

// ─── GROUP DROPDOWN ──────────────────────────────────────────────
// Nombre del grupo arriba: es el botón que abre el desplegable para cambiar de grupo.
// La flecha va aparte del nombre para que no la corten los puntos suspensivos.
function pintarTituloGrupo(g) {
  document.getElementById('detTitle').innerHTML = iconoTipo(g.type, 18)
    + '<span class="det-nombre">' + escaparHtml(g.name) + '</span>'
    + '<span class="det-flecha">' + icono('abajo', 18) + '</span>';
  // Si el chat está abierto (en escritorio queda al costado), pasa al chat del grupo nuevo
  if (typeof chatAbierto === 'function' && chatAbierto() && g.id && g.id !== _chatGrupoId) cambiarChatDeGrupo();
}

function toggleGroupDropdown() {
  const dd = document.getElementById('groupDropdown');
  if (dd.classList.contains('open')) {
    closeGroupDropdown();
  } else {
    openGroupDropdown();
  }
}

function openGroupDropdown() {
  const list = document.getElementById('groupDropdownList');
  list.innerHTML = groups.map((g, i) => `
    <div class="gdrop-item ${i === currentGroupIdx ? 'active' : ''}" onclick="closeGroupDropdown();switchGroupFromDropdown(${i})">
      <span>${iconoTipo(g.type, 16)}</span>
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${g.name}</span>
      ${i === currentGroupIdx ? '<span style="margin-left:auto;display:flex">'+icono('check',14)+'</span>' : ''}
    </div>`).join('');
  document.getElementById('groupDropdown').classList.add('open');
  // Cerrar al tocar fuera
  setTimeout(() => document.addEventListener('click', closeOnOutsideClick), 10);
}

function closeGroupDropdown() {
  document.getElementById('groupDropdown').classList.remove('open');
  document.removeEventListener('click', closeOnOutsideClick);
}

function closeOnOutsideClick(e) {
  const dd = document.getElementById('groupDropdown');
  const badge = document.getElementById('hbadge');
  if (!dd.contains(e.target) && !badge.contains(e.target) && !e.target.closest('.det-titulo')) {
    closeGroupDropdown();
  }
}

function switchGroupFromDropdown(idx) {
  const currentPage = document.querySelector('.page.active')?.id;

  currentGroupIdx = idx;
  const g = groups[idx];
  updateBalances();

  // Actualizar badge (texto y visibilidad ahora; la posición se ajusta al final)
  document.getElementById('hbadge').innerHTML = iconoTipo(g.type, 13) + ' ' + escaparHtml(g.name);
  document.getElementById('hbadge').style.display = 'block';

  // Actualizar título y meta del detalle
  pintarTituloGrupo(g);
  document.getElementById('detMeta').textContent = fmtDate(g.start) + ' → ' + fmtDate(g.end);

  if (currentPage === 'page-stats') {
    const sub = document.getElementById('statsSubtitle');
    if (sub) sub.textContent = '';
    renderStats();
  } else if (currentPage === 'page-actividad') {
    renderActivity();
  } else {
    openGroup(idx);
  }

  // Recalcular la posición del badge DESPUÉS de que el contenido nuevo
  // ya se haya pintado — requestAnimationFrame espera al próximo repintado
  // del navegador, así el .det-bar que mide ya tiene su tamaño final.
  requestAnimationFrame(posicionarBadge);
}

// ═══ TYPE SELECTOR

// ═══ TYPE SELECTOR ═══════════════════════════════════════════════════
function selectType(el){
  document.querySelectorAll('.type-btn').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');selectedType=el.dataset.type;
}

// ═══ NEW GROUP FORM TOGGLE ════════════════════════════════════════════
function showNewGroupForm(){document.getElementById('newGroupForm').style.display='block';document.getElementById('newGroupForm').scrollIntoView({behavior:'smooth'});}
function hideNewGroupForm(){document.getElementById('newGroupForm').style.display='none';}
