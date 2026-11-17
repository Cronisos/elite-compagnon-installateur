// Module « Colonisation » : chantiers de construction suivis (vaisseau de colonisation, chantiers orbitaux et
// planétaires), liste de courses (reste − soute), trajets restants, sources proches (Ardent Insight),
// échéance saisie et estimation de fin. Monté sur /api/modules/colonisation.
//
// Écrit sans vrai journal de colonisation de l’auteur : il suit la spécification documentée (README) et note dans
// GET /diagnostics tout ce qui s'en écarte, pour l'affiner le jour où un vrai journal arrivera.

import { dataPath } from '../../core/paths.js';
import { shipPad } from '../../core/ship.js';
import { marketIdOf } from './events.js';
import { planSite } from './plan.js';
import { ColonisationSources, DEFAULTS } from './sources.js';
import { buildState, ColonisationState, loadArchive, parseArchive, saveArchive, TRACKED_EVENTS } from './state.js';

export const DATA_FILE = dataPath('colonisation.json');
const TRACKED = new Set(TRACKED_EVENTS);
const NOTIFY_MS = 300; // regroupe les envois (rafale de lectures du dépôt, soute)
const CONTRIBUTIONS_SHOWN = 50;

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
   */
  async register({ router, journal, game, broadcast, getSettings, dataFile = DATA_FILE, fetchImpl, saveDelayMs = 1000 }) {
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
    /** MarketID du chantier actif (à quai, épinglé ou le dernier en cours), ou null. */
    const activeId = (s) => state.active(s.docked ? s.marketId : null)?.site.marketId ?? null;
    /**
     * Plan d'un chantier. La soute n'est déduite que pour le chantier actif : elle ne sert qu'une fois, et la
     * déduire de chaque chantier qui demande la même marchandise la compterait plusieurs fois.
     */
    const planOf = (site, s = ship(), holdFor = activeId(s)) => {
      const holdCounted = site.marketId === holdFor;
      return { ...planSite(site, { cargo: holdCounted ? s.cargo : [], capacity: s.capacity, hoursPerEvening }), holdCounted };
    };

    /** Ligne de la liste des chantiers. */
    function summary(site, s, holdFor) {
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
      };
    }

    /** Chantier complet, avec sa liste de courses. */
    function detail(site, s = ship()) {
      const { contributions, ...rest } = site;
      return {
        ...rest,
        label: site.user.name || site.stationLabel || `Chantier ${site.marketId}`,
        docked: s.docked && s.marketId === site.marketId,
        mine: { total: contributions.reduce((a, c) => a + c.total, 0), count: contributions.length, recent: contributions.slice(-CONTRIBUTIONS_SHOWN).reverse() },
        ship: { capacity: s.capacity, pad: s.pad },
        plan: planOf(site, s),
      };
    }

    function activeView(s = ship()) {
      const a = state.active(s.docked ? s.marketId : null);
      return a ? { reason: a.reason, site: detail(a.site, s) } : null;
    }

    function overview() {
      const s = ship();
      const holdFor = activeId(s);
      return {
        sites: state.list().map((site) => summary(site, s, holdFor)),
        claims: state.claimList(),
        active: activeView(s),
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
      if (state.sites.size) notify();
    });

    const siteOr404 = (req) => {
      const id = parseMarketId(req.params.marketId);
      const site = state.sites.get(id);
      if (!site) throw httpError(404, 'Chantier inconnu (jamais vu dans le journal, ou oublié).');
      return site;
    };

    router.get('/sites', wrap(async (req, res) => {
      await refreshSettings();
      res.json(overview());
    }));

    router.get('/sites/:marketId', wrap(async (req, res) => {
      res.json(detail(siteOr404(req)));
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
      const site = siteOr404(req);
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

    return { flush, state: () => state };
  },
};

export { ColonisationState };
