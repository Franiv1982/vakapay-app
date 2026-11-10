// public/accesible.js — Accesibilidad de VakaPay
// ================================================================
// Hace que la app se pueda usar con lector de pantalla (TalkBack) y con
// teclado, sin tener que reescribir cada pantalla. Se carga en index.html
// y login.html y trabaja sola, también sobre lo que la app pinta después:
//   · Lo que se toca y no es un botón (tarjetas, cabeceras desplegables,
//     chips…) pasa a anunciarse como «botón» y se puede usar con teclado.
//   · Cabeceras desplegables (data-controla="id"): dicen si están abiertas.
//   · Chips y tipos de grupo seleccionables: dicen si están marcados.
//   · Rótulos de formulario enlazados con su campo.
//   · Botones que solo tienen icono: su «title» pasa a ser su nombre.
//   · Ventanas (modales): se anuncian como diálogo, reciben el foco al
//     abrirse, lo devuelven al cerrarse y se cierran con Escape.
// ================================================================
(function () {
  const NATIVOS = 'button, a[href], input, select, textarea, summary';
  const CAPA = '.modal-overlay, [onclick*="event.target===this"]';
  const CONTROLES = 'input:not([type=hidden]), select, textarea';
  // Seleccionables cuyo estado depende de una clase
  const MARCABLES = [['.type-btn', 'active'], ['.chip[data-name]', 'sel'], ['.modal-chip', 'sel'], ['.gdrop-item', 'active']];

  const esCapa = el => el.matches(CAPA) || el.id === 'chatCapa' || el.id === 'chatCapaAdj';
  const visible = el => !!el && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';

  function sincronizarDesplegable(el) {
    const destino = document.getElementById(el.dataset.controla);
    el.setAttribute('aria-expanded', destino && visible(destino) ? 'true' : 'false');
    if (destino) el.setAttribute('aria-controls', destino.id);
  }
  function sincronizarMarcado(el) {
    for (const [sel, clase] of MARCABLES) if (el.matches(sel)) el.setAttribute('aria-pressed', el.classList.contains(clase) ? 'true' : 'false');
  }

  let nId = 0;
  function mejorar(raiz) {
    if (!raiz || !raiz.querySelectorAll) return;
    const lista = (sel) => [...(raiz.matches && raiz.matches(sel) ? [raiz] : []), ...raiz.querySelectorAll(sel)];

    // Elementos que se tocan → botones
    for (const el of lista('[onclick]')) {
      if (el.matches(NATIVOS) || esCapa(el) || el.closest('[aria-hidden="true"]')) continue;
      if (el.getAttribute('onclick').trim() === 'event.stopPropagation()') continue;   // solo frena el toque
      // Una tarjeta con botones dentro no se marca como botón (no se pueden anidar): sus botones ya se usan solos
      if (el.querySelector(NATIVOS) || [...el.querySelectorAll('[onclick]')].some(h => h.getAttribute('onclick').trim() !== 'event.stopPropagation()')) continue;
      if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
      if (!el.hasAttribute('tabindex')) el.tabIndex = 0;
      sincronizarMarcado(el);
    }
    for (const el of lista('[data-controla]')) sincronizarDesplegable(el);
    // Botones de solo icono con title → nombre accesible
    for (const b of lista('button[title]:not([aria-label])')) {
      if (!b.textContent.trim()) b.setAttribute('aria-label', b.title);
    }
    // Rótulos sueltos → enlazados al campo que tienen justo después
    for (const lb of lista('label:not([for])')) {
      if (lb.querySelector(CONTROLES)) continue;
      const c = lb.nextElementSibling;
      if (!c || !c.matches(CONTROLES)) continue;
      if (!c.id) c.id = 'campo-' + (++nId);
      lb.htmlFor = c.id;
    }
    // Campos sin rótulo pero con texto de ejemplo → ese texto como nombre
    for (const c of lista('input[placeholder]:not([aria-label]), textarea[placeholder]:not([aria-label])')) {
      if (!c.labels || !c.labels.length) c.setAttribute('aria-label', c.placeholder);
    }
    // Ventanas → diálogos
    for (const capa of lista(CAPA)) {
      const caja = capa.firstElementChild;
      if (!caja || caja.hasAttribute('role')) continue;
      caja.setAttribute('role', 'dialog');
      caja.setAttribute('aria-modal', 'true');
      caja.tabIndex = -1;
      const titulo = caja.querySelector('h1, h2, h3, h4, .modal-title, .ventana-titulo') ||
        [...caja.querySelectorAll('div, p, span, strong, b')].find(e => !e.children.length && e.textContent.trim());
      if (titulo) { if (!titulo.id) titulo.id = 'titulo-' + (++nId); caja.setAttribute('aria-labelledby', titulo.id); }
      capa._abierta = visible(capa);
    }
  }

  // Foco al abrir y cerrar ventanas
  const pilaFoco = [];
  function revisarCapa(capa) {
    const abierta = visible(capa);
    if (abierta === !!capa._abierta) return;
    capa._abierta = abierta;
    const caja = capa.firstElementChild;
    if (abierta) {
      pilaFoco.push(document.activeElement);
      if (caja && caja.getAttribute('role') === 'dialog') setTimeout(() => { if (!caja.contains(document.activeElement)) caja.focus({ preventScroll: true }); }, 50);
    } else {
      const antes = pilaFoco.pop();
      if (antes && document.contains(antes) && antes.focus) antes.focus({ preventScroll: true });
    }
  }

  const obs = new MutationObserver(muts => {
    for (const m of muts) {
      if (m.type === 'childList') { m.addedNodes.forEach(n => n.nodeType === 1 && mejorar(n)); continue; }
      const t = m.target;
      if (t.nodeType !== 1) continue;
      if (t.matches(CAPA)) revisarCapa(t);
      if (m.attributeName === 'class') sincronizarMarcado(t);
      if (t.id) {
        document.querySelectorAll(`[data-controla="${t.id}"]`).forEach(sincronizarDesplegable);
      }
    }
  });

  // Teclado: Intro o Espacio activan los «botones» que no son <button>
  document.addEventListener('keydown', e => {
    const t = e.target;
    if ((e.key === 'Enter' || e.key === ' ') && t.getAttribute && t.getAttribute('role') === 'button' && !t.matches(NATIVOS)) {
      e.preventDefault(); t.click();
    }
    if (e.key === 'Escape') {
      const abiertas = [...document.querySelectorAll(CAPA)].filter(visible);
      const ultima = abiertas.find(c => c.contains(document.activeElement)) || abiertas[abiertas.length - 1];
      if (ultima && (ultima.getAttribute('onclick') || '').includes('event.target===this')) ultima.click();   // como tocar fuera
    }
  });

  function iniciar() {
    mejorar(document.body);
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();

  // Para anunciar un mensaje desde el código: anunciar('Gasto guardado')
  window.anunciar = function (texto) {
    let z = document.getElementById('zonaAnuncios');
    if (!z) {
      z = document.createElement('div'); z.id = 'zonaAnuncios';
      z.setAttribute('role', 'status'); z.setAttribute('aria-live', 'polite');
      z.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap';
      document.body.appendChild(z);
    }
    z.textContent = ''; setTimeout(() => { z.textContent = texto; }, 60);
  };
})();
