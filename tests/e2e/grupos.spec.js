// Grupos y gastos, usando la app como un usuario (escribiendo y pulsando)
const { test, expect, api, crearUsuario, crearGrupo, entrar } = require('./ayudas');

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

test('importes con formato español: 1.250,50 € en la lista, en Estadísticas y en el chat', async ({ page, request }) => {
  const ana = await crearUsuario(request);
  await crearGrupo(request, ana, { gasto: { desc: 'Alquiler', importe: 1250.5, cat: 'hotel' } });
  await entrar(page, ana);
  await page.locator('.group-card').first().click();
  await page.click('#sec4');
  await expect(page.locator('#gastosListSectionWrap')).toContainText('1.250,50 €');
  await page.click('[data-page="page-stats"]');
  await expect(page.locator('#skpi1')).toHaveText('1.250,50 €');
  await page.click('[data-page="page-grupos"]');
  await page.click('#sec7');
  await expect(page.locator('#chatLista')).toContainText('1.250,50 €');
});

test('saldar una deuda: la ventana muestra «Guardando…» hasta que se guarda y no se puede pagar dos veces', async ({ page, request }) => {
  const ana = await crearUsuario(request);
  await crearGrupo(request, ana, { gasto: { desc: 'Cena', importe: 40, pagador: 'Luis' } });   // Ana debe 20 € a Luis
  await entrar(page, ana);
  await page.locator('.group-card').first().click();
  await page.click('#sec5');
  await page.locator('#debtList').getByRole('button', { name: 'Pagar' }).click();

  // El servidor tarda en guardar el pago
  let soltar;
  const espera = new Promise(r => { soltar = r; });
  await page.route('**/expenses', async (route) => {
    if (route.request().method() === 'POST') await espera;
    await route.fallback();
  });
  const boton = page.locator('#btnMarcarSaldado');
  await boton.click();
  await expect(boton).toHaveText('Guardando…');
  await expect(boton).toBeDisabled();
  await expect(page.locator('#payModal')).toHaveClass(/open/);
  await expect(page.locator('#payModal .modal-sheet')).toHaveAttribute('aria-busy', 'true');   // Cancelar, métodos… quietos
  await page.keyboard.press('Escape');
  await expect(page.locator('#payModal')).toHaveClass(/open/);

  soltar();
  await expect(page.locator('#payModal')).not.toHaveClass(/open/);
  await expect(page.locator('#debtList')).toContainText('cuadradas');
  await expect(page.locator('#debtList').getByRole('button', { name: 'Pagar' })).toHaveCount(0);
  await expect(page.getByText('Pago no registrado')).toHaveCount(0);
});

// Retiene las peticiones de ese método a los gastos hasta llamar a la función que devuelve
async function servidorLento(page, metodo) {
  let soltar;
  const espera = new Promise(r => { soltar = r; });
  await page.route('**/expenses**', async (route) => {
    if (route.request().method() === metodo) await espera;
    await route.fallback();
  });
  return soltar;
}

test('registrar un gasto: mientras se guarda, el formulario no se puede tocar', async ({ page, request }) => {
  const ana = await crearUsuario(request);
  await crearGrupo(request, ana);
  await entrar(page, ana);
  await page.locator('.group-card').first().click();
  await page.click('#sec3');
  await page.fill('#expDesc', 'Pan');
  await page.fill('#expAmount', '4.50');
  await page.fill('#expDate', '2026-11-12');
  await page.click('#btnSelectAll');
  const soltar = await servidorLento(page, 'POST');
  await page.click('#btnGuardarGasto');
  await expect(page.locator('#btnGuardarGasto')).toHaveText('Guardando…');
  await expect(page.locator('#gastoSectionWrap')).toHaveAttribute('aria-busy', 'true');
  expect(await page.locator('#gastoSectionWrap').evaluate(e => e.inert)).toBe(true);   // chips y campos no responden
  soltar();
  await expect(page.locator('#toast')).toContainText('Gasto registrado');
  await expect(page.locator('#gastoSectionWrap')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#btnGuardarGasto')).toBeEnabled();
});

test('editar un gasto: mientras se guarda no se puede eliminar ni cerrar; borrar espera al servidor', async ({ page, request }) => {
  const ana = await crearUsuario(request);
  await crearGrupo(request, ana, { gasto: { desc: 'Pan', importe: 4 } });
  await entrar(page, ana);
  await page.locator('.group-card').first().click();
  await page.evaluate(() => openEditModal(0));
  await page.fill('#editDesc', 'Pan y leche');

  let soltar = await servidorLento(page, 'PUT');
  await expect(page.locator('#editModal').getByRole('button', { name: 'Eliminar' })).toHaveCount(0);   // se borra desde fuera
  await page.click('#btnGuardarEdicion');
  await expect(page.locator('#btnGuardarEdicion')).toHaveText('Guardando…');
  await expect(page.locator('#editModal .modal-sheet')).toHaveAttribute('aria-busy', 'true');   // «Eliminar» no responde
  await page.evaluate(() => closeEditModal());                                                    // ni se cierra
  await expect(page.locator('#editModal')).toHaveClass(/open/);
  soltar();
  await expect(page.locator('#editModal')).not.toHaveClass(/open/);
  await expect(page.locator('#toast')).toContainText('Gasto actualizado');

  // Borrar: «Eliminando…» hasta que responde el servidor, y un solo aviso
  soltar = await servidorLento(page, 'DELETE');
  await page.evaluate(() => openDeleteExpenseModal(0));
  await page.click('#btnConfirmarBorrarGasto');
  await expect(page.locator('#btnConfirmarBorrarGasto')).toHaveText('Eliminando…');
  await page.evaluate(() => cerrarModalBorrarGasto());
  await expect(page.locator('#modal-borrar-gasto')).toBeVisible();
  soltar();
  await expect(page.locator('#modal-borrar-gasto')).toBeHidden();
  await expect(page.locator('#toast')).toContainText('Gasto eliminado');
  await expect.poll(() => page.evaluate(() => groups[currentGroupIdx].expenses.length)).toBe(0);
  await expect(page.locator('#modal-error')).toHaveCount(0);
});

test('servidor: editar y borrar el mismo gasto a la vez no da error 500', async ({ request }) => {
  const ana = await crearUsuario(request);
  const g = await crearGrupo(request, ana, { gasto: { desc: 'Pan', importe: 4 } });
  const { datos } = await api(request, 'GET', `/groups/${g.id}`, null, ana.token);
  const gasto = datos.expenses[0];
  const cuerpo = { description: 'Pan y leche', amount: 4, amount_base: 4, currency: 'EUR', category: 'food',
    payer_name: 'Ana', expense_date: '2026-11-10', involved: ['Ana', 'Luis'] };
  for (let n = 0; n < 5; n++) {
    const otro = n === 0 ? gasto : (await api(request, 'POST', `/groups/${g.id}/expenses`, { ...cuerpo, description: 'Pan' }, ana.token)).datos;
    // Directo, sin la ayuda «api», que repite las peticiones que dan error 500
    const url = `${process.env.VP_API_PRUEBAS}/api/v1/groups/${g.id}/expenses/${otro.id}`;
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${ana.token}` };
    const [ed, bo] = await Promise.all([
      request.fetch(url, { method: 'PUT', data: cuerpo, headers }),
      request.fetch(url, { method: 'DELETE', headers }),
    ]);
    expect([200, 404]).toContain(ed.status());
    expect(bo.status()).toBe(204);
  }
});

test('editar grupo: se cambian tipo, nombre y fechas; las fechas no pueden dejar gastos fuera', async ({ page, request }) => {
  const ana = await crearUsuario(request);
  const g = await crearGrupo(request, ana, { nombre: 'Cena', gasto: { desc: 'Pizza', importe: 30 } });   // gasto del 10/11/2026
  // Servidor: no deja fechas que dejen el gasto fuera, ni tipos inventados
  const fuera = await api(request, 'PATCH', `/groups/${g.id}`, { date_end: '2026-11-05' }, ana.token);
  expect(fuera.status).toBe(409);
  expect(fuera.datos.error).toContain('10/11/2026');
  expect((await api(request, 'PATCH', `/groups/${g.id}`, { type: 'crucero' }, ana.token)).status).toBe(400);

  await entrar(page, ana);
  await page.locator('.group-card').first().click();
  await page.evaluate(() => openEditGroupModal(currentGroupIdx));
  await expect(page.locator('#edit-group-types .type-btn.active')).toHaveAttribute('data-type', 'casa');
  await page.locator('#edit-group-types .type-btn[data-type="pareja"]').click();
  await page.fill('#edit-group-name', 'Escapada');
  await page.fill('#edit-group-start', '2026-11-01');
  await page.fill('#edit-group-end', '2026-11-30');

  let soltar;
  const espera = new Promise(r => { soltar = r; });
  await page.route(`**/groups/${g.id}`, async (route) => { if (route.request().method() === 'PATCH') await espera; await route.fallback(); });
  await page.click('#btnGuardarGrupo');
  await expect(page.locator('#btnGuardarGrupo')).toHaveText('Guardando…');
  expect(await page.locator('#modal-editar-grupo .ventana').evaluate(e => e.inert)).toBe(true);
  soltar();
  await expect(page.locator('#toast')).toContainText('Grupo actualizado');
  await expect(page.locator('#modal-editar-grupo')).toBeHidden();
  await expect(page.locator('#detMeta')).toContainText('01/11/2026');

  const { datos } = await api(request, 'GET', `/groups/${g.id}`, null, ana.token);
  expect(datos).toMatchObject({ name: 'Escapada', type: 'pareja', date_start: '2026-11-01', date_end: '2026-11-30' });
  const act = await api(request, 'GET', '/activity', null, ana.token);
  expect(JSON.stringify(act.datos)).toContain('tipo Casa → Pareja');
});
