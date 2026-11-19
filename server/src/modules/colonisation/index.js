// Module « Colonisation » : chantiers de construction suivis (vaisseau de colonisation, chantiers orbitaux et
// planétaires), liste de courses (reste − soute), trajets restants, sources proches (Ardent Insight),
// échéance saisie et estimation de fin, projet de colonisation de l'escadron (lu au module Escadron par son API
// locale : chantiers par priorité, relevés des membres). Monté sur /api/modules/colonisation.
//
// Écrit sans vrai journal de colonisation de l’auteur : il suit la spécification documentée (README) et note dans
// GET /diagnostics tout ce qui s'en écarte, pour l'affiner le jour où un vrai journal arrivera.

import { localFetch } from '../../core/net.js';
import { dataPath } from '../../core/paths.js';
import { shipPad } from '../../core/ship.js';
import { firstOpen, freshest, projectView, relevesById } from './escadron.js';
import { marketIdOf } from './events.js';
import { planSite } from './plan.js';
import { ColonisationSources, DEFAULTS } from './sources.js';
import { buildState, ColonisationState, loadArchive, parseArchive, saveArchive, TRACKED_EVENTS } from './state.js';

export const DATA_FILE = dataPath('colonisation.json');
const TRACKED = new Set(TRACKED_EVENTS);
const NOTIFY_MS = 300; // regroupe les envois (rafale de lectures du dépôt, soute)
const CONTRIBUTIONS_SHOWN = 50;
// Projet de l'escadron : relu à l'API locale du module Escadron (sa copie en mémoire, aucun réseau) toutes les 30 s,
// pour le HUD ; la page, elle, le relit à chaque affichage
const SQUAD_MS = 30_000;

function httpError(status, message) {
  return Object.assign(new Error(message), { status, publicMessage: message });
}
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

/** MarketID de l'adresse : chiffres seulement, entier sûr et positif ; sinon erreur 400. */
export function parseMarketId(value) {
  const s = String(value ?? '');
  const id = /^\d{1,16}$/.test(s) ? Number(s) : null;
  if (marketIdOf(id) == null) throw httpError(400, 'Chantier invalide : MarketID numérique attendu.');
  return id;
}

/** Nombre borné d'un paramètre de requête, ou la valeur par défaut. */
function bounded(value, min, max, fallback) {
  const n = Number(value);
  return value != null && value !== '' && Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}

/**
 * Réglages d'un chantier envoyés par la page : seules les clés connues, lues comme propriétés propres du corps
 * (jamais « __proto__ » ni « constructor »). Valeur vide : effacée. Erreur 400 si une valeur est invalide.
 */
export function parseUserUpdate(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw httpError(400, 'Corps JSON attendu.');
  const has = (k) => Object.hasOwn(body, k);
  const out = {};
  const textField = (k, max, label) => {
    if (!has(k)) return;
    const v = body[k];
    if (v == null || v === '') return void (out[k] = null);
    if (typeof v !== 'string') throw httpError(400, `${label} : texte attendu.`);
    const t = v.trim();
    if (t.length > max) throw httpError(400, `${label} : ${max} caractères au plus.`);
    out[k] = t || null;
  };
  textField('name', 60, 'Nom');
  textField('notes', 2000, 'Notes');
  if (has('deadline')) {
    const v = body.deadline;
    if (v == null || v === '') out.deadline = null;
    else {
      const t = typeof v === 'string' && v.length <= 40 ? Date.parse(v) : NaN;
      if (!Number.isFinite(t) || t < Date.UTC(2014, 0, 1) || t > Date.UTC(2100, 0, 1)) throw httpError(400, 'Échéance invalide : date attendue.');
      out.deadline = new Date(t).toISOString();
    }
  }
  if (has('loopMinutes')) {
    const v = body.loopMinutes;
    if (v == null || v === '') out.loopMinutes = null;
    else {
      const raw = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v.replace(',', '.')) : NaN;
      // Arrondi au dixième AVANT le contrôle : 0,04 donnerait 0, que le plan ignorerait sans rien dire
      const n = Math.round(raw * 10) / 10;
      if (!Number.isFinite(n) || n < 1 || n > 1440) throw httpError(400, "Durée d'une boucle invalide : de 1 à 1 440 minutes.");
      out.loopMinutes = n;
    }
  }
  if (has('pinned')) {
    if (typeof body.pinned !== 'boolean') throw httpError(400, 'Épinglé : vrai ou faux attendu.');
    out.pinned = body.pinned;
  }
  return out;
}

export default {
  id: 'colonisation',
  name: 'Colonisation',

  /**
   * @param dataFile  archive JSON (tests : dossier temporaire)
   * @param fetchImpl accès réseau vers Ardent Insight (tests : simulé)
   * @param saveDelayMs délai de regroupement des écritures sur disque
   * @param selfUrl   adresse de l'API locale, pour lire le projet de l'escadron (module Escadron) ; tests : simulée
   * @param squadMs   relecture du projet de l'escadron (0 : seulement à la demande)
   */
  async register({ router, journal, game, broadcast, getSettings, dataFile = DATA_FILE, fetchImpl, saveDelayMs = 1000, selfUrl = null, localFetchImpl, squadMs = process.env.NODE_TEST_CONTEXT ? 0 : SQUAD_MS }) {
    let state = buildState([], loadArchive(dataFile)); // en attendant l'historique du journal
    const sources = new ColonisationSources(fetchImpl ? { fetchImpl } : {});
    let hoursPerEvening = null;
    const refreshSettings = async () => {
      try {
        hoursPerEvening = (await getSettings?.())?.hoursPerEvening ?? hoursPerEvening;
      } catch {
        // base indisponible : on garde la dernière valeur
      }
    };
    await refreshSettings();

    let saveTimer = null;
    const flush = () => {
      clearTimeout(saveTimer);
      saveTimer = null;
      try {
        saveArchive(dataFile, state);
      } catch (err) {
        console.error(`Colonisation : chantiers non enregistrés (${err.message})`);
      }
    };
    const scheduleSave = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(flush, saveDelayMs);
      saveTimer.unref?.();
    };

    const ship = () => {
      const g = game.snapshot();
      return { cargo: g.cargo || [], capacity: g.loadout?.cargoCapacity ?? null, pad: shipPad(g.loadout?.ship), docked: g.docked, marketId: g.marketId };
    };

    // --- Projet de colonisation de l'escadron (module Escadron, lu par son API locale, jamais son code) ---
    let squad = null; // sa vue : { actif, pret, chef, projet, releves, … }, ou null (module absent, ou pas encore lu)
    let squadKey = '';
    const squadOn = () => Boolean(squad?.actif && squad.projet);
    /** Relit la vue du module Escadron ; prévient les pages si le projet ou ses relevés ont changé. */
    async function readSquad() {
      if (!selfUrl) return squad;
      try {
        const res = await localFetch(`${selfUrl}/api/modules/escadron/colonisation`, {}, { fetchImpl: localFetchImpl, timeoutMs: 5000 });
        squad = res.ok ? await res.json() : null;
      } catch {
        // module Escadron indisponible : on garde la dernière vue
      }
      const key = JSON.stringify([squad?.actif, squad?.version, squad?.updatedAt, (squad?.releves ?? []).map((r) => [r.marketId, r.at])]);
      if (key !== squadKey) {
        squadKey = key;
        notify();
      }
      return squad;
    }
    if (squadMs > 0) setInterval(() => readSquad(), squadMs).unref?.();
    /** Le chantier avec la lecture la plus récente (la tienne, ou celle de l'escadron) : { site, releve }. */
    const current = (site) => (squadOn() ? freshest(site, relevesById(squad).get(site.marketId) ?? null) : { site, releve: null });
    const squadView = () => (squadOn() ? projectView(squad, state.sites) : null);

    /**
     * Chantier actif : à quai, sinon épinglé, sinon le premier en cours du projet de l'escadron (s'il est suivi ici),
     * sinon le dernier en cours. { site, reason } ou null.
     */
    const activeEntry = (s) => {
      const a = state.active(s.docked ? s.marketId : null);
      if (a && a.reason !== 'recent') return a;
      const first = firstOpen(squadView());
      if (!first) return a;
      // Suivi ici : le chantier lui-même (sa lecture la plus récente est reprise à l'affichage) ; sinon celui de l'escadron
      return state.sites.has(first.marketId) ? { site: state.sites.get(first.marketId), reason: 'escadron' } : { site: first.site, releve: first.releve, reason: 'escadron' };
    };
    /** MarketID du chantier actif, ou null. */
    const activeId = (s) => activeEntry(s)?.site.marketId ?? null;
    /**
     * Plan d'un chantier. La soute n'est déduite que pour le chantier actif : elle ne sert qu'une fois, et la
     * déduire de chaque chantier qui demande la même marchandise la compterait plusieurs fois.
     */
    const planOf = (site, s = ship(), holdFor = activeId(s)) => {
      const holdCounted = site.marketId === holdFor;
      return { ...planSite(site, { cargo: holdCounted ? s.cargo : [], capacity: s.capacity, hoursPerEvening }), holdCounted };
    };

    /** Ligne de la liste des chantiers (avec la lecture la plus récente, la tienne ou celle de l'escadron). */
    function summary(tracked, s, holdFor) {
      const { site, releve } = current(tracked);
      const plan = planOf(site, s, holdFor);
      return {
        marketId: site.marketId,
        label: site.user.name || site.stationLabel || `Chantier ${site.marketId}`,
        stationLabel: site.stationLabel,
        kind: site.kind,
        system: site.system,
        progress: site.progress,
        complete: site.complete,
        failed: site.failed,
        provisional: site.provisional,
        known: plan.known,
        remaining: plan.totals.remaining,
        toBuy: plan.totals.toBuy,
        holdCounted: plan.holdCounted,
        trips: plan.trips,
        mine: site.contributions.reduce((a, c) => a + c.total, 0),
        deadline: plan.deadline,
        pinned: site.user.pinned,
        docked: s.docked && s.marketId === site.marketId,
        lastSeen: site.lastSeen,
        updatedAt: site.updatedAt,
        releve, // { by, at } : lecture du dépôt envoyée par un membre de l'escadron, plus récente que la tienne
      };
    }

    /**
     * Chantier complet, avec sa liste de courses. `tracked` : un chantier suivi ici (sa lecture la plus récente est
     * prise, la tienne ou celle de l'escadron), ou { site, releve } déjà choisi (chantier connu par l'escadron seul).
     */
    function detail(tracked, s = ship(), { own = false } = {}) {
      const { site, releve } = tracked.site ? tracked : own ? { site: tracked, releve: null } : current(tracked);
      const { contributions, local: _, ...rest } = site;
      return {
        ...rest,
        local: site.local !== false, // false : connu par l'escadron seul (ni réglages, ni livraisons, rien à oublier)
        releve,
        label: site.user.name || site.stationLabel || `Chantier ${site.marketId}`,
        docked: s.docked && s.marketId === site.marketId,
        mine: { total: contributions.reduce((a, c) => a + c.total, 0), count: contributions.length, recent: contributions.slice(-CONTRIBUTIONS_SHOWN).reverse() },
        ship: { capacity: s.capacity, pad: s.pad },
        plan: planOf(site, s),
      };
    }

    function activeView(s = ship()) {
      const a = activeEntry(s);
      if (!a) return null;
      const site = state.sites.has(a.site.marketId) ? a.site : { site: a.site, releve: a.releve ?? null };
      return { reason: a.reason, site: detail(site, s) };
    }

    function overview() {
      const s = ship();
      const holdFor = activeId(s);
      const v = squadView();
      return {
        sites: state.list().map((site) => summary(site, s, holdFor)),
        claims: state.claimList(),
        active: activeView(s),
        ship: { capacity: s.capacity, pad: s.pad },
        // Projet de l'escadron, en bref (la page le détaille avec GET /escadron)
        escadron: v ? { chantiers: v.sites.length, enCours: v.sites.filter((x) => x.site && !x.site.complete && !x.site.failed).length } : null,
      };
    }

    /** Une ligne du projet de l'escadron : le chantier (s'il est connu) et sa liste de courses. */
    function squadRow(entry, s, holdFor) {
      const { site, releve } = entry;
      if (!site) return { priority: entry.priority, marketId: entry.marketId, system: entry.system, label: entry.name || `Chantier ${entry.marketId}`, known: false };
      const plan = planOf(site, s, holdFor);
      return {
        ...(entry.priority ? { priority: entry.priority } : {}),
        marketId: site.marketId,
        label: site.user.name || site.stationLabel || entry.name || `Chantier ${site.marketId}`,
        kind: site.kind,
        system: site.system ?? entry.system ?? null,
        progress: site.progress,
        complete: site.complete,
        failed: site.failed,
        provisional: site.provisional,
        local: site.local !== false,
        docked: s.docked && s.marketId === site.marketId,
        updatedAt: site.updatedAt,
        releve,
        known: plan.known,
        plan: { totals: plan.totals, trips: plan.trips, capacity: plan.capacity, holdCounted: plan.holdCounted, items: plan.items },
      };
    }

    /** Le projet de l'escadron vu d'ici : son état (module Escadron) et ses chantiers, dans l'ordre du chef. */
    async function squadronOverview() {
      await readSquad();
      const s = ship();
      const holdFor = activeId(s);
      const { projet: _, releves: __, ...etat } = squad ?? {};
      const v = squadView();
      return {
        escadron: squad ? etat : null, // null : module Escadron absent ou injoignable
        projet: v ? {
          systems: v.systems,
          sites: v.sites.map((e) => squadRow(e, s, holdFor)),
          others: v.others.map((e) => squadRow(e, s, holdFor)),
          empty: v.empty,
        } : null,
        // Pour le chef : chantiers suivis ici, de quoi composer le projet (même avant de l'avoir publié)
        mesChantiers: squad?.chef ? state.list().map((x) => ({ marketId: x.marketId, system: x.system, label: x.user.name || x.stationLabel || `Chantier ${x.marketId}`, complete: x.complete, failed: x.failed })) : [],
        mesSystemes: squad?.chef ? [...new Set([...state.claimList().map((c) => c.system), ...state.list().map((x) => x.system)].filter(Boolean))] : [],
        ship: { capacity: s.capacity, pad: s.pad },
      };
    }

    let notifyTimer = null;
    const notify = () => {
      clearTimeout(notifyTimer);
      notifyTimer = setTimeout(() => broadcast('colonisation:update', overview()), NOTIFY_MS);
      notifyTimer.unref?.();
    };

    journal.addInterest(TRACKED_EVENTS);
    journal.on('ready', ({ history }) => {
      // Archive = ce qui est connu juste avant (relu comme un fichier : rien n'y passe sans vérification)
      const archive = parseArchive(JSON.parse(JSON.stringify(state.toJSON())));
      state = buildState(history.filter((ev) => TRACKED.has(ev.event)), archive);
      scheduleSave();
      notify();
    });
    journal.on('event', (ev) => {
      if (!TRACKED.has(ev.event)) return;
      if (state.apply(ev)) {
        scheduleSave();
        notify();
      }
    });
    // Soute, vaisseau (capacité, plateforme) ou amarrage : la liste de courses change. Le reste de l'état du jeu
    // (carburant, solde, destination…) bouge sans cesse en vol : il n'envoie rien.
    let shipKey = JSON.stringify(ship());
    game.on('change', () => {
      const key = JSON.stringify(ship());
      if (key === shipKey) return;
      shipKey = key;
      if (state.sites.size || squadOn()) notify();
    });

    const siteOr404 = (req) => {
      const id = parseMarketId(req.params.marketId);
      const site = state.sites.get(id);
      if (!site) throw httpError(404, 'Chantier inconnu (jamais vu dans le journal, ou oublié).');
      return site;
    };
    /** Chantier suivi ici, ou connu par le projet de l'escadron seul : { site, releve } (lecture la plus récente). */
    const anySiteOr404 = (req) => {
      const id = parseMarketId(req.params.marketId);
      if (state.sites.has(id)) return current(state.sites.get(id));
      const v = squadView();
      const e = v && [...v.sites, ...v.others].find((x) => x.site && x.site.marketId === id);
      if (!e) throw httpError(404, 'Chantier inconnu (jamais vu dans le journal, ni relevé par ton escadron).');
      return { site: e.site, releve: e.releve };
    };

    router.get('/sites', wrap(async (req, res) => {
      await refreshSettings();
      res.json(overview());
    }));

    // ?local=1 : ta propre lecture du dépôt seulement (module Escadron : le relevé qu'il envoie est le tien, jamais
    // celui d'un autre membre) ; sinon la plus récente, et un chantier connu par l'escadron seul
    router.get('/sites/:marketId', wrap(async (req, res) => {
      if (req.query.local === '1') return res.json(detail(siteOr404(req), ship(), { own: true }));
      if (selfUrl && !state.sites.has(Number(req.params.marketId))) await readSquad();
      res.json(detail(anySiteOr404(req)));
    }));

    /** Projet de colonisation de l'escadron vu d'ici : chantiers dans l'ordre du chef, avec la lecture la plus récente. */
    router.get('/escadron', wrap(async (req, res) => {
      await refreshSettings();
      res.json(await squadronOverview());
    }));

    /** Chantier où tu es à quai, avec sa liste de courses ; site null ailleurs. */
    router.get('/here', wrap(async (req, res) => {
      const s = ship();
      const site = s.docked && s.marketId != null ? state.sites.get(s.marketId) : null;
      res.json({ docked: Boolean(s.docked), marketId: s.docked ? s.marketId ?? null : null, site: site ? detail(site, s) : null });
    }));

    /** Chantier actif du HUD : à quai, épinglé, ou le dernier en cours. */
    router.get('/active', wrap(async (req, res) => {
      res.json(activeView());
    }));

    router.get('/sites/:marketId/sources', wrap(async (req, res) => {
      const { site } = anySiteOr404(req);
      const s = ship();
      const plan = planOf(site, s);
      const result = await sources.nearby({
        system: site.system,
        commodities: plan.items.filter((i) => !i.done).map((i) => ({ symbol: i.symbol, name: i.name, remaining: i.toBuy ?? i.remaining })),
        pad: s.pad,
        maxDistance: bounded(req.query.maxDistance, 1, 500, DEFAULTS.maxDistance),
        maxDaysAgo: bounded(req.query.maxDaysAgo, 1, 90, DEFAULTS.maxDaysAgo),
        carriers: req.query.carriers === '1' || req.query.carriers === 'true',
      });
      res.json(result);
    }));

    /** Nom personnalisé, échéance, durée d'une boucle, notes, épinglé (un seul chantier épinglé à la fois). */
    router.put('/sites/:marketId', wrap(async (req, res) => {
      const site = siteOr404(req);
      const update = parseUserUpdate(req.body);
      if (update.pinned) for (const other of state.sites.values()) other.user.pinned = false;
      Object.assign(site.user, update);
      flush(); // saisie du joueur : écrite tout de suite, le journal ne permet pas de la retrouver
      notify();
      res.json(detail(site));
    }));

    /**
     * Oublier : le chantier disparaît ; ni ses événements passés ni les lectures du dépôt suivantes ne le recréent,
     * seul un nouvel amarrage à ce chantier le fait revenir.
     */
    router.delete('/sites/:marketId', wrap(async (req, res) => {
      const site = siteOr404(req);
      state.forget(site.marketId);
      flush();
      notify();
      res.json({ forgotten: site.marketId });
    }));

    /** Diagnostic : champs inattendus, écarts aux observations, derniers événements Colonisation* bruts. */
    router.get('/diagnostics', wrap(async (req, res) => {
      res.json({ ...state.diagnostics(), sources: sources.stats });
    }));

    return { flush, state: () => state, readSquad };
  },
};

export { ColonisationState };
