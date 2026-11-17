// Recherche, filtres, lexique et liens profonds de la page Règles du jeu (fonctions pures, testées).

/** Texte comparable : sans accents ni majuscules, apostrophes et espaces unifiées (« d’extraction » = « d'extraction »). */
export function normalize(s) {
  return String(s ?? '')
    .replace(/œ/g, 'oe')
    .replace(/Œ/g, 'OE')
    .replace(/æ/g, 'ae')
    .replace(/Æ/g, 'AE')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

const NF = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 4 });

/** 120000 → « 120 000 » ; 0.3 → « 0,3 ». */
export const formatNumber = (n) => (typeof n === 'number' && Number.isFinite(n) ? NF.format(n) : '—');

/** « 2026-11-01 » → « 1er nov. 2026 » ; « 2026-04 » → « avril 2026 ». */
export function formatDay(s) {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(String(s ?? ''));
  if (!m) return '';
  const [, y, mo, d] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d || 1)));
  if (!d) return date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const out = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return out.replace(/^1 /, '1er ');
}

/** Tout ce qu'on peut chercher dans une règle : français, anglais, valeurs, preuves, sources, identifiant. */
function haystack(rule) {
  const parts = [
    rule.id,
    rule.title,
    rule.statement,
    ...(rule.terms || []).flatMap((t) => [t.fr, t.en]),
    ...(rule.values || []).flatMap((v) => [v.label, v.unit, String(v.value), formatNumber(v.value)]),
    ...(rule.evidence || []),
    ...(rule.caveats || []),
    ...(rule.sources || []).flatMap((s) => [s.label, s.detail, s.url]),
    ...(rule.journal || []),
  ];
  return normalize(parts.filter(Boolean).join(' \n '));
}

/** La règle contient-elle tous les mots de la recherche ? */
export function ruleMatches(rule, query) {
  const words = normalize(query).split(' ').filter(Boolean);
  if (!words.length) return true;
  const text = haystack(rule);
  return words.every((w) => text.includes(w));
}

/** Règles visibles : recherche, statut ('all' ou un statut) et fiche ('all' ou une fiche). */
export function visibleRules(rules, { q = '', status = 'all', sheet = 'all' } = {}) {
  return (rules || []).filter(
    (r) => (status === 'all' || r.status === status) && (sheet === 'all' || r.sheet === sheet) && ruleMatches(r, q)
  );
}

/** Nombre de règles par statut, pour une recherche et une fiche données (compteurs des filtres). */
export function countByStatus(rules, { q = '', sheet = 'all' } = {}) {
  const counts = new Map();
  for (const r of visibleRules(rules, { q, sheet })) counts.set(r.status, (counts.get(r.status) || 0) + 1);
  return counts;
}

/** Lexique : chaque paire français ↔ anglais une seule fois, avec les règles qui l'emploient, dans l'ordre alphabétique français. */
export function glossary(rules, q = '') {
  const words = normalize(q).split(' ').filter(Boolean);
  const byPair = new Map();
  for (const r of rules || []) {
    for (const t of r.terms || []) {
      const key = `${t.fr}\u0000${t.en}`;
      if (!byPair.has(key)) byPair.set(key, { fr: t.fr, en: t.en, note: t.note || '', rules: [] });
      const entry = byPair.get(key);
      if (!entry.note && t.note) entry.note = t.note;
      if (!entry.rules.includes(r.id)) entry.rules.push(r.id);
    }
  }
  return [...byPair.values()]
    .filter((e) => words.every((w) => normalize(`${e.fr} ${e.en}`).includes(w)))
    .sort((a, b) => a.fr.localeCompare(b.fr, 'fr', { sensitivity: 'base' }));
}

/**
 * Cible d'un lien profond (#pp-portee, #powerplay, #lexique) : { kind, id } ou null si elle n'existe pas.
 * Le fragment vient de l'adresse : il est décodé prudemment et comparé aux seuls identifiants connus.
 */
export function findTarget(hash, ref) {
  let id = String(hash ?? '').replace(/^#/, '');
  try {
    id = decodeURIComponent(id);
  } catch {
    return null;
  }
  if (!id) return null;
  if (id === 'lexique') return { kind: 'glossary', id };
  const rule = (ref?.rules || []).find((r) => r.id === id);
  if (rule) return { kind: 'rule', id, sheet: rule.sheet };
  if ((ref?.sheets || []).some((s) => s.id === id)) return { kind: 'sheet', id };
  return null;
}
