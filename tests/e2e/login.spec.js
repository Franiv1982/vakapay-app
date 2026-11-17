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

test('si falla el inicio de sesión, el aviso dice el motivo real', async ({ page, request }) => {
  const ana = await crearUsuario(request);
  await page.goto(`${WEB}/login.html`);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  const titulo = page.locator('#login-error-titulo'), texto = page.locator('#login-error-texto');
  const intentar = async () => {
    await page.click('#btnEntrar');
    await expect(page.locator('#modal-login-error')).toBeVisible();
  };
  const cerrar = () => page.evaluate(() => cerrarModalLoginError());
  await page.fill('#login-email', ana.email);

  // Contraseña equivocada
  await page.fill('#login-pass', 'Otraclave1!');
  await intentar();
  await expect(titulo).toHaveText('Acceso denegado');
  await expect(texto).toContainText('incorrectos');
  await cerrar();

  await page.fill('#login-pass', CLAVE);
  // Sin conexión (o conexión bloqueada por el navegador)
  await page.route('**/auth/login', r => r.abort());
  await intentar();
  await expect(titulo).toHaveText('No se pudo conectar');
  await expect(texto).not.toContainText('incorrectos');
  await cerrar();

  // Error del servidor, aunque no responda con JSON
  await page.unroute('**/auth/login');
  await page.route('**/auth/login', r => r.fulfill({ status: 500, contentType: 'text/html', body: '<h1>Error</h1>' }));
  await intentar();
  await expect(titulo).toHaveText('Problema del servidor');
  await cerrar();

  // Y con todo bien, entra
  await page.unroute('**/auth/login');
  await page.click('#btnEntrar');
  await expect(page).toHaveURL(/index\.html/);
});
