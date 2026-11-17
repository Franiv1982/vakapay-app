// Ficha del amigo: los grupos marcados se guardan solo al pulsar «Guardar»
const { test, expect, api, crearUsuario, crearGrupo, entrar } = require('./ayudas');

test('ficha del amigo: sin «Eliminar»; los grupos se aplican al guardar, con la ficha bloqueada mientras', async ({ page, request }) => {
  const ana = await crearUsuario(request);
  await api(request, 'POST', '/friends', { name: 'Pepe' }, ana.token);
  const g = await crearGrupo(request, ana, { nombre: 'Viaje a Roma', miembros: [] });
  await entrar(page, ana);
  await page.click('[data-page="page-amigos"]');
  await page.evaluate(() => openFriendModal(friends.findIndex(f => f.name === 'Pepe')));
  const ficha = page.locator('#friendModal');
  await expect(ficha.getByRole('button', { name: 'Eliminar' })).toHaveCount(0);   // se borra desde la lista

  // Marcar el grupo no guarda nada todavía
  const peticiones = [];
  page.on('request', r => { if (r.method() !== 'GET' && r.url().includes(`/groups/${g.id}/members`)) peticiones.push(r.url()); });
  const chip = page.locator('#editFriendGroups .modal-chip', { hasText: 'Viaje a Roma' });
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(300);
  expect(peticiones).toEqual([]);
  await expect(page.locator('#toast')).not.toContainText('añadido');

  // Guardar: «Guardando…» con la ficha quieta; después un solo aviso con todo
  let soltar;
  const espera = new Promise(r => { soltar = r; });
  await page.route('**/friends/*', async (route) => { if (route.request().method() === 'PATCH') await espera; await route.fallback(); });
  await page.click('#btnGuardarAmigo');
  await expect(page.locator('#btnGuardarAmigo')).toHaveText('Guardando…');
  expect(await page.locator('#friendModal .modal-sheet').evaluate(e => e.inert)).toBe(true);
  await page.evaluate(() => closeFriendModal());
  await expect(ficha).toHaveClass(/open/);
  soltar();
  await expect(ficha).not.toHaveClass(/open/);
  await expect(page.locator('#toast')).toContainText('Amigo actualizado · añadido a «Viaje a Roma»');
  const { datos } = await api(request, 'GET', `/groups/${g.id}`, null, ana.token);
  expect(datos.members.map(m => m.display_name)).toContain('Pepe');
});
