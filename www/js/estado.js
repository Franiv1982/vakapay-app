// public/js/estado.js — Estado de la app (grupos, amigos, actividad, perfil…) y esqueletos de carga
// (antes dentro de index.html; el orden de carga está en index.html)

// ═══ STATE ═══════════════════════════════════════════════════════════
// Datos cargados por async init() a través de VakaDataService
const API_BASE = 'https://vakapay-app.vercel.app';
function resolverAvatar(u) {
  if (!u) return null;
  if (u.startsWith('data:') || u.startsWith('http')) return u;
  return API_BASE + (u.startsWith('/') ? u : '/' + u);
}
let groups   = [];
let friends  = [];
let grupoAEditar = null;
let activity = [];
let profile  = {};
let currentGroupIdx = null;
let selectedType = 'viaje';
let editingExpenseIdx = null;

const CAT_ICONS = {
  food: '🍔', 'Comida': '🍔',
  transport: '🚗', 'Transporte': '🚗',
  hotel: '🏨', 'Alojamiento': '🏨',
  activity: '🎭', 'Actividad': '🎭',
  other: '💡', 'Otro': '💡'
};
const CAT_CSS = {
  food: 'c-food', 'Comida': 'c-food',
  transport: 'c-transport', 'Transporte': 'c-transport',
  hotel: 'c-hotel', 'Alojamiento': 'c-hotel',
  activity: 'c-activity', 'Actividad': 'c-activity',
  other: 'c-other', 'Otro': 'c-other'
};
const TYPE_ICONS={viaje:'✈️',casa:'🏠',pareja:'💑',otros:'🎯'};

// ═══ CARGA: ESQUELETOS ════════════════════════════════════════════════
// Mientras llegan los datos y no hay nada guardado en el móvil (primer inicio
// de sesión, móvil nuevo), las listas muestran formas grises animadas en vez
// de «No tienes grupos…», para que se entienda que está cargando.
let cargandoInicial = true;
// Cuántos grupos tenía esta cuenta la última vez que cargaron: los esqueletos muestran
// ese número (antes siempre 3, y con 2 grupos parecía que uno no había cargado).
// Se guarda por cuenta (el «sub» del token) para no usar el número de otra persona.
function claveNGrupos() {
  try {
    const t = vakaData.getToken(); if (!t) return null;
    const sub = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub;
    return sub ? 'vp_n_grupos_' + sub : null;
  } catch (_) { return null; }
}
function nGruposRecordados() {
  const k = claveNGrupos(); if (!k) return null;
  const n = parseInt(localStorage.getItem(k), 10);
  return Number.isFinite(n) ? n : null;
}
function recordarNGrupos(n) {
  const k = claveNGrupos(); if (!k) return;
  try { localStorage.setItem(k, String(n)); } catch (_) {}
}
const skGrupos = (n = Math.min(5, Math.max(1, nGruposRecordados() ?? 3))) => Array.from({ length: n }, (_, i) => `
  <div class="sk-card" aria-hidden="true">
    <div class="sk u-w-44 u-h-44 u-r-md u-shrink-0"></div>
    <div class="u-f-1 u-minw-0">
      <div class="sk" style="height:13px;width:${[62, 48, 70][i % 3]}%;margin-bottom:8px;"></div>
      <div class="sk" style="height:10px;width:${[80, 66, 74][i % 3]}%;"></div>
    </div>
    <div class="sk u-w-58 u-h-14 u-shrink-0"></div>
  </div>`).join('') + '<div class="u-t-center u-c-muted u-fs-sm u-mt-4">Cargando tus grupos…</div>';
const skFilas = (n = 4, avatar = true) => Array.from({ length: n }, (_, i) => `
  <div class="sk-fila" aria-hidden="true">
    ${avatar ? '<div class="sk u-w-38 u-h-38 u-r-50p u-shrink-0"></div>' : '<div class="sk u-w-8 u-h-8 u-r-50p u-shrink-0"></div>'}
    <div class="u-f-1 u-minw-0">
      <div class="sk" style="height:12px;width:${[55, 72, 40, 64][i % 4]}%;margin-bottom:8px;"></div>
      <div class="sk" style="height:9px;width:${[35, 48, 30, 42][i % 4]}%;"></div>
    </div>
  </div>`).join('');
const skChat = () => [['izq', 62], ['der', 48], ['izq', 70], ['izq', 40], ['der', 58]].map(([lado, w]) => `
  <div aria-hidden="true" style="display:flex;justify-content:${lado === 'der' ? 'flex-end' : 'flex-start'};margin:8px 12px;">
    <div class="sk" style="height:38px;width:${w}%;border-radius:var(--r-md);${lado === 'der' ? 'border-bottom-right-radius:4px' : 'border-bottom-left-radius:4px'};"></div>
  </div>`).join('');
