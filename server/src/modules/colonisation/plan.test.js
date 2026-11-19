// Tests de la liste de courses et de l'estimation de fin (calculs purs). Besoins tirés de l'exemple documenté
// d'EDDI (fixtures/examples.js), pas d'un vrai chantier de l’auteur.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deadlineVerdict, deliveryVisits, holdBySymbol, measureLoop, planSite, shoppingList, tripsFor } from './plan.js';
import { GameState } from '../../core/gameState.js';
import { ColonisationState } from './state.js';
import { depotAt } from './fixtures/examples.js';

const NOW = Date.parse('2026-11-07T20:00:00Z');

function siteFromExample(provided = {}) {
  const s = new ColonisationState();
  s.apply(depotAt(1, '2026-11-07T19:00:00Z', provided));
  return s.sites.get(1);
}

const contrib = (at, total, visit = null) => ({ at, total, items: [{ symbol: 'steel', name: 'Steel', amount: total }], visit });

test('soute : additionnée par symbole, noms de Cargo.json reconnus', () => {
  const hold = holdBySymbol([{ name: 'steel', count: 500 }, { name: 'Steel', count: 220 }, { name: '$Titanium_name;', count: 10 }, { name: 'gold', count: 0 }, null]);
  assert.deepEqual([...hold], [['steel', 720], ['titanium', 10]]);
});

test('soute : la cargaison de mission (MissionID gardé par l’état du jeu) ne compte pas pour le chantier', () => {
  const g = new GameState();
  g.applyEvent({ event: 'Cargo', Vessel: 'Ship', Count: 920, Inventory: [
    { Name: 'steel', Name_Localised: 'Steel', Count: 720, Stolen: 0 },
    { Name: 'steel', Name_Localised: 'Steel', MissionID: 1012345678, Count: 200, Stolen: 0 },
  ] });
  clearTimeout(g.changeTimer);
  const cargo = g.snapshot().cargo;
  assert.deepEqual(cargo.map((c) => c.missionId ?? null), [null, 1012345678]);
  assert.deepEqual([...holdBySymbol(cargo)], [['steel', 720]]);
  assert.equal(planSite(siteFromExample(), { cargo, capacity: 720, now: NOW }).items.find((i) => i.symbol === 'steel').toBuy, 5960 - 720);
});

test('liste de courses : reste − soute, jamais négatif ; le plus gros reste en tête', () => {
  const site = siteFromExample({ copper: 240 }); // cuivre complet
  const items = shoppingList(site.resources, [{ name: 'steel', count: 720 }, { name: 'water', count: 9999 }, { name: 'gold', count: 50 }]);
  assert.deepEqual(items[0], { symbol: 'steel', name: 'Steel', required: 6680, provided: 720, remaining: 5960, inHold: 720, onCarrier: 0, toBuy: 5240, done: false });
  assert.equal(items.find((i) => i.symbol === 'water').toBuy, 0); // plus en soute que nécessaire
  assert.equal(items.at(-1).symbol, 'copper');
  assert.equal(items.at(-1).done, true);
  assert.ok(!items.some((i) => i.symbol === 'gold')); // marchandise hors chantier ignorée
});

test('trajets : arrondis au-dessus, zéro sans reste, inconnus sans soute', () => {
  assert.equal(tripsFor(0, 720), 0);
  assert.equal(tripsFor(720, 720), 1);
  assert.equal(tripsFor(721, 720), 2);
  assert.equal(tripsFor(100, null), null);
  assert.equal(tripsFor(100, 0), null);
  assert.equal(tripsFor(null, 720), null);
  assert.equal(tripsFor(0, null), 0);
});

test('plan : totaux, soute utile plafonnée au reste, trajets selon la capacité du vaisseau', () => {
  const site = siteFromExample();
  const plan = planSite(site, { cargo: [{ name: 'steel', count: 720 }, { name: 'water', count: 9999 }], capacity: 720, now: NOW });
  assert.equal(plan.known, true);
  assert.equal(plan.totals.required, 21803);
  assert.equal(plan.totals.remaining, 21083);
  assert.equal(plan.totals.inHold, 720 + 717); // l'eau en trop ne compte pas
  assert.equal(plan.totals.toBuy, 21083 - 720 - 717);
  assert.equal(plan.trips, Math.ceil(21083 / 720)); // 30
  assert.equal(plan.tripsToBuy, Math.ceil((21083 - 1437) / 720));
  assert.equal(plan.loop.source, null);
  assert.equal(plan.eta, null);
  assert.equal(plan.deadline, null);
});

test('plan : cas zéro (terminé, besoins inconnus, pas de soute)', () => {
  // Terminé (fin déduite de l'amarrage : la dernière lecture du dépôt montre encore un reste) avec une boucle
  // connue : rien à acheter, et pas de fin estimée « maintenant »
  const done = { ...siteFromExample(), complete: true, user: { loopMinutes: 20 } };
  const p = planSite(done, { capacity: 720, cargo: [{ name: 'steel', count: 720 }], hoursPerEvening: 3, now: NOW });
  assert.equal(p.trips, 0);
  assert.equal(p.totals.remaining, 0);
  assert.equal(p.totals.toBuy, 0);
  assert.equal(p.totals.inHold, 0);
  assert.ok(p.items.every((i) => i.done && i.toBuy === 0 && i.remaining === 0));
  assert.equal(p.items.find((i) => i.symbol === 'steel').provided, 720); // valeurs de la dernière lecture gardées
  assert.equal(p.eta, null);
  // Tout livré sans fin lue : pas de fin estimée non plus
  const all = Object.fromEntries(siteFromExample().resources.map((r) => [r.symbol, r.required]));
  const delivered = { ...siteFromExample(all), user: { loopMinutes: 20 } };
  assert.equal(planSite(delivered, { capacity: 720, now: NOW }).trips, 0);
  assert.equal(planSite(delivered, { capacity: 720, now: NOW }).eta, null);
  const unknown = planSite({ resources: [], contributions: [], user: {} }, { capacity: 720, now: NOW });
  assert.equal(unknown.known, false);
  assert.equal(unknown.trips, null);
  assert.equal(unknown.totals.remaining, null);
  assert.equal(planSite(siteFromExample(), { capacity: null, now: NOW }).trips, null);
});

test('boucle mesurée : un passage par amarrage, pauses de plus de 3 h exclues, 2 boucles au moins', () => {
  const list = [
    contrib('2026-11-07T18:00:00Z', 400, '2026-11-07T17:59:00Z'),
    contrib('2026-11-07T18:01:00Z', 320, '2026-11-07T17:59:00Z'), // même amarrage
    contrib('2026-11-07T18:20:00Z', 720), // sans amarrage connu
    contrib('2026-11-07T18:25:00Z', 10), // moins de 10 min après : même passage
    contrib('2026-11-07T18:42:00Z', 720),
    contrib('2026-11-08T09:00:00Z', 720), // le lendemain : pause
  ];
  assert.deepEqual(deliveryVisits(list).map((v) => v.total), [720, 730, 720, 720]);
  assert.deepEqual(measureLoop(list), { minutes: 21, loops: 2 }); // médiane de 20 et 22 min
  assert.equal(measureLoop(list.slice(0, 3)), null); // une seule boucle
  assert.equal(measureLoop([]), null);
});

test('estimation de fin et échéance saisie : ok, serré, en retard, dépassée, inconnue', () => {
  const site = siteFromExample();
  site.user.loopMinutes = 20;
  site.user.deadline = '2026-11-21T20:00:00.000Z'; // dans 14 jours
  const plan = planSite(site, { capacity: 720, hoursPerEvening: 3, now: NOW });
  assert.deepEqual(plan.loop, { minutes: 20, source: 'saisie', measured: null });
  assert.equal(plan.eta.playMinutes, 30 * 20);
  assert.equal(plan.eta.evenings, 3.3);
  assert.equal(plan.eta.finishAt, '2026-11-08T06:00:00.000Z');
  assert.equal(plan.deadline.source, 'saisie');
  assert.equal(plan.deadline.verdict, 'ok');
  assert.equal(plan.deadline.daysLeft, 14);
  const v = (deadline, extra = {}) => deadlineVerdict({ deadline, complete: false, playMinutes: 600, evenings: 3.3, now: NOW, ...extra }).verdict;
  assert.equal(v('2026-11-09T20:00:00Z'), 'serré'); // 2 jours pour 3,3 soirées
  assert.equal(v('2026-11-08T01:00:00Z'), 'en retard'); // 5 h pour 10 h de jeu
  assert.equal(v('2026-11-01T00:00:00Z'), 'dépassée');
  assert.equal(v('2026-11-21T00:00:00Z', { playMinutes: null }), null);
  assert.equal(v('2026-11-21T00:00:00Z', { complete: true }), 'terminé');
  assert.equal(deadlineVerdict({ deadline: 'pas une date', now: NOW }), null);
});
