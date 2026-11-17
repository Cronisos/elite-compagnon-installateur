// Noms d'ingénieurs : coriolis ne les écrit pas comme le journal (Tod "The Blaster" McQuinn, « Felicty » Farseer).
// Testé sur des données de référence minimales écrites dans un dossier temporaire : rien ne dépend des données
// téléchargées.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DAMAGED_PREFIX, engineerKey, getReference, loadReference, readReference } from './refdata.js';

const TOD = "Tod 'The Blaster' McQuinn"; // FDevIDs engineers.csv et le journal
const TOD_CORIOLIS = 'Tod "The Blaster" McQuinn'; // coriolis/modifications/modules.json

/** Données de référence minimales : deux ingénieurs (FDevIDs), deux modifications écrites comme coriolis. */
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-ref-'));
  const put = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  };
  put('meta.json', '{}');
  put('fdevids/material.csv', 'id,symbol,rarity,type,category,name\n1,Iron,1,Raw,4,Iron\n');
  put('fdevids/outfitting.csv', 'id,symbol,category,name,mount,guidance,ship,class,rating,entitlement\n');
  put('fdevids/shipyard.csv', 'id,symbol,name,entitlement\n');
  put('fdevids/engineers.csv', `id,system_address,market_id,name\n300100,1,128676487,Felicity Farseer\n300260,2,128679111,${TOD}\n`);
  put('coriolis/modules/vide.json', '{}');
  put('coriolis/ships/vide.json', '{}');
  put('coriolis/modifications/blueprints.json', '{}');
  put('coriolis/modifications/specials.json', '{}');
  const grades = (names) => Object.fromEntries([1, 2, 3, 4, 5].map((g) => [g, { engineers: names }]));
  put('coriolis/modifications/modules.json', JSON.stringify({
    mc: { blueprints: { Weapon_Overcharged: { grades: grades([TOD_CORIOLIS, 'Zacariah Nemo']) } } },
    t: { blueprints: { Engine_Dirty: { grades: grades(['Felicty Farseer', 'Felicity Farseer', 'Professor Palin']) } } },
  }));
  return dir;
}

test('engineerKey : guillemets droits ou typographiques, simples ou doubles, espaces et casse ramenés à une forme', () => {
  const k = engineerKey(TOD);
  for (const n of [TOD_CORIOLIS, 'Tod “The Blaster” McQuinn', 'Tod ‘The Blaster’ McQuinn', '  tod  "the blaster"   mcquinn ']) assert.equal(engineerKey(n), k, n);
  assert.equal(engineerKey('Felicty Farseer'), engineerKey('Felicity Farseer'), 'coquille de coriolis');
  assert.notEqual(engineerKey('Lei Cheung'), engineerKey('Liz Ryder'));
  assert.equal(engineerKey(null), '');
});

test('engineersFor : les noms de coriolis sont ceux du journal (Tod McQuinn, Felicity Farseer), sans doublon', () => {
  const dir = fixture();
  try {
    const ref = loadReference(dir);
    assert.deepEqual(ref.engineersFor('mc', 'Weapon_Overcharged', 5), [TOD, 'Zacariah Nemo'], 'Tod au nom du journal ; un nom inconnu de FDevIDs reste tel quel');
    assert.deepEqual(ref.engineersFor('t', 'Engine_Dirty', 1), ['Felicity Farseer', 'Professor Palin'], '« Felicty » et « Felicity » : un seul ingénieur');
    assert.equal(ref.engineerName(TOD_CORIOLIS), TOD);
    assert.ok(ref.engineerBases.has(ref.engineersFor('mc', 'Weapon_Overcharged', 1)[0]), 'sa base (atelier) se retrouve par ce nom');
    assert.deepEqual(ref.engineersFor('mc', 'Inconnue', 1), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('données abîmées : jamais d’erreur levée, le fichier en cause nommé (le serveur démarre, le bouton qui répare reste là)', () => {
  const dir = fixture();
  try {
    fs.writeFileSync(path.join(dir, 'coriolis', 'ships', 'adder.json'), '{"adder": {"edID": 1, "prop'); // tronqué
    const r = readReference(dir);
    assert.equal(r.ref, null);
    assert.ok(r.error.startsWith(DAMAGED_PREFIX), r.error);
    assert.match(r.error, /coriolis\/ships\/adder\.json : contenu invalide/);
    assert.match(r.error, /Mettre à jour les données/);
    assert.doesNotMatch(r.error, /Expected|JSON|position|Unterminated/, 'pas d’erreur technique en anglais pour le joueur');
    assert.equal(r.detail, 'coriolis/ships/adder.json : contenu invalide');
    assert.equal(loadReference(dir), null, 'abîmées : comme absentes pour les modules');
    // Un fichier illisible (dossier à la place) : nommé aussi
    fs.rmSync(path.join(dir, 'coriolis', 'ships', 'adder.json'));
    const materiaux = fs.readFileSync(path.join(dir, 'fdevids', 'material.csv'));
    fs.rmSync(path.join(dir, 'fdevids', 'material.csv'));
    fs.mkdirSync(path.join(dir, 'fdevids', 'material.csv'));
    assert.match(readReference(dir).error, /fdevids\/material\.csv : illisible\) :/);
    assert.doesNotMatch(readReference(dir).error, /EISDIR|illegal operation/);
    fs.rmSync(path.join(dir, 'fdevids', 'material.csv'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'fdevids', 'material.csv'), materiaux);
    // Sous-dossier manquant : le dossier est nommé (avant : « ENOENT: no such file or directory, scandir … »)
    fs.rmSync(path.join(dir, 'coriolis', 'ships'), { recursive: true });
    const manque = readReference(dir).error;
    assert.match(manque, /\(coriolis\/ships : illisible\) :/);
    assert.doesNotMatch(manque, /ENOENT|scandir/);
    // Jamais téléchargées : ni index ni erreur
    fs.rmSync(path.join(dir, 'meta.json'));
    assert.deepEqual(readReference(dir), { ref: null, error: null });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('données au format inattendu (JSON valide, mais pas la forme attendue) : « format inattendu », sans détail technique', () => {
  const dir = fixture();
  try {
    fs.writeFileSync(path.join(dir, 'coriolis', 'modifications', 'blueprints.json'), 'null');
    const r = readReference(dir);
    assert.equal(r.ref, null);
    assert.match(r.error, /^Données de référence abîmées \(format inattendu\) : retélécharge-les/);
    assert.doesNotMatch(r.error, /Cannot|undefined|null/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('cache commun : une seule copie, relue quand meta.json change (après « Mettre à jour les données »)', () => {
  const dir = fixture();
  try {
    let now = 1_000_000;
    const a = getReference(dir, { now });
    assert.ok(a.ref);
    assert.equal(getReference(dir, { now: (now += 10) }).ref, a.ref, 'même copie pour tous les modules');
    // Nouveau téléchargement : meta.json réécrit ; vu au plus tard une seconde après, ou tout de suite avec fresh
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ downloadedAt: 'nouveau' }));
    const b = getReference(dir, { fresh: true, now: (now += 10) });
    assert.notEqual(b.ref, a.ref, 'nouvelles données');
    assert.deepEqual(b.ref.meta, { downloadedAt: 'nouveau' });
    assert.equal(getReference(dir, { now: (now += 5000) }).ref, b.ref, 'meta.json inchangé : pas relu');
    // Abîmées après coup puis réparées : l'erreur suit meta.json
    fs.writeFileSync(path.join(dir, 'coriolis', 'modifications', 'specials.json'), '{');
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ downloadedAt: 'abîmé' }));
    const c = getReference(dir, { now: (now += 5000) });
    assert.equal(c.ref, null);
    assert.match(c.error, /specials\.json/);
    fs.writeFileSync(path.join(dir, 'coriolis', 'modifications', 'specials.json'), '{}');
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ downloadedAt: 'réparé' }));
    assert.ok(getReference(dir, { fresh: true, now: (now += 10) }).ref);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('remplacement coupé net : dossier absent et données restées en « .old » : remises en place au chargement', () => {
  const dir = fixture();
  const old = `${dir}.old`;
  try {
    fs.renameSync(dir, old); // coupure entre les deux renommages de replaceDir (download.js)
    const r = readReference(dir);
    assert.ok(r.ref, 'données retrouvées');
    assert.equal(fs.existsSync(old), false);
    assert.ok(fs.existsSync(path.join(dir, 'meta.json')));
    // Dossier en place : « .old » n'est jamais remis par-dessus
    fs.mkdirSync(old);
    fs.writeFileSync(path.join(old, 'meta.json'), '{"ancien":true}');
    assert.notDeepEqual(readReference(dir).ref.meta, { ancien: true });
    assert.ok(fs.existsSync(old));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(old, { recursive: true, force: true });
  }
});

test('shipKey : par l’identifiant Frontier, sinon par le nom (Corsair), sinon rien (vaisseau absent de coriolis)', () => {
  const dir = fixture();
  try {
    fs.writeFileSync(path.join(dir, 'coriolis/ships/vide.json'), JSON.stringify({
      federal_corvette: { edID: 128049369, properties: { name: 'Federal Corvette' } },
      imperial_corsair: { edID: 1, properties: { name: 'Corsair' } },
    }));
    fs.writeFileSync(path.join(dir, 'fdevids/shipyard.csv'), `id,symbol,name,entitlement
128049369,Federation_Corvette,Federal Corvette,
129032000,Corsair,Corsair,
129033000,MediumTransport01,Lynx Highliner,
`);
    const ref = loadReference(dir);
    assert.equal(ref.shipKey('federation_corvette'), 'federal_corvette');
    assert.equal(ref.shipKey('corsair'), 'imperial_corsair', 'identifiant différent : retrouvé par le nom');
    assert.equal(ref.shipKey('mediumtransport01'), null);
    assert.equal(ref.shipKey('imperial_corsair'), 'imperial_corsair', 'une clé coriolis reste elle-même');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
