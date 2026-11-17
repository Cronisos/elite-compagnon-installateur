// « Copier pour Discord » du Calculateur de routes : une station renommée dans EDDN (donc chez Ardent Insight) ne
// mentionne personne et n'affiche aucun lien masqué. Les routes sont calculées par le vrai calculateur du serveur.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMarkets, findRoutes } from '../../../../server/src/modules/planner/calc.js';
import { plannerDiscordText } from './plannerText.js';

const ZWSP = '\u{200b}';
const PIEGE = '@everyone [Spansh](https://exemple.invalid/) <@&123456789012345678>';
const AT = '2026-10-28T16:00:00.000Z';
const A = { systemName: 'Sys1', systemX: 0, systemY: 0, systemZ: 0, marketId: 1, stationName: 'Gare A', stationType: 'Coriolis', distanceToArrival: 100, maxLandingPadSize: 3 };
const B = { systemName: 'Sys2', systemX: 10, systemY: 0, systemZ: 0, marketId: 2, stationName: PIEGE, stationType: 'Coriolis', distanceToArrival: 100, maxLandingPadSize: 3 };
const row = (st, commodityName, o) => ({ ...st, commodityName, buyPrice: 0, sellPrice: 0, stock: 0, demand: 0, updatedAt: AT, ...o });

function routes() {
  const rows = [
    row(A, 'tantalum', { buyPrice: 1000, stock: 500000 }),
    row(B, 'tantalum', { sellPrice: 25000, demand: 900000 }),
    row(B, 'bauxite', { buyPrice: 700, stock: 900000 }),
    row(A, 'bauxite', { sellPrice: 20000, demand: 900000 }),
  ];
  const { loops, oneWay } = findRoutes(buildMarkets(rows, { pad: 'L' }), { cargo: 1232, range: 20 });
  const named = (t) => t && { ...t, name: t.commodity === 'tantalum' ? 'Tantale' : `**${t.commodity}** @here` };
  return { loop: { ...loops[0], out: named(loops[0].out), back: named(loops[0].back) }, oneWay: { ...oneWay[0], out: named(oneWay[0].out) } };
}

test('station piégée chez Ardent : ni @everyone, ni rôle, ni lien masqué dans le texte copié', () => {
  const { loop, oneWay } = routes();
  for (const [r, isLoop] of [[loop, true], [oneWay, false]]) {
    const text = plannerDiscordText(r, isLoop);
    assert.ok(!/@(everyone|here)\b/.test(text), text);
    assert.ok(!/<@&?\d/.test(text), text);
    assert.ok(!/(^|[^\\])\]\(/.test(text), `lien masqué : ${text}`);
    assert.ok(!text.includes('https://'), text);
    assert.ok(text.includes(`@${ZWSP}everyone \\[Spansh\\]`), 'le nom reste lisible');
  }
});

test('route ordinaire : texte inchangé', () => {
  const r = {
    from: { station: 'Titius Station', system: 'Cemiess' },
    to: { station: 'Port Draught', system: 'ICZ KC-U b3-4' },
    out: { name: 'Tantale', margin: 13942 },
    back: { name: 'Bauxite', margin: 40955 },
    profit: 67_634_456,
    jumps: 2,
    distance: 28.4,
  };
  assert.equal(plannerDiscordText(r, true), [
    '**Titius Station (Cemiess) ⇄ Port Draught (ICZ KC-U b3-4)**',
    'Aller : Tantale, +13 942 cr/t',
    'Retour : Bauxite, +40 955 cr/t',
    '≈ 67,6 M cr par boucle, 2 sauts, 28,4 al',
  ].join('\n').replace(/ (?=\d{3}\b)/g, '\u{202f}'));
});
