// Versión mínima de la APK y modo mantenimiento (#73)
const { test, expect, WEB } = require('./ayudas');

const API_ESTADO = '**/api/v1/estado';
const responder = (page, datos) => page.route(API_ESTADO, r => r.fulfill({ json: { version_minima: 0, url_descarga: null, mantenimiento: null, ...datos } }));

// Hace creer a la página que es la APK con ese versionCode
const comoApk = (page, build) => page.addInitScript(b => {
  window.Capacitor = {
    isNativePlatform: () => true,
    Plugins: { App: { getInfo: async () => ({ build: b, version: '1.0' }), addListener: () => ({ remove() {} }), exitApp() {} } },
  };
}, String(build));

test('el servidor responde sin aviso si no hay nada configurado en Vercel', async ({ request }) => {
  const r = await request.get(`${process.env.VP_API_PRUEBAS}/api/v1/estado`);
  expect(r.ok()).toBeTruthy();
  expect(await r.json()).toEqual({ version_minima: 0, url_descarga: null, mantenimiento: null });
});

test('mantenimiento: tapa la web con el mensaje y «Reintentar» la devuelve cuando acaba', async ({ page }) => {
  let estado = { mantenimiento: 'Volvemos en 10 minutos.' };
  await page.route(API_ESTADO, r => r.fulfill({ json: { version_minima: 0, url_descarga: null, mantenimiento: null, ...estado } }));
  await page.goto(`${WEB}/login.html`);
  const aviso = page.getByRole('alertdialog', { name: 'Estamos en mantenimiento' });
  await expect(aviso).toBeVisible();
  await expect(aviso).toContainText('Volvemos en 10 minutos.');
  await expect(page.getByRole('button', { name: 'Reintentar' })).toBeFocused();

  estado = {};   // se acabó el mantenimiento
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(aviso).toHaveCount(0);
  await expect(page.locator('#page-login-inicio')).toBeVisible();
});

test('APK antigua: pide actualizar con el enlace de descarga', async ({ page }) => {
  await comoApk(page, 1);
  await responder(page, { version_minima: 2, url_descarga: 'https://drive.google.com/file/d/abc/view' });
  await page.goto(`${WEB}/login.html`);
  await expect(page.getByRole('alertdialog', { name: 'Hay una versión nueva' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Descargar' })).toHaveAttribute('href', 'https://drive.google.com/file/d/abc/view');
});

test('APK antigua sin enlace configurado: dice a quién pedirla', async ({ page }) => {
  await comoApk(page, 1);
  await responder(page, { version_minima: 2 });
  await page.goto(`${WEB}/login.html`);
  await expect(page.getByRole('alertdialog')).toContainText('Pide la versión nueva a quien te pasó la app.');
});

test('APK al día y web: sin aviso de versión', async ({ page }) => {
  await responder(page, { version_minima: 2, url_descarga: 'https://drive.google.com/x' });
  await page.goto(`${WEB}/login.html`);   // web: nunca se le pide actualizar
  await page.waitForTimeout(500);
  await expect(page.locator('#avisoApp')).toHaveCount(0);

  await comoApk(page, 2);
  await page.goto(`${WEB}/login.html`);
  await page.waitForTimeout(500);
  await expect(page.locator('#avisoApp')).toHaveCount(0);
});
