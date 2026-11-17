// Tests du suivi des ventes sur un extrait réel des journaux de référence (fixtures/ventes-reelles.jsonl.gz) : les ventes à
// 0 mérite du rapport doivent ressortir avec la bonne cause, et les ventes créditées avec leurs vrais mérites.
//
// L'extrait garde les événements suivis par saleWatch.js (SALE_EVENTS), sur quatre fenêtres : 28 oct. 2026 14:22-15:11
// (commerce ICZ KC-U b3-4 ⇄ Cemiess, doublon de mérites retiré un quart d'heure plus tard), 28 oct. 16:20-16:56
// (même commerce, avec un doublon retiré à la ligne suivante), 29 oct. 10:00 - 31 oct. 23:12 (Gungnir → Talta,
// Mombaluma → Vequess, Mombaluma, Beta Muscae et le porteur, HIP 8060, Synuefe GA-I b57-6), et 5 nov. 21:00 - 6 nov.
// 09:41 (HIP 73834 → Synuefe OU-E c28-2). Chaque fenêtre commence par le dernier Powerplay et la dernière arrivée qui la
// précèdent. Seuls les champs utiles sont gardés ; les lignes Cargo sans effet sur le suivi et les noms traduits répétés
// des tonnes raffinées sont retirés ; l'indicatif et le marché du porteur sont remplacés (XXX-000, 1).
// Market.json : extrait réel de Flinders City, 7 nov. 2026.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { casesText } from './saleForecast.js';
import { SaleWatch, zeroCause } from './saleWatch.js';

const FIXTURES = new URL('./fixtures/', import.meta.url);
const events = zlib.gunzipSync(fs.readFileSync(new URL('ventes-reelles.jsonl.gz', FIXTURES))).toString('utf8')
  .split('\n').filter(Boolean).map((l) => JSON.parse(l));
const market = JSON.parse(fs.readFileSync(new URL('market-flinders-city.json', FIXTURES), 'utf8'));

function replay(list = events) {
  const w = new SaleWatch();
  w.cargo.learnMarket(market); // rares connus, comme au lancement de l'app
  for (const ev of list) w.apply(ev);
  w.flush(Date.parse('2026-11-07T00:00:00Z'));
  return w;
}
const real = replay();
const sale = (t, type) => real.cases.find((c) => c.t.startsWith(t) && c.type === type);

test('réel : les trois ventes de 1 184 t à 0 mérite et leur cause', () => {
  const vequess = sale('2026-10-30T00:01', 'iridium');
  assert.equal(vequess.count, 1184);
  assert.equal(vequess.merits, 0);
  assert.equal(vequess.cause, 'enemy');
  assert.match(vequess.text, /Vequess est Forteresse d'A\. Lavigny-Duval/);
  assert.deepEqual(vequess.lots.map((l) => [l.kind, l.system]), [['mined', 'Mombaluma']]);

  const hip = sale('2026-10-31T18:00', 'rhodplumsite');
  assert.equal(hip.merits, 0);
  assert.equal(hip.cause, 'empty');
  assert.match(hip.text, /HIP 8060 n'a aucune puissance/);

  const gai = sale('2026-10-31T23:09', 'iridium');
  assert.ok(Math.abs(gai.totalSale - 303.9e6) < 0.1e6);
  assert.equal(gai.merits, 0);
  assert.equal(gai.mode, 'acquisition');
  assert.equal(gai.cause, 'acq-mined-unsupported');
  assert.match(gai.text, /Miné à Synuefe GA-I b57-6 \(Inoccupé\) : en acquisition, il doit venir d'un système Consolidé ou Forteresse d'Aisling Duval/);
});

test('réel : minerai miné ailleurs puis vendu en renforcement, 0', () => {
  const talta = sale('2026-10-29T17:32', 'iridium');
  assert.equal(talta.count, 12);
  assert.equal(talta.merits, 0);
  assert.equal(talta.cause, 'reinf-mined-elsewhere');
  assert.match(talta.text, /Miné à Gungnir/);

  const oue = real.cases.filter((c) => c.t.startsWith('2026-11-06T09:3') && c.type === 'iridium');
  assert.equal(oue.length, 2);
  for (const c of oue) {
    assert.equal(c.merits, 0);
    assert.equal(c.cause, 'reinf-mined-elsewhere');
    assert.match(c.text, /HIP 73834/);
  }
});

test('réel : achat en acquisition hors système Consolidé ou Forteresse, 0', () => {
  const pd = sale('2026-10-31T18:56', 'palladium');
  assert.equal(pd.merits, 0);
  assert.equal(pd.cause, 'acq-bought-unsupported');
  assert.match(pd.text, /HIP 71601 \(sans puissance\)/);
});

test('réel : ventes créditées à Mombaluma, mérites exacts et ratio mesuré', () => {
  const ir = sale('2026-10-30T10:58', 'iridium');
  const pt = sale('2026-10-30T10:58', 'platinum');
  assert.equal(ir.merits, 173_355); // crédité 13 s après la vente
  assert.equal(pt.merits, 29_947);
  assert.equal(ir.cause, undefined);
  assert.ok(Math.abs(ir.ratio - 390) < 1);
  const r = real.ratio('iridium', 'mined', 'reinforcement');
  assert.equal(r.source, 'commodity');
  assert.ok(Math.abs(r.value - 390) < 1);
});

test('réel : rafale de ventes, gains dans le désordre et doublon retiré par le jeu', () => {
  const burst = (type) => sale('2026-10-28T16:52', type).merits;
  assert.equal(burst('beryllium'), 18);
  assert.equal(burst('gallium'), 15);
  assert.equal(burst('indium'), 79);
  assert.equal(burst('tantalum'), 1162);
  // Trajet vers Cemiess (Lavigny-Duval) : la bauxite y rapporte 0
  assert.equal(sale('2026-10-28T16:46', 'bauxite').cause, 'enemy');
});

test('réel : petite vente à 0 (hématite) et titane crédité', () => {
  assert.equal(sale('2026-11-06T09:39', 'titanium').merits, 2);
  const h = sale('2026-11-06T09:39', 'haematite');
  assert.equal(h.merits, 0);
  assert.equal(h.cause, 'tiny');
});

test('réel : le rhodplumsite de Beta Muscae passé au porteur y garde sa provenance', () => {
  const onCarrier = real.cargo.carrier.filter((l) => l.type === 'rhodplumsite');
  assert.ok(onCarrier.length > 0);
  assert.ok(onCarrier.every((l) => l.viaCarrier && l.kind === 'mined'));
  assert.ok(onCarrier.some((l) => l.system === 'Beta Muscae' && l.place.state === 'Stronghold'));
});

test('réel : ratio extrapolé en acquisition d\'après le renforcement, marqué comme tel', () => {
  const r = real.ratio('iridium', 'mined', 'acquisition');
  assert.equal(r.source, 'extrapolated');
  // Aucune sorte mesurée dans les deux modes dans l'extrait : règles publiées, +5 % en acquisition, -35 % en renforcement
  assert.equal(r.factorSource, 'published');
  assert.ok(Math.abs(r.factor - 1.05 / 0.65) < 1e-9);
  assert.ok(Math.abs(r.value - (390 * 1.05) / 0.65) < 3, String(r.value));
});

test('réel : doublon de mérites retiré un quart d\'heure après la vente, vente déjà close corrigée', () => {
  // 28 oct. 2026, ICZ KC-U b3-4 : gallium vendu à 14:55:42, 7 puis 7 en double à 14:55:45, retiré à 15:10:26 (6 → -1)
  const ga = sale('2026-10-28T14:55:42', 'gallium');
  assert.equal(ga.merits, 7);
  assert.ok(Math.abs(ga.ratio - 64.4) < 0.5, String(ga.ratio));
  assert.equal(ga.cause, undefined);
  assert.equal(sale('2026-10-28T14:55:43', 'indium').merits, 2172);
  assert.equal(sale('2026-10-28T15:10:25', 'beryllium').merits, 6); // la ligne qui porte le retrait reste à sa vente
});

// --- Cas construits ---

const ev = (timestamp, event, extra = {}) => ({ timestamp, event, ...extra });
const ARRIVE = (t, extra) => ev(t, 'Location', { StarSystem: 'Home', ControllingPower: 'Aisling Duval', PowerplayState: 'Stronghold', Powers: ['Aisling Duval'], StarPos: [0, 0, 0], Docked: true, StationName: 'S', StationType: 'Coriolis', MarketID: 1, ...extra });

test('vente sans mérites dans la minute : 0 noté à la clôture, même sans autre événement', () => {
  const w = new SaleWatch();
  w.apply(ev('2026-11-06T10:00:00Z', 'Powerplay', { Power: 'Aisling Duval', Merits: 100 }));
  w.apply(ARRIVE('2026-11-06T10:00:01Z'));
  for (let i = 0; i < 10; i++) w.apply(ev('2026-11-06T10:01:00Z', 'MiningRefined', { Type: '$iridium_name;' }));
  w.apply(ev('2026-11-06T10:05:00Z', 'MarketSell', { MarketID: 1, Type: 'iridium', Count: 10, SellPrice: 200000, TotalSale: 2000000 }));
  assert.equal(w.cases.length, 0);
  assert.equal(w.flush(Date.parse('2026-11-06T10:05:59Z')).length, 0);
  const [c] = w.flush(Date.parse('2026-11-06T10:06:01Z'));
  assert.equal(c.merits, 0);
  assert.equal(c.cause, 'unexplained');
});

test('les mérites qui suivent une autre source (sauvetage) ne vont pas à la vente', () => {
  const w = new SaleWatch();
  w.apply(ev('2026-11-06T10:00:00Z', 'Powerplay', { Power: 'Aisling Duval', Merits: 100 }));
  w.apply(ARRIVE('2026-11-06T10:00:01Z'));
  w.apply(ev('2026-11-06T10:01:00Z', 'MiningRefined', { Type: '$iridium_name;' }));
  w.apply(ev('2026-11-06T10:05:00Z', 'MarketSell', { MarketID: 1, Type: 'iridium', Count: 1, SellPrice: 200000, TotalSale: 200000 }));
  w.apply(ev('2026-11-06T10:05:01Z', 'PowerplayMerits', { Power: 'Aisling Duval', MeritsGained: 78, TotalMerits: 178 }));
  w.apply(ev('2026-11-06T10:05:20Z', 'SearchAndRescue', { Count: 5 }));
  w.apply(ev('2026-11-06T10:05:21Z', 'PowerplayMerits', { Power: 'Aisling Duval', MeritsGained: 2015, TotalMerits: 2193 }));
  const [c] = w.flush(Date.parse('2026-11-06T10:07:00Z'));
  assert.equal(c.merits, 78);
});

test('cause probable : demande trop faible quand les règles de lieu sont respectées', () => {
  const c = zeroCause({ lots: [{ count: 1000, ok: true }], eligible: 1000, count: 1000, demand: 2000, expected: 50000 });
  assert.equal(c.cause, 'bulk');
  assert.match(c.text, /Demande de 2000 t pour 1000 t/);
});

/** Une vente de 10 t d'iridium miné sur place à Home, après une vente de référence créditée à 400 mérites par million. */
function homeWatch() {
  const w = new SaleWatch();
  w.apply(ev('2026-11-06T09:00:00Z', 'Powerplay', { Power: 'Aisling Duval', Merits: 100 }));
  w.apply(ARRIVE('2026-11-06T09:00:01Z'));
  for (let i = 0; i < 20; i++) w.apply(ev('2026-11-06T09:01:00Z', 'MiningRefined', { Type: '$iridium_name;' }));
  w.apply(ev('2026-11-06T09:05:00Z', 'MarketSell', { MarketID: 1, Type: 'iridium', Count: 10, SellPrice: 200000, TotalSale: 2000000 }));
  w.apply(ev('2026-11-06T09:05:01Z', 'PowerplayMerits', { Power: 'Aisling Duval', MeritsGained: 800, TotalMerits: 900 }));
  w.flush(Date.parse('2026-11-06T09:07:00Z'));
  return w;
}
const SELL_10 = (t) => ev(t, 'MarketSell', { MarketID: 1, Type: 'iridium', Count: 10, SellPrice: 200000, TotalSale: 2000000 });
const MERITS = (t, MeritsGained, TotalMerits) => ev(t, 'PowerplayMerits', { Power: 'Aisling Duval', MeritsGained, TotalMerits });

test('doublon retiré au Powerplay de la connexion suivante : la vente close est corrigée', () => {
  const w = homeWatch();
  w.apply(SELL_10('2026-11-06T10:05:00Z'));
  w.apply(MERITS('2026-11-06T10:05:01Z', 800, 1700));
  w.apply(MERITS('2026-11-06T10:05:01Z', 800, 2500)); // doublon
  w.apply(ev('2026-11-06T10:10:00Z', 'Shutdown', {}));
  const c = w.cases.at(-1);
  assert.equal(c.merits, 1600);
  // 3 nov. 2026 13:10:54 : le total de la connexion repart 56 plus bas, le doublon de la dernière ligne
  w.apply(ev('2026-11-06T12:00:00Z', 'Powerplay', { Power: 'Aisling Duval', Merits: 1700 }));
  assert.equal(c.merits, 800);
  assert.ok(Math.abs(c.ratio - 400) < 1e-9);
  // Un total plus bas sans doublon possible derrière (plus de dernière ligne) ne retire rien
  w.apply(ev('2026-11-06T13:00:00Z', 'Powerplay', { Power: 'Aisling Duval', Merits: 1000 }));
  assert.equal(c.merits, 800);
});

test('doublon tombé sur une autre vente, retiré après clôture : elle repasse à 0 avec sa cause', () => {
  const w = homeWatch();
  w.apply(SELL_10('2026-11-06T10:05:00Z'));
  w.apply(ev('2026-11-06T10:05:01Z', 'MarketSell', { MarketID: 1, Type: 'gold', Count: 1, SellPrice: 50000, TotalSale: 50000 }));
  w.apply(MERITS('2026-11-06T10:05:02Z', 800, 1700));
  w.apply(MERITS('2026-11-06T10:05:02Z', 800, 2500)); // doublon : va à l'or, encore sans mérites
  w.flush(Date.parse('2026-11-06T10:07:00Z'));
  const gold = w.cases.find((c) => c.type === 'gold');
  assert.equal(gold.merits, 800);
  w.apply(MERITS('2026-11-06T10:20:00Z', 30, 1730)); // retrait : 30 gagnés, total 770 plus bas que prévu
  assert.equal(gold.merits, 0);
  assert.equal(gold.ratio, null);
  assert.equal(gold.cause, 'unknown'); // or de provenance inconnue (jamais miné ni acheté ici)
});

test('autre source entre la vente et ses mérites : le gain qui tombe sur la prévision revient quand même à la vente', () => {
  const w = homeWatch();
  // 30 oct. 2026 : 173 355 mérites arrivés 13 s après la vente ; ici une mission rendue entre-temps
  w.apply(SELL_10('2026-11-06T10:05:00Z'));
  w.apply(ev('2026-11-06T10:05:05Z', 'MissionCompleted', { Name: 'Mission_Courier_name' }));
  w.apply(MERITS('2026-11-06T10:05:13Z', 790, 1690));
  // Le gain de la source elle-même (loin de la prévision) ne va pas à la vente
  w.apply(MERITS('2026-11-06T10:05:14Z', 2015, 3705));
  w.flush(Date.parse('2026-11-06T10:07:00Z'));
  assert.equal(w.cases.at(-1).merits, 790);
  assert.equal(w.cases.at(-1).cause, undefined);
});

test('autre source après une vente déjà créditée : un gain proche de sa prévision ne lui est pas ajouté', () => {
  // 7 nov. 2026 13:49:51 : 90 t d'iridium créditées 6 841, puis sauvetage à 13:50:13 et 2 015 mérites
  const w = homeWatch();
  w.apply(SELL_10('2026-11-06T10:05:00Z'));
  w.apply(MERITS('2026-11-06T10:05:01Z', 800, 1700));
  w.apply(ev('2026-11-06T10:05:20Z', 'SearchAndRescue', { MarketID: 1, Name: 'usscargoblackbox', Count: 5 }));
  w.apply(MERITS('2026-11-06T10:05:20Z', 780, 2480));
  w.flush(Date.parse('2026-11-06T10:07:00Z'));
  assert.equal(w.cases.at(-1).merits, 800);
});

test('vente mélangée : mérites et prévision notés, mais pas de ratio (on ne sait pas sur quelle part le jeu a payé)', () => {
  const w = homeWatch(); // 10 t minées sur place encore en soute, ratio mesuré : 400 par million
  // 10 t de provenance inconnue (Cargo détaillé), puis 10 t minées ailleurs, sans puissance : prévues à 0
  w.apply(ev('2026-11-06T09:10:00Z', 'Cargo', { Vessel: 'Ship', Count: 20, Inventory: [{ Name: 'iridium', Count: 20 }] }));
  w.apply(ev('2026-11-06T09:20:00Z', 'FSDJump', { StarSystem: 'Ailleurs', StarPos: [10, 0, 0] }));
  for (let i = 0; i < 10; i++) w.apply(ev('2026-11-06T09:21:00Z', 'MiningRefined', { Type: '$iridium_name;' }));
  w.apply(ARRIVE('2026-11-06T09:40:00Z'));
  w.apply(ev('2026-11-06T09:45:00Z', 'MarketSell', { MarketID: 1, Type: 'iridium', Count: 30, SellPrice: 200000, TotalSale: 6000000 }));
  w.apply(MERITS('2026-11-06T09:45:01Z', 2400, 3300));
  const [c] = w.flush(Date.parse('2026-11-06T09:47:00Z'));
  assert.deepEqual([c.eligible, c.unsure, c.zero, c.merits, c.ratio], [10, 10, 10, 2400, null]);
  assert.ok(Math.abs(c.expected - 800) < 1e-9); // 400 par million sur les 10 t sûres
  const r = w.ratio('iridium', 'mined', 'reinforcement');
  assert.deepEqual([r.n, r.value], [1, 400]); // la vente mélangée n'entre pas dans la médiane
});

test('ventes relues du fichier : un ratio rapporté aux seules tonnes sûres par une version d\'avant est écarté', () => {
  // 7 nov. 2026 : 268 t dont 243 de provenance inconnue, 18 311 mérites, enregistrée à 4 192 par million
  const base = { type: 'iridium', label: 'Iridium', kind: 'mined', mode: 'reinforcement', count: 268, merits: 18_311, totalSale: 46_827_372, lots: [] };
  const w = new SaleWatch({
    cases: [
      { ...base, t: '2026-11-07T08:34:58Z', eligible: 25, unsure: 243, zero: 0, ratio: 4191.86 },
      { ...base, t: '2026-11-07T09:00:00Z', eligible: 168, unsure: 0, zero: 100, ratio: 698.1 },
      { ...base, t: '2026-11-07T10:33:58Z', eligible: 268, unsure: 0, zero: 0, ratio: 391.03 },
    ],
  });
  assert.deepEqual(w.cases.map((c) => c.ratio), [null, null, 391.03]);
  const r = w.ratio('iridium', 'mined', 'reinforcement');
  assert.deepEqual([r.n, r.value], [1, 391.03]);
  assert.deepEqual(casesText(w.cases).match(/\(\S+ par M cr\)/g), ['(391 par M cr)']); // seule la vente entière en affiche un
});

test('facteur acquisition / renforcement mesuré sur une sorte vendue dans les deux modes, plutôt que publié', () => {
  // Reliques de Soontill : 1 500 / M en acquisition (24-26 oct. 2026), 520 / M en renforcement (1er nov. 2026)
  const sale = (t, mode, kind, ratio, type = 'soontillrelics') => ({ t, type, label: type, kind, mode, ratio, merits: 1000, count: 10, totalSale: 1e6, lots: [] });
  const w = new SaleWatch({
    cases: [
      sale('2026-10-25T12:00:00Z', 'acquisition', 'rare', 1500),
      sale('2026-11-01T10:57:01Z', 'reinforcement', 'rare', 520),
      sale('2026-11-03T17:01:46Z', 'reinforcement', 'mined', 390, 'iridium'),
    ],
  });
  const f = w.modeFactor();
  assert.deepEqual([f.source, f.kind], ['measured', 'rare']);
  assert.ok(Math.abs(f.value - 1500 / 520) < 1e-9);
  const r = w.ratio('iridium', 'mined', 'acquisition');
  assert.deepEqual([r.source, r.factorSource, r.factorKind, r.factorN], ['extrapolated', 'measured', 'rare', 1]);
  assert.ok(Math.abs(r.value - (390 * 1500) / 520) < 1e-6);
  // Dans l'autre sens, sans paire mesurée : le renforcement extrapolé de l'acquisition divise par le facteur publié
  const back = new SaleWatch({ cases: [sale('2026-10-25T12:00:00Z', 'acquisition', 'mined', 600, 'iridium')] }).ratio('iridium', 'mined', 'reinforcement');
  assert.ok(Math.abs(back.value - (600 * 0.65) / 1.05) < 1e-6);
});

test('ventes relues du fichier : valeurs inconnues ou piégées écartées, rien ne fuit dans les textes', () => {
  const w = new SaleWatch({
    cases: [
      { t: '2026-11-06T10:00:00Z', type: 'iridium', mode: 'constructor', kind: 'toString', here: { state: 'constructor' }, lots: [{ kind: '__proto__', count: 3 }, null], merits: 'x', cause: 'unknown', text: 'Provenance inconnue.' },
      { t: 'pas une date', type: 'iridium' },
      null,
    ],
  });
  assert.equal(w.cases.length, 1);
  const [c] = w.cases;
  assert.deepEqual([c.mode, c.kind, c.lots[0].kind, c.merits, c.lots.length], [null, 'unknown', 'unknown', 0, 1]);
  assert.equal(c.ratio, null);
  assert.doesNotMatch(casesText(w.cases), /function|native code/);
});
