// Tests de la mise en forme des mérites prévus à la vente (fenêtre en jeu et onglet).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ageText, hudProps, labelOf, lastSaleText, meritsText, MODES, priceChange, ratioSourceText } from './saleView.js';

const line = (extra = {}) => ({ count: 268, price: { sellPrice: 194385, source: 'market', at: '2026-11-07T13:49:39Z' }, ...extra });
const forecast = (extra = {}) => ({
  docked: true,
  lines: [line()],
  total: { tonnes: 268, eligible: 268, zero: 0, unsure: 0, merits: 20355, complete: true },
  message: { level: 'ok', text: 'Ici : ta soute compte.' },
  lastSale: null,
  waiting: 0,
  ...extra,
});
const NOW = Date.parse('2026-11-07T13:52:39Z');

test('âge du prix et mérites en clair', () => {
  assert.equal(ageText(20), "à l'instant");
  assert.equal(ageText(180), 'il y a 3 min');
  assert.equal(ageText(7200), 'il y a 2 h');
  assert.equal(ageText(null), '—');
  assert.equal(meritsText(null), '?');
  assert.equal(meritsText(0), '0');
  assert.match(meritsText(20355), /^≈ 20.355$/);
  assert.ok(Math.abs(priceChange({ sellPrice: 110, previous: { sellPrice: 100 } }) - 0.1) < 1e-9);
  assert.equal(priceChange({ sellPrice: 110 }), null);
});

test('fenêtre en jeu : mérites prévus, soute, âge du prix', () => {
  const p = hudProps(forecast(), NOW);
  assert.match(p.cells[0].value, /20.355/);
  assert.equal(p.cells[1].sub, 'tout compte');
  assert.equal(p.cells[2].value, 'il y a 3 min');
  assert.equal(p.cells[2].sub, 'marché en jeu');
  assert.equal(p.tag, 'Ici');
});

test('fenêtre en jeu : 0 probable en rouge, avec la cause en bas', () => {
  const p = hudProps(forecast({
    total: { tonnes: 1184, eligible: 0, zero: 1184, unsure: 0, merits: 0, complete: true },
    message: { level: 'bad', text: 'Iridium : 0 mérite probable. Miné à Synuefe GA-I b57-6 (Inoccupé)…' },
  }), NOW);
  assert.equal(p.cells[0].value, '0');
  assert.equal(p.cells[0].alert, true);
  assert.match(p.cells[1].sub, /1.184 t à 0/);
  assert.equal(p.tag, 'Attention');
  assert.match(p.last, /Inoccupé/);
});

test('fenêtre en jeu : après la vente, résultat et attente ; rien à montrer hors quai', () => {
  const sold = { count: 1184, label: 'Iridium', merits: 0, expected: 0, text: 'Miné à Synuefe GA-I b57-6 (Inoccupé).' };
  const after = hudProps(forecast({ lines: [], total: { tonnes: 0, eligible: 0, zero: 0, unsure: 0, merits: null, complete: true }, lastSale: sold }), NOW);
  assert.equal(after.tag, 'Vendu');
  assert.match(after.last, /^Vendu 1.184 t de Iridium : 0 mérite\. Miné à/);
  assert.equal(hudProps(forecast({ waiting: 1 }), NOW).tag, 'Vendu');
  assert.equal(hudProps(forecast({ docked: false }), NOW), null);
  assert.match(lastSaleText({ count: 268, label: 'Iridium', merits: 20360, expected: 20355 }), /20.360 mérites \(prévu ≈ 20.355\)/);
});

/**
 * De bout en bout, par le vrai serveur (SaleWatch, saleForecast) : ratio de l'iridium mesuré en renforcement
 * seulement, 700 t minées dans un système Consolidé d'Aisling Duval, à quai à Synuefe GA-I b57-6 (acquisition).
 */
async function acquisitionForecast() {
  const { SaleWatch } = await import('../../../../server/src/modules/expansion/saleWatch.js');
  const { saleForecast } = await import('../../../../server/src/modules/expansion/saleForecast.js');
  const ev = (timestamp, event, extra = {}) => ({ timestamp, event, ...extra });
  const OUE = { StarSystem: 'Synuefe OU-E c28-2', ControllingPower: 'Aisling Duval', PowerplayState: 'Exploited', Powers: ['Aisling Duval'], StarPos: [207.5, 52.375, 93.8125] };
  const GAI = { StarSystem: 'Synuefe GA-I b57-6', PowerplayState: 'Unoccupied', Powers: ['Aisling Duval'], StarPos: [210, 50, 90] };
  const CONSO = { StarSystem: 'Conso', ControllingPower: 'Aisling Duval', PowerplayState: 'Fortified', Powers: ['Aisling Duval'], StarPos: [213, 52, 93] };
  const w = new SaleWatch();
  w.apply(ev('2026-11-06T17:00:00Z', 'Powerplay', { Power: 'Aisling Duval', Merits: 1_200_000 }));
  w.apply(ev('2026-11-06T17:00:01Z', 'FSDJump', OUE));
  for (let i = 0; i < 268; i++) w.apply(ev('2026-11-06T17:05:00Z', 'MiningRefined', { Type: '$iridium_name;', Type_Localised: 'Iridium' }));
  w.apply(ev('2026-11-06T17:14:00Z', 'Docked', { StarSystem: OUE.StarSystem, StationName: 'Flinders City', StationType: 'Outpost', MarketID: 4224076803 }));
  w.apply(ev('2026-11-06T17:15:00Z', 'MarketSell', { MarketID: 4224076803, Type: 'iridium', Count: 268, SellPrice: 193_712, TotalSale: 51_914_816 }));
  w.apply(ev('2026-11-06T17:15:03Z', 'PowerplayMerits', { Power: 'Aisling Duval', MeritsGained: 20_285, TotalMerits: 1_220_285 }));
  w.apply(ev('2026-11-06T17:20:00Z', 'Undocked', {}));
  w.apply(ev('2026-11-07T14:00:00Z', 'FSDJump', CONSO));
  for (let i = 0; i < 700; i++) w.apply(ev('2026-11-07T14:05:00Z', 'MiningRefined', { Type: '$iridium_name;' }));
  w.apply(ev('2026-11-07T15:00:00Z', 'FSDJump', GAI));
  w.apply(ev('2026-11-07T15:30:00Z', 'Docked', { StarSystem: GAI.StarSystem, StationName: 'Rorschach Terminal', StationType: 'Outpost', MarketID: 42 }));
  w.setMarket({ timestamp: '2026-11-07T15:30:05Z', event: 'Market', MarketID: 42, StationName: 'Rorschach Terminal', StarSystem: GAI.StarSystem, Items: [{ Name: '$iridium_name;', Name_Localised: 'Iridium', SellPrice: 194_385, Demand: 900_000, Consumer: true }] });
  return JSON.parse(JSON.stringify(saleForecast(w, [{ type: 'iridium', label: 'Iridium', count: 700 }], Date.parse('2026-11-07T15:31:00Z'))));
}

test('fenêtre en jeu, vente en acquisition jamais vue créditée, ratio extrapolé : « estimé, à vérifier », jamais « tout compte »', async () => {
  const f = await acquisitionForecast();
  const p = hudProps(f, Date.parse('2026-11-07T15:31:00Z'));
  const texte = JSON.stringify(p);
  assert.match(p.cells[0].value, /^≈ \d[\d\u{202f} ]* \?$/u);
  assert.equal(p.cells[0].sub, 'estimé, à vérifier');
  assert.equal(p.cells[0].color, '#ff9a3c');
  assert.equal(p.cells[1].sub, 'règle jamais vue');
  assert.equal(p.cells[1].color, '#ff9a3c');
  assert.doesNotMatch(texte, /tout compte|ta soute compte/);
  assert.equal(p.tag, 'À vérifier');
  assert.match(p.last, /jamais vue créditée en acquisition ; mérites estimés .*À vérifier\.$/);
});

test('fenêtre en jeu : ratio extrapolé seul, ou part de la soute selon une règle jamais vue', () => {
  const est = hudProps(forecast({ total: { tonnes: 268, eligible: 268, zero: 0, unsure: 0, merits: 20355, complete: false, estimated: true, unverified: 0 }, message: { level: 'info', text: 'Iridium : … À vérifier.' } }), NOW);
  assert.match(est.cells[0].value, / \?$/);
  assert.equal(est.cells[0].sub, 'estimé, en partie');
  assert.equal(est.cells[1].sub, 'tout compte'); // la règle a été vue : seuls les mérites sont estimés
  assert.equal(est.tag, 'À vérifier');
  const part = hudProps(forecast({ total: { tonnes: 700, eligible: 700, zero: 0, unsure: 0, merits: null, complete: false, estimated: false, unverified: 432 }, message: { level: 'info', text: '…' } }), NOW);
  assert.equal(part.cells[0].value, '?');
  assert.match(part.cells[1].sub, /^432 t, règle jamais vue$/);
  // Mesuré : comme avant
  const sure = hudProps(forecast({ total: { tonnes: 268, eligible: 268, zero: 0, unsure: 0, merits: 20355, complete: true, estimated: false, unverified: 0 } }), NOW);
  assert.deepEqual([sure.cells[0].sub, sure.cells[0].color, sure.cells[1].sub, sure.tag], ['', '#ffd24a', 'tout compte', 'Ici']);
});

test('source d\'un ratio : mesuré, ou extrapolé avec son facteur et d\'où il vient', () => {
  assert.equal(ratioSourceText({ source: 'commodity' }), 'mesuré sur cette marchandise');
  assert.match(ratioSourceText({ source: 'extrapolated', factor: 1.05 / 0.65, factorSource: 'published' }), /^extrapolé de l'autre mode, × 1,6 \(règles publiées, à vérifier\)$/);
  assert.match(ratioSourceText({ source: 'extrapolated', factor: 2.885, factorSource: 'measured', factorKind: 'rare', factorN: 1 }), /× 2,9 \(mesuré sur les rares, 1 vente, à vérifier\)/);
  assert.equal(ratioSourceText(null), '');
  assert.equal(labelOf(MODES, 'acquisition'), 'Acquisition');
  assert.equal(labelOf(MODES, 'constructor'), 'constructor');
});
