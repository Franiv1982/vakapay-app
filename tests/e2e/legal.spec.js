// Política de privacidad y Términos: datos del responsable y enlaces desde la app
const { test, expect, crearUsuario, entrar, WEB } = require('./ayudas');

test('las páginas legales muestran el responsable y el contacto de legal/datos.js', async ({ page }) => {
  for (const pagina of ['privacidad.html', 'terminos.html']) {
    await page.goto(`${WEB}/${pagina}`);
    const responsable = await page.evaluate(() => window.DATOS_LEGALES.responsable);
    await expect(page.locator('[data-legal="responsable"]').first()).toHaveText(responsable);
    await expect(page.locator('a[data-legal="email"]').first()).toHaveAttribute('href', /^mailto:.+@.+/);
    await expect(page.locator('[data-legal="actualizado"]')).not.toBeEmpty();
  }
});

test('enlaces: en el registro y al pie del inicio; desde Cuenta se vuelve a Cuenta', async ({ page, request }) => {
  await page.goto(`${WEB}/login.html`);
  await expect(page.locator('#page-login-inicio .enlaces-legales a[href="privacidad.html"]')).toBeVisible();
  await page.getByRole('button', { name: 'Regístrate' }).click();
  await expect(page.locator('.aviso-legal a[href="terminos.html"]')).toBeVisible();

  const ana = await crearUsuario(request);
  await entrar(page, ana);
  await page.click('[data-page="page-cuenta"]');
  await page.locator('.enlaces-legales a[href="privacidad.html"]').click();
  await expect(page).toHaveURL(/privacidad\.html/);
  await page.click('#volver');
  await expect(page).toHaveURL(/index\.html/);
  await expect(page.locator('.page.active')).toHaveId('page-cuenta');
});
