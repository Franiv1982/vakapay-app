// Seguir con Google (#69). En pruebas, la «credencial» es prueba:<datos en base64>
const { test, expect, api, crearUsuario, WEB } = require('./ayudas');

const cred = (datos) => 'prueba:' + Buffer.from(JSON.stringify({ email_verified: true, ...datos })).toString('base64');
const aleatorio = () => Math.random().toString(36).slice(2, 8);

test('cuenta existente con el mismo email: entra y queda vinculada a Google', async ({ request }) => {
  const ana = await crearUsuario(request, 'Ana');
  const r = await api(request, 'POST', '/auth/google', { credential: cred({ sub: 'g-' + aleatorio(), email: ana.email.toUpperCase(), name: 'Ana G' }) });
  expect(r.status).toBe(200);
  expect(r.datos.token).toBeTruthy();
  expect(r.datos.user.email).toBe(ana.email);
  expect(r.datos.user.password_hash).toBeUndefined();
});

test('primera vez: pide teléfono y aceptar las condiciones; después entra directo', async ({ request }) => {
  const sub = 'g-' + aleatorio(), email = `nuevo.${aleatorio()}@gmail.com`;
  const r = await api(request, 'POST', '/auth/google', { credential: cred({ sub, email, name: 'Marta López' }) });
  expect(r.datos).toMatchObject({ registro_pendiente: true, nombre: 'Marta López', email });

  const base = { billete: r.datos.billete, nombre: 'Marta López', tel: '+34 611 223 344' };
  expect((await api(request, 'POST', '/auth/google/registro', base)).status).toBe(400);                         // sin aceptar
  expect((await api(request, 'POST', '/auth/google/registro', { ...base, tel: '123', acepta: true })).status).toBe(400);
  expect((await api(request, 'POST', '/auth/google/registro', { ...base, billete: 'falso', acepta: true })).status).toBe(400);
  const ok = await api(request, 'POST', '/auth/google/registro', { ...base, acepta: true });
  expect(ok.status).toBe(201);
  expect(ok.datos.token).toBeTruthy();

  const otra = await api(request, 'POST', '/auth/google', { credential: cred({ sub, email, name: 'Marta López' }) });
  expect(otra.datos.token).toBeTruthy();
  expect(otra.datos.registro_pendiente).toBeUndefined();
});

test('email no verificado por Google: no entra', async ({ request }) => {
  const r = await api(request, 'POST', '/auth/google', { credential: cred({ sub: 'g-' + aleatorio(), email: `x.${aleatorio()}@gmail.com`, email_verified: false }) });
  expect(r.status).toBe(400);
});

test('web: «Completa tu registro» con teléfono y casilla, y entra en la app', async ({ page }) => {
  await page.route('**/auth/google-config', r => r.fulfill({ json: { disponible: true, client_id: 'prueba.apps.googleusercontent.com' } }));
  await page.goto(`${WEB}/login.html`);
  await expect(page.locator('#page-login-inicio')).toContainText('Al continuar con Google aceptas');
  const email = `web.${aleatorio()}@gmail.com`;
  await page.evaluate(c => enviarCredencialGoogle(c), cred({ sub: 'g-' + aleatorio(), email, name: 'Luisa Pérez' }));
  await expect(page.locator('#page-registro-google')).toHaveClass(/active/);
  await expect(page.locator('#g-email')).toHaveText(email);
  await expect(page.locator('#g-nombre')).toHaveValue('Luisa Pérez');
  const crear = page.locator('#btnRegistroGoogle');
  await page.fill('#g-tel', '+34 622 334 455');
  await expect(crear).toBeDisabled();                     // falta aceptar
  await page.check('#g-acepta');
  await expect(crear).toBeEnabled();
  await crear.click();
  await expect(page).toHaveURL(/index\.html/);
});
