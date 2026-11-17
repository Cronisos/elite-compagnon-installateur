// Routes HTTP du module « Mes routes commerciales » (montées sur /api/modules/routes).

import { detectRoute } from './services/detector.js';
import { extractLoops } from './services/loops.js';
import { buildRouteView, publicRoute } from './services/view.js';
import { requireRowId } from '../../core/ids.js';
import { parseJsonColumn } from '../../core/jsonColumn.js';

const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  err.publicMessage = message;
  return err;
}

const NO_LOOP = "Aucun aller-retour complet trouvé dans les journaux. Fais une boucle complète en jeu (achat → vente → achat → vente → retour au point de départ), puis réessaie.";

export function setupApi(router, ctx) {
  const { prisma, tracker } = ctx;

  async function getRoute(id) {
    const r = await prisma.route.findUnique({ where: { id: requireRowId(id, 'Route introuvable.') } });
    if (!r) throw httpError(404, 'Route introuvable.');
    return r;
  }

  // Début du message de refus quand la détection propose une autre boucle (l'interface demande alors confirmation)
  const REDETECT_OTHER = 'La détection propose une autre boucle';

  /** Détection de la dernière boucle (étape « J'ai fait ma route »). */
  function detect(anchorSystem) {
    const d = detectRoute(tracker.timeline, { anchorSystem: anchorSystem || undefined });
    if (!d) throw httpError(404, NO_LOOP);
    const def = { startSystem: d.startSystem, startStation: d.startStation, startCommodity: d.startCommodity, stops: d.stops };
    const { loops } = extractLoops(tracker.timeline, def);
    const loop = loops.find((l) => l.startAt === d.loopStart) || null;
    const earlier = loops.filter((l) => l.startAt < d.loopStart).length;
    return { ...d, loop, earlierLoops: earlier };
  }

  router.post('/detect', wrap(async (req, res) => {
    res.json(detect(req.body?.anchorSystem));
  }));

  router.get('/routes', wrap(async (req, res) => {
    const routes = await prisma.route.findMany({ orderBy: { lastUsedAt: 'desc' } });
    const sums = await prisma.loop.groupBy({
      by: ['routeId'],
      _sum: { netGain: true, merits: true },
      _count: { _all: true },
      _max: { endAt: true },
    });
    const byRoute = new Map(sums.map((s) => [s.routeId, s]));
    res.json(routes.map((r) => {
      const s = byRoute.get(r.id);
      return {
        ...publicRoute(r),
        loopsCount: s?._count._all || 0,
        totalNet: s?._sum.netGain || 0,
        totalMerits: s?._sum.merits || 0,
        lastLoopAt: s?._max.endAt || null,
      };
    }));
  }));

  /** Création d'une route : seul l'objectif est demandé, tout le reste vient du journal. */
  router.post('/routes', wrap(async (req, res) => {
    const { anchorSystem, name, goal, includeHistory } = req.body || {};
    const g = Number(goal);
    if (!Number.isFinite(g) || g <= 0) throw httpError(400, 'Indique un objectif de crédits valide.');
    const d = detect(anchorSystem);
    const structure = { ...d };
    delete structure.loop;
    // Une seule route active, toujours : les deux écritures ensemble (un arrêt entre les deux n'en laisse aucune)
    const [, route] = await prisma.$transaction([
      prisma.route.updateMany({ data: { active: false } }),
      prisma.route.create({
        data: {
          name: String(name || d.suggestedName).slice(0, 120),
          startSystem: d.startSystem,
          startStation: d.startStation,
          startMarketId: d.startMarketId ?? 0,
          startCommodity: d.startCommodity,
          structure: JSON.stringify(structure),
          stations: JSON.stringify(d.stations),
          systems: JSON.stringify(d.systems),
          commodities: JSON.stringify(d.commodities),
          goal: g,
          trackFrom: includeHistory ? new Date(0) : new Date(d.loopStart),
          active: true,
        },
      }),
    ]);
    await tracker.syncRouteQueued(route);
    tracker.notify([route.id]);
    res.status(201).json(publicRoute(route));
  }));

  router.get('/routes/:id', wrap(async (req, res) => {
    const route = await getRoute(req.params.id);
    res.json(await buildRouteView(route, ctx));
  }));

  /** Modification : nom, objectif, valeurs saisies à la main. */
  router.patch('/routes/:id', wrap(async (req, res) => {
    const route = await getRoute(req.params.id);
    const data = {};
    const b = req.body || {};
    if (typeof b.name === 'string' && b.name.trim()) data.name = b.name.trim().slice(0, 120);
    if (b.goal != null) {
      const g = Number(b.goal);
      if (!Number.isFinite(g) || g <= 0) throw httpError(400, 'Objectif invalide.');
      data.goal = g;
    }
    if (b.overrides && typeof b.overrides === 'object') {
      const allowed = ['minutesPerLoop', 'cargoCapacity', 'ladenRange'];
      const cur = parseJsonColumn(route.overrides || '{}', {}, { label: `Route ${route.id} (valeurs saisies)`, accept: (v) => v !== null && typeof v === 'object' && !Array.isArray(v) });
      for (const k of allowed) {
        if (!(k in b.overrides)) continue;
        const v = Number(b.overrides[k]);
        if (b.overrides[k] === '' || b.overrides[k] == null || !Number.isFinite(v) || v <= 0) delete cur[k];
        else cur[k] = v;
      }
      data.overrides = JSON.stringify(cur);
    }
    const updated = await prisma.route.update({ where: { id: route.id }, data });
    tracker.notify([route.id]);
    res.json(publicRoute(updated));
  }));

  /** Reprendre une route : elle redevient la route active. */
  router.post('/routes/:id/resume', wrap(async (req, res) => {
    const route = await getRoute(req.params.id);
    // Les deux écritures ensemble : un arrêt de l'app entre les deux ne laisse plus aucune route active
    const [, updated] = await prisma.$transaction([
      prisma.route.updateMany({ data: { active: false } }),
      prisma.route.update({ where: { id: route.id }, data: { active: true, lastUsedAt: new Date() } }),
    ]);
    await tracker.syncRouteQueued(updated);
    tracker.notify([route.id]);
    res.json(publicRoute(updated));
  }));

  /**
   * Refait la détection de la boucle (même système de départ), sans toucher à l'objectif. Si elle propose une autre
   * boucle (autre station de départ, autre marchandise : une autre route du même système), rien n'est changé sans
   * confirmation (corps { confirm: true }) : 409 qui dit la différence et combien de boucles enregistrées seraient
   * recalculées. Avant, la route devenait une autre et ses boucles étaient effacées sans prévenir.
   */
  router.post('/routes/:id/redetect', wrap(async (req, res) => {
    const route = await getRoute(req.params.id);
    const d = detect(route.startSystem);
    const otherStation = Boolean(route.startMarketId) && Boolean(d.startMarketId) && d.startMarketId !== route.startMarketId;
    const otherCommodity = d.startCommodity !== route.startCommodity;
    if ((otherStation || otherCommodity) && req.body?.confirm !== true) {
      const loops = otherCommodity ? await prisma.loop.count({ where: { routeId: route.id } }) : 0;
      const diff = [
        otherStation ? `départ de « ${d.startStation} » au lieu de « ${route.startStation} »` : null,
        otherCommodity ? `marchandise « ${d.startCommodity} » au lieu de « ${route.startCommodity} »` : null,
      ].filter(Boolean).join(', ');
      const lost = loops ? ` Les ${loops} boucle(s) enregistrée(s) seraient effacées puis recalculées depuis les journaux encore présents.` : '';
      throw httpError(409, `${REDETECT_OTHER} : ${diff}.${lost}`);
    }
    const structure = { ...d };
    delete structure.loop;
    const updated = await prisma.route.update({
      where: { id: route.id },
      data: {
        startStation: d.startStation,
        startMarketId: d.startMarketId ?? 0,
        startCommodity: d.startCommodity,
        structure: JSON.stringify(structure),
        stations: JSON.stringify(d.stations),
        systems: JSON.stringify(d.systems),
        commodities: JSON.stringify(d.commodities),
      },
    });
    // Les boucles sont recalculées avec la nouvelle structure (par la file : jamais en même temps qu'une autre synchro)
    await tracker.enqueue(async () => {
      if (d.startCommodity !== route.startCommodity) await prisma.loop.deleteMany({ where: { routeId: route.id } });
      await tracker.syncRoute(updated);
    });
    tracker.notify([route.id]);
    res.json(publicRoute(updated));
  }));

  /** Relit les journaux pour retrouver les boucles de la route. */
  router.post('/routes/:id/resync', wrap(async (req, res) => {
    const route = await getRoute(req.params.id);
    await tracker.syncRouteQueued(route);
    tracker.notify([route.id]);
    res.json({ ok: true });
  }));

  router.delete('/routes/:id', wrap(async (req, res) => {
    const route = await getRoute(req.params.id);
    await prisma.route.delete({ where: { id: route.id } });
    tracker.notify([route.id]);
    res.json({ ok: true });
  }));

  /** Revérifie le dernier achat et renvoie l'alerte (sert aussi à tester l'affichage). */
  router.post('/buy-check/last', wrap(async (req, res) => {
    const r = await tracker.checkLastBuy();
    if (!r) throw httpError(404, "Aucun achat à vérifier sur la route active (achat hors route, ou aucune route active).");
    ctx.broadcast('routes:buy-check', { ...r, test: true });
    res.json(r);
  }));

  /** Historique : toutes les boucles, filtrables par route et par date. */
  router.get('/loops', wrap(async (req, res) => {
    const where = {};
    const q = req.query;
    if (q.routeId != null && q.routeId !== '') where.routeId = requireRowId(q.routeId, 'Route introuvable.');
    // Jour AAAA-MM-JJ (champ date de la page) : autre chose (tableau, texte, date impossible) est refusé, pas passé à la base
    const day = (v, time) => {
      const d = typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v) ? new Date(`${v}T${time}`) : null;
      if (!d || !Number.isFinite(d.getTime())) throw httpError(400, 'Date invalide : jour attendu au format AAAA-MM-JJ.');
      return d;
    };
    const startAt = {};
    if (q.from != null && q.from !== '') startAt.gte = day(q.from, '00:00:00');
    if (q.to != null && q.to !== '') startAt.lte = day(q.to, '23:59:59');
    if (Object.keys(startAt).length) where.startAt = startAt;
    const loops = await prisma.loop.findMany({
      where,
      orderBy: { startAt: 'desc' },
      take: 5000,
      include: { route: { select: { name: true } } },
    });
    res.json(loops.map((l) => ({
      ...l,
      routeName: l.route.name,
      route: undefined,
      tags: parseJsonColumn(l.tags || '[]', [], { label: `Boucle ${l.id} (étiquettes)`, accept: Array.isArray }),
      cargoDetail: parseJsonColumn(l.cargoDetail || '[]', [], { label: `Boucle ${l.id} (soute)`, accept: Array.isArray }),
    })));
  }));

  /** Questions en attente (changement de station ou de marchandise sur la route active). */
  router.get('/questions', wrap(async (req, res) => {
    res.json(tracker.pendingQuestions());
  }));

  router.post('/questions/:id', wrap(async (req, res) => {
    const updated = await tracker.answer(req.params.id, !!req.body?.yes);
    if (!updated) throw httpError(404, 'Question déjà traitée.');
    res.json(publicRoute(updated));
  }));

  /**
   * Dernier relevé de marché archivé de chaque station d'un système (?system=), pour les autres modules :
   * [{ marketId, station, at, items: [{ commodity, sellPrice, demand }] }]. Seules les marchandises en stock ou en
   * demande sont archivées : une marchandise absente, la station ne l'achète pas.
   */
  router.get('/markets', wrap(async (req, res) => {
    const system = String(req.query.system || '');
    if (!system) return res.json([]);
    const last = await prisma.marketSnapshot.groupBy({ by: ['marketId'], where: { system }, _max: { at: true } });
    if (!last.length) return res.json([]);
    // Deux requêtes en tout (avant : une par station), sur l'index [system, marketId, at]
    const rows = await prisma.marketSnapshot.findMany({
      where: { system, OR: last.map((l) => ({ marketId: l.marketId, at: l._max.at })) },
    });
    const byMarket = new Map(last.map((l) => [l.marketId, []]));
    for (const r of rows) byMarket.get(r.marketId)?.push(r);
    const out = last.map((l) => {
      const items = byMarket.get(l.marketId);
      return {
        marketId: l.marketId, station: items[0]?.station || '?', at: l._max.at,
        items: items.filter((i) => i.demand > 0 && i.sellPrice > 0).map((i) => ({ commodity: i.commodity, sellPrice: i.sellPrice, demand: i.demand })),
      };
    });
    return res.json(out);
  }));

  /** Dashboard : totaux toutes routes confondues. */
  router.get('/dashboard', wrap(async (req, res) => {
    const routes = await prisma.route.findMany({ orderBy: { lastUsedAt: 'desc' } });
    // Deux routes passant par les mêmes systèmes peuvent avoir enregistré le même trajet :
    // chaque période de jeu n'est comptée qu'une fois (route active d'abord, puis la plus récente).
    const rank = new Map([...routes].sort((a, b) => b.active - a.active).map((r, i) => [r.id, i]));
    const loops = (await prisma.loop.findMany()).sort((a, b) => rank.get(a.routeId) - rank.get(b.routeId) || a.startAt - b.startAt);
    const kept = [];
    for (const l of loops) {
      if (!kept.some((k) => l.startAt < k.endAt && k.startAt < l.endAt)) kept.push(l);
    }
    const total = (f) => kept.reduce((a, l) => a + (l[f] || 0), 0);
    const all = {
      _sum: Object.fromEntries(['netGain', 'merits', 'repairs', 'wages', 'rebuy', 'durationSec', 'activeSec'].map((f) => [f, total(f)])),
      _count: { _all: kept.length },
    };
    const destroyed = kept.filter((l) => l.destroyed).length;
    const perRoute = await prisma.loop.groupBy({
      by: ['routeId'],
      _sum: { netGain: true, merits: true, durationSec: true },
      _count: { _all: true },
    });
    const byRoute = new Map(perRoute.map((s) => [s.routeId, s]));
    const state = ctx.game.snapshot();
    res.json({
      balance: state.balance,
      commander: state.commander,
      loops: all._count._all,
      net: all._sum.netGain || 0,
      merits: all._sum.merits || 0,
      repairs: all._sum.repairs || 0,
      wages: all._sum.wages || 0,
      rebuy: all._sum.rebuy || 0,
      playSec: all._sum.activeSec || 0, // temps réellement joué, pauses retirées
      destroyed,
      routes: routes.map((r) => {
        const s = byRoute.get(r.id);
        return {
          id: r.id,
          name: r.name,
          active: r.active,
          loops: s?._count._all || 0,
          net: s?._sum.netGain || 0,
          merits: s?._sum.merits || 0,
        };
      }),
    });
  }));
}
