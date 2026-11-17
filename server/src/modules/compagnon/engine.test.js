// Tests du moteur du compagnon : gabarits, sac mélangé sans répétition, délais, bavardage, silence en combat.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALERT_GAP, LEVELS, Speaker, formatValue, render } from './engine.js';
import { cleanSettings } from './settings.js';

// Espace insécable fine des nombres français (Intl) → espace ordinaire, pour comparer
const plain = (s) => s?.replace(/[\u202f\u00a0]/g, ' ');
const settings = (o = {}) => cleanSettings(o);

/** Hasard reproductible (suite de Park-Miller). */
function seeded(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const five = ['A {cmdr}', 'B', 'C', 'D', 'E'].map((texte) => ({ texte, humeur: 'content' }));

test('nombres au format français : crédits, années-lumière, pourcentages', () => {
  assert.equal(plain(formatValue('profit', 46827372)), '46 827 372 cr');
  assert.equal(plain(formatValue('merites', 1296017)), '1 296 017');
  assert.equal(formatValue('distance', 38.42), '38,4\u00a0al');
  assert.equal(formatValue('coque', 79.9), '80\u00a0%', 'espace insécable avant l’unité : la bulle ne coupe pas là');
  assert.match(formatValue('profit', 1500), /\u00a0cr$/);
  assert.equal(formatValue('station', 'Flinders City'), 'Flinders City');
});

test('gabarit : variables remplies ; une variable absente rend la phrase inutilisable', () => {
  assert.equal(plain(render('+{profit} à {station}', { profit: 1500000, station: 'Flinders City' })), '+1 500 000 cr à Flinders City');
  assert.equal(render('Bonjour {cmdr}', {}), null);
  assert.equal(render('Bonjour {cmdr}', { cmdr: '' }), null);
  assert.equal(render('Sans variable', {}), 'Sans variable');
  assert.equal(render('{constructor}', {}), null, 'jamais une propriété d’Object');
});

test('gabarit : « de » et « que » élidés devant une voyelle, pas ailleurs', () => {
  assert.equal(plain(render('{quantite} t de {marchandise}', { quantite: 1232, marchandise: 'Indium' })), '1 232 t d’Indium');
  assert.equal(render('Le marché de {station}', { station: 'Écho' }), 'Le marché d’Écho');
  assert.equal(render('Le marché de {station}', { station: 'Flinders City' }), 'Le marché de Flinders City');
  assert.equal(plain(render('Plus que {carburant}', { carburant: 8 })), 'Plus que 8 %');
  assert.equal(render('De {systeme} à ici', { systeme: 'Achenar' }), 'D’Achenar à ici');
  assert.equal(render('Garde {systeme}', { systeme: 'Achenar' }), 'Garde Achenar', 'fin d’un autre mot : rien');
  assert.equal(render('Monde {cmdr}', { cmdr: 'Ivy' }), 'Monde Ivy');
});

test('sac mélangé : toutes les variantes passent avant qu’une revienne, jamais deux fois de suite', () => {
  const sp = new Speaker({ phrases: { vente: five }, random: seeded(7) });
  let previous = null;
  for (let round = 0; round < 40; round += 1) {
    const seen = new Set();
    for (let i = 0; i < five.length; i += 1) {
      const { text } = sp.pick('vente', undefined, { cmdr: 'Testeur' });
      assert.ok(!seen.has(text), `répétition dans le même sac (${text})`);
      assert.notEqual(text, previous, 'deux fois de suite');
      seen.add(text);
      previous = text;
    }
    assert.equal(seen.size, 5);
  }
});

test('variante dont une variable manque : une autre est choisie ; aucune possible : silence', () => {
  const sp = new Speaker({ phrases: { vente: [{ texte: 'À {station}', humeur: 'ravi' }, { texte: 'Sans station', humeur: 'content' }] }, random: seeded(3) });
  for (let i = 0; i < 6; i += 1) assert.equal(sp.pick('vente', undefined, {}).text, 'Sans station');
  const only = new Speaker({ phrases: { vente: [{ texte: 'À {station}', humeur: 'ravi' }] } });
  assert.equal(only.pick('vente', undefined, {}), null);
});

test('cas : seulement les variantes du cas et celles sans cas', () => {
  const phrases = { bonjour: [
    { texte: 'matin', humeur: 'content', cas: 'matin' },
    { texte: 'soir', humeur: 'content', cas: 'soir' },
    { texte: 'toujours', humeur: 'content' },
  ] };
  const sp = new Speaker({ phrases, random: seeded(11) });
  const got = new Set();
  for (let i = 0; i < 20; i += 1) got.add(sp.pick('bonjour', 'soir', {}).text);
  assert.deepEqual([...got].sort(), ['soir', 'toujours']);
});

test('cas qui change d’une fois à l’autre (soir puis matin) : jamais deux fois de suite la même phrase sans cas', () => {
  // Comme les bonjours par défaut : 4 phrases sans cas, 2 ou 3 par moment de la journée
  const phrases = { bonjour: [
    ...['A', 'B', 'C', 'D'].map((texte) => ({ texte, humeur: 'content' })),
    ...['m1', 'm2', 'm3'].map((texte) => ({ texte, humeur: 'content', cas: 'matin' })),
    ...['s1', 's2'].map((texte) => ({ texte, humeur: 'content', cas: 'soir' })),
  ] };
  for (let seed = 1; seed <= 30; seed += 1) {
    const sp = new Speaker({ phrases, random: seeded(seed) });
    let previous = null;
    for (let i = 0; i < 60; i += 1) {
      const cas = (i * 7 + seed) % 3 === 0 ? 'matin' : 'soir';
      const { text } = sp.pick('bonjour', cas, {});
      assert.notEqual(text, previous, `graine ${seed}, tirage ${i} : « ${text} » deux fois de suite`);
      previous = text;
    }
  }
  // Une phrase sans cas dite le soir sort aussi du sac du matin : elle ne revient pas avant les autres
  let checked = 0;
  for (let seed = 1; seed <= 20; seed += 1) {
    const sp = new Speaker({ phrases, random: seeded(seed) });
    sp.pick('bonjour', 'matin', {}); // remplit le sac du matin (7 phrases, 6 restent)
    const said = sp.pick('bonjour', 'soir', {}).text;
    if (!['A', 'B', 'C', 'D'].includes(said)) continue;
    checked += 1;
    const morning = [];
    for (let i = 0; i < 5; i += 1) morning.push(sp.pick('bonjour', 'matin', {}).text); // le reste du sac du matin
    assert.ok(!morning.includes(said), `graine ${seed} : « ${said} » revient le matin alors qu’il reste d’autres phrases`);
  }
  assert.ok(checked > 0);
});

test('réglages : compagnon coupé, catégorie coupée, humeur et nom dans la phrase', () => {
  const sp = new Speaker({ phrases: { vente: [{ texte: '{nom} : {profit}', humeur: 'ravi' }] } });
  const t = { category: 'vente', ctx: { profit: 2_000_000 } };
  assert.equal(sp.say(t, { at: 0, settings: settings({ enabled: false }) }), null);
  assert.equal(sp.say(t, { at: 0, settings: settings({ categories: { vente: false } }) }), null);
  const line = sp.say(t, { at: 0, settings: settings({ name: 'Nova' }) });
  assert.equal(plain(line.text), 'Nova : 2 000 000 cr');
  assert.equal(line.mood, 'ravi');
  assert.equal(line.category, 'vente');
});

test('délai global selon le bavardage, et délai propre à chaque catégorie', () => {
  const phrases = { vente: five, minage: five, amarrage: five };
  for (const [level, gap] of Object.entries(LEVELS).map(([k, v]) => [k, v.gap])) {
    const sp = new Speaker({ phrases, random: () => 0 }); // le hasard dit toujours oui
    const s = settings({ level });
    assert.ok(sp.say({ category: 'vente', ctx: {} }, { at: 0, settings: s, cmdr: 'X' }));
    assert.equal(sp.say({ category: 'minage', ctx: {} }, { at: gap - 1, settings: s, cmdr: 'X' }), null, `${level} : trop tôt`);
    assert.ok(sp.say({ category: 'minage', ctx: {} }, { at: gap, settings: s, cmdr: 'X' }), `${level} : délai global écoulé`);
  }
  // Catégorie « vente » : 240 s en normal, même si le délai global est passé
  const sp = new Speaker({ phrases, random: () => 0 });
  const s = settings();
  sp.say({ category: 'vente', ctx: {} }, { at: 0, settings: s, cmdr: 'X' });
  assert.equal(sp.say({ category: 'vente', ctx: {} }, { at: 200_000, settings: s, cmdr: 'X' }), null);
  assert.ok(sp.say({ category: 'vente', ctx: {} }, { at: 240_000, settings: s, cmdr: 'X' }));
});

test('chance : une catégorie tirée au sort se tait quand le hasard dit non (moins souvent en bavard)', () => {
  const phrases = { amarrage: five };
  const no = new Speaker({ phrases, random: () => 0.6 }); // chance 0,5 en normal
  assert.equal(no.say({ category: 'amarrage', ctx: {} }, { at: 0, settings: settings(), cmdr: 'X' }), null);
  const chatty = new Speaker({ phrases, random: () => 0.6 }); // 0,5 × 1,6 = 0,8 en bavard
  assert.ok(chatty.say({ category: 'amarrage', ctx: {} }, { at: 0, settings: settings({ level: 'bavard' }), cmdr: 'X' }));
});

test('combat : seules les alertes parlent, sans attendre le délai global ; une plus grave coupe la parole', () => {
  const phrases = { vente: five, boucliers: five, degats: five, mort: five, rang: five };
  const sp = new Speaker({ phrases, random: () => 0 });
  const s = settings();
  const opts = (at) => ({ at, settings: s, combat: true, cmdr: 'X' });
  assert.equal(sp.say({ category: 'vente', ctx: {} }, opts(0)), null, 'ordinaire : silence');
  assert.equal(sp.say({ category: 'rang', ctx: {} }, opts(0)), null, 'important : silence aussi');
  const shields = sp.say({ category: 'boucliers', ctx: {} }, opts(1000));
  assert.ok(shields.alert);
  assert.equal(sp.say({ category: 'degats', ctx: {} }, opts(1000 + ALERT_GAP - 1)), null, 'alerte juste après une alerte : on attend');
  assert.ok(sp.say({ category: 'mort', ctx: {} }, opts(1000 + 500)), 'la destruction passe quand même');
  assert.ok(sp.say({ category: 'degats', ctx: {} }, opts(1500 + ALERT_GAP)));
});

test('aperçu : une phrase remplie avec l’exemple, sans toucher aux sacs ni aux délais', () => {
  const sp = new Speaker({ phrases: { jackpot: [{ texte: '{profit} à {station}, {nom}', humeur: 'ravi' }] }, random: seeded(5) });
  const line = sp.sample('jackpot', { settings: settings({ name: 'Nova' }) });
  assert.equal(plain(line.text), '46 827 372 cr à Flinders City, Nova');
  assert.equal(sp.bags.size, 0);
  assert.equal(sp.categoryAt.size, 0);
  assert.ok(sp.say({ category: 'jackpot', ctx: { profit: 1, station: 'X' } }, { at: 0, settings: settings(), cmdr: 'X' }));
  assert.equal(sp.sample('inconnue', { settings: settings() }), null);
});
