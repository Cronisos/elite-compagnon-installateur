// Serveur isolé du banc : tout est à lui (port, données, base, journaux, options), réseau et overlay coupés, horloge
// figée, et rien ne reste après l'arrêt. Lance le vrai serveur de la worktree (quelques secondes).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SERVEUR } from '../banc/chemins.mjs';
import { demarrerServeur, derniereHeure, listerSeances, lireSeance, nettoyerBanc, portLibre } from '../banc/serveur.mjs';

const contenu = (d) => (fs.existsSync(d) ? fs.readdirSync(d).sort() : null);

test('serveur isolé : dossiers temporaires, réseau et overlay coupés, heure figée, arrêt propre', { timeout: 120_000 }, async () => {
  const avant = contenu(path.join(SERVEUR, 'data'));
  const srv = await demarrerServeur({ seance: 'colonisation-exemples' });
  let arret;
  try {
    assert.notEqual(srv.port, 3001);
    assert.ok(srv.dossiers.racine.startsWith(os.tmpdir()));
    for (const d of ['donnees', 'journaux', 'options']) assert.ok(srv.dossiers[d].startsWith(srv.dossiers.racine), d);
    assert.ok(fs.existsSync(path.join(srv.dossiers.donnees, 'elite.db')), 'base neuve dans le dossier temporaire');
    assert.ok(fs.existsSync(path.join(srv.dossiers.donnees, 'reference', 'meta.json')), 'données de référence copiées');

    const settings = await srv.get('/api/settings');
    assert.equal(settings.journalPath, srv.dossiers.journaux, 'journaux de test, jamais Saved Games');
    const etat = await srv.get('/api/state');
    assert.equal(etat.journal.dir, srv.dossiers.journaux);
    assert.equal(etat.journal.file, 'Journal.2026-11-01T195500.01.log');
    assert.equal(etat.game.commander, 'Testeur');

    const overlay = await srv.get('/api/overlay');
    assert.equal(overlay.installed, false);
    const ouvrir = await srv.requete('PUT', '/api/overlay', { mode: 'combat', pages: ['combat'] });
    assert.equal(ouvrir.statut, 409);
    assert.match(ouvrir.corps.error, /ELITE_NO_OVERLAY/);
    // Mode inconnu : refusé avant tout (400), même overlay coupé ; jamais une propriété d'Object
    for (const mode of ['inconnu', 'constructor', '__proto__', 'toString']) {
      const r = await srv.requete('PUT', '/api/overlay', { mode, pages: [] });
      assert.equal(r.statut, 400, mode);
      // Bien formé mais inconnu (core/modes.js) : « inconnu » ; « constructor », « __proto__ »… sont refusés dès la forme
      // (overlayRequest de core/overlay.js), avant même d'être cherchés
      assert.match(r.corps.error, mode === 'inconnu' ? /^Mode de jeu inconnu : « inconnu »\.$/ : /^Mode de jeu invalide \(« /, mode);
    }
    assert.equal((await srv.requete('PUT', '/api/overlay', { mode: null, pages: [] })).statut, 409, '« Aucun » est un mode permis');
    // Clé de prototype dans un champ à liste fermée (monnaie d'un objectif) : 400, rien de créé, la page reste lisible
    for (const currency of ['__proto__', 'constructor', 'toString']) {
      const r = await srv.requete('POST', '/api/modules/glance/goals', { currency, target: 10 });
      assert.equal(r.statut, 400, currency);
    }
    const coup = await srv.requete('GET', '/api/modules/glance/summary');
    assert.equal(coup.statut, 200);
    assert.deepEqual(coup.corps.goals, []);
    // Overlay quitté (Alt+Maj+Q, overlay/main.js) : le serveur l'apprend ; état sans fenêtre, rien d'écrit (overlay coupé)
    const quitte = await srv.requete('POST', '/api/overlay/closed', {});
    assert.equal(quitte.statut, 200);
    assert.deepEqual([quitte.corps.pages, quitte.corps.glance], [[], false]);
    assert.equal(fs.existsSync(path.join(srv.dossiers.donnees, 'overlay.json')), false);

    // Réseau : sans le choix du joueur, rien n'est demandé (une lecture avec ?online=1 non plus : ce n'est pas un clic) ;
    // au clic (POST …/load), la passerelle refuse tout et le module répond quand même
    const sansClic = await srv.get('/api/modules/waypoints/sweep/markets');
    assert.equal(sansClic.error, null);
    assert.deepEqual(sansClic.ardent, { auto: false, loaded: false, at: null });
    const lecture = await srv.get('/api/modules/waypoints/sweep/markets?online=1');
    assert.equal(lecture.error, null, 'une lecture ne vaut jamais le clic');
    const marches = await srv.requete('POST', '/api/modules/waypoints/sweep/markets/load', {});
    assert.equal(marches.statut, 200);
    assert.match(String(marches.corps.error), /Réseau coupé \(ELITE_NO_NETWORK\)/);

    // Options du jeu : la copie de test, datées d'avance
    const hud = await srv.get('/api/modules/hudcolours/state');
    assert.equal(hud.dir, path.join(srv.dossiers.options, 'Graphics'));
    assert.equal(hud.modifiedAt, '2026-10-01T00:00:00.000Z');
    const garde = await srv.get('/api/modules/bindings/status');
    assert.equal(garde.dir, path.join(srv.dossiers.options, 'Bindings'));

    // Écriture permise sur ce serveur (avec l'en-tête), et seulement dans ses dossiers
    const essai = await srv.requete('PUT', '/api/settings', { hoursPerEvening: 4 });
    assert.equal(essai.statut, 200);
    assert.equal(essai.corps.journalPath, srv.dossiers.journaux);
    const sansEntete = await fetch(`${srv.url}/api/settings`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(sansEntete.status, 403, 'la garde de l’API locale reste active');
  } finally {
    arret = await srv.arreter();
    nettoyerBanc();
  }
  assert.equal(arret.efface, true);
  assert.equal(fs.existsSync(srv.dossiers.racine), false, 'dossier temporaire effacé');
  assert.deepEqual(contenu(path.join(SERVEUR, 'data')), avant, 'server/data de la worktree inchangé');
  await assert.rejects(fetch(`${srv.url}/api/state`, { signal: AbortSignal.timeout(2000) }), 'serveur arrêté');
});

test('serveur isolé : séances lisibles, ports libres, horodatage de fin de journal', async () => {
  const ids = listerSeances();
  assert.ok(ids.length >= 9, `${ids.length} séances`);
  for (const id of ids) {
    const s = lireSeance(id);
    assert.ok(s.titre && s.fichiers.length, id);
    assert.ok(Number.isFinite(Date.parse(s.maintenant)), `${id} : heure figée`);
    for (const f of s.fichiers) assert.ok(derniereHeure(f) <= Date.parse(s.maintenant), `${id} : l'heure figée suit la séance`);
  }
  assert.throws(() => lireSeance('../../server'), /Séance inconnue/);
  assert.throws(() => lireSeance('n-existe-pas'), /Séance inconnue/);
  const [a, b] = [await portLibre(), await portLibre()];
  assert.ok(a > 1023 && b > 1023);
  assert.ok(![a, b].includes(3001) && ![a, b].includes(5173), 'jamais les ports de l’app');
});

test('serveur isolé : l’isolement ne se négocie pas, l’heure figée doit avoir un fuseau', async () => {
  for (const env of [{ ELITE_NO_NETWORK: '0' }, { ELITE_DATA_DIR: 'C:\\Ailleurs' }, { ELITE_JOURNAL_DIR: 'C:\\Ailleurs' }, { ELITE_PORT: '3001' }, { TZ: 'UTC' }]) {
    await assert.rejects(demarrerServeur({ seance: 'colonisation-exemples', env }), /Variables réservées au banc/, JSON.stringify(env));
  }
  await assert.rejects(demarrerServeur({ seance: 'colonisation-exemples', maintenant: '2026-11-07T14:00:00' }), /Heure figée illisible/);
  await assert.rejects(demarrerServeur({ seance: 'colonisation-exemples', mode: 'vite' }), /Mode inconnu/);
});
