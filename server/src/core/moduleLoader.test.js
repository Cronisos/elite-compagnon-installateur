// Chargement des modules (core/moduleLoader.js) : un module qui échoue à démarrer est mis hors service, les autres
// démarrent ; le joueur ne lit jamais l'erreur technique.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { registerModules } from './moduleLoader.js';

async function demander(app, chemin) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${chemin}`);
    return { status: res.status, body: await res.json().catch(() => null) };
  } finally {
    server.close();
  }
}

test('modules : un register qui lève (donnée abîmée) met ce module seul hors service ; ses routes répondent 503 lisible', async () => {
  const app = express();
  const vus = [];
  const modules = [
    { id: 'avant', name: 'Avant', register: async ({ router, commun }) => { vus.push(commun); router.get('/ok', (req, res) => res.json({ ok: 'avant' })); } },
    {
      id: 'casse',
      name: 'Module Test',
      register: async ({ router }) => {
        router.get('/ok', (req, res) => res.json({ ok: 'à moitié prêt' })); // posée avant l'échec : jamais montée
        throw new Error("Cannot read properties of undefined (reading 'edID')");
      },
    },
    { id: 'apres', name: 'Après', register: ({ router }) => { router.get('/ok', (req, res) => res.json({ ok: 'après' })); } },
  ];
  const journal = [];
  const { mounts, enPanne } = await registerModules({ app, modules, ctx: { commun: 1 }, log: (t) => journal.push(t) });

  assert.deepEqual(enPanne, [{ id: 'casse', name: 'Module Test', error: null }], 'erreur technique jamais montrée');
  assert.deepEqual([...mounts.values()], ['/api/modules/avant', '/api/modules/apres'], 'les autres sont montés, dans l’ordre');
  assert.deepEqual(vus, [1], 'services communs transmis');
  assert.match(journal[0], /Module « Module Test » hors service : son démarrage a échoué \(Cannot read properties/, 'le détail va dans le journal');

  assert.deepEqual(await demander(app, '/api/modules/apres/ok'), { status: 200, body: { ok: 'après' } });
  const casse = await demander(app, '/api/modules/casse/ok');
  assert.equal(casse.status, 503);
  assert.equal(casse.body.error, "« Module Test » n'a pas pu démarrer. Relance l'app ; si ça recommence, signale-le avec le journal de l'app (bureau.log).");
});

test('modules : une erreur en français pour le joueur (publicMessage) est montrée ; une promesse rejetée sans erreur est rattrapée', async () => {
  const app = express();
  const lisible = Object.assign(new Error('x'), { publicMessage: 'Dossier des repères illisible' });
  const { enPanne } = await registerModules({
    app,
    modules: [{ id: 'x', name: 'X', register: () => Promise.reject('texte seul') }, { id: 'y', name: 'Y', register: () => { throw lisible; } }],
    ctx: {},
    log: () => {},
  });
  assert.deepEqual(enPanne, [{ id: 'x', name: 'X', error: null }, { id: 'y', name: 'Y', error: 'Dossier des repères illisible' }]);
  assert.match((await demander(app, '/api/modules/y/z')).body.error, /^« Y » n'a pas pu démarrer \(Dossier des repères illisible\)\. Relance/);
});
