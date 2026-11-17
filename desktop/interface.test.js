// Interface de l'app de bureau : recompilée quand son contenu change, jamais pour une simple date (interface.mjs).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('empreinte du contenu, pas des dates', async () => {
  const { empreinte, sourcesInterface, UI_URL } = await import('./interface.mjs');
  assert.equal(UI_URL, 'http://127.0.0.1:5173'); // l'adresse que l'overlay et le serveur attendent
  const t = fs.mkdtempSync(path.join(os.tmpdir(), 'bureau-ui-'));
  fs.mkdirSync(path.join(t, 'client', 'src', 'core'), { recursive: true });
  fs.writeFileSync(path.join(t, 'client', 'src', 'core', 'a.js'), 'un');
  fs.writeFileSync(path.join(t, 'client', 'index.html'), '<html>');
  const s = sourcesInterface(t);
  assert.ok(s.fichiers.some((f) => f.endsWith(path.join('server', 'src', 'core', 'modes.js'))));
  const e1 = empreinte(s, 'vite 8');
  const date = new Date(Date.now() - 86_400_000);
  fs.utimesSync(path.join(t, 'client', 'src', 'core', 'a.js'), date, date);
  assert.equal(empreinte(s, 'vite 8'), e1, 'date changée seule : pas de compilation');
  assert.notEqual(empreinte(s, 'vite 9'), e1, 'autre version de Vite : compilation');
  fs.writeFileSync(path.join(t, 'client', 'src', 'core', 'a.js'), 'deux');
  assert.notEqual(empreinte(s, 'vite 8'), e1, 'contenu changé : compilation');
  fs.writeFileSync(path.join(t, 'client', 'src', 'core', 'a.js'), 'un');
  fs.writeFileSync(path.join(t, 'client', 'src', 'b.js'), '');
  assert.notEqual(empreinte(s, 'vite 8'), e1, 'fichier ajouté : compilation');
  fs.rmSync(t, { recursive: true, force: true });
});
