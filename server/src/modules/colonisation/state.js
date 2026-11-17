// Chantiers de colonisation suivis, reconstruits depuis le journal : un par MarketID (le seul identifiant d'un
// dépôt de construction). Plusieurs chantiers à la fois ; un chantier terminé est gardé et marqué.
//
// Règles de lecture (spécification, README « Module Colonisation ») :
//   - ColonisationConstructionDepot est un INSTANTANÉ absolu (livraisons de tous les CMDR) : il remplace le
//     précédent, et une lecture identique ne change rien. On ne dépend pas de sa fréquence d'écriture.
//   - ColonisationContribution est TA livraison, en delta : gardée avec sa date, et ajoutée à titre provisoire
//     au dernier instantané jusqu'à la lecture suivante (comme EDCT).
//   - Le dépôt n'a ni système ni nom : ils viennent du dernier Docked, Location, DockingGranted… du même MarketID.
//     Rattachement par MarketID seul, sans exiger d'être à quai (EDDiscovery l'a vu écrit après un Touchdown).
//   - ColonisationSystemClaim donne le système REVENDIQUÉ, pas la position : il ne la change pas.
//   - Fin d'un chantier : lue au dépôt (ConstructionComplete), sinon déduite de l'amarrage à la station terminée
//     (même MarketID sans nom de chantier ni service de livraison, ou nouveau MarketID du même système portant le
//     nom du chantier) : un chantier fini par d'autres CMDR n'est pas lu au dépôt par toi.
//
// Persistance (server/data/colonisation.json, écriture atomique) : à chaque démarrage, l'état est reconstruit
// depuis tout l'historique du journal, puis complété par l'archive (chantiers dont les journaux ont disparu,
// nom personnalisé, échéance, notes). « Oublier » un chantier ignore ses événements passés, et les suivants
// jusqu'au prochain amarrage à ce chantier.

import fs from 'node:fs';
import path from 'node:path';
import { writeJsonAtomicSync } from '../../core/atomic.js';
import { COLONISATION_EVENTS, CONTEXT_EVENTS, innerName, isConstructionStation, marketIdOf, parseStationName, readContext, readEvent } from './events.js';
import { COLONISATION_RULES } from '../../regles/colonisation.js';

export const TRACKED_EVENTS = [...COLONISATION_EVENTS, ...CONTEXT_EVENTS];
const TRACKED = new Set(TRACKED_EVENTS);
const COLONISATION = new Set(COLONISATION_EVENTS);
const HERE_TYPES = new Set(['drop', 'docking', 'approach']); // lignes écrites dans le système où tu es, sans son nom

const PROGRESS_TOLERANCE = 1e-6; // ConstructionProgress a 6 décimales
const MAX_CONTRIBUTIONS = 2000; // par chantier
const MAX_MARKETS = 500; // stations gardées en mémoire pour rattacher un dépôt à son nom et à son système
const RAW_KEPT = 30; // derniers événements bruts Colonisation* du diagnostic
const RAW_MAX_CHARS = 20_000;
const CHECKS_KEPT = 100;
const ISSUES_KEPT = 200;

/**
 * Observations documentées que le module vérifie à chaque lecture. Ce ne sont pas des règles connues de
 * Frontier : un écart est noté dans le diagnostic (GET /diagnostics), jamais corrigé en silence.
 */
export const RULES = COLONISATION_RULES; // dépôt des règles : server/src/regles/colonisation.js
const RULE_LABELS = new Map(RULES.map((r) => [r.id, r.label]));

const ms = (iso) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};
const later = (a, b) => (a == null ? b : b == null ? a : ms(b) > ms(a) ? b : a);
const earlier = (a, b) => (a == null ? b : b == null ? a : ms(b) < ms(a) ? b : a);
const sumOf = (list, key) => list.reduce((a, r) => a + (Number.isFinite(r[key]) ? r[key] : 0), 0);

/** Clé d'une livraison : même heure, même chantier, mêmes marchandises = même ligne du journal (fusion de l'archive). */
export const contributionKey = (marketId, c) => `${marketId}|${c.at}|${c.items.map((i) => `${i.symbol}:${i.amount}`).join(',')}`;

function newSite(marketId, at) {
  return {
    marketId,
    station: null, // nom brut (« $EXT_PANEL_ColonisationShip; Judson Depot »)
    stationLabel: null, // nom affiché (« Vaisseau de colonisation · Judson Depot »)
    kind: null, // ship | orbital | planetary | null
    stationType: null, // peu fiable (SurfaceStation ou SpaceConstructionDepot pour un même vaisseau)
    system: null,
    systemAddress: null,
    body: null,
    progress: null, // 0..1
    complete: false,
    failed: false,
    completedAt: null,
    completedBy: null, // 'dépôt' (ConstructionComplete lu) | 'amarrage' (déduit de la station terminée)
    successorMarketId: null, // MarketID de la station terminée, s'il a changé
    failedAt: null,
    resources: [], // [{ symbol, name, required, provided, remaining, payment }]
    provisional: false, // tes livraisons ajoutées depuis la dernière lecture du dépôt
    readings: 0,
    firstSeen: at,
    lastSeen: at,
    updatedAt: null, // dernière lecture du dépôt
    lastDockedAt: null,
    contributions: [], // tes livraisons : [{ at, items: [{ symbol, name, amount }], total, visit }]
    user: { name: null, deadline: null, notes: null, loopMinutes: null, pinned: false },
  };
}

const withRemaining = (r) => ({
  ...r,
  remaining: Number.isFinite(r.required) && Number.isFinite(r.provided) ? Math.max(0, r.required - r.provided) : null,
});

/** Avancement recalculé (Σ livré ÷ Σ demandé), ou null sans besoins connus. */
export function ratioOf(resources) {
  const required = sumOf(resources, 'required');
  return required > 0 ? Math.min(1, sumOf(resources, 'provided') / required) : null;
}

/** Même système : par adresse si les deux la donnent, sinon par nom. */
const sameSystem = (site, c) => (site.systemAddress != null && c.systemAddress != null
  ? site.systemAddress === c.systemAddress
  : Boolean(site.system && c.system) && site.system.toLowerCase() === c.system.toLowerCase());

export class ColonisationState {
  /**
   * @param forgotten [[marketId, { until, waiting }]] chantiers oubliés : événements ignorés jusqu'à `until` (ms),
   *                  et tous tant que `waiting` (en attente d'un nouvel amarrage à ce chantier)
   */
  constructor({ forgotten = [] } = {}) {
    this.sites = new Map(); // MarketID → chantier
    this.markets = new Map(); // MarketID → { station, stationType, system, systemAddress, body, services }
    this.claims = new Map(); // « a:<SystemAddress> » ou « n:<nom> » → revendication
    this.forgotten = new Map(forgotten.map(([id, f]) => [id, { ...f }])); // MarketID → { until, waiting }
    this.position = { system: null, systemAddress: null, docked: false, marketId: null, dockedAt: null };
    this.lastReading = new Map(); // MarketID → Map(symbole → { required, provided }) de la dernière lecture réelle
    this.pending = new Map(); // MarketID → Map(symbole → tonnes livrées par toi depuis cette lecture)
    this.payments = new Map(); // symbole → { payment, at, marketId } : première valeur vue
    this.diag = { counts: new Map(), issues: new Map(), checks: new Map(), raw: [] };
  }

  /** @returns true si un chantier ou une revendication a changé */
  apply(ev) {
    if (!ev || !TRACKED.has(ev.event)) return false;
    if (COLONISATION.has(ev.event)) {
      const e = readEvent(ev);
      if (!e) return false;
      this.noteRaw(ev, e);
      switch (e.type) {
        case 'depot': return this.applyDepot(e);
        case 'contribution': return this.applyContribution(e);
        case 'claim': return this.applyClaim(e, 'claimedAt');
        case 'release': return this.applyClaim(e, 'releasedAt');
        case 'beacon': return this.applyBeacon(e);
        default: return false; // CompleteConstruction : seulement noté (diagnostic)
      }
    }
    const c = readContext(ev);
    return c ? this.applyContext(c) : false;
  }

  /** Événement à ignorer : antérieur à l'oubli, ou postérieur mais sans nouvel amarrage depuis. */
  isForgotten(marketId, at) {
    const f = this.forgotten.get(marketId);
    return f != null && (f.waiting || (ms(at) ?? 0) <= f.until);
  }

  /** Nouvel amarrage à un chantier oublié : il revient, sans rien de ce qui précède cet amarrage. */
  redock(c) {
    const f = this.forgotten.get(c.marketId);
    const t = ms(c.at);
    if (!f?.waiting || t == null || t <= f.until) return;
    f.until = t - 1;
    f.waiting = false;
  }

  ensureSite(marketId, at) {
    let site = this.sites.get(marketId);
    if (!site) {
      site = newSite(marketId, at);
      this.sites.set(marketId, site);
      const m = this.markets.get(marketId);
      if (m) this.setStation(site, m);
    }
    site.firstSeen = earlier(site.firstSeen, at);
    site.lastSeen = later(site.lastSeen, at);
    return site;
  }

  /** Nom, type et système d'une station (champs connus seulement). */
  setStation(site, info) {
    if (info.station) {
      const p = parseStationName(info.station);
      // À la fin, le nom perd son préfixe : on garde celui du chantier
      if (p.kind || !site.station) {
        site.station = info.station;
        site.kind = p.kind ?? site.kind;
        site.stationLabel = p.label;
      }
    }
    for (const k of ['stationType', 'system', 'systemAddress', 'body']) if (info[k] != null) site[k] = info[k];
  }

  rememberMarket(c) {
    if (c.marketId == null) return;
    const before = this.markets.get(c.marketId) || {};
    const info = { ...before };
    for (const k of ['station', 'stationType', 'system', 'systemAddress', 'body', 'services']) if (c[k] != null) info[k] = c[k];
    // Approche d'un établissement, demande d'amarrage, sortie de supercroisière sur une cible : ces lignes n'ont pas le
    // nom du système (au mieux son adresse), mais elles sont écrites dans le système où tu es
    const here = HERE_TYPES.has(c.type) && (c.systemAddress == null || c.systemAddress === this.position.systemAddress);
    if (!info.system && here && this.position.system) {
      info.system = this.position.system;
      info.systemAddress ??= this.position.systemAddress;
    }
    this.markets.delete(c.marketId);
    this.markets.set(c.marketId, info);
    if (this.markets.size > MAX_MARKETS) this.markets.delete(this.markets.keys().next().value);
  }

  applyContext(c) {
    const p = this.position;
    const wasAt = p.docked ? p.marketId : null;
    if (c.type === 'dock' || c.type === 'location' || c.type === 'jump') {
      if (c.system) p.system = c.system;
      if (c.systemAddress != null) p.systemAddress = c.systemAddress;
    }
    let changed = false;
    switch (c.type) {
      case 'dock':
        p.docked = true;
        p.marketId = c.marketId;
        p.dockedAt = c.at;
        break;
      case 'location':
        p.docked = false;
        p.marketId = null;
        break;
      case 'undock':
        p.docked = false;
        p.marketId = null;
        break;
      case 'jump':
        if (c.leftStation) {
          p.docked = false;
          p.marketId = null;
        }
        break;
      default:
        break;
    }
    this.rememberMarket(c);
    if (c.type === 'dock' && c.marketId != null) this.redock(c);
    if (c.marketId != null && !this.isForgotten(c.marketId, c.at)) {
      const known = this.sites.get(c.marketId);
      // Amarrage à un chantier : il est suivi dès maintenant, ses besoins viendront du dépôt
      if (known || (c.type === 'dock' && isConstructionStation(c))) {
        const site = this.ensureSite(c.marketId, c.at);
        this.setStation(site, this.markets.get(c.marketId));
        if (c.type === 'dock') site.lastDockedAt = c.at;
        changed = true;
      }
    }
    if (c.type === 'dock' && this.finishedFromDock(c)) changed = true;
    const nowAt = p.docked ? p.marketId : null;
    if (wasAt !== nowAt && (this.sites.has(wasAt) || this.sites.has(nowAt))) changed = true;
    return changed;
  }

  /**
   * Amarrage à une station qui n'est plus un chantier : la fin de chantier n'a pas été lue au dépôt (finie par
   * d'autres CMDR, ou dépôt jamais rouvert). Même MarketID : nom sans préfixe de chantier ou services sans
   * « colonisationcontribution ». Nouveau MarketID (port primaire : 3963439106 → 4351826691) : même système et
   * même nom que la partie libre du nom du chantier (« Judson Depot »). @returns true si un chantier est terminé.
   */
  finishedFromDock(c) {
    if (c.marketId == null || typeof c.station !== 'string' || !c.station.trim()) return false;
    if (isConstructionStation(c)) return false;
    const known = this.sites.get(c.marketId);
    if (known) {
      if (known.complete || known.failed) return false;
      const why = parseStationName(c.station).kind ? 'sans le service de livraison' : 'sans nom de chantier';
      this.finish(known, c, `Amarrage à « ${c.station} » (même MarketID, ${why})`);
      return true;
    }
    if (parseStationName(c.station).kind) return false;
    const name = c.station.trim().toLowerCase();
    let found = false;
    for (const site of this.sites.values()) {
      if (site.complete || site.failed || !sameSystem(site, c)) continue;
      const own = parseStationName(site.station).name;
      if (!own || own.toLowerCase() !== name) continue;
      site.successorMarketId = c.marketId;
      this.finish(site, c, `Amarrage à « ${c.station} », nouveau MarketID ${c.marketId}, même système et même nom`);
      found = true;
    }
    return found;
  }

  /** Chantier terminé d'après l'amarrage : rien ne reste à livrer ; noté au diagnostic. */
  finish(site, c, detail) {
    const before = site.progress;
    site.complete = true;
    site.completedAt = c.at ?? site.completedAt;
    site.completedBy = 'amarrage';
    site.progress = 1;
    site.provisional = false;
    site.lastSeen = later(site.lastSeen, c.at);
    this.pending.delete(site.marketId);
    this.check('complete-read', site.marketId, null, c.at, `${detail} ; dernière lecture du dépôt : ${before == null ? 'aucune' : `${(before * 100).toFixed(1)} %`}`);
  }

  applyDepot(d) {
    if (d.marketId == null || this.isForgotten(d.marketId, d.at)) return false;
    const site = this.ensureSite(d.marketId, d.at);
    site.readings++;
    if (site.updatedAt && d.at && ms(d.at) < ms(site.updatedAt)) return false; // lecture plus ancienne que la dernière
    if (site.completedBy === 'amarrage' && d.at && ms(d.at) <= ms(site.completedAt)) return false; // d'avant la fin déduite
    // Lecture sans liste de marchandises (champ absent ou illisible, noté au diagnostic) : on garde la précédente
    const fresh = d.resources.map(withRemaining);
    const resources = fresh.length || !site.resources.length ? fresh : site.resources.map((r) => ({ ...r }));
    const same = site.updatedAt && !site.provisional
      && d.progress === site.progress && (d.complete === true) === site.complete && (d.failed === true) === site.failed
      && resources.length === site.resources.length
      && resources.every((r, i) => r.symbol === site.resources[i].symbol && r.required === site.resources[i].required && r.provided === site.resources[i].provided);
    this.checkDepot(site, d, resources);
    site.updatedAt = d.at ?? site.updatedAt;
    if (same) return false; // instantané inchangé (écrit toutes les 15 s à quai, selon les schémas)
    site.resources = resources.map(({ rawName, ...r }) => r);
    site.progress = d.progress ?? ratioOf(resources);
    site.complete = d.complete === true;
    site.failed = d.failed === true;
    if (site.complete) {
      site.completedAt = earlier(site.completedAt, d.at);
      site.completedBy = 'dépôt';
    }
    // Lecture plus récente qui dit « en cours » : une fin déduite de l'amarrage était fausse
    if (!site.complete) Object.assign(site, { completedAt: null, completedBy: null, successorMarketId: null });
    if (site.failed && !site.failedAt) site.failedAt = d.at;
    site.provisional = false;
    return true;
  }

  applyContribution(c) {
    if (c.marketId == null || !c.items.length || this.isForgotten(c.marketId, c.at)) return false;
    const site = this.ensureSite(c.marketId, c.at);
    const p = this.position;
    const entry = {
      at: c.at,
      items: c.items.map(({ symbol, name, amount }) => ({ symbol, name, amount })),
      total: c.items.reduce((a, i) => a + i.amount, 0),
      // Passage à quai : l'heure de l'amarrage, si tu es à quai à ce chantier (durée d'une boucle)
      visit: p.docked && p.marketId === c.marketId ? p.dockedAt : null,
    };
    const key = contributionKey(c.marketId, entry);
    if (site.contributions.some((x) => contributionKey(c.marketId, x) === key)) return false;
    site.contributions.push(entry);
    if (site.contributions.length > MAX_CONTRIBUTIONS) site.contributions.splice(0, site.contributions.length - MAX_CONTRIBUTIONS);
    // Contrôles : marchandise attendue par le chantier, casse du nom
    const needs = new Set(site.resources.map((r) => r.symbol));
    for (const i of c.items) {
      if (site.resources.length && !needs.has(i.symbol)) this.check('contribution-known', site.marketId, i.symbol, c.at, `« ${i.rawName} » (${i.symbol}) ne figure pas dans les besoins du chantier`);
      const inner = innerName(i.rawName);
      if (inner && inner === inner.toLowerCase() && /[a-z]/.test(inner)) this.check('name-case-contribution', site.marketId, i.symbol, c.at, `« ${i.rawName} » est en minuscules`);
    }
    // Ajout provisoire au dernier instantané, remplacé par la prochaine lecture du dépôt
    const pending = this.pending.get(site.marketId) || new Map();
    this.pending.set(site.marketId, pending);
    for (const i of c.items) {
      pending.set(i.symbol, (pending.get(i.symbol) || 0) + i.amount);
      const r = site.resources.find((x) => x.symbol === i.symbol);
      if (!r || !Number.isFinite(r.provided)) continue;
      r.provided = Number.isFinite(r.required) ? Math.min(r.required, r.provided + i.amount) : r.provided + i.amount;
      Object.assign(r, withRemaining(r));
      site.provisional = true;
    }
    if (site.provisional) site.progress = ratioOf(site.resources) ?? site.progress;
    return true;
  }

  claimKey(system, systemAddress) {
    if (systemAddress != null) return `a:${systemAddress}`;
    return system ? `n:${system.toLowerCase()}` : 'inconnu';
  }

  applyClaim(e, field) {
    // Le système revendiqué n'est pas la position : on ne touche pas à this.position
    const key = this.claimKey(e.system, e.systemAddress);
    const claim = this.claims.get(key) || { system: e.system, systemAddress: e.systemAddress, claimedAt: null, releasedAt: null, beaconAt: null };
    if (e.system) claim.system = e.system;
    claim[field] = e.at;
    if (field === 'claimedAt') claim.releasedAt = null; // revendiqué de nouveau après un abandon
    this.claims.set(key, claim);
    return true;
  }

  applyBeacon(e) {
    // Aucun champ : le système est celui de la position (dernier FSDJump, Location ou SupercruiseExit)
    const { system, systemAddress } = this.position;
    const key = this.claimKey(system, systemAddress);
    const claim = this.claims.get(key) || { system, systemAddress, claimedAt: null, releasedAt: null, beaconAt: null };
    claim.beaconAt = e.at;
    this.claims.set(key, claim);
    return true;
  }

  // --- Diagnostic ---

  noteRaw(ev, e) {
    const d = this.diag;
    d.counts.set(e.event, (d.counts.get(e.event) || 0) + 1);
    let raw;
    try {
      raw = JSON.stringify(ev);
    } catch {
      raw = '"(illisible)"';
    }
    d.raw.push(raw.length > RAW_MAX_CHARS ? JSON.stringify({ tronque: raw.slice(0, RAW_MAX_CHARS) }) : raw);
    if (d.raw.length > RAW_KEPT) d.raw.shift();
    for (const i of e.issues) {
      const key = `${e.event}|${i.kind}|${i.path}`;
      const found = d.issues.get(key);
      if (found) {
        found.count++;
        found.lastAt = e.at;
      } else if (d.issues.size < ISSUES_KEPT) {
        d.issues.set(key, { event: e.event, kind: i.kind, path: i.path, detail: i.detail ?? null, count: 1, firstAt: e.at, lastAt: e.at });
      }
    }
    if (e.type === 'complete') this.check('complete-event', this.position.docked ? this.position.marketId : null, null, e.at, 'CompleteConstruction écrit par le jeu (rare : à comparer avec ConstructionComplete)');
  }

  /** Écart à une observation documentée : regroupé par règle, chantier et marchandise. */
  check(rule, marketId, symbol, at, detail) {
    const key = `${rule}|${marketId}|${symbol}`;
    const found = this.diag.checks.get(key);
    if (found) {
      found.count++;
      found.lastAt = at;
      found.detail = detail;
      return;
    }
    if (this.diag.checks.size >= CHECKS_KEPT) this.diag.checks.delete(this.diag.checks.keys().next().value);
    this.diag.checks.set(key, { rule, label: RULE_LABELS.get(rule) || rule, marketId, symbol, detail, count: 1, firstAt: at, lastAt: at });
  }

  checkDepot(site, d, resources) {
    const id = site.marketId;
    const ratio = ratioOf(resources);
    if (d.progress != null && ratio != null && Math.abs(d.progress - ratio) > PROGRESS_TOLERANCE) {
      this.check('progress-formula', id, null, d.at, `ConstructionProgress ${d.progress} ; Σ livré ÷ Σ demandé = ${ratio.toFixed(6)}`);
    }
    if (d.complete != null && d.progress != null && d.complete !== (d.progress >= 1)) {
      this.check('complete-progress', id, null, d.at, `ConstructionComplete ${d.complete} avec un avancement de ${d.progress}`);
    }
    const prev = this.lastReading.get(id);
    const mine = this.pending.get(id);
    for (const r of resources) {
      const inner = innerName(r.rawName);
      if (inner && inner !== inner.toLowerCase()) this.check('name-case-depot', id, r.symbol, d.at, `« ${r.rawName} » n'est pas en minuscules`);
      if (Number.isFinite(r.payment)) {
        const seen = this.payments.get(r.symbol);
        if (!seen) this.payments.set(r.symbol, { payment: r.payment, at: d.at, marketId: id });
        else if (seen.payment !== r.payment) this.check('payment-constant', id, r.symbol, d.at, `${r.symbol} : Payment ${r.payment}, vu ${seen.payment} le ${seen.at} (chantier ${seen.marketId})`);
      }
      const before = prev?.get(r.symbol);
      if (!before) continue;
      if (Number.isFinite(before.required) && Number.isFinite(r.required) && before.required !== r.required) {
        this.check('required-stable', id, r.symbol, d.at, `${r.symbol} : demandé ${before.required} t, puis ${r.required} t`);
      }
      if (Number.isFinite(before.provided) && Number.isFinite(r.provided)) {
        const delta = r.provided - before.provided;
        if (delta < 0) this.check('provided-monotonic', id, r.symbol, d.at, `${r.symbol} : livré ${before.provided} t, puis ${r.provided} t`);
        const own = mine?.get(r.symbol) || 0;
        if (own > 0 && delta < own) this.check('contribution-counted', id, r.symbol, d.at, `${r.symbol} : tu as livré ${own} t, le dépôt n'a augmenté que de ${delta} t`);
      }
    }
    if (mine) for (const symbol of mine.keys()) if (resources.length && !resources.some((r) => r.symbol === symbol)) this.check('contribution-known', id, symbol, d.at, `${symbol} livré, absent de la lecture suivante du dépôt`);
    this.lastReading.set(id, new Map(resources.map((r) => [r.symbol, { required: r.required, provided: r.provided }])));
    this.pending.delete(id);
  }

  diagnostics() {
    const d = this.diag;
    return {
      counts: Object.fromEntries([...d.counts].sort()),
      // Champs inconnus, absents ou mal typés, par événement : à regarder avec un vrai journal
      issues: [...d.issues.values()],
      rules: RULES,
      checks: [...d.checks.values()].sort((a, b) => (ms(b.lastAt) ?? 0) - (ms(a.lastAt) ?? 0)),
      // Derniers événements Colonisation* tels qu'écrits par le jeu (rien d'autre du journal)
      raw: d.raw.map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return line;
        }
      }).reverse(),
    };
  }

  // --- Lecture ---

  /** Chantier où tu es à quai, ou null. */
  dockedSite() {
    const p = this.position;
    return p.docked && p.marketId != null ? this.sites.get(p.marketId) || null : null;
  }

  /**
   * Chantier actif (HUD, liste de courses) : celui où tu es à quai, sinon celui que tu as épinglé, sinon le
   * dernier où il s'est passé quelque chose, s'il n'est pas terminé. { site, reason } ou null.
   * @param dockedMarketId MarketID où tu es à quai d'après l'état du jeu, null si tu n'es pas à quai ; absent :
   *                       la position rejouée depuis le journal
   */
  active(dockedMarketId) {
    const docked = dockedMarketId === undefined ? this.dockedSite() : dockedMarketId != null ? this.sites.get(dockedMarketId) : null;
    if (docked) return { site: docked, reason: 'docked' };
    const open = [...this.sites.values()].filter((s) => !s.complete && !s.failed);
    const pinned = open.find((s) => s.user.pinned);
    if (pinned) return { site: pinned, reason: 'pinned' };
    const last = open.sort((a, b) => (ms(b.lastSeen) ?? 0) - (ms(a.lastSeen) ?? 0))[0];
    return last ? { site: last, reason: 'recent' } : null;
  }

  /** Chantiers, en cours d'abord (le plus récent en premier), puis terminés ou échoués. */
  list() {
    return [...this.sites.values()].sort((a, b) => (a.complete || a.failed) - (b.complete || b.failed) || (ms(b.lastSeen) ?? 0) - (ms(a.lastSeen) ?? 0));
  }

  claimList() {
    return [...this.claims.values()].sort((a, b) => (ms(later(b.claimedAt, b.beaconAt)) ?? 0) - (ms(later(a.claimedAt, a.beaconAt)) ?? 0));
  }

  /**
   * Oublier un chantier : retiré ; ses événements passés sont ignorés, aux prochains démarrages aussi, et les
   * suivants (lectures du dépôt, livraisons) jusqu'au prochain amarrage à ce chantier.
   */
  forget(marketId, now = Date.now()) {
    if (!this.sites.has(marketId)) return false;
    this.sites.delete(marketId);
    this.forgotten.set(marketId, { until: now, waiting: true });
    this.lastReading.delete(marketId);
    this.pending.delete(marketId);
    return true;
  }

  // --- Persistance ---

  toJSON() {
    return {
      version: 1,
      sites: [...this.sites.values()],
      forgotten: [...this.forgotten].map(([marketId, f]) => ({ marketId, at: new Date(f.until).toISOString(), waiting: f.waiting })),
      claims: [...this.claims.values()],
    };
  }

  /**
   * Complète l'état reconstruit depuis le journal avec l'archive : chantiers absents (journaux supprimés),
   * réglages du joueur, livraisons plus anciennes, et revendications.
   */
  mergeArchive(archive) {
    // Oubli le plus récent gardé (un nouvel amarrage rejoué depuis le journal l'a déjà avancé ici)
    for (const [marketId, f] of archive.forgotten) {
      const cur = this.forgotten.get(marketId);
      if (!cur || cur.until < f.until) this.forgotten.set(marketId, { ...f });
    }
    for (const old of archive.sites.values()) {
      if (this.isForgotten(old.marketId, old.lastSeen)) continue;
      const cur = this.sites.get(old.marketId);
      if (!cur) {
        this.sites.set(old.marketId, old);
        continue;
      }
      cur.user = { ...cur.user, ...old.user };
      const keys = new Set(cur.contributions.map((c) => contributionKey(cur.marketId, c)));
      const extra = old.contributions.filter((c) => !keys.has(contributionKey(cur.marketId, c)));
      if (extra.length) cur.contributions = [...extra, ...cur.contributions].sort((a, b) => (ms(a.at) ?? 0) - (ms(b.at) ?? 0)).slice(-MAX_CONTRIBUTIONS);
      cur.firstSeen = earlier(cur.firstSeen, old.firstSeen);
      cur.lastSeen = later(cur.lastSeen, old.lastSeen);
      for (const k of ['station', 'stationLabel', 'kind', 'stationType', 'system', 'systemAddress', 'body', 'failedAt', 'lastDockedAt']) if (cur[k] == null) cur[k] = old[k];
      cur.readings = Math.max(cur.readings, old.readings);
      // Archive plus récente que le journal (journaux du dernier jour supprimés ?) : son instantané l'emporte
      if (old.updatedAt && (!cur.updatedAt || ms(old.updatedAt) > ms(cur.updatedAt))) {
        for (const k of ['resources', 'progress', 'complete', 'failed', 'updatedAt', 'provisional', 'completedAt', 'completedBy', 'successorMarketId']) cur[k] = old[k];
      }
      // Fin déduite d'un amarrage dont le journal a disparu, postérieure à la dernière lecture connue : gardée
      if (old.complete && !cur.complete && !cur.failed && old.completedAt && (!cur.updatedAt || ms(old.completedAt) > ms(cur.updatedAt))) {
        for (const k of ['complete', 'completedAt', 'completedBy', 'successorMarketId', 'progress']) cur[k] = old[k];
        cur.provisional = false;
      }
      if (cur.complete && cur.completedAt == null) cur.completedAt = old.completedAt;
    }
    for (const c of archive.claims) {
      const key = this.claimKey(c.system, c.systemAddress);
      if (!this.claims.has(key)) this.claims.set(key, c);
    }
  }
}

// --- Lecture prudente de l'archive (fichier modifiable à la main : rien n'y est cru sans vérification) ---

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const sText = (v, max = 200) => (typeof v === 'string' && v.length <= max ? v : null);
const sIso = (v) => (typeof v === 'string' && v.length <= 40 && Number.isFinite(Date.parse(v)) ? v : null);
const sNum = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const sInt = (v) => (Number.isSafeInteger(v) ? v : null);
const sSymbol = (v) => (typeof v === 'string' && /^[a-z0-9]{1,60}$/.test(v) ? v : null);
const pick = (o, k) => (isObj(o) && Object.hasOwn(o, k) ? o[k] : undefined);

function sanitizeUser(u) {
  const loop = sNum(pick(u, 'loopMinutes'));
  return {
    name: sText(pick(u, 'name'), 60),
    deadline: sIso(pick(u, 'deadline')),
    notes: sText(pick(u, 'notes'), 2000),
    loopMinutes: loop != null && loop >= 1 && loop <= 1440 ? loop : null,
    pinned: pick(u, 'pinned') === true,
  };
}

function sanitizeSite(raw) {
  const marketId = marketIdOf(pick(raw, 'marketId'));
  if (marketId == null) return null;
  const site = newSite(marketId, sIso(pick(raw, 'firstSeen')));
  for (const k of ['station', 'stationLabel', 'stationType', 'system', 'body']) site[k] = sText(pick(raw, k));
  const kind = pick(raw, 'kind');
  site.kind = ['ship', 'orbital', 'planetary'].includes(kind) ? kind : null;
  site.systemAddress = sInt(pick(raw, 'systemAddress'));
  const progress = sNum(pick(raw, 'progress'));
  site.progress = progress == null ? null : Math.min(1, Math.max(0, progress));
  site.complete = pick(raw, 'complete') === true;
  site.failed = pick(raw, 'failed') === true;
  site.provisional = pick(raw, 'provisional') === true;
  for (const k of ['completedAt', 'failedAt', 'lastSeen', 'updatedAt', 'lastDockedAt']) site[k] = sIso(pick(raw, k));
  const completedBy = pick(raw, 'completedBy');
  site.completedBy = site.complete && ['dépôt', 'amarrage'].includes(completedBy) ? completedBy : null;
  site.successorMarketId = site.complete ? marketIdOf(pick(raw, 'successorMarketId')) : null;
  site.readings = Math.max(0, sInt(pick(raw, 'readings')) ?? 0);
  const resources = Array.isArray(pick(raw, 'resources')) ? raw.resources : [];
  site.resources = resources.slice(0, 100).map((r) => {
    const symbol = sSymbol(pick(r, 'symbol'));
    if (!symbol) return null;
    return withRemaining({ symbol, name: sText(pick(r, 'name'), 100) || symbol, required: sInt(pick(r, 'required')), provided: sInt(pick(r, 'provided')), payment: sNum(pick(r, 'payment')) });
  }).filter(Boolean);
  const contributions = Array.isArray(pick(raw, 'contributions')) ? raw.contributions : [];
  site.contributions = contributions.slice(-MAX_CONTRIBUTIONS).map((c) => {
    const at = sIso(pick(c, 'at'));
    const items = (Array.isArray(pick(c, 'items')) ? c.items : []).slice(0, 100).map((i) => {
      const symbol = sSymbol(pick(i, 'symbol'));
      const amount = sInt(pick(i, 'amount'));
      return symbol && amount > 0 ? { symbol, name: sText(pick(i, 'name'), 100) || symbol, amount } : null;
    }).filter(Boolean);
    return at && items.length ? { at, items, total: items.reduce((a, i) => a + i.amount, 0), visit: sIso(pick(c, 'visit')) } : null;
  }).filter(Boolean);
  site.user = sanitizeUser(pick(raw, 'user'));
  return site;
}

/**
 * Archive lue et vérifiée : { sites: Map, forgotten: [[marketId, { until, waiting }]], claims: [] }. Données
 * absentes ou d'une autre forme : vide.
 */
export function parseArchive(data) {
  const out = { sites: new Map(), forgotten: [], claims: [] };
  if (!isObj(data)) return out;
  for (const raw of Array.isArray(pick(data, 'sites')) ? data.sites.slice(0, 1000) : []) {
    const site = sanitizeSite(raw);
    if (site) out.sites.set(site.marketId, site);
  }
  for (const f of Array.isArray(pick(data, 'forgotten')) ? data.forgotten.slice(0, 1000) : []) {
    const marketId = marketIdOf(pick(f, 'marketId'));
    const t = ms(sIso(pick(f, 'at')));
    // waiting absent : en attente d'un nouvel amarrage (le plus prudent)
    if (marketId != null && t != null) out.forgotten.push([marketId, { until: t, waiting: pick(f, 'waiting') !== false }]);
  }
  for (const c of Array.isArray(pick(data, 'claims')) ? data.claims.slice(0, 1000) : []) {
    const system = sText(pick(c, 'system'));
    const systemAddress = sInt(pick(c, 'systemAddress'));
    if (!system && systemAddress == null) continue;
    out.claims.push({ system, systemAddress, claimedAt: sIso(pick(c, 'claimedAt')), releasedAt: sIso(pick(c, 'releasedAt')), beaconAt: sIso(pick(c, 'beaconAt')) });
  }
  return out;
}

/**
 * Archive du disque. Absente : vide. Illisible (JSON abîmé, autre forme) : vide aussi, mais le fichier est d'abord
 * mis de côté (« colonisation.json.illisible-<date> ») avec un avertissement, avant que la prochaine écriture le
 * remplace : il contient des saisies (nom, échéance, notes) et des livraisons que le journal ne permet pas de retrouver.
 */
export function loadArchive(file, { warn = console.warn, now = Date.now() } = {}) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') warn(`Colonisation : archive ${file} non lue (${err.message}).`);
    return parseArchive(null);
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = undefined;
  }
  if (data !== null && typeof data === 'object' && !Array.isArray(data)) return parseArchive(data);
  const aside = `${file}.illisible-${new Date(now).toISOString().replace(/[:.]/g, '-')}`;
  try {
    fs.renameSync(file, aside);
    warn(`Colonisation : archive illisible, mise de côté sous ${aside} ; chantiers reconstruits depuis le journal.`);
  } catch (err) {
    warn(`Colonisation : archive illisible (${file}), non mise de côté (${err.message}).`);
  }
  return parseArchive(null);
}

/** Écriture atomique : fichier temporaire à côté, puis renommage (jamais de fichier à moitié écrit). */
export function saveArchive(file, state) {
  writeJsonAtomicSync(file, state.toJSON()); // core/atomic.js : fsync, renommage réessayé
}

/** État reconstruit depuis l'historique du journal, puis complété par l'archive. */
export function buildState(history, archive = parseArchive(null)) {
  const state = new ColonisationState({ forgotten: archive.forgotten });
  for (const ev of history) state.apply(ev);
  state.mergeArchive(archive);
  return state;
}
