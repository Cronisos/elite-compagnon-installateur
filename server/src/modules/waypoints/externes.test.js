// Données venues d'ailleurs dans Mes repères (Spansh, Ardent, alimentés par EDDN où n'importe qui publie) et
// paramètres de l'adresse : jamais un chemin piégé vers Spansh, jamais une clé héritée d'Object, jamais un nombre
// démesuré qui fait créer des millions de cases à la page. Faux fetch : rien ne part.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSurvey, fetchSystemBodies, MAX_SITES, planetType, systemAddressOf } from './survey.js';
import { marketsByOre, padOf, SystemMarkets, systemRanking } from './markets.js';
import { bestOffer } from './topOres.js';

const SYS = 'Synuefe OU-E c28-2';
const SIGNAL = '$PlanetaryMiningLocation_Name;';

test('SystemAddress : seulement un entier du jeu (64 bits), jamais un chemin ou un paramètre', () => {
  for (const ok of ['633943823090', '0', '18446744073709551615', 633943823090]) assert.equal(systemAddressOf(ok), String(ok), String(ok));
  for (const bad of ['../../api/search/save?x=', '1?jsonp=a#', '%2e%2e/%2e%2e/api', '..', '18446744073709551616', '012', '-1', '1.5', '1e9', ' 12', '12 ', '١٢', '', null, undefined, {}, [], -1, 1.5, Number.MAX_SAFE_INTEGER + 2]) {
    assert.equal(systemAddressOf(bad), null, JSON.stringify(bad));
  }
});

test('Spansh : SystemAddress piégé refusé avant tout appel ; un vrai part tel quel', async () => {
  const urls = [];
  const fake = async (url) => {
    urls.push(url);
    return { ok: true, json: async () => ({ system: { bodies: [] } }) };
  };
  for (const bad of ['../../api/search/save?x=', '1?jsonp=a#', '%2e%2e/%2e%2e/api/search/save']) {
    await assert.rejects(fetchSystemBodies(bad, fake), /SystemAddress invalide/);
  }
  assert.deepEqual(urls, [], 'aucune requête pour une adresse piégée');
  await fetchSystemBodies('633943823090', fake);
  assert.deepEqual(urls, ['https://spansh.co.uk/api/dump/633943823090']);
});

test('Spansh : nombre d’EEP démesuré ou mal typé ignoré, champs typés (plus de page blanche ni d’onglet saturé)', async () => {
  const bodies = [
    { name: `${SYS} 1`, subType: 'Rocky body', distanceToArrival: 10, gravity: 0.1, signals: { signals: { [SIGNAL]: 4294967296 } } },
    { name: `${SYS} 2`, subType: 123, distanceToArrival: '12', gravity: Infinity, signals: { signals: { [SIGNAL]: '1e9' } } },
    { name: `${SYS} 3`, subType: 'Icy body', signals: { signals: { [SIGNAL]: 30_000_000 } } },
    { name: `${SYS} 4`, subType: 'Icy body', signals: { signals: { [SIGNAL]: 12 } } },
    { name: 42, signals: { signals: { [SIGNAL]: 3 } } },
    null,
    { name: `${SYS} 5`, signals: { signals: { [SIGNAL]: MAX_SITES } } },
  ];
  const fake = async () => ({ ok: true, json: async () => ({ system: { bodies } }) });
  const list = await fetchSystemBodies('633943823090', fake);
  assert.deepEqual(list.map((b) => [b.body, b.sites]), [[`${SYS} 1`, null], [`${SYS} 2`, null], [`${SYS} 3`, null], [`${SYS} 4`, 12], [`${SYS} 5`, MAX_SITES]]);
  assert.equal(list[1].subType, null, 'type qui n’est pas un texte');
  assert.equal(list[1].distance, null);
  assert.equal(list[1].gravity, null);
  // La vue du système se construit sans exception, et aucun compte ne dépasse la borne
  const s = buildSurvey({ system: SYS, systemAddress: '633943823090', known: list });
  assert.ok(s.planets.every((p) => p.count == null || (Number.isInteger(p.count) && p.count <= MAX_SITES)));
  assert.equal(planetType(123), null);
  assert.equal(planetType('constructor'), 'constructor', 'type inconnu : tel quel, jamais une fonction héritée');
  const pasDeTableau = async () => ({ ok: true, json: async () => ({ system: { bodies: { length: 3 } } }) });
  assert.deepEqual(await fetchSystemBodies('1', pasDeTableau), []);
});

const ligne = (commodityName, extra = {}) => ({ commodityName, marketId: 1, stationName: 'Gare A', stationType: 'Outpost', maxLandingPadSize: 2, sellPrice: 99999, demand: 500, updatedAt: '2026-11-07T10:00:00Z', ...extra });

test('où vendre : « constructor », « __proto__ », « toString » ne deviennent jamais des minerais', () => {
  const rows = [ligne('constructor'), ligne('__proto__', { marketId: 2 }), ligne('toString', { marketId: 3 }), ligne('hasOwnProperty'), ligne('gold', { sellPrice: 50000, marketId: 4, stationName: 'Gare B' })];
  const ores = marketsByOre(rows, [{ marketId: 9, station: 'Mon relevé', at: '2026-11-08T10:00:00Z', items: [{ commodity: '$constructor_name;', sellPrice: 1, demand: 9 }] }]);
  assert.deepEqual(Object.keys(ores), ['Or']);
  assert.equal(Object.getPrototypeOf(ores), Object.prototype, 'prototype intact');
  assert.deepEqual(systemRanking(ores).map((r) => r.ore), ['Or']);
  assert.equal(({}).constructor, Object, 'Object.prototype intact');
});

test('piste : taille inconnue ou clé héritée → null (jamais une fonction, jamais effacée du JSON)', () => {
  assert.equal(padOf(3), 'L');
  for (const v of ['constructor', '__proto__', 'toString', 0, 4, '2', null, undefined]) assert.equal(padOf(v), null, String(v));
  const ores = marketsByOre([ligne('gold', { maxLandingPadSize: 'constructor' })]);
  assert.equal(ores.Or[0].pad, null);
  assert.ok(Object.hasOwn(JSON.parse(JSON.stringify(ores.Or[0])), 'pad'), 'le champ reste dans la réponse');
  assert.equal(bestOffer([{ demand: 5000, sellPrice: 10, stationName: 'X', maxLandingPadSize: 'constructor' }]).pad, null);
  assert.equal(bestOffer([{ demand: 5000, sellPrice: 10, stationName: 'X', maxLandingPadSize: 3 }]).pad, 'L');
});

test('marchés d’un système : cache borné à 50 systèmes, le moins récent part le premier', async () => {
  let n = 0;
  const fake = async () => {
    n += 1;
    return { ok: true, status: 200, json: async () => [] };
  };
  const m = new SystemMarkets({ fetchImpl: fake });
  for (let i = 0; i < 120; i++) await m.rows(`Système ${i}`);
  assert.equal(m.cache.size, 50);
  assert.ok(m.cache.has('Système 119') && !m.cache.has('Système 0'));
  await m.rows('Système 119');
  assert.equal(n, 120, 'un système récent reste en cache');
});
