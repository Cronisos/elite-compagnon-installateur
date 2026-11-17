// Textes du jeu en français propre, côté interface : affichage, recherche (sans accents, casse ni apostrophes
// typographiques) et tri des marchandises comme le marché du jeu.
//
// Jumeau de server/src/core/text.js, qui nettoie déjà les textes à la lecture du journal ; ici, le même nettoyage
// protège l'affichage et sert aux recherches de l'interface. Les règles du jeu (sources, dates, « mesurée » ou
// « à vérifier ») sont décrites dans le fichier du serveur ; text.test.js vérifie que les deux donnent les mêmes
// résultats.

/** Clé de traduction écrite à la place du texte : « $Nom_De_La_Cle; » (mesurée, voir le serveur). */
export const RAW_KEY_RE = /^\$([^\s;]+);$/;

const NAMED_ENTITIES = new Map([
  ['nbsp', '\u00a0'], ['amp', '&'], ['lt', '<'], ['gt', '>'], ['quot', '"'], ['apos', "'"],
  ['rsquo', '’'], ['lsquo', '‘'], ['ldquo', '“'], ['rdquo', '”'], ['laquo', '«'], ['raquo', '»'],
  ['hellip', '…'], ['ndash', '–'], ['mdash', '—'], ['thinsp', '\u2009'], ['euro', '€'], ['deg', '°'], ['middot', '·'],
  ['eacute', 'é'], ['egrave', 'è'], ['ecirc', 'ê'], ['euml', 'ë'], ['agrave', 'à'], ['acirc', 'â'], ['ccedil', 'ç'],
  ['icirc', 'î'], ['iuml', 'ï'], ['ocirc', 'ô'], ['ugrave', 'ù'], ['ucirc', 'û'], ['oelig', 'œ'],
  ['Eacute', 'É'], ['Egrave', 'È'], ['Agrave', 'À'], ['Ccedil', 'Ç'], ['OElig', 'Œ'],
]);

/** Noms français connus d'une famille de clés (Artemis, de vol, Maverick : mesurées ; Dominator : à vérifier). */
export const KEY_NAMES = new Map([
  ['explorationsuit', 'Combinaison Artemis'], // mesurée
  ['flightsuit', 'Combinaison de vol'], // mesurée
  ['tacticalsuit', 'Combinaison Dominator'], // à vérifier
  ['utilitysuit', 'Combinaison Maverick'], // mesurée (BuySuit, 4 nov. 2026)
]);

/** Ordre du marché du jeu : catégorie, puis nom, en ordre alphabétique français (à vérifier en jeu). */
export const MARKET_SORT = Object.freeze({ locale: 'fr', keys: Object.freeze(['category', 'name']) });

// Entité entière, du « & » au « ; » : 10 caractères au plus (« &#1114111; »)
const ENTITY_TAIL_RE = /^&(#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z]{2,8});$/;
const ENTITY_MAX = 10;

function decodeEntity(all, body) {
  if (body[0] !== '#') return NAMED_ENTITIES.get(body) ?? all;
  const hex = body[1] === 'x' || body[1] === 'X';
  const cp = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
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

/** Clé de traduction brute, sinon null. */
export function rawKey(text) {
  const m = RAW_KEY_RE.exec(String(text ?? '').trim());
  return m ? m[1] : null;
}

/** Nom lisible tiré d'une clé ou d'un nom interne. */
export function keyLabel(key) {
  const base = String(key ?? '').trim().replace(/^\$/, '').replace(/;$/, '').replace(/_name$/i, '');
  const known = KEY_NAMES.get(base.toLowerCase().replace(/_class\d+$/, ''));
  if (known) return known;
  const words = base
    .split(/[_\s]+/)
    .flatMap((w) => w.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Za-z])(\d)/g, '$1 $2').split(' '))
    .filter(Boolean)
    .map((w) => (w.length > 1 && w === w.toUpperCase() ? w.toLowerCase() : w));
  const text = words.join(' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Texte prêt à afficher : entités décodées, espaces de bord retirées, clé brute remplacée. Rien → chaîne vide. */
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

/** Le texte traduit nettoyé, sinon le nom interne rendu lisible, sinon null. */
export function localised(value, internal) {
  const s = cleanText(value);
  if (s) return s;
  const fallback = cleanText(internal);
  return fallback ? (rawKey(internal) ? fallback : keyLabel(fallback)) : null;
}

const APOSTROPHES_RE = /[’‘‛ʼ′´`]/g;

/** Une seule apostrophe (') pour comparer. */
export const unifyApostrophes = (text) => String(text ?? '').replace(APOSTROPHES_RE, "'");

/** Forme de recherche : sans accents ni casse, apostrophes unifiées, espaces insécables = espaces. */
export function foldText(value) {
  return unifyApostrophes(cleanText(value))
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Vrai si la recherche se trouve dans l'un des textes ; une recherche vide trouve tout. */
export function matchesSearch(query, fields) {
  const q = foldText(query);
  if (!q) return true;
  return [].concat(fields).some((f) => f != null && f !== false && foldText(f).includes(q));
}

const collator = new Intl.Collator(MARKET_SORT.locale, { numeric: true });

/** Ordre alphabétique français, apostrophes unifiées. */
export const compareFrench = (a, b) => collator.compare(unifyApostrophes(cleanText(a)), unifyApostrophes(cleanText(b)));

const COMMODITY_FIELDS = {
  category: (x) => x?.categoryLabel ?? x?.Category_Localised ?? x?.category ?? x?.Category ?? null,
  name: (x) => x?.label ?? x?.Name_Localised ?? x?.name ?? x?.Name ?? '',
};

/** Comparaison de deux marchandises comme le marché du jeu ; sans catégorie : à la fin. */
export function compareCommodities(a, b, fields = COMMODITY_FIELDS) {
  for (const k of MARKET_SORT.keys) {
    const get = fields[k] || COMMODITY_FIELDS[k];
    const va = cleanText(get(a));
    const vb = cleanText(get(b));
    if (va === vb) continue;
    if (!va) return 1;
    if (!vb) return -1;
    const c = compareFrench(va, vb);
    if (c) return c;
  }
  return 0;
}

/** Copie triée d'une liste de marchandises, comme le marché du jeu. */
export const sortCommodities = (items, fields) => [...(items || [])].sort((a, b) => compareCommodities(a, b, fields));
