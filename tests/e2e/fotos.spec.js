// Fotos de perfil compartidas: las ven tus grupos y tus amigos, nadie más
const { test, expect, api, crearUsuario, crearGrupo, entrar } = require('./ayudas');

const MINI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
async function subirFoto(request, usuario) {
  const fs = require('fs'), path = require('path');
  return request.put(`${process.env.VP_API_PRUEBAS}/api/v1/users/me/avatar`, {
    headers: { Authorization: `Bearer ${usuario.token}` },
    multipart: { avatar: { name: 'foto.png', mimeType: 'image/png', buffer: fs.readFileSync(path.join(__dirname, '../../public/logo_vakapay.png')) }, mini: MINI },
  });
}

test('la foto de un participante con cuenta se ve en el grupo, en el chat y en amigos; un desconocido no puede pedirla', async ({ page, request }) => {
  const ana = await crearUsuario(request, 'Ana');
  const luis = await crearUsuario(request, 'Luis');
  const eva = await crearUsuario(request, 'Eva');
  await subirFoto(request, luis);
  const g = await crearGrupo(request, ana, { miembros: ['Luis'] });
  const { datos: enlace } = await api(request, 'POST', `/groups/${g.id}/share-link`, {}, ana.token);
  await api(request, 'POST', `/invite/${enlace.token}/join`, { reclamar: 'Luis' }, luis.token);
  await api(request, 'POST', `/groups/${g.id}/chat`, { texto: 'Hola' }, luis.token);
  await api(request, 'POST', '/friends', { name: 'Luis', email: luis.email }, ana.token);

  const { datos: yoLuis } = await api(request, 'GET', '/users/me', null, luis.token);
  expect((await api(request, 'GET', `/users/${yoLuis.id}/foto`, null, eva.token)).status).toBe(404);   // no comparten nada
  expect((await api(request, 'GET', `/users/${yoLuis.id}/foto`, null, ana.token)).status).toBe(200);

  await entrar(page, ana);
  await page.locator('.group-card').first().click();
  await page.evaluate(() => { toggleParticipantesSection(); toggleMemberList(); });
  await expect(page.locator('#memberChips .chip[data-name="Luis"] .av.con-foto img, .chip[data-name="Luis"] .av.con-foto img').first()).toBeVisible();
  await page.click('#sec7');
  await expect(page.locator('#chatLista .autor .av-chat.con-foto img').first()).toBeVisible();
  await page.evaluate(() => cerrarChat());
  await page.click('[data-page="page-amigos"]');
  await expect(page.locator('.friend-item', { hasText: 'Luis' }).locator('.fi-av img')).toBeVisible();
});

test('quitar tu foto: desaparece el aviso y deja de enviarse a los demás', async ({ page, request }) => {
  const luis = await crearUsuario(request, 'Luis');
  await subirFoto(request, luis);
  await entrar(page, luis);
  await page.click('[data-page="page-cuenta"]');
  await expect(page.locator('#avisoFotoPerfil')).toBeVisible();
  await page.click('#btnQuitarFoto');
  await expect(page.locator('#avisoFotoPerfil')).toBeHidden();
  await expect(page.locator('#avatarDisplay')).toHaveClass(/avatar-placeholder/);
  const { datos } = await api(request, 'GET', '/users/me', null, luis.token);
  expect(datos.avatar_url).toBeNull();
  expect(datos.tiene_mini).toBe(false);
});
