import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSurvey, cleanDeposits, cleanRating, fetchSystemBodies, siteState } from './survey.js';
import { AUTO_LABEL } from './lastSpot.js';

const SYS = 'Synuefe OU-E c28-2';
const row = (number, extra = {}) => ({ system: SYS, body: `${SYS} 4`, number, bad: false, deposits: '[]', notes: '', ...extra });

test('minerais et note : minerai obligatoire, sans doublon ; note entière de 1 à 10', () => {
  assert.deepEqual(cleanDeposits([{ ore: ' Iridium ' }, { ore: '' }, { ore: 'iridium' }, { ore: 'Or', drills: 3 }]), [{ ore: 'Iridium' }, { ore: 'Or' }]);
  assert.deepEqual(cleanDeposits(null), []);
  assert.deepEqual([cleanRating(7), cleanRating('10'), cleanRating(0), cleanRating(11), cleanRating(null), cleanRating(4.5)], [7, 10, null, null, null, null]);
});

test('emplacement : rentable à partir de 6/10, faible en dessous, rien d\'intéressant, tari, pas noté', () => {
  const now = new Date('2026-11-06');
  const ores = [{ ore: 'Iridium' }, { ore: 'Or' }];
  assert.equal(siteState({ rating: 6, deposits: ores }, now), 'good');
  assert.equal(siteState({ rating: 5, deposits: ores }, now), 'low');
  assert.equal(siteState({ rating: 3, deposits: [], waypoints: [{ category: 'mining', drills: 4 }] }, now), 'low'); // la note prime
  assert.equal(siteState({ deposits: ores }, now), 'seen');
  assert.equal(siteState({ bad: true, rating: 9, deposits: ores }, now), 'bad');
  assert.equal(siteState({ deposits: [], waypoints: [{ category: 'mining', drills: 3 }] }, now), 'good');
  assert.equal(siteState({ deposits: [], waypoints: [{ category: 'mining', depletedUntil: '2026-12-01' }] }, now), 'depleted');
  // « Rien d'intéressant » : seulement quand le joueur l'a dit. Un repère « pas rentable » rend l'EEP faible.
  assert.equal(siteState({ deposits: [], waypoints: [{ category: 'mining', unprofitable: true }] }, now), 'low');
  assert.equal(siteState({ deposits: [] }, now), 'unknown');
});

test('tari : un gisement vidé ne tarit pas tout l’EEP, il l’est quand tous le sont ; « Fin du dernier minage » ne compte pas', () => {
  const now = new Date('2026-11-14T23:00:00Z');
  const body = `${SYS} 12 b`;
  const vide = new Date('2027-01-14T21:40:39Z');
  const wp = (id, label, drills, depletedUntil = null) => ({ id, label, category: 'mining', siteNumber: 4, drills, unprofitable: false, depletedUntil, body, system: SYS });
  // Cas réel du 14 nov. : EEP 4 de 12 b, un gisement de diamants vidé, deux autres trouvés à côté
  const waypoints = [wp(63, 'Diamants basse température', 3, vide), wp(64, '⛏ Fin du dernier minage', null), wp(65, 'Diamants basse température', 1), wp(66, 'Diamants basse température', 4)];
  assert.equal(siteState({ deposits: [], waypoints }, now), 'good');
  let [site] = buildSurvey({ system: SYS, waypoints }, now).planets[0].sites;
  assert.equal(site.state, 'good');
  assert.equal(site.depletedUntil, null, 'pas de « de retour le » tant que l’EEP n’est pas tari');
  // Les deux autres vidés : tout l'EEP est tari, de retour quand le dernier revient
  const tard = new Date('2027-01-20T10:00:00Z');
  const tous = [wp(63, 'Diamants basse température', 3, vide), wp(64, '⛏ Fin du dernier minage', null), wp(65, 'Diamants basse température', 1, vide), wp(66, 'Diamants basse température', 4, tard)];
  [site] = buildSurvey({ system: SYS, waypoints: tous }, now).planets[0].sites;
  assert.equal(site.state, 'depleted');
  assert.equal(new Date(site.depletedUntil).toISOString(), tard.toISOString());
  // Le repère « Fin du dernier minage » seul ne fait ni un gisement rentable ni un minerai
  assert.equal(siteState({ deposits: [], waypoints: [wp(64, '⛏ Fin du dernier minage', null)] }, now), 'unknown');
  const [p] = buildSurvey({ system: SYS, waypoints: tous }, now).planets;
  assert.ok(!p.ores.some((o) => o.ore.includes('Fin du dernier minage')));
});

test('petits gisements : des repères de 1 ou 2 foreuses ne font jamais « rien d’intéressant », leurs minerais restent', () => {
  const now = new Date('2026-11-13');
  const body = `${SYS} 11 a`;
  const wp = (id, label, siteNumber, drills) => ({ id, label, category: 'mining', siteNumber, drills, unprofitable: false, body, system: SYS });
  // Cas réel du 13 nov. : EEP 3 et 8, diamants basse température et hélium 3, 1 ou 2 foreuses chacun
  const waypoints = [wp(53, 'Hélium 3', 3, 1), wp(54, 'Diamants basse température', 3, 2), wp(55, 'Diamants basse température', 3, 1),
    wp(56, 'Diamants basse température', 8, 1), wp(57, 'Diamants basse température', 8, 2)];
  assert.equal(siteState({ deposits: [], waypoints }, now), 'low');
  const s = buildSurvey({ system: SYS, waypoints }, now);
  const [p] = s.planets;
  assert.equal(p.verdict, 'low');
  assert.deepEqual(p.sites.map((x) => [x.number, x.state, x.bad]), [[3, 'low', false], [8, 'low', false]]);
  assert.deepEqual(p.ores.map((o) => [o.ore, o.weak.map((w) => w.number)]), [['Diamants basse température', [3, 8]], ['Hélium 3', [3]]]);
  assert.equal(s.totals.low, 1);
  assert.equal(s.totals.out, 0);
  // Le joueur coche « rien d'intéressant » : là, oui
  const dit = buildSurvey({ system: SYS, waypoints, sites: [{ body, number: 3, bad: true, deposits: '[]' }] }, now);
  assert.deepEqual(dit.planets[0].sites.map((x) => x.state), ['bad', 'low']);
});

test('système : planètes rentables d\'abord, planète out à la fin, minerais à aller chercher', () => {
  const s = buildSurvey({
    system: SYS,
    known: [
      { body: `${SYS} 2`, distance: 37, sites: 20 },
      { body: `${SYS} 3`, distance: 65, sites: 10 },
      { body: `${SYS} 4`, subType: 'High metal content world', distance: 64, sites: 25 },
      { body: `${SYS} 12 e`, distance: 2583, sites: 25 },
    ],
    scanned: new Map([[`${SYS} 3`, 11], ['Autre système 1', 4]]),
    classes: new Map([[`${SYS} 3`, 'Rocky ice body']]),
    sites: [
      row(4, { rating: 6, deposits: JSON.stringify([{ ore: 'Iridium' }]) }),
      row(7, { rating: 9, deposits: JSON.stringify([{ ore: 'Iridium' }, { ore: 'Uranium' }]) }),
      row(9, { rating: 2, deposits: JSON.stringify([{ ore: 'Or' }]) }),
      row(2, { bad: true }),
      row(1, { body: `${SYS} 3`, bad: true }),
    ],
    bodies: [{ system: SYS, body: `${SYS} 2`, out: true, notes: 'rien de correct' }],
    here: { body: `${SYS} 4` },
  });
  assert.deepEqual(s.planets.map((p) => [p.name, p.verdict]), [['4', 'good'], ['12 e', 'unknown'], ['3', 'bad'], ['2', 'out']]);
  const p4 = s.planets[0];
  assert.equal(p4.here, true);
  assert.equal(p4.count, 25);
  assert.equal(p4.seen, 4);
  assert.equal(p4.good, 2);
  assert.equal(p4.best, 9);
  // EEP rentables les mieux notés d'abord
  assert.deepEqual(p4.ores.map((o) => [o.ore, o.good.map((x) => x.number), o.weak.map((x) => x.number)]),
    [['Iridium', [7, 4], []], ['Uranium', [7], []], ['Or', [], [9]]]);
  assert.equal(s.planets.find((p) => p.name === '3').count, 11); // le scan du joueur l'emporte sur Spansh
  assert.equal(p4.type, 'Haute teneur en métaux');
  assert.equal(s.planets.find((p) => p.name === '3').type, 'Roche et glace'); // type du scan, absent de Spansh
  assert.deepEqual(s.totals, { planets: 4, good: 1, depleted: 0, low: 0, out: 2, unknown: 1 });
});

test('système : un repère de minage compte comme un emplacement vu', () => {
  const s = buildSurvey({
    system: SYS,
    waypoints: [
      { id: 9, category: 'mining', body: `${SYS} 10 a`, siteNumber: 5, drills: 4 },
      { id: 10, category: 'bio', body: `${SYS} 10 b` },
    ],
  });
  assert.equal(s.planets.length, 1);
  assert.deepEqual(s.planets[0].sites.map((x) => [x.number, x.state, x.waypoints]), [[5, 'good', [9]]]);
});

test('planète (B44) : un repère tari sans numéro d’EEP ne la garde pas « rentable » ; tarie, avec sa date de retour', () => {
  const now = new Date('2026-11-15T12:00:00Z');
  const body = `${SYS} 10 a`;
  const retour = '2027-01-10T12:00:00.000Z';
  const tari = { id: 1, category: 'mining', body, siteNumber: null, label: 'Platine', depletedUntil: retour };
  let s = buildSurvey({ system: SYS, waypoints: [tari] }, now);
  assert.equal(s.planets[0].verdict, 'depleted');
  assert.equal(s.planets[0].depletedUntil, retour);
  // Un gisement encore bon sur la planète : elle reste rentable
  s = buildSurvey({ system: SYS, waypoints: [tari, { id: 2, category: 'mining', body, siteNumber: null, label: 'Or' }] }, now);
  assert.equal(s.planets[0].verdict, 'good');
  assert.equal(s.planets[0].depletedUntil, null);
  // Date passée : le gisement est revenu
  s = buildSurvey({ system: SYS, waypoints: [{ ...tari, depletedUntil: '2026-11-01T00:00:00.000Z' }] }, now);
  assert.equal(s.planets[0].verdict, 'good');
  // « Fin du dernier minage » marque une position, pas un gisement
  s = buildSurvey({ system: SYS, waypoints: [{ id: 3, category: 'mining', body, siteNumber: null, label: AUTO_LABEL }] }, now);
  assert.equal(s.planets[0].verdict, 'unknown');
});

test('Spansh : seules les planètes avec des EEP', async () => {
  const fake = async () => ({ ok: true, json: async () => ({ system: { bodies: [
    { name: `${SYS} 4`, subType: 'High metal content world', distanceToArrival: 64.2, gravity: 0.3, signals: { signals: { '$PlanetaryMiningLocation_Name;': 25 } } },
    { name: `${SYS} 10`, subType: 'Gas giant' },
  ] } }) });
  assert.deepEqual(await fetchSystemBodies('633943823090', fake), [
    { body: `${SYS} 4`, subType: 'High metal content world', distance: 64.2, gravity: 0.3, sites: 25 },
  ]);
});

test('emplacement : minerais lus sans foreuses comptées, ni bon ni mauvais', () => {
  assert.equal(siteState({ deposits: [{ ore: 'Or' }, { ore: 'Iridium' }] }), 'seen');
  const s = buildSurvey({ system: SYS, sites: [row(25, { deposits: JSON.stringify([{ ore: 'Or' }]) }), row(3, { bad: true })] });
  assert.equal(s.planets[0].verdict, 'unknown'); // il reste un EEP à évaluer
});
