// Vérifications écrites en dur sur les résultats du rejeu, en plus de la comparaison aux attendus : des valeurs connues
// d'avance (cahier des charges, mesures du joueur), qu'une regénération des attendus ne peut pas effacer par mégarde.
// Chaque vérification reçoit tout ce qui a été obtenu : { module: { séance: { mode: { point: { statut, corps } } } } }
// et rend null si tout va bien, sinon une phrase qui dit ce qui ne va pas.

const MODES = ['historique', 'direct'];
const minutes = (s) => Math.round(s / 6) / 10;

export const VERIFICATIONS = [
  {
    titre: 'Boucles de référence du cahier des charges (27-28 oct., section 6.3)',
    verifier(o) {
      const attendues = [
        { startAt: '2026-10-27T22:39:33.000Z', netGain: 74_591_507, merits: 2053, min: 14.0 }, // 23 h 39, heure de Paris
        { startAt: '2026-10-27T23:35:09.000Z', netGain: 78_548_150, merits: 2176, min: 12.7 }, // 00 h 35, soute 1 232 t
      ];
      for (const mode of MODES) {
        const r = o.routes?.['boucle-commerce-2026-10-27']?.[mode]?.['GET /loops après création'];
        if (r?.statut !== 200 || !Array.isArray(r.corps)) return `${mode} : boucles introuvables (statut ${r?.statut})`;
        for (const a of attendues) {
          const l = r.corps.find((x) => x.startAt === a.startAt);
          if (!l) return `${mode} : boucle de ${a.startAt} absente`;
          if (l.netGain !== a.netGain || l.merits !== a.merits || minutes(l.durationSec) !== a.min) {
            return `${mode} : boucle de ${a.startAt} = ${l.netGain} cr, ${l.merits} mérites, ${minutes(l.durationSec)} min (attendu ${a.netGain} cr, ${a.merits}, ${a.min} min)`;
          }
        }
      }
      return null;
    },
  },
  {
    titre: 'Vente du 31 oct. à Synuefe GA-I b57-6 : 1 184 t d’iridium miné sur place, 0 mérite, et la cause dite',
    verifier(o) {
      for (const mode of MODES) {
        const r = o.expansion?.['ventes-powerplay-2026-10-31']?.[mode]?.['GET /sales'];
        const c = r?.corps?.cases?.find((x) => x.t === '2026-10-31T23:09:03Z');
        if (!c) return `${mode} : vente de 23:09 absente`;
        if (c.count !== 1184 || c.merits !== 0 || c.system !== 'Synuefe GA-I b57-6' || !c.cause) {
          return `${mode} : ${c.count} t, ${c.merits} mérites, ${c.system}, cause ${c.cause ?? 'aucune'}`;
        }
      }
      return null;
    },
  },
  {
    titre: 'Rangs d’ingénieur (1er et 5 nov.) : G3 en 5 applications au rang 3 (exemple de l’auteur), 12 G1 au rang 2 pour monter, rang immobile à distance',
    verifier(o) {
      for (const mode of MODES) {
        const r = o.engineering?.['rangs-ingenieurs-2026-11-05']?.[mode]?.['GET /ranks']?.corps;
        if (!r?.measures) return `${mode} : mesures des rangs introuvables`;
        const cell = (rank, grade) => r.measures.find((m) => m.rank === rank && m.grade === grade);
        const g3 = cell(3, 3);
        if (g3?.rolls !== 5 || g3.places?.distance !== 5) return `${mode} : rang 3 G3 = ${g3?.rolls} applications, ${g3?.places?.distance} à distance (attendu 5 et 5)`;
        if (cell(1, 1)?.rolls !== 5 || cell(4, 4)?.rolls !== 5 || cell(4, 1)?.rolls !== 2) return `${mode} : applications par grade différentes de la table (rang 1 G1, rang 4 G4, rang 4 G1)`;
        const lei = r.sequences.find((s) => s.engineer === 'Lei Cheung' && s.rank === 2 && s.end.kind === 'montée');
        if (lei?.applications !== 12 || lei.grades?.[0]?.grade !== 1) return `${mode} : montée de Lei Cheung au rang 3 : ${lei?.applications} applications (attendu 12 G1)`;
        const broo = r.sequences.find((s) => s.engineer === 'Broo Tarquin' && s.rank === 3 && s.start.progress === 24);
        const remote = broo?.grades?.find((g) => g.grade === 3);
        if (remote?.distance !== 5 || remote.atelier !== 0 || broo.end.toRank !== 4) return `${mode} : séquence de Broo Tarquin (rang 3, 24 %) inattendue`;
        if (r.contradictions.length) return `${mode} : ${r.contradictions.length} écart(s) avec la table des règles`;
      }
      return null;
    },
  },
  {
    titre: 'Épingle déduite (5 nov.) : Broo Tarquin, « Weapon_Efficient » des lasers à rayon, G3 au rang 3, 5 applications à distance',
    verifier(o) {
      for (const mode of MODES) {
        const e = o.engineering?.['rangs-ingenieurs-2026-11-05']?.[mode]?.['GET /engineers/300030']?.corps;
        const d = e?.pin?.deduced;
        if (!d) return `${mode} : épingle de Broo Tarquin introuvable`;
        if (d.grp !== 'bl' || d.blueprint !== 'Weapon_Efficient' || !String(d.at).startsWith('2026-11-05') || d.grade !== 3 || d.rank !== 3 || d.count !== 5) {
          return `${mode} : épingle déduite ${d.grp}/${d.blueprint} le ${d.at}, G${d.grade} au rang ${d.rank}, ${d.count} applications`;
        }
        if (e.pin.effective?.source !== 'journal') return `${mode} : épingle retenue ${e.pin.effective?.source}`;
      }
      return null;
    },
  },
  {
    titre: 'Commandant anonymisé dans toutes les séances (« Testeur »)',
    verifier(o) {
      for (const [seance, modes] of Object.entries(o.coeur || {})) {
        for (const [mode, points] of Object.entries(modes)) {
          const nom = points['GET /state']?.corps?.game?.commander;
          if (nom !== 'Testeur') return `${seance} (${mode}) : commandant « ${nom === null ? 'aucun' : 'autre'} »`;
        }
      }
      return null;
    },
  },
  {
    titre: 'Aucune erreur interne (500) dans les réponses',
    verifier(o) {
      for (const [module, seances] of Object.entries(o)) {
        for (const [seance, modes] of Object.entries(seances)) {
          for (const [mode, points] of Object.entries(modes)) {
            for (const [point, r] of Object.entries(points)) if (r?.statut === 500 || r?.statut === 'injoignable') return `[${module}] ${seance} (${mode}) ${point} : ${r.statut}`;
          }
        }
      }
      return null;
    },
  },
];
