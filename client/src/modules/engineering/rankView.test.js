// Tests de mise en forme des rangs d'ingénieur, sur des résultats du calcul écrits à la main (même forme que
// l'API du serveur) : un FSD G5 chez un ingénieur au rang 3, un lance-missiles déjà en G3 qui demande une montée de
// rang sur un module neuf, un ingénieur pas encore débloqué.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applicationsReadText, carryNote, climbText, engineerProgressText, engineerRankSummary, engineerTitle, extraMaterialCells, extraMaterialsNote, extraRange, extraSummary, extraText, extraTexts, gradesText,
  lowerGradesNote, measureRows, moduleRankLines, moduleRollsTitle, orderDetail, orderText, progressText, rankRollsSub, rankedEngineers, rerollNote, sequenceBadge, sequenceText, sequenceTitle,
  shortDay, span, statusBadge, stepEngineerText, stepRanksNote,
} from './rankView.js';

const best = (name, rank) => ({ name, rank, unlocked: true, ok: true });
const step = (grade, rolls, rollsBase, rollsFavorable = rolls, extra = {}) => ({ grade, rolls, rollsBase, rollsFavorable, ranks: [3], byRank: [{ rank: 3, rolls }], status: { best: best('Felicity Farseer', 3) }, ...extra });
// Rang par rang, comme le calcul du serveur (FSD G5 de zéro au rang 3) : G3 3 au rang 3 puis 2 au rang 4, G4 4 puis 1
const byRank = (...pairs) => ({ byRank: pairs.map(([rank, rolls]) => ({ rank, rolls })), ranks: pairs.map(([rank]) => rank) });
const fsd = {
  slot: 'std-fsd',
  label: 'FSD · 5A',
  steps: [step(1, 3, 1), step(2, 4, 2), step(3, 5, 3, 5, byRank([3, 3], [4, 2])), step(4, 5, 4, 5, byRank([4, 4], [5, 1])), step(5, 5, 5, 5, byRank([5, 5]))],
  extras: [],
  engineerRanks: [{ name: 'Felicity Farseer', rank: 3, status: 'à vérifier' }],
};
const engineers = [{ name: 'Felicity Farseer', rank: 3, ups: [{ from: 3, to: 4, slot: 'std-fsd', grade: 3, extra: false }, { from: 4, to: 5, slot: 'std-fsd', grade: 4, extra: false }] }];

// Lance-missiles déjà en G3, visé G5, chez Liz Ryder (rang 3, 49 %) : ce que le calcul du serveur renvoie
const chain = { rank: 3, grades: [{ grade: 1, count: 3 }, { grade: 2, count: 4 }, { grade: 3, count: 1 }], count: 8, kind: 'module neuf', spare: 1 };
const lizStep = (grade, rolls, rollsBase, ranks) => ({ grade, rolls, rollsBase, rollsFavorable: rolls, ...byRank(...ranks), status: { best: best('Liz Ryder', 3) } });
const rack = {
  slot: 'hp-0',
  label: 'Lance-missiles',
  steps: [lizStep(4, 5, 4, [[4, 4], [5, 1]]), lizStep(5, 5, 5, [[5, 5]])],
  extras: [{ engineer: 'Liz Ryder', ...chain }],
  engineerRanks: [{ name: 'Liz Ryder', rank: 3, status: 'à vérifier' }],
};
const liz = {
  name: 'Liz Ryder',
  rank: 3,
  ups: [{ from: 3, to: 4, extra: true }, { from: 4, to: 5, slot: 'hp-0', grade: 4, extra: false }],
  extras: [{ ...chain, slot: 'hp-0', label: 'Lance-missiles' }],
  extraCount: 8,
  extraCountFavorable: 2,
  extraFavorableReroll: true,
};

test('détail d’un module : grades en plus, montées pendant les grades', () => {
  const [line] = moduleRankLines(fsd, engineers);
  assert.equal(line.name, 'Felicity Farseer');
  assert.equal(line.status, 'à vérifier');
  assert.equal(line.text, 'Chez Felicity Farseer (rang 3) : G1 en 3 applications au lieu de 1, G2 en 4 applications au lieu de 2, G3 en 5 applications au lieu de 3 (3 au rang 3, puis 2 au rang 4), G4 en 5 applications au lieu de 4 (4 au rang 4, puis 1 au rang 5)');
  assert.equal(line.range, null);
});

test('détail d’un module : la montée en plus vient d’abord, sur un module neuf (G1, G2 puis G3), avant les grades qu’elle rend possibles', () => {
  const [line] = moduleRankLines(rack, [liz]);
  assert.equal(line.text, 'Chez Liz Ryder (rang 3) : il faut d\'abord 8 applications en plus sur un autre module de ce type, neuf (3 G1, 4 G2 et 1 G3), pour passer au rang 4, puis G4 en 5 applications au lieu de 4 (4 au rang 4, puis 1 au rang 5)');
  assert.deepEqual(line.range, { text: '2 à 8 applications en plus pour monter son rang', reroll: true }, 'le bas suppose un grade refait : inconnu');
  // Au rang 1 : le même module de montée sert d'un rang à l'autre
  const spare = (rank, grades) => ({ engineer: 'Lei Cheung', rank, grades: grades.map(([grade, count]) => ({ grade, count })), count: grades.reduce((a, [, n]) => a + n, 0), kind: 'module neuf', spare: 1 });
  const x = [spare(1, [[1, 3]]), spare(2, [[1, 2], [2, 3]])];
  const low = { slot: 'x', steps: [{ ...step(3, 5, 3, 5, byRank([3, 5])), status: { best: best('Lei Cheung', 1) } }], extras: x, engineerRanks: [{ name: 'Lei Cheung', rank: 1 }] };
  assert.equal(moduleRankLines(low, [{ name: 'Lei Cheung', rank: 1, extras: x, ups: [] }])[0].text, 'Chez Lei Cheung (rang 1) : il faut d\'abord 3 applications en plus sur un autre module de ce type, neuf (3 G1), pour passer au rang 2, puis 5 applications en plus sur ce même module de montée (2 G1 et 3 G2), pour passer au rang 3, puis G3 en 5 applications au lieu de 3 (au rang 3)');
  const atFive = { slot: 'x', steps: [{ ...step(5, 5, 5), status: { best: best('Selene Jean', 5) } }], extras: [], engineerRanks: [{ name: 'Selene Jean', rank: 5, status: 'mesurée' }] };
  assert.equal(moduleRankLines(atFive, [])[0].text, 'Chez Selene Jean (rang 5) : aucune application en plus');
  // Deuxième module chez le même ingénieur : la montée est faite par le premier
  const second = { slot: 'hp-5', steps: [step(5, 5, 5)], extras: [], engineerRanks: [{ name: 'Felicity Farseer', rank: 3 }] };
  assert.equal(moduleRankLines(second, [{ name: 'Felicity Farseer', rank: 3, rankAfter: 5, ups: [] }])[0].text, 'Chez Felicity Farseer (rang 3) : aucune application en plus, à faire après sa montée au rang 5 (les autres modules du plan chez cet ingénieur la font)');
  // Grade commencé : « pour le finir », fourchette quand le scénario favorable donne moins
  const started = { slot: 'y', steps: [step(3, 4, 2, 3, { startQuality: 0.4 })], extras: [], engineerRanks: [{ name: 'Felicity Farseer', rank: 3 }] };
  assert.equal(moduleRankLines(started, [])[0].text, 'Chez Felicity Farseer (rang 3) : G3 en 3 à 4 applications pour le finir au lieu de 2');
});

test('détail d’un module : un grade mis en pause pendant qu’un autre module monte le rang dit à quel rang le reprendre', () => {
  // Ce que planNeeds renvoie (S5) : Liz Ryder rang 3, 49 % ; n°1 déjà en G3 visé G5, n°2 neuf visé G5. Le G3 du n°2 :
  // 1 application au rang 3 (montée au rang 4), puis, après les G4 du n°1 (montée au rang 5), 3 au rang 5 : 4 en tout.
  // Fini au rang 4, il en faudrait 5 : la ligne ne doit pas laisser croire « rang 4 pendant ce grade »
  const L1 = 'Point d’emport 1 · Lance-missiles';
  const L2 = 'Point d’emport 2 · Lance-missiles';
  const at = (grade, rolls, rollsBase, ranks) => ({ grade, rolls, rollsBase, rollsFavorable: rolls, ...byRank(...ranks), status: { best: best('Liz Ryder', 3) } });
  const mr1 = { slot: 'mr1', label: L1, steps: [at(4, 5, 4, [[4, 4], [5, 1]]), at(5, 5, 5, [[5, 5]])], extras: [], engineerRanks: [{ name: 'Liz Ryder', rank: 3, status: 'à vérifier' }] };
  const mr2 = { slot: 'mr2', label: L2, steps: [at(1, 3, 1, [[3, 3]]), at(2, 4, 2, [[3, 4]]), at(3, 4, 3, [[3, 1], [5, 3]]), at(4, 4, 4, [[5, 4]]), at(5, 5, 5, [[5, 5]])], extras: [], engineerRanks: [{ name: 'Liz Ryder', rank: 3, status: 'à vérifier' }] };
  const o = (slot, label, grade, rank, count) => ({ slot, label, grade, rank, count });
  const lizS5 = {
    name: 'Liz Ryder',
    rank: 3,
    rankAfter: 5,
    extras: [],
    ups: [{ from: 3, to: 4, extra: false, slot: 'mr2', label: L2, grade: 3 }, { from: 4, to: 5, extra: false, slot: 'mr1', label: L1, grade: 4 }],
    order: [o('mr2', L2, 1, 3, 3), o('mr2', L2, 2, 3, 4), o('mr2', L2, 3, 3, 1), { up: { from: 3, to: 4 } }, o('mr1', L1, 4, 4, 4), { up: { from: 4, to: 5 } }, o('mr1', L1, 4, 5, 1), o('mr1', L1, 5, 5, 5), o('mr2', L2, 3, 5, 3), o('mr2', L2, 4, 5, 4), o('mr2', L2, 5, 5, 5)],
  };
  const [two] = moduleRankLines(mr2, [lizS5]);
  assert.equal(two.text, `Chez Liz Ryder (rang 3) : G1 en 3 applications au lieu de 1, G2 en 4 applications au lieu de 2, G3 en 4 applications au lieu de 3 (1 au rang 3, puis 3 au rang 5, à reprendre après la montée au rang 5 faite avec « ${L1} »)`);
  assert.doesNotMatch(two.text, /pendant ce grade/);
  const [one] = moduleRankLines(mr1, [lizS5]);
  assert.equal(one.text, `Chez Liz Ryder (rang 3) : G4 en 5 applications au lieu de 4 (4 au rang 4, après la montée faite avec « ${L2} », puis 1 au rang 5)`);
  // L'ordre conseillé dit la même chose
  assert.equal(orderText(lizS5.order), `${L2} : G1 ×3, G2 ×4, G3 ×1 → rang 4 ; ${L1} : G4 ×4 → rang 5 → G4 ×1, G5 ×5 ; ${L2} : G3 ×3, G4 ×4, G5 ×5`);
  // Grade fait tout entier à un rang plus haut, après la montée d'un autre module : « (au rang 4, après la montée… ») ;
  // fourchette entre scénarios : le détail rang par rang est celui du prudent
  assert.equal(stepRanksNote({ grade: 3, rolls: 4, rollsFavorable: 4, byRank: [{ rank: 4, rolls: 4 }] }, { startRank: 3, ups: lizS5.ups, slot: 'mr1', names: new Map([['mr2', L2]]) }), ` (au rang 4, après la montée faite avec « ${L2} »)`);
  assert.equal(stepRanksNote({ grade: 3, rolls: 5, rollsFavorable: 4, byRank: [{ rank: 3, rolls: 3 }, { rank: 4, rolls: 2 }] }, { startRank: 3, ups: [{ from: 3, to: 4, slot: 'a', grade: 3 }], slot: 'a' }), ' (en prudent : 3 au rang 3, puis 2 au rang 4)');
  // Montée faite par les applications en plus d'un autre module : dite aussi
  assert.equal(stepRanksNote({ grade: 3, rolls: 4, rollsFavorable: 4, byRank: [{ rank: 3, rolls: 1 }, { rank: 5, rolls: 3 }] }, { startRank: 3, ups: [{ from: 3, to: 4, slot: 'a', grade: 3 }, { from: 4, to: 5, extra: true }], slot: 'a' }), ' (1 au rang 3, puis 3 au rang 5, à reprendre après la montée au rang 5 faite avec les applications en plus)');
  // Tout au rang de départ : rien à dire
  assert.equal(stepRanksNote({ grade: 2, rolls: 4, rollsFavorable: 4, byRank: [{ rank: 3, rolls: 4 }] }, { startRank: 3 }), '');
});

test('matériaux en plus : le cas favorable qui demande plus d’un matériau est donné à part, pas dans une fourchette', () => {
  // Lance-missiles déjà en G3, visé G5, Liz Ryder rang 3, 49 % (planNeeds) : niobium 1 en prudent, 2 en favorable
  const niobium = { key: 'niobium', extra: 1, extraFavorable: 2, favorableMore: 1, missing: 1, missingFavorable: 2 };
  assert.deepEqual(extraMaterialCells(niobium), { extra: '1', favorable: 'cas favorable : 2', missingFavorable: '2 par le cas favorable' });
  // Débris mécaniques : 8 en prudent, 2 en favorable : la fourchette habituelle
  assert.deepEqual(extraMaterialCells({ key: 'mechanicalscrap', extra: 8, extraFavorable: 2, favorableMore: 0, missing: 8, missingFavorable: 2 }), { extra: '2 à 8', favorable: null, missingFavorable: null });
  // À 70 % : niobium du seul cas favorable, déjà possédé : rien ne manque, mais le chiffre est là
  assert.deepEqual(extraMaterialCells({ key: 'niobium', extra: 0, extraFavorable: 1, favorableMore: 1, missing: 0, missingFavorable: 0 }), { extra: '0', favorable: 'cas favorable : 1', missingFavorable: null });
  assert.equal(extraMaterialsNote([{ extra: 8, extraFavorable: 2 }]), 'Déjà comptés dans « Matériaux nécessaires ». Calcul prudent ; la fourchette va jusqu’au cas favorable.');
  assert.equal(extraMaterialsNote([niobium], true), 'Déjà comptés dans « Matériaux nécessaires ». Calcul prudent ; la fourchette va jusqu’au cas favorable. Le cas favorable (il refait un grade déjà fini, ce qui reste à vérifier en jeu) demande plus de ce matériau que le prudent : c’est écrit à part (« cas favorable »), et ni « Nécessaire » ni « Manquant » ne le comptent. Si tu prends ce chemin, prévois-le.');
  assert.match(extraMaterialsNote([niobium, { ...niobium, key: 'x' }], false), /sa montée ne prend pas les mêmes grades\) demande plus de certains matériaux/);
});

test('« Ce que tes journaux montrent » : séquence en cours « en cours », jamais « conforme » ; progression contredite par la table', () => {
  assert.deepEqual(sequenceBadge({ ok: true, end: { kind: 'en cours' } }), { label: 'en cours', className: 'pill pill-info' });
  assert.deepEqual(sequenceBadge({ ok: true, end: { kind: 'montée', toRank: 4 } }), { label: 'conforme', className: 'pill pill-good' });
  assert.deepEqual(sequenceBadge({ ok: false, end: { kind: 'en cours' } }), { label: 'écart', className: 'pill pill-bad' });
  // Tiana Fortune relevée au rang 3 à 0 %, 5 G3 à l'atelier sans montée : plus « ≈ 99 % »
  const over = progressText({ min: 0, max: 99.99, known: 'contredit', expectedMin: 133.266, basis: { kind: 'relevé' } }, 3);
  assert.equal(over, 'progression inconnue : d’après la table, la montée aurait déjà dû venir (au moins 133 % estimés depuis le dernier chargement de la partie), elle n’est pas écrite dans le journal ; comptée 0 % en prudent, recharge la partie pour la relever');
  assert.doesNotMatch(over, /99/);
  assert.equal(progressText({ min: 99.9, max: 99.99, known: 'estimé', due: true, basis: { kind: 'relevé' } }, 3), 'la table prévoit la montée à la dernière application (progression estimée depuis le dernier chargement de la partie)');
});

test('détail d’un module : ingénieur pas encore débloqué, compté comme après son déblocage', () => {
  const locked = (grade, rolls, rollsBase, ranks) => ({ grade, rolls, rollsBase, rollsFavorable: rolls, ...byRank(...ranks), status: { best: null, afterUnlock: { name: 'Marsha Hicks', rank: 1 }, list: [] } });
  const m = { slot: 'hp-1', steps: [locked(1, 5, 1, [[1, 3], [2, 2]]), locked(2, 5, 2, [[2, 3], [3, 2]])], extras: [], engineerRanks: [{ name: 'Marsha Hicks', rank: null, locked: true, status: 'à vérifier' }] };
  const [line] = moduleRankLines(m, [{ name: 'Marsha Hicks', locked: true, startRank: 1, ups: [] }]);
  assert.equal(line.locked, true);
  assert.equal(line.text, 'Chez Marsha Hicks (pas encore débloqué : compté au rang 1, comme après un déblocage) : G1 en 5 applications au lieu de 1 (3 au rang 1, puis 2 au rang 2), G2 en 5 applications au lieu de 2 (3 au rang 2, puis 2 au rang 3)');
  assert.equal(engineerTitle({ name: 'Marsha Hicks', locked: true }), 'Marsha Hicks (pas encore débloqué)');
  assert.equal(engineerTitle({ name: 'Juri Ishmaak', rank: null }), 'Juri Ishmaak (rang inconnu)');
  assert.equal(engineerTitle({ name: 'Liz Ryder', rank: 3 }), 'Liz Ryder (rang 3)');
  assert.equal(engineerProgressText({ locked: true, startRank: 1 }), 'compté comme après son déblocage : rang 1, 0 %');
});

test('ingénieur d’une étape du plan : « rang inconnu », jamais « (rang ) » ; pas encore débloqué, avec ou sans autre ingénieur débloqué', () => {
  // Ce que planNeeds renvoie pour un ingénieur { progress: 'Unlocked', rank: null } : il peut être choisi
  const juri = stepEngineerText({ best: { name: 'Juri Ishmaak', unlocked: true, rank: null, ok: true }, list: [{ name: 'Juri Ishmaak', unlocked: true, rank: null, ok: true }] });
  assert.deepEqual(juri, { tone: 'good', text: 'Juri Ishmaak (rang inconnu)' });
  assert.doesNotMatch(juri.text, /\(rang \)|null|undefined/);
  assert.deepEqual(stepEngineerText({ best: best('Liz Ryder', 3), list: [] }), { tone: 'good', text: 'Liz Ryder (rang 3)' });
  // Personne de débloqué : le grade est compté chez Marsha Hicks après son déblocage
  const marsha = { name: 'Marsha Hicks', unlocked: false, rank: null, ok: false };
  assert.deepEqual(stepEngineerText({ best: null, list: [marsha], afterUnlock: { name: 'Marsha Hicks', rank: 1 } }), {
    tone: 'bad',
    text: 'Aucun ingénieur débloqué (Marsha Hicks : non débloqué) · compté chez Marsha Hicks après son déblocage (rang 1, 0 %)',
  });
  assert.equal(stepEngineerText({ best: null, list: [{ name: 'Liz Ryder', unlocked: true, rank: null }] }).text, 'Aucun ingénieur débloqué (Liz Ryder rang inconnu)');
  assert.deepEqual(stepEngineerText({ best: null, list: [] }), { tone: 'bad', text: 'Aucun ingénieur débloqué' });
  // Liz Ryder (rang 5) propose G1 à G3, Ram Tah (pas encore débloqué) G1 à G5 : planNeeds compte tout chez Ram Tah
  // (25 applications, moins de matériaux que Liz puis une montée de Ram Tah depuis le rang 1) ; « aucun ingénieur
  // débloqué » serait faux
  const ram = stepEngineerText({ best: null, list: [{ name: 'Liz Ryder', unlocked: true, rank: 5, ok: true }, { name: 'Ram Tah', unlocked: false, rank: null, ok: false }], afterUnlock: { name: 'Ram Tah', rank: 1 } });
  assert.deepEqual(ram, { tone: 'warn', text: 'Ram Tah (pas encore débloqué) : compté après son déblocage (rang 1, 0 %), retenu pour le coût total en matériaux, montée de rang comprise, plutôt que Liz Ryder (rang 5)' });
});

test('applications en plus : textes, pluriel, fourchette', () => {
  assert.equal(gradesText(chain.grades), '3 G1, 4 G2 et 1 G3');
  assert.equal(gradesText([{ grade: 3, count: 1 }]), '1 G3');
  assert.equal(extraText({ rank: 3, count: 1, kind: 'module neuf', grades: [{ grade: 3, count: 1 }] }, true), '1 application en plus sur ce même module de montée (1 G3), pour passer au rang 4');
  assert.equal(extraText({ rank: 3, count: 2, kind: 'grade refait', grades: [{ grade: 3, count: 2 }] }), '2 applications en plus en refaisant le G3, pour passer au rang 4');
  assert.deepEqual(extraTexts([chain, { ...chain, rank: 4, count: 5, grades: [{ grade: 3, count: 1 }, { grade: 4, count: 4 }] }]), [
    '8 applications en plus sur un autre module de ce type, neuf (3 G1, 4 G2 et 1 G3), pour passer au rang 4',
    '5 applications en plus sur ce même module de montée (1 G3 et 4 G4), pour passer au rang 5',
  ]);
  assert.equal(extraRange({ extraCount: 0 }), null);
  assert.deepEqual(extraRange({ extraCount: 1, extraCountFavorable: 1, extraFavorableReroll: false }), { text: '1 application en plus pour monter son rang', reroll: false });
});

test('pluriel partout où un nombre d’applications s’affiche : tuile du plan, infobulle d’un module, « Ce que tes journaux montrent »', () => {
  // Progression de rang à 80 % : 1 application en plus (plan, tuile « Applications restantes »)
  assert.equal(rankRollsSub({ rolls: 1, rollsFavorable: 1 }), 'dont 1 due aux rangs des ingénieurs');
  assert.equal(rankRollsSub({ rolls: 4, rollsFavorable: 3 }), 'dont 3 à 4 dues aux rangs des ingénieurs');
  assert.equal(rankRollsSub({ rolls: 0 }), 'rangs des ingénieurs compris');
  assert.equal(rankRollsSub(null), 'rangs des ingénieurs compris');
  // Infobulle du nombre d'applications d'un module
  const locked = { rolls: 25, rollsBase: 15, rollsFavorable: 25, estimate: true, steps: [{ grade: 1, status: { afterUnlock: { name: 'Ram Tah', rank: 1 } } }] };
  assert.equal(moduleRollsTitle(locked), 'Ingénieur pas encore débloqué : compté comme après son déblocage (rang 1, 0 %) · 25 applications (15 au rang 5) · ≈ : selon une règle à vérifier ou inconnue (voir « Rangs des ingénieurs »)');
  assert.equal(moduleRollsTitle({ rolls: 2, rollsBase: 1, rollsFavorable: 2, steps: [] }), '2 applications (1 au rang 5)', 'G1 au rang 4');
  assert.equal(moduleRollsTitle({ rolls: 15, rollsBase: 15, rollsFavorable: 15, steps: [] }), '');
  // Applications lues dans le journal
  assert.equal(applicationsReadText({ applications: 1, period: { first: '2026-11-09', last: '2026-11-09' } }), '1 application lue (le 9 nov.)');
  assert.equal(applicationsReadText({ applications: 808, period: { first: '2026-10-24', last: '2026-11-05' } }), '808 applications lues (du 24 oct. au 5 nov.)');
  assert.equal(applicationsReadText({ applications: 0 }), null);
  // Table : « 1 application » si une seule suffit
  assert.equal(measureRows({ rules: { table: [{ rank: 1, grade: 1, finish: { value: 5 }, climb: { min: 1, max: 1, gainMin: 100, gainMax: 100 } }] } })[0].climbText, '1 application (100 % du rang chacune)');
});

test('ingénieur au Dashboard comme au plan : titre, badge, progression, une ligne par montée, fourchette (rang inconnu compris)', () => {
  // Liz Ryder telle que le Dashboard la reçoit (API : rang 3, 49 %, lance-missiles déjà en G3 visé G5)
  const r = engineerRankSummary({ ...liz, status: 'à vérifier', progress: { min: 49, max: 49.99, known: 'relevé' }, rankAfter: 5 });
  assert.deepEqual(r, {
    title: 'Liz Ryder (rang 3)',
    status: 'à vérifier',
    why: null,
    progress: 'progression 49 %',
    after: 'après le plan : rang 5',
    extras: [{ text: '8 applications en plus sur un autre module de ce type, neuf (3 G1, 4 G2 et 1 G3), pour passer au rang 4', label: 'Lance-missiles' }],
    range: { text: '2 à 8 applications en plus pour monter son rang', reroll: true },
  });
  // Progression à 80 % : une seule application en plus, au singulier
  const one = engineerRankSummary({ name: 'Felicity Farseer', rank: 3, status: 'à vérifier', progress: { min: 80, max: 80.99, known: 'relevé' }, extras: [{ rank: 3, count: 1, kind: 'module neuf', grades: [{ grade: 3, count: 1 }], spare: 1, label: 'FSD' }], extraCount: 1, extraCountFavorable: 1 });
  assert.equal(one.extras[0].text, '1 application en plus sur un autre module de ce type, neuf (1 G3), pour passer au rang 4');
  assert.equal(one.range.text, '1 application en plus pour monter son rang');
  // Rang inconnu : listé, « rang inconnu », badge « inconnue », fourchette de 0 (rang 5) à 15 (rang 1)
  const unknown = engineerRankSummary({ name: 'Liz Ryder', rank: null, rankKnown: false, status: 'inconnue', progress: { known: 'inconnu' }, extras: [{ rank: 1, count: 3, kind: 'module neuf', grades: [{ grade: 1, count: 3 }], spare: 1 }], extraCount: 14, extraCountFavorable: 0, rankAfter: 5 });
  assert.deepEqual([unknown.title, unknown.status, unknown.progress, unknown.after, unknown.range.text], ['Liz Ryder (rang inconnu)', 'inconnue', 'rang inconnu', 'après le plan : rang 5', '0 à 14 applications en plus pour monter son rang']);
  assert.equal(unknown.extras[0].label, null);
  // Pas encore débloqué : départ après déblocage
  const locked = engineerRankSummary({ name: 'Ram Tah', locked: true, startRank: 1, status: 'à vérifier', extras: [], extraCount: 0, rankAfter: 3 });
  assert.deepEqual([locked.title, locked.progress, locked.after, locked.range], ['Ram Tah (pas encore débloqué)', 'compté comme après son déblocage : rang 1, 0 %', 'après le plan : rang 3', null]);
});

test('progression du rang, badges, fourchettes, dates', () => {
  assert.equal(progressText({ min: 24, max: 24.99, known: 'relevé' }, 3), 'progression 24 %');
  assert.equal(progressText({ min: 30.7, max: 34.2, known: 'estimé', basis: { kind: 'relevé' } }, 3), 'progression ≈ 30 à 34 % (estimée depuis le dernier chargement de la partie)');
  // Après une montée sans nouveau relevé : la base est la montée, pas le dernier chargement
  assert.equal(progressText({ min: 17, max: 30.2, known: 'estimé', basis: { kind: 'montée', rank: 3, from: 2 } }, 3), 'progression ≈ 17 à 30 % (estimée depuis la montée au rang 3, report du surplus non compté en prudent)');
  assert.equal(progressText({ min: 0, max: 99.99, known: 'inconnu' }, 2), 'progression inconnue (comptée 0 % en prudent)');
  assert.equal(progressText(null, 5), 'rang maximal');
  assert.equal(progressText(null, null), 'rang inconnu');
  assert.equal(statusBadge('mesurée').className, 'pill pill-good');
  assert.doesNotMatch(statusBadge('mesurée').help, /tes journaux/, 'la table vient des journaux de référence, pas de ceux de chaque membre');
  assert.equal(statusBadge('mesurée', 'journaux de référence, 24 oct.–5 nov. 2026 (808 applications)').help, 'Mesurée : journaux de référence, 24 oct.–5 nov. 2026 (808 applications).');
  assert.equal(statusBadge('à vérifier').label, 'à vérifier');
  assert.equal(statusBadge('inconnue').className, 'pill pill-bad');
  // « à vérifier » sans motif : déduite avec une hypothèse (progression de rang, report) ; avec le motif de la table
  // (rang 4, G1 : mesurée 2 fois), l'infobulle le dit, avec la source, et ne parle plus d'hypothèse
  assert.equal(statusBadge('à vérifier').help, 'Déduite des mesures avec une hypothèse : à confirmer en jeu.');
  const few = statusBadge('à vérifier', 'journaux de référence, 24 oct.–5 nov. 2026 (808 applications, jeu 4.4.2.1)', 'mesurée 2 fois seulement (il en faut 3 pour la dire mesurée), sans hypothèse');
  assert.equal(few.help, 'À vérifier. Mesurée 2 fois seulement (il en faut 3 pour la dire mesurée), sans hypothèse. Source : journaux de référence, 24 oct.–5 nov. 2026 (808 applications, jeu 4.4.2.1). À confirmer en jeu.');
  assert.doesNotMatch(few.help, /Déduite/);
  // Badge d'un ingénieur au plan : les motifs du calcul (statusWhy), une phrase chacun
  assert.equal(statusBadge('à vérifier', null, ['finir le G1 au rang 4 : mesurée 2 fois seulement (il en faut 3 pour la dire mesurée), sans hypothèse', 'progression de rang : déduite']).help,
    'À vérifier. Finir le G1 au rang 4 : mesurée 2 fois seulement (il en faut 3 pour la dire mesurée), sans hypothèse. Progression de rang : déduite. À confirmer en jeu.');
  assert.equal(statusBadge('à vérifier', null, []).help, 'Déduite des mesures avec une hypothèse : à confirmer en jeu.', 'aucun motif : le texte par défaut');
  assert.equal(statusBadge('inconnue', null, 'rang non lu dans le journal').help, 'Inconnue. Rang non lu dans le journal. Le calcul prend le cas prudent.');
  assert.equal(statusBadge('mesurée', 'journaux de référence', 'peu importe').help, 'Mesurée : journaux de référence.');
  // « publiée » (table de l'itinéraire) : écrite par une source publique, pas encore vue dans les journaux de référence
  assert.deepEqual(statusBadge('publiée', 'Wiki Fandom, page « Remote Workshop »'), { label: 'publiée', className: 'pill pill-info', help: 'Publiée : Wiki Fandom, page « Remote Workshop ». Pas encore vue dans les journaux de référence.' });
  assert.equal(statusBadge('publiée').help, 'Publiée : source publique. Pas encore vue dans les journaux de référence.');
  assert.doesNotMatch(statusBadge('publiée').help, /tes journaux/);
  assert.equal(span(3, 4), '3 à 4');
  assert.equal(span(4, 4), '4');
  assert.equal(span(5, 4), '4 à 5');
  assert.equal(shortDay('2026-11-01T22:38:22Z'), '1er nov.');
  assert.equal(shortDay('2026-10-28'), '28 oct.');
  assert.equal(shortDay(null), '—');
});

test('ordre conseillé et résumé des applications en plus', () => {
  const order = [
    { slot: 'std-fsd', label: 'FSD', grade: 1, rank: 3, count: 3 },
    { slot: 'std-fsd', label: 'FSD', grade: 2, rank: 3, count: 4 },
    { slot: 'std-fsd', label: 'FSD', grade: 3, rank: 3, count: 3 },
    { up: { from: 3, to: 4 } },
    { slot: 'std-fsd', label: 'FSD', grade: 3, rank: 4, count: 2 },
    { extra: { rank: 4, grades: [{ grade: 1, count: 2 }, { grade: 4, count: 2 }], count: 4, kind: 'module neuf', spare: 1, slot: 'std-fsd' } },
    { up: { from: 4, to: 5 } },
    { slot: 'hp-1', label: 'Laser', grade: 1, rank: 5, count: 1 },
  ];
  assert.equal(orderText(order), 'FSD : G1 ×3, G2 ×4, G3 ×3 → rang 4 → G3 ×2 ; 2 G1 et 2 G4 en plus pour la montée, sur un autre module de ce type, neuf (modification de « FSD ») → rang 5 ; Laser : G1 ×1');
  // Deux modules du même nom : numérotés
  const twins = [
    { slot: 'hp-4', label: 'Lance-missiles', grade: 3, rank: 3, count: 1 },
    { up: { from: 3, to: 4 } },
    { slot: 'hp-4', label: 'Lance-missiles', grade: 3, rank: 4, count: 4 },
    { slot: 'hp-5', label: 'Lance-missiles', grade: 1, rank: 5, count: 1 },
  ];
  assert.equal(orderText(twins), 'Lance-missiles n°1 : G3 ×1 → rang 4 → G3 ×4 ; Lance-missiles n°2 : G1 ×1');
  assert.equal(extraSummary({ rolls: 7, rollsFavorable: 7, units: 15, unitsFavorable: 15 }), '7 applications et 15 matériaux en plus dus aux rangs');
  assert.equal(extraSummary({ rolls: 0 }), null);
  assert.deepEqual(rankedEngineers({ engineers: [{ name: 'A', rank: 5 }, { name: 'B', rank: 3 }, { name: 'C', rank: null }, { name: 'D', rank: null, locked: true }] }).map((e) => e.name), ['B', 'C', 'D']);
});

test('« Ce que tes journaux montrent » : table et mesures côte à côte, séquences', () => {
  const report = {
    rules: {
      table: [
        { rank: 3, grade: 3, finish: { value: 5, status: 'mesurée', observations: 11 }, climb: { min: 3, max: 4, gainMin: 26.6532, gainMax: 39.2257, status: 'à vérifier' } },
        { rank: 4, grade: 1, finish: { value: 2, status: 'à vérifier', observations: 2 }, climb: { min: 114, max: null, gainMin: 0, gainMax: 0.8795, status: 'inconnue' } },
        { rank: 4, grade: 2, finish: { value: 3, status: 'mesurée', observations: 5 }, climb: { min: 31, max: null, gainMin: 0, gainMax: 3.3198, status: 'inconnue' } },
        { rank: 5, grade: 5, finish: { value: 5, status: 'mesurée', observations: 192 }, climb: null },
      ],
    },
    measures: [
      { rank: 3, grade: 3, rolls: 5, informative: 11, applications: 11, contradictions: 0 },
      { rank: 4, grade: 2, rolls: null, informative: 0, applications: 1, contradictions: 1, faster: 1 },
      { rank: 5, grade: 5, rolls: 4, informative: 1, applications: 1, contradictions: 1 },
    ],
  };
  const rows = measureRows(report);
  assert.deepEqual(rows.map((r) => [r.key, r.maxGrade, r.measuredText, r.agrees]), [
    ['3|3', true, '5 (11 mesures)', true],
    ['4|1', false, 'pas encore vu', null],
    ['4|2', false, 'aucune mesure nette (1 application) · 1 grade fini plus vite que la table', false],
    ['5|5', true, '4 (1 mesure)', false],
  ]);
  // Bornes arrondies vers l'extérieur (26,65 → 26, 39,23 → 40) : jamais plus serrées que la table
  assert.equal(rows[0].climbText, '3 à 4 applications (26 à 40 % du rang chacune)');
  assert.equal(measureRows({ rules: { table: [{ rank: 3, grade: 1, finish: { value: 3 }, climb: { min: 41, max: 50, gainMin: 2, gainMax: 2.4517 } }] } })[0].climbText, '41 à 50 applications (2,0 à 2,5 % du rang chacune)');
  // Gain par application sans borne basse : ce qui manque, c'est le maximum d'applications (pas « le minimum »)
  assert.equal(rows[1].climbText, 'au moins 114 applications, sans maximum connu : chacune fait au plus 0,9 % du rang, et rien ne dit combien au moins (le calcul prudent prend le pire cas que permettent les montées lues dans les journaux de référence)');
  assert.doesNotMatch(rows[1].climbText, /minimum/);
  assert.equal(rows[3].climbText, '—');
  const seq = { engineer: 'Lei Cheung', rank: 2, start: { kind: 'montée' }, end: { kind: 'montée', toRank: 3 }, grades: [{ grade: 1, atelier: 12, distance: 0, inconnu: 0, experimental: 0 }] };
  assert.equal(sequenceTitle(seq), 'Lei Cheung, rang 2 : montée → rang 3');
  assert.equal(sequenceText(seq), '12 × G1');
  const remote = { engineer: 'Broo Tarquin', rank: 3, start: { kind: 'relevé', progress: 24 }, end: { kind: 'montée', toRank: 4 }, grades: [{ grade: 3, atelier: 0, distance: 5, inconnu: 0, experimental: 0 }, { grade: 2, atelier: 5, distance: 0, inconnu: 0, experimental: 0 }] };
  assert.equal(sequenceTitle(remote), 'Broo Tarquin, rang 3 : relevé 24 % → rang 4');
  assert.equal(sequenceText(remote), '5 × G3 (grade max) : 5 à distance, 5 × G2');
  const detail = { order: [{ grade: 3, place: 'distance', step: 0.2 }, { grade: 1, place: 'atelier', step: 0.3333 }, { grade: 5, place: 'atelier', experimental: true, step: null }, { grade: 2, place: 'inconnu', step: null }] };
  assert.equal(orderDetail(detail), 'G3 +20 % (à distance) · G1 +33 % · G5 effet expérimental · G2 (lieu inconnu)');
});

test('« Ce que tes journaux montrent » : « les grades en dessous comptent » (mesurée) séparé de « combien » (déduit, à vérifier ; non chiffré au rang 4)', () => {
  // Fourchettes de progression de la table des règles (rankRules.js, 8 nov. 2026), rangs 2 à 4
  const c = (rank, grade, gainMin, gainMax, status = 'à vérifier', why = undefined) => ({ rank, grade, finish: { value: grade + 5 - rank }, climb: { gainMin, gainMax, status, ...(why ? { why } : {}) } });
  const why = 'au rang 4, les G4 suffisent presque à expliquer chaque montée : rien ne dit combien un G1, un G2 ou un G3 y fait monter le rang';
  const rules = {
    general: { LOWER_GRADES_COUNT: { value: true, status: 'mesurée', source: 'journaux de référence ; Lei Cheung, 1er nov.' } },
    table: [
      c(1, 1, 33.3333, 49.9976),
      c(2, 1, 7.6923, 8.6615), c(2, 2, 28.9276, 36.063),
      c(3, 1, 2, 2.4517), c(3, 2, 8.4444, 9.2673), c(3, 3, 26.6532, 39.2257),
      c(4, 1, 0, 0.8795, 'inconnue', why), c(4, 2, 0, 3.3198, 'inconnue', why), c(4, 3, 0, 9.5825, 'inconnue', why), c(4, 4, 28.9069, 50),
      { rank: 5, grade: 5, finish: { value: 5 }, climb: null },
    ],
  };
  const note = lowerGradesNote(rules);
  // Ce que la mesure dit seulement : elles comptent (badge « mesurée ») ; aucun chiffre sous ce badge
  assert.deepEqual(note.counts, { text: 'Les applications sous le grade maximal du rang comptent aussi', status: 'mesurée', source: 'journaux de référence ; Lei Cheung, 1er nov.' });
  assert.doesNotMatch(note.counts.text, /\d|fois/);
  // Combien : rapport tiré des fourchettes (26,65 / 9,27 = 2,88 au plus bas ; 36,06 / 7,69 = 4,69 au plus haut)
  assert.equal(note.ratio.text, 'Combien : aux rangs 2 et 3, de 2,8 à 4,7 fois moins par grade en dessous, d\'après les fourchettes de la table');
  assert.equal(note.ratio.status, 'à vérifier');
  // Rang 4 : non chiffré, inconnue, avec le motif de la table
  assert.equal(note.unbounded.text, 'au rang 4, la part des grades en dessous n\'est pas chiffrée (le calcul prudent prend le pire cas que permettent les montées lues dans les journaux de référence)');
  assert.deepEqual([note.unbounded.status, note.unbounded.help], ['inconnue', why]);
  // Report du surplus : tout le surplus passe, mais le rang suivant demande plus ; ce que 10 % y valent au plus
  // (CARRY_RATIO de la table : 0,2599, 0,3183, 0,3596), jamais « 26 % du surplus » qui se lirait « 74 % perdus »
  const carry = carryNote({ 1: 0.2599, 2: 0.3183, 3: 0.3596 });
  assert.equal(carry, '10 % de surplus au rang 1 valent au plus 2,6 % du rang 2 ; au rang 2, au plus 3,2 % du rang 3 ; au rang 3, au plus 3,6 % du rang 4');
  assert.doesNotMatch(carry, /du surplus \(/);
  assert.equal(carryNote({ 2: 0.3183 }), '10 % de surplus au rang 2 valent au plus 3,2 % du rang 3');
  assert.equal(carryNote({}), null);
  assert.equal(carryNote(null), null);
  // Table sans fourchette : rien d'inventé
  const empty = lowerGradesNote({ general: rules.general, table: [] });
  assert.deepEqual([empty.ratio, empty.unbounded], [null, null]);
});

test('badge d’un module et d’un ingénieur : le motif du calcul (statusWhy) au survol, pas une hypothèse qui n’existe pas', () => {
  // Selene Jean au rang 4 à 10 %, module visé en G1 (ce que le calcul du serveur renvoie) : « à vérifier » parce que
  // finir un G1 au rang 4 n'est mesuré que 2 fois, sans hypothèse
  const why = ['finir le G1 au rang 4 : mesurée 2 fois seulement (il en faut 3 pour la dire mesurée), sans hypothèse'];
  const m = {
    slot: 'int-1',
    label: 'Capteurs',
    steps: [{ grade: 1, rolls: 2, rollsBase: 1, rollsFavorable: 2, ranks: [4], byRank: [{ rank: 4, rolls: 2 }], status: { best: best('Selene Jean', 4) } }],
    extras: [],
    engineerRanks: [{ name: 'Selene Jean', rank: 4, status: 'à vérifier', statusWhy: why }],
  };
  const [line] = moduleRankLines(m, [{ name: 'Selene Jean', rank: 4, status: 'à vérifier', statusWhy: why, ups: [] }]);
  assert.deepEqual([line.text, line.status, line.why], ['Chez Selene Jean (rang 4) : G1 en 2 applications au lieu de 1', 'à vérifier', why]);
  const source = 'journaux de référence, 24 oct.–5 nov. 2026 (808 applications, jeu 4.4.2.1)';
  assert.equal(statusBadge(line.status, source, line.why).help, `À vérifier. Finir le G1 au rang 4 : mesurée 2 fois seulement (il en faut 3 pour la dire mesurée), sans hypothèse. Source : ${source}. À confirmer en jeu.`);
  // Même motif pour le résumé du plan et du Dashboard
  assert.deepEqual(engineerRankSummary({ name: 'Selene Jean', rank: 4, status: 'à vérifier', statusWhy: why, progress: { min: 10, max: 10.99, known: 'relevé' } }).why, why);
  // Sans motif du serveur (ancienne réponse) : null, et le texte par défaut
  assert.equal(moduleRankLines({ ...m, engineerRanks: [{ name: 'Selene Jean', rank: 4, status: 'à vérifier' }] }, [])[0].why, null);
});

test('détail d’un module : un module visé sous le rang, fait avant la montée parce qu’il compte pour elle', () => {
  // Ce que planNeeds renvoie (Felicity Farseer, rang 3 à 60 % : FSD déjà en G3 visé G5, propulseurs neufs visés G2) :
  // les propulseurs sont faits au rang 3 (3 G1 + 4 G2), leurs applications font la montée au rang 4
  const fel = (grade, rolls, rollsBase, rollsFavorable) => ({ grade, rolls, rollsBase, rollsFavorable, ranks: [3], byRank: [{ rank: 3, rolls }], early: 3, status: { best: best('Felicity Farseer', 3) } });
  const thr = { slot: 'thr', label: 'Propulseurs', steps: [fel(1, 3, 1, 3), fel(2, 4, 2, 4)], extras: [], engineerRanks: [{ name: 'Felicity Farseer', rank: 3, status: 'à vérifier' }] };
  const felicity = { name: 'Felicity Farseer', rank: 3, rankAfter: 5, extras: [], ups: [{ from: 3, to: 4, extra: false, slot: 'thr', label: 'Propulseurs', grade: 2 }, { from: 4, to: 5, extra: false, slot: 'fsd', label: 'FSD', grade: 4 }] };
  const [line] = moduleRankLines(thr, [felicity]);
  assert.equal(line.text, 'Chez Felicity Farseer (rang 3) : G1 en 3 applications au lieu de 1, G2 en 4 applications au lieu de 2, à faire au rang 3, avant la montée : elles comptent pour elle, et coûtent moins de matériaux en tout que de garder ce module pour le rang 5 et de monter avec un module neuf');
  // Sans early : rien de plus (le module est fait quand le rang est le plus haut)
  assert.doesNotMatch(moduleRankLines({ ...thr, steps: thr.steps.map((x) => ({ ...x, early: null })) }, [felicity])[0].text, /avant la montée/);
  // Module sans application en plus, fait après une montée : qui la fait (un autre module du plan, les applications
  // en plus rattachées à un autre module), pas « les autres modules du plan » quand ce sont les applications en plus
  const after = { slot: 'pd', label: 'Répartiteur', steps: [step(1, 1, 1, 1, { status: { best: best('Felicity Farseer', 3) } })], extras: [], engineerRanks: [{ name: 'Felicity Farseer', rank: 3 }] };
  const ups = [{ from: 3, to: 4, extra: true }, { from: 4, to: 5, extra: false, slot: 'fsd', label: 'FSD', grade: 4 }];
  assert.equal(moduleRankLines(after, [{ name: 'Felicity Farseer', rank: 3, rankAfter: 5, ups, order: [{ slot: 'fsd', label: 'FSD', grade: 4, rank: 4, count: 4 }] }])[0].text, 'Chez Felicity Farseer (rang 3) : aucune application en plus, à faire après sa montée au rang 5 (faite avec les applications en plus et « FSD »)');
});

test('« Ce que tes journaux montrent » : la colonne de la montée est la table (observations, motif, source) ; les montées lues sont à côté, par rang', () => {
  const table = [
    { rank: 1, grade: 1, finish: { value: 5, status: 'mesurée', observations: 9, source: 'journaux de référence' }, climb: { min: 3, max: 3, gainMin: 33.3333, gainMax: 49.9976, status: 'à vérifier', source: 'déduit de 17 séquences', sequences: 3 } },
    { rank: 2, grade: 1, finish: { value: 4, status: 'mesurée', observations: 15 }, climb: { min: 12, max: 14, gainMin: 7.6923, gainMax: 8.6615, status: 'à vérifier', source: 'déduit de 17 séquences', sequences: 3 } },
    { rank: 2, grade: 2, finish: { value: 5, status: 'mesurée', observations: 6 }, climb: { min: 3, max: 4, gainMin: 28.9276, gainMax: 36.063, status: 'à vérifier', source: 'déduit de 17 séquences', sequences: 2 } },
    { rank: 4, grade: 1, finish: { value: 2, status: 'à vérifier', observations: 2 }, climb: { min: 114, max: null, gainMin: 0, gainMax: 0.8795, status: 'inconnue', source: 'déduit', sequences: 1, why: 'rien ne dit combien' } },
    { rank: 5, grade: 1, finish: { value: 1, status: 'mesurée', observations: 58 }, climb: null },
  ];
  // Montées lues dans tes journaux (GET /ranks, climbs) : déblocage → rang 2 par 3 G1, deux fois ; rang 2 → 3
  const climbs = [
    { rank: 1, toRank: 2, start: { kind: 'déblocage', progress: null }, grades: [{ grade: 1, atelier: 3, distance: 0, inconnu: 0, experimental: 0 }], applications: 3, count: 2, ok: true },
    { rank: 2, toRank: 3, start: { kind: 'montée', progress: null }, grades: [{ grade: 1, atelier: 2, distance: 0, inconnu: 0, experimental: 0 }, { grade: 2, atelier: 3, distance: 0, inconnu: 0, experimental: 0 }], applications: 5, count: 1, ok: false },
  ];
  const rows = measureRows({ rules: { table }, measures: [{ rank: 2, grade: 2, rolls: 5, informative: 3, applications: 4, contradictions: 0, rerolls: 1 }], climbs });
  assert.deepEqual(rows.map((r) => [r.key, r.finishObservations, r.climbObservations]), [
    ['1|1', '9 mesures', 'déduit de 3 séquences des journaux de référence où ce grade a servi'],
    ['2|1', '15 mesures', 'déduit de 3 séquences des journaux de référence où ce grade a servi'],
    ['2|2', '6 mesures', 'déduit de 2 séquences des journaux de référence où ce grade a servi'],
    ['4|1', '2 mesures', 'déduit de 1 séquence des journaux de référence où ce grade a servi'],
    ['5|1', '58 mesures', null],
  ]);
  // Badge de la montée : le motif dit la déduction et le nombre de séquences, avec la source (plus seulement « une
  // hypothèse ») ; la borne inconnue garde le motif de la table
  assert.equal(rows[0].climbWhy, 'déduite de 3 séquences des journaux de référence où ce grade a servi à ce rang, avec des hypothèses (rankModel.js)');
  assert.equal(statusBadge(rows[0].climb.status, rows[0].climb.source, rows[0].climbWhy).help, 'À vérifier. Déduite de 3 séquences des journaux de référence où ce grade a servi à ce rang, avec des hypothèses (rankModel.js). Source : déduit de 17 séquences. À confirmer en jeu.');
  assert.equal(rows[3].climbWhy, 'rien ne dit combien');
  assert.equal(rows[4].climbWhy, null);
  // Montées de tes journaux : une cellule par rang (première ligne du rang, sur toutes ses lignes), en direct
  assert.deepEqual(rows.map((r) => [r.key, r.rankFirst, r.rankSpan]), [['1|1', true, 1], ['2|1', true, 2], ['2|2', false, 2], ['4|1', true, 1], ['5|1', true, 1]]);
  assert.deepEqual(rows[0].rankClimbs, [{ text: '3 G1 depuis le déblocage, 2 fois', ok: true }]);
  assert.deepEqual(rows[1].rankClimbs, [{ text: '2 G1 et 3 G2 depuis la montée au rang 2, 1 fois · écart avec la table', ok: false }]);
  assert.deepEqual(rows[3].rankClimbs, [], 'rang 4 : pas encore vue');
  assert.equal(rows[4].rankClimbs, null, 'rang 5 : rang max');
  // Grade refait déjà à 100 % : dit dans la case mesurée
  assert.equal(rows[2].measuredText, '5 (3 mesures) · 1 grade refait déjà à 100 %');
  // À distance, lieu inconnu, relevé de départ
  assert.equal(climbText({ rank: 3, start: { kind: 'relevé', progress: 24 }, grades: [{ grade: 2, atelier: 5, distance: 0, inconnu: 0, experimental: 0 }, { grade: 3, atelier: 2, distance: 5, inconnu: 1, experimental: 0 }], count: 1, ok: true }), '5 G2 et 8 G3 (dont 5 à distance, 1 au lieu inconnu) depuis un relevé à 24 %, 1 fois');
});

test('« Ce que tes journaux montrent » : grade refait déjà à 100 %, application illisible', () => {
  // Rien dans tes journaux : la note de la table reste (0 cas dans les journaux de référence)
  assert.deepEqual(rerollNote({ rerolls: [] }), { seen: 0, text: 'jamais vu dans les journaux de référence' });
  // Vu : le compte, quand et chez qui, et que la table dit encore « inconnue » (à relire)
  const seen = rerollNote({ rerolls: [{ at: '2026-11-10T10:00:00Z', engineer: 'Felicity Farseer', rank: 3, grade: 3, place: 'atelier' }, { at: '2026-11-09T10:00:00Z', engineer: 'Felicity Farseer', rank: 3, grade: 3, place: 'distance' }] });
  assert.equal(seen.seen, 2);
  assert.equal(seen.text, 'jamais vu dans les journaux de référence qui ont fait la table, mais vu 2 fois dans tes journaux (10 nov., Felicity Farseer au rang 3, G3, à l’atelier ; 9 nov., Felicity Farseer au rang 3, G3, à distance) : la table dit encore « inconnue », à relire');
  assert.doesNotMatch(seen.text, /jamais vu dans tes journaux/);
  // Application par application : le grade refait est nommé, pas « +0 % »
  assert.equal(orderDetail({ order: [{ grade: 3, place: 'atelier', step: null, reroll: true }, { grade: 4, place: 'atelier', step: 0.25 }] }), 'G3 refait (déjà à 100 %) · G4 +25 %');
  // Applications illisibles (valeurs que le jeu n'écrit pas) : comptées à part, sans mesure
  assert.equal(applicationsReadText({ applications: 3, unreadable: 1, period: { first: '2026-11-09', last: '2026-11-09' } }), '3 applications lues (le 9 nov.) · 1 application illisible (valeur que le jeu n’écrit pas), sans mesure');
  assert.equal(applicationsReadText({ applications: 0, unreadable: 2, period: {} }), 'aucune application lisible · 2 applications illisibles (valeur que le jeu n’écrit pas), sans mesure');
});
