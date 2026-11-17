// Contrôle de la base de données (étape 85-base) : la VRAIE base du joueur, mais seulement sa copie.
//
//   1. copie cohérente de la base de l'app (celle de l'app de bureau, sinon server/data/elite.db : baseReelle ; et ses
//      fichiers -journal / -wal s'ils existent) dans un
//      dossier temporaire : lue octet pour octet (jamais ouverte par SQLite, jamais écrite), recopiée si elle a bougé
//      pendant la copie (l'app tourne peut-être et écrit dedans), puis vérifiée (PRAGMA quick_check) sur la copie ;
//   2. schéma du projet appliqué à la copie (prisma db push, sans --accept-data-loss : un changement qui perdrait des
//      données échoue) ; chaque table garde exactement ses lignes, une table nouvelle arrive vide ;
//   3. serveur isolé démarré sur cette copie (sonde chargée, sans journaux), toutes les routes de lecture interrogées :
//      aucune erreur serveur, des réponses lisibles ; puis les lignes de chaque table comptées de nouveau : identiques.
//
// Le fichier -shm n'est pas copié : c'est un index de mémoire partagée que SQLite reconstruit à partir du -wal ; copié
// pendant que l'app écrit, il pourrait ne pas correspondre au -wal copié un instant plus tôt.
//
// Sans base réelle sur ce PC : étape sautée, avec un avertissement (le contrôle n'est alors pas vert).
//   CONTROLE_BASE_REELLE : chemin d'une autre base à contrôler (toujours copiée, jamais ouverte).

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { appliquerSchema, compterTables, verifierBase } from '../banc/base.mjs';
import { RACINE } from '../banc/chemins.mjs';
import { demarrerServeur, nettoyerBanc } from '../banc/serveur.mjs';
import { envoyer } from '../attaques/http.mjs';
import { routesDuServeur } from '../attaques/routes.mjs';

const ESSAIS = 6;
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Ce que la sonde relève, mais qui est attendu quand on lit toutes les routes : le Moniteur PC (module systeme) lit la
 * carte graphique et la mémoire du jeu (nvidia-smi, tasklist : lecture seule, sans écriture ni réseau), et l'IA de bord
 * regarde si ses outils de voix sont installés (dossiers whisper-cpp et sherpa-onnx de %LOCALAPPDATA%\Programs, en
 * lecture seule). Rien d'autre n'est toléré : tout autre programme, accès ou connexion reste une erreur.
 */
const PROGRAMMES_ATTENDUS = new Set(['nvidia-smi', 'tasklist']);
const DOSSIERS_VOIX = /[\\/]AppData[\\/]Local[\\/]Programs[\\/](whisper-cpp|sherpa-onnx)([\\/]|$)/i;
export function lectureAttendue(genre, x) {
  if (genre === 'programmes') return PROGRAMMES_ATTENDUS.has(String(x?.cible ?? '').replace(/\.exe$/i, '').toLowerCase());
  if (genre === 'disque') return /^(existsSync|readdirSync|statSync)$/.test(String(x?.op)) && DOSSIERS_VOIX.test(String(x?.chemin ?? x?.cible ?? ''));
  return false;
}

// Dossier des données de l'app de bureau, décidé au même endroit qu'elle (CommonJS)
const { dossierDonnees } = createRequire(import.meta.url)('../../../desktop/donnees.js');

/**
 * Base du joueur : CONTROLE_BASE_REELLE ; sinon celle de l'app de bureau (dossier des données de desktop/donnees.js,
 * %APPDATA%\Elite Compagnon\donnees, celle qui sert vraiment) ; sinon, sans app de bureau sur ce PC, celle de npm run dev
 * (server/data de la worktree principale du dépôt git). Avant, server/data passait toujours : le contrôle passait au vert
 * sur une base qui ne servait plus depuis le passage à l'app de bureau.
 */
export function baseReelle(env = process.env, { existe = fs.existsSync } = {}) {
  if (env.CONTROLE_BASE_REELLE) return path.resolve(env.CONTROLE_BASE_REELLE);
  try {
    const bureau = path.join(dossierDonnees(env), 'elite.db');
    if (existe(bureau)) return bureau;
  } catch {
    // sans APPDATA : pas d'app de bureau
  }
  return baseDev();
}

/** Base de npm run dev : server/data de l'app principale (la worktree principale du dépôt git). */
function baseDev() {
  let app = RACINE;
  try {
    const commun = execFileSync('git', ['-C', RACINE, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8', windowsHide: true }).trim();
    if (commun) app = path.dirname(path.resolve(commun));
  } catch {
    // sans git : la base de ce dossier
  }
  return path.join(app, 'server', 'data', 'elite.db');
}

const etat = (fichier) => {
  const s = fs.statSync(fichier, { throwIfNoEntry: false });
  return s ? `${s.size}:${s.mtimeMs}` : 'absent';
};

/**
 * Copie cohérente de `source` (et de ses -journal / -wal) dans `dossier` : rend { copie, essais, compagnons }.
 * La source n'est que LUE (readFileSync partage le fichier avec l'app qui l'a ouvert) ; si elle change pendant la copie,
 * ou si la copie ne passe pas quick_check, on recommence.
 */
export async function copierBaseCoherente(source, dossier) {
  fs.mkdirSync(dossier, { recursive: true });
  const copie = path.join(dossier, 'elite.db');
  let dernier = 'aucun essai';
  for (let essai = 1; essai <= ESSAIS; essai += 1) {
    const suffixes = ['', '-journal', '-wal'];
    const avant = suffixes.map((s) => etat(source + s)).join('|');
    for (const s of ['', '-journal', '-wal', '-shm']) fs.rmSync(copie + s, { force: true });
    const copies = [];
    for (const s of suffixes) {
      if (!fs.existsSync(source + s)) continue;
      fs.writeFileSync(copie + s, fs.readFileSync(source + s));
      if (s) copies.push(s);
    }
    const apres = suffixes.map((s) => etat(source + s)).join('|');
    if (avant !== apres) {
      dernier = 'la base a changé pendant la copie';
      await attendre(400);
      continue;
    }
    const verif = verifierBase(copie); // sur la COPIE : un journal copié y est rejoué, comme SQLite le ferait
    if (verif === 'ok') return { copie, essais: essai, compagnons: copies };
    dernier = `quick_check : ${verif}`;
    await attendre(400);
  }
  throw new Error(`copie cohérente impossible après ${ESSAIS} essais (${dernier})`);
}

/** Écarts entre deux comptes de tables : lignes changées, tables disparues ; les tables nouvelles sont rendues à part. */
export function comparerComptes(avant, apres) {
  const ecarts = [];
  for (const [t, n] of Object.entries(avant)) {
    if (!Object.hasOwn(apres, t)) ecarts.push(`table ${t} disparue (${n} ligne(s))`);
    else if (apres[t] !== n) ecarts.push(`table ${t} : ${n} → ${apres[t]} ligne(s)`);
  }
  const nouvelles = Object.keys(apres).filter((t) => !Object.hasOwn(avant, t));
  return { ecarts, nouvelles };
}

/** Chemin et date de la base contrôlée, pour le rapport : « C:\…\elite.db, modifiée le 15/11/2026 à 14:02 ». */
export function baseControlee(source, { stat = fs.statSync } = {}) {
  const s = stat(source, { throwIfNoEntry: false });
  if (!s) return source;
  const d = s.mtime;
  const deux = (n) => String(n).padStart(2, '0');
  return `${source}, modifiée le ${deux(d.getDate())}/${deux(d.getMonth() + 1)}/${d.getFullYear()} à ${deux(d.getHours())}:${deux(d.getMinutes())}`;
}

export async function controlerBase(ctx) {
  const source = baseReelle();
  if (!fs.existsSync(source)) {
    const raison = `aucune base réelle à ${source} (lance l'app une fois, ou règle CONTROLE_BASE_REELLE) : schéma et lectures non vérifiés sur de vraies données`;
    ctx.dire(`⚠ ${raison}`);
    return { saute: raison };
  }
  const controlee = baseControlee(source);
  ctx.dire(`Base contrôlée : ${controlee}`);
  const travail = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-controle-'));
  const lignes = [];
  const journal = [`Base contrôlée : ${controlee}`];
  const problemes = [];
  let srv = null;
  try {
    // 1. Copie cohérente, jamais l'original
    const { copie, essais, compagnons } = await copierBaseCoherente(source, path.join(travail, 'copie'));
    journal.push(`Copie de ${source} en ${essais} essai(s)${compagnons.length ? `, avec ${compagnons.join(' et ')}` : ''}`);
    const avant = compterTables(copie);
    const lignesAvant = Object.values(avant).reduce((a, b) => a + b, 0);
    journal.push(`Avant : ${Object.keys(avant).length} tables, ${lignesAvant} lignes`, ...Object.entries(avant).map(([t, n]) => `  ${t} : ${n}`));

    // 2. Schéma du projet appliqué à la copie
    let sortiePrisma;
    try {
      sortiePrisma = appliquerSchema(copie, path.join(travail, 'prisma'));
    } catch (err) {
      throw new ctx.EchecEtape(`Base : le schéma du projet ne s'applique pas à ta base (copie) : ${err.message.split('\n')[0]}`, { details: err.message });
    }
    journal.push('Prisma :', ...sortiePrisma.split(/\r?\n/).map((l) => `  ${l}`));
    if (verifierBase(copie) !== 'ok') problemes.push('copie abîmée après le schéma (quick_check)');
    const apresSchema = compterTables(copie);
    const schema = comparerComptes(avant, apresSchema);
    problemes.push(...schema.ecarts.map((e) => `schéma appliqué : ${e}`));
    // Table de suivi des migrations (Prisma) : une ligne par migration appliquée, pas une donnée du joueur
    for (const t of schema.nouvelles) if (t !== '_prisma_migrations' && apresSchema[t] !== 0) problemes.push(`table nouvelle ${t} : ${apresSchema[t]} ligne(s) au lieu de 0`);

    // 3. Serveur isolé sur la copie : toutes les lectures
    srv = await demarrerServeur({ base: copie, sonde: true, sortie: (l) => lignes.push(l) });
    const { routes, illisibles } = await routesDuServeur(srv);
    if (illisibles.length) problemes.push(`routes que le banc ne sait pas lire : ${illisibles.join(', ')}`);
    const lectures = routes.filter((r) => r.methode === 'GET' && !r.params.length && !r.chemin.endsWith('/stream'));
    const mauvaises = [];
    const listes = new Map(); // chemin d'une liste → identifiants de ses lignes (pour lire aussi le détail de chacune)
    const lire = async (chemin) => {
      let rep;
      try {
        rep = await envoyer({ base: srv.url, methode: 'GET', chemin, delaiMs: 60_000 });
      } catch (err) {
        mauvaises.push(`${chemin} : pas de réponse (${err.message})`);
        return null;
      }
      const exterieur = [502, 503, 504].includes(rep.statut) && typeof rep.json?.error === 'string' && rep.json.error !== 'Erreur interne du serveur.';
      if (rep.statut >= 500 && !exterieur) mauvaises.push(`${chemin} : erreur ${rep.statut} ${String(rep.json?.error ?? '').slice(0, 120)}`);
      else if (/json/.test(rep.entetes['content-type'] || '') && rep.json === undefined) mauvaises.push(`${chemin} : JSON illisible`);
      journal.push(`  GET ${chemin} → ${rep.statut}`);
      return rep;
    };
    for (const r of lectures) {
      const rep = await lire(r.chemin);
      const ids = Array.isArray(rep?.json) ? rep.json.map((x) => x?.id).filter((id) => Number.isInteger(id) || (typeof id === 'string' && /^[\w-]{1,64}$/.test(id))) : [];
      if (ids.length) listes.set(r.chemin, ids);
    }
    // Détail de chaque ligne des listes (une route « liste/:id » ou « liste/:id/… ») : les vraies données, lues une à une
    let details = 0;
    for (const r of routes.filter((x) => x.methode === 'GET' && x.params.length === 1)) {
      const m = /^(.*)\/:(\w+)(\/[^:]*)?$/.exec(r.chemin);
      const ids = m && listes.get(m[1]);
      if (!ids) continue;
      for (const id of ids.slice(0, 50)) {
        await lire(`${m[1]}/${encodeURIComponent(id)}${m[3] || ''}`);
        details += 1;
      }
    }
    problemes.push(...mauvaises.map((m) => `lecture ${m}`));
    await srv.calme();
    const apresServeur = compterTables(path.join(srv.dossiers.donnees, 'elite.db'));
    problemes.push(...comparerComptes(apresSchema, apresServeur).ecarts.map((e) => `après le démarrage et les lectures : ${e}`));
    const sonde = await srv.demander('sonde');
    for (const [genre, quoi] of [['reseau', 'connexion sortante'], ['programmes', 'programme lancé'], ['disque', 'accès disque hors du banc'], ['ecoutes', 'écoute hors de ce PC']]) {
      for (const x of sonde[genre].filter((y) => !lectureAttendue(genre, y)).slice(0, 5)) problemes.push(`sonde : ${quoi} : ${x.op} ${x.cible ?? x.chemin}`);
    }
    if (sonde.prototypes.length) problemes.push(`sonde : prototypes modifiés : ${sonde.prototypes.join(', ')}`);
    const piles = lignes.filter((l) => /^\s+at\s/.test(l));
    if (piles.length) problemes.push(`sortie du serveur : ${piles.length} ligne(s) de pile d'erreur`);

    const resume = `${Object.keys(apresSchema).length} tables (${lignesAvant} lignes) de ta base (${controlee}) copiées, schéma appliqué sans perte${schema.nouvelles.length ? ` (${schema.nouvelles.length} table(s) nouvelle(s), vides)` : ''}, ${lectures.length} lectures et ${details} fiches détaillées sans erreur, lignes identiques avant et après`;
    if (problemes.length) {
      throw new ctx.EchecEtape(`Base : ${problemes.length} problème(s) sur la copie de ta base.`, { details: problemes.slice(0, 40).join('\n'), journal: ctx.journal() });
    }
    return resume;
  } finally {
    if (srv) await srv.arreter();
    nettoyerBanc();
    fs.writeFileSync(ctx.journal(), [...journal, '', ...lignes.map((l) => `[serveur] ${l}`), ''].join('\n'));
    fs.rmSync(travail, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}
