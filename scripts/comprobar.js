// scripts/comprobar.js — Comprobaciones de la web que ESLint no puede hacer solo
// ================================================================
// La web son scripts clásicos: todo lo que se declara arriba en un archivo es
// global y lo usan los demás, y el HTML llama a funciones con onclick="…".
// ESLint revisa cada archivo por separado; esto mira cada página entera:
//
//   1. Todos los .js de public/ se pueden leer (sin errores de sintaxis).
//   2. En cada página (index.html, login.html) no hay dos funciones o variables
//      globales con el mismo nombre en archivos distintos (la segunda pisaría
//      a la primera sin avisar).
//   3. Cada onclick="…", oninput="…", etc. (en el HTML y en las plantillas de
//      JS) llama a funciones que existen en esa página.
//   4. Cada clase u-… que se usa existe en css/utilidades.css.
//   5. Los archivos que cargan las páginas (<script src>, <link href>) existen.
//   6. www/ es copia exacta de public/ (si no: «node scripts/sync-www.js»).
//
// Uso: npm run comprobar   (sale con error si algo falla)
// ================================================================
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const globals = require('globals');

const RAIZ = path.join(__dirname, '..');
const PUBLIC = path.join(RAIZ, 'public');
const TERCEROS = new Set(['jspdf.umd.min.js', 'libphonenumber-min.js']);
const errores = [];
const fallo = (msg) => errores.push(msg);
const leer = (f) => fs.readFileSync(f, 'utf8');
const rel = (f) => path.relative(RAIZ, f);

function parsear(codigo, origen) {
  try { return acorn.parse(codigo, { ecmaVersion: 2022, sourceType: 'script', locations: true }); }
  catch (e) { fallo(`${origen}: error de sintaxis (${e.message})`); return null; }
}

// Nombres que un script declara arriba del todo (y los window.x = …)
function globalesDe(ast) {
  const nombres = [];
  if (!ast) return nombres;
  for (const n of ast.body) {
    if ((n.type === 'FunctionDeclaration' || n.type === 'ClassDeclaration') && n.id) nombres.push([n.id.name, n.loc.start.line]);
    if (n.type === 'VariableDeclaration') for (const d of n.declarations) if (d.id.type === 'Identifier') nombres.push([d.id.name, n.loc.start.line]);
  }
  return nombres;
}
function asignadosAWindow(codigo) {
  return [...codigo.matchAll(/\bwindow\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)].map(m => m[1]);
}

// ── 1. Sintaxis de todos los .js propios ─────────────────────────
function jsPropios(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...jsPropios(f));
    else if (e.name.endsWith('.js') && !TERCEROS.has(e.name)) out.push(f);
  }
  return out;
}
const astDe = new Map();
for (const f of jsPropios(PUBLIC)) astDe.set(f, parsear(leer(f), rel(f)));

// ── 2, 3 y 5. Cada página ────────────────────────────────────────
const NAVEGADOR = new Set([...Object.keys(globals.browser), ...Object.keys(globals.builtin)]);
const PALABRAS = new Set(['if', 'for', 'while', 'switch', 'return', 'typeof', 'function', 'new', 'catch', 'await', 'async', 'void', 'delete', 'in', 'of', 'do', 'else']);

// Llamadas «nombre(» que no van detrás de un punto (las de objeto no se pueden comprobar)
function llamadasEn(codigo) {
  const sinTextos = codigo.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g, "''");
  return [...sinTextos.matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g)].map(m => m[2]).filter(n => !PALABRAS.has(n));
}

function comprobarPagina(nombreHtml) {
  const fHtml = path.join(PUBLIC, nombreHtml);
  const html = leer(fHtml);
  const definidos = new Map();          // nombre → dónde
  const window_ = new Set();
  // Scripts en el orden de la página: externos e internos
  const reScript = /<script(?:\s+src="([^"]+)")?[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = reScript.exec(html))) {
    let codigo, origen, desfase = 0;
    if (m[1]) {
      if (/^https?:/.test(m[1])) continue;
      const f = path.join(PUBLIC, m[1]);
      if (!fs.existsSync(f)) { fallo(`${nombreHtml}: carga «${m[1]}», que no existe`); continue; }
      if (TERCEROS.has(path.basename(f))) continue;
      codigo = leer(f); origen = m[1];
    } else {
      codigo = m[2];
      desfase = html.slice(0, m.index).split('\n').length - 1;   // para dar la línea real del .html
      origen = nombreHtml;
    }
    const ast = astDe.get(path.join(PUBLIC, m[1] || '')) || parsear(codigo, origen);
    for (const [n, l] of globalesDe(ast)) {
      if (definidos.has(n)) fallo(`${nombreHtml}: «${n}» está declarado dos veces: ${definidos.get(n)} y ${origen}:${l + desfase} (el segundo pisa al primero)`);
      else definidos.set(n, `${origen}:${l + desfase}`);
    }
    asignadosAWindow(codigo).forEach(n => window_.add(n));
  }
  // <link href> propios
  for (const [, href] of html.matchAll(/<link[^>]+href="([^"]+)"/g)) {
    if (/^https?:/.test(href)) continue;
    if (!fs.existsSync(path.join(PUBLIC, href))) fallo(`${nombreHtml}: enlaza «${href}», que no existe`);
  }
  // Manejadores on…="…": en el HTML y, para index.html, en las plantillas de js/
  const fuentes = [[nombreHtml, html]];
  if (nombreHtml === 'index.html') for (const f of astDe.keys()) if (f.includes(`${path.sep}js${path.sep}`)) fuentes.push([rel(f), leer(f)]);
  const existe = (n) => definidos.has(n) || window_.has(n) || NAVEGADOR.has(n);
  for (const [origen, texto] of fuentes) {
    for (const mm of texto.matchAll(/\son[a-z]+="([^"]*)"/g)) {
      const linea = texto.slice(0, mm.index).split('\n').length;
      for (const n of llamadasEn(mm[1].replace(/\$\{[^}]*\}/g, '0'))) {
        if (!existe(n)) fallo(`${origen}:${linea}: el HTML llama a «${n}()», que no existe en ${nombreHtml}`);
      }
    }
  }
  return definidos;
}
comprobarPagina('index.html');
comprobarPagina('login.html');

// ── 4. Clases u-… ────────────────────────────────────────────────
const utilidades = new Set([...leer(path.join(PUBLIC, 'css/utilidades.css')).matchAll(/\.(u-[\w-]+)\{/g)].map(m => m[1]));
const usoUtil = (f) => {
  for (const mm of leer(f).matchAll(/class="([^"]*)"/g)) {
    for (const c of mm[1].replace(/\$\{[^}]*\}/g, ' ').split(/\s+/)) {
      if (c.startsWith('u-') && !utilidades.has(c)) fallo(`${rel(f)}: usa la clase «${c}», que no está en css/utilidades.css`);
    }
  }
};
['index.html', 'login.html'].forEach(h => usoUtil(path.join(PUBLIC, h)));
for (const f of astDe.keys()) usoUtil(f);

// ── 6. www/ igual que public/ ────────────────────────────────────
const WWW = path.join(RAIZ, 'www');
function archivos(dir, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...archivos(f, base)); else out.push(path.relative(base, f));
  }
  return out;
}
if (fs.existsSync(WWW)) {
  const enWww = new Set(archivos(WWW));
  for (const f of archivos(PUBLIC)) {
    if (!enWww.has(f)) fallo(`www/ no tiene «${f}» (ejecuta: node scripts/sync-www.js)`);
    else if (!fs.readFileSync(path.join(PUBLIC, f)).equals(fs.readFileSync(path.join(WWW, f)))) fallo(`www/${f} no es igual que public/${f} (ejecuta: node scripts/sync-www.js)`);
  }
}

// ── Resultado ────────────────────────────────────────────────────
if (errores.length) {
  console.error(`✗ ${errores.length} problema(s):\n` + errores.map(e => '  · ' + e).join('\n'));
  process.exit(1);
}
console.log(`✓ Todo bien: ${astDe.size} archivos JS, 2 páginas, ${utilidades.size} clases de utilidad, www/ al día.`);
