// R8 dans la relecture des rangs : l'hôte d'une application est la base où l'on est à quai, l'application reste
// attribuée à son auteur. Séance versionnée du 5 nov. (Muang, anonymisée) et base de Chloe Sedesi reconnue par son nom.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildRankLog, rankView, engineerStates, PLACE_EVENTS } from '../services/ranks.js';
import { FLEET_EVENTS } from '../services/fleet.js';
import { placeOf } from '../services/service.js';
import { hostOf, authorIdOf } from '../services/workshop.js';
import { deducePins } from '../services/pins.js';
import { ref, idx, id } from './helpers/itinerary.js';

const withRef = ref ? test : test.skip;
const SEANCE = fileURLToPath(new URL('../../../../../scripts/controle/seances/rangs-ingenieurs-2026-11-05/', import.meta.url));
const FLEET = new Set(FLEET_EVENTS);
const PLACE = new Set(PLACE_EVENTS);

/** Événements gardés par le service (flotte, lieu en copie réduite), dans l'ordre des journaux de la séance. */
function seanceEvents() {
  const out = [];
  for (const f of fs.readdirSync(SEANCE).filter((x) => x.endsWith('.log')).sort()) {
    for (const line of fs.readFileSync(`${SEANCE}${f}`, 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue;
      const ev = JSON.parse(line);
      if (FLEET.has(ev.event)) out.push(ev);
      else if (PLACE.has(ev.event)) out.push(placeOf(ev));
    }
  }
  return out;
}
const workshopOf = (name) => Number(idx.byName.get(name.toLowerCase())?.marketId) || null;
const withHost = { workshopOf, hostOf: (d) => hostOf(d, idx), authorIdOf: (ev) => authorIdOf(ev, idx) };

withRef('Muang, 5 nov. : l’effet de 12:33:56 a pour hôte Broo Tarquin (rang 3), il est fait à l’atelier et attribué à The Dweller', () => {
  const events = seanceEvents();
  const log = buildRankLog(events, withHost);
  const effect = log.applications.find((a) => a.at === '2026-11-05T12:33:56Z');
  assert.equal(effect.experimental, true);
  assert.equal(effect.engineer, 'The Dweller', 'attribuée à l’auteur de la modification en place');
  assert.deepEqual([effect.hostName, effect.hostRank, effect.hostBy, effect.place], ['Broo Tarquin', 3, 'marketId', 'atelier']);
  assert.equal(effect.module, 'hpt_beamlaser_gimbal_small');
  // Les 5 G3 à distance chez Broo (Macmillan Terminal) : à distance, sans hôte
  const remote = log.applications.filter((a) => a.at >= '2026-11-05T12:20:26Z' && a.at <= '2026-11-05T12:20:37Z');
  assert.equal(remote.length, 5);
  assert.ok(remote.every((a) => a.place === 'distance' && a.hostId === null && a.engineer === 'Broo Tarquin' && a.stationType === 'Orbis'));
  // Ce qu'affiche « Rangs des ingénieurs » ne change pas avec l'hôte (effets exclus des mesures, The Dweller au rang 5)
  const before = buildRankLog(events, { workshopOf });
  assert.deepEqual(rankView(log), rankView(before));
  assert.deepEqual([...engineerStates(log)], [...engineerStates(before)]);
  // L'ancienne règle classait cet effet « à distance » (comparé à l'atelier de The Dweller) : c'est ce que corrige R8
  assert.equal(before.applications.find((a) => a.at === '2026-11-05T12:33:56Z').place, 'distance');
  // Épingle déduite chez Broo : Weapon_Efficient (lasers à rayon), le 05/11, G3 au rang 3, 5 applications à distance
  const pins = deducePins(log, ref, idx);
  assert.deepEqual(pins.get(id('Broo Tarquin')), { grp: 'bl', blueprint: 'Weapon_Efficient', at: '2026-11-05T12:20:37Z', grade: 3, rank: 3, count: 5, stationType: 'Orbis' });
  assert.ok(log.surveys >= 1, 'relevé complet lu');
});

withRef('Cinder Dock (MarketID d’EDSM) : base de Chloe Sedesi reconnue par son nom, applications à l’atelier, aucune épingle, montée comptée', () => {
  const CHLOE = id('Chloe Sedesi');
  const t = (n) => `2026-11-03T10:${String(n).padStart(2, '0')}:00Z`;
  for (const market of [128952752, 128954244]) {
    const events = [
      { timestamp: t(0), event: 'EngineerProgress', Engineers: [{ Engineer: 'Chloe Sedesi', EngineerID: CHLOE, Progress: 'Unlocked', Rank: 1, RankProgress: 0 }] },
      { timestamp: t(1), event: 'Loadout', Ship: 'krait_mkii', ShipID: 3, ShipName: '', ShipIdent: '', Modules: [{ Slot: 'MainEngines', Item: 'int_engine_size6_class5' }] },
      placeOf({ timestamp: t(2), event: 'Docked', StationName: 'Cinder Dock', StationType: 'CraterPort', Taxi: false, Multicrew: false, StarSystem: 'Shenve', SystemAddress: 594676730147, MarketID: market, StationServices: ['dock', 'engineer', 'outfitting'] }),
      ...[1, 2, 3].map((k) => ({ timestamp: t(2 + k), event: 'EngineerCraft', Slot: 'MainEngines', Module: 'int_engine_size6_class5', Engineer: 'Chloe Sedesi', EngineerID: CHLOE, BlueprintName: 'Engine_Dirty', Level: 1, Quality: +(k / 5).toFixed(2) })),
    ];
    const log = buildRankLog(events, withHost);
    const apps = log.applications.filter((a) => a.engineer === 'Chloe Sedesi');
    assert.equal(apps.length, 3);
    assert.ok(apps.every((a) => a.place === 'atelier'), `${market} : ${apps.map((a) => a.place)}`);
    assert.equal(apps[0].hostBy, market === 128954244 ? 'marketId' : 'nom');
    assert.equal(deducePins(log, ref, idx).has(CHLOE), false);
    assert.equal(log.engineers.get('Chloe Sedesi').since.length, 3, 'comptées pour sa montée');
  }
});
