// Vérification contre EDSY lui-même : les chiffres affichés par edsy.org pour les builds du corpus (et deux builds
// d'armes en plus) doivent sortir de nos calculs. Relevés le 7 nov. 2026 dans edsy-readings.json : chaque build a été
// ouvert dans edsy.org par son lien (encodeEdsy), et les valeurs exactes des cases de statistiques ont été lues.
// Rotation : la réserve de carburant compte dans la masse, comme chez EDSY (banc EDSY du 15 nov. 2026, famille 6) ;
// plus de tolérance propre. Écart connu, donc exclu :
//   - Imperial Hammer (X1, point d'emport 4) : EDSY le laisse tirer pendant ses rechargements sans recharger (cas
//     particulier qu'il marque lui-même comme douteux) ; DPS soutenu et durée du condensateur de X1 non comparés.
// Nécessite les données de référence, et le même eddb.js que celui des relevés (sinon ignoré). Les relevés ont été
// faits sur eddb 424029902 ; ils valent aussi pour 424029903, celui que download.js épingle (rejoués le 15 nov. 2026,
// toutes les valeurs identiques) : les deux empreintes sont admises, pour que ces tests tournent encore après
// « Mettre à jour les données ».

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { REF_DIR } from '../../../core/reference/download.js';
import { loadEddb } from '../../../core/reference/edsy.js';
import { computeStats } from '../stats.js';
import { fitModule, firingProfile } from '../attributes.js';

const readJson = (name) => JSON.parse(fs.readFileSync(new URL(name, import.meta.url), 'utf8'));
const readings = readJson('./edsy-readings.json');
const corpus = readJson('./corpus.json');
const eddbFile = `${REF_DIR}/edsy/eddb.js`;
// eddb 424029903 (EDSY 0f577f76, download.js) : relevés rejoués à l'identique le 15 nov. 2026
const ALSO_VALID = ['5bac16de91ab5a9812cd2e3cec08d078c47115f4f0765b91fad0db1ff0122f8a'];
const sha = fs.existsSync(eddbFile) ? createHash('sha256').update(fs.readFileSync(eddbFile)).digest('hex') : null;
const sameData = sha != null && (sha === readings.eddbSha256 || ALSO_VALID.includes(sha));
const eddb = sameData ? loadEddb(REF_DIR) : null;
const skip = !sameData && 'eddb.js absent ou différent de celui des relevés EDSY';

// GOLDEN_REQUIRED=1 : relevés ignorés = échec
test('EDSY : relevés vérifiés (GOLDEN_REQUIRED)', { skip: !process.env.GOLDEN_REQUIRED }, () => assert.ok(!skip, String(skip)));

const pick = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);

/** Écarts entre nos statistiques et les relevés d'EDSY d'un build (liste vide : tout concorde). */
function mismatches(stats, expected, ignored = []) {
  const out = [];
  for (const [path, want] of Object.entries(expected)) {
    if (ignored.includes(path)) continue;
    const got = pick(stats, path);
    let ok;
    if (want === 'NaN') ok = got == null || got === 0 || Number.isNaN(got); // EDSY affiche une erreur : pas de valeur chez nous
    else if (want === null) ok = got == null;
    else {
      const tol = 1e-6 * Math.max(1, Math.abs(want));
      ok = typeof got === 'number' && Math.abs(got - want) <= tol;
    }
    if (!ok) out.push(`${path} : EDSY ${want}, nous ${got}`);
  }
  return out;
}

test('EDSY : statistiques des 20 builds du corpus (énergie, saut, vitesse, rotation, bouclier, coque, DPS, condensateur, prix)', { skip }, () => {
  const ids = Object.keys(readings.cases);
  assert.equal(ids.length, corpus.cases.length);
  for (const c of corpus.cases) {
    const diffs = mismatches(computeStats(eddb, c.build), readings.cases[c.id]);
    assert.deepEqual(diffs, [], `${c.id} ${c.label}`);
  }
});

test('EDSY : builds d\'armes supplémentaires (statistiques et DPS en rafale de chaque arme)', { skip }, () => {
  for (const x of readings.extra) {
    const stats = computeStats(eddb, x.build);
    const ignored = x.id === 'X1' ? ['armament.sustained', 'armament.wepTime'] : [];
    assert.deepEqual(mismatches(stats, x.stats, ignored), [], x.id);
    for (const [slot, dps] of Object.entries(x.weapons)) {
      const line = stats.armament.list.find((w) => w.slot === Number(slot));
      assert.ok(Math.abs(line.bdps - dps) < 1e-6, `${x.id} arme ${slot} : EDSY ${dps}, nous ${line.bdps}`);
    }
  }
});

// Emplacements du journal des builds supplémentaires (points d'emport numérotés par taille, propulseurs)
const SIZE_NAMES = { 1: 'Small', 2: 'Medium', 3: 'Large', 4: 'Huge' };
function slotOf(ship, journalSlot) {
  if (journalSlot === 'MainEngines') return ['component', 2];
  const count = {};
  const sizes = ship.slots.hardpoint;
  for (let i = 0; i < sizes.length; i++) {
    count[sizes[i]] = (count[sizes[i]] || 0) + 1;
    if (`${SIZE_NAMES[sizes[i]]}Hardpoint${count[sizes[i]]}` === journalSlot) return ['hardpoint', i];
  }
  return null;
}

test('EDSY : attributs modifiés (chargeur arrondi à la rafale, Longue portée, vitesse des projectiles, propulseurs)', { skip }, () => {
  const byFrontierName = new Map(Object.values(eddb.attributes).filter((a) => a?.fdattr).map((a) => [a.fdattr, a.attr]));
  let compared = 0;
  for (const x of readings.extra) {
    const ship = eddb.ship[x.build.shipId];
    for (const [journalSlot, values] of Object.entries(x.modifiers)) {
      const [group, index] = slotOf(ship, journalSlot);
      const m = fitModule(eddb, ship, x.build.slots[group][index]);
      const profile = group === 'hardpoint' ? firingProfile(m) : null;
      for (const [label, want] of Object.entries(values)) {
        // Cadence et DPS : grandeurs dérivées, calculées par firingProfile
        let got = label === 'RateOfFire' ? profile?.burstRate : label === 'DamagePerSecond' ? profile?.burstDps : m.value(byFrontierName.get(label));
        // EDSY donne les résistances et bonus en fraction, nous en % ; l'export arrondit à 6 décimales
        if (Math.abs(got - want) > 1e-5 * Math.max(1, Math.abs(want)) && Math.abs(got / 100 - want) < 1e-6) got /= 100;
        assert.ok(Math.abs(got - want) <= 1e-5 * Math.max(1, Math.abs(want)), `${x.id} ${journalSlot} ${label} : EDSY ${want}, nous ${got}`);
        compared++;
      }
    }
  }
  assert.ok(compared > 40);
});
