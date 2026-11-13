// eslint.config.js — Revisor de código (ESLint)
// Uso: npm run lint
//
// La web son scripts clásicos que comparten variables globales entre archivos
// (lo que declara grupos.js lo usa gastos.js…). ESLint mira cada archivo por
// separado y no lo sabría, así que «no-undef» y «no-unused-vars» van apagadas;
// de eso se encarga scripts/comprobar.js, que mira todos los archivos juntos.
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    ignores: [
      'node_modules/**', 'www/**', 'android/**', 'uploads/**', 'resources/**', 'docs/**',
      'public/jspdf.umd.min.js', 'public/libphonenumber-min.js',   // librerías de terceros
      'vakapay_data_service_v2.js',                                  // copia antigua fuera de public/
    ],
  },
  js.configs.recommended,
  {
    // Navegador: web y APK
    files: ['public/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.browser, Capacitor: 'readonly', jspdf: 'readonly', libphonenumber: 'readonly', Tesseract: 'readonly' },
    },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],   // «catch (_) {}» es intencionado
      'no-useless-escape': 'off',        // escapes de más en expresiones regulares: inofensivos
      'preserve-caught-error': 'off',
    },
  },
  {
    // Servidor, scripts y pruebas: Node
    files: ['src/**/*.js', 'scripts/**/*.js', 'tests/**/*.js', '*.config.js', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: { ...globals.node } },
    rules: {
      // ignoreRestSiblings: «const { password_hash, ...publico } = user» quita campos a propósito
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-useless-escape': 'off',
      'preserve-caught-error': 'off',
    },
  },
  {
    // Las pruebas ejecutan código dentro de la página (page.evaluate): ahí existen
    // document, groups, manejarAtras… aunque ESLint no lo sepa
    files: ['tests/**/*.js'],
    rules: { 'no-undef': 'off' },
  },
];
