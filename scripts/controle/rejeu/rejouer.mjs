// Rejeu des séances de référence : pour chaque séance et chaque mode (historique, direct), un serveur isolé lit les
// journaux, puis chaque module est interrogé par son API (points.mjs). Les réponses, normalisées (banc/normaliser.mjs),
// sont comparées exactement aux résultats attendus (scripts/controle/attendu/<module>.json).
//
//   CONTROLE_UPDATE=1 : réécrit les fichiers attendus au lieu de comparer. À faire seulement après avoir relu ce qui
//   change (git diff scripts/controle/attendu) : un attendu faux rend le contrôle inutile.
//
// Chaque lancement écrit aussi tout ce qu'il a obtenu dans un dossier temporaire (affiché en cas d'écart), pour
// comparer à la main.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ATTENDU } from '../banc/chemins.mjs';
import { difference, normaliseur } from '../banc/normaliser.mjs';
import { demarrerServeur, listerSeances, nettoyerBanc } from '../banc/serveur.mjs';
import { MODES, MODULES } from './points.mjs';
import { VERIFICATIONS } from './verifications.mjs';
import { SCENARIOS } from './scenarios.mjs';

const json = (v) => `${JSON.stringify(v, null, 2)}\n`;
const court = (v) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s === undefined ? String(v) : s.length > 160 ? `${s.slice(0, 160)}…` : s;
};

/** Une passe sur les points choisis : { module: { clé: réponse normalisée } }. */
async function passe(srv, norm, choisir) {
  const out = {};
  for (const [module, points] of Object.entries(MODULES)) {
    out[module] = {};
    for (const p of points) {
      if (!choisir(p)) continue;
      const [methode, chemin] = p.point.split(' ');
      let r;
      try {
        r = await srv.requete(methode, `${p.base}${chemin === '/' ? '' : chemin}`, methode === 'GET' ? undefined : (p.corps ?? {}));
      } catch (err) {
        r = { statut: 'injoignable', corps: err.message };
      }
      const cle = p.cle || p.point;
      if (Object.hasOwn(out[module], cle)) throw new Error(`points.mjs : « ${cle} » demandé deux fois pour ${module} (donne-lui une cle).`);
      out[module][cle] = norm({ statut: r.statut, corps: r.corps });
    }
  }
  return out;
}

export const STABLE_MS = 400; // écart entre deux passes identiques
export const STABLE_MAX_MS = 60_000;

/**
 * Interroge tous les points d'un serveur ; renvoie { module: { clé: réponse normalisée } }.
 * Les lectures sont répétées jusqu'à deux passes identiques de suite : un module peut encore travailler après la
 * lecture des journaux (écritures en base mises en file). Sans stabilité au bout d'une minute : erreur, c'est un
 * module qui ne s'arrête jamais de changer. Les scénarios (écritures, puis ce qu'on relit après) passent une seule
 * fois, à la fin, dans l'ordre.
 */
async function interroger(srv, norm, { statiques }) {
  for (const [module, points] of Object.entries(MODULES)) {
    for (const p of points) {
      if (!p.point.startsWith('GET ') && !p.scenario && !p.sansEffet) throw new Error(`points.mjs : ${module} « ${p.point} » écrit sans être un scénario (scenario: true, ou sansEffet: true s'il ne fait que calculer).`);
    }
  }
  const lecture = (p) => !p.scenario && (!p.statique || statiques);
  const limite = Date.now() + STABLE_MAX_MS;
  let avant = await passe(srv, norm, lecture);
  for (;;) {
    await new Promise((r) => setTimeout(r, STABLE_MS));
    const apres = await passe(srv, norm, lecture);
    if (JSON.stringify(apres) === JSON.stringify(avant)) break;
    if (Date.now() > limite) {
      const change = Object.keys(apres).filter((m) => JSON.stringify(apres[m]) !== JSON.stringify(avant[m]));
      throw new Error(`réponses encore changeantes après ${STABLE_MAX_MS / 1000} s (${change.join(', ')}) : un module ne se stabilise pas.`);
    }
    avant = apres;
  }
  const scenarios = await passe(srv, norm, (p) => p.scenario && (!p.statique || statiques));
  for (const [module, r] of Object.entries(scenarios)) Object.assign(avant[module], r);
  return avant;
}

/** Lignes d'erreur du serveur (pile, erreur interne) : un rejeu propre n'en a pas. */
function erreursServeur(lignes) {
  return lignes.filter((l) => /\bat .+:\d+:\d+\)?$|Error:|TypeError|ReferenceError|Erreur interne/.test(l));
}

/**
 * Rejoue tout. Options : { seances (ids), modes, maj (réécrire les attendus), sortie (journal du banc) }.
 * Renvoie { ecarts, problemes, obtenus (dossier gardé en cas d'écart, sinon null), seances, modes, requetes, verifications }.
 */
export async function rejouer({ seances = listerSeances(), modes = MODES, maj = false, journal = () => {} } = {}) {
  if (!seances.length) throw new Error('Aucune séance de référence dans scripts/controle/seances.');
  const obtenu = {}; // module → séance → mode → point → réponse
  for (const module of Object.keys(MODULES)) obtenu[module] = {};
  const problemes = [];
  let requetes = 0;
  try {
    for (const [i, id] of seances.entries()) {
      for (const mode of modes) {
        const debut = Date.now();
        const srv = await demarrerServeur({ seance: id, mode });
        let reponses;
        try {
          // Tous les modules du serveur doivent avoir leurs points de rejeu
          const connus = (await srv.get('/api/modules')).map((x) => x.id);
          const sansPoints = connus.filter((x) => !Object.hasOwn(MODULES, x));
          if (sansPoints.length) problemes.push(`module(s) sans point de rejeu dans scripts/controle/rejeu/points.mjs : ${sansPoints.join(', ')}`);
          const norm = normaliseur({ racine: srv.dossiers.racine, port: srv.port, debut, fin: Date.now() + 120_000 });
          if (Math.abs(Date.parse(srv.maintenant) - Date.now()) < 10 * 60_000) {
            throw new Error(`Séance ${id} : l'heure figée (${srv.maintenant}) est trop proche de l'heure réelle pour être distinguée.`);
          }
          reponses = await interroger(srv, norm, { statiques: i === 0 && mode === modes[0] });
          requetes += Object.values(reponses).reduce((n, r) => n + Object.keys(r).length, 0);
          const erreurs = erreursServeur(srv.sortie());
          if (erreurs.length) problemes.push(`${id} (${mode}) : le serveur a écrit ${erreurs.length} ligne(s) d'erreur, dont « ${court(erreurs[0])} »`);
        } finally {
          await srv.arreter();
        }
        for (const [module, r] of Object.entries(reponses)) {
          obtenu[module][id] ??= {};
          obtenu[module][id][mode] = r;
        }
        journal(`${id} (${mode}) : ${Math.round((Date.now() - debut) / 100) / 10} s`);
      }
    }
    // Scénarios (préparation par l'API, séance écrite en direct, vérifications en dur) : seulement quand tout tourne
    if (seances.join() === listerSeances().join() && modes.join() === MODES.join()) {
      for (const sc of SCENARIOS) {
        const debut = Date.now();
        const srv = await demarrerServeur({ seance: sc.seance, mode: 'direct', avantJournaux: sc.preparer });
        try {
          const raison = await sc.verifier(srv);
          if (raison) problemes.push(`scénario « ${sc.titre} » : ${raison}`);
          const erreurs = erreursServeur(srv.sortie());
          if (erreurs.length) problemes.push(`scénario « ${sc.titre} » : le serveur a écrit ${erreurs.length} ligne(s) d'erreur, dont « ${court(erreurs[0])} »`);
        } catch (err) {
          problemes.push(`scénario « ${sc.titre} » : ${err.message}`);
        } finally {
          await srv.arreter();
        }
        journal(`scénario ${sc.seance} (direct, préparé) : ${Math.round((Date.now() - debut) / 100) / 10} s`);
      }
    }
  } finally {
    nettoyerBanc();
  }

  // Vérifications en dur (valeurs connues d'avance), seulement quand toutes les séances ont tourné
  if (seances.join() === listerSeances().join() && modes.join() === MODES.join()) {
    for (const v of VERIFICATIONS) {
      const raison = v.verifier(obtenu);
      if (raison) problemes.push(`vérification « ${v.titre} » : ${raison}`);
    }
  }

  // Écrit ce qui a été obtenu (pour regarder), puis compare ou met à jour
  const dossierObtenu = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-controle-obtenu-'));
  for (const [module, v] of Object.entries(obtenu)) fs.writeFileSync(path.join(dossierObtenu, `${module}.json`), json(v));

  const ecarts = [];
  const complet = seances.join() === listerSeances().join() && modes.join() === MODES.join();
  if (maj && problemes.length) {
    problemes.push("attendus NON réécrits : corrige d'abord ces problèmes (un attendu ne doit jamais enregistrer une erreur).");
  } else if (maj) {
    if (!complet) throw new Error('CONTROLE_UPDATE=1 réécrit tous les attendus : lance le rejeu de toutes les séances, dans tous les modes.');
    fs.mkdirSync(ATTENDU, { recursive: true });
    for (const [module, v] of Object.entries(obtenu)) fs.writeFileSync(path.join(ATTENDU, `${module}.json`), json(v));
    for (const f of fs.readdirSync(ATTENDU)) {
      if (f.endsWith('.json') && !Object.hasOwn(MODULES, f.slice(0, -5))) fs.rmSync(path.join(ATTENDU, f));
    }
  } else {
    for (const [module, v] of Object.entries(obtenu)) {
      const fichier = path.join(ATTENDU, `${module}.json`);
      if (!fs.existsSync(fichier)) {
        ecarts.push({ module, texte: `pas de résultats attendus (${path.relative(process.cwd(), fichier)}) : relis les résultats obtenus, puis CONTROLE_UPDATE=1` });
        continue;
      }
      const attendu = JSON.parse(fs.readFileSync(fichier, 'utf8'));
      for (const id of seances) {
        for (const mode of modes) {
          const a = attendu[id]?.[mode];
          const o = v[id]?.[mode];
          if (a === undefined) {
            ecarts.push({ module, texte: `${id} (${mode}) : séance absente des attendus` });
            continue;
          }
          for (const point of new Set([...Object.keys(a), ...Object.keys(o || {})])) {
            const d = difference(a[point], o?.[point]);
            if (d) ecarts.push({ module, texte: `${id} (${mode}) ${point} : ${d.chemin} attendu ${court(d.attendu)}, obtenu ${court(d.obtenu)}` });
          }
        }
      }
      if (complet) {
        for (const id of Object.keys(attendu)) if (!seances.includes(id)) ecarts.push({ module, texte: `${id} : séance attendue mais disparue de scripts/controle/seances` });
      }
    }
  }
  // Rien à regarder : le dossier des résultats obtenus est effacé (il n'est gardé qu'en cas d'écart ou de problème)
  const garder = ecarts.length > 0 || problemes.length > 0;
  if (!garder) fs.rmSync(dossierObtenu, { recursive: true, force: true });
  return {
    ecarts, problemes: [...new Set(problemes)], obtenus: garder ? dossierObtenu : null,
    seances: seances.length, modes: modes.length, requetes, verifications: VERIFICATIONS.length, scenarios: SCENARIOS.length,
  };
}
