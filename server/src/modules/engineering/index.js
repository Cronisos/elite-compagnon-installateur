// Module « Mon ingénierie ».
// Ne dépend que des services communs (journal, base, temps réel).

import { EngineeringService, publicError } from './services/service.js';
import { Visit } from './services/visit.js';
import { Passage } from './services/passage.js';
import { strictBody } from './services/input.js';
import { portraitDe } from './services/portraits.js';
import { ShipNicknames } from '../../core/shipNicknames.js';

const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

/**
 * Plan pour l'interface : sans le commandant (son FID reste dans le serveur, core/commander.js), avec mine : le plan vise
 * un vaisseau du commandant chargé (ou aucun vaisseau). Un plan d'un autre compte reste listé, il n'est pas le sien.
 */
export function planOut(svc, plan) {
  if (!plan || typeof plan !== 'object') return plan;
  const { commanderId, ...rest } = plan;
  return { ...rest, mine: rest.shipId == null || svc.isMine(plan) };
}

/** En-têtes des images servies (dessins des vaisseaux, y compris les SVG téléchargés). */
export const IMAGE_HEADERS = { 'Content-Security-Policy': 'sandbox', 'X-Content-Type-Options': 'nosniff' };

export default {
  id: 'engineering',
  name: 'Mon ingénierie',

  /** options : tests seulement (fichiers JSON de l'itinéraire dans un dossier temporaire, données des ingénieurs). */
  async register(ctx, options = {}) {
    const svc = new EngineeringService(ctx, options);
    const r = ctx.router;
    // Fiche « Chez l'ingénieur » (services/visit.js) : fenêtre en jeu ouverte à quai chez un ingénieur qui a des tâches
    svc.visit = new Visit(svc, { overlay: ctx.overlay, broadcast: ctx.broadcast });
    svc.passage = new Passage(svc, { overlay: ctx.overlay, broadcast: ctx.broadcast });
    /** Alertes de passage : ce qui sert aux plans dans le système où tu es arrivé (fenêtre en jeu engineering-passage). */
    r.get('/passage', (req, res) => res.json(svc.passage.state()));
    r.post('/passage/close', (req, res) => res.json(svc.passage.close()));

    r.get('/visit', wrap(async (req, res) => {
      res.json(await svc.visit.state());
    }));
    /** Plan affiché dans la fiche, choisi à la main (indépendant du vaisseau piloté) ; null : choix automatique. Tient jusqu'au départ. */
    r.put('/visit/plan', wrap(async (req, res) => {
      const v = req.body?.planId;
      if (v !== null && !(Number.isSafeInteger(v) && v > 0)) throw publicError(400, 'Plan invalide : un numéro de plan, ou null.');
      res.json(await svc.visit.choosePlan(v));
    }));
    /** ✕ : fenêtre fermée jusqu'au prochain amarrage. */
    r.post('/visit/close', wrap(async (req, res) => {
      res.json(svc.visit.close());
    }));
    /** « Compris » sur une alerte. */
    r.post('/visit/dismiss', wrap(async (req, res) => {
      const id = req.body?.id;
      if (typeof id !== 'string' || !/^a\d{1,6}$/.test(id)) throw publicError(400, 'Alerte invalide.');
      res.json(svc.visit.dismiss(id));
    }));

    r.get('/status', wrap(async (req, res) => {
      res.json({
        reference: svc.ref?.meta || null,
        // Versions figées de cette version de l'app ? { pinned, problems } (core/reference/download.js, verifyReference)
        integrity: svc.ref?.integrity || null,
        // Données abîmées (fichier tronqué…) : le fichier en cause et comment réparer ; null sinon
        referenceError: svc.ref ? null : svc.refError || null,
        download: svc.download,
        inventoryAt: svc.inventory.baselineAt,
        lastMaterialEventAt: svc.inventory.lastAt,
      });
    }));

    r.post('/reference/update', wrap(async (req, res) => {
      svc.updateReference();
      res.json(svc.download);
    }));

    r.get('/fleet', wrap(async (req, res) => {
      // Vaisseaux du commandant chargé : leurs plans et leurs noms à eux (un ShipID n'est unique que pour un commandant)
      const plans = await ctx.prisma.engineeringPlan.findMany({ select: { id: true, shipId: true, commanderId: true } });
      const byShip = new Map(plans.filter((p) => p.shipId != null && svc.isMine(p)).map((p) => [p.shipId, p.id]));
      // Noms donnés par le joueur (table commune du cœur, core/shipNicknames.js)
      const nicknames = await new ShipNicknames({ prisma: ctx.prisma, single: () => svc.singleCommander() }).load();
      res.json(svc.shipList().map((s) => ({
        ...s,
        nickname: nicknames.get(s.shipId, svc.commander()) || null,
        planId: byShip.get(s.shipId) || null,
        hasImage: svc.hasImage(s.key),
      })));
    }));

    r.get('/ships', wrap(async (req, res) => {
      const ref = svc.requireRef();
      res.json(Object.keys(ref.ships).map((k) => ({ key: k, name: ref.shipName(k) })).sort((a, b) => a.name.localeCompare(b.name)));
    }));

    r.get('/ships/:key/image', wrap(async (req, res) => {
      const p = svc.imagePath(req.params.key); // clé invalide (« ../… ») : erreur 400, rien n'est lu
      if (!p) return res.status(404).end();
      // Dessins SVG téléchargés et images envoyées par le joueur : ouverts seuls dans un onglet, aucun
      // script ne s'exécute (sandbox) et le navigateur ne devine pas un autre type de contenu (nosniff)
      res.set(IMAGE_HEADERS).sendFile(p);
    }));

    r.post('/ships/:key/image', wrap(async (req, res) => {
      svc.saveCustomImage(req.params.key, req.body?.dataUrl);
      svc.notify();
      res.json({ ok: true });
    }));

    r.get('/plans', wrap(async (req, res) => {
      const plans = await ctx.prisma.engineeringPlan.findMany({ orderBy: { updatedAt: 'desc' } });
      res.json(plans.map((p) => planOut(svc, p)));
    }));

    r.post('/plans', wrap(async (req, res) => {
      const { shipId, shipType } = req.body || {};
      if (shipId == null && !shipType) throw publicError(400, 'Choisis un vaisseau.');
      res.status(201).json(planOut(svc, await svc.createPlan({ shipId, shipType })));
    }));

    r.post('/import', wrap(async (req, res) => {
      const { text, shipId } = req.body || {};
      if (!text) throw publicError(400, 'Colle un lien EDSY ou un export JSON.');
      const r = await svc.importBuild({ text, shipId });
      res.status(201).json({ ...r, plan: planOut(svc, r.plan) });
    }));

    r.get('/plans/:id', wrap(async (req, res) => res.json(await svc.planView(req.params.id))));

    r.patch('/plans/:id', wrap(async (req, res) => {
      const p = await svc.getPlan(req.params.id);
      const data = {};
      if (typeof req.body?.name === 'string' && req.body.name.trim()) data.name = req.body.name.trim().slice(0, 120);
      if (typeof req.body?.selected === 'boolean') data.selected = req.body.selected;
      res.json(planOut(svc, await ctx.prisma.engineeringPlan.update({ where: { id: p.id }, data })));
    }));

    r.delete('/plans/:id', wrap(async (req, res) => {
      const p = await svc.getPlan(req.params.id);
      await ctx.prisma.engineeringPlan.delete({ where: { id: p.id } });
      res.json({ ok: true });
    }));

    r.put('/plans/:id/modules/:slot', wrap(async (req, res) => {
      await svc.setModule(req.params.id, req.params.slot, req.body || {});
      res.json(await svc.planView(req.params.id));
    }));

    r.post('/plans/:id/all-g5', wrap(async (req, res) => {
      await svc.allG5(req.params.id);
      res.json(await svc.planView(req.params.id));
    }));

    r.post('/plans/:id/reset', wrap(async (req, res) => {
      await svc.resetPlan(req.params.id);
      res.json(await svc.planView(req.params.id));
    }));

    r.get('/inventory', wrap(async (req, res) => {
      svc.requireRef();
      // absents : matériaux du jeu à 0, pour la page Matériaux rangée comme un échangeur
      res.json({ at: svc.inventory.baselineAt, lastAt: svc.inventory.lastAt, items: svc.inventoryRows(), absents: svc.absentRows() });
    }));

    // Rangs des ingénieurs : table des règles, mesures tirées du journal (mises à jour à chaque application),
    // séquences de montée et écarts avec la table. Lieu des applications : l'hôte (data/engineers.json, R8).
    r.get('/ranks', wrap(async (req, res) => {
      res.json(svc.rankReport());
    }));

    // Table des règles des rangs (données déclarées, lues aussi par la future vigie des règles)
    r.get('/ranks/rules', wrap(async (req, res) => {
      res.json(svc.rankRules());
    }));

    r.get('/dashboard', wrap(async (req, res) => {
      const ids = String(req.query.ids || '').split(',').map(Number).filter(Boolean);
      res.json(await svc.dashboard(ids));
    }));

    // --- Itinéraire d'ingénierie (README, « Itinéraire d'ingénierie ») ---
    // Plans validés (engineering-validated.json) : valider calcule une fois l'itinéraire depuis ta position
    r.get('/validations', wrap(async (req, res) => {
      res.json(await svc.itin.validations());
    }));

    r.post('/plans/:id/validation', wrap(async (req, res) => {
      strictBody(req.body, [], { optional: true });
      res.json(await svc.itin.validate(req.params.id));
    }));

    r.delete('/plans/:id/validation', wrap(async (req, res) => {
      res.json(await svc.itin.unvalidate(req.params.id));
    }));

    // Ingénieurs : faits publics (data/engineers.json), état lu dans le journal, épingle
    r.get('/engineers', wrap(async (req, res) => {
      res.json(svc.itin.engineers());
    }));

    r.get('/engineers/:id', wrap(async (req, res) => {
      res.json(await svc.itin.engineer(req.params.id));
    }));

    // Portrait fourni par le joueur (services/portraits.js) ; aucun : 204, la carte garde ses initiales
    r.get('/engineers/:id/portrait', wrap(async (req, res) => {
      const e = (svc.itin.engineers().engineers || []).find((x) => String(x.id) === String(req.params.id));
      if (!e) throw publicError(404, 'Ingénieur inconnu.'); // identifiant piégé (« ../ »…) ou faux : refusé
      const p = portraitDe(e);
      if (!p) return res.status(204).end();
      res.set({ ...IMAGE_HEADERS, 'Cache-Control': 'no-cache' }).type(p.mime).send(p.buf);
    }));

    r.put('/engineers/:id/pin', wrap(async (req, res) => {
      res.json(svc.itin.setPin(req.params.id, req.body));
    }));

    r.delete('/engineers/:id/pin', wrap(async (req, res) => {
      res.json(svc.itin.clearPin(req.params.id));
    }));

    // Itinéraire : lu tel qu'il a été calculé (jamais recalculé), calculé seulement au clic
    r.get('/route', wrap(async (req, res) => {
      res.json(await svc.itin.view());
    }));

    r.post('/route', wrap(async (req, res) => {
      res.json(await svc.itin.compute(req.body));
    }));

    // Table des règles de l'itinéraire (données déclarées, lues aussi par la future vigie des règles)
    r.get('/route/rules', wrap(async (req, res) => {
      res.json(svc.itin.rules());
    }));
  },
};
