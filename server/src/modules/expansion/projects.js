// Routes de l'API du Projet extension pour les routes d'extension : création, modification, suppression, rapport de
// la semaine (/merits), palier déclaré atteint (/palier) et Coup d'œil (/here).
//
// Les mérites, relevés et paliers déclarés sont rattachés au nom du système, jamais à la route : ils survivent à la
// modification d'une route (renommer la route, ajouter, retirer ou déplacer un système). Les noms sont comparés sans
// tenir compte de la casse, et repris dans l'orthographe du journal dès que le système y figure.

import { cleanRoute, MAX_STEPS, REACH, ROLES, summary } from './route.js';
import { BAND_POINTS, hasName, readingsOf, routeProgress, systemInfo, weekReport, weekStart, workSystem } from './merits.js';
import { requireRowId } from '../../core/ids.js';
import { parseJsonColumn } from '../../core/jsonColumn.js';

const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

function bad(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  err.publicMessage = message;
  return err;
}

const text = (v, max) => String(v ?? '').trim().slice(0, max);
const same = (a, b) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();

/** Étapes d'un projet en base : une colonne abîmée vaut une route vide (signalée), le reste de la liste s'affiche. */
const isSteps = (v) => Array.isArray(v) && v.every((x) => x !== null && typeof x === 'object');
const parseSteps = (json, id) => parseJsonColumn(json, [], { label: `Projet extension ${id ?? '?'} (étapes)`, accept: isSteps });

/**
 * @param merits () => MeritLog en cours (il est remplacé à chaque relecture des journaux)
 * @param paliers Paliers (paliers.js)
 * @param now () => instant présent (ms), réglable pour les tests
 * @param journalReady () => les journaux sont-ils lus ? Avant, le MeritLog est vide : aucun saut ne peut être calculé
 */
export function registerProjects({ router, prisma, broadcast, merits, paliers, now = () => Date.now(), journalReady = () => true }) {
  // Étapes d'une route, dans l'orthographe du journal quand le système y figure
  const stepsOf = (p) => parseSteps(p.steps, p.id).map((s) => ({ ...s, name: merits().canon(String(s?.name ?? '')) }));
  const view = (p) => {
    const steps = stepsOf(p);
    return { ...p, steps, ...summary(steps) };
  };
  const checked = (body) => {
    // Journaux pas encore lus (démarrage) : un saut laissé vide serait refusé à tort (« passe dans les deux systèmes »)
    const blank = (s, i) => i > 0 && (s?.jump == null || String(s.jump).trim() === '');
    if (!journalReady() && Array.isArray(body?.steps) && body.steps.some(blank)) {
      throw bad('Lecture de tes journaux en cours : les sauts laissés vides ne peuvent pas encore être calculés. Réessaie dans un instant.', 503);
    }
    const log = merits();
    const { route, error } = cleanRoute(body, { canon: (n) => log.canon(n), distance: (a, b) => log.distance(a, b) });
    if (error) throw bad(error);
    return route;
  };

  // Règles d'une route (dépôt des règles) : portée de chaque objectif, pour le contrôle en direct de l'éditeur, et
  // points de chaque palier (1,0 de jauge), pour calculer un objectif depuis l'état de départ d'un système
  router.get('/rules', (req, res) => {
    res.json({ reach: REACH, roles: ROLES, maxSteps: MAX_STEPS, bands: BAND_POINTS });
  });

  router.get('/projects', wrap(async (req, res) => {
    const rows = await prisma.expansionProject.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(rows.map(view));
  }));

  // Sauts d'après les positions des journaux : ?systems=A&systems=B… (dans l'ordre de la route). Lecture seule.
  router.get('/jumps', (req, res) => {
    const raw = req.query.systems;
    const names = (Array.isArray(raw) ? raw : raw != null ? [raw] : []).slice(0, MAX_STEPS).map((n) => text(n, 120));
    const log = merits();
    res.json({
      steps: names.map((name, i) => ({
        name: name ? log.canon(name) : name,
        known: Boolean(name) && log.positions.has(name.toLowerCase()),
        jump: i > 0 && name && names[i - 1] ? log.distance(names[i - 1], name) : null,
      })),
    });
  });

  // Historique des mérites : ?project=<id> (systèmes de la route) ou rien (tous les systèmes), ?week=<début en ms>
  router.get('/merits', wrap(async (req, res) => {
    const asked = req.query.project != null && req.query.project !== '';
    const id = asked ? requireRowId(req.query.project, 'Projet introuvable.') : null;
    const project = id ? await prisma.expansionProject.findUnique({ where: { id } }) : null;
    if (id && !project) throw bad('Projet introuvable.', 404);
    const log = merits();
    const steps = project ? stepsOf(project) : [];
    const week = Number(req.query.week) || undefined;
    const roles = new Map(steps.map((s) => [s.name, s.role]));
    // Paliers déclarés et relevés de la semaine du rapport : une semaine passée montre la route telle qu'elle était
    const declared = paliers.pour(weekStart(week ?? now()));
    const report = weekReport(log.entries, { systems: steps.map((s) => s.name), week, now: now(), readings: log.readings, roles, declared });
    const reading = (name) => {
      const r = readingsOf(log.readings, name).filter((x) => x.t < report.end).at(-1);
      return r ? { at: r.t, mode: r.mode, state: r.state, progress: r.progress, stale: r.t < report.start } : null;
    };
    const progress = routeProgress(steps, log.readings, declared, { end: report.end });
    const current = steps[progress.index];
    res.json({
      ...report,
      // declared : palier déclaré atteint cette semaine-là, en attente du passage (bulle sur la carte)
      steps: steps.map((s) => ({ name: s.name, role: s.role, reading: reading(s.name), declared: hasName(declared, s.name) })),
      progress,
      // Système en cours de la route : ses infos s'affichent même sans mérites gagnés cette semaine
      objective: current
        ? systemInfo(current.name, { entries: log.entries, readings: log.readings, role: current.role, end: report.end, declared: hasName(declared, current.name) })
        : null,
    });
  }));

  // Palier déclaré atteint (ou plus) pour la semaine en cours : { system, atteint }. Le système doit être sur une route.
  router.put('/palier', wrap(async (req, res) => {
    const system = text(req.body?.system, 120);
    if (!system) throw bad('Système manquant.');
    const rows = await prisma.expansionProject.findMany();
    const step = rows.flatMap(stepsOf).find((s) => same(s.name, system));
    if (!step) throw bad('Ce système n’est sur aucune route.', 404);
    const declared = paliers.regler(step.name, weekStart(now()), req.body?.atteint === true);
    broadcast('expansion:merits', {});
    res.json({ system: step.name, atteint: hasName(declared, step.name) });
  }));

  // Coup d'œil : le système ?system= est-il l'étape en cours d'un projet ? (null sinon)
  router.get('/here', wrap(async (req, res) => {
    const name = text(req.query.system, 120);
    if (!name) return res.json(null);
    const rows = await prisma.expansionProject.findMany({ orderBy: { createdAt: 'desc' } });
    const projects = rows.map((p) => ({ id: p.id, name: p.name, steps: stepsOf(p) }));
    const log = merits();
    const t = now();
    res.json(workSystem(projects, name, { entries: log.entries, readings: log.readings, now: t, declared: paliers.pour(weekStart(t)) }));
  }));

  router.post('/projects', wrap(async (req, res) => {
    const route = checked(req.body);
    const row = await prisma.expansionProject.create({
      data: { name: route.name, description: route.description, steps: JSON.stringify(route.steps) },
    });
    broadcast('expansion:update', {});
    res.status(201).json(view(row));
  }));

  // Modification d'une route : même identifiant, même vérification qu'à la création
  router.put('/projects/:id', wrap(async (req, res) => {
    const id = requireRowId(req.params.id, 'Projet introuvable.');
    const route = checked(req.body);
    const { count } = await prisma.expansionProject.updateMany({
      where: { id },
      data: { name: route.name, description: route.description, steps: JSON.stringify(route.steps) },
    });
    if (!count) throw bad('Projet introuvable.', 404);
    broadcast('expansion:update', {});
    broadcast('expansion:merits', {});
    res.json(view(await prisma.expansionProject.findUnique({ where: { id } })));
  }));

  router.delete('/projects/:id', wrap(async (req, res) => {
    await prisma.expansionProject.deleteMany({ where: { id: requireRowId(req.params.id, 'Projet introuvable.') } });
    broadcast('expansion:update', {});
    res.status(204).end();
  }));
}
