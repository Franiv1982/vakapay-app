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
const skGrupos = (n = 3) => Array.from({ length: n }, (_, i) => `
  <div class="sk-card" aria-hidden="true">
    <div class="sk" style="width:44px;height:44px;border-radius:var(--r-md);flex-shrink:0;"></div>
    <div style="flex:1;min-width:0;">
      <div class="sk" style="height:13px;width:${[62, 48, 70][i % 3]}%;margin-bottom:8px;"></div>
      <div class="sk" style="height:10px;width:${[80, 66, 74][i % 3]}%;"></div>
    </div>
    <div class="sk" style="width:58px;height:14px;flex-shrink:0;"></div>
  </div>`).join('') + '<div style="text-align:center;color:var(--muted);font-size:var(--fs-sm);margin-top:4px;">Cargando tus grupos…</div>';
const skFilas = (n = 4, avatar = true) => Array.from({ length: n }, (_, i) => `
  <div class="sk-fila" aria-hidden="true">
    ${avatar ? '<div class="sk" style="width:38px;height:38px;border-radius:50%;flex-shrink:0;"></div>' : '<div class="sk" style="width:8px;height:8px;border-radius:50%;flex-shrink:0;"></div>'}
    <div style="flex:1;min-width:0;">
      <div class="sk" style="height:12px;width:${[55, 72, 40, 64][i % 4]}%;margin-bottom:8px;"></div>
      <div class="sk" style="height:9px;width:${[35, 48, 30, 42][i % 4]}%;"></div>
    </div>
  </div>`).join('');
const skChat = () => [['izq', 62], ['der', 48], ['izq', 70], ['izq', 40], ['der', 58]].map(([lado, w]) => `
  <div aria-hidden="true" style="display:flex;justify-content:${lado === 'der' ? 'flex-end' : 'flex-start'};margin:8px 12px;">
    <div class="sk" style="height:38px;width:${w}%;border-radius:var(--r-md);${lado === 'der' ? 'border-bottom-right-radius:4px' : 'border-bottom-left-radius:4px'};"></div>
  </div>`).join('');
