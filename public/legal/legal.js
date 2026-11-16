// public/legal/legal.js — Comportamiento común de las páginas legales
// · Tema claro/oscuro, el mismo que eligió la persona en la app.
// · Rellena los datos del responsable desde legal/datos.js (elementos con data-legal="…").
// · «Volver»: a la pantalla anterior; si se abrió directamente, al inicio.
(function () {
  var pref = 'auto';
  try { pref = localStorage.getItem('vp_tema') || 'auto'; } catch (_) {}
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;
  var claro = pref === 'claro' || (pref === 'auto' && mq && mq.matches);
  document.documentElement.setAttribute('data-theme', claro ? 'light' : 'dark');

  document.addEventListener('DOMContentLoaded', function () {
    var d = window.DATOS_LEGALES || {};
    document.querySelectorAll('[data-legal]').forEach(function (el) {
      var clave = el.getAttribute('data-legal'), valor = d[clave] || '';
      if (clave === 'email') { el.textContent = valor; if (el.tagName === 'A') el.href = 'mailto:' + valor; }
      else el.textContent = valor;
    });
    var volver = document.getElementById('volver');
    if (volver) volver.addEventListener('click', function (e) {
      e.preventDefault();
      if (history.length > 1 && document.referrer) history.back(); else location.href = 'login.html';
    });
  });
})();
