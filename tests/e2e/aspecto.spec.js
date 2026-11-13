// Detalles de aspecto que ya fallaron una vez
const { test, expect, crearUsuario, crearGrupo, entrar } = require('./ayudas');

test('tema claro: «Descargar» del visor del comprobante se ve (texto claro sobre negro)', async ({ page, request }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  const ana = await crearUsuario(request);
  await entrar(page, ana);
  await page.evaluate(() => { document.getElementById('visorTicketModal').style.display = 'flex'; });
  const color = await page.locator('#visorTicketModal .btn-outline').evaluate(b => getComputedStyle(b).color);
  expect(color).toBe('rgb(242, 242, 242)');
});

test('el selector de grupo queda centrado en la cabecera de Estadísticas', async ({ page, request }) => {
  const ana = await crearUsuario(request);
  await crearGrupo(request, ana);
  await entrar(page, ana);
  await page.click('[data-page="page-stats"]');
  await page.waitForTimeout(300);
  const [centroSel, centroCab] = await page.evaluate(() => {
    const b = document.getElementById('hbadge').getBoundingClientRect(), d = document.querySelector('.page.active .det-bar').getBoundingClientRect();
    return [b.top + b.height / 2, d.top + d.height / 2];
  });
  expect(Math.abs(centroSel - centroCab)).toBeLessThanOrEqual(1);
});

test('tras cerrar sesión, la carga muestra tantas tarjetas grises como grupos', async ({ page, request }) => {
  const ana = await crearUsuario(request);
  await crearGrupo(request, ana, { nombre: 'Uno' });
  await crearGrupo(request, ana, { nombre: 'Dos' });
  await entrar(page, ana);                                   // la app recuerda que son 2
  await page.evaluate(() => confirmLogout());
  await page.waitForURL(/login\.html/);
  // Servidor lento para ver la carga
  await page.route('**/api/v1/groups', async route => { await new Promise(r => setTimeout(r, 2500)); await route.fallback(); });
  await page.evaluate(t => localStorage.setItem('vp_token', t), ana.token);
  await page.goto('https://vakapay-app.vercel.app/index.html');
  await expect(page.locator('#groupsList .sk-card')).toHaveCount(2);
});
