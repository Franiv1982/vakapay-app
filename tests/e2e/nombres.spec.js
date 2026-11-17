// Nombres en los grupos: quien tiene cuenta aparece con el (primer) nombre de su cuenta
const { test, expect, api, crearUsuario, crearGrupo } = require('./ayudas');

const miembros = async (request, g, u) => (await api(request, 'GET', `/groups/${g.id}`, null, u.token)).datos.members.map(m => m.display_name).sort();
async function unirse(request, ana, g, quien, reclamar) {
  const { datos: enlace } = await api(request, 'POST', `/groups/${g.id}/share-link`, {}, ana.token);
  return api(request, 'POST', `/invite/${enlace.token}/join`, reclamar ? { reclamar } : {}, quien.token);
}

test('al unirse con su cuenta, el participante pasa a llamarse como su cuenta (también en sus gastos)', async ({ request }) => {
  const ana = await crearUsuario(request, 'Ana');
  const pepe = await crearUsuario(request, 'Pepe García');
  const g = await crearGrupo(request, ana, { miembros: ['Pepe trabajo'], gasto: { desc: 'Cena', importe: 30, pagador: 'Pepe trabajo' } });
  const r = await unirse(request, ana, g, pepe, 'Pepe trabajo');
  expect(r.datos.display_name).toBe('Pepe');
  expect(await miembros(request, g, ana)).toEqual(['Ana', 'Pepe']);
  const { datos } = await api(request, 'GET', `/groups/${g.id}`, null, ana.token);
  expect(datos.expenses[0].payer_name).toBe('Pepe');
  const act = JSON.stringify((await api(request, 'GET', '/activity', null, ana.token)).datos);
  expect(act).toContain('Pepe trabajo se unió al grupo');
  expect(act).toContain('como Pepe');

  // Nadie más puede cambiarle el nombre
  const ren = await api(request, 'PATCH', `/groups/${g.id}/members/Pepe/rename`, { display_name: 'Pepito' }, ana.token);
  expect(ren.status).toBe(403);

  // Si él cambia su nombre en Cuenta, cambia en el grupo
  await api(request, 'PATCH', '/users/me', { nombre: 'José García' }, pepe.token);
  expect(await miembros(request, g, ana)).toEqual(['Ana', 'José']);
});

test('si su nombre ya está en el grupo, se le añade la inicial del apellido', async ({ request }) => {
  const ana = await crearUsuario(request, 'Ana');
  const pepe = await crearUsuario(request, 'Pepe García');
  const g = await crearGrupo(request, ana, { miembros: ['Pepe', 'Pepe trabajo'] });
  await unirse(request, ana, g, pepe, 'Pepe trabajo');
  expect(await miembros(request, g, ana)).toEqual(['Ana', 'Pepe', 'Pepe G.']);
});

test('quien crea el grupo aparece con su primer nombre', async ({ request }) => {
  const hector = await crearUsuario(request, 'Hector Rodriguez');
  const g = await crearGrupo(request, hector, { miembros: [] });
  expect(await miembros(request, g, hector)).toContain('Hector');
});

test('amigo con cuenta: se marca y su email no se cambia desde la ficha', async ({ request }) => {
  const ana = await crearUsuario(request, 'Ana');
  const pepe = await crearUsuario(request, 'Pepe');
  const { datos: amigo } = await api(request, 'POST', '/friends', { name: 'Pepe del cole', email: pepe.email }, ana.token);
  const lista = (await api(request, 'GET', '/friends', null, ana.token)).datos;
  expect(lista.find(f => f.id === amigo.id).tiene_cuenta).toBe(true);
  expect((await api(request, 'PATCH', `/friends/${amigo.id}`, { email: 'otro@correo.es' }, ana.token)).status).toBe(400);
  expect((await api(request, 'PATCH', `/friends/${amigo.id}`, { name: 'Pepito' }, ana.token)).status).toBe(200);   // el nombre de tu agenda sí
});
