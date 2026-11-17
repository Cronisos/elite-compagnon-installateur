// Tests des sources proches (Ardent Insight), réseau simulé. Les lignes reprennent la forme des réponses relevées
// le 7 nov. 2026 autour de Synuefe OU-E c28-2 (spécification), pas un appel réel.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ColonisationSources, padFits, rankRows, stationRow } from './sources.js';

const NOW = Date.parse('2026-11-07T22:00:00Z');
const row = (o) => ({
  commodityName: 'steel', marketId: 1, stationName: 'Lumbridge Cove', stationType: 'Coriolis', distanceToArrival: 8601.2, maxLandingPadSize: 3,
  bodyId: null, bodyName: null, systemAddress: 2, systemName: 'Synuefe EA-I b57-5', buyPrice: 3427, stock: 1412, updatedAt: '2026-09-20T12:00:00Z', distance: 16, ...o,
});

/** fetch simulé : réponses par motif d'adresse, et la liste des adresses appelées. */
function fakeFetch(routes) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    for (const [re, reply] of routes) {
      if (!re.test(url)) continue;
      if (reply instanceof Error) throw reply;
      const { status = 200, body = [] } = typeof reply === 'function' ? reply(url) : reply;
      return { status, ok: status >= 200 && status < 300, json: async () => body };
    }
    return { status: 200, ok: true, json: async () => [] };
  };
  return { fetchImpl, calls };
}

test('ligne d’Ardent : stock, plateforme, âge du relevé ; ligne vide ou sans stock écartée', () => {
  const r = stationRow(row(), NOW);
  assert.deepEqual(r, { station: 'Lumbridge Cove', stationType: 'Coriolis', system: 'Synuefe EA-I b57-5', distance: 16, arrival: 8601, pad: 'L', stock: 1412, price: 3427, updatedAt: '2026-09-20T12:00:00.000Z', ageDays: 48.4, carrier: false });
  assert.equal(stationRow(row({ stock: 0 }), NOW), null); // importateur
  assert.equal(stationRow(null), null);
  assert.equal(stationRow({ stationName: 'X' }), null);
  assert.equal(padFits({ pad: 'M' }, 'L'), false);
  assert.equal(padFits({ pad: null }, 'L'), true); // inconnue : gardée
  assert.equal(padFits({ pad: 'S' }, null), true);
  // Plateforme piégée venue d'Ardent : rien trouvé sur le prototype d'Object, plateforme inconnue (gardée)
  for (const bad of ['__proto__', 'constructor', 'toString', '3', null]) {
    const trapped = stationRow(row({ maxLandingPadSize: bad }), NOW);
    assert.equal(trapped.pad, null, String(bad));
    assert.equal(padFits(trapped, 'L'), true, String(bad));
  }
  assert.equal(padFits({ pad: 'constructor' }, 'L'), true);
  const ranked = rankRows([{ distance: 16, arrival: 100 }, { distance: 0, arrival: 9000 }, { distance: 16, arrival: 50 }]);
  assert.deepEqual(ranked.map((x) => [x.distance, x.arrival]), [[0, 9000], [16, 50], [16, 100]]);
});

test('recherche : système local + proches, filtrées (plateforme, porteurs), triées par distance, assez de stock ?', async () => {
  const { fetchImpl, calls } = fakeFetch([
    [/commodities\/exports/, { body: [row({ stationName: 'Flinders City', systemName: 'Synuefe OU-E c28-2', distance: undefined, stock: 9000, maxLandingPadSize: 2 }), row({ commodityName: 'titanium', stationName: 'Rivers Depot', stock: 40, distance: undefined })] }],
    [/commodity\/name\/steel\/nearby/, { body: [
      row({ stationName: 'Fuca Town', systemName: 'Col 285 Sector DB-E c12-24', distance: 43, stock: 209057, updatedAt: '2026-11-07T10:00:00Z' }),
      row(),
      row({ stationName: 'Petit avant-poste', distance: 5, maxLandingPadSize: 2 }),
      row({ stationName: 'X1X-2Y2', stationType: 'FleetCarrier', distance: 3 }),
    ] }],
    [/commodity\/name\/titanium\/nearby/, { body: [] }],
  ]);
  const src = new ColonisationSources({ fetchImpl, now: () => NOW });
  const out = await src.nearby({ system: 'Synuefe OU-E c28-2', pad: 'L', maxDistance: 50, maxDaysAgo: 14, commodities: [
    { symbol: 'steel', name: 'Steel', remaining: 5000 }, { symbol: 'titanium', name: 'Titanium', remaining: 100 }, { symbol: 'copper', name: 'Copper', remaining: 0 },
  ] });
  assert.equal(out.error, null);
  assert.deepEqual(out.results.map((r) => r.symbol), ['steel', 'titanium']); // le cuivre est complet
  const steel = out.results[0];
  assert.deepEqual(steel.stations.map((s) => [s.station, s.distance, s.enough]), [['Lumbridge Cove', 16, false], ['Fuca Town', 43, true]]);
  const titanium = out.results[1];
  assert.deepEqual(titanium.stations.map((s) => [s.station, s.distance, s.enough]), [['Rivers Depot', 0, false]]); // dans le système même
  assert.ok(calls.some((u) => u === 'https://api.ardent-insight.com/v2/system/name/Synuefe%20OU-E%20c28-2/commodity/name/steel/nearby/exports?maxDistance=50&maxDaysAgo=14&fleetCarriers=false&sort=distance'));
  assert.equal(calls.length, 3);
  // Cache de 30 min : rien n'est redemandé
  await src.nearby({ system: 'Synuefe OU-E c28-2', pad: 'L', maxDistance: 50, maxDaysAgo: 14, commodities: [{ symbol: 'steel', remaining: 1 }] });
  assert.equal(calls.length, 3);
  assert.equal(src.stats.cached, 2);
});

test('erreurs rendues proprement : système inconnu (404), réseau coupé, système du chantier inconnu', async () => {
  const unknown = new ColonisationSources({ fetchImpl: fakeFetch([[/./, { status: 404, body: { error: 'Not Found' } }]]).fetchImpl });
  const a = await unknown.nearby({ system: 'Nouveau Système', commodities: [{ symbol: 'steel', remaining: 1 }] });
  assert.match(a.error, /inconnu d'Ardent Insight/);
  assert.deepEqual(a.results, []);

  const down = new ColonisationSources({ fetchImpl: fakeFetch([[/./, new TypeError('fetch failed')]]).fetchImpl });
  const b = await down.nearby({ system: 'Sol', commodities: [{ symbol: 'steel', remaining: 1 }] });
  assert.match(b.error, /injoignable \(fetch failed\)/);

  // Panne sur une seule marchandise : les autres restent
  const half = new ColonisationSources({ fetchImpl: fakeFetch([[/commodities\/exports/, { body: [] }], [/steel/, { status: 500 }], [/titanium/, { body: [row({ commodityName: 'titanium' })] }]]).fetchImpl, now: () => NOW });
  const c = await half.nearby({ system: 'Sol', commodities: [{ symbol: 'steel', remaining: 1 }, { symbol: 'titanium', remaining: 1 }] });
  assert.match(c.results[0].error, /répondu 500/);
  assert.equal(c.results[1].stations.length, 1);

  const none = new ColonisationSources({ fetchImpl: () => assert.fail('aucun appel sans système') });
  assert.match((await none.nearby({ system: null, commodities: [{ symbol: 'steel', remaining: 1 }] })).error, /Système du chantier inconnu/);
});
