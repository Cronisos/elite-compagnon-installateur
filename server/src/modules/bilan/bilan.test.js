// Bilans de session (state.js) : sessions reconstruites depuis le journal, gains, taux, modes, comparaison.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ABANDON_MS, Bilans, abandonnee, bilan, comparaison } from './state.js';

const T = (h, m = 0) => new Date(Date.UTC(2026, 10, 10, h, m)).toISOString();
const grades = { iron: 1, imperialshielding: 5 };

function rejouer(evs, reperes = []) {
  const b = new Bilans((k) => grades[k] ?? null);
  for (const ev of evs) b.apply(ev);
  b.placerModes(reperes);
  return b;
}

const soiree = [
  { event: 'LoadGame', timestamp: T(20), Credits: 1_000_000, Ship_Localised: 'Type-11 Prospector' },
  { event: 'Powerplay', timestamp: T(20), Merits: 100 },
  { event: 'FSDJump', timestamp: T(20, 10), JumpDist: 12.5 },
  { event: 'MaterialCollected', timestamp: T(20, 20), Name: 'iron', Count: 3 },
  { event: 'MaterialCollected', timestamp: T(20, 21), Name: 'ImperialShielding', Count: 1 },
  { event: 'PowerplayMerits', timestamp: T(20, 30), MeritsGained: 60, TotalMerits: 160 },
  { event: 'PowerplayMerits', timestamp: T(20, 30), MeritsGained: 60, TotalMerits: 220 }, // doublon du jeu…
  { event: 'PowerplayMerits', timestamp: T(20, 31), MeritsGained: 10, TotalMerits: 170 }, // …retiré ici
  { event: 'RedeemVoucher', timestamp: T(21), Type: 'bounty', Amount: 500_000 },
  { event: 'RedeemVoucher', timestamp: T(21), Type: 'CombatBond', Amount: 20_000 },
  { event: 'Died', timestamp: T(21, 30) },
  { event: 'Shutdown', timestamp: T(22) },
  { event: 'LoadGame', timestamp: T(23), Credits: 4_000_000, Ship: 'cutter' },
];

test('session : du chargement à la fermeture, gains, mérites sans doublon, matériaux par grade, morts, sauts, primes', () => {
  const b = rejouer(soiree);
  assert.equal(b.sessions.length, 2);
  const s = bilan(b.sessions[0]);
  assert.equal(s.duree, 2 * 3_600_000);
  assert.equal(s.gain, 3_000_000, 'solde au chargement suivant');
  assert.equal(s.gainHeure, 1_500_000);
  assert.equal(s.merites, 70);
  assert.equal(s.meritesHeure, 35);
  assert.deepEqual(s.materiaux, [3, 0, 0, 0, 1]);
  assert.deepEqual([s.morts, s.sauts, s.distance, s.primes, s.obligations], [1, 1, 12.5, 500_000, 20_000]);
  assert.deepEqual(s.vaisseaux, ['Type-11 Prospector']);
  assert.equal(s.termine, true);
});

test('session en cours : solde en direct, fin à maintenant ; modes et leur durée', () => {
  const b = rejouer([...soiree, { event: 'FSDJump', timestamp: T(24), JumpDist: 1 }], [{ at: T(23, 5), mode: 'rescue' }, { at: T(23, 35), mode: 'combat' }, { at: T(20, 30), mode: 'shipmining' }]);
  b.solde(5_000_000);
  const s = bilan(b.courante, { enCours: true });
  assert.equal(s.enCours, true);
  assert.equal(s.gain, 1_000_000);
  assert.deepEqual(s.modes.map((m) => [m.mode, m.duree / 60_000]), [['rescue', 30], ['combat', 25]]);
  assert.deepEqual(bilan(b.sessions[0]).modes.map((m) => m.mode), ['shipmining']);
});

test('comparaison : médianes (un gros achat ne fausse rien) et records des sessions d’au moins 10 min', () => {
  const h = 3_600_000;
  const c = comparaison([
    { duree: h, gainHeure: 100, meritesHeure: 10 }, { duree: h, gainHeure: 300, meritesHeure: null },
    { duree: h, gainHeure: -900_000_000, meritesHeure: 20 }, { duree: 60_000, gainHeure: 9999, meritesHeure: 9999 },
  ]);
  assert.deepEqual(c, { sessions: 3, gainHeure: 100, meritesHeure: 15, recordGainHeure: 300, recordMeritesHeure: 20 });
});

test('jeu planté sans Shutdown : un mode choisi le lendemain n’étire pas la session de la veille', () => {
  const plantee = [
    { event: 'LoadGame', timestamp: T(20), Credits: 1_000_000 },
    { event: 'FSDJump', timestamp: T(21), JumpDist: 10 },
    // plus rien : le jeu a planté à 21 h 05, sans Shutdown
  ];
  const lendemain = new Date(Date.UTC(2026, 10, 11, 16)).toISOString();
  const b = rejouer(plantee, [{ at: T(20, 30), mode: 'combat' }, { at: T(21, 20), mode: 'rescue' }, { at: lendemain, mode: 'shipmining' }]);
  const s = bilan(b.courante, { enCours: true });
  assert.deepEqual(s.modes.map((m) => m.mode), ['combat', 'rescue'], 'le mode du retour de pause compte, pas celui du lendemain');
  assert.equal(s.fin, T(21, 20));
  assert.equal(s.duree, 80 * 60_000, 'pas 20 h');
  assert.equal(abandonnee(b.courante, Date.parse(lendemain)), true);
  assert.equal(abandonnee(b.courante, Date.parse(T(21, 20)) + ABANDON_MS), false, 'pile au délai : encore la session');
  assert.equal(abandonnee(b.sessions[0], Number.NaN), false);
  const finie = rejouer(soiree);
  assert.equal(abandonnee(finie.sessions[0], Date.parse(lendemain)), false, 'une session terminée n’est jamais abandonnée');
});

test('minage sans saut ni matériau : la session reste vivante (signes de vie en direct, puis repères au redémarrage)', () => {
  const debut = [
    { event: 'LoadGame', timestamp: T(20), Credits: 1_000_000 },
    { event: 'FSDJump', timestamp: T(20, 10), JumpDist: 8 },
  ];
  // Un événement non compté (minage) reçu avance la fin : la session est vivante
  const mine = rejouer([...debut, { event: 'MiningRefined', timestamp: T(21, 29) }]);
  assert.equal(mine.courante.fin, T(21, 29));
  assert.equal(abandonnee(mine.courante, Date.parse(T(23))), false);
  // Status.json (signe) : la fin ne bouge pas, mais c'est un signe de vie
  const direct = rejouer(debut);
  for (let m = 20; m <= 160; m += 10) direct.signe(new Date(Date.parse(T(20)) + m * 60_000).toISOString());
  assert.equal(direct.dernierSigne(), T(22, 40));
  assert.equal(abandonnee(direct.courante, Date.parse(T(22, 45))), false, '2 h 35 après le dernier saut, mais le jeu écrit encore');
  assert.equal(abandonnee(rejouer(debut).courante, Date.parse(T(22, 45))), true, 'sans signe de vie, la même heure est un abandon');
  assert.equal(direct.courante.fin, T(20, 10), 'un signe de vie ne change pas la fin (même journal, même bilan)');
  direct.signe('pas une date');
  assert.equal(direct.dernierSigne(), T(22, 40));

  // Cas du relecteur : minage choisi à 20 h 15, commerce à 21 h 30 (75 min après le dernier saut) : les deux comptent
  const court = rejouer(debut, [{ at: T(20, 15), mode: 'shipmining', vu: T(20, 10) }, { at: T(21, 30), mode: 'commerce', vu: T(21, 29) }]);
  assert.deepEqual(bilan(court.courante, { enCours: true }).modes.map((m) => [m.mode, m.duree / 60_000]), [['shipmining', 75], ['commerce', 0]]);
  // Redémarrage après 3 h de minage : le signe de vie noté avec le repère garde le mode dans la session
  const long = [{ at: T(20, 15), mode: 'shipmining', vu: T(20, 10) }, { at: T(23, 15), mode: 'commerce', vu: T(23, 14) }];
  assert.deepEqual(rejouer(debut, long).courante.modes.map((m) => m.mode), ['shipmining', 'commerce']);
  const sansVu = long.map((r) => ({ at: r.at, mode: r.mode }));
  assert.deepEqual(rejouer(debut, sansVu).courante.modes.map((m) => m.mode), ['shipmining'], 'sans vu : 3 h sans rien');
});

test('jeu planté puis relancé : le Fileheader de la relance clôt la session, ses modes d’avant restent', () => {
  const J2 = (h, m = 0) => new Date(Date.UTC(2026, 10, 11, h, m)).toISOString();
  const b = rejouer([
    { event: 'LoadGame', timestamp: T(20), Credits: 1_000_000 },
    { event: 'FSDJump', timestamp: T(21), JumpDist: 10 },
    { event: 'Fileheader', timestamp: T(21, 30), part: 2 }, // même lancement, nouveau journal : rien ne change
    { event: 'FSDJump', timestamp: T(21, 40), JumpDist: 10 },
    // plantage à 21 h 45, sans Shutdown ; relance le lendemain
    { event: 'Fileheader', timestamp: J2(10), part: 1 },
    { event: 'FSDJump', timestamp: J2(10), JumpDist: 99 }, // ne peut plus compter pour la session de la veille
  ], [{ at: T(21, 50), mode: 'rescue' }, { at: J2(10), mode: 'combat' }]);
  const veille = b.courante;
  assert.equal(veille.interrompue, J2(10));
  assert.equal(veille.sauts, 2);
  assert.equal(veille.fin, T(21, 40));
  assert.equal(abandonnee(veille, Date.parse(T(21, 50))), false, 'avant la relance, encore vivante');
  assert.equal(abandonnee(veille, Date.parse(J2(10, 1))), true);
  const s = bilan(veille, { enCours: true });
  assert.equal(s.enCours, false, 'interrompue, pas « en cours »');
  assert.deepEqual(s.modes.map((m) => m.mode), ['rescue']);
  b.solde(9_000_000);
  assert.equal(veille.creditsFin, null, 'le solde en direct appartient à la relance');

  // Une fois la nouvelle partie chargée, le mode choisi avant la relance reste à la veille
  b.apply({ event: 'LoadGame', timestamp: J2(10, 2), Credits: 2_000_000 });
  b.placerModes([{ at: T(21, 50), mode: 'rescue' }, { at: J2(10, 5), mode: 'combat' }]);
  assert.deepEqual(b.sessions[0].modes.map((m) => m.mode), ['rescue']);
  assert.deepEqual(b.courante.modes.map((m) => m.mode), ['combat']);
  assert.equal(b.sessions[0].creditsFin, 2_000_000);
});
