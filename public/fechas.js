// public/fechas.js — Pista «dd/mm/aaaa» en los campos de fecha vacíos
// ================================================================
// En el móvil (APK y Chrome de Android) un campo de fecha vacío se ve en
// blanco, sin pista de qué poner; en el ordenador sí sale «dd/mm/aaaa».
// Esto pone la misma pista en todos, con el color de los demás textos de
// ejemplo. Al elegir una fecha (o al escribir en el ordenador) desaparece.
// También cuando el código rellena o vacía el campo (.value = …).
// ================================================================
(function () {
  const PISTA = 'dd/mm/aaaa';
  const css = `
  .fecha-caja{position:relative;display:block;width:100%;min-width:0}
  .fecha-caja input[type="date"]{width:100%}
  .fecha-pista{position:absolute;left:11px;top:50%;transform:translateY(-50%);pointer-events:none;color:var(--muted);
    font-family:var(--font);font-size:var(--fs-base);font-weight:400;display:none;white-space:nowrap}
  .fecha-caja.vacia .fecha-pista{display:block}
  .fecha-caja.vacia input[type="date"]::-webkit-datetime-edit{color:transparent}
  /* Solo se oculta la pista mientras se escribe la fecha con el teclado (ordenador);
     abrir el calendario y cancelar deja el campo con foco, y antes la pista desaparecía */
  .fecha-caja.vacia.escribiendo input[type="date"]::-webkit-datetime-edit{color:inherit}
  .fecha-caja.vacia.escribiendo .fecha-pista{display:none}
  `;
  let nId = 0;

  // Si el código cambia .value, la pista se actualiza sola
  function vigilar(el, prop, alCambiar) {
    const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, prop);
    if (!d || !d.set) return;
    Object.defineProperty(el, prop, {
      configurable: true, enumerable: d.enumerable,
      get() { return d.get.call(this); },
      set(v) { d.set.call(this, v); alCambiar(); }
    });
  }
  const pintar = inp => inp._fechaCaja.classList.toggle('vacia', !inp.value);

  function mejorar(inp) {
    if (inp._fechaCaja || !inp.closest('.field')) return;
    // El rótulo queda enlazado al campo aunque deje de estar justo al lado
    const campo = inp.closest('.field');
    const lb = campo && [...campo.children].find(e => e.tagName === 'LABEL');
    if (lb && !lb.htmlFor) { if (!inp.id) inp.id = 'campo-fecha-' + (++nId); lb.htmlFor = inp.id; }
    const caja = document.createElement('span');
    caja.className = 'fecha-caja';
    inp.parentNode.insertBefore(caja, inp);
    caja.appendChild(inp);
    const pista = document.createElement('span');
    pista.className = 'fecha-pista'; pista.setAttribute('aria-hidden', 'true'); pista.textContent = PISTA;
    caja.appendChild(pista);
    inp._fechaCaja = caja;
    ['input', 'change', 'blur'].forEach(t => inp.addEventListener(t, () => pintar(inp)));
    // Teclas que escriben en el campo (números, flechas, borrar): se muestra lo que se escribe
    inp.addEventListener('keydown', e => {
      if (/^[0-9]$|^Arrow|^Backspace$|^Delete$/.test(e.key)) caja.classList.add('escribiendo');
    });
    inp.addEventListener('blur', () => caja.classList.remove('escribiendo'));
    vigilar(inp, 'value', () => pintar(inp));
    vigilar(inp, 'valueAsDate', () => pintar(inp));
    pintar(inp);
  }
  function revisar(raiz) {
    if (!raiz || !raiz.querySelectorAll) return;
    const sel = '.field input[type="date"]';
    [...(raiz.matches && raiz.matches(sel) ? [raiz] : []), ...raiz.querySelectorAll(sel)].forEach(mejorar);
  }
  function iniciar() {
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    revisar(document.body);
    new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => n.nodeType === 1 && revisar(n))))
      .observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
