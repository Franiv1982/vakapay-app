// Grupos y gastos, usando la app como un usuario (escribiendo y pulsando)
const { test, expect, crearUsuario, crearGrupo, entrar } = require('./ayudas');

test('crear un grupo desde el formulario', async ({ page, request }) => {
  const ana = await crearUsuario(request);
  await entrar(page, ana);
  await page.getByRole('button', { name: /Crear nuevo grupo/ }).click();
  await page.fill('#groupName', 'Viaje a Lisboa');
  await page.fill('#dateStart', '2026-12-01');
  await page.fill('#dateEnd', '2026-12-05');
  await page.click('#btnCrearGrupo');
  await expect(page.locator('#toast')).toContainText('Viaje a Lisboa');
  await expect(page.locator('.group-card', { hasText: 'Viaje a Lisboa' })).toBeVisible();
  await expect(page.locator('#groupsCounter')).toHaveText('(1)');
});

test('registrar, ver, editar y borrar un gasto', async ({ page, request }) => {
  const ana = await crearUsuario(request);
  await crearGrupo(request, ana);
  await entrar(page, ana);
  await page.locator('.group-card').first().click();
  await expect(page.locator('.page.active')).toHaveId('page-detalle');

  // Las secciones del grupo no se ven apagadas
  expect(await page.locator('#sec3').evaluate(e => getComputedStyle(e).opacity)).toBe('1');

  // Registrar
  await page.click('#sec3');
  await page.fill('#expDesc', 'Pan');
  await page.fill('#expAmount', '4.50');
  await page.fill('#expDate', '2026-11-12');
  await page.click('#btnSelectAll');                        // «Todos»
  await expect(page.locator('#involvedChips .chip.sel')).toHaveCount(2);
  await page.click('#btnGuardarGasto');
  await expect(page.locator('#toast')).toContainText('Gasto registrado');

  // Ver el detalle y volver con «atrás»
  await page.click('#sec4');
  await page.locator('#gastosListSectionWrap [onclick*="openGasto"]', { hasText: 'Pan' }).click();
  await expect(page.locator('.page.active')).toHaveId('page-gasto');
  await page.goBack();
  await expect(page.locator('.page.active')).toHaveId('page-detalle');

  // Editar
  const i = await page.evaluate(() => groups[currentGroupIdx].expenses.findIndex(e => e.desc === 'Pan'));
  await page.evaluate(i => openEditModal(i), i);
  await page.fill('#editDesc', 'Pan y leche');
  await page.evaluate(() => saveEditExpense());
  await expect.poll(() => page.evaluate(() => groups[currentGroupIdx].expenses.map(e => e.desc))).toContain('Pan y leche');

  // Borrar
  const j = await page.evaluate(() => groups[currentGroupIdx].expenses.findIndex(e => e.desc === 'Pan y leche'));
  await page.evaluate(j => openDeleteExpenseModal(j), j);
  await page.locator('[onclick*="ejecutarBorradoGasto"]').click();
  await expect.poll(() => page.evaluate(() => groups[currentGroupIdx].expenses.map(e => e.desc))).not.toContain('Pan y leche');
});
