// Tutoriels interactifs : la logique, sans React (testée seule). Un parcours explique une page, étape par étape : il
// encadre un élément, dit à quoi il sert, et peut demander de cliquer dessus. Le joueur peut toujours passer une
// étape ou tout le tutoriel.
//
// Un parcours : { id, titre, chemin, sousPages?, etapes: [{ cible?, titre, texte, action? }] }
//   - chemin : la page qui le lance (« /reperes », ou un onglet : « /extension?onglet=vente ») ; sousPages : vrai
//     s'il vaut pour ce qui est DESSOUS, et seulement dessous (« /builder/build » pour « /builder/build/12 » ;
//     « /colonisation » pour la fiche « /colonisation/123 », la liste « /colonisation » ayant le sien) ;
//   - fenetre (sur une étape) : la fenêtre en jeu où chercher la cible, sur la page « Fenêtres en jeu » ;
//   - cible : sélecteur CSS de l'élément à encadrer (absent : une bulle au milieu de l'écran) ;
//   - action : « clic » (le joueur doit cliquer sur l'élément encadré) ; sinon l'étape se lit, puis « Suivant ».

export const ID_PARCOURS = /^[a-z0-9-]{1,40}$/;

const propre = (pathname) => String(pathname || '/').replace(/\/+$/, '') || '/';

/** « /extension?onglet=vente » → { base: '/extension', params } ; les paramètres désignent un onglet de la page. */
function adresse(chemin) {
  const [base, recherche = ''] = String(chemin).split('?');
  return { base: propre(base), params: [...new URLSearchParams(recherche)] };
}
const parametres = (search) => new URLSearchParams(String(search || '').replace(/^\?/, ''));

/**
 * Les onglets collent-ils ? Un parcours d'onglet (« ?onglet=vente ») ne vaut que sur cet onglet ; un parcours sans
 * onglet ne vaut que sur l'onglet par défaut de la page (adresse sans « onglet »).
 */
function memeOnglet(a, search) {
  const ici = parametres(search);
  return a.params.length ? a.params.every(([k, v]) => ici.get(k) === v) : !ici.has('onglet');
}

/** Le parcours vaut-il pour cette page (et cet onglet) ? */
export function concerne(parcours, pathname, search = '') {
  const ici = propre(pathname);
  const a = adresse(parcours.chemin);
  const page = parcours.sousPages === true ? a.base !== '/' && ici.startsWith(`${a.base}/`) : ici === a.base;
  return page && memeOnglet(a, search);
}

/** Parcours de la page affichée, du plus précis (chemin le plus long) au moins précis, dans l'ordre d'écriture à égalité. */
export function parcoursDeLaPage(liste, pathname, search = '') {
  return liste.filter((p) => concerne(p, pathname, search)).sort((a, b) => b.chemin.length - a.chemin.length);
}

/** Le premier d'entre eux, ou null. */
export function parcoursPour(liste, pathname, search = '') {
  return parcoursDeLaPage(liste, pathname, search)[0] ?? null;
}

/** Parcours à lancer de lui-même sur cette page : seulement si les tutoriels sont actifs et qu'il n'a jamais été vu. */
export function aLancer(liste, pathname, etat, search = '') {
  if (!etat || etat.actifs === false) return null;
  // Une page peut en avoir plusieurs (l'éditeur de build : composer, puis enregistrer et partager) : ils se suivent,
  // un par visite
  const tous = parcoursDeLaPage(liste, pathname, search);
  return tous.filter((p) => p.chemin === tous[0].chemin).find((p) => !(etat.vus ?? []).includes(p.id)) ?? null;
}

/**
 * Le tutoriel en cours doit-il s'arrêter parce que le joueur a quitté sa page ? Une sous-page de la sienne ne
 * l'arrête pas ; un autre onglet, si (pour un parcours d'onglet).
 */
export function horsParcours(parcours, pathname, search = '') {
  const ici = propre(pathname);
  const a = adresse(parcours.chemin);
  const dedans = ici === a.base || (a.base !== '/' && ici.startsWith(`${a.base}/`));
  if (!dedans) return true;
  return a.params.length > 0 && !memeOnglet(a, search);
}

const borne = (v, min, max) => Math.max(min, Math.min(max, v));

/**
 * Où poser la bulle : sous l'élément encadré s'il y a la place, sinon au-dessus, sinon à droite, à gauche, et en
 * dernier recours au milieu. Toujours entière dans la fenêtre. `cadre` : { x, y, l, h } ou null (pas d'élément) ;
 * `bulle` : { l, h } ; `fenetre` : { l, h }. Rend { x, y, cote }.
 */
export function placerBulle(cadre, bulle, fenetre, marge = 14) {
  const centre = { x: Math.round((fenetre.l - bulle.l) / 2), y: Math.round((fenetre.h - bulle.h) / 2), cote: 'milieu' };
  if (!cadre) return centre;
  const xCentre = borne(cadre.x + cadre.l / 2 - bulle.l / 2, marge, fenetre.l - bulle.l - marge);
  const yCentre = borne(cadre.y + cadre.h / 2 - bulle.h / 2, marge, fenetre.h - bulle.h - marge);
  const essais = [
    { cote: 'bas', x: xCentre, y: cadre.y + cadre.h + marge, ok: cadre.y + cadre.h + marge + bulle.h <= fenetre.h - marge },
    { cote: 'haut', x: xCentre, y: cadre.y - marge - bulle.h, ok: cadre.y - marge - bulle.h >= marge },
    { cote: 'droite', x: cadre.x + cadre.l + marge, y: yCentre, ok: cadre.x + cadre.l + marge + bulle.l <= fenetre.l - marge },
    { cote: 'gauche', x: cadre.x - marge - bulle.l, y: yCentre, ok: cadre.x - marge - bulle.l >= marge },
  ];
  const choix = essais.find((e) => e.ok);
  return choix ? { x: Math.round(choix.x), y: Math.round(choix.y), cote: choix.cote } : centre;
}

/** Rectangle encadré autour d'un élément (avec un peu d'air), borné à la fenêtre. */
export function cadreAutour(rect, fenetre, air = 6) {
  const x = Math.max(0, rect.left - air);
  const y = Math.max(0, rect.top - air);
  const droite = Math.min(fenetre.l, rect.right + air);
  const bas = Math.min(fenetre.h, rect.bottom + air);
  return { x: Math.round(x), y: Math.round(y), l: Math.max(0, Math.round(droite - x)), h: Math.max(0, Math.round(bas - y)) };
}

/** Les quatre voiles sombres qui entourent le cadre : l'élément encadré reste cliquable, le reste de la page non. */
export function voiles(cadre, fenetre) {
  if (!cadre) return [{ x: 0, y: 0, l: fenetre.l, h: fenetre.h }];
  return [
    { x: 0, y: 0, l: fenetre.l, h: cadre.y },
    { x: 0, y: cadre.y + cadre.h, l: fenetre.l, h: Math.max(0, fenetre.h - cadre.y - cadre.h) },
    { x: 0, y: cadre.y, l: cadre.x, h: cadre.h },
    { x: cadre.x + cadre.l, y: cadre.y, l: Math.max(0, fenetre.l - cadre.x - cadre.l), h: cadre.h },
  ];
}

/** Contrôle d'un parcours écrit à la main : liste des défauts (vide s'il est bon). */
export function defautsParcours(p) {
  const d = [];
  if (!ID_PARCOURS.test(p?.id ?? '')) d.push('identifiant');
  if (typeof p?.titre !== 'string' || !p.titre.trim()) d.push('titre');
  if (typeof p?.chemin !== 'string' || !p.chemin.startsWith('/')) d.push('chemin');
  if (!Array.isArray(p?.etapes) || p.etapes.length < 2) d.push('au moins deux étapes');
  for (const [k, e] of (p?.etapes ?? []).entries()) {
    if (typeof e.titre !== 'string' || !e.titre.trim()) d.push(`étape ${k + 1} : titre`);
    if (typeof e.texte !== 'string' || e.texte.trim().length < 20) d.push(`étape ${k + 1} : texte`);
    if (e.action !== undefined && e.action !== 'clic') d.push(`étape ${k + 1} : action`);
    if (e.action === 'clic' && !e.cible) d.push(`étape ${k + 1} : un clic demande une cible`);
    if (e.fenetre !== undefined && (typeof e.fenetre !== 'string' || !e.cible)) d.push(`étape ${k + 1} : fenêtre`);
  }
  return d;
}
