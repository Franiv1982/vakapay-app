// public/js/sesion.js — Cuenta bloqueada o eliminada: si el servidor lo dice, aviso y cierre de sesión
// (antes dentro de index.html; el orden de carga está en index.html)

// ═══ CUENTA BLOQUEADA O ELIMINADA ═════════════════════════════════════
// Cualquier respuesta del servidor que diga que la cuenta está bloqueada (403) o
// que ya no existe (401) muestra un aviso y cierra la sesión.
(function () {
  const fetchOriginal = window.fetch.bind(window);
  let avisado = false;
  function salir(titulo, texto) {
    if (avisado) return; avisado = true;
    try { ['vp_token','vp_groups','vp_friends','vp_activity','vp_profile','vaka_groups','vaka_friends'].forEach(k => localStorage.removeItem(k)); } catch (_) {}
    const caja = document.createElement('div');
    caja.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.88);display:flex;align-items:center;justify-content:center;padding:24px;font-family:var(--font)';
    caja.innerHTML = `<div style="background:var(--dark3);border:1px solid var(--line);border-radius:var(--r-xl);padding:26px 22px;max-width:340px;width:100%;text-align:center;">
        <div style="width:56px;height:56px;margin:0 auto 14px;border-radius:50%;background:rgba(255,77,77,.12);display:flex;align-items:center;justify-content:center;">
          <svg style="color:var(--danger)" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>
        <div style="color:var(--text);font-size:var(--fs-lg);font-weight:800;margin-bottom:10px;"></div>
        <p style="color:var(--text);opacity:.8;font-size:var(--fs-base);line-height:1.45;margin-bottom:22px;"></p>
        <button class="btn btn-gold" style="width:100%"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Entendido</button></div>`;
    caja.querySelector('div > div:nth-child(2)').textContent = titulo;
    caja.querySelector('p').textContent = texto;
    caja.querySelector('button').onclick = () => { location.replace('login.html'); };
    (document.body || document.documentElement).appendChild(caja);
  }
  window.fetch = async function (...args) {
    const res = await fetchOriginal(...args);
    const url = String((args[0] && args[0].url) || args[0] || '');
    if ((res.status === 403 || res.status === 401) && url.includes('/api/v1/') && !url.includes('/auth/login')) {
      res.clone().json().then(d => {
        if (d && d.cuenta_bloqueada) salir('Cuenta desactivada', d.error);
        else if (d && d.sesion_invalida && res.status === 401 && /ya no existe/.test(d.error || '')) salir('Cuenta eliminada', 'Esta cuenta ya no existe. Inicia sesión con otra cuenta o regístrate de nuevo.');
      }).catch(() => {});
    }
    return res;
  };
})();
