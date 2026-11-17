// Fichiers JSON des modules (constat du 9 nov. 2026, audit tour 2) : un fichier illisible (fin coupée, BOM d'un autre
// éditeur, autre version) était remis à zéro sans copie, puis écrasé à la première écriture. Chaque lecteur passe
// maintenant par readJsonFile (core/atomic.js) : le fichier est mis de côté sous « .illisible-<date> », avec un
// avertissement, et le module repart à vide. Dossier temporaire, avertissements captés.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadSettings } from '../modules/compagnon/settings.js';
import { readJson } from '../modules/escadron/store.js';
import { ModifierStore } from '../modules/expansion/rateStore.js';
import { loadSaleState, STORE_VERSION } from '../modules/expansion/saleStore.js';
import { loadSamples } from '../modules/fsdcool/scoStore.js';
import { TaskStore } from '../modules/whereto/store.js';

const CASSE = '{"coupé": [1, 2';

function essai(t, nom, contenu, lire) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-lecteurs-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, nom);
  fs.writeFileSync(file, contenu);
  const warn = console.warn;
  const warns = [];
  console.warn = (m) => warns.push(String(m));
  let out;
  try {
    out = lire(file);
  } finally {
    console.warn = warn;
  }
  const mis = fs.readdirSync(dir).filter((n) => n.startsWith(`${nom}.illisible-`));
  assert.equal(mis.length, 1, `${nom} : mis de côté (${fs.readdirSync(dir).join(', ')})`);
  assert.equal(fs.readFileSync(path.join(dir, mis[0]), 'utf8'), contenu, `${nom} : copie intacte`);
  assert.ok(warns.some((w) => /illisible/.test(w)), `${nom} : avertissement`);
  return out;
}

test('lecteurs des modules : fichier illisible mis de côté, départ à vide (jamais écrasé sans copie)', (t) => {
  essai(t, 'compagnon.json', CASSE, (f) => loadSettings(f));
  assert.equal(essai(t, 'escadron.json', CASSE, (f) => readJson(f)), null);
  essai(t, 'expansion-modifiers.json', CASSE, (f) => new ModifierStore(f));
  assert.deepEqual(essai(t, 'expansion-sale.json', CASSE, (f) => loadSaleState(f)).settings, { autoWindow: true });
  assert.equal(essai(t, 'sco.json', CASSE, (f) => loadSamples(f)).size, 0);
  assert.deepEqual(essai(t, 'whereto.json', CASSE, (f) => new TaskStore(f)).tasks, []);
});

test('vente : un fichier d’une autre version est mis de côté, pas réécrit par-dessus', (t) => {
  const autre = JSON.stringify({ version: STORE_VERSION + 1, sales: [{ x: 1 }] });
  const st = essai(t, 'expansion-sale.json', autre, (f) => loadSaleState(f));
  assert.equal(st.sales, undefined);
});
