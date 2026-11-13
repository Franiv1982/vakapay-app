// tests/e2e/ayudas.js — Lo que comparten las pruebas
// · La app llama siempre a https://vakapay-app.vercel.app; aquí esas peticiones se
//   desvían a la API local, y la web se abre con esa misma dirección para que la
//   lista de sitios permitidos (CSP) se comporte igual que en producción.
// · Cada prueba crea usuarios nuevos (correo y teléfono aleatorios).
// · Si la página lanza un error de JavaScript, la prueba falla.
const base = require('@playwright/test');

const WEB = 'https://vakapay-app.vercel.app';
const API = () => process.env.VP_API_PRUEBAS || 'http://localhost:3999';
const CLAVE = 'Abcdef1!';

async function api(request, metodo, ruta, cuerpo, token) {
  for (let intento = 0; intento < 10; intento++) {     // la API crea las tablas al arrancar
    const r = await request.fetch(`${API()}/api/v1${ruta}`, {
      method: metodo, data: cuerpo,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (r.status() >= 500 && intento < 9) { await new Promise(res => setTimeout(res, 500)); continue; }
    const texto = await r.text();
    return { status: r.status(), datos: texto ? JSON.parse(texto) : null };
  }
}

const aleatorio = () => Math.random().toString(36).slice(2, 8);
async function crearUsuario(request, nombre = 'Ana') {
  const email = `${nombre.toLowerCase()}.${aleatorio()}@prueba.test`;
  const tel = '+34 6' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
  const reg = await api(request, 'POST', '/auth/register', { nombre, apellido: '', email, password: CLAVE, tel });
  if (reg.status >= 300) throw new Error('No se pudo registrar: ' + JSON.stringify(reg.datos));
  const login = await api(request, 'POST', '/auth/login', { email, password: CLAVE });
  return { nombre, email, token: login.datos.token };
}

// Grupo con participantes y, si se pide, un gasto
async function crearGrupo(request, usuario, { nombre = 'Piso compartido', miembros = ['Luis'], gasto = null } = {}) {
  const { datos: g } = await api(request, 'POST', '/groups', { name: nombre, type: 'casa', date_start: '2026-01-01', date_end: '2026-12-31' }, usuario.token);
  for (const m of [usuario.nombre, ...miembros]) await api(request, 'POST', `/groups/${g.id}/members`, { display_name: m }, usuario.token);
  if (gasto) {
    await api(request, 'POST', `/groups/${g.id}/expenses`, {
      description: gasto.desc, amount: gasto.importe, amount_base: gasto.importe, currency: 'EUR', category: gasto.cat || 'food',
      payer_name: gasto.pagador || usuario.nombre, expense_date: '2026-11-10', involved: [usuario.nombre, ...miembros],
    }, usuario.token);
  }
  return g;
}

const test = base.test.extend({
  page: async ({ page }, use) => {
    await page.route(`${WEB}/**`, async (route) => {
      const r = await route.fetch({ url: route.request().url().replace(WEB, API()) });
      await route.fulfill({ response: r });
    });
    // Lo de fuera (tipografías, GIPHY…) no hace falta en las pruebas
    await page.route(/^https:\/\/(?!vakapay-app\.vercel\.app)/, route => route.fulfill({ status: 204, body: '' }));
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    await use(page);
    base.expect(errores, 'Errores de JavaScript en la página').toEqual([]);
  },
});

// Abre la app ya con la sesión iniciada
async function entrar(page, usuario, ruta = 'index.html') {
  await page.goto(`${WEB}/login.html`);
  await page.evaluate(t => localStorage.setItem('vp_token', t), usuario.token);
  await page.goto(`${WEB}/${ruta}`);
  await page.waitForFunction(() => typeof cargandoInicial !== 'undefined' && !cargandoInicial);
}

module.exports = { test, expect: base.expect, api, crearUsuario, crearGrupo, entrar, WEB, CLAVE };
