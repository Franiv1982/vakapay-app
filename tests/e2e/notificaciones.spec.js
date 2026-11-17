// Notificaciones push (#68): qué avisos se envían, a quién, y las preferencias de Cuenta
const { test, expect, api, crearUsuario, crearGrupo, entrar } = require('./ayudas');

const API = () => process.env.VP_API_PRUEBAS;
const idDe = async (request, u) => (await api(request, 'GET', '/users/me', null, u.token)).datos.id;
const movil = (request, u) => api(request, 'POST', '/users/me/dispositivos', { token: `movil-de-${u.email.replace(/[^\w.-]/g, "_")}-0123456789` }, u.token);
// Avisos que el servidor «habría enviado» a ese usuario (en pruebas no se habla con Firebase)
async function avisosDe(request, userId) {
  const r = await request.get(`${API()}/__pruebas/push`);
  return (await r.json()).filter(m => m.user_id === userId);
}

// Ana y Luis, los dos con cuenta y con el móvil registrado, en el mismo grupo
async function grupoDeDos(request) {
  const ana = await crearUsuario(request, 'Ana');
  const luis = await crearUsuario(request, 'Luis');
  const g = await crearGrupo(request, ana, { miembros: ['Luis'] });
  const { datos: enlace } = await api(request, 'POST', `/groups/${g.id}/share-link`, {}, ana.token);
  await api(request, 'POST', `/invite/${enlace.token}/join`, { reclamar: 'Luis' }, luis.token);
  await movil(request, ana); await movil(request, luis);
  return { ana, luis, g, idAna: await idDe(request, ana), idLuis: await idDe(request, luis) };
}
const gasto = (g, quien, extra) => ({ description: 'Cena', amount: 30, amount_base: 30, currency: 'EUR', category: 'food',
  payer_name: quien, expense_date: '2026-11-10', involved: ['Ana', 'Luis'], ...extra });

test('nuevo gasto y chat: avisan al resto del grupo, no a quien lo hace', async ({ request }) => {
  const { ana, g, idAna, idLuis } = await grupoDeDos(request);
  await api(request, 'POST', `/groups/${g.id}/expenses`, gasto(g, 'Ana'), ana.token);
  await api(request, 'POST', `/groups/${g.id}/chat`, { texto: 'Ya pagué la cena' }, ana.token);

  await expect.poll(async () => (await avisosDe(request, idLuis)).length).toBe(2);
  const lista = await avisosDe(request, idLuis);
  const deGasto = lista.find(m => m.data.tipo === 'gastos'), deChat = lista.find(m => m.data.tipo === 'chat');
  expect(deGasto.notification.title).toBe('Nuevo gasto en «Piso compartido»');
  expect(deGasto.notification.body).toContain('Ana añadió «Cena»');
  expect(deGasto.data).toMatchObject({ tipo: 'gastos', grupo_id: String(g.id), destino: 'grupo' });
  expect(deChat.notification.body).toBe('Ana: Ya pagué la cena');
  expect(deChat.android.notification).toMatchObject({ channelId: 'chat', tag: `chat-${g.id}` });
  expect(await avisosDe(request, idAna)).toEqual([]);
});

test('pagos: confirmar avisa a quien cobra; rechazar y confirmar con otro importe avisan a quien pagó', async ({ request }) => {
  const { ana, luis, g, idAna, idLuis } = await grupoDeDos(request);
  await api(request, 'POST', `/groups/${g.id}/expenses`, gasto(g, 'Luis', { amount: 40, amount_base: 40 }), luis.token);   // Ana debe 20 a Luis

  const pago = () => api(request, 'POST', `/groups/${g.id}/expenses`, { ...gasto(g, 'Ana', { amount: 20, amount_base: 20, involved: ['Luis'] }), description: 'Pago', es_pago: true }, ana.token);
  const p1 = (await pago()).datos;
  await expect.poll(async () => (await avisosDe(request, idLuis)).filter(m => m.data.tipo === 'pagos').length).toBe(1);
  const aviso = (await avisosDe(request, idLuis)).find(m => m.data.tipo === 'pagos');
  expect(aviso.notification.title).toBe('Confirma un pago');
  expect(aviso.notification.body).toContain('Ana te pagó');
  expect(aviso.data.destino).toBe('pagos');

  // Luis lo rechaza → aviso a Ana
  await api(request, 'DELETE', `/groups/${g.id}/expenses/${p1.id}`, null, luis.token);
  await expect.poll(async () => (await avisosDe(request, idAna)).filter(m => m.notification.title === 'Pago rechazado').length).toBe(1);

  // Nuevo pago; Luis confirma solo 15 → aviso a Ana
  const p2 = (await pago()).datos;
  await api(request, 'POST', `/groups/${g.id}/expenses/${p2.id}/confirmar`, { importe: 15 }, luis.token);
  await expect.poll(async () => (await avisosDe(request, idAna)).filter(m => m.notification.title === 'Pago confirmado con otro importe').length).toBe(1);
});

test('preferencias: desactivar el chat deja de enviar sus avisos', async ({ request }) => {
  const { ana, luis, g, idLuis } = await grupoDeDos(request);
  expect((await api(request, 'GET', '/users/me/avisos', null, luis.token)).datos).toEqual({ pagos: true, rechazos: true, gastos: true, chat: true });
  const r = await api(request, 'PUT', '/users/me/avisos', { chat: false }, luis.token);
  expect(r.datos.chat).toBe(false);
  await api(request, 'POST', `/groups/${g.id}/chat`, { texto: 'Hola' }, ana.token);
  await api(request, 'POST', `/groups/${g.id}/expenses`, gasto(g, 'Ana'), ana.token);
  await expect.poll(async () => (await avisosDe(request, idLuis)).length).toBe(1);
  expect((await avisosDe(request, idLuis))[0].data.tipo).toBe('gastos');
});

test('cerrar sesión quita el móvil: ya no le llegan avisos', async ({ request }) => {
  const { ana, luis, g, idLuis } = await grupoDeDos(request);
  const token = `movil-de-${luis.email.replace(/[^\w.-]/g, "_")}-0123456789`;
  await api(request, 'DELETE', `/users/me/dispositivos/${encodeURIComponent(token)}`, null, luis.token);
  await api(request, 'POST', `/groups/${g.id}/chat`, { texto: 'Hola' }, ana.token);
  await new Promise(r => setTimeout(r, 500));
  expect(await avisosDe(request, idLuis)).toEqual([]);
});

test('APK: registra el móvil, Cuenta muestra las preferencias y tocar un aviso abre el chat del grupo', async ({ page, request }) => {
  const { luis, g } = await grupoDeDos(request);
  await page.addInitScript(() => {
    window.__push = {};
    window.Capacitor = {
      isNativePlatform: () => true,
      Plugins: {
        App: { getInfo: async () => ({ build: '3', version: '1.2' }), addListener: () => ({}), exitApp() {} },
        PushNotifications: {
          addListener: (ev, fn) => { window.__push[ev] = fn; return { remove() {} }; },
          createChannel: async () => {},
          checkPermissions: async () => ({ receive: 'prompt' }),
          requestPermissions: async () => ({ receive: 'granted' }),
          register: async () => setTimeout(() => window.__push.registration({ value: 'movil-de-prueba-en-la-apk-123456' }), 50),
        },
      },
    };
  });
  await entrar(page, luis);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('vp_push_token'))).toBe('movil-de-prueba-en-la-apk-123456');

  // Cuenta → Notificaciones: desactivar «Nuevos gastos» se guarda en la cuenta
  await page.click('[data-page="page-cuenta"]');
  const gastos = page.locator('input[data-aviso="gastos"]');
  await expect(gastos).toBeChecked();
  await gastos.click();
  await expect.poll(async () => (await api(request, 'GET', '/users/me/avisos', null, luis.token)).datos.gastos).toBe(false);

  // Tocar un aviso del chat abre el chat de ese grupo
  await page.evaluate(id => window.__push.pushNotificationActionPerformed({ notification: { data: { tipo: 'chat', grupo_id: String(id), destino: 'chat' } } }), g.id);
  await expect(page.locator('#page-chat, .page.active').first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => typeof chatAbierto === 'function' && chatAbierto())).toBe(true);
});
