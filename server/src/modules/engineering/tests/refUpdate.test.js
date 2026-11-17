// « Mettre à jour les données » (EngineeringService.updateReference) : messages en cas d'échec. Données téléchargées
// mais illisibles : jamais « retélécharge-les » (le conseil tournerait en rond).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EngineeringService } from '../services/service.js';
import { DAMAGED_PREFIX } from '../../../core/reference/refdata.js';

// Juste ce que updateReference touche en cas d'échec (pas de service complet : il faudrait les données de référence)
const faux = () => ({ download: { running: false }, sent: [], broadcast(name, data) { this.sent.push([name, data]); }, notify() {} });
const update = (svc, o) => EngineeringService.prototype.updateReference.call(svc, o);

test('données téléchargées mais illisibles : le fichier nommé, « signale-le », pas « retélécharge-les »', async () => {
  const svc = faux();
  await update(svc, {
    download: async () => ({ version: 'v', downloadedAt: '2026-11-15T10:00:00Z', files: 3 }),
    reread: () => ({ ref: null, error: `${DAMAGED_PREFIX} (coriolis/ships/adder.json : format inattendu) : retélécharge-les (…).`, detail: 'coriolis/ships/adder.json : format inattendu' }),
  });
  assert.equal(svc.download.running, false);
  assert.equal(svc.download.error, "Données de référence téléchargées, mais illisibles (coriolis/ships/adder.json : format inattendu) : signale-le avec le journal de l'app (bureau.log).");
  assert.doesNotMatch(svc.download.error, /retélécharge|Téléchargement impossible/);
  assert.equal(svc.refError, svc.download.error, 'même message sur les pages qui demandent les données (503)');
  assert.equal(svc.ref, null);
  assert.deepEqual(svc.sent.at(-1), ['engineering:refdata', svc.download]);
});

test('téléchargement raté : « Téléchargement impossible » et la raison', async () => {
  const svc = faux();
  await update(svc, { download: async () => { throw new Error('Pas de connexion'); }, reread: () => assert.fail('rien à relire') });
  assert.equal(svc.download.error, 'Téléchargement impossible : Pas de connexion');
});
