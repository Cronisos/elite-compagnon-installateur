// Module « Systèmes importants » : favoris avec la raison pour laquelle ils comptent,
// et recherche des zones qui regroupent le plus de planètes d'un type donné (données Spansh).

import { findClusters, summarize } from './cluster.js';
import { fetchBodies, SUBTYPES } from './spansh.js';
import { requireRowId } from '../../core/ids.js';

const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);
const CACHE_MS = 60 * 60 * 1000;

function bad(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  err.publicMessage = message;
  return err;
}

const clamp = (v, min, max, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const text = (v, max) => String(v ?? '').trim().slice(0, max);

const MAX_PLANETS = 2000;
const isPlanet = (p) => p !== null && typeof p === 'object' && !Array.isArray(p);

export default {
  id: 'systems',
  name: 'Systèmes importants',

  async register({ router, prisma, journal, game, broadcast }) {
    let cache = null; // { key, at, bodies }
    let searching = false;
    let position = null; // { x, y, z } du dernier système visité

    const MOVES = ['FSDJump', 'Location', 'CarrierJump'];
    const learn = (ev) => {
      if (!MOVES.includes(ev.event) || !ev.StarPos) return false;
      const [x, y, z] = ev.StarPos;
      position = { x, y, z };
      return true;
    };
    journal.addInterest(MOVES);
    journal.on('ready', ({ history }) => history.forEach(learn));
    journal.on('event', (ev) => {
      if (learn(ev)) broadcast('systems:update', {});
    });

    const view = (s) => {
      // Liste enregistrée illisible (ancienne version, base retouchée) : vide, plutôt que la page en erreur
      let planets;
      try {
        planets = JSON.parse(s.planets);
      } catch {
        planets = [];
      }
      planets = Array.isArray(planets) ? planets.filter(isPlanet) : [];
      return { ...s, planets, ...summarize(planets, s.system, position, game.snapshot().loadout?.maxJumpRange) };
    };

    function fields(b) {
      const data = {};
      if (b.name !== undefined) data.name = text(b.name, 120) || 'Sans nom';
      if (b.system !== undefined) data.system = text(b.system, 120);
      if (b.tag !== undefined) data.tag = text(b.tag, 40);
      if (b.description !== undefined) data.description = text(b.description, 2000);
      if (b.sol !== undefined) {
        // Distance de Sol : un nombre fini (ou rien) ; « NaN », un objet ou 1e999 n'arrivent jamais à la base
        const sol = b.sol == null || b.sol === '' ? null : typeof b.sol === 'number' || typeof b.sol === 'string' ? Number(b.sol) : NaN;
        if (sol !== null && !Number.isFinite(sol)) throw bad('Distance de Sol invalide.');
        data.sol = sol;
      }
      if (b.planets !== undefined) {
        // Planètes de la recherche : une liste d'objets ; un nombre, null ou un objet seul rendraient la liste illisible
        if (!Array.isArray(b.planets) || b.planets.length > MAX_PLANETS || !b.planets.every(isPlanet)) throw bad('Planètes invalides : liste de planètes attendue.');
        data.planets = JSON.stringify(b.planets);
      }
      return data;
    }

    router.get('/options', (req, res) => res.json({ subtypes: SUBTYPES }));

    router.get('/systems', wrap(async (req, res) => {
      const rows = await prisma.importantSystem.findMany({ orderBy: { createdAt: 'asc' } });
      res.json(rows.map(view));
    }));

    router.post('/systems', wrap(async (req, res) => {
      const data = fields(req.body || {});
      if (!data.system) throw bad('Indique un système.');
      const row = await prisma.importantSystem.create({ data: { name: data.system, ...data } });
      broadcast('systems:update', { id: row.id });
      res.status(201).json(view(row));
    }));

    router.patch('/systems/:id', wrap(async (req, res) => {
      const id = requireRowId(req.params.id, 'Système introuvable.');
      const row = await prisma.importantSystem.update({ where: { id }, data: fields(req.body || {}) }).catch(() => null);
      if (!row) throw bad('Système introuvable.', 404);
      broadcast('systems:update', { id });
      res.json(view(row));
    }));

    router.delete('/systems/:id', wrap(async (req, res) => {
      const id = requireRowId(req.params.id, 'Système introuvable.');
      await prisma.importantSystem.deleteMany({ where: { id } });
      broadcast('systems:update', { id });
      res.json({ ok: true });
    }));

    /** Recherche de zones. Le téléchargement peut prendre une à deux minutes, puis il reste en cache une heure. */
    router.post('/search', wrap(async (req, res) => {
      const b = req.body || {};
      const subtypes = (Array.isArray(b.subtypes) ? b.subtypes : []).filter((s) => SUBTYPES[s]);
      if (!subtypes.length) throw bad('Choisis au moins un type de planète.');
      const params = {
        subtypes,
        maxGravity: clamp(b.maxGravity, 0.05, 10, 2),
        maxDistance: clamp(b.maxDistance, 20, 800, 500),
      };
      const key = JSON.stringify(params);
      if (!cache || cache.key !== key || Date.now() - cache.at > CACHE_MS) {
        if (searching) throw bad('Une recherche est déjà en cours.', 409);
        searching = true;
        try {
          const bodies = await fetchBodies(params, (loaded) => broadcast('systems:progress', { loaded }));
          cache = { key, at: Date.now(), bodies };
        } catch (e) {
          throw bad(`Recherche Spansh impossible : ${e.message}`, 502);
        } finally {
          searching = false;
        }
      }
      let list = cache.bodies;
      if (b.onlySites) list = list.filter((x) => x.sites > 0);
      if (b.power) list = list.filter((x) => x.power === b.power);
      const maxArrival = Number(b.maxArrival);
      if (maxArrival > 0) list = list.filter((x) => x.arrival <= maxArrival);
      res.json({
        total: cache.bodies.length,
        truncated: Boolean(cache.bodies.truncated), // une tranche de distance au plafond de Spansh (10 000), pas plus fine que 0,5 al
        kept: list.length,
        powers: [...new Set(cache.bodies.map((x) => x.power).filter(Boolean))].sort(),
        clusters: findClusters(list, {
          diameter: clamp(b.diameter, 10, 100, 40),
          sort: b.sort === 'sites' ? 'sites' : 'planets',
          limit: 10,
        }),
      });
    }));
  },
};
