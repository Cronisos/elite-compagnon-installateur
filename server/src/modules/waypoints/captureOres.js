// Minerais d'un EEP lus sur la photo du panneau de cible du jeu :
//   « SIGNAL : EMPLACEMENT… », la distance, puis un minerai par ligne (OR, HÉLIUM, IRIDIUM…), puis la planète.
// On garde les lignes faites de lettres seulement, hors titre et nom du système, et on les ramène au nom connu
// le plus proche (l'OCR confond parfois une lettre), sinon au mot lu, en minuscules avec une majuscule.

const HEADER = /signal|emplacement|extraction|plan[ée]taire/i;
const ORE_LINE = /^[a-zà-ÿ][a-zà-ÿ' -]*$/i;

const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

/** Distance d'édition (lettres ajoutées, retirées ou changées). */
function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

/**
 * Minerais lus dans les lignes d'une capture.
 * @param lines lignes de l'OCR [{ text }] ; known : noms de minerais connus ; system : nom du système (ligne écartée)
 * @returns noms de minerais, dans l'ordre du panneau, sans doublon
 */
export function oresFromLines(lines, { known = [], system = '' } = {}) {
  const systemWord = fold(String(system).split(/\s+/)[0] || '');
  const names = new Map(known.map((k) => [fold(k), k]));
  const out = [];
  for (const { text } of lines) {
    const raw = String(text || '').trim();
    if (raw.length < 2 || !ORE_LINE.test(raw) || HEADER.test(raw)) continue;
    const key = fold(raw);
    if (systemWord && key.includes(systemWord)) continue;
    let name = names.get(key);
    if (!name && key.length >= 4) {
      const close = [...names].find(([k]) => Math.abs(k.length - key.length) <= 1 && distance(k, key) <= 1);
      name = close?.[1];
    }
    name ??= capitalize(raw);
    if (!out.some((o) => fold(o) === fold(name))) out.push(name);
  }
  return out;
}

/** Minerais d'un EEP complétés par ceux lus sur la capture, sans doublon. */
export function mergeOres(deposits, ores) {
  const merged = [...deposits];
  for (const ore of ores) if (!merged.some((d) => fold(d.ore) === fold(ore))) merged.push({ ore });
  return merged;
}
