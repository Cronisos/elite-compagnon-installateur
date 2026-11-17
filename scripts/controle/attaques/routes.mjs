// Routes attaquées : celles que le serveur isolé déclare lui-même (canal IPC, server/src/core/routeList.js), jamais une
// liste écrite à la main. Pour chaque module, les noms des champs de corps et de requête qu'il lit sont relevés dans son
// code (req.body.x, const { x } = req.body, req.query.x…) : les corps piégés les visent tous.

import fs from 'node:fs';
import path from 'node:path';
import { SERVEUR } from '../banc/chemins.mjs';

export const LECTURES = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Une route ALL (app.all) est jouée en lecture et en écriture. */
const JOUEES = { ALL: ['GET', 'POST'] };
/**
 * Chemin que le banc sait remplir : segments fixes et paramètres simples en tête de segment (:id, :id.png), sans motif
 * (?, *, (…), +).
 */
const CHEMIN_SIMPLE = /^(\/(:\w+)?[^/:*?()+]*)+$/;

/**
 * Routes du serveur, une entrée par méthode : { methode, chemin, params: ['id', …], module: 'engineering' | null }.
 * illisibles : les routes que le banc ne saurait pas attaquer (chemin non textuel, motif, routeur sans chemin connu) :
 * l'étape échoue s'il y en a, pour qu'aucune route n'échappe aux attaques sans bruit.
 */
export async function routesDuServeur(srv) {
  const { routes } = await srv.demander('routes');
  if (!Array.isArray(routes) || !routes.length) throw new Error('Le serveur isolé ne donne aucune route (canal IPC « routes »).');
  const illisibles = routes.filter((r) => r.path == null || !CHEMIN_SIMPLE.test(r.path) || !r.methods.length);
  const sorties = [];
  for (const r of routes) {
    if (illisibles.includes(r)) continue;
    for (const m of r.methods.flatMap((x) => JOUEES[x] || [x])) {
      sorties.push({
        methode: m,
        chemin: r.path,
        params: [...r.path.matchAll(/:(\w+)/g)].map((x) => x[1]),
        module: /^\/api\/modules\/([^/]+)/.exec(r.path)?.[1] ?? null,
      });
    }
  }
  // Une même méthode sur un même chemin (deux déclarations) n'est jouée qu'une fois
  const vues = new Set();
  const uniques = sorties.filter((r) => {
    const cle = `${r.methode} ${r.chemin}`;
    if (vues.has(cle)) return false;
    vues.add(cle);
    return true;
  });
  return { routes: uniques, illisibles: illisibles.map((r) => r.path ?? r.raw) };
}

/** Chemin avec chaque paramètre remplacé (valeur déjà encodée comme on veut l'envoyer). */
export function remplir(chemin, valeurs = {}, defaut = '1') {
  return chemin.replace(/:(\w+)/g, (_, nom) => (Object.hasOwn(valeurs, nom) ? valeurs[nom] : defaut));
}

const lister = (dossier) => (fs.existsSync(dossier)
  ? fs.readdirSync(dossier, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? lister(path.join(dossier, e.name)) : [path.join(dossier, e.name)]))
  : []);

const NOM = /^[A-Za-z_$][\w$]*$/;
function relever(texte, motifs) {
  const noms = new Set();
  for (const re of motifs.simples) for (const m of texte.matchAll(re)) noms.add(m[1]);
  for (const re of motifs.destructures) {
    for (const m of texte.matchAll(re)) {
      for (const morceau of m[1].split(',')) {
        const nom = morceau.split(/[:=]/)[0].replace(/\.\.\./, '').trim();
        if (NOM.test(nom)) noms.add(nom);
      }
    }
  }
  return noms;
}

const CORPS = {
  simples: [/req\.body\??\.(\w+)/g, /\b(?:b|body|input|data)\??\.(\w+)/g],
  destructures: [/\{([^{}]*)\}\s*=\s*(?:req\.body|b|body|input)\b/g],
};
const REQUETE = {
  simples: [/req\.query\??\.(\w+)/g, /req\.query\[['"]([^'"]+)['"]\]/g, /\bq(?:uery)?\??\.(\w+)/g],
  destructures: [/\{([^{}]*)\}\s*=\s*req\.query\b/g],
};
const IGNORES = new Set(['length', 'map', 'filter', 'trim', 'slice', 'some', 'every', 'find', 'join', 'split', 'toString', 'then', 'catch', 'push']);

/** Champs lus par chaque module (et par le cœur, sous la clé null) : { corps: Map(module → [noms]), requete: … }. */
export function champsDesModules() {
  const corps = new Map();
  const requete = new Map();
  const sources = new Map([[null, [path.join(SERVEUR, 'src', 'index.js'), ...lister(path.join(SERVEUR, 'src', 'core')).filter((f) => !/[\\/](reference|fixtures)[\\/]/.test(f))]]]);
  for (const e of fs.readdirSync(path.join(SERVEUR, 'src', 'modules'), { withFileTypes: true })) {
    if (e.isDirectory()) sources.set(e.name, lister(path.join(SERVEUR, 'src', 'modules', e.name)));
  }
  for (const [mod, fichiers] of sources) {
    const c = new Set();
    const q = new Set();
    for (const f of fichiers) {
      if (!f.endsWith('.js') || f.endsWith('.test.js')) continue;
      const texte = fs.readFileSync(f, 'utf8');
      if (/req\.body|\bbody\b/.test(texte)) for (const n of relever(texte, CORPS)) c.add(n);
      if (/req\.query/.test(texte)) for (const n of relever(texte, REQUETE)) q.add(n);
    }
    corps.set(mod, [...c].filter((n) => !IGNORES.has(n)).sort());
    requete.set(mod, [...q].filter((n) => !IGNORES.has(n)).sort());
  }
  return { corps, requete };
}
