// Actions de l'IA de bord : elle se sert de l'app comme le joueur, « comme s'il avait cliqué » (l’auteur, 12 nov. 2026 : « le
// but, c'est qu'elle m'aide à utiliser l'application »). Chaque action passe par l'API locale, la même que l'interface :
// guider la boussole vers un repère, changer de mode, cacher ou réafficher l'interface, ouvrir une page. Rien qui
// efface ni qui touche au jeu : seulement ce qu'un clic dans l'app ferait, et que le joueur peut défaire d'un clic.
//
// Une action a des paramètres (format des outils d'Ollama) et reçoit `agir` (écriture sur l'API locale) en plus de `lire`.

import { MODES, windowsOf } from '../../core/modes.js';

/** Texte sans accents ni majuscules, en mots (lettres et chiffres). */
const mots = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().match(/[a-z0-9]+/g) || [];

/** Distance d'édition (fautes de frappe des repères : « Iridiul », « Iniirum », « iridim »). */
export function distance(a, b) {
  if (Math.abs(a.length - b.length) > 3) return 99;
  let prec = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const ligne = [i];
    for (let j = 1; j <= b.length; j++) ligne[j] = Math.min(prec[j] + 1, ligne[j - 1] + 1, prec[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prec = ligne;
  }
  return prec[b.length];
}

/** Un mot cherché ressemble-t-il à un mot du repère ? Exact pour les mots courts, une faute (deux au-delà de 8 lettres). */
function ressemble(cherche, mot) {
  if (cherche === mot) return true;
  if (cherche.length < 4 || mot.length < 3) return false;
  if (mot.startsWith(cherche) || cherche.startsWith(mot)) return Math.min(cherche.length, mot.length) >= 4;
  // Une faute jusqu'à 8 lettres (« iridium » / « tritium » en ont deux de différence : ce ne sont pas les mêmes)
  return distance(cherche, mot) <= (cherche.length >= 9 ? 2 : 1);
}

/** Repère, en court, pour le modèle. */
export const repereCourt = (w) => ({
  id: w.id,
  nom: w.label,
  emplacement: w.siteNumber ?? null,
  forages: w.drills ?? null,
  corps: w.body ?? null,
  systeme: w.system ?? null,
  ...(w.depletedAt ? { epuise: true } : {}),
  ...(w.unprofitable ? { pas_rentable: true } : {}),
  ...(w.notes ? { note: String(w.notes).slice(0, 80) } : {}),
  date: String(w.createdAt || '').slice(0, 10) || null,
});

/**
 * Repères qui répondent le mieux à une recherche en mots libres : chaque mot compte s'il ressemble au nom, à la note,
 * à la planète ou au système ; un nombre compte s'il est le numéro d'emplacement ou le nombre de forages. Les mots qui
 * ne ressemblent à aucun repère (« elp », « où ») ne comptent pas. Sans recherche : les plus récents.
 */
export function chercherReperes(reperes, recherche, max = 15) {
  const liste = (Array.isArray(reperes) ? reperes : []).slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const cherches = mots(recherche);
  if (!cherches.length) return liste.slice(0, max);
  const notes = liste.map((w) => {
    const texte = new Set(mots(`${w.label} ${w.notes} ${w.body} ${w.system} ${w.categoryLabel}`));
    let score = 0;
    for (const c of cherches) {
      if (/^\d+$/.test(c)) {
        if (Number(c) === w.siteNumber || Number(c) === w.drills) score += 1;
      } else if ([...texte].some((m) => !/^\d+$/.test(m) && ressemble(c, m))) score += 1;
    }
    return { w, score };
  });
  const meilleur = Math.max(0, ...notes.map((n) => n.score));
  return meilleur ? notes.filter((n) => n.score === meilleur).map((n) => n.w).slice(0, max) : [];
}

/** Plan de l'app à plat ([{ id, titre, chemin }]) pour ouvrir_page ; sans plan, l'outil n'est pas proposé. */
export async function chargerPages(importer = () => import('../../../../client/src/core/navigation.js')) {
  try {
    const { aPlat } = await importer();
    const vus = new Set();
    return aPlat().map((c) => c.at(-1)).filter((e) => e.id && e.chemin && !vus.has(e.id) && vus.add(e.id))
      .map((e) => ({ id: e.id, titre: e.titre, chemin: e.chemin }));
  } catch {
    return [];
  }
}

const parametres = (props, requis = []) => ({ type: 'object', properties: props, required: requis });

/** Ouvre le mode de jeu `mode` (null : aucun) comme le menu « Mode de jeu » : ses fenêtres, Coup d'œil gardé. */
async function ouvrirMode(mode, lire, agir) {
  const etat = await lire('/api/overlay');
  if (etat && !etat.installed) return { erreur: 'L’overlay n’est pas installé ou est coupé : aucune fenêtre ne peut s’ouvrir.' };
  const glance = Boolean(etat?.glance);
  return agir('/api/overlay', { method: 'PUT', body: { mode, glance, pages: [...(mode ? windowsOf(mode) : []), ...(glance ? ['glance'] : [])] } });
}

/** L'interface est-elle cachée par le ◆ ? Réaffichée, pour que ce qu'on vient d'ouvrir se voie. */
async function reafficher(lire, agir) {
  const b = await lire('/api/bureau');
  if (b?.cache) await agir('/api/bureau/cacher', { body: { cacher: false } });
  return Boolean(b?.cache);
}

/** Actions proposées au modèle ; `pages` : le plan de l'app (chargerPages). */
export function actions({ pages = [] } = {}) {
  const liste = [
    {
      nom: 'chercher_reperes',
      action: false,
      description: 'Cherche dans les repères enregistrés de l’app (minage au Rhino surtout : minerai, numéro d’emplacement, nombre de forages, planète, épuisé ou non). Donne leur id, pour guider_vers_repere. Mets dans « recherche » les mots du joueur (« iridium emplacement 25 3 forages »), fautes comprises ; vide : les plus récents.',
      parametres: parametres({ recherche: { type: 'string', description: 'Mots du joueur : minerai, numéros, planète…' } }),
      lire: async (lire, args) => {
        const tous = await lire('/api/modules/waypoints/waypoints');
        if (!Array.isArray(tous)) return { erreur: 'Repères illisibles : le module de minage est peut-être absent.' };
        const trouves = chercherReperes(tous, args?.recherche);
        return { total: tous.length, trouves: trouves.map(repereCourt) };
      },
    },
    {
      nom: 'guider_vers_repere',
      action: true,
      description: 'Affiche la boussole de l’app vers un repère (comme un clic sur « Guider ») : ouvre le mode Minage Rhino s’il ne l’est pas, et réaffiche l’interface si elle était cachée. Donne l’id trouvé avec chercher_reperes.',
      parametres: parametres({ id: { type: 'integer', description: 'id du repère' } }, ['id']),
      lire: async (lire, args, agir) => {
        const id = Number(args?.id);
        const tous = await lire('/api/modules/waypoints/waypoints');
        const w = Array.isArray(tous) ? tous.find((x) => x.id === id) : null;
        if (!w) return { erreur: `Aucun repère n° ${args?.id} : cherche-le d’abord avec chercher_reperes.` };
        const etat = await lire('/api/overlay');
        let modeOuvert = false;
        if (etat?.mode !== 'waypoints') {
          const r = await ouvrirMode('waypoints', lire, agir);
          if (r?.erreur) return r;
          modeOuvert = true;
        }
        const r = await agir('/api/modules/waypoints/guide-target', { method: 'PUT', body: { id } });
        if (r?.erreur) return r;
        const reaffiche = await reafficher(lire, agir);
        return { fait: true, boussole_vers: repereCourt(w), ...(modeOuvert ? { mode_ouvert: 'Minage Rhino' } : {}), ...(reaffiche ? { interface_reaffichee: true } : {}) };
      },
    },
    {
      nom: 'arreter_guidage',
      action: true,
      description: 'Arrête la boussole (plus aucun repère suivi).',
      parametres: parametres({}),
      lire: async (lire, args, agir) => {
        const r = await agir('/api/modules/waypoints/guide-target', { method: 'PUT', body: { id: null } });
        return r?.erreur ? r : { fait: true };
      },
    },
    {
      nom: 'changer_mode',
      action: true,
      description: `Lance un mode de jeu de l’app, comme le menu « Mode de jeu » : ouvre ses fenêtres en jeu. Modes : ${MODES.map((m) => `${m.id} (${m.label})`).join(', ')}, aucun (ferme les fenêtres du mode).`,
      parametres: parametres({ mode: { type: 'string', enum: [...MODES.map((m) => m.id), 'aucun'] } }, ['mode']),
      lire: async (lire, args, agir) => {
        const id = args?.mode === 'aucun' ? null : args?.mode;
        const m = MODES.find((x) => x.id === id);
        if (id !== null && !m) return { erreur: `Mode inconnu : ${args?.mode}.` };
        const r = await ouvrirMode(id, lire, agir);
        if (r?.erreur) return r;
        const reaffiche = await reafficher(lire, agir);
        return { fait: true, mode: m ? m.label : 'aucun', ...(reaffiche ? { interface_reaffichee: true } : {}) };
      },
    },
    {
      nom: 'interface',
      action: true,
      description: 'Cache toute l’interface de l’app (fenêtres et fenêtres en jeu, comme le bouton ◆), ou la réaffiche.',
      parametres: parametres({ action: { type: 'string', enum: ['cacher', 'afficher'] } }, ['action']),
      lire: async (lire, args, agir) => {
        if (!['cacher', 'afficher'].includes(args?.action)) return { erreur: 'action : cacher ou afficher.' };
        const r = await agir('/api/bureau/cacher', { body: { cacher: args.action === 'cacher' } });
        return r?.erreur ? r : { fait: true, interface: args.action === 'cacher' ? 'cachée' : 'affichée' };
      },
    },
  ];
  if (pages.length) {
    liste.push({
      nom: 'ouvrir_page',
      action: true,
      description: `Ouvre une page de l’app dans la fenêtre principale, devant le jeu (comme un clic dans le menu). Pages (id : titre) : ${pages.map((p) => `${p.id} : ${p.titre}`).join(' ; ')}.`,
      parametres: parametres({ page: { type: 'string', enum: pages.map((p) => p.id) } }, ['page']),
      lire: async (lire, args, agir) => {
        const p = pages.find((x) => x.id === args?.page);
        if (!p) return { erreur: `Page inconnue : ${args?.page}.` };
        const r = await agir('/api/bureau/ouvrir', { body: { chemin: p.chemin } });
        return r?.erreur ? r : { fait: true, page: p.titre };
      },
    });
  }
  return liste;
}
