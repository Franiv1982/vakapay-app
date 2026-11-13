// Chat del grupo y Estadísticas interactivas
const { test, expect, crearUsuario, crearGrupo, entrar } = require('./ayudas');

test('enviar un mensaje al chat', async ({ page, request }) => {
  const ana = await crearUsuario(request);
  await crearGrupo(request, ana);
  await entrar(page, ana);
  await page.locator('.group-card').first().click();
  await page.click('#sec7');
  await page.fill('#chatTexto', 'Hola grupo');
  await page.click('#chatEnviar');
  await expect(page.locator('#chatLista .msg.yo .burb').last()).toContainText('Hola grupo');
});

test('escritorio: el chat sigue al grupo elegido y se cierra al ir a Mis grupos', async ({ page, request }) => {
  await page.setViewportSize({ width: 1360, height: 900 });
  const ana = await crearUsuario(request);
  await crearGrupo(request, ana, { nombre: 'Primero' });
  await crearGrupo(request, ana, { nombre: 'Segundo' });
  await entrar(page, ana);
  await page.locator('.group-card', { hasText: 'Primero' }).click();
  await page.click('#sec7');
  await expect(page.locator('#chatTitulo')).toContainText('Primero');
  const i = await page.evaluate(() => groups.findIndex(g => g.name === 'Segundo'));
  await page.evaluate(i => switchGroupFromDropdown(i), i);
  await expect(page.locator('#chatTitulo')).toContainText('Segundo');
  await page.click('[data-page="page-grupos"]');
  await expect.poll(() => page.evaluate(() => chatAbierto())).toBe(false);
});

test('Estadísticas: tocar una categoría muestra sus gastos y se vuelve a ella desde el gasto', async ({ page, request }) => {
  const ana = await crearUsuario(request);
  await crearGrupo(request, ana, { gasto: { desc: 'Cena', importe: 30, cat: 'food' } });
  await entrar(page, ana);
  await page.locator('.group-card').first().click();
  await page.click('[data-page="page-stats"]');
  await page.locator('#catLegend .stat-sel', { hasText: 'Comida' }).click();
  await expect(page.locator('.stat-detalle')).toContainText('Cena');
  await page.locator('.stat-gasto', { hasText: 'Cena' }).click();
  await expect(page.locator('.page.active')).toHaveId('page-gasto');
  await page.evaluate(() => manejarAtras());
  await expect(page.locator('.page.active')).toHaveId('page-stats');
  await expect(page.locator('.stat-detalle')).toBeVisible();
});
