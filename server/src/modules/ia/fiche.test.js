// Fiche du joueur donnée d'office au modèle : lignes claires avec leurs unités, parties absentes sans exception.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ficheJoueur, INCONNU } from './fiche.js';
import { repondre } from './conversation.js';

const DONNEES = {
  '/api/modules/glance/summary': {
    commander: 'Testeur', credits: { balance: 916894299 }, powerplay: { power: 'Aisling Duval', rank: 171, merits: 1348195 },
    system: { name: 'Synuefe OU-E c28-2', label: 'Exploité', power: 'Aisling Duval', points: 253509, tier: 350000, next: 'Consolidé', reinforcement: 0, undermining: 15091, erosion: 13834 },
    reminders: [{ text: 'Récompense à réclamer.' }],
    merc: {}, rebuy: { mode: { group: 'GROUPE-SECRET' } },
  },
  '/api/state': { game: { ship: 'Panther Clipper Mk II', docked: true, station: 'TST-001', system: 'Synuefe OU-E c28-2', cargoCount: 0, cargo: [], loadout: { cargoCapacity: 1184, fuelMain: 58, fuelCapacity: 64, maxJumpRange: 41.29 } } },
  '/api/modules/combat/session': { startedAt: '2026-11-12T10:01:44Z', kills: 0, credits: 0, merits: { combat: 0 }, vaisseau: { coque: 92, boucliers: false, modules: [{ nom: 'FSD', sante: 99 }, { nom: 'Capteurs', sante: 98 }], sousSeuil: [], releveAt: '2026-11-12T10:01:55Z' } },
  '/api/modules/waypoints/session': { startedAt: '2026-11-11T18:01:23Z', body: 'Synuefe OU-E c28-2 10 a', ores: [{ label: 'Tritium', refined: 903 }], perHour: 383, sold: 0, unsold: 903 },
  '/api/modules/builder/fleet': [{ ship: 'Anaconda' }, { ship: 'Mandalay' }],
  '/api/etat-jeu': {
    enDirect: { at: '2026-11-12T10:21:22Z', enJeu: true, vehicule: 'vaisseau', indicateurs: ['aQuai', 'trainSorti', 'masseBloquee', 'dansVaisseau', 'modeAnalyse'], pips: { sys: 1, mot: 4, arm: 1 }, ecran: null },
    vaisseau: { coque: 92, boucliers: false, carburant: { principal: 58.45, reservoir: 0.66 }, reservoir: { principal: 64, reserve: 1.11 }, rachat: 20559981 },
    srv: null,
    position: { systeme: 'Système Test', securite: 'Sécurité élevée', factionControle: 'Faction Test' },
    rangs: { combat: { rang: 6, progression: 12 }, commerce: { rang: 13, progression: 100 }, exploration: { rang: 5 }, mercenaire: { rang: 1 }, exobiologie: { rang: 1 } },
    missions: [],
    evenements: [{ at: '2026-11-11T20:09:51Z', quoi: 'boucliers tombés' }],
  },
};

test('fiche : les faits utiles, avec leurs unités, et ce qui est inconnu', async () => {
  const f = await ficheJoueur(async (p) => DONNEES[p] ?? null);
  const nbsp = f.replace(/ | /g, ' ');
  for (const attendu of [
    'Crédits : 916 894 299 cr.',
    'rang 171, 1 348 195 mérites',
    '253 509 / 350 000 points de contrôle vers Consolidé',
    'érosion prévue au passage de jeudi : −13 834 points',
    'à quai à TST-001',
    'soute 0 t utilisées sur 1 184 t (1 184 t libres)',
    'En direct (', 'dans son vaisseau, à quai, train sorti, FSD bloqué par la masse, énergie SYS 1 / MOT 4 / ARM 1',
    'Vaisseau : coque 92 %, boucliers tombés, carburant 58,45 / 64 t, rachat 20 559 981 cr.',
    'Modules : tous à 98 % ou plus',
    'Lieu : Système Test, sécurité élevée, contrôlé par Faction Test.',
    'Rangs : combat 6/8 (12 %), commerce Élite V, exploration 5/8',
    'Missions en cours : aucune.',
    'boucliers tombés.',
    'Tritium 903 t raffinées, 383 t/h',
    'Flotte : 2 vaisseaux (Anaconda, Mandalay)',
    'Rappel : Récompense à réclamer.',
  ]) assert.ok(nbsp.includes(attendu), `manque « ${attendu} »\n${nbsp}`);
  assert.ok(f.endsWith(INCONNU));
  assert.ok(!f.includes('GROUPE-SECRET'), 'le groupe privé n’a rien à faire dans la fiche');
});

test('fiche : une partie de l’app absente ou en panne manque seulement ; rien du tout → null', async () => {
  const f = await ficheJoueur(async (p) => {
    if (p === '/api/state') throw new Error('panne');
    return p === '/api/modules/builder/fleet' ? DONNEES[p] : null;
  });
  assert.match(f, /Flotte : 2 vaisseaux/);
  assert.doesNotMatch(f, /Vaisseau actuel/);
  assert.equal(await ficheJoueur(async () => null), null);
});

test('conversation : la fiche est donnée juste avant la question ; ses chiffres ne déclenchent pas de relance', async () => {
  const vus = [];
  const r = await repondre({
    question: 'Ma coque ?',
    historique: [{ role: 'user', texte: 'Salut' }, { role: 'assistant', texte: 'Salut !' }],
    fiche: 'Fiche : coque 92 %.',
    chat: async (messages) => { vus.push(messages.map((m) => m.role)); return { message: { role: 'assistant', content: 'Ta coque est à 92 %.' } }; },
    lire: async () => null,
  });
  assert.deepEqual(r, { texte: 'Ta coque est à 92 %.', appels: [] });
  assert.deepEqual(vus, [['system', 'user', 'assistant', 'system', 'user']]);
});

test('personnalité : le texte du joueur suit les règles de base (qui passent avant) ; longueur des réponses ; réglages bornés', async () => {
  const { consigne } = await import('./conversation.js');
  const { nettoyerReglages } = await import('./reglages.js');
  const c = consigne({ nom: 'Alicia', personnalite: 'Tu es malicieuse.', longueur: 'detaillee' });
  assert.ok(c.startsWith('Tu es Alicia, l’IA de bord'));
  assert.ok(c.indexOf('Ne devine jamais un chiffre') < c.indexOf('Tu es malicieuse.'), 'les règles avant la personnalité');
  assert.match(c, /en détail/);
  assert.doesNotMatch(consigne({}), /<<</);
  const { reglages, erreurs } = nettoyerReglages({ personnalite: '  Posée.\r\nDrôle.  ', longueur: 'normale', voixVitesse: 1.25, voixHauteur: 0.8 });
  assert.deepEqual(erreurs, []);
  assert.deepEqual([reglages.personnalite, reglages.longueur, reglages.voixVitesse, reglages.voixHauteur], ['Posée.\nDrôle.', 'normale', 1.3, 0.8]);
  const mauvais = nettoyerReglages({ personnalite: 'x'.repeat(4001), longueur: 'roman', voixVitesse: 3, voixHauteur: '1' });
  assert.equal(mauvais.erreurs.length, 4);
  assert.match(mauvais.erreurs.join(' '), /de 0,6 à 1,6/);
});

test('fiche : dans le SRV, son carburant ; à pied, oxygène et santé ; jeu au menu', async () => {
  const { lignesSynthese } = await import('./fiche.js');
  const srv = lignesSynthese({ enDirect: { enJeu: true, vehicule: 'srv', indicateurs: ['dansSrv', 'pose'] }, srv: { type: 'VRS Rhino', carburant: { principal: 0.42 }, soute: [{ nom: 'Tritium', quantite: 4 }] } }).join('\n');
  assert.match(srv, /dans le SRV, posé/);
  assert.match(srv, /SRV VRS Rhino déployé, carburant du SRV 0,42 t, soute du SRV : Tritium 4\./);
  const pied = lignesSynthese({ enDirect: { enJeu: true, vehicule: 'a pied', indicateurs: ['aPied', 'oxygeneBas'], oxygene: 20, sante: 80 } }).join('\n');
  assert.match(pied, /à pied, oxygène bas, .*oxygène 20 %, santé 80 %/);
  assert.deepEqual(lignesSynthese({ enDirect: { enJeu: false, indicateurs: [] } }), ['Le jeu est au menu ou fermé (Status.json vide).']);
  assert.deepEqual(lignesSynthese(null), []);
});
