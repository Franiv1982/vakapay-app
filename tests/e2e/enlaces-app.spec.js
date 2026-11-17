// App Links (#70): el enlace de invitación abre la APK y se procesa la invitación
const { test, expect, api, crearUsuario, crearGrupo, entrar, WEB } = require('./ayudas');

// Hace creer a la página que es la APK; launchUrl = enlace con el que «se abrió»
const comoApk = (page, launchUrl = null) => page.addInitScript(u => {
  window.__oyentes = {};
  window.Capacitor = {
    isNativePlatform: () => true,
    Plugins: { App: {
      getInfo: async () => ({ build: '3', version: '1.2' }),
      getLaunchUrl: async () => (u ? { url: u } : undefined),
      addListener: (ev, fn) => { window.__oyentes[ev] = fn; return { remove() {} }; },
      exitApp() {},
    } },
  };
}, launchUrl);

async function grupoConEnlace(request) {
  const ana = await crearUsuario(request);
  const g = await crearGrupo(request, ana, { nombre: 'Viaje a Roma' });
  const { datos } = await api(request, 'POST', `/groups/${g.id}/share-link`, {}, ana.token);
  return `${WEB}/login.html?invite=${datos.token}`;
}

test('el servidor publica assetlinks.json con el paquete y la huella de la APK', async ({ request }) => {
  const r = await request.get(`${process.env.VP_API_PRUEBAS}/.well-known/assetlinks.json`);
  expect(r.ok()).toBeTruthy();
  expect(r.headers()['content-type']).toContain('application/json');
  const [d] = await r.json();
  expect(d.target.package_name).toBe('com.vakapay.app');
  expect(d.target.sha256_cert_fingerprints[0]).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
});

test('APK abierta desde el enlace (con sesión): muestra la invitación al grupo', async ({ page, request }) => {
  const enlace = await grupoConEnlace(request);
  const marta = await crearUsuario(request, 'Marta');
  await comoApk(page, enlace);
  await entrar(page, marta);
  await expect(page.locator('#quien-titulo')).toHaveText('Te uniste a "Viaje a Roma"');
});

test('APK ya abierta: tocar el enlace procesa la invitación', async ({ page, request }) => {
  const enlace = await grupoConEnlace(request);
  const marta = await crearUsuario(request, 'Marta');
  await comoApk(page);
  await entrar(page, marta);
  await page.evaluate(u => window.__oyentes.appUrlOpen({ url: u }), enlace);
  await expect(page.locator('#quien-titulo')).toHaveText('Te uniste a "Viaje a Roma"');
});

test('APK sin sesión: la invitación queda pendiente para después de entrar', async ({ page, request }) => {
  const enlace = await grupoConEnlace(request);
  await comoApk(page, enlace);
  await page.goto(`${WEB}/login.html`);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('vp_pending_invite'))).toBe(new URL(enlace).searchParams.get('invite'));
});
