// scripts/sync-www.js
// ================================================================
// Copia el frontend "oficial" (carpeta public/) hacia www/, que es
// lo único que Capacitor empaqueta en la APK (ver capacitor.config.json
// -> "webDir": "www"). Con esto, public/ es la ÚNICA fuente de verdad:
// ya no se edita nada a mano dentro de www/.
//
// vakapay_v2.html (el archivo de trabajo) se copia como index.html
// (el nombre que Capacitor espera como entrypoint).
//
// Uso:  node scripts/sync-www.js
// ================================================================
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'public');
const DEST = path.join(__dirname, '..', 'www');

if (!fs.existsSync(SRC)) {
  console.error('❌ No existe la carpeta public/. Nada que sincronizar.');
  process.exit(1);
}

fs.mkdirSync(DEST, { recursive: true });

function copyRecursive(srcDir, destDir) {
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    let destName = entry.name;

    destName = entry.name;

    const destPath = path.join(destDir, destName);

    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
      console.log(`  ${path.relative(path.join(__dirname, '..'), srcPath)}  ->  ${path.relative(path.join(__dirname, '..'), destPath)}`);
    }
  }
}

console.log('🔄 Sincronizando public/ -> www/ ...');
copyRecursive(SRC, DEST);
console.log('✅ Listo. Ahora corre: npx cap sync android');
