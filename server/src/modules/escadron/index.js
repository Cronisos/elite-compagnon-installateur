// Module « Escadron » : l'app comme capteur du Squadron Tracker (envoi opt-in des mérites, à la place du plugin
// EDMC, avec rattrapage depuis les journaux), et « Mon apport à l'escadron » d'après les Statistics du jeu.
//
// Seul envoi réseau du module : POST vers le Worker du Squadron Tracker, et seulement si le joueur l'a activé et
// a collé son jeton. Pendant les tests (node --test), le réseau est coupé d'office.

import path from 'node:path';
import { localFetch, netFetch, setUserHost } from '../../core/net.js';
import { dataDir } from '../../core/paths.js';
import { SENSOR_EVENTS } from './payload.js';
import { SquadronSensor, weekStart } from './sensor.js';
import { STATS_EVENTS, SquadronStats } from './stats.js';
import { fileStore } from './store.js';
import { Chef } from './chef/chef.js';
import { Partage } from './partage.js';
import { lireSources } from './sources.js';
import { ColonisationEscadron } from './colonisation.js';

const AUTO_MS = 2 * 60 * 1000; // un passage du partage automatique toutes les 2 min, s'il est réglé
// Projet de colonisation : relu toutes les 2 min s'il est activé, et peu après chaque relevé du dépôt écrit par le jeu
const COLO_MS = 2 * 60 * 1000;
const COLO_APRES_DEPOT_MS = 10_000; // le jeu peut écrire le dépôt toutes les 15 s à quai : un passage pour la rafale
const COLO_EVENTS = ['ColonisationConstructionDepot', 'ColonisationContribution', 'Docked'];

const DATA_DIR = dataDir() + path.sep;
const BROADCAST_MS = 500;

const wrap = (fn) => (req, res, next) => {
  try {
    fn(req, res);
  } catch (err) {
    next(err);
  }
};

/** Le réseau du module : jamais pendant les tests, même si un fichier de réglages traîne. */
export function moduleFetch(env = process.env) {
  if (env.NODE_TEST_CONTEXT) {
    return async () => {
      throw new Error('Envoi réseau interdit pendant les tests');
    };
  }
  return (url, options) => netFetch(url, options); // liste blanche : seul le Worker du Squadron Tracker
}

/** Branche le module ; `dataDir` et `fetch` sont remplacés dans les tests. */
export function setup({ router, journal, broadcast, dataDir = DATA_DIR, fetch = moduleFetch(), sensorOptions = {}, selfUrl = null, localFetchImpl, autoMs = process.env.NODE_TEST_CONTEXT ? 0 : AUTO_MS }) {
  let pending = null;
  const push = () => {
    pending ??= setTimeout(() => {
      pending = null;
      broadcast('escadron:update', sensor.view());
    }, BROADCAST_MS);
    pending.unref?.();
  };
  // Le Worker de l'escadron du joueur, s'il l'a réglé : ajouté à la liste blanche de la passerelle
  const allowHost = (host) => setUserHost('escadron', host);
  const sensor = new SquadronSensor({ store: fileStore(dataDir), fetch, onChange: push, allowHost, ...sensorOptions });
  let stats = new SquadronStats();

  const sensorEvents = new Set(SENSOR_EVENTS);
  const statsEvents = new Set(STATS_EVENTS);
  journal.addInterest([...sensorEvents, ...statsEvents]);
  journal.on('ready', ({ history }) => {
    stats = new SquadronStats();
    for (const ev of history) if (statsEvents.has(ev.event)) stats.apply(ev);
    sensor.ingestHistory(history.filter((ev) => sensorEvents.has(ev.event)));
    broadcast('escadron:stats', {});
  });
  journal.on('event', (ev) => {
    if (sensorEvents.has(ev.event)) sensor.live(ev);
    if (statsEvents.has(ev.event) && stats.apply(ev)) broadcast('escadron:stats', {});
  });

  router.get('/status', (req, res) => res.json(sensor.view()));
  router.put('/config', wrap((req, res) => {
    const body = req.body || {};
    sensor.configure({
      enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
      since: typeof body.since === 'string' ? body.since : undefined,
    });
    res.json(sensor.view());
  }));
  // Serveur de l'escadron : « https://… », ou vide pour celui de l'app. Un autre serveur efface le jeton.
  router.put('/worker', wrap((req, res) => {
    sensor.setWorker(req.body?.url ?? null);
    res.json(sensor.view());
  }));
  // Le jeton n'est jamais renvoyé : la réponse ne donne que sa version masquée
  // cmdr (facultatif) : le commandant de ce jeton, choisi parmi ceux des journaux
  router.put('/token', wrap((req, res) => {
    sensor.setToken(req.body?.token, req.body?.cmdr);
    res.json(sensor.view());
  }));
  // Commandant du jeton, quand les journaux en ont plusieurs (null : choix retiré). Sans ce choix, rien ne part.
  router.put('/cmdr', wrap((req, res) => {
    sensor.chooseCmdr(req.body?.cmdr); // absent ou pas un texte : 400
    res.json(sensor.view());
  }));
  // Ce que ferait « Rejoindre » avec ce code (rien n'est envoyé) : { hote, change, confirmer }
  router.post('/rejoindre/apercu', wrap((req, res) => {
    const { hote, change, confirmer } = sensor.apercuCode(req.body?.code);
    res.json({ hote, change, confirmer });
  }));
  // Inscription avec le code de l'escadron : { code, cmdr? } (« ESC1.… », ou le mot de passe seul). Renvoie la vue.
  router.post('/rejoindre', async (req, res, next) => {
    try {
      await sensor.join(req.body?.code ?? req.body?.password, req.body?.cmdr, { confirmerServeur: req.body?.confirmerServeur });
      res.json(sensor.view());
    } catch (err) {
      next(err);
    }
  });
  router.delete('/token', wrap((req, res) => {
    sensor.clearToken();
    res.json(sensor.view());
  }));
  router.post('/retry', wrap((req, res) => {
    sensor.retryNow();
    res.json(sensor.view());
  }));
  router.get('/contribution', (req, res) => {
    const pick = (v) => (typeof v === 'string' && v.length <= 40 ? v : undefined);
    const preset = pick(req.query.preset);
    const presets = stats.presets(weekStart);
    const from = preset && Object.hasOwn(presets, preset) ? presets[preset] : pick(req.query.from);
    res.json(stats.compare(from, pick(req.query.to), weekStart));
  });

  // --- Gestion du serveur : le monter ou le reprendre, la route, le suivi Discord, les membres (chef/chef.js) ---
  const chef = new Chef({ dir: dataDir, fetch, allowHost: (host) => setUserHost('escadron-chef', host) });
  const asyncRoute = (fn) => async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (err) {
      next(err);
    }
  };
  router.get('/chef', (req, res) => res.json(chef.view()));
  // { cloudflare, motDePasse, sousDomaine? } : la clé Cloudflare ne sert que pendant l'opération
  router.post('/chef/serveur', asyncRoute(async (req, res) => {
    const b = req.body || {};
    res.json(await chef.monter({ cloudflare: b.cloudflare, motDePasse: b.motDePasse, sousDomaine: b.sousDomaine, remplacer: b.remplacer === true }));
  }));
  // Ce qui appelle le serveur de l'escadron est en POST (en-tête exigé) : jamais déclenché par un simple lien
  router.post('/chef/en-ligne', asyncRoute(async (req, res) => res.json({ enLigne: await chef.enLigne() })));
  router.post('/chef/membres/liste', asyncRoute(async (req, res) => res.json({ membres: await chef.membres() })));
  // Nouveau jeton (nouveau membre, ou membre qui a perdu le sien) : montré une fois, jamais gardé par l'app
  router.post('/chef/membres', asyncRoute(async (req, res) => res.json(await chef.nouveauJeton(req.body?.cmdr))));
  // Couper ses installations (jetons du code) : ses mérites restent, il peut rejoindre de nouveau
  router.delete('/chef/membres/:cmdr/installations', asyncRoute(async (req, res) => {
    await chef.couperInstallations(req.params.cmdr);
    res.json({ membres: await chef.membres() });
  }));
  router.post('/chef/inscriptions/lire', asyncRoute(async (req, res) => res.json(await chef.inscriptions())));
  router.put('/chef/inscriptions', asyncRoute(async (req, res) => res.json(await chef.reglerInscriptions(req.body?.ouvertes))));
  // Nouvelle clé de chef (avec la clé Cloudflare) : les anciens codes de gestion ne marchent plus
  router.put('/chef/cle-chef', asyncRoute(async (req, res) => res.json(await chef.changerCleChef({ cloudflare: req.body?.cloudflare }))));
  router.delete('/chef/membres/:cmdr', asyncRoute(async (req, res) => {
    await chef.retirer(req.params.cmdr);
    res.json({ membres: await chef.membres() });
  }));
  router.put('/chef/mot-de-passe', asyncRoute(async (req, res) => {
    await chef.motDePasse({ cloudflare: req.body?.cloudflare, motDePasse: req.body?.motDePasse });
    res.json(chef.view());
  }));
  // Reprendre un serveur existant : { code } (code de gestion « EGC1.… ») ou { url, cleChef, cleSuivi?, motDePasse? }
  router.post('/chef/relier', asyncRoute(async (req, res) => {
    const b = req.body || {};
    res.json(await chef.relier({ code: b.code, url: b.url, cleChef: b.cleChef, cleSuivi: b.cleSuivi, motDePasse: b.motDePasse }));
  }));
  // Code de gestion (tous les droits) : seulement sur demande, jamais dans la vue
  router.post('/chef/code-gestion', (req, res) => res.json({ code: chef.codeGestion() }));
  router.delete('/chef', (req, res) => res.json(chef.oublier()));
  router.put('/chef/mot-de-passe-actuel', wrap((req, res) => res.json(chef.noterMotDePasse(req.body?.motDePasse))));
  router.post('/chef/route/lire', asyncRoute(async (req, res) => res.json(await chef.routeServeur())));
  router.put('/chef/route', asyncRoute(async (req, res) => res.json(await chef.envoyerRoute(req.body?.route))));
  // { github, webhook, route } : suivi Discord sur GitHub, 24 h/24
  router.post('/chef/suivi', asyncRoute(async (req, res) => {
    const b = req.body || {};
    res.json(await chef.suiviGithub({ github: b.github, webhook: b.webhook, route: b.route }));
  }));

  // Rôles (hiérarchie de l'escadron), rôle d'un membre, installations à confirmer
  router.post('/chef/roles/lire', asyncRoute(async (req, res) => res.json({ roles: await chef.roles() })));
  router.put('/chef/roles', asyncRoute(async (req, res) => res.json({ roles: await chef.enregistrerRoles(req.body?.roles) })));
  router.put('/chef/membres/:cmdr/role', asyncRoute(async (req, res) => {
    await chef.donnerRole(req.params.cmdr, req.body?.role ?? null);
    res.json({ membres: await chef.membres() });
  }));
  router.post('/chef/membres/:cmdr/confirmer', asyncRoute(async (req, res) => {
    await chef.confirmerInstallations(req.params.cmdr);
    res.json({ membres: await chef.membres() });
  }));

  // --- Partage avec l'escadron (partage.js) : opt-in, par le serveur et le jeton du joueur ---
  const partage = new Partage({
    dir: dataDir,
    fetch,
    acces: () => ({ base: sensor.workerBase ?? null, token: sensor.token ?? null }),
    onChange: () => broadcast('escadron:partage', {}),
    // Les objets du joueur, lus par l'API locale des autres modules (jamais leur code) ; un module absent : rien
    source: async (kinds) => {
      if (!selfUrl) return [];
      const get = async (chemin) => {
        const res = await localFetch(`${selfUrl}${chemin}`, {}, { fetchImpl: localFetchImpl, timeoutMs: 10_000 });
        if (res.status === 404) return null; // module absent de cette version, ou objet supprimé entre-temps
        if (!res.ok) throw new Error(`Lecture locale refusée (${res.status})`);
        return res.json();
      };
      return lireSources(get, kinds);
    },
  });
  if (autoMs > 0) setInterval(() => partage.synchroniser().catch(() => {}), autoMs).unref?.();
  router.get('/partage', (req, res) => {
    partage.rafraichirSiVieux();
    res.json(partage.view());
  });
  router.put('/partage/actif', wrap((req, res) => {
    partage.activer(req.body?.actif);
    res.json(partage.view());
  }));
  router.post('/partage/lire', asyncRoute(async (req, res) => res.json(await partage.lire())));
  // Partage automatique d'un type : { kind, to } (to null : jamais), puis un passage tout de suite
  router.put('/partage/auto', asyncRoute(async (req, res) => {
    partage.reglerAuto(req.body?.kind, req.body?.to ?? null);
    res.json(await partage.synchroniser());
  }));
  router.post('/partage/auto/passage', asyncRoute(async (req, res) => res.json(await partage.synchroniser())));
  router.post('/partage/auto/reprendre', asyncRoute(async (req, res) => {
    partage.reprendreAuto();
    res.json(await partage.synchroniser());
  }));
  // { kind, ref, title, data, to: { all: true } | { role } | { cmdrs: [...] } }
  router.post('/partage/envoyer', asyncRoute(async (req, res) => res.json(await partage.envoyer(req.body || {}))));
  router.put('/partage/masques', wrap((req, res) => {
    if (req.body?.tout === false) partage.demasquer();
    else partage.masquer(req.body?.id, req.body?.masque !== false);
    res.json(partage.view());
  }));
  router.post('/partage/installations/:id/confirmer', asyncRoute(async (req, res) => res.json(await partage.confirmer(req.params.id))));
  router.delete('/partage/:id', asyncRoute(async (req, res) => res.json(await partage.retirer(req.params.id))));

  // --- Projet de colonisation de l'escadron (colonisation.js) : opt-in, par le serveur et le jeton du joueur ---
  const localGet = async (chemin) => {
    const res = await localFetch(`${selfUrl}${chemin}`, {}, { fetchImpl: localFetchImpl, timeoutMs: 10_000 });
    if (res.status === 404) return null; // module absent de cette version, ou chantier oublié entre-temps
    if (!res.ok) throw new Error(`Lecture locale refusée (${res.status})`);
    return res.json();
  };
  const colonisation = new ColonisationEscadron({
    dir: dataDir,
    fetch,
    acces: () => ({ base: sensor.workerBase ?? null, token: sensor.token ?? null }),
    chef: () => chef.gere(),
    onChange: () => broadcast('escadron:colonisation', {}),
    // Chantiers suivis ici dans les systèmes du projet, lus par l'API locale du module Colonisation (jamais son code)
    source: async (systemes) => {
      if (!selfUrl) return [];
      const dans = new Set(systemes.map((s) => s.toLowerCase()));
      const vue = await localGet('/api/modules/colonisation/sites');
      const ids = (vue?.sites ?? []).filter((s) => dans.has(String(s.system ?? '').toLowerCase())).map((s) => s.marketId).slice(0, 100);
      const chantiers = [];
      for (const id of ids) {
        const site = await localGet(`/api/modules/colonisation/sites/${encodeURIComponent(id)}?local=1`);
        if (site) chantiers.push(site);
      }
      return chantiers;
    },
  });
  if (autoMs > 0) {
    setInterval(() => colonisation.enFond(), COLO_MS).unref?.();
    journal.addInterest(COLO_EVENTS);
    const coloEvents = new Set(COLO_EVENTS);
    let apresDepot = null;
    journal.on('event', (ev) => {
      if (!coloEvents.has(ev.event) || apresDepot) return;
      apresDepot = setTimeout(() => {
        apresDepot = null;
        colonisation.enFond();
      }, COLO_APRES_DEPOT_MS);
      apresDepot.unref?.();
    });
  }
  // ?frais=1 : une page s'ouvre, relecture en arrière-plan si la dernière a plus de 30 s (le HUD, lui, lit sans relire)
  router.get('/colonisation', (req, res) => {
    if (req.query.frais === '1') colonisation.rafraichirSiVieux();
    res.json(colonisation.view());
  });
  router.put('/colonisation/actif', asyncRoute(async (req, res) => {
    colonisation.activer(req.body?.actif);
    if (req.body?.actif === true) await colonisation.enFond(); // une première lecture tout de suite (l'erreur est dans la vue)
    res.json(colonisation.view());
  }));
  router.post('/colonisation/lire', asyncRoute(async (req, res) => res.json(await colonisation.lire({ force: req.body?.force === true }))));
  // Côté chef : le projet du serveur (avec ses relevés), le publier, l'arrêter
  router.post('/chef/colonisation/lire', asyncRoute(async (req, res) => res.json(await chef.colonisationServeur())));
  router.put('/chef/colonisation', asyncRoute(async (req, res) => {
    const r = await chef.envoyerColonisation(req.body?.projet);
    await colonisation.enFond(); // le chef, s'il suit aussi le projet comme membre, le voit tout de suite
    res.json(r);
  }));
  // { webhook } : carte Discord du projet (le lien reste sur le serveur de l'escadron) ; { webhook: null } la retire
  router.put('/chef/colonisation/discord', asyncRoute(async (req, res) => res.json(await chef.carteColonisation(req.body?.webhook ?? null))));
  router.delete('/chef/colonisation', asyncRoute(async (req, res) => {
    const r = await chef.arreterColonisation();
    await colonisation.enFond();
    res.json(r);
  }));

  return { sensor, stats: () => stats, chef, partage, colonisation };
}

export default {
  id: 'escadron',
  name: 'Escadron',

  async register(ctx) {
    setup(ctx);
  },
};
