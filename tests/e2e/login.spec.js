// Inicio de sesión y registro: los botones se encienden solo con datos válidos
const { test, expect, crearUsuario, WEB, CLAVE } = require('./ayudas');

const AMARILLO = 'rgb(245, 200, 0)';
const fondo = loc => loc.evaluate(b => getComputedStyle(b).backgroundColor);

test('«Entrar» se enciende solo con email y contraseña válidos, y entra', async ({ page, request }) => {
  const ana = await crearUsuario(request);
  await page.goto(`${WEB}/login.html`);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  const entrar = page.locator('#btnEntrar');

  await expect(entrar).toBeDisabled();
  expect(await fondo(entrar)).not.toBe(AMARILLO);

  await page.fill('#login-email', ana.email);
  await page.fill('#login-pass', 'corta');
  await expect(entrar).toBeDisabled();

  await page.fill('#login-pass', CLAVE);
  await expect(entrar).toBeEnabled();
  await page.mouse.move(0, 0);
  await expect.poll(() => fondo(entrar)).toBe(AMARILLO);   // se ve activo (fallo de la fase 3)

  await entrar.click();
  await expect(page).toHaveURL(/index\.html/);
  await expect(page.locator('.page.active')).toHaveId('page-grupos');
});

test('«Registrarse» empieza apagado', async ({ page }) => {
  await page.goto(`${WEB}/login.html`);
  await page.getByRole('button', { name: 'Regístrate' }).click();
  await expect(page.locator('#btnRegistrarse')).toBeDisabled();
  expect(await fondo(page.locator('#btnRegistrarse'))).not.toBe(AMARILLO);
});
