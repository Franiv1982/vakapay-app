// public/no-traducir.js — Que el traductor del navegador no cambie los datos de la gente
// ================================================================
// Si alguien abre la web con Chrome en otro idioma y acepta «Traducir»,
// el traductor también cambiaba nombres de personas, grupos y gastos
// («Lea» → «Pasto», «Demo» → «Manifestación»). Aquí se marcan con
// translate="no" los sitios donde la app pinta lo que escribe la gente,
// también lo que se pinta después. Los textos propios de la app se siguen
// pudiendo traducir.
// Para algo nuevo que muestre datos escritos por la gente: añadir aquí su
// selector, o ponerle translate="no" directamente en el HTML.
// ================================================================
(function () {
  const DATOS = [
    // Grupo elegido y selector de grupos
    '.det-nombre', '#hbadge', '.gdrop-item', '#activitySubtitle',
    // Listas: grupos, gastos, amigos, saldos, deudas
    '.gc-name', '.gc-meta strong', '.fi-name', '.fi-info span', '.debt-txt em', '.av', '.av-s',
    // Participantes en chips (grupo, gasto, edición)
    '.chip', '.modal-chip',
    // Detalle del gasto
    '#gastoTitle', '#gastoMeta',
    // Chat: título, participantes, mensajes y avisos con nombres
    '#chatTitulo', '#chatMiembros', '.burb', '.chat-sis', '.msg .autor', '.cita',
    // Actividad (avisos con nombres de personas, grupos y gastos)
    '.act-txt',
    // Estadísticas
    '.bar-name', '.stat-gasto-nombre', '.stat-gasto-meta',
    // Resumen para compartir (se copia tal cual)
    '#resumenVista',
    // Cuenta
    '#profileDisplayName', '#readNombre', '#readEmail',
    // Listas de selección con nombres (¿Quién pagó?, Vincular a un grupo)
    '#expPayer', '#editPayer', '#friendGroupLink'
  ].join(',');

  const marcar = raiz => {
    if (!raiz || raiz.nodeType !== 1) return;
    if (raiz.matches(DATOS)) raiz.setAttribute('translate', 'no');
    raiz.querySelectorAll(DATOS).forEach(el => el.setAttribute('translate', 'no'));
  };
  function iniciar() {
    marcar(document.body);
    new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(marcar)))
      .observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
