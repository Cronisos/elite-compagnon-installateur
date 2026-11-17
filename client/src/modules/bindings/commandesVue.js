// Mes commandes (MesCommandesPage.jsx) : recherche intelligente, classement par intention, touches en double, voisins
// dans le menu du jeu. Fonctions pures, testées par commandesVue.test.js.

import { foldText } from '../../core/text.js';

// Mots que le joueur tape, et ce qu'ils veulent dire dans les noms des commandes (sans accents, en minuscules)
export const SYNONYMES = {
  fsd: ['hyperespace', 'supercroisiere'], saut: ['hyperespace'], jump: ['hyperespace'], sc: ['supercroisiere'],
  supercruise: ['supercroisiere'], train: ['train d atterrissage'], gear: ['train d atterrissage'], atterrir: ['atterrissage', 'train'],
  gaz: ['manette des gaz', 'accelerer', 'ralentir'], vitesse: ['gaz', 'accelerer', 'ralentir'], throttle: ['manette des gaz'],
  tir: ['tir', 'tirer'], feu: ['tir', 'tirer'], fire: ['tir', 'tirer'], arme: ['arme', 'tir', 'points d emport'], hardpoints: ['points d emport'],
  bouclier: ['bouclier', 'scb'], scb: ['cellule de bouclier'], shield: ['bouclier'], chaff: ['paillettes'], ecm: ['contre-mesures'],
  heatsink: ['dissipateur'], chaleur: ['dissipateur', 'silencieux'], silent: ['silencieux'], carte: ['carte'], map: ['carte'],
  galmap: ['carte de la galaxie'], sysmap: ['carte du systeme'], panneau: ['panneau', 'focus'], panel: ['panneau'],
  photo: ['camera'], cam: ['camera'], buggy: ['vrs'], srv: ['vrs'], pied: ['a pied'], foot: ['a pied'],
  ecope: ['ecope'], scoop: ['ecope'], cargo: ['cargaison', 'ecope'], soute: ['cargaison', 'ecope'], larguer: ['larguer'],
  scanner: ['fss', 'dss', 'scanner'], honk: ['balayage de decouverte'], klaxon: ['balayage de decouverte'],
  lumiere: ['phares', 'lampe'], lights: ['phares'], lampe: ['lampe', 'phares'], nocturne: ['vision nocturne'],
  cible: ['cibler', 'contact', 'hostile'], target: ['cibler'], viser: ['viser', 'cibler'], pips: ['energie'], energie: ['energie'],
  pip: ['energie'], boost: ['boost'], fa: ['assistance de vol'], assist: ['assistance'], micro: ['micro'], vr: ['casque vr'],
  chasseur: ['chasseur'], fighter: ['chasseur'], equipage: ['equipage'], emote: ['emote'], grenade: ['grenade'],
  recharger: ['recharger'], reload: ['recharger'], sprint: ['sprint'], codex: ['codex'], hud: ['hud'], souris: ['souris'],
};

/** Forme de recherche : sans accents ni casse, apostrophe = espace (« train d'atterrissage » = « train d atterrissage »). */
const plie = (t) => foldText(t).replace(/'/g, ' ');

/** Mots d'une recherche. */
const mots = (q) => plie(q).split(/\s+/).filter(Boolean);

/** Textes où chercher pour une commande : son nom, sa section, ses touches, son nom interne. */
function champs(c, intentions) {
  return {
    nom: plie(c.nom),
    autres: plie([c.section, c.sous, intentions.get(c.intention)?.titre, c.id].filter(Boolean).join(' ')),
    touches: c.touches.map((t) => plie(t.texte)),
  };
}

/** Une lettre seule (« k ») cherche une touche, pas un bout de mot : « Clavier : Maj gauche + K ». */
const toucheExacte = (textes, mot) => textes.some((t) => t.split(/ : | \+ /).slice(1).some((x) => x === mot));

/**
 * Score d'une commande pour une recherche (0 : ne correspond pas). Chaque mot doit trouver sa place : dans le nom
 * (le mieux), par un synonyme, dans une touche, ou dans la section.
 */
export function score(c, q, intentions = new Map()) {
  const ms = mots(q);
  if (!ms.length) return 1;
  const f = champs(c, intentions);
  let total = 0;
  for (const m of ms) {
    let s = 0;
    // Une lettre seule : la touche (« k »), ou un mot du nom (le « d » de « train d'atterrissage »)
    if (m.length === 1) s = toucheExacte(f.touches, m) ? 3 : f.nom.split(/[^a-z0-9]+/).includes(m) ? 2 : 0;
    else if (f.nom.includes(m)) s = f.nom.startsWith(m) ? 6 : 5;
    else if ((SYNONYMES[m] || []).some((x) => f.nom.includes(x))) s = 4;
    else if (f.touches.some((t) => t.includes(m))) s = 3;
    else if (f.autres.includes(m)) s = 1;
    if (!s) return 0;
    total += s;
  }
  return total;
}

// --- Contextes de jeu : quand le jeu écoute-t-il une commande ? ---
// Une même touche pour deux commandes ne gêne que si le jeu les écoute EN MÊME TEMPS. Il n'écoute qu'un contexte à la
// fois : en vol, les commandes de vol ; dans le scanner FSS, celles du FSS ; dans la carte de la galaxie, celles de la
// carte… Mettre le tir principal et le zoom du FSS sur la même gâchette est donc voulu, et sans gêne. Le contexte se
// lit dans le nom que le jeu donne à la commande (fichier .binds), à défaut dans sa section du menu.
//
// Statut : déduit des noms du fichier de commandes et de l'usage du jeu, pas d'une documentation de Frontier. Le cas
// laissé en alerte exprès : le regard libre (HeadLook) partage le contexte du vol, parce que ses touches restent
// écoutées avec celles du vol quand il est actif.

/** [identifiant, nom affiché, motif du nom de la commande]. Le premier qui correspond l'emporte. */
const CONTEXTES_PAR_NOM = [
  ['vrs', 'en VRS', /_Buggy$/],
  ['a-pied', 'à pied', /_Humanoid$/],
  ['atterrissage', 'commandes d’atterrissage', /_Landing$/],
  ['fss', 'scanner FSS', /^ExplorationFSS(?!Enter$)/],
  ['dss', 'scanner de surface', /^(ExplorationSAA|SAAThirdPerson)/],
  ['equipage', 'équipage multiple', /^MultiCrew/],
  ['createur', 'création du commandant', /^CommanderCreator/],
  ['boutique', 'boutique', /^Store/],
  ['placement', 'placement d’une construction', /^(PlaceSettlement|ChangeConstruction|ExitSettlement|MovePlacementCam|PitchPlacementCamera|YawPlacementCamera|ZoomPlacementCamera)/],
  // Vues extérieures : on y choisit une caméra, on passe en caméra libre, on en sort
  ['camera-suite', 'vues extérieures', /^(VanityCamera|ToggleFreeCam$|QuitCamera$|PhotoCameraToggle$)/],
  // Caméra libre : ses déplacements ne sont écoutés qu'une fois dedans
  ['camera-libre', 'caméra libre', /^(FreeCam|MoveFreeCam|FStop|FixCamera|ToggleAdvanceMode|PitchCamera|YawCamera|RollCamera|ToggleRotationLock|ToggleReverseThrottleInputFreeCam)/],
  // À pied, roue ouverte : ses raccourcis ne sont écoutés que pendant qu'elle l'est
  ['roue', 'roue ouverte, à pied', /^Humanoid(EmoteSlot[0-9]+|UtilityWheelCycleMode|ItemWheelButton_)/],
  // À pied, outil en main (le rechargement, lui, vaut pour une arme en main)
  ['outil', 'outil en main, à pied', /^HumanoidToggleToolModeButton$/],
  ['carte', 'carte de la galaxie', /^Cam(Pitch|Yaw|Translate|Zoom)/],
];
/** Contexte par défaut de chaque section du menu Commandes. */
const CONTEXTES_PAR_SECTION = [
  [/vaisseau/i, 'vol', 'en vol'],
  [/VRS/i, 'vrs', 'en VRS'],
  [/pied/i, 'a-pied', 'à pied'],
];

/** Contexte de jeu d'une commande : { id, nom }. */
export function contexteDe(c) {
  const parNom = CONTEXTES_PAR_NOM.find(([, , motif]) => motif.test(String(c.id ?? '')));
  if (parNom) return { id: parNom[0], nom: parNom[1] };
  const parSection = CONTEXTES_PAR_SECTION.find(([motif]) => motif.test(String(c.section ?? '')));
  return parSection ? { id: parSection[1], nom: parSection[2] } : { id: 'interface', nom: 'menus et panneaux' };
}

function parCle(commandes, cleDe) {
  const par = new Map();
  for (const c of commandes) {
    if (c.genre !== 'bouton') continue;
    for (const t of c.touches) {
      const cle = cleDe(c, t);
      if (!par.has(cle)) par.set(cle, []);
      par.get(cle).push(c);
    }
  }
  return par;
}

/**
 * Touches en double qui gênent : la même touche pour deux commandes que le jeu écoute en même temps (même contexte).
 * Map clé « contexte|touche » → noms des commandes. Les axes et réglages n'y sont pas.
 */
export function doublons(commandes) {
  const par = parCle(commandes, (c, t) => `${contexteDe(c).id}|${t.texte}`);
  return new Map([...par].filter(([, cs]) => cs.length > 1).map(([cle, cs]) => [cle, cs.map((c) => c.nom)]));
}

/**
 * Touches partagées sans gêne : la même touche pour des commandes de contextes différents (le tir en vol, le zoom dans
 * le scanner FSS). Rend, pour une commande, les autres usages de ses touches : [{ nom, contexte }]. Pas une alerte.
 */
export function partagesDe(commandes, c) {
  if (c.genre !== 'bouton') return [];
  const ici = contexteDe(c).id;
  const touches = new Set(c.touches.map((t) => t.texte));
  const vus = new Set();
  const sortie = [];
  for (const autre of commandes) {
    if (autre === c || autre.genre !== 'bouton') continue;
    const ctx = contexteDe(autre);
    if (ctx.id === ici || !autre.touches.some((t) => touches.has(t.texte))) continue;
    const cle = `${autre.nom}|${ctx.id}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    sortie.push({ nom: autre.nom, contexte: ctx.nom });
  }
  return sortie;
}

/**
 * Liste filtrée et classée par intention : [{ intention, commandes }] dans l'ordre des intentions ; dans chaque
 * intention, les plus pertinentes d'abord quand on cherche, sinon l'ordre du menu du jeu.
 * @param o.q recherche ; o.intention filtre (id ou null) ; o.assignees seulement celles qui ont une touche ;
 *          o.libres seulement celles sans touche ; o.reglages montrer aussi les réglages
 */
export function classer(commandes, intentionsListe, { q = '', intention = null, assignees = false, libres = false, reglages = false } = {}) {
  const intentions = new Map(intentionsListe.map((i) => [i.id, i]));
  const gardees = commandes
    .filter((c) => (reglages || c.genre !== 'reglage') && (!intention || c.intention === intention))
    .filter((c) => (!assignees || c.touches.length > 0) && (!libres || c.touches.length === 0))
    .map((c) => ({ c, s: score(c, q, intentions) }))
    .filter((x) => x.s > 0);
  return intentionsListe
    .map((i) => ({
      intention: i,
      commandes: gardees.filter((x) => x.c.intention === i.id).sort((a, b) => (q ? b.s - a.s : 0) || a.c.ordre - b.c.ordre).map((x) => x.c),
    }))
    .filter((g) => g.commandes.length);
}

/** Voisins d'une commande dans le menu du jeu (même ordre que le fichier) : pour la retrouver à l'écran. */
export function voisins(commandes, c) {
  const liste = commandes.filter((x) => x.genre !== 'reglage' || c.genre === 'reglage').sort((a, b) => a.ordre - b.ordre);
  const i = liste.findIndex((x) => x.id === c.id);
  return { avant: i > 0 ? liste[i - 1] : null, apres: i >= 0 && i < liste.length - 1 ? liste[i + 1] : null };
}
