// Partage Discord d'une route : une station ou un porteur nommé par un joueur ne mentionne personne, n'affiche aucun
// lien masqué et ne casse pas la mise en forme du message ; une route ordinaire garde son texte.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDiscordMessage } from './shareText.js';

const PIEGE = '@everyone [Spansh](https://exemple.invalid/) <@&123456789012345678>';

function view({ start = 'Titius Station', stop = 'Port Draught', jump = 'HIP 1', commodity = 'Tantale', topup = 'Bauxite', commander = 'Pilote_Test' } = {}) {
  return {
    route: { name: `${start} ⇄ ${stop}`, createdAt: '2026-10-28T16:00:00Z' },
    structure: {
      stations: [{ station: start, pad: 'L' }],
      startStation: start,
      startSystem: 'Cemiess',
      start: { buys: [{ commodity: 'tantalum', name: commodity, price: 1300 }] },
      stops: [{ station: stop, system: 'ICZ KC-U b3-4', pad: 'L', sells: [{ commodity: 'tantalum', name: commodity, price: 15242 }], buys: [] }],
      legs: [{ jumps: [{ system: jump, dist: 12.3 }], distance: 12.3 }, { jumps: [{ system: 'Cemiess', dist: 12.3 }], distance: 12.3 }],
      legCommodities: [{ commodity: 'tantalum' }],
      arrival: { sells: [] },
      jumpsPerLoop: 2,
      longestJump: 12.3,
    },
    loops: [],
    stats: { trends: [{ commodity: 'tantalum', name: commodity, lastBuy: 1300, lastSell: 15242 }], avgMinutes: 12 },
    market: [{ from: { station: start }, to: { station: stop }, topups: [{ name: topup, margin: 500, stock: 1000 }] }],
    commander,
  };
}

test('route ordinaire : noms inchangés, nom de commandant à tiret bas sans italique', () => {
  const text = buildDiscordMessage(view(), { cargo: 100, commander: true });
  assert.match(text, /^## Route commerciale : Titius Station ⇄ Port Draught$/m);
  assert.match(text, /^\*\*1\. Titius Station\*\* — Cemiess · plateforme L$/m);
  assert.match(text, /— HIP 1 \(12,3 al\)/);
  assert.match(text, /^• Titius Station → Port Draught : Bauxite \(\+500 cr\/t/m);
  assert.match(text, /\*Partagé par CMDR Pilote\\_Test\*$/);
});

test('noms piégés (station, système, marchandise, commandant) : ni mention, ni rôle, ni lien masqué', () => {
  const text = buildDiscordMessage(view({ start: PIEGE, stop: `# ${PIEGE}`, jump: PIEGE, commodity: `**${PIEGE}**`, topup: PIEGE, commander: PIEGE }), { cargo: 100, commander: true });
  assert.ok(!/@(everyone|here)\b/.test(text), text);
  assert.ok(!/<@&?\d/.test(text), text);
  assert.ok(!/(^|[^\\])\]\(/m.test(text), `lien masqué : ${text}`);
  assert.ok(!text.includes('https://'), text);
  assert.ok(!/^#(?!# Route commerciale)/m.test(text), 'aucun titre ajouté');
});
