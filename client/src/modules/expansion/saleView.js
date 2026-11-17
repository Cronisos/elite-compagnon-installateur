// Mise en forme des mérites prévus à la vente, commune à l'onglet et à la fenêtre en jeu (sans React : testée seule).

import { compact, dec1, int } from '../../core/format.js';

export const KINDS = { mined: 'miné', bought: 'acheté', rare: 'rare', collected: 'ramassé', unknown: 'inconnu' };
export const MODES = { reinforcement: 'Renforcement', acquisition: 'Acquisition', enemy: 'Système ennemi', empty: 'Sans puissance', unpledged: 'Sans engagement' };
export const RATIO_SOURCES = { commodity: 'mesuré sur cette marchandise', kind: 'mesuré sur la même sorte', extrapolated: "extrapolé de l'autre mode (à vérifier)" };
export const VERDICTS = {
  ok: { label: 'compte', pill: 'pill-good' },
  unproven: { label: 'compte, règle jamais vue', pill: 'pill-warn' }, // règle publiée dont le cas positif n'a jamais été vu
  zero: { label: '0 probable', pill: 'pill-bad' },
  partial: { label: 'en partie à 0', pill: 'pill-warn' },
  unsure: { label: 'incertain', pill: 'pill-info' },
};
const KIND_PLURALS = { mined: 'le minerai', bought: 'le commerce', rare: 'les rares' };

/** Libellé d'une table pour une valeur reçue : seulement les clés propres à la table, sinon la valeur telle quelle. */
export const labelOf = (table, key) => (typeof key === 'string' && Object.hasOwn(table, key) ? table[key] : key ?? '');

/**
 * Source d'un ratio en clair. Extrapolé : avec le facteur appliqué et d'où il vient (une sorte mesurée dans les deux
 * modes, ou les règles publiées).
 */
export function ratioSourceText(ratio) {
  if (!ratio) return '';
  if (ratio.source !== 'extrapolated' || !(ratio.factor > 0)) return labelOf(RATIO_SOURCES, ratio.source);
  // factorN : ventes du mode le moins mesuré de la paire
  const sales = ratio.factorN > 0 ? `, ${int(ratio.factorN)} vente${ratio.factorN > 1 ? 's' : ''}` : '';
  const from = ratio.factorSource === 'measured'
    ? `mesuré sur ${labelOf(KIND_PLURALS, ratio.factorKind) || 'une autre sorte'}${sales}`
    : 'règles publiées';
  return `extrapolé de l'autre mode, × ${dec1(ratio.factor)} (${from}, à vérifier)`;
}

const STALE_SEC = 15 * 60; // un prix de plus d'un quart d'heure peut avoir bougé
const RECENT_SALE_MS = 2 * 60 * 1000; // le résultat d'une vente reste en bas de la fenêtre 2 min, même s'il reste de la soute

/** Âge d'un prix en clair : « à l'instant », « il y a 4 min », « il y a 2 h », « il y a 3 j ». */
export function ageText(sec) {
  if (sec == null || !Number.isFinite(sec)) return '—';
  if (sec < 60) return "à l'instant";
  if (sec < 3600) return `il y a ${Math.round(sec / 60)} min`;
  if (sec < 86400) return `il y a ${Math.round(sec / 3600)} h`;
  return `il y a ${Math.round(sec / 86400)} j`;
}

/** Âge d'un prix maintenant, d'après son horodatage. */
export const priceAge = (price, now = Date.now()) => (price?.at ? Math.max(0, (now - Date.parse(price.at)) / 1000) : null);

/** Source d'un prix en clair. */
export function priceSource(price) {
  if (!price) return 'ouvre le marché en jeu';
  return price.source === 'market' ? 'marché en jeu' : 'ta dernière vente ici';
}

/** Écart entre le prix du marché et ta dernière vente ici, en %, ou null. */
export function priceChange(price) {
  if (!price?.previous?.sellPrice || !price.sellPrice) return null;
  return (price.sellPrice - price.previous.sellPrice) / price.previous.sellPrice;
}

/** Mérites prévus en clair : « ≈ 20 355 », « 0 », « ? ». */
export function meritsText(merits) {
  if (merits == null) return '?';
  return merits === 0 ? '0' : `≈ ${int(merits)}`;
}

/** Résultat d'une vente faite pendant cette escale, en une phrase. */
export function lastSaleText(s) {
  if (!s) return null;
  const head = `Vendu ${int(s.count)} t de ${s.label}`;
  if (s.merits === 0) return `${head} : 0 mérite. ${s.text || ''}`.trim();
  const expected = s.expected ? ` (prévu ≈ ${int(s.expected)})` : '';
  return `${head} : ${int(s.merits)} mérites${expected}.`;
}

/**
 * Contenu de la fenêtre en jeu (HudFrame), ou null s'il n'y a rien à montrer.
 * @param f prévision du serveur (GET /sale) ; now : instant présent, pour l'âge du prix
 */
export function hudProps(f, now = Date.now()) {
  if (!f?.docked || (!f.lines.length && !f.lastSale && !f.waiting)) return null;
  const t = f.total;
  const zero = t.zero > 0;
  const prices = f.lines.map((l) => l.price).filter(Boolean);
  const oldest = prices.length ? Math.max(...prices.map((p) => priceAge(p, now) ?? 0)) : null;
  const source = prices.length ? priceSource(prices[0]) : priceSource(null);
  const bad = f.message?.level === 'bad';
  // Mérites d'un ratio extrapolé, ou tonnes qui « comptent » d'après une règle jamais vue créditée : jamais affichés
  // comme sûrs, ni en vert (le serveur le dit aussi dans son message, de niveau info)
  const estimated = Boolean(t.estimated) && t.merits > 0;
  const unverified = t.unverified > 0;
  let last = f.message?.text || '';
  let tag = bad ? 'Attention' : f.message?.level === 'warn' ? 'Conseil' : estimated || unverified ? 'À vérifier' : 'Ici';
  if (f.waiting) {
    tag = 'Vendu';
    last = 'Vente faite : en attente de ses mérites (une minute au plus).';
  } else if (f.lastSale && (!f.lines.length || now - Date.parse(f.lastSale.t) < RECENT_SALE_MS)) {
    tag = 'Vendu';
    last = lastSaleText(f.lastSale);
  }
  return {
    title: '🚩 Vente',
    seconds: null,
    tag,
    cells: [
      {
        label: 'Ici, mérites',
        value: f.lines.length ? `${meritsText(t.merits)}${estimated ? ' ?' : ''}` : f.lastSale ? int(f.lastSale.merits) : '…',
        sub: f.lines.length ? (estimated ? (t.complete ? 'estimé, à vérifier' : 'estimé, en partie') : t.complete ? '' : 'en partie') : 'obtenus',
        big: true,
        color: zero || (f.lastSale && f.lastSale.merits === 0 && !f.lines.length) ? '#ff6b6b' : f.lines.length && estimated ? '#ff9a3c' : '#ffd24a',
        alert: zero && !t.eligible,
      },
      {
        label: 'Soute',
        value: f.lines.length ? `${int(t.tonnes)} t` : '—',
        sub: zero ? `${int(t.zero)} t à 0` : t.unsure ? `${int(t.unsure)} t incertaines` : unverified ? (t.unverified >= t.tonnes ? 'règle jamais vue' : `${int(t.unverified)} t, règle jamais vue`) : f.lines.length ? 'tout compte' : '',
        color: zero ? '#ff6b6b' : t.unsure || unverified ? '#ff9a3c' : '#5fd38d',
        warn: zero,
      },
      {
        label: 'Prix',
        value: prices.length ? ageText(oldest) : '—',
        text: true,
        sub: source,
        color: oldest != null && oldest > STALE_SEC ? '#ff9a3c' : '#6fd3ff',
        warn: oldest != null && oldest > STALE_SEC,
      },
    ],
    last,
  };
}

/** Valeur d'une vente : « 303,9 M cr ». */
export const saleValue = (cr) => `${compact(cr)} cr`;
