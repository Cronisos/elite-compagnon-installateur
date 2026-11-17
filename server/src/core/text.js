// Textes du journal en français propre : affichage, recherche et tri. Partagé par tous les modules.
//
// Le jeu écrit parfois son texte français mal formé (relevé dans tes 49 journaux, 23 oct. → 7 nov. 2026) :
//   - entités HTML : « Donnez 1&nbsp;000&nbsp;000 CR à la cause » (6 LocalisedName, 4 Message_Localised) ;
//   - clé de traduction à la place du nom : SuitName_Localised = « $TacticalSuit_Class1_Name; » (18 champs) ;
//   - deux apostrophes : « Emplacement d’extraction planétaire » (’) mais « On n'est pas obligés » (') ;
//   - espaces insécables (U+00A0) écrits tels quels : « Cobra Mk III », « Canal rejoint : … ».
// cleanText rend un texte affichable (l'espace insécable reste insécable : un nombre ne se coupe pas en fin de
// ligne) ; foldText le prépare pour chercher ou comparer (espaces insécables = espaces, sans accents ni casse,
// une seule apostrophe).
//
// Ce fichier a un jumeau côté interface : client/src/core/text.js. Un test du client vérifie qu'ils donnent les
// mêmes résultats.

// --- Règles du jeu sur ses textes (pour la vigie des règles) ---

// Règles des textes du jeu : dépôt des règles, server/src/regles/textes.js (voir regles/LISEZMOI.md).
import { EXPECTED_GAME_LANGUAGE, RAW_KEY_RE, KEY_NAMES, MARKET_SORT, FICHES as FICHES_TEXTES } from '../regles/textes.js';

export { EXPECTED_GAME_LANGUAGE, RAW_KEY_RE, KEY_NAMES, MARKET_SORT };

/**
 * Entités HTML que le jeu laisse dans son texte. Mesurée le 7 nov. 2026 : seul « &nbsp; » apparaît dans tes journaux
 * (LocalisedName de MissionAccepted, Message_Localised de ReceiveText) ; les autres sont décodées par prudence.
 */
const NAMED_ENTITIES = new Map([
  ['nbsp', '\u00a0'], ['amp', '&'], ['lt', '<'], ['gt', '>'], ['quot', '"'], ['apos', "'"],
  ['rsquo', '’'], ['lsquo', '‘'], ['ldquo', '“'], ['rdquo', '”'], ['laquo', '«'], ['raquo', '»'],
  ['hellip', '…'], ['ndash', '–'], ['mdash', '—'], ['thinsp', '\u2009'], ['euro', '€'], ['deg', '°'], ['middot', '·'],
  ['eacute', 'é'], ['egrave', 'è'], ['ecirc', 'ê'], ['euml', 'ë'], ['agrave', 'à'], ['acirc', 'â'], ['ccedil', 'ç'],
  ['icirc', 'î'], ['iuml', 'ï'], ['ocirc', 'ô'], ['ugrave', 'ù'], ['ucirc', 'û'], ['oelig', 'œ'],
  ['Eacute', 'É'], ['Egrave', 'È'], ['Agrave', 'À'], ['Ccedil', 'Ç'], ['OElig', 'Œ'],
]);

/** Les règles des textes, lisibles par un programme (forme d'avant le dépôt), faites à partir des fiches. */
export const TEXT_RULES = Object.freeze(FICHES_TEXTES.map((f) => ({
  name: f.nom,
  value: f.nom === 'RAW_KEY_RE' ? String(RAW_KEY_RE) : f.nom === 'MARKET_SORT' ? MARKET_SORT : f.valeur,
  status: f.statutDetail || f.statut, date: f.date, source: f.source,
})));

// --- Nettoyage pour l'affichage ---

// Entité entière, du « & » au « ; » : 10 caractères au plus (« &#1114111; »)
const ENTITY_TAIL_RE = /^&(#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z]{2,8});$/;
const ENTITY_MAX = 10;

function decodeEntity(all, body) {
  if (body[0] !== '#') return NAMED_ENTITIES.get(body) ?? all;
  const hex = body[1] === 'x' || body[1] === 'X';
  const cp = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
  // Caractères de contrôle et demi-codets : laissés tels quels
  if (!(cp >= 0x20 && cp <= 0x10ffff) || (cp >= 0x7f && cp < 0xa0) || (cp >= 0xd800 && cp <= 0xdfff)) return all;
  return String.fromCodePoint(cp);
}

/** Position du « & » d'une entité qui finirait par le « ; » final de `out`, ou -1 (au plus ENTITY_MAX unités). */
function entityStart(out) {
  for (let j = out.length - 2, stop = Math.max(0, out.length - ENTITY_MAX); j >= stop; j--) if (out[j] === '&') return j;
  return -1;
}

/**
 * Décode les entités HTML jusqu'à ce qu'il n'en reste plus : « &amp;nbsp; » donne une espace insécable, comme
 * « &nbsp; ». Le résultat n'a plus d'entité décodable, donc un deuxième nettoyage ne change rien : un même nom passe
 * par la lecture du journal, puis par un module (Coup d'œil), puis par l'interface, et reste le même partout.
 *
 * En UN passage, en temps linéaire : chaque « ; » regarde seulement la fin du texte déjà écrit (une entité fait au plus
 * 10 caractères), et ce qu'il décode y est réexaminé aussitôt (« &amp;amp; » devient « & » sans relire tout le texte).
 * L'ancienne boucle relisait tout le texte à chaque niveau : une suite de 160 Ko de « &amp;amp;… » (profil de commandes
 * partagé, piégé) prenait plusieurs secondes et bloquait tout le serveur. Le « & » est cherché dans les 10 dernières
 * unités seulement : cherché dans tout le texte écrit, un « & » suivi de 40 000 « ; » prenait encore une seconde.
 */
export function decodeEntities(text) {
  const s = String(text ?? '');
  if (!s.includes('&')) return s;
  const out = []; // unités UTF-16 du résultat
  for (let i = 0; i < s.length; i++) {
    out.push(s[i]);
    while (out[out.length - 1] === ';') {
      const amp = entityStart(out);
      if (amp < 0) break;
      const all = out.slice(amp).join('');
      const m = ENTITY_TAIL_RE.exec(all);
      if (!m) break;
      const decoded = decodeEntity(all, m[1]);
      if (decoded === all) break; // entité inconnue ou interdite : laissée telle quelle
      out.length = amp;
      for (const unit of decoded.split('')) out.push(unit);
    }
  }
  return out.join('');
}

/** Clé de traduction brute (« $TacticalSuit_Class1_Name; » → « TacticalSuit_Class1_Name »), sinon null. */
export function rawKey(text) {
  const m = RAW_KEY_RE.exec(String(text ?? '').trim());
  return m ? m[1] : null;
}

/**
 * Nom lisible tiré d'une clé ou d'un nom interne : nom français connu (KEY_NAMES), sinon les mots de la clé.
 * « $TacticalSuit_Class1_Name; » → « Combinaison Dominator » ; « Mission_AltruismCredits » → « Mission Altruism Credits ».
 */
export function keyLabel(key) {
  const base = String(key ?? '').trim().replace(/^\$/, '').replace(/;$/, '').replace(/_name$/i, '');
  const known = KEY_NAMES.get(base.toLowerCase().replace(/_class\d+$/, ''));
  if (known) return known;
  const words = base
    .split(/[_\s]+/)
    .flatMap((w) => w.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Za-z])(\d)/g, '$1 $2').split(' '))
    .filter(Boolean)
    .map((w) => (w.length > 1 && w === w.toUpperCase() ? w.toLowerCase() : w)); // MULTIPLAYER → multiplayer
  const text = words.join(' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Texte du journal prêt à afficher : entités décodées, espaces du début et de la fin retirées, clé brute
 * remplacée par un nom lisible. Rien → chaîne vide. Idempotente : cleanText(cleanText(x)) === cleanText(x).
 */
export function cleanText(value) {
  if (value == null) return '';
  let s = String(value);
  if (s.includes('&')) s = decodeEntities(s);
  s = s.trim();
  if (s[0] === '$') {
    const key = rawKey(s);
    if (key) return keyLabel(key);
  }
  return s;
}

/**
 * Nom à afficher : le texte traduit nettoyé, sinon le nom interne rendu lisible, sinon null.
 * localised(ev.LocalisedName, ev.Name), localised(ev.Commodity_Localised, ev.Commodity)…
 */
export function localised(value, internal) {
  const s = cleanText(value);
  if (s) return s;
  const fallback = cleanText(internal);
  return fallback ? (rawKey(internal) ? fallback : keyLabel(fallback)) : null;
}

const LOCALISED_KEY_RE = /_Localised$|^LocalisedName$/;

/**
 * Nettoie sur place les textes traduits d'un événement ou d'un fichier d'état du jeu (champs *_Localised et
 * LocalisedName, à toute profondeur : Market.json Items, Loadout Modules…). Les autres champs ne bougent pas.
 */
export function cleanLocalisedFields(value, depth = 0) {
  if (value == null || typeof value !== 'object' || depth > 10) return value;
  if (Array.isArray(value)) {
    for (const v of value) cleanLocalisedFields(v, depth + 1);
    return value;
  }
  for (const key of Object.keys(value)) {
    const v = value[key];
    if (typeof v === 'string') {
      if (LOCALISED_KEY_RE.test(key)) value[key] = cleanText(v);
    } else if (v && typeof v === 'object') {
      cleanLocalisedFields(v, depth + 1);
    }
  }
  return value;
}

// --- Recherche et comparaison ---

const APOSTROPHES_RE = /[’‘‛ʼ′´`]/g;

/** Une seule apostrophe (') : « d’extraction » et « d'extraction » deviennent le même texte. */
export const unifyApostrophes = (text) => String(text ?? '').replace(APOSTROPHES_RE, "'");

/**
 * Forme de recherche d'un texte : nettoyé, apostrophes unifiées, sans accents ni casse, œ et æ en deux lettres,
 * espaces insécables comptées comme des espaces (une seule espace entre deux mots).
 */
export function foldText(value) {
  return unifyApostrophes(cleanText(value))
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/\s+/g, ' ') // \s comprend U+00A0 et U+202F
    .trim();
}

/** Vrai si la recherche se trouve dans l'un des textes (insensible aux accents, à la casse et aux apostrophes). */
export function matchesSearch(query, fields) {
  const q = foldText(query);
  if (!q) return true;
  return [].concat(fields).some((f) => f != null && f !== false && foldText(f).includes(q));
}

const collator = new Intl.Collator(MARKET_SORT.locale, { numeric: true });

/** Ordre alphabétique français (« Matériaux » < « Médicaments » < « Métaux »), apostrophes unifiées. */
export const compareFrench = (a, b) => collator.compare(unifyApostrophes(cleanText(a)), unifyApostrophes(cleanText(b)));

const COMMODITY_FIELDS = {
  category: (x) => x?.categoryLabel ?? x?.Category_Localised ?? x?.category ?? x?.Category ?? null,
  name: (x) => x?.label ?? x?.Name_Localised ?? x?.name ?? x?.Name ?? '',
};

/**
 * Comparaison de deux marchandises comme le marché du jeu (MARKET_SORT). Accepte une ligne de Market.json
 * (Category_Localised, Name_Localised) ou une ligne de l'app ({ category | categoryLabel, label | name }).
 */
export function compareCommodities(a, b, fields = COMMODITY_FIELDS) {
  for (const k of MARKET_SORT.keys) {
    const get = fields[k] || COMMODITY_FIELDS[k];
    const va = cleanText(get(a));
    const vb = cleanText(get(b));
    if (va === vb) continue;
    if (!va) return 1; // sans catégorie : à la fin
    if (!vb) return -1;
    const c = compareFrench(va, vb);
    if (c) return c;
  }
  return 0;
}

/** Copie triée d'une liste de marchandises, comme le marché du jeu. */
export const sortCommodities = (items, fields) => [...(items || [])].sort((a, b) => compareCommodities(a, b, fields));
