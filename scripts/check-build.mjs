import { readFile, access } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Verifica la salida estática de Astro sin servidor: páginas, módulos del MVP y recursos referenciados.
for (const path of ['dist/index.html', 'dist/dashboard/index.html', 'dist/favicon.jpg']) await access(path);
const login = await readFile('dist/index.html', 'utf8');
const dashboard = await readFile('dist/dashboard/index.html', 'utf8');
assert.ok(login.includes('id="google-sign-in"'), 'Falta el contenedor del inicio de sesión (CU-01)');
for (const id of ['map-module', 'map', 'report-module', 'report-form', 'my-reports-module', 'my-reports-list']) {
  assert.ok(dashboard.includes(`id="${id}"`), `Falta el componente del panel: ${id}`);
}
const assets = [...dashboard.matchAll(/(?:src|href)="(\/_astro\/[^"?#]+)"/g)].map((match) => match[1]);
assert.ok(assets.length > 0, 'El panel no referencia recursos empaquetados');
for (const path of assets) await access('dist' + path);
console.log('Salida estática válida: login, panel con mapa, formulario, mis reportes, favicon y recursos.');
