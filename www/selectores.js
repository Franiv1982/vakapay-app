// public/selectores.js — Listas desplegables y fechas con el estilo de la app
// ================================================================
// En la APK, al tocar un <select> Android abre su propia ventana del sistema,
// que no sigue el tema de la app (salía blanca con el tema oscuro). Aquí cada
// <select> de un formulario (.field) se cambia por un botón que abre una lista
// propia, con los colores del tema elegido, igual en la web y en la APK.
//   · El <select> original sigue ahí (oculto): el resto del código lo lee,
//     lo rellena y le cambia el valor como siempre, y su «onchange» se ejecuta.
//   · Accesible: el botón se anuncia con su rótulo y la opción elegida; la
//     lista es un diálogo con opciones marcables, se mueve con las flechas
//     y se cierra con Escape, el botón atrás o tocando fuera.
// Además, las fechas vacías muestran «dd/mm/aaaa» (en el móvil salían en blanco).
// ================================================================
(function () {
  const css = `
  .sel-oculto{position:absolute!important;width:1px!important;height:1px!important;min-height:0!important;padding:0!important;margin:0!important;border:0!important;opacity:0!important;pointer-events:none!important;overflow:hidden!important}
  .sel-boton{width:100%;min-height:var(--alto-control);display:flex;align-items:center;gap:8px;text-align:left;cursor:pointer;
    background:var(--dark3);border:1.5px solid var(--tint-2);border-radius:var(--r-md);padding:10px 12px;color:var(--text);
    font-family:var(--font);font-size:var(--fs-base);font-weight:700;transition:border-color .2s,box-shadow .2s}
  .sel-boton:focus-visible,.sel-boton[aria-expanded="true"]{border-color:var(--gold);box-shadow:0 0 0 3px rgba(245,200,0,.1);outline:none}
  .sel-boton:disabled{opacity:.5;cursor:not-allowed}
  .sel-boton{justify-content:flex-start}
  .sel-texto{flex:1;text-align:left;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .sel-texto.vacio{color:var(--muted);font-weight:400}
  .sel-flecha{flex-shrink:0;color:var(--muted);display:flex}
  .g2 .sel-boton{padding-left:10px;padding-right:8px}
  #selHoja{position:fixed;inset:0;z-index:10050;display:none;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.6)}
  #selHoja.abierta{display:flex;animation:fadeIn .15s ease}
  .sel-panel{width:100%;max-width:480px;max-height:70vh;display:flex;flex-direction:column;background:var(--dark3);
    border:1px solid var(--line);border-bottom:0;border-radius:var(--r-xl) var(--r-xl) 0 0;box-shadow:var(--shadow-lg);
    padding:8px 0 calc(10px + env(safe-area-inset-bottom));animation:slideUp .2s ease}
  @media (min-width:700px){#selHoja{align-items:center}.sel-panel{max-width:380px;border-bottom:1px solid var(--line);border-radius:var(--r-xl);padding-bottom:10px}}
  .sel-asa{width:40px;height:4px;background:var(--tint-3);border-radius:4px;margin:4px auto 6px}
  .sel-titulo{font-size:var(--fs-xs);font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.9px;padding:6px 20px 8px}
  .sel-lista{overflow-y:auto;padding:0 8px}
  .sel-opcion{width:100%;min-height:48px;display:flex;align-items:center;gap:10px;padding:10px 12px;border:0;border-radius:var(--r-md);
    background:transparent;color:var(--text);font-family:var(--font);font-size:var(--fs-md);font-weight:700;text-align:left;cursor:pointer}
  .sel-opcion{justify-content:flex-start}
  .sel-opcion > span:last-child{flex:1;min-width:0;overflow-wrap:anywhere;text-align:left}
  .sel-opcion[aria-selected="true"]{background:var(--gold-soft);color:var(--gold-text)}
  .sel-opcion:disabled{color:var(--muted2);cursor:default}
  .sel-opcion .sel-check{width:18px;flex:0 0 18px;display:flex}
  @media (hover:hover){.sel-opcion:not(:disabled):not([aria-selected="true"]):hover{background:var(--press)}}
  .sel-opcion:active{background:var(--press)}
  .sel-opcion:focus-visible{outline:2px solid var(--gold);outline-offset:-2px}
  /* Fechas vacías: «dd/mm/aaaa» */
  .fecha-caja{position:relative;display:block;width:100%;min-width:0}
  .fecha-caja input[type="date"]{width:100%}
  .fecha-pista{position:absolute;left:11px;top:50%;transform:translateY(-50%);pointer-events:none;color:var(--muted);
    font-family:var(--font);font-size:var(--fs-base);font-weight:400;display:none}
  .fecha-caja.vacia .fecha-pista{display:block}
  .fecha-caja.vacia input[type="date"]::-webkit-datetime-edit{color:transparent}
  .fecha-caja.vacia input[type="date"]:focus::-webkit-datetime-edit{color:inherit}
  .fecha-caja.vacia:focus-within .fecha-pista{display:none}
  `;
  const PISTA_FECHA = 'dd/mm/aaaa';
  const FLECHA = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';
  const CHECK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
  let nId = 0;
  const id = (el, pref) => el.id || (el.id = pref + '-' + (++nId));

  // Cuando el código cambia .value / .selectedIndex, el botón se actualiza solo
  function vigilarPropiedad(el, proto, prop, alCambiar) {
    const d = Object.getOwnPropertyDescriptor(proto, prop);
    if (!d || !d.set) return;
    Object.defineProperty(el, prop, {
      configurable: true, enumerable: d.enumerable,
      get() { return d.get.call(this); },
      set(v) { d.set.call(this, v); alCambiar(); }
    });
  }

  // ── Listas desplegables ─────────────────────────────────────────
  function rotuloDe(sel) {
    const campo = sel.closest('.field');
    return campo && [...campo.children].find(e => e.tagName === 'LABEL');
  }
  function pintarBoton(sel) {
    const b = sel._selBoton; if (!b) return;
    const op = sel.options[sel.selectedIndex];
    const t = b.querySelector('.sel-texto');
    t.textContent = op ? op.text : 'Elegir…';
    t.classList.toggle('vacio', !op || op.value === '');
    b.disabled = sel.disabled || !sel.options.length;
  }
  function mejorarSelect(sel) {
    if (sel._selBoton || sel.multiple || !sel.closest('.field')) return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'sel-boton';
    b.setAttribute('aria-haspopup', 'dialog'); b.setAttribute('aria-expanded', 'false');
    b.innerHTML = '<span class="sel-texto"></span><span class="sel-flecha">' + FLECHA + '</span>';
    const t = b.querySelector('.sel-texto'); id(t, 'sel-texto');
    const lb = rotuloDe(sel);
    if (lb) { id(lb, 'sel-rotulo'); b.setAttribute('aria-labelledby', lb.id + ' ' + t.id); lb.htmlFor = id(b, 'sel-boton'); }
    sel._selBoton = b;
    sel.classList.add('sel-oculto'); sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');
    sel.insertAdjacentElement('afterend', b);
    b.addEventListener('click', () => abrirLista(sel));
    sel.addEventListener('change', () => pintarBoton(sel));
    vigilarPropiedad(sel, HTMLSelectElement.prototype, 'value', () => pintarBoton(sel));
    vigilarPropiedad(sel, HTMLSelectElement.prototype, 'selectedIndex', () => pintarBoton(sel));
    vigilarPropiedad(sel, HTMLSelectElement.prototype, 'disabled', () => pintarBoton(sel));
    // Opciones que se rellenan después (¿Quién pagó?, grupos…)
    new MutationObserver(() => pintarBoton(sel)).observe(sel, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['selected', 'disabled'] });
    pintarBoton(sel);
  }

  let hoja, abiertoDe = null;
  function crearHoja() {
    hoja = document.createElement('div');
    hoja.id = 'selHoja';
    hoja.innerHTML = '<div class="sel-panel" role="dialog" aria-modal="true" aria-labelledby="selTitulo" tabindex="-1">' +
      '<div class="sel-asa" aria-hidden="true"></div><div class="sel-titulo" id="selTitulo"></div>' +
      '<div class="sel-lista" role="listbox" aria-labelledby="selTitulo"></div></div>';
    hoja.addEventListener('click', e => { if (e.target === hoja) cerrarLista(); });
    hoja.addEventListener('keydown', e => {
      const ops = [...hoja.querySelectorAll('.sel-opcion:not(:disabled)')];
      const i = ops.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrarLista(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const n = e.key === 'ArrowDown' ? Math.min(ops.length - 1, i + 1) : Math.max(0, i - 1);
        if (ops[n]) ops[n].focus();
      } else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); (e.key === 'Home' ? ops[0] : ops[ops.length - 1])?.focus(); }
      else if (e.key === 'Tab') { e.preventDefault(); }   // el foco no sale de la lista
    }, true);
    document.body.appendChild(hoja);
  }
  function abrirLista(sel) {
    if (!hoja) crearHoja();
    abiertoDe = sel;
    const lb = rotuloDe(sel);
    hoja.querySelector('#selTitulo').textContent = lb ? lb.textContent.trim() : 'Elegir';
    const lista = hoja.querySelector('.sel-lista');
    lista.innerHTML = '';
    [...sel.options].forEach((op, i) => {
      const o = document.createElement('button');
      o.type = 'button'; o.className = 'sel-opcion'; o.setAttribute('role', 'option');
      const marcada = i === sel.selectedIndex;
      o.setAttribute('aria-selected', marcada ? 'true' : 'false');
      o.disabled = op.disabled;
      o.innerHTML = '<span class="sel-check">' + (marcada ? CHECK : '') + '</span><span></span>';
      o.lastChild.textContent = op.text;
      o.addEventListener('click', () => elegir(sel, i));
      lista.appendChild(o);
    });
    hoja.classList.add('abierta');
    sel._selBoton.setAttribute('aria-expanded', 'true');
    const actual = lista.querySelector('[aria-selected="true"]') || lista.querySelector('.sel-opcion:not(:disabled)');
    setTimeout(() => { (actual || hoja.querySelector('.sel-panel')).focus({ preventScroll: true }); actual && actual.scrollIntoView({ block: 'nearest' }); }, 30);
  }
  function elegir(sel, i) {
    const cambia = sel.selectedIndex !== i;
    sel.selectedIndex = i;
    cerrarLista();
    if (cambia) {
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  function cerrarLista() {
    if (!hoja || !hoja.classList.contains('abierta')) return false;
    hoja.classList.remove('abierta');
    const sel = abiertoDe; abiertoDe = null;
    if (sel && sel._selBoton) { sel._selBoton.setAttribute('aria-expanded', 'false'); sel._selBoton.focus({ preventScroll: true }); }
    return true;
  }
  // Para el botón atrás (Android y navegador): cierra la lista si está abierta
  window.cerrarSelectorAbierto = cerrarLista;
  window.selectorAbierto = () => !!(hoja && hoja.classList.contains('abierta'));

  // ── Fechas: pista «dd/mm/aaaa» cuando están vacías ─────────────
  function pintarFecha(inp) { inp._fechaCaja && inp._fechaCaja.classList.toggle('vacia', !inp.value); }
  function mejorarFecha(inp) {
    if (inp._fechaCaja || !inp.closest('.field')) return;
    const lb = rotuloDe(inp);
    if (lb && !lb.htmlFor) lb.htmlFor = id(inp, 'campo-fecha');
    const caja = document.createElement('span');
    caja.className = 'fecha-caja';
    inp.parentNode.insertBefore(caja, inp);
    caja.appendChild(inp);
    const pista = document.createElement('span');
    pista.className = 'fecha-pista'; pista.setAttribute('aria-hidden', 'true'); pista.textContent = PISTA_FECHA;
    caja.appendChild(pista);
    inp._fechaCaja = caja;
    ['input', 'change', 'blur'].forEach(t => inp.addEventListener(t, () => pintarFecha(inp)));
    vigilarPropiedad(inp, HTMLInputElement.prototype, 'value', () => pintarFecha(inp));
    vigilarPropiedad(inp, HTMLInputElement.prototype, 'valueAsDate', () => pintarFecha(inp));
    pintarFecha(inp);
  }

  function mejorar(raiz) {
    if (!raiz || !raiz.querySelectorAll) return;
    const todos = s => [...(raiz.matches && raiz.matches(s) ? [raiz] : []), ...raiz.querySelectorAll(s)];
    todos('.field select').forEach(mejorarSelect);
    todos('.field input[type="date"]').forEach(mejorarFecha);
  }
  function iniciar() {
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    mejorar(document.body);
    new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => n.nodeType === 1 && mejorar(n))))
      .observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
