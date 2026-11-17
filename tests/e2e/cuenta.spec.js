// Cuenta: filas que abren su ventana (Mis datos, Datos de cobro, Apariencia) y accesos a Grupos y Amigos
const { test, expect, crearUsuario, crearGrupo, entrar } = require('./ayudas');

test('Mis datos: cancelar deshace, atrás cancela, guardar guarda (con la ventana bloqueada mientras)', async ({ page, request }) => {
  const ana = await crearUsuario(request);
  await entrar(page, ana);
  await page.click('[data-page="page-cuenta"]');
  const fila = page.locator('#btnMisDatos'), ventana = page.locator('#modalMisDatos');

  await fila.click();
  await expect(ventana).toHaveClass(/open/);
  await expect(page.locator('#profNombre')).toBeFocused();
  await page.fill('#profNombre', 'Otro nombre');
  await ventana.getByRole('button', { name: 'Cancelar' }).click();
  await expect(ventana).not.toHaveClass(/open/);
  await fila.click();
  await expect(page.locator('#profNombre')).toHaveValue('Ana');   // lo escrito no se queda

  await page.fill('#profNombre', 'Otro nombre');
  await page.evaluate(() => manejarAtras());
  await expect(ventana).not.toHaveClass(/open/);
  await expect(page.locator('#resumenMisDatos')).toContainText('Ana');

  await fila.click();
  await page.fill('#profNombre', 'Ana María');
  let soltar;
  const espera = new Promise(r => { soltar = r; });
  await page.route('**/users/me', async (route) => { if (route.request().method() === 'PATCH') await espera; await route.fallback(); });
  await ventana.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.locator('#btnGuardarMisDatos')).toHaveText('Guardando…');
  expect(await page.locator('#modalMisDatos .modal-sheet').evaluate(e => e.inert)).toBe(true);
  soltar();
  await expect(ventana).not.toHaveClass(/open/);
  await expect(page.locator('#resumenMisDatos')).toContainText('Ana María');
});

test('Datos de cobro y Apariencia en su ventana; Grupos y Amigos llevan a su sección', async ({ page, request }) => {
  const ana = await crearUsuario(request);
  await crearGrupo(request, ana);
  await entrar(page, ana);
  await page.click('[data-page="page-cuenta"]');

  await expect(page.locator('#readCobro')).toHaveText('Sin configurar');
  await page.click('#btnCobros');
  await page.fill('#profBizum', '600 111 222');
  await page.locator('#modalCobros').getByRole('button', { name: 'Guardar' }).click();
  await expect(page.locator('#readCobro')).toHaveText('Bizum');

  await page.click('#btnApariencia');
  await page.locator('#modalApariencia [data-tema-opcion="claro"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('#modalApariencia [data-tema-opcion="claro"]')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await expect(page.locator('#resumenTema')).toHaveText('Claro');

  await expect(page.locator('#statGroups')).toHaveText('1');
  await page.getByRole('button', { name: '1 Grupos' }).click();
  await expect(page.locator('.page.active')).toHaveId('page-grupos');
  await page.click('[data-page="page-cuenta"]');
  await page.getByRole('button', { name: /Amigos$/ }).click();
  await expect(page.locator('.page.active')).toHaveId('page-amigos');
});
