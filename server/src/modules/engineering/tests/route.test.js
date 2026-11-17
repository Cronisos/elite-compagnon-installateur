// Itinéraire d'ingénierie : cas faits à la main (spécification feat/16, § 4.13), sur les vraies données des ingénieurs
// et les données de référence figées. Tous les ingénieurs au rang 5 et débloqués, sauf mention contraire.
// Tolérance des distances et des coûts : 0,05 al (al-éq.).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeRouteCore } from '../services/route.js';
import { engineerModel } from '../services/calc.js';
import { distanceLy } from '../services/position.js';
import { ref, idx, id, engineers, U, S, mod, plan, pin, routeInput, refWithTestShips, close, FSD, T5, T6, SG, BSG, LS, SCB, SB, COLONIA } from './helpers/itinerary.js';

const withRef = ref ? test : test.skip;
const run = (over) => computeRouteCore(routeInput(over));
const stops = (r) => r.parts.flatMap((p) => p.stops);
const names = (r) => stops(r).map((s) => idx.byId.get(s.engineer).name);
const totalW = (r) => r.parts.reduce((a, p) => a + p.cost.w, 0);
const task = (r, tid) => stops(r).flatMap((s) => s.tasks).find((t) => t.id === tid);
const sgPlan = () => [plan(6, [mod('std-s', SG, 'ShieldGenerator_Reinforced', 5, 'special_shield_lightweight')])];
const fsdThrusters = () => [plan(6, [mod('std-fsd', FSD, 'FSD_LongRange', 5, 'special_fsd_heavy'), mod('std-t', T6, 'Engine_Dirty', 5, 'special_engine_overloaded')])];
const FELICITY_FSD = () => new Map([[id('Felicity Farseer'), pin('fsd', 'FSD_LongRange')]]);

withRef('T1 (l’auteur) : dans la Bulle, Lei Cheung (connu, verrouillé) plutôt que Mel Brandon à Colonia (débloqué)', () => {
  const r = run({ plans: sgPlan(), engineers: engineers({ 'Lei Cheung': S('Known') }) });
  assert.deepEqual(names(r), ['Lei Cheung']);
  const s = stops(r)[0];
  assert.deepEqual(s.unlock.steps.map((x) => x.kind), ['invitation', 'deblocage']);
  assert.equal(s.unlock.steps[1].items[0].label, 'Or');
  assert.equal(s.unlock.steps[1].items[0].check.state, 'manque', 'soute vide');
  assert.equal(s.rank.extraRolls, 10, '25 applications de grades au lieu de 15');
  assert.equal(task(r, '6/std-s:grades').rolls, 25);
  assert.ok(task(r, '6/std-s:effet'), 'l’effet en plus');
  assert.ok(close(totalW(r), 118.18 + 100 + 28.28 + 25 * 10), totalW(r));
  // Mel n'apparaît que dans « Pourquoi lui ? », « autre région », toujours gardée
  const all = JSON.stringify(r.parts);
  assert.equal(stops(r).some((x) => x.engineer === id('Mel Brandon')), false);
  const grades = s.why.units.find((u) => u.id === '6/std-s:grades');
  assert.deepEqual(grades.others.find((o) => o.engineer === id('Mel Brandon')).verdict, 'autre-region');
  assert.ok(all.includes(String(id('Mel Brandon'))));
  assert.deepEqual(s.why.without, { feasible: false, crossing: true });
  assert.equal(r.parts.some((p) => p.kind === 'traversee'), false);
});

withRef('T2 (l’auteur) : épingle au G5 chez Felicity → seul l’effet demande une escale, groupé avec les propulseurs chez Palin', () => {
  const r = run({ plans: fsdThrusters(), pins: FELICITY_FSD() });
  assert.deepEqual(names(r), ['Professor Palin']);
  assert.equal(r.remote.length, 1);
  assert.deepEqual([r.remote[0].engineer, r.remote[0].grades, r.remote[0].rolls, r.remote[0].before, r.remote[0].split], [id('Felicity Farseer'), [1, 2, 3, 4, 5], 15, 1, false]);
  const eff = task(r, '6/std-fsd:effet');
  assert.deepEqual(eff.rules, ['R5b']);
  assert.equal(eff.fallback.engineer, id('Felicity Farseer'));
  assert.ok(close(eff.fallback.extraAl, 128.11));
  assert.deepEqual(eff.variant, { rules: ['R6c'] });
  assert.ok(task(r, '6/std-t:grades') && task(r, '6/std-t:effet'));
  assert.ok(close(totalW(r), 295.42));
  const s = stops(r)[0];
  assert.deepEqual(s.why.without.replacedBy, [id('Chloe Sedesi')]);
  assert.ok(close(s.why.without.dW, 707.74) && close(s.why.without.dPathAl, 778.92) && close(s.why.without.dSupercruiseAl, -71.18));
  const chloe = s.why.units.find((u) => u.id === '6/std-t:grades').others.find((o) => o.engineer === id('Chloe Sedesi'));
  assert.deepEqual([chloe.verdict, chloe.how], ['plus-loin', 'remplacement']);
  assert.ok(close(chloe.addedAl, 778.92) && close(chloe.addedW, 707.74));
  // Les options du § 4.11 : la meilleure de la région, la plus proche de l'autre région, puis les grades max
  assert.deepEqual(s.why.units.find((u) => u.id === '6/std-t:grades').others.map((o) => [o.engineer, o.verdict]), [
    [id('Chloe Sedesi'), 'plus-loin'], [id('Mel Brandon'), 'autre-region'], [id('Felicity Farseer'), 'grade-max'], [id('Elvira Martuuk'), 'grade-max'],
  ]);
});

withRef('T3 : sans épingle, Palin puis Felicity (exact, comme la force brute sur les mêmes données)', () => {
  const r = run({ plans: fsdThrusters() });
  assert.deepEqual(names(r), ['Professor Palin', 'Felicity Farseer']);
  assert.equal(r.exact, true);
  assert.ok(close(totalW(r), 613.87), totalW(r));
  assert.ok(close(stops(r).at(-1).cumulAl, 226.13));
  // Force brute : propulseurs G5 chez Palin ou Chloe, FSD G5 chez Elvira ou Felicity (chacun pose son effet) ; ordre libre
  const at = (n) => idx.byId.get(id(n));
  const W = (list) => {
    const perm = (l) => (l.length <= 1 ? [l] : l.flatMap((x, i) => perm([...l.slice(0, i), ...l.slice(i + 1)]).map((p) => [x, ...p])));
    let best = Infinity;
    for (const order of perm(list)) {
      let len = 0;
      let from = [0, 0, 0];
      for (const n of order) {
        len += distanceLy(from, at(n).coords);
        from = at(n).coords;
      }
      best = Math.min(best, len);
    }
    return best + list.reduce((a, n) => a + 100 + 2 * Math.sqrt(at(n).distanceToArrivalLs), 0);
  };
  let brute = Infinity;
  for (const t of ['Professor Palin', 'Chloe Sedesi']) for (const f of ['Elvira Martuuk', 'Felicity Farseer']) brute = Math.min(brute, W([t, f]));
  assert.ok(close(brute, totalW(r)), `${brute} / ${totalW(r)}`);
  assert.ok(close(W(['Professor Palin', 'Elvira Martuuk']), 677.43));
});

withRef('T4 : départ choisi (Sol) sans position connue : from.at null, positionAtCompute null', () => {
  const r = run({ plans: fsdThrusters() });
  assert.equal(r.from.kind, 'sol');
  assert.equal(r.from.at, null);
  assert.equal(r.positionAtCompute, null);
});

withRef('T5 : départ Colonia, Mel ; Mel connu et Lei débloqué → toujours Mel, avec son déblocage ; primes jamais « ✓ »', () => {
  assert.deepEqual(names(run({ from: COLONIA, plans: sgPlan() })), ['Mel Brandon']);
  const r = run({ from: COLONIA, plans: sgPlan(), engineers: engineers({ 'Mel Brandon': S('Known') }), balance: 50_000_000 });
  assert.deepEqual(names(r), ['Mel Brandon']);
  assert.equal(r.from.region, 'Colonia');
  const it = stops(r)[0].unlock.steps.find((x) => x.kind === 'deblocage').items[0];
  assert.equal(it.type, 'primes');
  assert.equal(it.check.state, 'inconnu');
});

withRef('T6 : support vital G5 : Lori Jameson G1→G4 dans la Bulle, Etienne Dorn G5 en traversée facultative', () => {
  const r = run({ plans: [plan(6, [mod('std-ls', LS, 'LifeSupport_LightWeight', 5)])] });
  assert.deepEqual(r.parts.map((p) => [p.kind, p.required, p.stops.map((s) => idx.byId.get(s.engineer).name)]), [['region', true, ['Lori Jameson']], ['traversee', false, ['Etienne Dorn']]]);
  assert.deepEqual(task(r, '6/std-ls:grades').grades, [1, 2, 3, 4]);
  assert.deepEqual(task(r, '6/std-ls:traversee').grades, [5]);
  assert.ok(close(r.parts[1].stops[0].legAl, 22001.57));
  assert.ok(r.notes.some((n) => /^Personne dans la Bulle ne monte « .+ » \(.+\) au-delà du G4\. Pour le G5, il faut aller à Colonia \(.+ al\)\. N’y va que si tu le veux\.$/.test(n)), r.notes.join('\n'));
});

withRef('T6b : banc de cellules G4 + effet : Lori G1→G3 puis l’effet (sans R5b), Mel G4 seul en traversée', () => {
  const r = run({ plans: [plan(6, [mod('int-1', SCB, 'ShieldCellBank_Specialised', 4, 'special_shieldcell_gradual')])] });
  assert.deepEqual(r.parts.map((p) => [p.kind, p.stops.map((s) => idx.byId.get(s.engineer).name)]), [['region', ['Lori Jameson']], ['traversee', ['Mel Brandon']]]);
  const eff = task(r, '6/int-1:effet');
  assert.ok(eff);
  assert.equal(eff.rules.includes('R5b'), false);
  assert.equal(r.parts[1].stops[0].tasks.some((t) => t.kind === 'effet'), false, 'pas d’effet chez Mel');
  assert.deepEqual(task(r, '6/int-1:traversee').grades, [4]);
  assert.ok(close(r.parts[1].stops[0].legAl, 22014.02));
});

withRef('T7a : deux plans, escale partagée chez Palin, le Python vient avec le FSD du Krait monté dessus', () => {
  const plans = [plan(1, [mod('std-fsd', FSD, 'FSD_LongRange', 5, 'special_fsd_heavy')]), plan(2, [mod('std-t', T6, 'Engine_Dirty', 5)], { shipType: 'python', model: 'Python' })];
  const r = run({ plans, pins: FELICITY_FSD() });
  assert.deepEqual(names(r), ['Professor Palin']);
  const s = stops(r)[0];
  assert.deepEqual(s.plans, [1, 2]);
  assert.deepEqual(s.bring, [{ planId: 1, slots: ['std-fsd'] }, { planId: 2, slots: ['std-t'] }]);
  assert.deepEqual(s.vehicle, { planId: 2, shipId: 2, shipType: 'python' });
  // toLabel : l'emplacement d'arrivée en mots, pour l'interface
  assert.deepEqual(s.transfers, [{ planId: 1, slot: 'std-fsd', item: FSD, to: 'std-fsd', toLabel: `${ref.shipSlots('python').find((x) => x.key === 'std-fsd').label}, taille 5` }]);
  assert.deepEqual(s.warnings.map((w) => w.rule), ['R13']);
  assert.deepEqual(task(r, '1/std-fsd:effet').rules, ['R5b']);
  assert.ok(close(totalW(r), 295.42));
});

withRef('T7b : sans épingle, deux escales séparées (Palin pour le Python, Felicity pour le Krait)', () => {
  const plans = [plan(1, [mod('std-fsd', FSD, 'FSD_LongRange', 5, 'special_fsd_heavy')]), plan(2, [mod('std-t', T6, 'Engine_Dirty', 5)], { shipType: 'python' })];
  const r = run({ plans });
  assert.deepEqual(names(r), ['Professor Palin', 'Felicity Farseer']);
  assert.ok(stops(r).every((s) => s.plans.length === 1));
  assert.ok(close(totalW(r), 613.87));
});

withRef('T7c : les modules ne rentrent pas d’un vaisseau à l’autre : seconde visite chez Palin, comptée, et retenue', () => {
  const plans = [plan(1, [mod('std-fsd', FSD, 'FSD_LongRange', 5, 'special_fsd_heavy')], { shipType: 'test_a' }), plan(2, [mod('std-t', T6, 'Engine_Dirty', 5)], { shipType: 'test_b' })];
  // Depuis Sol, Colonel Bris Dekker (base dans Sol, Portée augmentée jusqu'au G3) pose l'effet du FSD sans seconde
  // visite : 0 al de trajet de plus, une escale (100 + 2 × √4 721 sl), moins cher que de revenir chez Palin
  const withBris = run({ ref: refWithTestShips(), plans, pins: FELICITY_FSD() });
  assert.deepEqual(names(withBris), ['Colonel Bris Dekker', 'Professor Palin']);
  assert.deepEqual(task(withBris, '1/std-fsd:effet').rules, ['R5b']);
  assert.ok(stops(withBris).every((s) => !s.revisits.length));
  assert.ok(close(totalW(withBris), 98.02 + 200 + 2 * Math.sqrt(4721) + 97.41), totalW(withBris));
  // Sans lui (le cas de la spécification) : une seule escale, et la seconde visite comptée
  const r = run({ ref: refWithTestShips(), plans, pins: FELICITY_FSD(), exclude: [id('Colonel Bris Dekker')] });
  assert.deepEqual(names(r), ['Professor Palin']);
  const s = stops(r)[0];
  assert.deepEqual(s.vehicle.shipType, 'test_b');
  assert.equal(s.revisits.length, 1);
  assert.deepEqual([s.revisits[0].planId, s.revisits[0].why, s.revisits[0].slots], [1, 'trop petit', ['std-fsd']]);
  assert.ok(close(totalW(r), 295.42 + 100 + 97.41 + 100), totalW(r));
  assert.ok(totalW(r) < 613.87);
});

withRef('T8 (R7) : un FSD qui porte Démarrage rapide G5 et un effet, visé Portée augmentée : avertissement avec les libellés', () => {
  const current = { module: FSD, blueprint: 'FSD_FastBoot', grade: 5, quality: 1, experimental: 'special_fsd_cooled', experimentalLabel: null, engineer: 'Felicity Farseer' };
  const r = run({ plans: [plan(6, [mod('std-fsd', FSD, 'FSD_LongRange', 5, null, current)])] });
  const w = task(r, '6/std-fsd:grades').warnings.find((x) => x.rule === 'R7');
  assert.equal(w.loses, 'grades et effet');
  assert.deepEqual([w.current.blueprint, w.current.grade, w.current.experimental, w.current.engineerName], ['FSD_FastBoot', 5, 'special_fsd_cooled', 'Felicity Farseer']);
  assert.equal(w.current.blueprintLabel, ref.blueprintLabel('FSD_FastBoot'));
  assert.ok(w.current.experimentalLabel);
});

withRef('T9 (R3f) : épingle de Lei sur le générateur de bouclier, cible un bouclier bi-tissé : pas à distance, signalé', () => {
  const r = run({ plans: [plan(6, [mod('std-s', BSG, 'ShieldGenerator_Thermic', 3)])], pins: new Map([[id('Lei Cheung'), pin('sg', 'ShieldGenerator_Thermic')]]) });
  assert.equal(r.remote.length, 0);
  assert.ok(task(r, '6/std-s:grades').warnings.some((w) => w.rule === 'R3f' && w.engineer === id('Lei Cheung')));
});

withRef('T10 : Palin écarté → Chloe pour les propulseurs ; Chloe aussi → impossible « écarté », jamais de traversée', () => {
  const r = run({ plans: fsdThrusters(), pins: FELICITY_FSD(), exclude: [id('Professor Palin')] });
  assert.ok(names(r).includes('Chloe Sedesi'));
  assert.deepEqual(r.options.exclude, [id('Professor Palin')]);
  const r2 = run({ plans: fsdThrusters(), pins: FELICITY_FSD(), exclude: [id('Professor Palin'), id('Chloe Sedesi')] });
  const imp = r2.impossible.find((x) => x.id === '6/std-t:grades');
  assert.equal(imp.reason, 'ecarte');
  assert.deepEqual(imp.grades, [4, 5]);
  assert.match(imp.text, /Remets-les, ou il faudra traverser\.$/);
  assert.equal(r2.parts.some((p) => p.kind === 'traversee'), false);
});

withRef('T11 : un ingénieur à préparer (connu) passe après les ingénieurs prêts, même plus proche', () => {
  const plans = [plan(6, [mod('std-fsd', FSD, 'FSD_LongRange', 5), mod('std-pd', 'int_powerdistributor_size7_class5', 'PowerDistributor_HighFrequency', 5)])];
  const r = run({ plans, engineers: engineers({ 'The Dweller': S('Known') }) });
  assert.deepEqual(r.parts.map((p) => p.kind), ['region', 'a-preparer']);
  assert.deepEqual(r.parts[1].stops.map((s) => s.engineer), [id('The Dweller')]);
  assert.ok(distanceLy([0, 0, 0], idx.byId.get(id('The Dweller')).coords) < r.parts[0].stops[0].legAl);
});

withRef('T12 : déterministe (entrées mélangées → même résultat)', () => {
  const a = run({ plans: fsdThrusters(), pins: FELICITY_FSD() });
  const shuffled = new Map([...engineers()].reverse());
  const p = fsdThrusters();
  p[0].modules.reverse();
  const b = run({ plans: p, pins: FELICITY_FSD(), engineers: shuffled });
  assert.deepEqual(b, a);
});

withRef('T13 : épingle partielle (Palin, Portée augmentée G3) : G1→G3 à distance, puis Elvira G4→G5 (R12b)', () => {
  const pins = new Map([[id('Professor Palin'), pin('fsd', 'FSD_LongRange', 'saisie', '2026-11-08T10:00:00.000Z')]]);
  const r = run({ plans: [plan(6, [mod('std-fsd', FSD, 'FSD_LongRange', 5)])], pins });
  assert.deepEqual(names(r), ['Elvira Martuuk']);
  const rem = r.remote[0];
  assert.deepEqual([rem.engineer, rem.split, rem.upTo, rem.rolls, rem.before, rem.continuesAt], [id('Professor Palin'), true, 3, 6, 1, 1]);
  assert.ok(rem.rules.includes('R12b'));
  const t = task(r, '6/std-fsd:grades');
  assert.deepEqual([t.grades, t.rolls], [[4, 5], 9]);
  assert.ok(close(totalW(r), 297.52));
  const fel = stops(r)[0].why.units[0].others.find((o) => o.engineer === id('Felicity Farseer'));
  assert.ok(close(297.52 + fel.addedW, 321.76));
});

withRef('T13b : Elvira au rang 3, Felicity écartée : pas de découpage, tout chez Elvira (ses petits grades servent à sa montée)', () => {
  const pins = new Map([[id('Professor Palin'), pin('fsd', 'FSD_LongRange', 'saisie', '2026-11-08T10:00:00.000Z')]]);
  const r = run({ plans: [plan(6, [mod('std-fsd', FSD, 'FSD_LongRange', 5)])], pins, engineers: engineers({ 'Elvira Martuuk': U(3) }), exclude: [id('Felicity Farseer')] });
  assert.equal(r.remote.length, 0);
  assert.deepEqual(task(r, '6/std-fsd:grades').grades, [1, 2, 3, 4, 5]);
  // Le découpage aurait coûté plus d'applications en plus : G4 et G5 seuls chez Elvira (rang 3, sans les petits grades
  // pour monter) et G1 à G3 à distance chez Palin (rang 5, sans rien en plus)
  const m = engineerModel(ref, engineers({ 'Elvira Martuuk': U(3) }));
  const all = m.extraRolls('Elvira Martuuk', [{ key: 'a', blueprint: 'FSD_LongRange', grades: [1, 2, 3, 4, 5], startUnits: 0 }]);
  const split = m.extraRolls('Elvira Martuuk', [{ key: 'a', blueprint: 'FSD_LongRange', grades: [4, 5], startUnits: 0 }]) + m.extraRolls('Professor Palin', [{ key: 'd', blueprint: 'FSD_LongRange', grades: [1, 2, 3], startUnits: 0 }], { fixedRank: true, rank: 5 });
  assert.equal(stops(r)[0].rank.extraRolls, all);
  assert.ok(split > all, `découpage : ${split} en plus, tout chez Elvira : ${all}`);
  // « Pourquoi lui ? » donne l'écart : l'épingle de Palin permettait G1 à G3 à distance, au prix de N applications de plus
  const u = stops(r)[0].why.units.find((x) => x.id === '6/std-fsd:grades');
  assert.deepEqual(u.pinSkipped, { engineer: id('Professor Palin'), from: 1, upTo: 3, extraRolls: split - all });
});

withRef('T14 : découverte depuis Sol : Selene Jean monte (référence), puis Didi Vatermann, à préparer', () => {
  const r = run({ plans: [plan(6, [mod('hp-9', SB, 'ShieldBooster_HeavyDuty', 5)])], engineers: engineers({ 'Didi Vatermann': null, 'Selene Jean': U(2) }) });
  assert.deepEqual(r.parts.map((p) => [p.kind, p.stops.map((s) => idx.byId.get(s.engineer).name)]), [['region', ['Selene Jean']], ['a-preparer', ['Didi Vatermann']]]);
  const ref3 = r.parts[0].stops[0].tasks[0];
  assert.deepEqual([ref3.kind, ref3.for, ref3.goal], ['reference', id('Didi Vatermann'), { rank: 3, progress: 50 }]);
  assert.ok(ref3.climb.rolls > 0);
  assert.notEqual(ref3.climb.grp, 'bh', 'jamais le blindage');
  const didi = r.parts[1].stops[0];
  assert.deepEqual(didi.unlock.steps.map((s) => s.kind), ['decouverte', 'invitation', 'deblocage']);
  assert.equal(didi.unlock.steps[0].parent.stop, 1, '« c’est l’escale 1 »');
  assert.equal(didi.unlock.steps[2].items[0].label, 'Brandy lavien');
  assert.ok(close(didi.cumulAl, 202.20));
  assert.ok(close(totalW(r), 202.20 + 200 + 222.29 + 8.25 + 25 * (ref3.climb.rolls + 10)), totalW(r));
  // T14b : Selene seulement connue → toutes deux à préparer, Selene d'abord
  const b = run({ plans: [plan(6, [mod('hp-9', SB, 'ShieldBooster_HeavyDuty', 5)])], engineers: engineers({ 'Didi Vatermann': null, 'Selene Jean': S('Known') }) });
  assert.deepEqual(b.parts.map((p) => [p.kind, p.stops.map((s) => idx.byId.get(s.engineer).name)]), [['a-preparer', ['Selene Jean', 'Didi Vatermann']]]);
  assert.equal(b.parts[0].stops[1].unlock.totalSteps, 6, 'Didi 4 + Selene 2');
});

withRef('T15 : départ Colonia, Mel à découvrir, Elvira (Bulle) trop basse : traversée nécessaire puis retour ; la note « Puisque tu iras… »', () => {
  const r = run({ from: COLONIA, plans: sgPlan(), engineers: engineers({ 'Mel Brandon': null, 'Elvira Martuuk': U(2) }) });
  assert.deepEqual(r.parts.map((p) => [p.kind, p.required, p.stops.map((s) => idx.byId.get(s.engineer).name)]), [['traversee', true, ['Elvira Martuuk']], ['retour', true, ['Mel Brandon']]]);
  assert.ok(close(r.parts[0].stops[0].legAl, 21979.0));
  assert.ok(close(r.parts[1].stops[0].legAl, 21992.19));
  assert.ok(r.notes.some((n) => /^Pour connaître Mel Brandon, il faut d’abord qu’Elvira Martuuk, dans la Bulle \(.+ al\), soit au rang 3 et à la moitié de la barre vers le rang 4\. Cette traversée est nécessaire pour la suite\.$/.test(n)), r.notes.join('\n'));
  assert.ok(r.notes.some((n) => n.startsWith('Puisque tu iras dans la Bulle pour la référence d’Elvira Martuuk : Lei Cheung y fait aussi « Renforcé » G5, à 230,5 al d’Elvira Martuuk.')), r.notes.join('\n'));
  assert.equal(r.parts[1].stops[0].unlock.steps.find((s) => s.kind === 'deblocage').items[0].check.state, 'inconnu');
  // T15b : Elvira au rang 4 → Mel connu au prochain chargement, sans traversée
  const b = run({ from: COLONIA, plans: sgPlan(), engineers: engineers({ 'Mel Brandon': null, 'Elvira Martuuk': U(4) }) });
  assert.deepEqual(b.parts.map((p) => [p.kind, p.stops.map((s) => idx.byId.get(s.engineer).name)]), [['a-preparer', ['Mel Brandon']]]);
  assert.match(b.parts[0].stops[0].unlock.steps[0].check.note, /prochain chargement/);
});

withRef('T16 : Lei Cheung t’a banni : Didi G1→G3 + effet, puis Mel G4→G5 en traversée, signalée ; Lei seulement écarté → impossible', () => {
  const r = run({ plans: sgPlan(), engineers: engineers({ 'Lei Cheung': S('Barred') }) });
  assert.deepEqual(r.parts.map((p) => [p.kind, p.stops.map((s) => idx.byId.get(s.engineer).name)]), [['region', ['Didi Vatermann']], ['traversee', ['Mel Brandon']]]);
  assert.ok(close(r.parts[0].cost.w, 111.03 + 100 + 8.25));
  assert.ok(task(r, '6/std-s:effet'));
  assert.ok(close(r.parts[1].stops[0].legAl, 21985.84));
  assert.ok(r.notes.some((n) => n.startsWith('Lei Cheung t’a banni : personne d’autre dans la Bulle ne monte « Renforcé »')), r.notes.join('\n'));
  const x = run({ plans: sgPlan(), exclude: [id('Lei Cheung')] });
  assert.equal(x.parts.some((p) => p.kind === 'traversee'), false);
  assert.equal(x.impossible.find((i) => i.id === '6/std-s:grades').reason, 'ecarte');
});

withRef('T17 : Lei « Acquainted » : à préparer, 2 étapes, invitation avec « si tu es déjà invité »', () => {
  const r = run({ plans: sgPlan(), engineers: engineers({ 'Lei Cheung': S('Acquainted') }) });
  assert.deepEqual(r.parts.map((p) => p.kind), ['a-preparer']);
  const s = stops(r)[0];
  assert.equal(s.unlock.totalSteps, 2);
  assert.equal(s.unlock.steps[0].acquainted, true);
});

withRef('T18 : options de « Pourquoi lui ? » : au plus 4, l’autre région toujours gardée, more juste', () => {
  for (const r of [run({ plans: sgPlan(), engineers: engineers({ 'Lei Cheung': S('Known') }) }), run({ plans: fsdThrusters(), pins: FELICITY_FSD() })]) {
    for (const s of stops(r)) {
      for (const u of s.why.units) {
        assert.ok(u.others.length <= 4);
        const withCost = u.others.filter((o) => o.addedW != null);
        // Ordre d'affichage : ta région avec un coût (par coût), puis autre région, grade max, écartés, bannis
        const rank = (o) => (o.addedW != null ? 0 : o.verdict === 'autre-region' ? 1 : o.verdict === 'grade-max' ? 2 : o.verdict === 'ecarte' ? 3 : 4);
        assert.deepEqual(u.others.map(rank), [...u.others.map(rank)].sort((a, b) => a - b));
        for (let i = 1; i < withCost.length; i++) assert.ok(withCost[i - 1].addedW <= withCost[i].addedW);
        if (u.more > 0) assert.equal(u.others.length, 4);
      }
    }
  }
  const r = run({ plans: fsdThrusters(), pins: FELICITY_FSD() });
  const fsdEffect = stops(r)[0].why.units.find((u) => u.id === '6/std-fsd:effet');
  // Bris Dekker (Sol), Felicity, Elvira, Chloe proposent ce plan dans la Bulle, Mel à Colonia : 5, 4 montrés
  assert.equal(fsdEffect.others.length + fsdEffect.more, 5);
  assert.ok(fsdEffect.others.some((o) => o.verdict === 'autre-region'));
});
