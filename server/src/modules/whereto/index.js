// Module « Où agir cette semaine » (onglet du Projet extension) : le joueur choisit une activité Powerplay (prise,
// renforcement, sape) ou une tâche de la semaine qu'il a saisie ; l'app liste les systèmes valides à portée, d'après
// Spansh, avec l'âge de chaque donnée. À l'arrivée dans un système, le journal confirme (ou dément) son état.
//
// Réseau : une recherche Spansh part seulement quand le joueur clique « Chercher », avec des noms publics (système
// de référence, puissance, états). Rien ne part en arrière-plan.

import { dataPath } from '../../core/paths.js';
import { netFetch } from '../../core/net.js';
import { ACQUISITION_REACH_FORTIFIED_LY, ACQUISITION_REACH_STRONGHOLD_LY, ACTIVITIES, POWERS, RULES, STATE_LABELS, STATION_GROUPS, checkReading, cleanTask, needsStation, readingOf } from './rules.js';
import { SpanshClient, exactCase } from './spansh.js';
import { findSystems } from './search.js';
import { TaskStore } from './store.js';

const DATA_FILE = dataPath('whereto.json');
const ARRIVALS = new Set(['FSDJump', 'Location', 'CarrierJump']);
const POWER_EVENTS = new Set(['Powerplay', 'PowerplayJoin', 'PowerplayLeave', 'PowerplayDefect', 'PowerplayMerits']);
export const RADIUS = { min: 5, max: 60, default: 30 };

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

function bad(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  err.publicMessage = message;
  return err;
}

const clamp = (v, { min, max, default: def }) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

/** Puissance du joueur après un événement Powerplay du journal. */
export function powerAfter(ev, current) {
  switch (ev.event) {
    case 'Powerplay':
    case 'PowerplayJoin':
    case 'PowerplayMerits':
      return typeof ev.Power === 'string' ? ev.Power : current;
    case 'PowerplayDefect':
      return typeof ev.ToPower === 'string' ? ev.ToPower : current;
    case 'PowerplayLeave':
      return null;
    default:
      return current;
  }
}

/** Fabrique du module (fichier de données et accès réseau remplaçables pour les tests). */
export function createModule({ file = DATA_FILE, fetchImpl, now = Date.now } = {}) {
  return {
    id: 'whereto',
    name: 'Où agir cette semaine',

    async register({ router, journal, game, broadcast }) {
      const spansh = new SpanshClient({ fetchImpl: fetchImpl || netFetch, now });
      const store = new TaskStore(file, now);
      let power = null;
      let readings = new Map(); // système → dernier relevé du journal
      let lastSearch = null; // { task, power, systems: Map nom → état Spansh }
      let lastArrival = null; // dernière arrivée utile : dans la liste, ou valide pour la tâche

      const learn = (ev) => {
        if (POWER_EVENTS.has(ev.event)) power = powerAfter(ev, power);
        else if (ARRIVALS.has(ev.event)) {
          const r = readingOf(ev);
          if (r) readings.set(r.name, r);
          return r;
        }
        return null;
      };

      journal.addInterest([...ARRIVALS, ...POWER_EVENTS]);
      journal.on('ready', ({ history }) => {
        power = null;
        readings = new Map();
        for (const ev of history) learn(ev);
      });
      journal.on('event', (ev) => {
        const r = learn(ev);
        if (!r || !lastSearch) return;
        // Arrivée : le journal confirme-t-il la tâche de la dernière recherche ?
        const { task } = lastSearch;
        const check = checkReading(r, task, lastSearch.power);
        const arrival = {
          system: r.name,
          at: r.at,
          task: task.name,
          inResults: lastSearch.systems.has(r.name),
          spansh: lastSearch.systems.get(r.name) || null,
          valid: check.valid,
          reasons: check.reasons,
          state: r.state,
          controllingPower: r.controllingPower,
          stationNote: needsStation(task) ? "Le journal ne liste pas les stations à l'arrivée : vérifie le type de station sur la carte du système." : null,
        };
        // Un saut de transit (hors de la liste, pas valide) ne remplace pas le verdict de la dernière cible
        if (arrival.inResults || arrival.valid === true) lastArrival = arrival;
        broadcast('whereto:arrival', arrival);
      });

      router.get('/context', (req, res) => {
        res.json({
          power,
          system: game.snapshot().system || null,
          powers: POWERS,
          activities: Object.values(ACTIVITIES),
          stationGroups: Object.entries(STATION_GROUPS).map(([id, g]) => ({ id, label: g.label })),
          states: STATE_LABELS,
          radius: RADIUS,
          reach: { fortified: ACQUISITION_REACH_FORTIFIED_LY, stronghold: ACQUISITION_REACH_STRONGHOLD_LY },
          seen: readings.size,
        });
      });

      // Règles et constantes, pour la future vigie des règles
      router.get('/rules', (req, res) => res.json(RULES));

      router.get('/arrival', (req, res) => res.json(lastArrival));

      router.get('/tasks', (req, res) => res.json(store.list()));

      router.post('/tasks', wrap(async (req, res) => {
        const task = store.add(req.body);
        if (!task) throw bad('Tâche invalide : donne-lui un nom et choisis le type de système.');
        broadcast('whereto:tasks', {});
        res.status(201).json(task);
      }));

      router.post('/tasks/:id/renew', wrap(async (req, res) => {
        const task = store.renew(String(req.params.id));
        if (!task) throw bad('Tâche introuvable.', 404);
        broadcast('whereto:tasks', {});
        res.json(task);
      }));

      router.delete('/tasks/:id', wrap(async (req, res) => {
        if (!store.remove(String(req.params.id))) throw bad('Tâche introuvable.', 404); // rien effacé : rien à annoncer
        broadcast('whereto:tasks', {});
        res.status(204).end();
      }));

      router.post('/search', wrap(async (req, res) => {
        const b = req.body && typeof req.body === 'object' ? req.body : {};
        const preset = typeof b.activity === 'string' && Object.hasOwn(ACTIVITIES, b.activity) ? ACTIVITIES[b.activity] : null;
        const task = cleanTask(b.task && typeof b.task === 'object' ? b.task : preset);
        if (!task) throw bad('Choisis une activité ou une tâche.');
        const here = game.snapshot().system || null;
        const typed = String(b.system || here || '').trim().slice(0, 120);
        if (!typed) throw bad('Indique un système de référence (ou lance le jeu pour partir de ta position).');
        // Spansh tient compte des majuscules : un nom déjà vu en jeu reprend sa casse exacte, sans rien envoyer
        const reference = readings.has(typed) || typed === here ? typed : exactCase(typed, [here, ...readings.keys()]);
        const myPower = POWERS.includes(b.power) ? b.power : power;
        if (!myPower && task.relation !== 'any' && task.relation !== 'enemy') throw bad('Puissance inconnue : choisis la tienne dans la liste.');
        const result = await findSystems({
          spansh,
          task,
          power: myPower,
          reference,
          radius: clamp(b.radius, RADIUS),
          readings,
          sort: ['distance', 'fresh', 'progress'].includes(b.sort) ? b.sort : 'distance',
          now: now(),
        });
        lastSearch = { task, power: myPower, systems: new Map(result.results.map((r) => [r.name, { state: r.state, controllingPower: r.controllingPower, updatedAt: r.updatedAt }])) };
        res.json(result);
      }));
    },
  };
}

export default createModule();
