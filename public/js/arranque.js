// public/js/arranque.js — Arranque: comprobar sesión, pintar lo guardado y cargar del servidor.
// Va el último de su grupo: usa funciones de todos los archivos anteriores.
// (antes dentro de index.html; el orden de carga está en index.html)

// ═══ INIT ═════════════════════════════════════════════════════════════
(async function init(){
  try {
    // 1. Verificación robusta del Token
    const token = vakaData.getToken();
    if (!token) {
        location.replace('login.html');
        return;
    }

    // 1b. Pintar al instante lo último guardado en el móvil; si no hay nada, esqueletos
    groups   = vakaData.cache('groups')   || [];
    friends  = vakaData.cache('friends')  || [];
    activity = (vakaData.cache('activity') || []).map(a => ({ ...a, groupName: a.groupName || a.group_name || null }));
    profile  = vakaData.cache('profile')  || {};
    try {
      if (groups.length) updateBalances();
      loadProfile(); renderGroupsList(); renderFriends(); renderActivity(); updateStats();
    } catch (e) { console.warn('No se pudo pintar lo guardado:', e); }

    // 2. Validación de sesión con el backend
    //    - Si el servidor rechaza el token (sesión caducada o inválida) → se vuelve al login.
    //    - Si no hay conexión → se continúa con los datos guardados (modo sin conexión).
    let sesionRechazada = false;
    try {
        const response = await fetch(`${API_BASE}/api/v1/users/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.status === 401 || response.status === 403) sesionRechazada = true;
    } catch(err) {
        console.warn("Sin conexión con el servidor. Continuando con los datos guardados:", err);
    }
    if (sesionRechazada) {
        vakaData.setToken(null);
        localStorage.removeItem('token');
        location.replace('login.html');
        return;
    }
   
	// 3. CARGA DE DATOS
try {
    // Todo a la vez (antes iba de uno en uno y la espera se sumaba)
    const [remote, amigos, actividad, me] = await Promise.all([
      vakaData.getGroups(),
      vakaData.getFriends().catch(() => null),
      vakaData.getActivity().catch(() => null),
      fetch(`${API_BASE}/api/v1/users/me`, { headers: { 'Authorization': `Bearer ${vakaData.getToken()}` } })
        .then(r => r.json()).catch(() => null),
    ]);
    groups = Array.isArray(remote) ? remote : [];
    localStorage.setItem('vaka_groups', JSON.stringify(groups));

    friends = amigos || friends || [];
    activity = ((actividad || activity) || []).map(a => ({...a,
  groupName: a.groupName || a.group_name || null
}));
    try {
      if (me && !me.error) {
        profile = {
  id: me.id || null,
  nombre: me.nombre || me.name || '',
  email: me.email || '',
  tel: me.tel || '',
  bio: me.bio || '',
  pago_bizum: me.pago_bizum || '',
  pago_iban: me.pago_iban || '',
    avatar: resolverAvatar(me.avatar_url)
};
        await vakaData.saveProfile(profile);
      }
    } catch(_) {
      profile = await vakaData.getProfile() || {};
    }

} catch (err) {
    console.error("Error en carga:", err);
    vakaData.cargaFallida = true;
    groups = groups || [];
}

// Cálculo de seguridad
if (window.groups && groups.length > 0 && typeof updateBalances === 'function') {
    updateBalances();
}

    // 4. Renderizar
    cargandoInicial = false;
    renderGroupsList();
    renderActivity();

  } catch(err) {
    console.error('❌ Error en la inicialización:', err);
    // Si falla el login, intentamos cargar lo que haya en local
    cargandoInicial = false;
    groups = await vakaData.getGroups() || [];
    renderGroupsList();
  }
	// Render inicial
	cargandoInicial = false;
	if (window.temaActual) cambiarTema(temaActual());
	loadProfile();renderGroupsList();renderFriends();renderActivity();updateStats();populateFriendGroupSelect();
  // Detectar invite en URL o localStorage
    const urlParams = new URLSearchParams(window.location.search);
    const urlInvite = urlParams.get('invite');
    if (urlInvite) localStorage.setItem('vp_pending_invite', urlInvite);
    const pendingInvite = localStorage.getItem('vp_pending_invite');
    if (pendingInvite) await procesarInvitacion(pendingInvite);
	loadFromHash();
})();
