// Module « Calculateur de routes » : cherche les routes commerciales rentables autour de la
// position du joueur, avec la soute, la portée chargée et la taille de plateforme de son
// vaisseau actuel (lus dans le journal). Prix : API publique Ardent Insight (EDDN).

import { ArdentClient } from './ardent.js';
import { buildMarkets, findRoutes, pickCommodities, distance } from './calc.js';
import { ladenRange, shipPad } from '../../core/ship.js';

const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

function bad(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  err.publicMessage = message;
  return err;
}

/** Nom interne d'une marchandise (journal « $Indium_Name; », Ardent « indium »). */
export function commodityId(s) {
  return String(s || '').toLowerCase().replace(/^\$/, '').replace(/_name;$/, '').replace(/\s+/g, '');
}

const clamp = (v, min, max, def) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

export default {
  id: 'planner',
  name: 'Calculateur de routes',

  async register({ router, journal, game }) {
    const ardent = new ArdentClient();

    // Noms français des marchandises, appris dans les journaux et Market.json
    const labels = new Map();
    const learn = (name, label) => {
      if (name && label) labels.set(commodityId(name), label);
    };
    journal.addInterest(['MarketBuy', 'MarketSell']);
    journal.on('ready', ({ history }) => {
      for (const ev of history) if (ev.event === 'MarketBuy' || ev.event === 'MarketSell') learn(ev.Type, ev.Type_Localised);
      for (const it of journal.stateData.market?.Items || []) learn(it.Name, it.Name_Localised);
    });
    journal.on('event', (ev) => {
      if (ev.event === 'MarketBuy' || ev.event === 'MarketSell') learn(ev.Type, ev.Type_Localised);
    });
    journal.on('market', (m) => {
      for (const it of m?.Items || []) learn(it.Name, it.Name_Localised);
    });
    const label = (c) => labels.get(commodityId(c)) || c.charAt(0).toUpperCase() + c.slice(1);

    /** Vaisseau et position actuels, d'après le journal. */
    function context() {
      const s = game.snapshot();
      const lo = s.loadout;
      const cargo = lo?.cargoCapacity ?? null;
      return {
        ship: s.ship || null,
        cargo,
        pad: shipPad(lo?.ship),
        // Portée soute pleine et réservoir plein : le cas le plus défavorable d'une route
        range: lo ? ladenRange(lo, cargo || 0, null) : null,
        rangeEmpty: lo?.maxJumpRange ?? null,
        system: s.system || null,
        station: s.station || null,
      };
    }

    router.get('/context', (req, res) => res.json(context()));

    router.get('/systems', wrap(async (req, res) => {
      const q = String(req.query.q || '').trim();
      if (q.length < 3) return res.json([]);
      const rows = (await ardent.searchSystems(q)) || [];
      res.json(rows.slice(0, 10).map((r) => r.systemName));
    }));

    router.post('/search', wrap(async (req, res) => {
      const b = req.body || {};
      const ctx = context();
      const system = String(b.system || ctx.system || '').trim();
      if (!system) throw bad('Indique un système de départ (ou lance le jeu pour utiliser ta position).');
      const p = {
        maxDistance: clamp(b.maxDistance, 5, 80, 30),
        maxDaysAgo: clamp(b.maxDaysAgo, 1, 30, 3),
        maxArrival: clamp(b.maxArrival, 100, 500000, 5000),
        cargo: clamp(b.cargo ?? ctx.cargo, 1, 2000, null),
        range: clamp(b.range ?? ctx.range, 1, 200, null),
        pad: ['S', 'M', 'L'].includes(b.pad) ? b.pad : ctx.pad || 'L',
        planetary: b.planetary !== false,
        settlements: !!b.settlements,
        sort: b.sort === 'trip' ? 'trip' : 'hour',
      };
      if (!p.cargo) throw bad('Soute inconnue : lance le jeu ou indique la taille de ta soute.');
      if (!p.range) throw bad('Portée inconnue : lance le jeu ou indique ta portée de saut en charge.');

      const t0 = Date.now();
      const before = { ...ardent.stats };
      let ref;
      try {
        ref = await ardent.system(system);
      } catch (err) {
        throw bad(`Ardent Insight ne répond pas (${err.message}). Réessaie dans un instant.`, 502);
      }
      if (!ref) throw bad(`Système inconnu d'Ardent Insight : « ${system} ».`, 404);

      const report = await ardent.commodities();
      const names = pickCommodities(report);
      const opts = { maxDistance: p.maxDistance, maxDaysAgo: p.maxDaysAgo };
      const jobs = [
        ardent.systemTrades(ref.systemName, 'exports', opts),
        ardent.systemTrades(ref.systemName, 'imports', opts),
        ...names.flatMap((c) => [ardent.nearby(ref.systemName, c, 'exports', opts), ardent.nearby(ref.systemName, c, 'imports', opts)]),
      ];
      const settled = await Promise.allSettled(jobs);
      const failed = settled.filter((s) => s.status === 'rejected').length;
      if (failed === settled.length) throw bad("Ardent Insight ne répond pas. Réessaie dans un instant.", 502);
      const rows = settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []));

      const markets = buildMarkets(rows, p);
      const refPos = { x: ref.systemX, y: ref.systemY, z: ref.systemZ };
      for (const m of markets.values()) m.distance = distance(refPos, m);
      const { loops, oneWay } = findRoutes(markets, { cargo: p.cargo, range: p.range, sort: p.sort, limit: 40 });

      const named = (t) => t && { ...t, name: label(t.commodity) };
      res.json({
        reference: { system: ref.systemName, systemAddress: ref.systemAddress },
        params: p,
        loops: loops.map((l) => ({ ...l, out: named(l.out), back: named(l.back) })),
        oneWay: oneWay.map((l) => ({ ...l, out: named(l.out) })),
        meta: {
          commodities: names.length,
          markets: markets.size,
          requests: ardent.stats.requests - before.requests,
          cached: ardent.stats.cached - before.cached,
          failed,
          ms: Date.now() - t0,
          at: new Date().toISOString(),
        },
      });
    }));
  },
};
