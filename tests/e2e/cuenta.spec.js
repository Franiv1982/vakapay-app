// Cuenta → Mis datos: editar, cancelar, atrás y guardar
const { test, expect, crearUsuario, entrar } = require('./ayudas');

test('editar el perfil: cancelar deshace, atrás cancela, guardar guarda', async ({ page, request }) => {
  const ana = await crearUsuario(request);
  await entrar(page, ana);
  await page.click('[data-page="page-cuenta"]');
  const editar = page.locator('#btnEditProfile');

  await editar.click();
  await expect(editar).toBeHidden();                       // sin «Cancelar» duplicado arriba
  await expect(page.locator('#profNombre')).toBeFocused();
  await page.fill('#profNombre', 'Otro nombre');
  await page.locator('#profileEditMode').getByRole('button', { name: 'Cancelar' }).click();
  await expect(editar).toBeVisible();
  await editar.click();
  await expect(page.locator('#profNombre')).toHaveValue('Ana');   // lo escrito no se queda

  await page.fill('#profNombre', 'Otro nombre');
  await page.evaluate(() => manejarAtras());
  await expect(page.locator('#profileEditMode')).toBeHidden();
  await expect(page.locator('#readNombre')).toHaveText('Ana');

  await editar.click();
  await page.fill('#profNombre', 'Ana María');
  await page.locator('#profileEditMode').getByRole('button', { name: 'Guardar' }).click();
  await expect(page.locator('#readNombre')).toHaveText('Ana María');
});
