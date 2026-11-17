// Liste des routes de l'app Express (méthodes et chemin complet), telles que le cœur et les modules les ont déclarées.
// Elle sert au banc de contrôle (scripts/controle/etapes/80-attaques.mjs), qui rejoue ses attaques sur TOUTES les
// routes, sans liste tenue à la main qu'un nouveau module oublierait. Rien n'est exposé en HTTP : la liste ne part que
// par le canal IPC du banc (index.js), que seul le programme qui a lancé le serveur peut utiliser.

import express from 'express';

let every = null;
// Pile des couches de l'app : app.router depuis Express 5, app._router en Express 4
const stackOf = (app) => (app.router ?? app._router)?.stack;

/** Méthodes qu'app.all() déclare (celles qu'Express connaît), relevées une fois sur une app d'essai. */
function allMethods() {
  if (!every) {
    const probe = express();
    probe.all('/', () => {});
    every = Object.keys(stackOf(probe).find((l) => l.route).route.methods);
  }
  return every;
}

/** Méthodes d'une route ; ['ALL'] pour app.all() (Express 4 la déclare pour chaque méthode connue) ou route.all(). */
function methodsOf(route) {
  const set = Object.keys(route.methods).filter((m) => route.methods[m]);
  if (set.includes('_all') || allMethods().every((m) => set.includes(m))) return ['ALL'];
  return set.map((m) => m.toUpperCase());
}

/**
 * Routes de `app`. `mounts` : Map(routeur → chemin de montage), tenue par index.js au montage de chaque module (Express
 * ne garde pas le chemin d'un routeur monté, seulement de quoi le reconnaître).
 * Une route au chemin qui n'est pas un texte (expression régulière) est rendue avec path: null, et un routeur monté
 * hors de `mounts` aussi : le banc les signale au lieu de les oublier. Un tableau de chemins donne une entrée par chemin.
 * @returns {{ methods: string[], path: string|null, raw: string }[]}
 */
export function listRoutes(app, mounts = new Map()) {
  const out = [];
  const visit = (stack, base) => {
    for (const layer of stack || []) {
      if (layer.route) {
        const { route } = layer;
        const methods = methodsOf(route);
        for (const p of Array.isArray(route.path) ? route.path : [route.path]) {
          out.push({ methods, path: typeof p === 'string' ? base + p : null, raw: String(p) });
        }
      } else if (layer.name === 'router' && Array.isArray(layer.handle?.stack)) {
        if (mounts.has(layer.handle)) visit(layer.handle.stack, mounts.get(layer.handle));
        else out.push({ methods: [], path: null, raw: `routeur monté sans chemin connu (${String(layer.regexp ?? layer.path ?? 'chemin inconnu')})` });
      }
    }
  };
  visit(stackOf(app), '');
  return out;
}
