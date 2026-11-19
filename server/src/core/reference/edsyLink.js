// Format des liens d'EDSY (https://edsy.org/#/L=<code>) : passage du texte du lien à une structure, et retour.
//
// Ce module ne connaît que la forme du code : il ne sait pas ce que désigne un identifiant. C'est edsy.js et
// edsyBuild.js qui lui donnent un sens avec les tables d'eddb.js (vaisseaux, modules, modifications, effets).
// Le format est décrit ici d'après les liens que produit edsy.org (versions 15 à 20).
//
// Nombres : base 64, chiffres « 0-9 A-Z a-z _ - » (valeurs 0 à 63), poids fort en tête ; chaque champ a une
// largeur fixe, complétée à gauche par des « 0 ». Un caractère étranger à l'alphabet compte pour 0.
//
// Code d'un build, morceaux séparés par des virgules :
//   <version:1> <coque> , <points d'emport> , <utilitaires> , <modules de base> , <militaires> , <internes> [, <nom>]
//   coque : <vaisseau:1> <remise:1> <prix:1+2> <équipage:1> <répartition d'énergie:2> <fiche de la trappe de soute>
//           (seul le vaisseau est lu ; à l'écriture, valeurs par défaut)
//   groupe : fiches de modules dans l'ordre des emplacements ; un identifiant ≥ 199900 n'est pas un module mais
//            un saut : 199900 + n passe n emplacements vides.
//   fiche d'un module :
//     <module:3> <drapeaux:1> puis
//       si drapeau 0x20 (prix saisi) : <en-tête:1> et 2 + ((en-tête >> 4) & 3) chiffres de prix ; sinon <remise:1>
//       si drapeau 0x10 (ingénierie) : <ingénierie:2> <progression:2> <n:1> et n valeurs de 4 chiffres
//         (valeurs saisies à la main dans EDSY : lues mais pas utilisées)
//     ingénierie, champ de bits : 0x800 pré-ingénié, bits 7-10 rang de la modification, bits 4-6 grade,
//     bits 0-3 rang de l'effet expérimental ; un rang n désigne la n-ième entrée de la liste du type de
//     module dans eddb.js (0 = aucune).
//   nom : texte codé (voir encodeText).

/** Ordre des groupes d'emplacements dans le lien (et dans les builds de l'app). */
export const LINK_GROUPS = ['hardpoint', 'utility', 'component', 'military', 'internal'];
/** Version des liens écrits (celle d'edsy.org aujourd'hui). */
export const LINK_VERSION = 20;
/** Plus ancienne version lue : avant, les fiches n'avaient pas la même forme. */
export const OLDEST_VERSION = 15;
/** Identifiant de la trappe de soute, module fixe présent sur chaque coque. */
export const CARGO_HATCH = 49180;
/** Progression d'une modification terminée (100 % = 4000), écrite après le champ d'ingénierie. */
export const COMPLETE_ROLL = 4000;

const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-';
const DIGIT_VALUE = new Map([...DIGITS].map((c, value) => [c, value]));
// Ponctuation ASCII du nom, codée « _ » + rang dans cette liste
const PUNCTUATION = ' !"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~';
const PUNCTUATION_RANK = new Map([...PUNCTUATION].map((c, rank) => [c, rank]));
const PUNCTUATION_MARK = 62; // « _ »
const WIDE_MARK = 63; // « - » : caractère de U+007F à U+107E, sur deux chiffres
const WIDE_BASE = 0x7f;
const WIDE_SPAN = 64 * 64; // 4096 caractères codables après WIDE_BASE

const GAP_BASE = 199900;
const FLAG_PRICED = 0x20;
const FLAG_ENGINEERED = 0x10;

/** Chiffre isolé → valeur (0 pour un caractère inconnu ou absent). */
const digitValue = (c) => DIGIT_VALUE.get(c) ?? 0;

/** Texte de chiffres → nombre (lu caractère Unicode par caractère Unicode). */
export function decodeNumber(text) {
  let n = 0;
  for (const c of String(text)) n = n * 64 + digitValue(c);
  return n;
}

/** Nombre entier positif → `width` chiffres au moins (un nombre plus long n'est pas tronqué). */
export function encodeNumber(n, width) {
  let rest = Math.max(0, Math.floor(Number(n) || 0));
  const out = [];
  while (rest > 0) {
    out.push(DIGITS[rest % 64]);
    rest = Math.floor(rest / 64);
  }
  return out.reverse().join('').padStart(width, DIGITS[0]);
}

/**
 * Nom du build → texte du lien. Lettres ASCII et chiffres tels quels ; ponctuation ASCII et espace : « _ » + rang ;
 * caractères de U+007F à U+107E : « - » + deux chiffres. Le reste (contrôles, emoji…) disparaît.
 */
export function encodeText(text) {
  let out = '';
  for (const ch of String(text)) {
    const value = DIGIT_VALUE.get(ch);
    if (value !== undefined && value < PUNCTUATION_MARK) {
      out += ch;
      continue;
    }
    const rank = PUNCTUATION_RANK.get(ch);
    if (rank !== undefined) {
      out += DIGITS[PUNCTUATION_MARK] + DIGITS[rank];
      continue;
    }
    const offset = ch.codePointAt(0) - WIDE_BASE;
    if (offset >= 0 && offset < WIDE_SPAN) out += DIGITS[WIDE_MARK] + DIGITS[offset >> 6] + DIGITS[offset & 63];
  }
  return out;
}

const MAX_TEXTE = 4096; // caractères du lien lus pour le nom du build : bien plus qu'un vrai nom, et une boucle bornée

/**
 * Texte du lien → nom du build (inverse d'encodeText). Un caractère hors alphabet est ignoré ; un chiffre
 * manquant après « _ » ou « - » compte pour 0 ; un rang de ponctuation hors liste ne donne rien.
 */
export function decodeText(code) {
  // Un texte, et rien d'autre (pas un objet qui annoncerait une longueur) ; la boucle a sa propre borne
  const s = typeof code === 'string' ? code : String(code ?? '');
  const fin = Math.min(s.length, MAX_TEXTE);
  let out = '';
  let i = 0;
  while (i < fin) {
    const c = s[i++];
    const lead = DIGIT_VALUE.get(c);
    if (lead === undefined) continue;
    if (lead < PUNCTUATION_MARK) {
      out += c;
    } else if (lead === PUNCTUATION_MARK) {
      out += PUNCTUATION[digitValue(s[i++])] ?? '';
    } else {
      const high = digitValue(s[i++]);
      const low = digitValue(s[i++]);
      out += String.fromCharCode(WIDE_BASE + high * 64 + low);
    }
  }
  return out;
}

/** Champ d'ingénierie → { blueprint, grade, effect, preengineered } (rangs 1…15, 0 = aucun). */
export function unpackEngineering(bits) {
  return {
    blueprint: (bits >> 7) & 0xf,
    grade: (bits >> 4) & 0x7,
    effect: bits & 0xf,
    preengineered: (bits & 0x800) !== 0,
  };
}

/** Inverse d'unpackEngineering (chaque champ est tronqué à sa largeur). */
export function packEngineering({ blueprint = 0, grade = 0, effect = 0, preengineered = false }) {
  return (preengineered ? 0x800 : 0) | ((blueprint & 0xf) << 7) | ((grade & 0x7) << 4) | (effect & 0xf);
}

/** Lecture séquentielle de champs de largeur fixe ; au-delà de la fin, un champ vaut 0. */
class FieldReader {
  constructor(text) {
    this.text = text;
    this.at = 0;
  }

  get remaining() {
    return this.at < this.text.length;
  }

  take(width) {
    const piece = this.text.slice(this.at, this.at + width);
    this.at += width;
    return decodeNumber(piece);
  }

  skip(width) {
    this.at += width;
  }
}

/** Fiches d'un groupe → [{ slot, modid, flags, engineering: { bits, roll, values } | null }]. */
function readGroup(text) {
  const records = [];
  const r = new FieldReader(text || '');
  let slot = 0;
  while (r.remaining) {
    const id = r.take(3);
    if (id >= GAP_BASE) {
      slot += id - GAP_BASE;
      continue;
    }
    const flags = r.take(1);
    if (flags & FLAG_PRICED) {
      const head = r.take(1);
      r.skip(2 + ((head >> 4) & 0x3));
    } else {
      r.skip(1); // remise
    }
    let engineering = null;
    if (flags & FLAG_ENGINEERED) {
      const bits = r.take(2);
      const roll = r.take(2);
      const values = Array.from({ length: r.take(1) }, () => r.take(4));
      engineering = { bits, roll, values };
    }
    records.push({ slot, modid: id, flags, engineering });
    slot++;
  }
  return records;
}

/**
 * Code d'un lien (la partie après « L= », déjà décodée de l'URL) → structure brute.
 * @returns {{ version: number, shipId: number, groups: Record<string, object[]>, name: string }}
 */
export function readLink(code) {
  const text = String(code ?? '');
  const version = decodeNumber(text.slice(0, 1));
  const [hull = '', ...rest] = text.slice(1).split(',');
  const groups = Object.fromEntries(LINK_GROUPS.map((g, k) => [g, readGroup(rest[k])]));
  const named = rest[LINK_GROUPS.length];
  return { version, shipId: decodeNumber(hull.slice(0, 1)), groups, name: named ? decodeText(named) : '' };
}

/** Fiche d'un module, sans prix ni remise, alimenté en priorité 1 ; `engineering` = { bits, roll } ou null. */
function moduleRecord(modid, engineering) {
  let out = encodeNumber(modid & 0x1ffff, 3) + encodeNumber(engineering ? FLAG_ENGINEERED : 0, 1) + encodeNumber(0, 1);
  if (engineering) out += encodeNumber(engineering.bits, 2) + encodeNumber(engineering.roll, 2) + encodeNumber(0, 1);
  return out;
}

/**
 * Structure → code d'un lien (inverse de readLink pour ce qu'il lit).
 * @param {{ shipId: number, groups: Record<string, { slot, modid, engineering }[]>, name?: string, version?: number }} link
 *   fiches de chaque groupe triées par emplacement ; `name` déjà réduit aux caractères codables (voir safeName)
 */
export function writeLink({ shipId, groups, name = '', version = LINK_VERSION }) {
  // Coque : le vaisseau tient sur un chiffre (identifiants 0 à 63) ; aucune remise, aucun prix saisi, équipage
  // par défaut, répartition d'énergie 4/4/4 demi-traits (2/2/2), puis la trappe de soute.
  const hull = encodeNumber(shipId & 0x3f, 1) + encodeNumber(0, 1) + encodeNumber(0, 1) + encodeNumber(0, 2)
    + encodeNumber(0, 1) + encodeNumber(0x444, 2) + moduleRecord(CARGO_HATCH, null);
  const chunks = [encodeNumber(version, 1) + hull];
  for (const g of LINK_GROUPS) {
    let text = '';
    let next = 0; // premier emplacement pas encore écrit
    for (const rec of groups[g] || []) {
      if (rec.slot > next) text += encodeNumber(GAP_BASE + (rec.slot - next), 3);
      text += moduleRecord(rec.modid, rec.engineering);
      next = rec.slot + 1;
    }
    chunks.push(text);
  }
  const encodedName = encodeText(name);
  if (encodedName) chunks.push(encodedName);
  return chunks.join(',');
}
