// Prévision à quai : ce que ta soute rapporterait en mérites si tu la vendais ici, lot par lot, avec l'âge et la source
// du prix, l'alerte de vente en gros et une répartition proposée. Rien n'est automatique : l'app conseille, tu vends.
// Et l'export en texte des ventes mesurées, à coller dans Discord (sans tableau, sans nom ni solde).

import { BULK_DEMAND_FACTOR } from './saleRules.js';
import { describePlace, KIND_LABELS, labelOf, MODE_LABELS, modeAt } from './saleVerdict.js';
import { judgeLots } from './saleWatch.js';
import { discordName } from '../../core/discord.js';

const MAX_PARTS = 6;
const TRADED_KINDS = new Set(['mined', 'bought', 'rare']); // provenance suivie d'une marchandise qui se vend au marché
const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const int = (n) => nf.format(Math.round(n));
const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const LONG_TEXT = 400; // phrase de l'app qui cite des noms (cause probable, provenance) : bornée plus large qu'un nom

/**
 * Répartition d'une vente trop grosse pour la demande : chaque part reste sous le quart de la demande restante (la
 * demande baisse de ce qui est vendu). Ce qui ne passe pas reste pour une autre station ou plus tard. Que la vente en
 * plusieurs fois évite la taxe est à vérifier.
 * @returns {{ demand, limit, parts: number[], leftover } | null} null si la demande suffit
 */
export function bulkPlan(count, demand) {
  if (demand == null || !(count > 0) || demand >= BULK_DEMAND_FACTOR * count) return null;
  const parts = [];
  let d = demand;
  let left = count;
  while (left > 0 && parts.length < MAX_PARTS) {
    const p = Math.min(left, Math.floor(d / BULK_DEMAND_FACTOR));
    if (p < 1) break;
    parts.push(p);
    d -= p;
    left -= p;
  }
  return { demand, limit: Math.floor(demand / BULK_DEMAND_FACTOR), parts, leftover: left };
}

/** Prix de vente ici : Market.json de la station, sinon ta dernière vente ici. Avec sa source et son âge. */
export function priceInfo(watch, type, now) {
  const item = watch.marketItem(type);
  const last = [...watch.cases].reverse().find((c) => c.type === type && c.marketId != null && c.marketId === watch.cargo.marketId);
  const previous = last ? { sellPrice: last.sellPrice, at: last.t } : null;
  if (item) {
    const at = watch.market.timestamp ?? null;
    return {
      sellPrice: Number(item.SellPrice) || 0,
      demand: Number(item.Demand) || 0,
      consumer: item.Consumer === true,
      source: 'market',
      at,
      ageSec: at ? Math.max(0, Math.round((now - Date.parse(at)) / 1000)) : null,
      previous,
    };
  }
  if (last) return { sellPrice: last.sellPrice, demand: null, consumer: null, source: 'sale', at: last.t, ageSec: Math.max(0, Math.round((now - Date.parse(last.t)) / 1000)), previous: null };
  return null;
}

const marketIsHere = (watch) => watch.market && watch.cargo.marketId != null && watch.market.MarketID === watch.cargo.marketId;

/** Ligne de la prévision pour une marchandise de la soute. */
function line(watch, item, here, mode, now) {
  const lots = watch.cargo.peek(item.type, item.count);
  const price = priceInfo(watch, item.type, now);
  const judged = judgeLots(lots, here, watch.cargo.power, price?.sellPrice || null);
  // Market.json de cette station sans cette marchandise, ou demande de 1 sans achat : la station ne l'achète pas
  const noDemand = marketIsHere(watch) && (!watch.marketItem(item.type) || (price.demand <= 1 && !price.consumer));
  const ratio = judged.eligible ? watch.ratio(item.type, judged.kind, mode) : null;
  const merits = !judged.eligible ? (judged.zero === item.count ? 0 : null)
    : ratio && price?.sellPrice ? (ratio.value * price.sellPrice * judged.eligible) / 1e6 : null;
  const bulk = noDemand ? null : bulkPlan(item.count, price?.demand ?? null);
  // Estimation : ratio extrapolé de l'autre mode (facteur des règles publiées ou d'une autre sorte), jamais mesuré ici
  const estimated = merits != null && merits > 0 && ratio?.source === 'extrapolated';
  // Tonnes qui « comptent » d'après une règle dont le cas positif n'a jamais été vu (saleVerdict.js), tant qu'aucune de
  // tes ventes de la sorte du lot n'a été créditée dans ce mode (ratio mesuré ici). Sorte par sorte : un commerce déjà
  // crédité en acquisition ne lève pas la réserve sur le minerai de la même soute.
  const seen = new Map();
  const seenHere = (kind) => {
    if (!seen.has(kind)) seen.set(kind, Boolean(watch.measured(null, kind, mode)));
    return seen.get(kind);
  };
  const unverified = judged.lots.reduce((s, l) => s + (l.ok === true && l.unverified && !seenHere(l.kind) ? l.count : 0), 0);
  const verdict = judged.zero === item.count ? 'zero' : judged.eligible === item.count ? (unverified ? 'unproven' : 'ok') : judged.zero ? 'partial' : 'unsure';
  const origin = originText({ system: here.system, lots: judged.lots });
  // Tout juste acheté pendant cette escale : rien à vendre ici, la fenêtre en jeu ne s'ouvre pas pour ça
  const since = watch.cargo.dockedAt ? Date.parse(watch.cargo.dockedAt) : null;
  const fresh = since != null && lots.every((l) => (l.kind === 'bought' || l.kind === 'rare') && l.t && Date.parse(l.t) >= since);
  // Utile à la fenêtre en jeu : apporté ici, et minée ou achetée (provenance suivie), ou achetée par cette station.
  // Pas pour un objet ramassé ou de provenance inconnue que la station n'achète pas (ou sans Market.json d'ici).
  const known = lots.some((l) => TRADED_KINDS.has(l.kind));
  const relevant = !fresh && (known || (Boolean(marketIsHere(watch)) && !noDemand));
  return { type: item.type, label: item.label || watch.cargo.label(item.type), count: item.count, ...judged, origin, fresh, relevant, price, noDemand, ratio, merits, estimated, unverified, bulk, verdict };
}

const OTHER_MODE = { acquisition: 'reinforcement', reinforcement: 'acquisition' };
const KIND_PLURALS = { mined: 'le minerai', bought: 'le commerce', rare: 'les rares' };
/** D'où vient une estimation : « d'après tes ventes en renforcement × 1,6 (règles publiées) ». */
function estimateText(ratio, mode) {
  const factor = Number.isFinite(ratio?.factor) ? ` × ${nf1.format(ratio.factor)}` : '';
  const from = ratio?.factorSource === 'measured' ? `facteur mesuré sur ${labelOf(KIND_PLURALS, ratio.factorKind) || 'une autre sorte'}` : 'règles publiées';
  return `d'après tes ventes en ${labelOf(MODE_LABELS, OTHER_MODE[mode]) || "l'autre mode"}${factor} (${from})`;
}

/** Message principal de la prévision : le plus important d'abord. */
function message(lines, here, mode, power) {
  const fmtParts = (b) => b.parts.map(int).join(', ');
  if (mode === 'unpledged') return { level: 'bad', text: "Tu n'es engagé auprès d'aucune puissance : pas de mérites." };
  const zero = [...lines].filter((l) => l.zero > 0).sort((a, b) => b.zero - a.zero)[0];
  if (zero) {
    const cause = zero.lots.find((l) => l.ok === false)?.text || '';
    const head = zero.zero === zero.count ? `${zero.label} : 0 mérite probable` : `${zero.label} : ${int(zero.zero)} t sur ${int(zero.count)} à 0 probable`;
    return { level: 'bad', text: `${head}. ${cause}` };
  }
  const noDemand = lines.find((l) => l.noDemand);
  if (noDemand) return { level: 'warn', text: `Cette station n'achète pas ${noDemand.label}.` };
  const bulk = lines.find((l) => l.bulk);
  if (bulk) {
    const b = bulk.bulk;
    const rest = b.leftover ? `, le reste (${int(b.leftover)} t) ailleurs ou plus tard` : '';
    return { level: 'warn', text: `${bulk.label} : demande de ${int(b.demand)} t, moins de ${BULK_DEMAND_FACTOR} × ${int(bulk.count)} t. Taxe de vente en gros : vends au plus ${int(b.limit)} t à la fois (${fmtParts(b)} t${rest}).` };
  }
  const unsure = lines.find((l) => l.unsure > 0);
  if (unsure) return { level: 'warn', text: `${unsure.label} : ${unsure.lots.find((l) => l.ok == null)?.text || 'règle inconnue.'}` };
  const modeLabel = labelOf(MODE_LABELS, mode);
  // Ni « compte » ni mérites présentés comme sûrs quand ils reposent sur une règle jamais vue ou un ratio extrapolé
  const unproven = lines.find((l) => l.unverified > 0);
  if (unproven) {
    const merits = unproven.estimated ? ` ; mérites estimés ${estimateText(unproven.ratio, mode)}` : !unproven.ratio ? ' ; la première vente donnera le ratio' : '';
    return { level: 'info', text: `${unproven.label} : compte d'après la règle publiée, jamais vue créditée en ${modeLabel}${merits}. À vérifier.` };
  }
  const unmeasured = lines.find((l) => l.eligible && !l.ratio);
  if (unmeasured) return { level: 'info', text: `${unmeasured.label} : aucune vente mesurée en ${modeLabel} pour l'instant, la première vente donnera le ratio.` };
  const estimated = lines.find((l) => l.estimated);
  if (estimated) return { level: 'info', text: `${estimated.label} : aucune vente créditée en ${modeLabel} pour l'instant, mérites estimés ${estimateText(estimated.ratio, mode)}. À vérifier.` };
  if (!lines.length) return null;
  return { level: 'ok', text: `Ici, ${describePlace(here)} (${labelOf(MODE_LABELS, mode)}) : ta soute compte pour ${power}.` };
}

/** Lignes sur lesquelles porte le conseil : utiles d'abord, sinon apportées, sinon toutes. */
function advised(lines) {
  const relevant = lines.filter((l) => l.relevant);
  if (relevant.length) return relevant;
  const brought = lines.filter((l) => !l.fresh);
  return brought.length ? brought : lines;
}

/**
 * Prévision pour la soute, à quai.
 * @param watch SaleWatch
 * @param inventory [{ type, label, count }] : soute du vaisseau (Cargo.json), hors cargaison de mission
 * @param now instant présent (ms)
 */
export function saleForecast(watch, inventory, now = Date.now()) {
  const c = watch.cargo;
  const here = c.placeOf(c.system);
  const mode = modeAt(here, c.power);
  const items = inventory.filter((i) => i.count > 0 && !c.notForSale(i.type));
  const lines = c.docked ? items.map((i) => line(watch, i, here, mode, now)) : [];
  const known = lines.filter((l) => l.merits != null);
  const sum = (f) => lines.reduce((s, l) => s + f(l), 0);
  const recent = (s) => c.dockedAt && s.marketId === c.marketId && Date.parse(s.t) >= Date.parse(c.dockedAt);
  const lastClosed = [...watch.cases].reverse().find(recent) || null;
  const waiting = watch.pending.filter(recent).length;
  return {
    docked: c.docked,
    station: c.station,
    stationType: c.stationType,
    system: c.system,
    power: c.power,
    here: { power: here.power, state: here.state, place: describePlace(here), mode, modeLabel: labelOf(MODE_LABELS, mode) },
    market: marketIsHere(watch) ? { at: watch.market.timestamp ?? null } : null,
    lines,
    total: {
      tonnes: sum((l) => l.count),
      eligible: sum((l) => l.eligible),
      zero: sum((l) => l.zero),
      unsure: sum((l) => l.unsure),
      merits: known.length ? known.reduce((s, l) => s + l.merits, 0) : null,
      complete: lines.every((l) => l.merits != null),
      estimated: lines.some((l) => l.estimated), // une part des mérites vient d'un ratio extrapolé : à vérifier
      unverified: sum((l) => l.unverified), // tonnes qui comptent d'après une règle jamais vue créditée
    },
    // Le conseil porte d'abord sur ce que tu as apporté pour le vendre, pas sur ce que tu viens d'acheter ici
    message: c.docked ? message(advised(lines), here, mode, c.power) : null,
    lastSale: lastClosed && { t: lastClosed.t, label: lastClosed.label, count: lastClosed.count, merits: lastClosed.merits, expected: lastClosed.expected, cause: lastClosed.cause || null, text: lastClosed.text || null },
    waiting,
  };
}

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
/** « 31 oct. 23:09 UTC » : en UTC, comme les semaines Powerplay, pour l'escadron où qu'il soit. */
export function utcStamp(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

/** Provenance d'une vente en clair : « miné sur place », « miné à Gungnir », « acheté à Cemiess »… */
export function originText(sale) {
  const by = new Map();
  for (const l of sale.lots || []) {
    const key = `${l.kind}|${l.system || ''}`;
    by.set(key, { kind: l.kind, system: l.system, count: (by.get(key)?.count || 0) + l.count });
  }
  const parts = [...by.values()].sort((a, b) => b.count - a.count).map((g) => {
    const where = g.kind === 'unknown' ? '' : g.system === sale.system ? ' sur place' : g.system ? ` à ${g.system}` : '';
    return `${by.size > 1 ? `${int(g.count)} t ` : ''}${labelOf(KIND_LABELS, g.kind) || 'provenance inconnue'}${where}`;
  });
  return parts.join(' + ') || 'provenance inconnue';
}

/**
 * Ventes mesurées, en texte prêt à coller dans Discord (une ligne par vente, sans tableau). Les noms du journal
 * (systèmes, stations de colonie, marchandises) et les phrases qui les citent passent par discordName
 * (core/discord.js) : ni mention, ni lien, ni mise en forme venue d'un nom.
 */
export function casesText(cases, { zeroOnly = false, now = Date.now() } = {}) {
  const list = cases.filter((c) => !zeroOnly || c.merits === 0);
  const head = `**${zeroOnly ? 'Ventes Powerplay à 0 mérite' : 'Ventes Powerplay mesurées'}** (Elite Compagnon, relevé du ${utcStamp(new Date(now).toISOString())})`;
  const lines = [...list].reverse().map((c) => {
    const state = describePlace({ power: c.here?.power, state: c.here?.state });
    const modeLabel = labelOf(MODE_LABELS, c.mode);
    const mode = modeLabel && modeLabel !== state ? `, ${modeLabel}` : '';
    const place = `${discordName(c.system) || '?'} (${discordName(state)}${mode})`;
    const value = c.totalSale >= 1e5 ? `${nf1.format(c.totalSale / 1e6)} M cr` : `${int(c.totalSale)} cr`;
    const result = c.merits === 0 ? `**0 mérite** · cause probable : ${discordName(c.text, LONG_TEXT) || 'inconnue'}` : `${int(c.merits)} mérites${c.ratio ? ` (${int(c.ratio)} par M cr)` : ''}`;
    return `- ${utcStamp(c.t)} · ${discordName(c.label)} ${int(c.count)} t · ${value} · vendu à ${place} · ${discordName(originText(c), LONG_TEXT)} · ${result}`;
  });
  return [head, ...(lines.length ? lines : ['- aucune vente pour l’instant'])].join('\n');
}
