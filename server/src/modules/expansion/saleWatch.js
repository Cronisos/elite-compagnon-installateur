// Suivi des ventes : provenance de la soute (cargoLots.js), mérites reçus après chaque vente, ventes à 0 mérite avec
// leur cause probable, et ratios mérites / crédits mesurés sur l'historique du joueur.
//
// Le jeu écrit une ligne PowerplayMerits par vente créditée, en général dans la seconde (13 s au plus mesurées). Dans
// une rafale de ventes, l'ordre des lignes ne suit pas toujours celui des ventes (28 oct. 2026, ICZ KC-U b3-4 : le
// gallium crédité avant le béryllium vendu juste avant) : chaque gain va à la vente dont les mérites prévus en sont le
// plus proches, ou à la plus ancienne vente pas encore créditée quand il n'y a pas encore de mesure.
// Après une autre source de mérites (livraison, sauvetage, mission, kill…), les gains suivants lui reviennent, sauf un
// gain qui tombe juste sur les mérites prévus d'une vente pas encore créditée.
//
// Le jeu écrit parfois deux fois la même ligne de mérites et retire le doublon plus tard : à la ligne suivante, parfois
// un quart d'heure après (28 oct. 2026, ICZ KC-U b3-4 : 7 et 7 à 14:55:45, retiré à 15:10:26), ou dans le total du
// Powerplay de la connexion suivante (3 nov. 2026 13:10:54 : 56 de moins). Le retrait corrige la vente qui avait reçu
// le doublon, même close.

import { MeritCounter } from '../../core/merits.js';
import { CargoLots, normType } from './cargoLots.js';
import { lotVerdict, modeAt } from './saleVerdict.js';
import {
  ACQUISITION_BONUS, BULK_DEMAND_FACTOR, MERITS_WINDOW_MS, REINFORCEMENT_PENALTY, RATIOS_SINCE, SMALL_SALE_MERITS,
} from './saleRules.js';

export const SALE_EVENTS = [
  'Location', 'FSDJump', 'CarrierJump', 'Docked', 'Undocked', 'Powerplay', 'PowerplayJoin', 'PowerplayLeave',
  'PowerplayDefect', 'PowerplayMerits', 'MiningRefined', 'CollectCargo', 'EjectCargo', 'MarketBuy', 'MarketSell',
  'CargoTransfer', 'Cargo', 'Died', 'LaunchSRV', 'DockSRV', 'SRVDestroyed', 'Embark', 'Disembark', 'Shutdown',
  'PowerplayCollect',
  // Autres sources de mérites : un gain qui les suit ne vient pas d'une vente
  'PowerplayDeliver', 'MissionCompleted', 'SearchAndRescue', 'RedeemVoucher', 'SellExplorationData',
  'MultiSellExplorationData', 'SellOrganicData', 'Bounty', 'FactionKillBond', 'CapShipBond', 'PVPKill',
  'DeliverPowerMicroResources',
];
const OTHER_SOURCES = new Set(SALE_EVENTS.slice(SALE_EVENTS.indexOf('PowerplayDeliver')));

// Choix de l'app, pas des règles du jeu
const MAX_CASES = 3000;
const RATIO_SAMPLE = 20; // médiane des 20 dernières ventes d'une même sorte
const RATIO_MIN_MERITS = 50; // en dessous, l'arrondi du jeu fausse le ratio (1 t de titane : 2 mérites)
const RATIO_KINDS = new Set(['mined', 'bought', 'rare']);
// Après une autre source, un gain ne revient à une vente d'avant que s'il est à ±25 % de ses mérites prévus (les
// prévisions mesurées tombent à moins de 1 % : 58 829 prévus pour 58 979, 20 260 pour 20 209)
const AFTER_OTHER_SOURCE_MATCH = Math.log(1.25);
const MODES = new Set(['reinforcement', 'acquisition', 'enemy', 'empty', 'unpledged']);
const LOT_KINDS = new Set(['mined', 'bought', 'rare', 'collected', 'unknown']);

const at = (iso) => Date.parse(iso);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * Une vente ne mesure un ratio que si chaque tonne vendue devait compter. Avec des tonnes incertaines (provenance
 * inconnue, ramassées…) ou prévues à 0, on ne sait pas sur quelle part de la vente le jeu a payé : rapporter les mérites
 * aux seules tonnes sûres gonfle le ratio d'autant. Cas réel, 7 nov. 2026, Rivers Depot (Synuefe OU-E c28-2) : 268 t
 * d'iridium dont 243 de provenance inconnue pour l'app (minées sur place la veille, avant le journal lu), 18 311 mérites
 * pour 46,8 M cr. Rapportés aux 25 t sûres : 4 192 par million. Or les 268 t avaient compté : 391 par million, comme
 * les 268 t suivies vendues à 10:33 (18 311 mérites) et les 90 t de 13:49 (6 841). Avec ce faux ratio dans la médiane
 * (4 192 et 391 : 2 291), la prévision de 13:49 annonçait 40 088 mérites pour 6 841 reçus.
 * La vente mélangée reste dans la liste, avec ses mérites et ceux prévus : c'est elle qui mettra les règles de lieu et
 * LOT_BY_LOT_OLDEST_FIRST à l'épreuve, pas le ratio.
 */
const measuresRatio = (c) => !(c.unsure > 0) && !(c.zero > 0);

export function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Résumé des lots d'une vente : tonnes qui comptent, à 0, incertaines, et la sorte dominante parmi celles qui comptent. */
export function judgeLots(lots, here, power, sellPrice) {
  const out = lots.map((l) => ({ count: l.count, kind: l.kind, system: l.system, viaCarrier: l.viaCarrier || undefined, ...lotVerdict(l, here, power, sellPrice) }));
  const sum = (f) => out.filter(f).reduce((s, l) => s + l.count, 0);
  const byKind = new Map();
  for (const l of out) if (l.ok) byKind.set(l.kind, (byKind.get(l.kind) || 0) + l.count);
  const kind = [...byKind].sort((a, b) => b[1] - a[1])[0]?.[0]
    ?? [...out].sort((a, b) => b.count - a.count)[0]?.kind ?? 'unknown';
  return { lots: out, eligible: sum((l) => l.ok === true), zero: sum((l) => l.ok === false), unsure: sum((l) => l.ok == null), kind };
}

/** La cause qui pèse le plus de tonnes parmi les lots qui remplissent la condition. */
function mainCause(lots, ok) {
  const by = new Map();
  for (const l of lots) {
    if (l.ok !== ok || !l.cause) continue;
    const cur = by.get(l.cause) || { cause: l.cause, text: l.text, count: 0 };
    cur.count += l.count;
    by.set(l.cause, cur);
  }
  return [...by.values()].sort((a, b) => b.count - a.count)[0] || null;
}

/** Cause probable d'une vente à 0 mérite. */
export function zeroCause(sale) {
  if (sale.blackMarket) return { cause: 'black-market', text: 'Vente au marché noir : pas de mérites (à vérifier).' };
  const zero = mainCause(sale.lots, false);
  if (zero && zero.count >= sale.eligible) {
    const rest = sale.eligible ? ` (${sale.eligible} t auraient dû compter)` : '';
    return { cause: zero.cause, text: zero.text + rest };
  }
  if (!sale.eligible) {
    const unsure = mainCause(sale.lots, null);
    if (unsure) return { cause: unsure.cause, text: unsure.text };
  }
  if (sale.demand != null && sale.demand < BULK_DEMAND_FACTOR * sale.count) {
    return { cause: 'bulk', text: `Demande de ${sale.demand} t pour ${sale.count} t vendues : taxe de vente en gros probable.` };
  }
  if (sale.expected != null && sale.expected < SMALL_SALE_MERITS) {
    return { cause: 'tiny', text: `Petite vente (≈ ${(Math.round(sale.expected * 10) / 10).toLocaleString('fr-FR')} mérite${Math.round(sale.expected * 10) >= 20 ? 's' : ''} prévu${Math.round(sale.expected * 10) >= 20 ? 's' : ''}) : l'arrondi du jeu peut donner 0 (à vérifier).` };
  }
  return { cause: 'unexplained', text: "Aucune règle connue n'explique ce 0 : à signaler à l'escadron." };
}

const str = (v) => (typeof v === 'string' ? v : null);
const finite = (v) => (Number.isFinite(v) ? v : null);

/** Vente relue de expansion-sales.json : champs attendus seulement, valeurs connues (mode, sorte), sinon écartée. */
export function cleanCase(c) {
  if (!c || typeof c !== 'object' || typeof c.t !== 'string' || typeof c.type !== 'string' || !Number.isFinite(at(c.t))) return null;
  const lots = (Array.isArray(c.lots) ? c.lots : []).filter((l) => l && typeof l === 'object').map((l) => ({
    count: num(l.count),
    kind: LOT_KINDS.has(l.kind) ? l.kind : 'unknown',
    system: str(l.system),
    ...(l.viaCarrier === true ? { viaCarrier: true } : {}),
    ok: typeof l.ok === 'boolean' ? l.ok : null,
    cause: str(l.cause),
    text: str(l.text) ?? '',
    mode: MODES.has(l.mode) ? l.mode : null,
  }));
  return {
    id: str(c.id) ?? `${c.t}|${c.type}`,
    t: c.t,
    type: c.type,
    label: str(c.label) ?? c.type,
    count: num(c.count),
    sellPrice: num(c.sellPrice),
    totalSale: num(c.totalSale),
    avgPricePaid: num(c.avgPricePaid),
    marketId: Number.isFinite(c.marketId) ? c.marketId : null,
    station: str(c.station),
    system: str(c.system),
    here: { power: str(c.here?.power), state: str(c.here?.state) },
    power: str(c.power),
    mode: MODES.has(c.mode) ? c.mode : null,
    lots,
    eligible: num(c.eligible),
    zero: num(c.zero),
    unsure: num(c.unsure),
    kind: LOT_KINDS.has(c.kind) ? c.kind : 'unknown',
    demand: finite(c.demand),
    ...(c.blackMarket === true ? { blackMarket: true } : {}),
    expected: finite(c.expected),
    merits: num(c.merits),
    // Ratio enregistré par une version d'avant sur une vente mélangée : rapporté aux seules tonnes sûres, faux
    ratio: measuresRatio({ unsure: num(c.unsure), zero: num(c.zero) }) ? finite(c.ratio) : null,
    ...(str(c.cause) ? { cause: c.cause, text: str(c.text) ?? '' } : {}),
  };
}

export class SaleWatch {
  /** @param seed état enregistré (saleStore) : lots, systèmes, rares, puissance et ventes mesurées */
  constructor(seed = {}) {
    this.cargo = new CargoLots(seed);
    this.cases = (Array.isArray(seed.cases) ? seed.cases : []).map(cleanCase).filter(Boolean);
    this.counter = new MeritCounter();
    this.pending = []; // ventes de la dernière minute, en attente de leurs mérites
    this.otherSourceAt = -Infinity;
    this.lastCredit = null; // { sale, gain, closed } : dernière ligne de mérites donnée à une vente, pour un doublon retiré
    this.market = null; // dernier Market.json (prix, demande), pour la demande au moment de la vente
    this.cargoFile = null; // dernier Cargo.json
    this.cargoLine = null; // dernière ligne Cargo du vaisseau dans le journal (sans le détail)
    this.cargoSyncedAt = null;
  }

  /**
   * Cargo.json lu. La ligne Cargo du journal ne donne que le total ; Cargo.json, écrit au même moment, donne le détail.
   * Quand les deux correspondent (même heure, même total), tout ce qui précède dans le journal est appliqué : la soute
   * suivie est recalée sur le détail (livraison de mission, dépôt de cargaison… : toute sortie que l'app ne suit pas).
   */
  setCargoFile(file) {
    if (!file || typeof file !== 'object') return false;
    this.cargoFile = file;
    return this.syncCargo();
  }

  syncCargo() {
    const f = this.cargoFile;
    const e = this.cargoLine;
    if (!f || !e || f.timestamp !== e.timestamp || this.cargoSyncedAt === e.timestamp) return false;
    if ((f.Vessel && f.Vessel !== 'Ship') || num(f.Count) !== num(e.Count) || !Array.isArray(f.Inventory)) return false;
    this.cargoSyncedAt = e.timestamp;
    this.cargo.reconcile(f.Inventory);
    return true;
  }

  /** Market.json lu : marchandises rares, et demande de la station au moment d'une vente. */
  setMarket(market) {
    if (!market || typeof market !== 'object') return;
    this.market = market;
    this.cargo.learnMarket(market);
  }

  /** Article du dernier Market.json, s'il est celui de la station où tu es. */
  marketItem(type, marketId = this.cargo.marketId) {
    if (!this.market || marketId == null || this.market.MarketID !== marketId) return null;
    return (this.market.Items || []).find((i) => normType(i.Name) === type) || null;
  }

  /**
   * Ratio mesuré dans un mode, sans extrapolation : même marchandise (si type), sinon même sorte.
   * @returns {{ value, n, source: 'commodity'|'kind', last } | null}
   */
  measured(type, kind, mode) {
    if (!RATIO_KINDS.has(kind)) return null;
    const list = this.cases.filter((c) => c.ratio > 0 && c.kind === kind && c.mode === mode && at(c.t) >= RATIOS_SINCE);
    const pick = (l, source) => {
      if (!l.length) return null;
      const big = l.filter((c) => c.merits >= RATIO_MIN_MERITS);
      const use = (big.length ? big : l).slice(-RATIO_SAMPLE);
      return { value: median(use.map((c) => c.ratio)), n: use.length, source, last: use.at(-1).t };
    };
    return (type != null && pick(list.filter((c) => c.type === type), 'commodity')) || pick(list, 'kind');
  }

  /**
   * Combien de fois un ratio d'acquisition vaut celui du renforcement : mesuré sur une sorte vendue dans les deux modes
   * (celle qui a le plus de ventes), sinon d'après les règles publiées (ACQUISITION_BONUS, REINFORCEMENT_PENALTY).
   * @returns {{ value, source: 'measured'|'published', kind, n }}
   */
  modeFactor() {
    let best = null;
    for (const kind of RATIO_KINDS) {
      const a = this.measured(null, kind, 'acquisition');
      const r = this.measured(null, kind, 'reinforcement');
      if (!a || !r) continue;
      const n = Math.min(a.n, r.n);
      if (!best || n > best.n) best = { value: a.value / r.value, source: 'measured', kind, n };
    }
    return best || { value: (1 + ACQUISITION_BONUS) / (1 - REINFORCEMENT_PENALTY), source: 'published', kind: null, n: 0 };
  }

  /**
   * Ratio mérites par million de crédits vendus, mesuré sur tes ventes créditées.
   * Ordre : même marchandise, même sorte et même mode ; sinon même sorte et même mode ; sinon le ratio de l'autre mode
   * multiplié par modeFactor (marqué « extrapolé », avec le facteur et sa source).
   * @returns {{ value, n, source: 'commodity'|'kind'|'extrapolated', last, factor?, factorSource?, factorKind? } | null}
   */
  ratio(type, kind, mode) {
    const r = this.measured(type, kind, mode);
    if (r) return r;
    const other = mode === 'acquisition' ? 'reinforcement' : mode === 'reinforcement' ? 'acquisition' : null;
    const base = other && this.measured(type, kind, other);
    if (!base) return null;
    const f = this.modeFactor();
    const factor = mode === 'acquisition' ? f.value : 1 / f.value;
    return { ...base, value: base.value * factor, source: 'extrapolated', factor, factorSource: f.source, factorKind: f.kind, factorN: f.n };
  }

  /** Tableau des ratios mesurés : par sorte, mode et marchandise. */
  ratioTable() {
    const groups = new Map();
    for (const c of this.cases) {
      if (!(c.ratio > 0) || !RATIO_KINDS.has(c.kind) || at(c.t) < RATIOS_SINCE) continue;
      const key = `${c.kind}|${c.mode}|${c.type}`;
      if (!groups.has(key)) groups.set(key, { kind: c.kind, mode: c.mode, type: c.type, label: c.label });
    }
    return [...groups.values()].map((g) => ({ ...g, ...this.ratio(g.type, g.kind, g.mode) }))
      .sort((a, b) => a.kind.localeCompare(b.kind) || a.mode.localeCompare(b.mode) || b.value - a.value);
  }

  /** Mérites que vaut une vente d'après les ratios mesurés, ou null sans mesure. */
  expectedFor(type, judged, totalSale, count, mode) {
    if (!judged.eligible) return judged.zero ? 0 : null;
    const r = this.ratio(type, judged.kind, mode);
    return r ? (r.value * totalSale * (judged.eligible / count)) / 1e6 : null;
  }

  /**
   * Applique un événement du journal.
   * @returns {object[]} les ventes dont le délai d'attente des mérites vient de se terminer
   */
  apply(ev) {
    const t = at(ev.timestamp);
    const closed = this.flush(t);
    if (OTHER_SOURCES.has(ev.event)) {
      this.otherSourceAt = t;
      this.cargo.apply(ev); // livraison Powerplay, sauvetage : la marchandise quitte la soute
      return closed;
    }
    if (ev.event === 'PowerplayMerits') {
      this.credit(ev, t);
      this.cargo.apply(ev);
      return closed;
    }
    if (ev.event === 'Powerplay') {
      // Total de la connexion plus bas que le dernier TotalMerits : le jeu a retiré le doublon de la dernière ligne
      const total = this.counter.total;
      if (total != null && Number.isFinite(ev.Merits) && ev.Merits < total && this.lastCredit && total - ev.Merits <= this.lastCredit.gain) this.withdraw(total - ev.Merits);
      this.lastCredit = null;
      this.counter.setTotal(ev.Merits);
    }
    if (ev.event === 'PowerplayDefect' || ev.event === 'PowerplayLeave') this.lastCredit = null;
    const here = this.cargo.placeOf(this.cargo.system);
    const station = this.cargo.station;
    const marketId = ev.MarketID ?? this.cargo.marketId;
    const res = this.cargo.apply(ev);
    if (res?.sold) this.sold(ev, t, res.sold, here, station, marketId);
    if (ev.event === 'Cargo' && (!ev.Vessel || ev.Vessel === 'Ship')) {
      this.cargoLine = ev;
      if (Array.isArray(ev.Inventory)) this.cargoSyncedAt = ev.timestamp; // déjà détaillée : recalée par cargo.apply
      else this.syncCargo();
    }
    return closed;
  }

  sold(ev, t, lots, here, station, marketId) {
    const type = normType(ev.Type);
    const count = Math.round(num(ev.Count));
    if (!count || !lots.length) return;
    const power = this.cargo.power;
    const sellPrice = num(ev.SellPrice);
    const judged = judgeLots(lots, here, power, sellPrice);
    const mode = modeAt(here, power);
    const totalSale = num(ev.TotalSale) || sellPrice * count;
    const item = this.marketItem(type, marketId);
    this.pending.push({
      id: `${ev.timestamp}|${marketId ?? ''}|${type}|${count}`,
      t: ev.timestamp,
      ms: t,
      type,
      label: this.cargo.label(type),
      count,
      sellPrice,
      totalSale,
      avgPricePaid: num(ev.AvgPricePaid),
      marketId: marketId ?? null,
      station,
      system: here.system ?? null,
      here: { power: here.power, state: here.state },
      power,
      mode,
      ...judged,
      demand: item ? num(item.Demand) : null,
      blackMarket: ev.BlackMarket === true || undefined,
      expected: this.expectedFor(type, judged, totalSale, count, mode),
      merits: 0,
    });
  }

  /** Une ligne PowerplayMerits : à quelle vente revient-elle ? */
  credit(ev, t) {
    const before = this.counter.total;
    const diff = this.counter.gain(ev);
    const gained = ev.MeritsGained ?? diff;
    // Doublon retiré par le jeu (le total repart plus bas) : on le reprend sur la vente qui l'avait reçu, même close
    if (before != null && ev.TotalMerits != null && diff < gained) this.withdraw(gained - diff);
    this.lastCredit = null;
    if (!(gained > 0)) return;
    const score = (s) => (s.expected > 0 ? Math.abs(Math.log(gained / s.expected)) : s.expected === 0 ? 10 : null);
    // Une vente d'avant une autre source ne garde sa chance que si elle n'a rien reçu et que le gain tombe sur sa prévision
    const fits = (s) => s.merits <= 0 && s.expected > 0 && score(s) <= AFTER_OTHER_SOURCE_MATCH;
    const candidates = this.pending.filter((s) => s.ms <= t && t - s.ms <= MERITS_WINDOW_MS && (s.ms >= this.otherSourceAt || fits(s)));
    if (!candidates.length) return;
    const open = candidates.filter((s) => s.merits <= 0);
    const pool = open.length ? open : candidates;
    const scored = pool.filter((s) => score(s) != null).sort((a, b) => score(a) - score(b));
    const unscored = pool.filter((s) => score(s) == null);
    let pick = scored[0];
    if (unscored.length && (!pick || score(pick) > Math.log(4))) pick = open.length ? unscored[0] : unscored.at(-1);
    pick.merits += gained;
    this.lastCredit = { sale: pick, gain: gained, closed: false };
  }

  /** Retire un doublon de la vente qui a reçu la dernière ligne (au plus ce que cette ligne lui a donné). */
  withdraw(n) {
    const c = this.lastCredit;
    if (!c || !(n > 0)) return;
    const back = Math.min(n, c.gain);
    c.sale.merits -= back;
    c.gain -= back;
    if (c.closed) this.settle(c.sale);
  }

  /** Clôt les ventes dont la minute d'attente est passée. */
  flush(now) {
    const done = this.pending.filter((s) => now - s.ms > MERITS_WINDOW_MS);
    if (!done.length) return [];
    this.pending = this.pending.filter((s) => now - s.ms <= MERITS_WINDOW_MS);
    return done.map((s) => {
      const sale = this.close(s);
      // Un doublon peut encore être retiré après la clôture : la référence suit la vente close
      if (this.lastCredit?.sale === s) this.lastCredit = { ...this.lastCredit, sale, closed: true };
      return sale;
    });
  }

  /** Ratio et cause probable d'une vente d'après ses mérites. */
  settle(sale) {
    delete sale.cause;
    delete sale.text;
    sale.merits = Math.max(0, sale.merits);
    // Chaque tonne devait compter (measuresRatio) : les mérites se rapportent à toute la vente
    sale.ratio = sale.merits > 0 && sale.eligible > 0 && sale.totalSale > 0 && measuresRatio(sale) ? sale.merits / (sale.totalSale / 1e6) : null;
    if (sale.merits === 0) Object.assign(sale, zeroCause(sale));
    // Un gain alors que toutes les tonnes étaient prévues à 0 : une règle est contredite
    else if (sale.eligible === 0 && sale.zero > 0) Object.assign(sale, { cause: 'rule-contradicted', text: `Règle contredite : ${mainCause(sale.lots, false)?.text || ''}` });
    return sale;
  }

  close(s) {
    const { ms, ...sale } = s;
    this.settle(sale);
    if (!this.cases.some((c) => c.id === sale.id)) this.cases.push(sale);
    if (this.cases.length > MAX_CASES) this.cases.splice(0, this.cases.length - MAX_CASES);
    return sale;
  }

  /** État à enregistrer. Les ventes en attente sont rejouées depuis le journal au prochain lancement. */
  snapshot() {
    return { ...this.cargo.snapshot(), cases: this.cases };
  }
}
