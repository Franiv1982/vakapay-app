// playwright.config.js — Pruebas de la web en un navegador de verdad (Chromium)
// Uso: npm run test:e2e
//
// Arranca la API (src/index.js) contra una base de datos PostgreSQL de pruebas
// (DATABASE_URL; por defecto postgres://postgres:postgres@localhost:5432/vakapay_pruebas)
// y abre la web como la abriría un usuario. Cada prueba crea sus propios usuarios.
const { defineConfig } = require('@playwright/test');

const PUERTO = Number(process.env.PUERTO_PRUEBAS || 3999);
process.env.VP_API_PRUEBAS = `http://localhost:${PUERTO}`;

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,                       // una sola base de datos para todas
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    viewport: { width: 390, height: 844 },
    locale: 'es-ES',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node src/index.js',
    url: `http://localhost:${PUERTO}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      PORT: String(PUERTO),
      DATABASE_URL: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/vakapay_pruebas',
      JWT_SECRET: process.env.JWT_SECRET || 'solo-para-pruebas',
      NODE_ENV: 'test',
    },
  },
});
