// Phrases de la page Itinéraire, du bloc « Valider ce plan » et de « Pourquoi lui ? », sur des résultats écrits à la
// main (même forme que GET /route du serveur) : épingle de Felicity au G5 et effet chez Palin (T2), épingle partielle de
// Palin (T13), traversée, découverte par référence, escale à deux vaisseaux, position immobile, déplacée ou inconnue.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEGEND, NO_SHIPYARD, VARIANT_TEXT, al, alNum, bannerText, changeLine, computeButton, count, dayMonth, engineerOptionText, excludedItems, fallbackText,
  fromOfResult, ifUnlockedText, impossibleLine, materialsLine, optionText, orderText, partTitle, planCheckText, rankLine, remoteHereText, remoteLine,
  ruleBadge, ruleBadges, signed, splitNotes, startLabel, stopHeader, stopOrderText, stopStateText, storeWarningText, summaryPills, taskLine,
  unlockLines, validationPill, validationText, vehicleLines, warningLines, whyText,
} from './routeView.js';

process.env.TZ = 'Europe/Paris';
const NNBSP = ' '; // séparateur des milliers en français (Intl)

const FEL = 300100;
const PALIN = 300220;
const CHLOE = 300300;
const MEL = 300280;
const LEI = 300120;
const DIDI = 300000;
const SELENE = 300210;
const ELVIRA = 300160;
const names = new Map([[FEL, 'Felicity Farseer'], [PALIN, 'Professor Palin'], [CHLOE, 'Chloe Sedesi'], [MEL, 'Mel Brandon'], [LEI, 'Lei Cheung'], [DIDI, 'Didi Vatermann'], [SELENE, 'Selene Jean'], [ELVIRA, 'Elvira Martuuk']]);
const row = (id, extra = {}) => ({ id, name: names.get(id), system: { [PALIN]: 'Arque', [FEL]: 'Deciat', [CHLOE]: 'Shenve', [ELVIRA]: 'Khun' }[id] ?? 'Système', region: id === MEL ? 'Colonia' : 'Bulle', base: 'Abel Laboratory', arrivalLs: 2372, distanceAl: 98.02, permit: { required: false, name: null, seen: null }, state: { progress: 'Unlocked', rank: 5 }, ...extra });
const engs = new Map([...names.keys()].map((id) => [id, row(id)]));

const labels = (mod, bp, exp = null) => ({ moduleLabel: mod, blueprintLabel: bp, experimentalLabel: exp, shipModel: 'Krait Mk II', groupLabel: mod });
const FSD = labels('5A Réacteur FSD', 'Portée augmentée', 'Gestionnaire de masse');
const T = labels('6A Propulseurs', 'Propulseurs bricolés', 'Propulseurs à grande vitesse');
const rules = new Map([
  ['R3c', { id: 'R3c', text: 'Grade possible à distance…', status: 'mesurée', source: 'journaux de référence' }],
  ['R5b', { id: 'R5b', text: 'Un ingénieur qui propose ce plan peut poser l’effet même au-dessus de son grade maximal.', status: 'à vérifier', source: 'Wiki ; signalé par un joueur le 8 nov. 2026', also: 'signalé par un joueur le 8 nov. 2026', why: 'aucun cas vu' }],
  ['R2a', { id: 'R2a', text: 'Un seul plan épinglé par ingénieur.', status: 'publiée', source: 'Wiki Fandom, page « Remote Workshop »' }],
  ['R11', { id: 'R11', kind: 'app', text: 'Régions Bulle et Colonia.' }],
]);

// T2 : épingle de Felicity (FSD G1→G5 à distance), puis Palin : propulseurs G1→G5 et effet du FSD (R5b, repli Felicity)
const t2 = () => ({
  computedAt: '2026-11-05T12:41:17.000Z',
  from: { kind: 'position', engineerId: null, system: 'Muang', systemAddress: 4481966019282, starPos: [17.03, -172.78, -3.47], at: '2026-11-05T12:28:05Z', region: 'Bulle', regionNote: null },
  positionAtCompute: { system: 'Muang', systemAddress: 4481966019282, starPos: [17.03, -172.78, -3.47], at: '2026-11-05T12:28:05Z' },
  plans: [{ id: 6, name: 'Krait', fingerprint: 'x', shipId: 12, shipType: 'krait_mkii', model: 'Krait Mk II' }],
  options: { exclude: [] },
  inputs: { pins: {}, engineers: { [PALIN]: { progress: 'Unlocked', rank: 5 }, [DIDI]: { progress: 'absent', rank: null } } },
  exact: true,
  effort: { candidates: 6, evaluated: 4 },
  remote: [{ id: '6/std-fsd:grades', planId: 6, slot: 'std-fsd', label: 'Réacteur FSD', grp: 'fsd', blueprint: 'FSD_LongRange', engineer: FEL, pin: { source: 'journal', at: '2026-11-05T08:20:37Z' }, rank: 5, grades: [1, 2, 3, 4, 5], startQuality: 0, split: false, upTo: 5, continuesAt: null, rolls: 15, rollsBase: 15, before: 1, materials: [], rules: ['R3c', 'R3d'], warnings: [], labels: { ...FSD, engineerName: 'Felicity Farseer' } }],
  parts: [{
    kind: 'region', region: 'Bulle', required: true, totalAl: 98.02, cost: { w: 295.42 }, order: { method: 'exact', stops: 1, candidates: 3 },
    stops: [{
      n: 1, engineer: PALIN, legAl: 98.02, cumulAl: 98.02, arrivalLs: 2372, pin: null, plans: [6], bring: [{ planId: 6, slots: ['std-fsd', 'std-t'] }],
      vehicle: { planId: 6, shipId: 12, shipType: 'krait_mkii' }, transfers: [], revisits: [], unlock: null,
      rank: { from: 5, to: 5, order: [{ task: '6/std-t:grades', grade: 1, rank: 5, count: 1 }], extraRolls: 0, status: 'mesurée' },
      tasks: [
        { id: '6/std-t:grades', planId: 6, slot: 'std-t', label: 'Propulseurs', grp: 't', blueprint: 'Engine_Dirty', kind: 'grades', grades: [1, 2, 3, 4, 5], maxGrade: 5, rolls: 15, rollsBase: 15, rules: [], warnings: [], labels: T },
        { id: '6/std-fsd:effet', planId: 6, slot: 'std-fsd', label: 'Réacteur FSD', grp: 'fsd', blueprint: 'FSD_LongRange', kind: 'effet', experimental: 'special_fsd_heavy', maxGrade: 3, afterRemote: true, gradeAtEffect: 5, rules: ['R5b'], fallback: { engineer: FEL, extraAl: 128.11 }, variant: { rules: ['R6c'] }, warnings: [], labels: FSD },
      ],
      materials: [{ key: 'arsenic', label: 'Arsenic', need: 5, ownedBefore: 16, missing: 0 }],
      warnings: [],
      why: {
        units: [
          { id: '6/std-t:grades', kind: 'grades', others: [
            { engineer: CHLOE, region: 'Bulle', maxGrade: 5, progress: 'Unlocked', rank: 5, verdict: 'plus-loin', addedW: 707.74, addedAl: 778.92, how: 'remplacement' },
            { engineer: MEL, region: 'Colonia', maxGrade: 5, progress: 'Unlocked', rank: 5, verdict: 'autre-region', fromYouAl: 22013.55 },
            { engineer: FEL, region: 'Bulle', maxGrade: 3, verdict: 'grade-max' },
            { engineer: ELVIRA, region: 'Bulle', maxGrade: 2, verdict: 'grade-max' },
          ], more: 0 },
          { id: '6/std-fsd:effet', kind: 'effet', others: [], more: 2 },
        ],
        without: { feasible: true, crossing: false, dUnlocks: 0, dSteps: 0, dW: 707.74, dPathAl: 778.92, dStops: 0, dSupercruiseAl: -71.18, dRolls: 0, replacedBy: [CHLOE] },
      },
    }],
  }],
  totalAl: 98.02,
  impossible: [],
  ifUnlocked: null,
  notes: [],
});
const viewOf = (result, over = {}) => ({ result, position: { system: 'Muang', systemAddress: 4481966019282, starPos: [17.03, -172.78, -3.47], at: '2026-11-05T12:28:05Z', region: 'Bulle' }, validated: [{ id: 6, name: 'Krait', at: '2026-11-05T12:41:17.000Z', stale: false, todo: 2 }], changes: [], live: { done: {}, missing: {} }, warnings: [], ...over });

test('nombres et distances en français : une décimale sous 1 000 al, entier au-delà ; pluriels ; signes', () => {
  assert.equal(al(98.02), '98,0 al');
  assert.equal(al(22013.55), `22${NNBSP}014 al`);
  assert.equal(alNum(999.94), '999,9');
  assert.equal(count(0, 'escale', 'escales'), '0 escale');
  assert.equal(count(1, 'escale', 'escales'), '1 escale');
  assert.equal(count(2, 'escale', 'escales'), '2 escales');
  assert.equal(count(1200, 'application', 'applications'), `1${NNBSP}200 applications`);
  assert.equal(signed(-71.18), '−71,2');
  assert.equal(signed(707.74), '+707,7');
  assert.equal(dayMonth('2026-11-05T08:20:37Z'), '05/11');
});

test('avant le calcul : plans à cocher, points de départ, écartés, bouton', () => {
  assert.deepEqual(planCheckText({ name: 'Krait', at: '2026-11-09T10:12:00Z', stale: false, todo: 3 }), { text: 'Krait · validé le 9 nov. · 3 modules à faire', note: null, disabled: false });
  assert.deepEqual(planCheckText({ name: 'Python', at: '2026-11-09T10:12:00Z', stale: true, todo: 1 }), { text: 'Python · validé le 9 nov. · 1 module à faire', note: 'modifié depuis sa validation : revalide-le', disabled: true });
  assert.equal(startLabel('position', { system: 'Muang', region: 'Bulle', at: '2026-11-05T12:28:05Z' }), 'ma position : Muang (Bulle, lue le 5 nov. à 13:28)');
  assert.equal(startLabel('position', { system: 'Wregoe', region: 'autre', at: '2026-11-05T12:28:05Z' }), 'ma position : Wregoe (hors de la Bulle et de Colonia, lue le 5 nov. à 13:28)');
  assert.equal(startLabel('position', null), 'ma position');
  assert.equal(startLabel('sol'), 'Sol');
  assert.equal(startLabel('colonia'), 'Colonia');
  assert.equal(startLabel('engineer'), 'le système d’un ingénieur');
  assert.equal(engineerOptionText({ name: 'Professor Palin', system: 'Arque' }), 'Professor Palin (Arque)');
  assert.equal(excludedItems([], names), null);
  assert.deepEqual(excludedItems([PALIN, CHLOE], names), { label: 'Écartés :', items: [{ id: PALIN, name: 'Professor Palin', action: 'remettre' }, { id: CHLOE, name: 'Chloe Sedesi', action: 'remettre' }] });
  assert.deepEqual(computeButton({ result: null }), { label: 'Calculer l’itinéraire', primary: true });
  assert.deepEqual(computeButton({ result: t2(), changes: [] }), { label: 'Recalculer', primary: false });
  assert.deepEqual(computeButton({ result: t2(), changes: [{ kind: 'pin', engineer: FEL }] }), { label: 'Recalculer', primary: true });
  assert.equal(fromOfResult(t2()), 'position');
  assert.deepEqual(fromOfResult({ from: { kind: 'engineer', engineerId: PALIN } }), { engineer: PALIN });
  assert.equal(fromOfResult({ from: { kind: 'sol' } }), 'sol');
});

test('bandeau : départ « ma position », immobile ou déplacé ; chaque raison de « Depuis le calcul »', () => {
  const r = t2();
  const still = bannerText(viewOf(r), names);
  assert.equal(still.computed, 'Calculé depuis Muang (ta position) le 5 nov. à 13:41.');
  assert.deepEqual(still.here, { text: '✓ Tu es toujours à Muang.', tone: 'good', recompute: false });
  assert.equal(still.changes, null);
  assert.equal(still.note, 'L’ordre et les choix datent du calcul ; les cases faites et les manques sont à jour.');
  const moved = bannerText(viewOf(r, { position: { system: 'Leesti', starPos: [0, 0, 0], region: 'Bulle' }, changes: [{ kind: 'position', from: 'Muang', to: 'Leesti', distanceAl: 111.04 }] }), names);
  assert.deepEqual(moved.here, { text: '⚠ Tu es maintenant à Leesti, à 111,0 al de Muang.', tone: 'warn', recompute: true });
  // Position devenue inconnue : rien sur « où tu es »
  assert.equal(bannerText(viewOf(r, { position: null }), names).here, null);
  const changes = [
    { kind: 'engineer', engineer: LEI, what: 'debloque' },
    { kind: 'engineer', engineer: ELVIRA, what: 'rang', from: 3, to: 5 },
    { kind: 'pin', engineer: FEL },
    { kind: 'plan', planId: 6, what: 'modifie' },
    { kind: 'plan', planId: 6, what: 'validation-annulee' },
    { kind: 'plan-nouveau', planId: 7 },
  ];
  const v = viewOf(r, { changes, validated: [{ id: 7, name: 'Python', at: '2026-11-09T10:12:00Z', stale: false, todo: 1 }] });
  assert.equal(bannerText(v, names).changes, 'Depuis le calcul : Lei Cheung a été débloqué · rang d’Elvira Martuuk : 3 → 5 · ton épingle chez Felicity Farseer a changé · le plan « Krait » a changé (revalide-le) · la validation de « Krait » a été annulée · le plan « Python » a été validé (il n’est pas dans ce calcul).');
  assert.equal(bannerText({ result: null }, names), null);
});

test('bandeau : départ choisi (Sol, Colonia, un ingénieur) : jamais « tu es maintenant à… »', () => {
  const sol = { ...t2(), from: { kind: 'sol', engineerId: null, system: 'Sol', systemAddress: null, starPos: [0, 0, 0], at: null, region: 'Bulle' } };
  const known = bannerText(viewOf(sol, { position: { system: 'Lei Cheung', starPos: [0, 0, 118.18], region: 'Bulle' } }), names);
  assert.equal(known.computed, 'Calculé depuis Sol (point choisi) le 5 nov. à 13:41.');
  assert.deepEqual(known.here, { text: 'Tu es à Lei Cheung, à 118,2 al de Sol.', tone: null, recompute: false });
  assert.equal(bannerText(viewOf(sol, { position: null }), names).here, null, 'position inconnue : rien');
  const colonia = { ...t2(), from: { kind: 'colonia', starPos: [-9530.5, -910.28125, 19808.125], system: 'Colonia', region: 'Colonia' } };
  assert.equal(bannerText(viewOf(colonia), names).computed, 'Calculé depuis Colonia (point choisi) le 5 nov. à 13:41.');
  const eng = { ...t2(), from: { kind: 'engineer', engineerId: ELVIRA, system: 'Khun', starPos: [0, 0, 0], region: 'Bulle' } };
  const b = bannerText(viewOf(eng), names);
  assert.equal(b.computed, 'Calculé depuis le système d’Elvira Martuuk (point choisi) le 5 nov. à 13:41.');
  for (const x of [known, b, bannerText(viewOf(colonia), names)]) assert.doesNotMatch(`${x.here?.text}`, /Tu es maintenant|⚠/);
});

test('résumé, ordre exact ou approché, notes de la traversée, légende', () => {
  const r = t2();
  assert.deepEqual(summaryPills(r), ['1 escale', '98,0 al à vol d’oiseau', '15 applications à distance', '0 déblocage']);
  assert.deepEqual(orderText(r, names), ['Ordre : une seule escale, depuis Muang (calcul exact).', 'Distances à vol d’oiseau : en sauts, le trajet réel est plus long ; le total est arrondi à part.']);
  const two = { ...r, parts: [{ ...r.parts[0], stops: [r.parts[0].stops[0], { ...r.parts[0].stops[0], n: 2 }] }] };
  assert.equal(orderText(two, names)[0], 'Ordre : le plus court parmi tous les ordres possibles de ces 2 escales, depuis Muang, sans retour (calcul exact).');
  assert.equal(orderText({ ...two, exact: false, effort: { candidates: 19 } }, names)[0], 'Ordre approché : trop de choix pour tout comparer (19 ingénieurs possibles). Escales prises de proche en proche, puis morceaux du trajet retournés ou déplacés tant que ça raccourcit (2-opt, Or-opt).');
  assert.match(orderText({ ...r, from: { kind: 'sol', starPos: [0, 0, 0] } }, names)[0], /depuis Sol/);
  const notes = splitNotes(['Tu es à 1 200 al de la Bulle et à 21 000 al de Colonia : je prends la Bulle comme base.', 'Personne dans la Bulle ne monte « X » au-delà du G4. Pour le G5, il faut aller à Colonia (22 001,6 al). N’y va que si tu le veux.', 'Lei Cheung t’a banni : il ne compte pas dans le calcul.']);
  assert.equal(notes.crossing.length, 1);
  assert.equal(notes.other.length, 2);
  assert.match(LEGEND, /^al-éq\. : distance équivalente/);
  assert.deepEqual(ifUnlockedText({ engineers: [LEI], gainW: 120.5, steps: 2 }, names), 'En débloquant Lei Cheung, l’itinéraire serait plus court de 120,5 al-éq. (2 étapes de déblocage).');
  assert.equal(ifUnlockedText(null, names), null);
  assert.equal(impossibleLine({ planId: 6, labels: FSD, text: 'Tu as écarté Professor Palin : personne d’autre dans la Bulle ne fait « Portée augmentée » G5 (5A Réacteur FSD). Remets-le, ou il faudra traverser.' }, r), 'Krait — 5A Réacteur FSD : Tu as écarté Professor Palin : personne d’autre dans la Bulle ne fait « Portée augmentée » G5 (5A Réacteur FSD). Remets-le, ou il faudra traverser.');
});

test('à distance : épingle déduite (réserve), avant l’escale de l’effet ; découpage (R12b) ; quand tu veux ; cases en direct', () => {
  const r = t2();
  const live = { done: { '6/std-fsd:grades': 'en-cours' } };
  const l = remoteLine(r.remote[0], { result: r, live, names });
  assert.equal(l.text, 'Krait — 5A Réacteur FSD : Portée augmentée G1→G5 · 15 applications · épingle de Felicity Farseer (déduite, dernier constat le 05/11)');
  assert.equal(l.caveat, 'si ton épingle chez Felicity Farseer est toujours « Portée augmentée » (vue le 05/11)');
  assert.equal(l.when, 'à faire avant l’escale 1 : l’effet se pose ensuite sur ce module');
  assert.deepEqual([l.mark, l.state], ['▸', 'en cours']);
  // Épingle partielle de Palin (T13) : G1 à G3 à distance, Elvira reprend au G4
  const split = { ...r.remote[0], engineer: PALIN, labels: { ...FSD, engineerName: 'Professor Palin' }, pin: { source: 'saisie', at: '2026-11-08T10:00:00Z' }, grades: [1, 2, 3], upTo: 3, split: true, continuesAt: 1, rolls: 6, rules: ['R3c', 'R3d', 'R12b'] };
  const r13 = { ...r, remote: [split], parts: [{ ...r.parts[0], stops: [{ ...r.parts[0].stops[0], engineer: ELVIRA }] }] };
  const s = remoteLine(split, { result: r13, live: { done: { '6/std-fsd:grades': 'fait' } }, names });
  assert.equal(s.text, 'Krait — 5A Réacteur FSD : Portée augmentée G1→G3 · 6 applications · épingle de Professor Palin (saisie le 08/11)');
  assert.equal(s.caveat, null, 'saisie : pas de réserve');
  assert.equal(s.when, 'à faire avant l’escale 1 : Elvira Martuuk reprendra au G4');
  assert.equal(s.check, 'À son atelier, vérifie que le jeu te propose bien le G4 avant de payer.');
  assert.ok(s.rules.includes('R12b'));
  assert.deepEqual([s.mark, s.state], ['✓', 'fait']);
  const free = remoteLine({ ...r.remote[0], before: null }, { result: r, live: {}, names });
  assert.equal(free.when, 'quand tu veux');
  assert.deepEqual([free.mark, free.state], ['☐', null]);
});

test('atelier à distance ici : à quai, à pied, en taxi, en équipage, ailleurs', () => {
  assert.deepEqual(remoteHereText({ ok: true, station: 'Macmillan Terminal', onFoot: false, why: null }), { tone: 'good', text: '✓ Faisable ici : tu es à quai à Macmillan Terminal.' });
  assert.deepEqual(remoteHereText({ ok: true, station: 'Macmillan Terminal', onFoot: true, why: null }), { tone: 'good', text: '✓ Faisable ici, depuis ton vaisseau : tu es à quai à Macmillan Terminal (remonte à bord).' });
  assert.deepEqual(remoteHereText({ ok: false, why: 'taxi' }), { tone: 'warn', text: 'Pas d’ici : tu es en taxi, sans ton vaisseau.' });
  assert.deepEqual(remoteHereText({ ok: false, why: 'équipage' }), { tone: 'warn', text: 'Pas d’ici : tu es dans l’équipage d’un autre joueur.' });
  assert.equal(remoteHereText({ ok: false, why: 'base d’ingénieur' }), null);
  assert.equal(remoteHereText({ ok: false, why: 'pas à quai' }), null);
  assert.equal(remoteHereText(null), null);
});

test('parties : ta région, à préparer, traversée facultative ou nécessaire, retour', () => {
  const stop = (n, tasks = []) => ({ n, tasks });
  assert.deepEqual(partTitle({ kind: 'region', region: 'Bulle', totalAl: 98.02, stops: [stop(1)] }, names), { title: 'Dans la Bulle — 1 escale · 98,0 al', detail: null });
  assert.equal(partTitle({ kind: 'region', region: 'Colonia', totalAl: 19.63, stops: [stop(1), stop(2)] }, names).title, 'Dans Colonia — 2 escales · 19,6 al');
  assert.deepEqual(partTitle({ kind: 'a-preparer', region: 'Bulle', totalAl: 128.09, stops: [stop(2)] }, names), { title: 'Dans la Bulle, à préparer — ingénieurs à faire inviter d’abord', detail: '1 escale · 128,1 al' });
  assert.equal(partTitle({ kind: 'traversee', region: 'Colonia', required: false, totalAl: 22001.57, stops: [stop(2)] }, names).title, 'Traversée vers Colonia (signalée) — seulement pour ce que personne ne fait dans ta région');
  const ref = { id: `ref:${MEL}`, kind: 'reference', for: MEL };
  assert.equal(partTitle({ kind: 'traversee', region: 'Bulle', required: true, totalAl: 21979, stops: [stop(1, [ref])] }, names).title, 'Traversée vers la Bulle (signalée) — nécessaire pour connaître Mel Brandon');
  assert.equal(partTitle({ kind: 'retour', region: 'Colonia', totalAl: 21992.19, stops: [stop(2)] }, names).title, 'De retour à Colonia, à préparer — ingénieurs connus grâce à la traversée');
});

test('escale : en-tête, état (débloqué, invité, connu, Acquainted, pas encore découvert), permis, distance', () => {
  const r = t2();
  const s = r.parts[0].stops[0];
  assert.equal(stopHeader(s, engs.get(PALIN), names), '1. Professor Palin · Arque · +98,0 al (cumul 98,0 al) · Abel Laboratory, 2 372 sl de l’arrivée'.replace('2 372', `2${NNBSP}372`));
  assert.equal(stopHeader(s, null, names), '1. Professor Palin · +98,0 al (cumul 98,0 al)');
  assert.equal(stopStateText(s, engs.get(PALIN), r), 'Bulle · débloqué, rang 5 · permis : aucun · à 98,0 al de toi');
  const st = (state, permit = { required: false }) => stopStateText(s, row(PALIN, { state, permit, distanceAl: null }), r);
  assert.equal(st({ progress: 'Invited', rank: null }), 'Bulle · invité : à débloquer · permis : aucun');
  assert.equal(st({ progress: 'Known', rank: null }, { required: true, name: 'Founders World', seen: null }), 'Bulle · connu : pas encore invité · permis de Founders World : à obtenir');
  assert.equal(st({ progress: 'Acquainted', rank: null }, { required: true, name: 'Sirius', seen: true }), 'Bulle · état « Acquainted » du jeu : sens à vérifier (avant ou après l’invitation) · permis de Sirius : vu');
  // Sans état aujourd'hui : celui du calcul (« absent » : pas encore découvert)
  assert.equal(stopStateText({ ...s, engineer: DIDI }, row(DIDI, { state: { progress: null }, distanceAl: null }), r), 'Bulle · pas encore découvert · permis : aucun');
  assert.equal(stopStateText({ ...s, engineer: 300999 }, null, r), 'état inconnu : lance le jeu pour le relever · permis : aucun');
});

test('tâches d’une escale : grades, effet (repli R5b, variante R6c), référence ; cases cochées en direct', () => {
  const r = t2();
  const s = r.parts[0].stops[0];
  const ctx = { result: r, live: { done: { '6/std-t:grades': 'fait' } }, names };
  assert.deepEqual(taskLine(s.tasks[0], s, ctx), { id: '6/std-t:grades', mark: '✓', state: 'fait', text: 'Krait — 6A Propulseurs : Propulseurs bricolés G1→G5 (15 appl.)', rules: [] });
  const eff = taskLine(s.tasks[1], s, ctx);
  assert.equal(eff.text, 'Krait — 5A Réacteur FSD : effet « Gestionnaire de masse »');
  assert.deepEqual([eff.mark, eff.rules], ['☐', ['R5b']]);
  assert.equal(fallbackText(s.tasks[1], s, names), 'Si Professor Palin ne te propose pas l’effet sur ce module G5 (règle à vérifier), Felicity Farseer le fera : +128,1 al.');
  assert.equal(fallbackText(s.tasks[0], s, names), null);
  assert.equal(VARIANT_TEXT, 'Autre ordre possible : l’effet d’abord sur un G1 ici, puis les grades à distance. Il dépend d’une autre règle à vérifier : l’effet gardé en montant à distance (signalé par un joueur).');
  assert.equal(taskLine({ ...s.tasks[0], grades: [5] }, s, ctx).text, 'Krait — 6A Propulseurs : Propulseurs bricolés G5 (15 appl.)');
  const ref = { id: `ref:${DIDI}`, kind: 'reference', for: DIDI, climb: { blueprintLabel: 'Renforcé', groupLabel: 'Renfort de bouclier', rolls: 11 }, rules: ['R14'] };
  const sel = { ...s, engineer: SELENE };
  assert.equal(taskLine(ref, sel, ctx).text, 'Monter Selene Jean au rang 3 et à la moitié de la barre vers le rang 4, pour connaître Didi Vatermann : environ 11 applications de « Renforcé » (Renfort de bouclier) sur un module de ce type acheté exprès (pas un module d’un plan : la première application effacerait ses grades)');
  assert.match(taskLine({ ...ref, climb: null }, sel, ctx).text, /des applications à son atelier/);
});

test('avertissements : R7 (grades seuls, grades et effet), R7c, module à acheter, épingle d’un autre type (R3f) ; sans doublon', () => {
  const r = t2();
  const base = r.parts[0].stops[0].tasks[0];
  const r7 = { rule: 'R7', loses: 'grades et effet', current: { blueprint: 'FSD_FastBoot', blueprintLabel: 'Démarrage rapide', grade: 5, experimental: 'special_fsd_cooled', experimentalLabel: 'Refroidi', engineerName: 'Elvira Martuuk' } };
  const fsdTask = { ...base, slot: 'std-fsd', labels: FSD, warnings: [r7, { rule: 'R7c', from: 'a', fromLabel: 'Refroidi', to: 'b', toLabel: 'Gestionnaire de masse' }, { rule: 'newModule', module: 'int_hyperdrive_size5_class5', moduleLabel: '5A Réacteur FSD' }, { rule: 'R3f', engineer: LEI, pinGrp: 'sg', pinGroupLabel: 'Générateur de bouclier' }] };
  const lines = warningLines([fsdTask, { ...fsdTask, kind: 'effet' }], { result: r, names });
  assert.deepEqual(lines.map((l) => l.text), [
    '⚠ 5A Réacteur FSD (Krait) : ce module porte « Démarrage rapide » G5 et l’effet « Refroidi » (Elvira Martuuk) : la première application de « Portée augmentée » efface ses grades et son effet, sans retour.',
    '5A Réacteur FSD (Krait) : « Refroidi » sera remplacé par « Gestionnaire de masse » (à vérifier).',
    'Il te faut d’abord ce module : 5A Réacteur FSD (pas encore monté, plan « Krait »).',
    'Ton épingle chez Lei Cheung (Générateur de bouclier) ne compte pas pour 5A Réacteur FSD (Krait) : pour un autre type de module, ce n’est pas vérifié.',
  ], 'un avertissement par module, même s’il porte deux tâches');
  const gradesOnly = warningLines([{ ...fsdTask, warnings: [{ rule: 'R7', current: { blueprintLabel: 'Démarrage rapide', grade: 3, experimental: null, engineerName: null } }] }], { result: r, names });
  assert.equal(gradesOnly[0].text, '⚠ 5A Réacteur FSD (Krait) : ce module porte « Démarrage rapide » G3 : la première application de « Portée augmentée » efface ses grades, sans retour.');
  assert.equal(gradesOnly[0].tone, 'bad');
});

test('vaisseau à amener : un seul ; deux vaisseaux, tout rentre ; seconde visite ; pas de chantier naval (journaux de référence)', () => {
  const r = t2();
  const s = r.parts[0].stops[0];
  assert.deepEqual(vehicleLines(s, { result: r }), [{ tone: null, text: 'À amener : ton Krait Mk II (plan « Krait »).' }]);
  const plans = [...r.plans, { id: 7, name: 'Python', model: 'Python', shipId: 2, shipType: 'python' }];
  const two = { ...r, plans };
  const tasks = [{ planId: 6, slot: 'std-fsd', labels: FSD }, { planId: 7, slot: 'std-t', labels: T }];
  const fit = { ...s, tasks, bring: [{ planId: 6, slots: ['std-fsd'] }, { planId: 7, slots: ['std-t'] }], vehicle: { planId: 7, shipId: 2, shipType: 'python' }, transfers: [{ planId: 6, slot: 'std-fsd', item: 'int_hyperdrive_size5_class5', to: 'std-fsd', toLabel: 'Réacteur FSD, taille 5' }], revisits: [] };
  assert.deepEqual(vehicleLines(fit, { result: two }).map((l) => l.text), [
    'À amener : ton Python (plan « Python »).',
    'Avec 5A Réacteur FSD du Krait Mk II (plan « Krait ») monté dessus à la place du sien (Réacteur FSD, taille 5) : il y rentre. Pour le déplacer, entrepose-le depuis le Krait Mk II dans une station avec équipement, puis récupère-le sur le Python (ou fais-le transférer : le jeu donne le prix et le délai).',
    NO_SHIPYARD,
  ]);
  const no = { ...fit, transfers: [], revisits: [{ planId: 6, shipType: 'krait_mkii', slots: ['std-fsd'], why: 'trop petit', extraW: 297.41 }] };
  const lines = vehicleLines(no, { result: two });
  assert.equal(lines[1].text, '⚠ 5A Réacteur FSD du Krait Mk II ne rentre pas sur le Python (emplacement trop petit) : il faudra revenir ici avec le Krait Mk II (seconde visite comptée : +297,4 al-éq.).');
  assert.equal(lines[1].tone, 'warn');
  assert.match(vehicleLines({ ...no, revisits: [{ ...no.revisits[0], why: 'masse' }] }, { result: two })[1].text, /\(trop lourd pour lui\)/);
  assert.match(vehicleLines({ ...no, revisits: [{ ...no.revisits[0], why: 'réservé' }] }, { result: two })[1].text, /\(compartiment réservé\)/);
  assert.match(NO_SHIPYARD, /journaux de référence/);
});

test('rang, ordre conseillé, matériaux de l’escale', () => {
  const r = t2();
  const s = r.parts[0].stops[0];
  assert.equal(rankLine(s), null, 'rang 5, rien en plus');
  assert.equal(stopOrderText(s), null);
  const up = { ...s, rank: { from: 3, to: 5, extraRolls: 10, status: 'à vérifier', order: [{ task: '6/std-t:grades', grade: 1, rank: 3, count: 3 }, { up: { from: 3, to: 4 } }, { task: '6/std-t:grades', grade: 2, rank: 4, count: 3 }] } };
  assert.equal(rankLine(up), 'Rang 3 → 5 : 10 applications en plus.');
  assert.equal(rankLine({ ...up, rank: { ...up.rank, to: 3, extraRolls: 1 } }), 'Rang 3 : 1 application en plus.');
  assert.equal(stopOrderText(up), 'Ordre conseillé : 6A Propulseurs : G1 ×3 → rang 4 → G2 ×3');
  assert.deepEqual(materialsLine(s, { missing: { 1: [] } }), { tone: 'good', text: 'Matériaux ici : tout est là ✓' });
  const many = [{ key: 'a', label: 'Arsenic' }, { key: 'b', label: 'Bore' }, { key: 'c', label: 'Carbone' }, { key: 'd', label: 'Chrome' }, { key: 'e', label: 'Étain' }, { key: 'f', label: 'Fer' }].map((m) => ({ ...m, need: 3, ownedBefore: 0, missing: 3 }));
  const ms = { ...s, materials: many };
  assert.deepEqual(materialsLine(ms, { missing: { 1: many.map((m) => ({ key: m.key, missing: m.missing })) } }), { tone: 'bad', text: 'Il te manquera 6 matériaux : Arsenic −3, Bore −3, Carbone −3, Chrome −3 et 2 autres' });
  // Sans état en direct : les manques du calcul
  assert.equal(materialsLine({ ...ms, materials: many.slice(0, 1) }, {}).text, 'Il te manquera 1 matériau : Arsenic −3');
  assert.equal(materialsLine({ ...s, materials: [] }, {}), null, 'effet seul ou déblocage : rien');
});

test('déblocage : découverte (référence, escale), invitation (Acquainted), objets (jamais ✓ pour des primes), permis', () => {
  const unlock = {
    progress: 'absent', totalSteps: 4,
    steps: [
      { kind: 'decouverte', text: 'Référence de Selene Jean.', parent: { id: SELENE, name: 'Selene Jean', progress: 'Unlocked', rank: 2, region: 'Bulle', stop: 1 }, check: { state: 'manque', note: null } },
      { kind: 'invitation', text: 'Rang commercial « Merchant ».', acquainted: true, check: { state: 'inconnu', note: 'l’app ne le voit pas' } },
      { kind: 'deblocage', text: '50 Brandy lavien', items: [
        { en: 'Lavian Brandy', fr: 'Brandy lavien', label: 'Brandy lavien', type: 'marchandise', qty: 50, check: { state: 'manque', count: 12, need: 50, note: null } },
        { en: 'Bounty Vouchers', fr: null, label: 'Bounty Vouchers', type: 'primes', qty: null, credits: [100000], check: { state: 'inconnu', count: null, need: 100000, note: 'x' } },
      ] },
      { kind: 'permis', name: 'Founders World', condition: 'rang Elite', check: { state: 'manque' } },
    ],
  };
  const lines = unlockLines(unlock, { names, home: 'Bulle' });
  assert.deepEqual(lines.map((l) => l.text), [
    'Le connaître : référence de Selene Jean (débloqué, rang 2 ; dans ta région) — c’est l’escale 1',
    'Être invité : Rang commercial « Merchant ». (l’app ne le voit pas). Si tu es déjà invité, va directement le débloquer.',
    'Le débloquer à sa base :',
    'Obtenir le permis de Founders World : rang Elite',
  ]);
  assert.deepEqual(lines[2].items.map((x) => [x.text, x.tone]), [
    ['Brandy lavien ×50 → en soute : 12 / 50', 'bad'],
    [`primes (« Bounty Vouchers ») pour 100${NNBSP}000 Cr → l’app ne voit pas tes primes en attente : vérifie-les dans le jeu`, 'warn'],
  ]);
  // Parrain dans l'autre région (joueur de Colonia, Elvira dans la Bulle), sans escale
  const far = unlockLines({ steps: [{ kind: 'decouverte', text: 'Référence d’Elvira Martuuk.', parent: { id: ELVIRA, name: 'Elvira Martuuk', progress: 'Unlocked', rank: 2, region: 'Bulle', stop: null }, check: { state: 'manque', note: null } }] }, { names, home: 'Colonia' });
  assert.equal(far[0].text, 'Le connaître : référence d’Elvira Martuuk (débloqué, rang 2 ; dans la Bulle)');
  // Connu du public : pas de parrain, la note du serveur
  const pub = unlockLines({ steps: [{ kind: 'decouverte', text: 'Connu du public.', parent: null, check: { state: 'ok', note: 'connu du public : il devrait apparaître au prochain chargement' } }] }, { names, home: 'Bulle' });
  assert.deepEqual([pub[0].text, pub[0].note], ['Le connaître : Connu du public.', 'connu du public : il devrait apparaître au prochain chargement']);
  assert.match(unlockLines({ steps: [{ kind: 'invitation', text: 'Rang « Dangerous ».', check: {} }] }, {})[0].text, /^Être invité : Rang « Dangerous ». \(l’app ne le voit pas\)$/);
  assert.deepEqual(unlockLines(null), []);
});

test('fichiers mis de côté, non relus, plus récents', () => {
  assert.equal(storeWarningText({ file: 'des épingles', kind: 'mis de côté', aside: 'engineering-pins.json.illisible-2026-11-09' }), 'Ton fichier des épingles était illisible : il a été mis de côté (engineering-pins.json.illisible-2026-11-09). Tes saisies sont à refaire ; les épingles déduites de tes journaux restent.');
  assert.equal(storeWarningText({ file: 'de l’itinéraire', kind: 'mis de côté', aside: 'engineering-route.json.illisible-x' }), 'Ton fichier de l’itinéraire était illisible : il a été mis de côté (engineering-route.json.illisible-x).');
  assert.match(storeWarningText({ file: 'des plans validés', kind: 'non lu', code: 'EBUSY' }), /n’a pas pu être relu \(EBUSY\)/);
  assert.equal(storeWarningText({ file: 'des épingles', kind: 'plus récent' }), 'Le fichier des épingles vient d’une version plus récente de l’app : il n’est ni lu ni écrasé.');
});

test('« Pourquoi lui ? » (T2) : plusieurs candidats, l’autre région toujours dite, effet grâce à R5, sans lui, coût du choix', () => {
  const r = t2();
  const s = r.parts[0].stops[0];
  const w = whyText(s, { result: r, names, engs });
  assert.equal(w.title, 'Pourquoi Professor Palin ?');
  assert.deepEqual(w.units[0].lines, ['Dans la Bulle, Professor Palin et Chloe Sedesi montent « Propulseurs bricolés » au G5 ; Chloe Sedesi est à 778,9 al de plus.']);
  assert.deepEqual(w.units[0].options, [
    'Chloe Sedesi (Shenve) : environ +707,7 al-éq.',
    `Mel Brandon : écarté, il est à Colonia (22${NNBSP}014 al) : jamais pour un travail possible ici.`,
    'Felicity Farseer ne monte ce plan qu’au G3.',
    'Elvira Martuuk ne monte ce plan qu’au G2.',
  ]);
  assert.deepEqual(w.units[1].lines, ['Il peut aussi poser « Gestionnaire de masse » sur ton 5A Réacteur FSD : il propose « Portée augmentée » jusqu’au G3, et pour un effet le grade ne compte pas (à vérifier : signalé par un joueur le 8 nov.).']);
  assert.deepEqual(w.units[1].options, ['… et 2 autres options.']);
  assert.equal(w.without, 'Sans Professor Palin : Chloe Sedesi, +707,7 al-éq. (trajet +778,9 al, supercroisière −71,2, +0 escale, +0 application).');
  assert.equal(w.cost, 'Ce choix coûte : +98,0 al, ni déblocage, ni montée de rang.');
  assert.equal(w.locked, null);
  assert.equal(whyText({ ...s, why: null }, { result: r, names, engs }), null);
});

test('« Pourquoi lui ? » : seul, verrouillé seul possible (Lei plutôt que Mel), sans lui (traversée, personne), effet sans R5b, référence', () => {
  const r = t2();
  const base = r.parts[0].stops[0];
  const lei = {
    ...base, engineer: LEI, legAl: 118.18, unlock: { totalSteps: 2, steps: [] }, rank: { from: 1, to: 5, extraRolls: 10 },
    tasks: [{ ...base.tasks[0], id: '6/std-s:grades', labels: labels('5A Générateur de bouclier', 'Renforcé'), grades: [1, 2, 3, 4, 5] }, { ...base.tasks[1], id: '6/std-s:effet', rules: [], maxGrade: 5, labels: labels('5A Générateur de bouclier', 'Renforcé', 'Allégé'), fallback: null, variant: null }],
    why: {
      units: [
        { id: '6/std-s:grades', kind: 'grades', others: [{ engineer: MEL, region: 'Colonia', maxGrade: 5, verdict: 'autre-region', fromYouAl: 22013.55 }, { engineer: DIDI, region: 'Bulle', maxGrade: 3, verdict: 'grade-max' }], more: 0 },
        { id: '6/std-s:effet', kind: 'effet', others: [{ engineer: DIDI, verdict: 'verrouille', steps: 4, crossing: true }, { engineer: ELVIRA, verdict: 'ecarte' }, { engineer: CHLOE, verdict: 'banni' }, { engineer: FEL, verdict: 'rang', rank: 3, extraRolls: 6 }, { engineer: SELENE, verdict: 'permis' }, { engineer: PALIN, verdict: 'deja-escale', addedW: 0, addedAl: 0 }], more: 0 },
      ],
      without: { feasible: false, crossing: true },
    },
  };
  const e = new Map([...engs, [SELENE, row(SELENE, { permit: { required: true, name: 'Witch Head' } })]]);
  const w = whyText(lei, { result: r, names, engs: e });
  assert.deepEqual(w.units[0].lines, ['Dans la Bulle, seul Lei Cheung monte « Renforcé » (5A Générateur de bouclier) au G5.']);
  assert.equal(w.locked, `Il n’est pas encore débloqué : je te propose de le débloquer. Mel Brandon fait aussi ce plan au G5, mais à Colonia (22${NNBSP}014 al) : je ne t’envoie pas à Colonia pour ce qu’un ingénieur de la Bulle peut faire.`);
  assert.deepEqual(w.units[1].lines, ['Il pose aussi « Allégé » sur ton 5A Générateur de bouclier : il propose « Renforcé » jusqu’au G5.']);
  assert.deepEqual(w.units[1].options, [
    'Didi Vatermann : pas encore débloqué (il te reste 4 étapes, dont une traversée pour sa référence).',
    'Elvira Martuuk : tu l’as écarté.',
    'Chloe Sedesi : banni.',
    'Felicity Farseer : rang 3, la montée coûterait 6 applications de plus.',
    'Selene Jean : permis de Witch Head à obtenir.',
    'Professor Palin est déjà une escale.',
  ]);
  assert.equal(w.without, 'Sans Lei Cheung, il faudrait traverser jusqu’à Colonia.');
  assert.equal(w.cost, 'Ce choix coûte : +118,2 al, et son déblocage (2 étapes) et 10 applications en plus pour son rang.');
  assert.equal(whyText({ ...lei, why: { ...lei.why, without: { feasible: false, crossing: false } } }, { result: r, names, engs: e }).without, 'Sans Lei Cheung, personne ne le fait.');
  // Sans lui, possible au prix d'un déblocage de plus et d'une traversée pour une référence
  const wb = whyText({ ...base, why: { ...base.why, without: { feasible: true, crossing: true, dUnlocks: 1, dW: -12.5, dPathAl: -30, dStops: 1, dSupercruiseAl: 4, dRolls: -2, replacedBy: [] } } }, { result: r, names, engs });
  assert.equal(wb.without, 'Sans Professor Palin : les autres escales, −12,5 al-éq. (trajet −30,0 al, supercroisière +4,0, +1 escale, −2 applications), et 1 déblocage de plus, avec une traversée pour une référence.');
  // Escale déjà prévue (0 al)
  assert.match(whyText({ ...base, legAl: 0 }, { result: r, names, engs }).cost, /^Ce choix coûte : 0 al de plus \(escale déjà prévue\)/);
  // Référence
  const sel = { ...base, engineer: SELENE, tasks: [{ id: `ref:${DIDI}`, kind: 'reference', for: DIDI, climb: null, rules: ['R14'] }], why: { units: [], without: null } };
  assert.deepEqual(whyText(sel, { result: r, names, engs }).units[0].lines, ['Selene Jean est là pour la référence : au rang 3 et à la moitié de la barre vers le rang 4, il te fait connaître Didi Vatermann.']);
});

test('« Pourquoi lui ? » : épingle partielle (les G1 à G3 à distance), épingle non utilisée sous le rang 5 (écart en applications)', () => {
  const r = t2();
  const base = r.parts[0].stops[0];
  const task = { ...base.tasks[0], id: '6/std-fsd:grades', labels: FSD, grades: [4, 5], afterRemote: { engineer: PALIN, upTo: 3 } };
  const split = { ...base, engineer: ELVIRA, tasks: [task], why: { units: [{ id: task.id, kind: 'grades', others: [{ engineer: FEL, verdict: 'plus-loin', addedW: 24.24, addedAl: 30 }], more: 0 }], without: null } };
  const r13 = { ...r, remote: [{ ...r.remote[0], id: task.id, engineer: PALIN, grades: [1, 2, 3], upTo: 3, split: true }] };
  const w = whyText(split, { result: r13, names, engs });
  assert.equal(w.units[0].lines[1], 'Les G1 à G3 se font à distance chez Professor Palin, grâce à ton épingle : ici, il ne reste que G4 à G5.');
  const last = whyText({ ...split, tasks: [{ ...task, grades: [5], afterRemote: { engineer: PALIN, upTo: 4 } }] }, { result: { ...r13, remote: [{ ...r13.remote[0], grades: [4] }] }, names, engs });
  assert.equal(last.units[0].lines[1], 'Le G4 se fait à distance chez Professor Palin, grâce à ton épingle : ici, il ne reste que le G5.');
  // T13b : Elvira au rang 3 garde tout, l'épingle de Palin aurait coûté plus d'applications
  const all = { ...split, tasks: [{ ...task, grades: [1, 2, 3, 4, 5], afterRemote: undefined }], why: { units: [{ id: task.id, kind: 'grades', others: [], more: 0, pinSkipped: { engineer: PALIN, from: 1, upTo: 3, extraRolls: 4 } }], without: null } };
  assert.equal(whyText(all, { result: r, names, engs }).units[0].lines[1], 'Ton épingle chez Professor Palin permettrait les G1 à G3 à distance, mais ici ils servent à la montée d’Elvira Martuuk : les faire à distance coûterait 4 applications de plus.');
});

test('options écartées : chaque verdict en une phrase', () => {
  const o = (verdict, extra = {}) => optionText({ engineer: FEL, verdict, ...extra }, { names, engs });
  assert.equal(o('plus-loin', { addedW: 83.06 }), 'Felicity Farseer (Deciat) : environ +83,1 al-éq.');
  assert.equal(o('deja-escale'), 'Felicity Farseer est déjà une escale.');
  assert.equal(o('verrouille', { steps: 1, crossing: false }), 'Felicity Farseer : pas encore débloqué (il te reste 1 étape).');
  assert.equal(o('grade-max', { maxGrade: 3 }), 'Felicity Farseer ne monte ce plan qu’au G3.');
  assert.equal(o('rang', { rank: 2, extraRolls: 1 }), 'Felicity Farseer : rang 2, la montée coûterait 1 application de plus.');
  assert.equal(o('autre-region', { region: 'Bulle', fromYouAl: 21979 }), `Felicity Farseer : écarté, il est dans la Bulle (21${NNBSP}979 al) : jamais pour un travail possible ici.`);
  assert.equal(o('ecarte'), 'Felicity Farseer : tu l’as écarté.');
  assert.equal(o('banni'), 'Felicity Farseer : banni.');
  assert.equal(o('permis'), 'Felicity Farseer : permis de son système à obtenir.');
});

test('badges des règles : rien pour une règle mesurée ou de l’app ; « R5b · à vérifier », signalée par un joueur ; « publiée »', () => {
  assert.equal(ruleBadge('R3c', rules), null);
  assert.equal(ruleBadge('R11', rules), null, 'règle de l’app : pas de statut');
  assert.equal(ruleBadge('R99', rules), null);
  const b = ruleBadge('R5b', rules);
  assert.equal(b.label, 'R5b · à vérifier');
  assert.equal(b.className, 'pill pill-warn');
  assert.match(b.help, /^R5b : Un ingénieur qui propose ce plan peut poser l’effet même au-dessus de son grade maximal\. Signalé par un joueur le 8 nov\. 2026\. À vérifier\. Aucun cas vu\./);
  const p = ruleBadge('R2a', rules);
  assert.deepEqual([p.label, p.className], ['R2a · publiée', 'pill pill-info']);
  assert.doesNotMatch(p.help, /Signalé par un joueur/);
  assert.deepEqual(ruleBadges(['R3c', 'R5b', 'R5b', 'R2a'], rules).map((x) => x.id), ['R5b', 'R2a']);
});

test('bloc « Valider ce plan » : pas validé, juste après le clic (calculé, position inconnue, erreur), validé, modifié depuis', () => {
  const at = '2026-11-09T10:12:00.000Z';
  const none = validationText(null);
  assert.equal(none.state, 'aucune');
  assert.deepEqual(none.lines.map((l) => l.text), ['Itinéraire : ce plan n’est pas validé.', 'Valide-le quand il est prêt : je calcule alors l’itinéraire depuis ta position, et la fiche chez l’ingénieur suivra ce plan.']);
  assert.deepEqual(none.buttons, ['Valider ce plan']);
  const v = { at, stale: false, changes: [], bound: true, ship: 'ok' };
  const done = validationText(v, { calc: { modulesTotal: 5, modulesDone: 2 } });
  assert.deepEqual(done.lines.map((l) => l.text), ['✓ Validé le 9 nov. à 11:12 · 3 modules à faire, 2 faits']);
  assert.deepEqual(done.buttons, ['Annuler la validation']);
  assert.equal(done.link, true);
  assert.equal(validationText(v, { calc: { modulesTotal: 1, modulesDone: 1 } }).lines[0].text, '✓ Validé le 9 nov. à 11:12 · 0 module à faire, 1 fait');
  assert.equal(validationText(v, { route: { computed: true, system: 'Muang', stops: 2, totalAl: 334.62 } }).lines[0].text, '✓ Validé · itinéraire calculé depuis Muang : 2 escales, 334,6 al.');
  assert.equal(validationText(v, { route: { computed: false, reason: 'position inconnue' } }).lines[0].text, '✓ Validé. Ta position n’est pas connue (aucun saut ni arrivée dans tes journaux) : choisis un point de départ dans l’onglet Itinéraire.');
  assert.equal(validationText(v, { route: { computed: false, reason: 'erreur', message: 'Le fichier de l’itinéraire n’a pas pu être relu (EBUSY).' } }).lines[0].text, '✓ Validé. L’itinéraire n’a pas pu être calculé : Le fichier de l’itinéraire n’a pas pu être relu (EBUSY).');
  const stale = validationText({ ...v, stale: true, changes: [{ slot: 'std-fsd', label: 'Réacteur FSD', from: { module: 'm', blueprint: 'FSD_LongRange', blueprintLabel: 'Portée augmentée', grade: 5, experimental: null }, to: { module: 'm', blueprint: 'FSD_LongRange', blueprintLabel: 'Portée augmentée', grade: 4, experimental: null } }] });
  assert.equal(stale.state, 'modifie');
  assert.deepEqual(stale.lines.map((l) => l.text), ['⚠ Modifié depuis la validation du 9 nov. à 11:12 :']);
  assert.deepEqual(stale.changes, ['Réacteur FSD : G5 → G4']);
  assert.equal(stale.after, 'L’itinéraire et la fiche chez l’ingénieur ne prennent plus ce plan en compte tant que tu ne l’as pas revalidé.');
  assert.deepEqual(stale.buttons, ['Revalider avec ces changements', 'Annuler la validation']);
  assert.deepEqual(validationText({ ...v, bound: false, ship: null }).notes.map((n) => n.text), ['Ce plan n’est rattaché à aucun de tes vaisseaux : la fiche chez l’ingénieur te demandera quel vaisseau porte ses modules.']);
  assert.deepEqual(validationText({ ...v, ship: 'remplace' }).notes.map((n) => n.text), ['Le vaisseau de ce plan a été vendu : son numéro sert maintenant à un autre vaisseau. L’état de ses modules n’est plus connu.']);
});

test('changements depuis la validation, en mots ; pastilles « validé »', () => {
  const t = (over = {}) => ({ module: 'm', moduleLabel: '5A Réacteur FSD', blueprint: 'FSD_LongRange', blueprintLabel: 'Portée augmentée', grade: 5, experimental: 'special_fsd_heavy', experimentalLabel: 'Gestionnaire de masse', ...over });
  assert.equal(changeLine({ label: 'Réacteur FSD', from: t(), to: t({ blueprint: 'FSD_FastBoot', blueprintLabel: 'Démarrage rapide' }) }), 'Réacteur FSD : Portée augmentée → Démarrage rapide');
  assert.equal(changeLine({ label: 'Réacteur FSD', from: t(), to: t({ experimental: 'special_fsd_cooled', experimentalLabel: 'Refroidi' }) }), 'Réacteur FSD : effet Gestionnaire de masse → Refroidi');
  assert.equal(changeLine({ label: 'Réacteur FSD', from: t(), to: t({ experimental: null, experimentalLabel: null }) }), 'Réacteur FSD : effet Gestionnaire de masse → aucun');
  assert.equal(changeLine({ label: 'Réacteur FSD', from: t(), to: t({ module: 'n', moduleLabel: '6A Réacteur FSD', grade: 3 }) }), 'Réacteur FSD : 5A Réacteur FSD → 6A Réacteur FSD, G5 → G3');
  assert.equal(changeLine({ label: 'Propulseurs', from: null, to: t({ blueprintLabel: 'Propulseurs bricolés', experimental: null }) }), 'Propulseurs : (rien) → Propulseurs bricolés G5');
  assert.equal(changeLine({ label: 'Réacteur FSD', from: t(), to: null }), 'Réacteur FSD : Portée augmentée G5 + effet Gestionnaire de masse → (rien)');
  // Sans libellés (données de référence absentes) : les clés
  assert.equal(changeLine({ label: 'std-fsd', from: { module: 'm', blueprint: 'FSD_LongRange', grade: 5, experimental: null }, to: { module: 'm', blueprint: 'FSD_LongRange', grade: 4, experimental: null } }), 'std-fsd : G5 → G4');
  assert.deepEqual(validationPill({ stale: false }), { label: 'validé', className: 'pill pill-good' });
  assert.deepEqual(validationPill({ stale: true }), { label: 'validé · modifié depuis', className: 'pill pill-warn' });
  assert.equal(validationPill(null), null);
});
