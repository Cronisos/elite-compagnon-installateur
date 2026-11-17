// Étape 26-overlay, sans lancer Electron : verdict sur la version d'Electron (calendrier, attente déclarée, versions
// cohérentes), jugement d'un rapport d'essai (conforme, puis celui de l'overlay d'avant les gardes), et adresse
// 127.0.0.1 partout (overlay, lanceur, interface).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { RACINE } from '../banc/chemins.mjs';
import { juger, pageSonde } from '../electron/essai.mjs';
import { ATTENTES, CALENDRIER, dansLaPlage, lireVersions, suiviDe, verdictElectron } from '../electron/version.mjs';

const autorises = (v) => ({ [`electron@${v}`]: true, 'esbuild@0.21.5': true });

test('calendrier d’Electron : fins de suivi relevées, estimées au-delà (8 semaines par version)', () => {
  assert.deepEqual(suiviDe(33), { sortie: '2024-10-14', fin: '2025-04-28', estimee: false });
  assert.deepEqual(suiviDe(45), { sortie: '2026-10-20', fin: '2027-04-27', estimee: false });
  assert.deepEqual(suiviDe(48), { sortie: '2027-04-27', fin: '2027-10-12', estimee: true });
  assert.deepEqual(suiviDe(28), { sortie: null, fin: '2024-06-10', estimee: false });
  assert.equal(suiviDe(12).fin, CALENDRIER[0][1]);
  for (let i = 1; i < CALENDRIER.length; i++) assert.equal(CALENDRIER[i][0], CALENDRIER[i - 1][0] + 1, 'aucune version oubliée');
});

test('plage d’overlay/package.json', () => {
  assert.equal(dansLaPlage('33.4.11', '^33.2.0'), true);
  assert.equal(dansLaPlage('45.2.3', '^33.2.0'), false, 'le ^ ne sort jamais de la 33');
  assert.equal(dansLaPlage('33.1.0', '^33.2.0'), false);
  assert.equal(dansLaPlage('45.2.3', '~45.2.0'), true);
  assert.equal(dansLaPlage('45.3.0', '~45.2.0'), false);
  assert.equal(dansLaPlage('45.2.3', '45.2.3'), true);
  assert.equal(dansLaPlage('45.2.3', 'latest'), false);
});

test('Electron 33 hors suivi : échec sans attente déclarée, avertissement avec elle', () => {
  const sans = verdictElectron({ installee: '33.4.11', plage: '^33.2.0', autorises: autorises('33.4.11'), aujourdhui: '2026-11-08', attentes: [] });
  assert.equal(sans.niveau, 'echec');
  assert.match(sans.message, /33\.4\.11 n’a plus de correctifs de sécurité depuis le 2025-04-28 \(559 jours\)/);
  const avec = verdictElectron({ installee: '33.4.11', plage: '^33.2.0', autorises: autorises('33.4.11'), aujourdhui: '2026-11-08', attentes: [{ version: '33.4.11', raison: 'passage à Electron 45 prévu à l’étape M2 (npm install dans l’app principale, sur décisions de l’auteur)' }] });
  assert.equal(avec.niveau, 'avertissement');
  assert.match(avec.message, /mise à jour en attente, passage à Electron 45 prévu à l’étape M2/);
  // Avant la fin du suivi, la 33 passait ; et une version qui n'est pas en attente échoue
  assert.equal(verdictElectron({ installee: '33.4.11', plage: '^33.2.0', autorises: autorises('33.4.11'), aujourdhui: '2025-01-01', attentes: [] }).niveau, 'ok');
  assert.equal(verdictElectron({ installee: '34.0.0', plage: '^34.0.0', autorises: autorises('34.0.0'), aujourdhui: '2026-11-08', attentes: [] }).niveau, 'echec');
});

test('Electron 45 : suivi aujourd’hui, échec après sa fin (ou après la fin estimée d’une version future)', () => {
  const ok = verdictElectron({ installee: '45.2.3', plage: '^45.2.3', autorises: autorises('45.2.3'), aujourdhui: '2026-11-09', attentes: [] });
  assert.deepEqual([ok.niveau, ok.message], ['ok', 'Electron 45.2.3 suivi jusqu’au 2027-04-27']);
  assert.equal(verdictElectron({ installee: '45.2.3', plage: '^45.2.3', autorises: autorises('45.2.3'), aujourdhui: '2027-04-27', attentes: [] }).niveau, 'echec');
  const futur = verdictElectron({ installee: '50.0.1', plage: '^50.0.0', autorises: autorises('50.0.1'), aujourdhui: '2028-06-01', attentes: [] });
  assert.equal(futur.niveau, 'echec');
  assert.match(futur.message, /estimée au/);
});

test('l’attente de la 33 est retirée depuis M2 (9 nov. 2026)', async () => {
  const { ATTENTES } = await import('../electron/version.mjs');
  assert.deepEqual(ATTENTES, []);
});

test('attente périmée (mise à jour faite) ou version suivie encore en attente : échec, à retirer', () => {
  const apresM2 = verdictElectron({ installee: '45.2.3', plage: '^45.2.3', autorises: autorises('45.2.3'), aujourdhui: '2026-11-09', attentes: [{ version: '33.4.11', raison: 'passage à Electron 45 prévu à l’étape M2 (npm install dans l’app principale, sur décisions de l’auteur)' }] });
  assert.equal(apresM2.niveau, 'echec');
  assert.match(apresM2.message, /attente périmée pour 33\.4\.11/);
  const suivie = verdictElectron({ installee: '45.2.3', plage: '^45.2.3', autorises: autorises('45.2.3'), aujourdhui: '2026-11-09', attentes: [{ version: '45.2.3', raison: 'x' }] });
  assert.equal(suivie.niveau, 'echec');
  assert.match(suivie.message, /encore suivi/);
});

test('versions incohérentes : plage d’overlay/package.json ou allowScripts en retard sur la version installée', () => {
  const plage = verdictElectron({ installee: '45.2.3', plage: '^33.2.0', autorises: autorises('45.2.3'), aujourdhui: '2026-11-09', attentes: [] });
  assert.equal(plage.niveau, 'echec');
  assert.match(plage.message, /overlay\/package\.json demande « \^33\.2\.0 »/);
  const scripts = verdictElectron({ installee: '45.2.3', plage: '^45.2.3', autorises: autorises('33.4.11'), aujourdhui: '2026-11-09', attentes: [] });
  assert.match(scripts.message, /allowScripts .*electron@45\.2\.3/);
  const deux = verdictElectron({ installee: '45.2.3', plage: '^45.2.3', autorises: { ...autorises('45.2.3'), 'electron@33.4.11': true }, aujourdhui: '2026-11-09', attentes: [] });
  assert.equal(deux.niveau, 'echec', 'une ancienne autorisation qui traîne');
  assert.equal(verdictElectron({ installee: 'n/a', plage: '^45.2.3', autorises: {}, aujourdhui: '2026-11-09' }).niveau, 'echec');
});

test('dépôt actuel : versions cohérentes, et l’attente déclarée est exactement la version installée', () => {
  const v = lireVersions(RACINE);
  assert.ok(dansLaPlage(v.installee, v.plage), `${v.installee} hors de ${v.plage}`);
  assert.equal(v.autorises[`electron@${v.installee}`], true);
  for (const a of ATTENTES) assert.equal(a.version, v.installee, 'attente à retirer après la mise à jour');
});

// --- Jugement d'un rapport d'essai ---

const URL_COMBAT = 'http://127.0.0.1:41000/hud/combat';
function rapportConforme() {
  return {
    rapport: {
      version: '33.4.11',
      chrome: '130.0.6723.191',
      gestionnaires: { demande: true, verification: true, peripheriques: true, requetes: true },
      demandes: [{ permission: 'notifications', accordee: false }, { permission: 'clipboard-read', accordee: false }],
      verifications: [{ permission: 'media', accordee: false }],
      sansGestionnaire: [],
      captures: 0,
      copies: [],
      focus: 0,
      hauteurs: { depart: 124, apres: 124 },
      pages: [
        {
          url: URL_COMBAT,
          etape: 'essais',
          pont: ['capture', 'copy'],
          permissions: { camera: 'denied', microphone: 'denied', notifications: 'denied', geolocation: 'denied', 'clipboard-read': 'denied' },
          notification: { etat: 'denied', demande: 'denied' },
          peripheriques: { nombre: 2, avecNom: 0 },
          lecturePressePapiers: 'refus NotAllowedError',
          fetchAilleurs: 'bloqué',
          fetchIci: 'passé',
          imageAilleurs: 'bloqué',
          imageIci: 'passé',
          imageData: 'passé',
          wsAilleurs: 'bloqué',
          modeDeplacement: [],
          capture: null,
        },
        { url: URL_COMBAT, etape: 'apres-navigation', chemin: '/hud/combat' },
        { url: URL_COMBAT, etape: 'rechargee' },
      ],
      journal: ['Overlay chargé : http://127.0.0.1:41000/hud/combat', '[combat] marque-erreur-du-banc'],
      course: { avant: 1, apresCourse: 1, apresFermeture: 0 },
      ordres: { apresPerime: 1, apresRecent: 0, siLance: 1, siLanceFerme: 0 },
      canal: { branche: true, ouverte: true, rangee: true, memeFenetre: true, reaffichee: true },
      erreurs: [],
      fin: 'fin de l’essai',
    },
    interface: [{ methode: 'GET', chemin: '/hud/combat' }, { methode: 'GET', chemin: '/api/banc' }, { methode: 'GET', chemin: '/banc.gif' }, { methode: 'GET', chemin: '/hud/combat' }],
    ailleurs: [],
  };
}

test('rapport conforme : aucun écart', () => {
  const constats = juger(rapportConforme());
  assert.ok(constats.length >= 18, `${constats.length} constats`);
  assert.deepEqual(constats.filter((c) => c.ecart), []);
});

test('rapport de l’overlay d’avant les gardes (relevé dans le vrai Electron 33) : chaque faille est vue', () => {
  const e = rapportConforme();
  const r = e.rapport;
  Object.assign(r.gestionnaires, { demande: false, verification: false, peripheriques: false, requetes: false });
  r.demandes = [];
  r.sansGestionnaire = ['notifications', 'openExternal'];
  Object.assign(r.pages[0], { permissions: { camera: 'granted', microphone: 'granted', notifications: 'granted', geolocation: 'granted', 'clipboard-read': 'granted' }, notification: { etat: 'granted', demande: 'denied' }, peripheriques: { nombre: 10, avecNom: 10 }, fetchAilleurs: 'passé', modeDeplacement: [true] });
  r.pages = r.pages.filter((p) => p.etape !== 'rechargee');
  Object.assign(r, { captures: 1, copies: ['copie de la sonde'], focus: 1, hauteurs: { depart: 124, apres: 900 }, course: { avant: 1, apresCourse: 1, apresFermeture: 1 }, ordres: { apresPerime: 1, apresRecent: 1 }, canal: { branche: false } });
  e.interface = [{ methode: 'GET', chemin: '/hud/combat' }, { methode: 'GET', chemin: '/fuite-cadre' }];
  e.ailleurs = [{ methode: 'GET', chemin: '/fuite-fetch' }, { methode: 'UPGRADE', chemin: '/fuite-ws' }];
  const ecarts = juger(e).filter((c) => c.ecart).map((c) => c.nom);
  for (const nom of [
    'Permissions : gestionnaires posés', 'Permissions : toute demande refusée par main.js', 'Permissions vues par la page', 'Notifications',
    'Périphériques (micro, caméra)', 'Requêtes vers un autre port de ce PC', 'Cadre inclus (iframe)', 'Cadre principal : rechargement (Vite)',
    'Pont : photo de l’écran demandée par la page', 'Pont : copie demandée par une autre fenêtre que le Coup d’œil',
    'Pont : mode déplacement (clavier) demandé par la page seule', 'Pont : hauteur demandée par Combat', 'Fermée puis rouverte aussitôt', 'Ordres qui se croisent', 'Canal du serveur (overlay/canal.js)',
  ]) assert.ok(ecarts.includes(nom), `écart attendu : ${nom}`);
});

test('canal : fenêtre Signaux détruite ou recréée au lieu d’être rangée puis réaffichée : écart', () => {
  const ecart = (canal) => {
    const e = rapportConforme();
    e.rapport.canal = canal;
    return juger(e).find((c) => c.nom === 'Canal du serveur (overlay/canal.js)').ecart;
  };
  assert.match(ecart({ branche: true, ouverte: true, rangee: false }), /détruite/);
  assert.match(ecart({ branche: true, ouverte: true, rangee: true, memeFenetre: false }), /recréée/);
  assert.match(ecart(undefined), /jamais branché/);
});

test('rapport sans page de sonde, ou essai interrompu : écart, jamais « conforme » par défaut', () => {
  const e = rapportConforme();
  e.rapport.pages = [];
  e.rapport.fin = 'délai de 40 s dépassé';
  const c = juger(e);
  assert.equal(c.length, 1);
  assert.match(c[0].ecart, /la page de sonde n’a rien rapporté ; fin : délai/);
});

test('page de sonde : aucune adresse hors de ce PC', () => {
  const page = pageSonde('http://127.0.0.1:41001');
  const adresses = [...page.matchAll(/\b(?:https?|wss?):\/\/[^\s'"`)]+/g)].map((m) => m[0]);
  assert.ok(adresses.length > 0);
  for (const a of adresses) assert.match(a, /^(?:http|ws):\/\/127\.0\.0\.1:41001/, a);
  assert.match(page, /mailto:controle@example\.invalid/, 'adresse réservée (.invalid) : rien ne part même si la garde manquait');
});

// --- 127.0.0.1 partout ---

test('overlay et lanceur : 127.0.0.1:5173, jamais « localhost:5173 »', () => {
  const require = createRequire(import.meta.url);
  assert.equal(require(path.join(RACINE, 'overlay', 'guards.js')).UI_ORIGIN, 'http://127.0.0.1:5173');
  const main = fs.readFileSync(path.join(RACINE, 'overlay', 'main.js'), 'utf8');
  assert.doesNotMatch(main, /localhost:5173/);
  const lanceur = fs.readFileSync(path.join(RACINE, 'Lancer EliteApp.cmd'), 'utf8');
  // Fins de ligne de Windows : avec des LF seuls, cmd peut rater un label (goto wait, goto open) selon la taille du fichier
  assert.doesNotMatch(lanceur, /(^|[^\r])\n/, 'Lancer EliteApp.cmd en CRLF');
  const lignes = lanceur.split(/\r?\n/).filter((l) => !/^\s*rem\b/i.test(l));
  assert.ok(lignes.includes('set "ELECTRON_RUN_AS_NODE="'), 'le lanceur retire ELECTRON_RUN_AS_NODE');
  assert.ok(lignes.includes('start "" "node_modules\\electron\\dist\\electron.exe" "%~dp0desktop"'), "le lanceur ouvre l'app de bureau");
  // L'app de bureau sert l'interface sur la même adresse que l'overlay attend
  // (127.0.0.1, et le port de ce lancement : 5173 d'habitude, un autre libre s'il est pris, desktop/ports.js)
  const iface = fs.readFileSync(path.join(RACINE, 'desktop', 'interface.mjs'), 'utf8');
  assert.match(iface, /UI_URL = `http:\/\/127\.0\.0\.1:\$\{uiPort\(\)\}`/);
  assert.match(iface, /: 5173;\n\}/, 'port d’habitude : 5173');
  const bureau = fs.readFileSync(path.join(RACINE, 'desktop', 'main.js'), 'utf8');
  assert.match(bureau, /let UI = 'http:\/\/127\.0\.0\.1:5173'/);
  assert.match(bureau, /UI = `http:\/\/127\.0\.0\.1:\$\{ports\.interface\}`/);
  assert.ok(!lignes.some((l) => /localhost/i.test(l)), 'aucun « localhost » dans les commandes du lanceur');
});
