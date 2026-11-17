// Tests de la prévision à quai (ratios mesurés, prix et âge, vente en gros, répartition) et de l'export en texte.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bulkPlan, casesText, originText, saleForecast, utcStamp } from './saleForecast.js';
import { SaleWatch } from './saleWatch.js';

const market = JSON.parse(fs.readFileSync(new URL('./fixtures/market-flinders-city.json', import.meta.url), 'utf8'));
const ev = (timestamp, event, extra = {}) => ({ timestamp, event, ...extra });
const OUE = { StarSystem: 'Synuefe OU-E c28-2', ControllingPower: 'Aisling Duval', PowerplayState: 'Exploited', Powers: ['Aisling Duval'], StarPos: [207.5, 52.375, 93.8125] };
const GAI = { StarSystem: 'Synuefe GA-I b57-6', PowerplayState: 'Unoccupied', Powers: ['Aisling Duval'], PowerplayConflictProgress: [{ Power: 'Aisling Duval', ConflictProgress: 0.007608 }], StarPos: [210, 50, 90] };

/** Une vente créditée à 391 mérites par million (6 nov. 2026, Synuefe OU-E c28-2), puis 268 t minées. */
function minedAtOue() {
  const w = new SaleWatch();
  w.apply(ev('2026-11-06T17:00:00Z', 'Powerplay', { Power: 'Aisling Duval', Merits: 1_200_000 }));
  w.apply(ev('2026-11-06T17:00:01Z', 'FSDJump', OUE));
  for (let i = 0; i < 268; i++) w.apply(ev('2026-11-06T17:05:00Z', 'MiningRefined', { Type: '$iridium_name;', Type_Localised: 'Iridium' }));
  w.apply(ev('2026-11-06T17:14:00Z', 'Docked', { StarSystem: OUE.StarSystem, StationName: 'Flinders City', StationType: 'Outpost', MarketID: 4224076803 }));
  w.apply(ev('2026-11-06T17:15:00Z', 'MarketSell', { MarketID: 4224076803, Type: 'iridium', Count: 268, SellPrice: 193_712, TotalSale: 51_914_816 }));
  w.apply(ev('2026-11-06T17:15:03Z', 'PowerplayMerits', { Power: 'Aisling Duval', MeritsGained: 20_285, TotalMerits: 1_220_285 }));
  w.apply(ev('2026-11-06T17:20:00Z', 'Undocked', {}));
  for (let i = 0; i < 268; i++) w.apply(ev('2026-11-07T13:00:00Z', 'MiningRefined', { Type: '$iridium_name;' }));
  return w;
}

test('répartition d\'une grosse vente : chaque part sous le quart de la demande restante', () => {
  assert.equal(bulkPlan(268, 15554), null);
  assert.deepEqual(bulkPlan(1184, 2000), { demand: 2000, limit: 500, parts: [500, 375, 281, 28], leftover: 0 });
  const small = bulkPlan(1000, 100);
  assert.equal(small.parts.length, 6);
  assert.ok(small.leftover > 900);
  assert.deepEqual(bulkPlan(10, 3), { demand: 3, limit: 0, parts: [], leftover: 10 });
});

test('à quai, minerai miné sur place : mérites prévus d\'après le ratio mesuré et le prix de Market.json', () => {
  const w = minedAtOue();
  w.apply(ev('2026-11-07T13:48:36Z', 'Docked', { StarSystem: OUE.StarSystem, StationName: 'Flinders City', StationType: 'Outpost', MarketID: 4224076803 }));
  w.setMarket(market);
  const f = saleForecast(w, [{ type: 'iridium', label: 'Iridium', count: 268 }], Date.parse('2026-11-07T13:52:39Z'));
  assert.equal(f.here.mode, 'reinforcement');
  const [l] = f.lines;
  assert.equal(l.verdict, 'ok');
  assert.equal(l.price.source, 'market');
  assert.equal(l.price.ageSec, 180);
  assert.equal(l.price.previous.sellPrice, 193_712); // ta dernière vente ici, pour comparer
  assert.equal(l.ratio.source, 'commodity');
  // 20 285 / 51,91 M = 390,7 par million × 194 385 cr × 268 t
  assert.ok(Math.abs(l.merits - 20_355) < 5, String(l.merits));
  assert.equal(l.bulk, null);
  assert.equal(f.message.level, 'ok');
  assert.equal(f.total.complete, true);
});

test('à quai en acquisition, minerai miné dans le système inoccupé : 0 probable et sa cause', () => {
  const w = minedAtOue();
  w.apply(ev('2026-11-07T14:00:00Z', 'FSDJump', GAI));
  for (let i = 0; i < 100; i++) w.apply(ev('2026-11-07T14:05:00Z', 'MiningRefined', { Type: '$iridium_name;' }));
  w.apply(ev('2026-11-07T14:30:00Z', 'Docked', { StarSystem: GAI.StarSystem, StationName: 'Rorschach Terminal', StationType: 'Outpost', MarketID: 42 }));
  const f = saleForecast(w, [{ type: 'iridium', label: 'Iridium', count: 368 }], Date.parse('2026-11-07T14:31:00Z'));
  const [l] = f.lines;
  assert.equal(f.here.mode, 'acquisition');
  // 100 t de GA-I (Inoccupé : 0, mesuré) ; 268 t d'OU-E (Exploité de ta puissance : jamais mesuré, à vérifier)
  assert.equal(l.zero, 100);
  assert.equal(l.unsure, 268);
  assert.equal(l.price, null); // ni Market.json de cette station, ni vente passée ici
  assert.equal(f.message.level, 'bad');
  assert.match(f.message.text, /^Iridium : 100 t sur 368 à 0 probable\. Miné à Synuefe GA-I b57-6 \(Inoccupé\)/);
});

/**
 * Prise de Synuefe GA-I b57-6 : ratio de l'iridium mesuré en renforcement seulement (391 par million), puis 700 t
 * minées dans un système Consolidé d'Aisling Duval à 5 AL, et à quai à GA-I (acquisition), avec son Market.json.
 */
function acquisitionSale() {
  const w = new SaleWatch();
  w.apply(ev('2026-11-06T17:00:00Z', 'Powerplay', { Power: 'Aisling Duval', Merits: 1_200_000 }));
  w.apply(ev('2026-11-06T17:00:01Z', 'FSDJump', OUE));
  for (let i = 0; i < 268; i++) w.apply(ev('2026-11-06T17:05:00Z', 'MiningRefined', { Type: '$iridium_name;', Type_Localised: 'Iridium' }));
  w.apply(ev('2026-11-06T17:14:00Z', 'Docked', { StarSystem: OUE.StarSystem, StationName: 'Flinders City', StationType: 'Outpost', MarketID: 4224076803 }));
  w.apply(ev('2026-11-06T17:15:00Z', 'MarketSell', { MarketID: 4224076803, Type: 'iridium', Count: 268, SellPrice: 193_712, TotalSale: 51_914_816 }));
  w.apply(ev('2026-11-06T17:15:03Z', 'PowerplayMerits', { Power: 'Aisling Duval', MeritsGained: 20_285, TotalMerits: 1_220_285 }));
  w.apply(ev('2026-11-06T17:20:00Z', 'Undocked', {}));
  const CONSO = { StarSystem: 'Conso', ControllingPower: 'Aisling Duval', PowerplayState: 'Fortified', Powers: ['Aisling Duval'], StarPos: [213, 52, 93] };
  w.apply(ev('2026-11-07T14:00:00Z', 'FSDJump', CONSO));
  for (let i = 0; i < 700; i++) w.apply(ev('2026-11-07T14:05:00Z', 'MiningRefined', { Type: '$iridium_name;' }));
  w.apply(ev('2026-11-07T15:00:00Z', 'FSDJump', GAI));
  w.apply(ev('2026-11-07T15:30:00Z', 'Docked', { StarSystem: GAI.StarSystem, StationName: 'Rorschach Terminal', StationType: 'Outpost', MarketID: 42 }));
  w.setMarket({ ...market, timestamp: '2026-11-07T15:30:05Z', MarketID: 42, StationName: 'Rorschach Terminal', StarSystem: GAI.StarSystem, Items: market.Items.map((i) => (/iridium/.test(i.Name) ? { ...i, Demand: 900_000 } : i)) });
  return w;
}
const AT_GAI = Date.parse('2026-11-07T15:31:00Z');

test('acquisition, minerai d’un système Consolidé : règle jamais vue créditée et mérites extrapolés, jamais présentés comme sûrs', () => {
  const w = acquisitionSale();
  const f = saleForecast(w, [{ type: 'iridium', label: 'Iridium', count: 700 }], AT_GAI);
  const [l] = f.lines;
  assert.equal(f.here.mode, 'acquisition');
  assert.deepEqual([l.eligible, l.zero, l.unsure], [700, 0, 0]);
  assert.equal(l.ratio.source, 'extrapolated');
  assert.equal(l.ratio.factorSource, 'published');
  assert.equal(l.estimated, true);
  assert.equal(l.unverified, 700);
  assert.equal(l.verdict, 'unproven');
  assert.ok(l.merits > 0);
  assert.deepEqual([f.total.estimated, f.total.unverified], [true, 700]);
  assert.equal(f.message.level, 'info'); // jamais « ok » : rien de tout ça n'a été vu
  assert.match(f.message.text, /^Iridium : compte d'après la règle publiée, jamais vue créditée en acquisition ; mérites estimés d'après tes ventes en renforcement × 1,6 \(règles publiées\)\. À vérifier\.$/);
  assert.doesNotMatch(f.message.text, /ta soute compte/);
});

test('acquisition : facteur mesuré sur une autre sorte, dit tel quel ; ratio mesuré ici : plus de réserve', () => {
  const w = acquisitionSale();
  const real = w.ratio.bind(w);
  w.ratio = (type, kind, mode) => ({ ...real(type, kind, mode), factor: 2.885, factorSource: 'measured', factorKind: 'rare', factorN: 1 });
  const f = saleForecast(w, [{ type: 'iridium', label: 'Iridium', count: 700 }], AT_GAI);
  assert.match(f.message.text, /mérites estimés d'après tes ventes en renforcement × 2,9 \(facteur mesuré sur les rares\)\. À vérifier\.$/);
  // Une vraie vente de ce minerai créditée ici, en acquisition : la règle a été vue, le ratio est mesuré, plus de réserve
  const v = acquisitionSale();
  v.apply(ev('2026-11-07T15:31:00Z', 'MarketSell', { MarketID: 42, Type: 'iridium', Count: 100, SellPrice: 194_385, TotalSale: 19_438_500 }));
  v.apply(ev('2026-11-07T15:31:04Z', 'PowerplayMerits', { Power: 'Aisling Duval', MeritsGained: 12_300, TotalMerits: 1_232_585 }));
  v.apply(ev('2026-11-07T15:33:00Z', 'ReceiveText', {})); // délai des mérites passé : la vente est close
  assert.equal(v.cases.at(-1).mode, 'acquisition');
  const g = saleForecast(v, [{ type: 'iridium', label: 'Iridium', count: 600 }], Date.parse('2026-11-07T15:34:00Z'));
  assert.equal(g.lines[0].ratio.source, 'commodity');
  assert.deepEqual([g.lines[0].estimated, g.lines[0].unverified, g.lines[0].verdict, g.total.estimated, g.total.unverified], [false, 0, 'ok', false, 0]);
  assert.equal(g.message.level, 'ok');
});

test('acquisition, soute mêlée : un commerce déjà crédité ne lève pas la réserve sur le minerai', () => {
  const w = acquisitionSale();
  // Lot acheté dans le système Consolidé (sa règle a déjà été vue créditée en acquisition, par hypothèse), plus 700 t
  // minées dont la règle ne l'a jamais été : le ratio suit la sorte dominante (le commerce), la réserve suit chaque lot
  w.cargo.peek = () => [{ kind: 'bought', system: 'Conso', place: { power: 'Aisling Duval', state: 'Fortified', starPos: [213, 52, 93] }, buyPrice: 100_000, count: 900 }, { kind: 'mined', system: 'Conso', place: { power: 'Aisling Duval', state: 'Fortified', starPos: [213, 52, 93] }, count: 100 }];
  const real = w.measured.bind(w);
  w.measured = (type, kind, mode) => (kind === 'bought' && mode === 'acquisition' ? { value: 500, n: 3, source: 'kind', last: '2026-11-07T12:00:00Z' } : real(type, kind, mode));
  const f = saleForecast(w, [{ type: 'iridium', label: 'Iridium', count: 1000 }], AT_GAI);
  const [l] = f.lines;
  assert.deepEqual([l.eligible, l.kind, l.ratio.source], [1000, 'bought', 'kind']);
  assert.equal(l.unverified, 100, 'les 100 t minées restent « règle jamais vue »');
  assert.equal(l.verdict, 'unproven');
  assert.equal(f.message.level, 'info');
});

test('ratio extrapolé, règle déjà vue : mérites estimés, message « à vérifier » plutôt que « ta soute compte »', () => {
  const w = minedAtOue();
  w.apply(ev('2026-11-07T13:48:36Z', 'Docked', { StarSystem: OUE.StarSystem, StationName: 'Flinders City', StationType: 'Outpost', MarketID: 4224076803 }));
  w.setMarket(market);
  w.ratio = () => ({ value: 391, n: 1, source: 'extrapolated', last: '2026-11-07T12:00:00Z', factor: 1 / 1.615, factorSource: 'published', factorKind: null, factorN: 0 });
  const f = saleForecast(w, [{ type: 'iridium', label: 'Iridium', count: 268 }], Date.parse('2026-11-07T13:52:39Z'));
  assert.deepEqual([f.lines[0].verdict, f.lines[0].estimated, f.lines[0].unverified, f.total.estimated], ['ok', true, 0, true]);
  assert.equal(f.message.level, 'info');
  assert.match(f.message.text, /^Iridium : aucune vente créditée en renforcement pour l'instant, mérites estimés d'après tes ventes en acquisition × 0,6 \(règles publiées\)\. À vérifier\.$/);
});

test('réel, 7 nov. 2026 : une vente en partie de provenance inconnue ne fausse plus la prévision suivante', () => {
  // Séance du banc minage-rhino-2026-11-07, chiffres du journal : 08:34 et 10:33 à Rivers Depot, 13:49 à Flinders City
  const RIVERS = { StarSystem: OUE.StarSystem, StationName: 'Rivers Depot', StationType: 'AsteroidBase', MarketID: 4235814659 };
  const FLINDERS = { StarSystem: OUE.StarSystem, StationName: 'Flinders City', StationType: 'Outpost', MarketID: 4224076803 };
  const w = new SaleWatch();
  const mine = (t, n) => { for (let i = 0; i < n; i++) w.apply(ev(t, 'MiningRefined', { Type: '$iridium_name;', Type_Localised: 'Iridium' })); };
  const sell = (t, at, Count, SellPrice) => w.apply(ev(t, 'MarketSell', { MarketID: at.MarketID, Type: 'iridium', Count, SellPrice, TotalSale: Count * SellPrice }));
  const merits = (t, MeritsGained, TotalMerits) => w.apply(ev(t, 'PowerplayMerits', { Power: 'Aisling Duval', MeritsGained, TotalMerits }));
  w.apply(ev('2026-11-07T08:16:09Z', 'Location', { ...OUE, Docked: false }));
  w.apply(ev('2026-11-07T08:16:09Z', 'Powerplay', { Power: 'Aisling Duval', Merits: 1_248_766 }));
  // 243 t déjà en soute au premier journal lu (minées sur place la veille), puis 25 t raffinées
  w.apply(ev('2026-11-07T08:16:10Z', 'Cargo', { Vessel: 'Ship', Count: 243, Inventory: [{ Name: 'iridium', Count: 243 }] }));
  mine('2026-11-07T08:24:00Z', 25);
  w.apply(ev('2026-11-07T08:33:09Z', 'Docked', RIVERS));
  sell('2026-11-07T08:34:58Z', RIVERS, 268, 174_729);
  merits('2026-11-07T08:35:00Z', 18_311, 1_267_077);
  w.apply(ev('2026-11-07T08:38:19Z', 'Undocked', {}));
  const first = w.cases.at(-1);
  assert.deepEqual([first.eligible, first.unsure, first.merits], [25, 243, 18_311]);
  assert.equal(first.ratio, null); // et non 18 311 / (46,8 M × 25 / 268) = 4 192 par million

  mine('2026-11-07T10:20:00Z', 268);
  w.apply(ev('2026-11-07T10:33:30Z', 'Docked', RIVERS));
  sell('2026-11-07T10:33:58Z', RIVERS, 268, 174_729);
  merits('2026-11-07T10:33:59Z', 18_311, 1_285_388);
  w.apply(ev('2026-11-07T10:53:21Z', 'Undocked', {}));
  const second = w.cases.at(-1);
  assert.equal(second.expected, null); // aucune vente mesurée avant : pas de chiffre inventé
  assert.ok(Math.abs(second.ratio - 391.03) < 0.01, String(second.ratio)); // 18 311 / 46 827 372 cr

  mine('2026-11-07T13:07:57Z', 90);
  w.apply(ev('2026-11-07T13:48:36Z', 'Docked', FLINDERS));
  w.setMarket(market); // Market.json réel de Flinders City, 13:49:39 : iridium 194 385 cr
  const [l] = saleForecast(w, [{ type: 'iridium', label: 'Iridium', count: 90 }], Date.parse('2026-11-07T13:49:45Z')).lines;
  assert.deepEqual([l.verdict, l.ratio.source, l.ratio.n], ['ok', 'commodity', 1]);
  // 391,03 par million × 194 385 cr × 90 t = 6 841 (le jeu : 6 841 ; avant, 40 088 avec la médiane de 4 192 et 391)
  assert.equal(Math.round(l.merits), 6_841);
  sell('2026-11-07T13:49:51Z', FLINDERS, 90, 194_385);
  merits('2026-11-07T13:49:52Z', 6_841, 1_292_229);
  w.flush(Date.parse('2026-11-07T13:51:00Z'));
  const third = w.cases.at(-1);
  assert.deepEqual([Math.round(third.expected), third.merits], [6_841, 6_841]);
  const [r] = w.ratioTable();
  assert.deepEqual([r.type, r.n, Math.round(r.value)], ['iridium', 2, 391]);
});

test('demande trop faible : alerte de vente en gros et répartition proposée', () => {
  const w = minedAtOue();
  w.apply(ev('2026-11-07T13:48:36Z', 'Docked', { StarSystem: OUE.StarSystem, StationName: 'Flinders City', StationType: 'Outpost', MarketID: 4224076803 }));
  w.setMarket({ ...market, Items: market.Items.map((i) => (i.Name === '$iridium_name;' ? { ...i, Demand: 600 } : i)) });
  const f = saleForecast(w, [{ type: 'iridium', label: 'Iridium', count: 268 }], Date.parse('2026-11-07T13:50:00Z'));
  assert.deepEqual(f.lines[0].bulk.parts, [150, 112, 6]);
  assert.equal(f.message.level, 'warn');
  assert.match(f.message.text, /vends au plus 150 t à la fois \(150, 112, 6 t\)/);
});

test('station qui n\'achète pas : signalé ; drones ignorés ; pas à quai, pas de lignes', () => {
  const w = minedAtOue();
  w.apply(ev('2026-11-07T13:48:36Z', 'Docked', { StarSystem: OUE.StarSystem, StationName: 'Flinders City', StationType: 'Outpost', MarketID: 4224076803 }));
  w.setMarket(market);
  const f = saleForecast(w, [{ type: 'gold', label: 'Or', count: 10 }, { type: 'drones', label: 'Drone', count: 50 }], Date.parse('2026-11-07T13:50:00Z'));
  assert.equal(f.lines.length, 1);
  assert.equal(f.lines[0].noDemand, true);
  w.apply(ev('2026-11-07T13:55:00Z', 'Undocked', {}));
  assert.equal(saleForecast(w, [{ type: 'gold', count: 10 }]).lines.length, 0);
});

test('fenêtre en jeu utile : minerai apporté, ou objet que la station achète ; pas un objet ramassé qu\'elle n\'achète pas', () => {
  const w = minedAtOue();
  w.apply(ev('2026-11-07T13:30:00Z', 'CollectCargo', { Type: 'unocuppiedescapepod', Type_Localised: "Nacelle d'évacuation inoccupée" }));
  w.apply(ev('2026-11-07T13:31:00Z', 'CollectCargo', { Type: 'usscargoblackbox', Type_Localised: 'Boîte noire' }));
  w.apply(ev('2026-11-07T13:48:36Z', 'Docked', { StarSystem: OUE.StarSystem, StationName: 'Flinders City', StationType: 'Outpost', MarketID: 4224076803 }));
  const inv = [{ type: 'unocuppiedescapepod', count: 1 }, { type: 'usscargoblackbox', count: 1 }];
  // Sans Market.json d'ici : un objet ramassé n'ouvre rien
  assert.deepEqual(saleForecast(w, inv).lines.map((l) => l.relevant), [false, false]);
  // Flinders City achète les nacelles inoccupées (Market.json réel du 7 nov. 2026 : Ferraille, demande 521), pas les
  // boîtes noires (absentes du marché)
  const pod = { Name: '$unocuppiedescapepod_name;', Name_Localised: "Nacelle d'évacuation inoccupée", Category: '$MARKET_category_salvage;', BuyPrice: 0, SellPrice: 4373, Demand: 521, Consumer: true, Rare: false };
  w.setMarket({ ...market, Items: [...market.Items, pod] });
  const f = saleForecast(w, [...inv, { type: 'iridium', count: 268 }], Date.parse('2026-11-07T13:50:00Z'));
  assert.deepEqual(f.lines.map((l) => [l.type, l.relevant, l.noDemand]), [['unocuppiedescapepod', true, false], ['usscargoblackbox', false, true], ['iridium', true, false]]);
  assert.doesNotMatch(f.message.text, /Boîte noire/); // le conseil porte sur ce qui se vend ici
  // Une boîte noire rendue au contact Recherche et sauvetage n'est plus prévue du tout
  w.apply(ev('2026-11-07T13:51:00Z', 'SearchAndRescue', { MarketID: 4224076803, Name: 'usscargoblackbox', Count: 1 }));
  assert.deepEqual(saleForecast(w, inv).lines.map((l) => l.type), ['unocuppiedescapepod']);
});

test('après la vente : dernière vente de cette escale, et vente en attente de ses mérites', () => {
  const w = minedAtOue();
  w.apply(ev('2026-11-07T13:48:36Z', 'Docked', { StarSystem: OUE.StarSystem, StationName: 'Flinders City', StationType: 'Outpost', MarketID: 4224076803 }));
  w.apply(ev('2026-11-07T13:49:51Z', 'MarketSell', { MarketID: 4224076803, Type: 'iridium', Count: 268, SellPrice: 194_385, TotalSale: 52_095_180 }));
  assert.equal(saleForecast(w, [], Date.parse('2026-11-07T13:49:52Z')).waiting, 1);
  w.apply(ev('2026-11-07T13:49:52Z', 'PowerplayMerits', { Power: 'Aisling Duval', MeritsGained: 20_360, TotalMerits: 1_240_645 }));
  w.flush(Date.parse('2026-11-07T13:51:00Z'));
  const f = saleForecast(w, [], Date.parse('2026-11-07T13:51:00Z'));
  assert.equal(f.waiting, 0);
  assert.equal(f.lastSale.merits, 20_360);
  assert.ok(Math.abs(f.lastSale.expected - 20_355) < 10);
});

test('export texte : une ligne par vente, 0 mérite et cause, en UTC, sans nom de commandant', () => {
  const cases = [
    { t: '2026-10-30T10:58:20Z', type: 'iridium', label: 'Iridium', count: 785, totalSale: 444_500_000, system: 'Mombaluma', here: { power: 'Aisling Duval', state: 'Stronghold' }, mode: 'reinforcement', lots: [{ kind: 'mined', system: 'Mombaluma', count: 785 }], merits: 173_355, ratio: 390 },
    { t: '2026-10-31T23:09:00Z', type: 'iridium', label: 'Iridium', count: 1184, totalSale: 303_888_000, system: 'Synuefe GA-I b57-6', here: { power: null, state: 'Unoccupied' }, mode: 'acquisition', lots: [{ kind: 'mined', system: 'Synuefe GA-I b57-6', count: 1184 }], merits: 0, cause: 'acq-mined-unsupported', text: 'Miné à Synuefe GA-I b57-6 (Inoccupé) : en acquisition, il doit venir d\'un système Consolidé ou Forteresse d\'Aisling Duval.' },
  ];
  const text = casesText(cases, { now: Date.parse('2026-11-07T20:00:00Z') });
  const lines = text.split('\n');
  assert.match(lines[0], /^\*\*Ventes Powerplay mesurées\*\* \(Elite Compagnon, relevé du 7 nov\. 20:00 UTC\)$/);
  assert.match(lines[1], /^- 31 oct\. 23:09 UTC · Iridium 1.184 t · 303,9 M cr · vendu à Synuefe GA-I b57-6 \(Inoccupé, acquisition\) · miné sur place · \*\*0 mérite\*\* · cause probable : Miné à/);
  assert.match(lines[2], /Mombaluma \(Forteresse d'Aisling Duval, renforcement\) · miné sur place · 173.355 mérites \(390 par M cr\)$/);
  assert.doesNotMatch(text, /\|/); // pas de tableau
  assert.equal(casesText(cases, { zeroOnly: true }).split('\n').length, 2);
  assert.equal(utcStamp('2026-01-05T07:03:00Z'), '5 janv. 07:03 UTC');
  assert.equal(originText({ system: 'B', lots: [{ kind: 'mined', system: 'B', count: 538 }, { kind: 'mined', system: '16 Librae', count: 3 }] }), '538 t miné sur place + 3 t miné à 16 Librae');
});

test('export texte : un nom piégé (système, marchandise, provenance, cause) ne mentionne personne et n’affiche aucun lien', () => {
  const piege = '@everyone [Spansh](https://exemple.invalid/) <@&123456789012345678>';
  const cases = [
    { t: '2026-10-31T23:09:00Z', type: 'x', label: `**${piege}**`, count: 10, totalSale: 1_000_000, system: piege, here: { power: null, state: 'Unoccupied' }, mode: 'acquisition', lots: [{ kind: 'bought', system: `# ${piege}`, count: 10 }], merits: 0, cause: 'acq-bought-unsupported', text: `Acheté à ${piege} (sans puissance) : en acquisition, il doit venir d'un système Consolidé ou Forteresse d'Aisling Duval.` },
    { t: '2026-10-31T23:10:00Z', type: 'x', label: 'Or', count: 10, totalSale: 1_000_000, system: '||spoiler||', here: { power: '<@1>', state: 'Stronghold' }, mode: 'reinforcement', lots: [{ kind: 'bought', system: 'A', count: 10 }], merits: 50, ratio: 50 },
  ];
  const text = casesText(cases, { now: Date.parse('2026-11-07T20:00:00Z') });
  assert.ok(!/@(everyone|here)\b/.test(text), text);
  assert.ok(!/<@&?\d/.test(text), text);
  assert.ok(!/(^|[^\\])\]\(/m.test(text) && !text.includes('https://'), text);
  assert.ok(!/(^|[^\\])\|\|/.test(text), 'aucun spoiler');
  assert.equal(text.split('\n').length, 3, 'une ligne par vente');
  assert.match(text, /\*\*0 mérite\*\* · cause probable : Acheté à @\u{200b}everyone \\\[Spansh\\\]/u);
});
