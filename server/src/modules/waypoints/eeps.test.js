// Bibliothèque des EEP balayés (eeps.js) : reconnaissance de l'EEP où l'on est, nouveau centre ou reprise, reprise de
// l'ancien balayage unique, partage (export, import relu sans confiance).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EepLibrary } from './eeps.js';

const R = 2957164.25; // rayon de la planète (m)
const BODY = 'Planète Test 4';
// Position à `nord` mètres au nord d'un point de latitude 0 (1° ≈ R × π / 180 m)
const ici = (lat, lon, extra = {}) => ({ latitude: lat, longitude: lon, body: BODY, system: 'Système Test', planetRadius: R, vehicle: 'srv', heading: 0, ...extra });
const metresEnDegres = (m) => (m / R) * (180 / Math.PI);

function eepBalaye(lib, lat, lon, rayon = 3000, site = null) {
  lib.marquerCentre(ici(lat, lon), site);
  lib.sweep.setEdge(ici(lat + metresEnDegres(rayon), lon));
  return lib.actif;
}

test('EEP actif : centre marqué sans bord, il le reste en roulant vers le bord (même à 4,5 km, même chez un voisin)', () => {
  const lib = new EepLibrary();
  const voisin = eepBalaye(lib, 0, metresEnDegres(8000));
  const e = lib.marquerCentre(ici(0, 0));
  lib.follow(ici(0, metresEnDegres(4500)));
  assert.equal(lib.actif.id, e.id, 'à 4,5 km du centre, bord pas encore marqué');
  lib.follow(ici(0, metresEnDegres(6000)));
  assert.equal(lib.actif.id, e.id, 'dans le disque du voisin : toujours le balayage en cours');
  lib.sweep.setEdge(ici(0, metresEnDegres(4500)));
  lib.follow(ici(0, metresEnDegres(8000)));
  assert.equal(lib.actif.id, voisin.id, 'bord marqué : on suit de nouveau les disques');
  lib.marquerCentre(ici(10, 10));
  lib.follow(ici(10, 10 + metresEnDegres(31000)));
  assert.equal(lib.actif, null, 'au-delà de 30 km : plus d’EEP actif');
});

test('EEP actif : celui dont le disque te contient ; aucun ailleurs sur la planète ; inchangé en vol', () => {
  const lib = new EepLibrary();
  const a = eepBalaye(lib, 0, 0);
  const b = eepBalaye(lib, 10, 10);
  assert.equal(lib.eeps.length, 2);
  lib.follow(ici(metresEnDegres(1000), 0));
  assert.equal(lib.actif.id, a.id);
  lib.follow(ici(10, 10 + metresEnDegres(500)));
  assert.equal(lib.actif.id, b.id);
  assert.equal(lib.follow(ici(-20, 40)), true, 'loin de tout EEP : plus d’EEP actif');
  assert.equal(lib.actif, null);
  assert.equal(lib.sweep.state, 'empty');
  lib.follow(ici(0, 0));
  assert.equal(lib.follow({ body: BODY }), false, 'en vol : rien ne change');
  assert.equal(lib.actif.id, a.id);
});

test('nouveau centre : dans un EEP balayé, il repart de là ; ailleurs, un nouvel EEP avec le numéro du jeu', () => {
  const lib = new EepLibrary();
  const a = eepBalaye(lib, 0, 0);
  lib.renommer(a.id, 'Le bon coin');
  lib.marquerCentre(ici(metresEnDegres(200), 0));
  assert.equal(lib.eeps.length, 1);
  assert.equal(lib.actif.nom, 'Le bon coin');
  assert.equal(lib.actif.sweep.state, 'center');
  const b = lib.marquerCentre(ici(5, 5), { body: BODY, number: 7 });
  assert.equal(lib.eeps.length, 2);
  assert.equal(b.numero, 7);
  // Numéro appris plus tard, en roulant dans l'EEP
  lib.follow(ici(0, 0), { body: BODY, number: 3 });
  assert.equal(lib.actif.numero, 3);
});

test('reprise de l’ancien balayage unique (sweep.json), et relecture sans confiance', () => {
  const seul = new EepLibrary();
  eepBalaye(seul, 0, 0);
  const ancien = seul.sweep.toJSON();
  const lib = EepLibrary.fromJSON(null, ancien);
  assert.equal(lib.eeps.length, 1);
  assert.equal(lib.eeps[0].sweep.radius > 2900, true);
  const relu = EepLibrary.fromJSON({ actif: 'x', eeps: [null, { id: 3 }, { id: 'a', center: null }, ...JSON.parse(JSON.stringify(lib)).eeps] });
  assert.equal(relu.eeps.length, 1);
  assert.equal(relu.actifId, null);
});

test('partage : export de la carte et des repères du disque, import en EEP « reçu », fichier piégé refusé', () => {
  const lib = new EepLibrary();
  const a = eepBalaye(lib, 0, 0, 3000, { body: BODY, number: 4 });
  lib.renommer(a.id, 'Platine nord');
  const marks = [
    { id: 1, label: 'Platine', ore: 'Platine', body: BODY, latitude: metresEnDegres(500), longitude: 0, category: 'mining', drills: 3 },
    { id: 2, label: 'Loin', ore: 'Or', body: BODY, latitude: 5, longitude: 5, category: 'mining' },
  ];
  const carte = lib.exporter(a, marks);
  assert.equal(carte.format, 'elite-compagnon-eep');
  assert.equal(carte.numero, 4);
  assert.deepEqual(carte.reperes.map((r) => [r.ore, r.drills]), [['Platine', 3]]);
  const autre = new EepLibrary();
  const { eep, reperes } = autre.importer(JSON.parse(JSON.stringify(carte)));
  assert.equal(eep.nom, 'Platine nord (reçu)');
  assert.equal(eep.sweep.state, 'ready');
  assert.equal(Math.round(eep.sweep.view(null, []).covered * 100), Math.round(lib.sweep.view(null, []).covered * 100));
  assert.equal(reperes.length, 1);
  assert.throws(() => autre.importer({ format: 'autre' }), /pas une carte/);
  assert.throws(() => autre.importer({ ...carte, radius: 1e9 }), /rayon/);
  assert.throws(() => autre.importer({ ...carte, center: { ...carte.center, latitude: 400 } }), /centre/);
  assert.equal(autre.importer({ ...carte, nom: 'x'.repeat(500), reperes: [{ latitude: 'a' }, null] }).reperes.length, 0);
});

test('import : l’EEP n’entre dans la bibliothèque qu’à « ajouter » (après la création des repères)', () => {
  const lib = new EepLibrary();
  const carte = lib.exporter(eepBalaye(lib, 0, 0), []);
  const autre = new EepLibrary();
  const { eep } = autre.importer(JSON.parse(JSON.stringify(carte)));
  assert.equal(autre.eeps.length, 0, 'rien d’ajouté tant que les repères ne sont pas créés');
  autre.ajouter(eep);
  assert.equal(autre.eeps.length, 1);
});

test('import tout ou rien : si la base refuse les repères, l’EEP reçu est retiré ; la place est prise avant d’écrire', async () => {
  const lib = new EepLibrary();
  const carte = JSON.parse(JSON.stringify(lib.exporter(eepBalaye(lib, 0, 0), [])));
  const autre = new EepLibrary();
  const { eep } = autre.importer(carte);
  await assert.rejects(autre.ajouterAvec(eep, async () => { throw new Error('base refusée'); }), /base refusée/);
  assert.equal(autre.eeps.length, 0, 'pas d’EEP sans ses repères');
  // Deux imports en même temps dans une bibliothèque à une place de la fin : le second est refusé avant d’écrire
  for (let i = 0; i < 499; i++) autre.ajouter(autre.importer(carte).eep);
  let ecrit = 0;
  let relache;
  const attente = new Promise((r) => { relache = r; });
  const a = autre.importer(carte).eep;
  const b = autre.importer(carte).eep; // les deux passent le contrôle de la carte reçue
  const premier = autre.ajouterAvec(a, async () => { await attente; ecrit++; });
  await assert.rejects(autre.ajouterAvec(b, async () => { ecrit++; }), (e) => e.status === 409);
  relache();
  await premier;
  assert.equal(ecrit, 1, 'aucun repère créé pour l’import refusé');
  assert.equal(autre.eeps.length, 500);
});

test('import piégé (M5) : zone balayée, date, rayon de planète et numéro relus sans confiance, sans geler le serveur', () => {
  const lib = new EepLibrary();
  const carte = JSON.parse(JSON.stringify(lib.exporter(eepBalaye(lib, 0, 0), [])));
  const autre = new EepLibrary();
  for (const covered of [{ length: 4e9 }, [1, 2, 3], 'pas du base64 !', 'A'.repeat(5_000_000), 'AAAA']) {
    const debut = performance.now();
    assert.throws(() => autre.importer({ ...carte, covered }), (e) => e.status === 400 && /zone balayée/.test(e.message));
    assert.ok(performance.now() - debut < 50, 'refusé tout de suite');
  }
  assert.equal(autre.importer({ ...carte, covered: null }).eep.sweep.view(null, []).covered, 0, 'sans zone balayée : on repart de rien');
  assert.throws(() => autre.importer({ ...carte, center: { ...carte.center, planetRadius: 1e309 } }), /rayon de la planète/);
  assert.throws(() => autre.importer({ ...carte, center: { ...carte.center, planetRadius: 0.5 } }), /rayon de la planète/);
  const { eep } = autre.importer({ ...carte, numero: 1e300, startedAt: { piege: true } });
  assert.equal(eep.numero, null);
  assert.equal(eep.sweep.startedAt, null);
  assert.equal(autre.importer({ ...carte, startedAt: 'hier soir' }).eep.sweep.startedAt, null);
  assert.equal(autre.importer({ ...carte, numero: 7 }).eep.numero, 7);
  assert.equal(autre.eeps.length, 0);
});

test('EEP actif (B46) : inchangé en survol bas au-dessus d’un autre EEP, il suit au sol (SRV, à pied, posé)', () => {
  const lib = new EepLibrary();
  const a = eepBalaye(lib, 0, 0);
  const b = eepBalaye(lib, 10, 10);
  lib.follow(ici(0, 0));
  assert.equal(lib.actif.id, a.id);
  assert.equal(lib.follow(ici(10, 10, { vehicle: 'ship', grounded: false })), false, 'survol : Status.json donne la position, mais on vole');
  assert.equal(lib.actif.id, a.id);
  assert.equal(lib.follow(ici(10, 10, { vehicle: 'ship', grounded: true })), true, 'vaisseau posé dans le disque de b');
  assert.equal(lib.actif.id, b.id);
  lib.follow(ici(0, 0, { vehicle: 'onfoot' }));
  assert.equal(lib.actif.id, a.id, 'à pied');
});
