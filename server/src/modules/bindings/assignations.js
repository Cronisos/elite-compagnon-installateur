// Assignations du joueur, lues dans son profil de commandes (.binds, LECTURE SEULE) : pour chaque commande, ses touches
// (clavier, souris, manettes, avec leurs modificateurs) ou sa valeur de réglage, dans l'ordre du fichier (celui du menu
// du jeu), puis enrichies du catalogue (catalogue.js) : nom français, intention, section du menu. Fonctions pures.

import { cleanText } from '../../core/text.js';
import { NOMS, intentionDe, nomParDefaut, sectionsDe } from './catalogue.js';

const MAX_ENTREES = 2000; // un .binds en a environ 515 : au-delà, fichier piégé

const attr = (s, nom) => {
  const m = new RegExp(`\\b${nom}="([^"]*)"`).exec(s);
  return m ? cleanText(m[1]) : null;
};

/**
 * Entrées d'un .binds (texte déjà décodé), dans l'ordre du fichier.
 * @returns [{ id, genre: 'bouton' | 'axe' | 'reglage', touches: [{ appareil, touche, modifs: [{ appareil, touche }] }], valeur }]
 */
export function lireAssignations(xml) {
  const out = [];
  // La balise fermante peut être sur la même ligne (<KeyboardLayout>fr-FR</KeyboardLayout>)
  const re = /^\t<(\w+)([^>]*?)(\/>|>([\s\S]*?)<\/\1>)/gm;
  const texteXml = String(xml || '');
  let m;
  while ((m = re.exec(texteXml)) && out.length < MAX_ENTREES) {
    const [, id, attrs, , corps = ''] = m;
    let genre = 'reglage';
    if (/<Primary\s/.test(corps)) genre = 'bouton';
    else if (/<Binding\s/.test(corps)) genre = 'axe';
    const touches = [];
    const reT = /<(Primary|Secondary|Binding)\s([^>]*?)(\/>|>([\s\S]*?)<\/\1>)/g;
    let t;
    while ((t = reT.exec(corps))) {
      const appareil = attr(t[2], 'Device');
      const touche = attr(t[2], 'Key');
      if (!appareil || appareil === '{NoDevice}' || !touche) continue;
      const modifs = [...String(t[4] || '').matchAll(/<Modifier\s([^>]*?)\/>/g)]
        .map((x) => ({ appareil: attr(x[1], 'Device'), touche: attr(x[1], 'Key') }))
        .filter((x) => x.appareil && x.touche);
      touches.push({ appareil, touche, modifs });
    }
    const texte = /</.test(corps) ? null : cleanText(corps) || null; // valeur écrite entre les balises
    const valeur = attr(attrs, 'Value') ?? texte;
    out.push({ id, genre, touches, valeur });
  }
  return out;
}

const APPAREILS = { Keyboard: 'Clavier', Mouse: 'Souris', SaitekX52: 'X52', SaitekX52Pro: 'X52 Pro', GamePad: 'Manette' };
const TOUCHES = {
  LeftShift: 'Maj gauche', RightShift: 'Maj droite', LeftControl: 'Ctrl gauche', RightControl: 'Ctrl droit', LeftAlt: 'Alt gauche',
  RightAlt: 'Alt Gr', Space: 'Espace', Enter: 'Entrée', Backspace: 'Retour arrière', Tab: 'Tab', Escape: 'Échap', Delete: 'Suppr',
  Insert: 'Inser', Home: 'Origine', End: 'Fin', PageUp: 'Page préc.', PageDown: 'Page suiv.', UpArrow: '↑', DownArrow: '↓',
  LeftArrow: '←', RightArrow: '→', CapsLock: 'Verr. Maj', Ampersand: '&', Apostrophe: '\'', Comma: ',', DoubleQuote: '"',
  Equals: '=', ExclamationPoint: '!', LeftParenthesis: '(', RightParenthesis: ')', LessThan: '<', GreaterThan: '>', Underline: '_',
  Minus: '-', Period: '.', Slash: '/', BackSlash: '\\', SemiColon: ';', Colon: ':', Dollar: '$', Asterisk: '*', Grave: '²',
  Hash: '#', Plus: '+', LeftBracket: '[', RightBracket: ']', Numpad_Enter: 'Pavé num. Entrée', Numpad_Add: 'Pavé num. +',
  Numpad_Subtract: 'Pavé num. -', Numpad_Multiply: 'Pavé num. *', Numpad_Divide: 'Pavé num. /', Numpad_Decimal: 'Pavé num. .',
};

/** Nom d'un appareil : « Clavier », « Souris », « X52 », sinon son identifiant. */
export const nomAppareil = (a) => APPAREILS[a] || String(a || '');

/** Nom d'une touche, sans l'appareil : « Maj gauche », « K », « bouton 3 », « chapeau 1 haut », « axe X », « molette ↑ ». */
export function nomTouche(touche) {
  const k = String(touche || '');
  let m;
  if ((m = /^Key_(.+)$/.exec(k))) {
    const n = m[1];
    if (TOUCHES[n]) return TOUCHES[n];
    if ((m = /^Numpad_(\d)$/.exec(n))) return `Pavé num. ${m[1]}`;
    return n.length === 1 ? n.toUpperCase() : n;
  }
  if ((m = /^(Pos|Neg)_Mouse_ZAxis$/.exec(k))) return m[1] === 'Pos' ? 'molette ↑' : 'molette ↓';
  if ((m = /^Mouse_(\d+)$/.exec(k))) return `bouton ${m[1]}`;
  if ((m = /^(?:(Pos|Neg)_)?(?:Joy|Mouse|GamePad)_(R?[XYZUV])Axis$/.exec(k))) return `axe ${m[2]}${m[1] === 'Pos' ? ' +' : m[1] === 'Neg' ? ' −' : ''}`;
  if ((m = /^Joy_POV(\d)(Up|Down|Left|Right)$/.exec(k))) return `chapeau ${m[1]} ${{ Up: 'haut', Down: 'bas', Left: 'gauche', Right: 'droite' }[m[2]]}`;
  if ((m = /^Joy_(\d+)$/.exec(k))) return `bouton ${m[1]}`;
  return k.replace(/^(Joy|GamePad)_/, '');
}

/** Une touche en clair, modificateurs compris : « Clavier : Maj gauche + K ». */
export function texteTouche(t) {
  const mods = (t.modifs || []).map((x) => (x.appareil === t.appareil ? nomTouche(x.touche) : `${nomAppareil(x.appareil)} ${nomTouche(x.touche)}`));
  return `${nomAppareil(t.appareil)} : ${[...mods, nomTouche(t.touche)].join(' + ')}`;
}

/**
 * Vue complète pour la page : chaque entrée avec son nom français, son intention, sa section (approximative) et ses
 * touches en clair. ordre : position dans le fichier (celle du menu du jeu).
 */
export function vueAssignations(entrees) {
  const sections = sectionsDe(entrees.map((e) => e.id));
  return entrees.map((e, ordre) => ({
    id: e.id,
    ordre,
    genre: e.genre,
    nom: NOMS[e.id] || nomParDefaut(e.id),
    connu: Object.hasOwn(NOMS, e.id),
    intention: intentionDe(e.id, e.genre),
    section: sections.get(e.id)?.section ?? null,
    sous: sections.get(e.id)?.sous ?? null,
    touches: e.touches.map((t) => ({ appareil: nomAppareil(t.appareil), texte: texteTouche(t) })),
    valeur: e.genre === 'reglage' ? e.valeur : null,
  }));
}
