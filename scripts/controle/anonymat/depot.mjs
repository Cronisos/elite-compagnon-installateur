// Données réelles du joueur dans le dépôt : tous les fichiers suivis par git (étape 60-anonymat de npm run controle) et
// toutes les versions de son historique (npm run controle:historique). Les secrets viennent des vrais journaux
// (secrets.mjs), lus en lecture seule et gardés en mémoire ; les rapports ne donnent jamais une valeur, seulement le
// fichier, la ligne et la sorte du secret (nom de porteur, escadron, ami…).
//
// Règles, pour chaque fichier :
//   - FID : interdit partout, même au milieu d'un mot ;
//   - fixture (séances, attendus, options et pages du banc ; tout fichier sous fixtures/ ou __golden__/) : nom du
//     commandant interdit aussi, même au milieu d'un mot ;
//   - partout : tout autre secret, en mot entier (escadron et son numéro, porteurs, amis et coéquipiers, autres
//     joueurs, noms et identifiants de vaisseaux) ;
//   - hors fixtures, le nom du commandant n'est toléré que s'il est aussi le nom d'auteur des commits du dépôt : il est
//     déjà public dans chaque commit (et dans l'adresse du Worker de l'escadron). Un autre commandant ne l'est jamais ;
//   - les hôtes de la liste blanche réseau (adresse du Worker) sont masqués avant la recherche ; les .gz sont décompressés.
// Les noms de tenues ne sont pas cherchés : ce sont souvent des mots courants (« Exobiologie »), remplacés dans leur
// champ seulement par l'anonymisation des séances.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { leaks } from './anonymiser.mjs';
import { NETWORK_HOSTS } from '../../../server/src/core/net.js';

/** Fixture : séance, attendu, options ou page du banc, ou fichier sous un dossier fixtures/ ou __golden__/. */
export const estFixture = (rel) => /^scripts\/controle\/(seances|attendu|options|pages)\//.test(rel) || /(^|\/)(fixtures|__golden__)\//.test(rel);

/**
 * Règles tirées des secrets gelés (Secrets.finish()) : `auteurs`, noms d'auteur et de committeur des commits (voir
 * auteursDuDepot). Rend { fids, commandants, toleres, mots, sortes }.
 */
export function reglesDepot(gele, { auteurs = [] } = {}) {
  const deAuteur = new Set(auteurs.map((a) => String(a).trim().toLowerCase()).filter(Boolean));
  const commandants = gele.commanders ?? [];
  return {
    fids: gele.strict.filter((s) => !commandants.includes(s)),
    commandants,
    toleres: commandants.filter((c) => deAuteur.has(c)),
    mots: [...new Set([...gele.forbidden, ...(gele.squadronIds ?? [])])],
    sortes: gele.kinds ?? new Map(),
  };
}

/** Texte d'un fichier prêt à fouiller : .gz décompressé, hôtes de la liste blanche réseau masqués. */
export function texteAFouiller(buf, nom) {
  let octets = buf;
  if (nom.endsWith('.gz')) {
    try { octets = zlib.gunzipSync(buf); } catch { /* pas du gzip : lu tel quel */ }
  }
  let texte = octets.toString('utf8');
  for (const host of NETWORK_HOSTS.keys()) texte = texte.split(host).join('<hôte permis>');
  return texte;
}

/** Sortes de secrets sans doublon, dans l'ordre alphabétique (rapports stables). */
const trier = (liste) => [...new Set(liste)].sort((a, b) => a.localeCompare(b, 'fr'));

/**
 * Secrets d'un texte : [{ ligne, sortes }], jamais les valeurs. `fixture` : nom du commandant interdit, même au milieu
 * d'un mot. Un secret coupé entre deux lignes est signalé sans numéro de ligne.
 */
export function fouiller(texte, regles, { fixture = false } = {}) {
  const { fids, commandants, toleres, mots, sortes } = regles;
  const stricts = fixture ? [...fids, ...commandants] : fids;
  const enMots = fixture ? mots : mots.filter((m) => !toleres.includes(m));
  const trouve = (t) => [...leaks(t, stricts), ...leaks(t, enMots, { words: true })];
  if (!trouve(texte).length) return []; // la plupart des fichiers n'ont rien : un seul passage
  const out = [];
  texte.split('\n').forEach((l, i) => {
    const s = trouve(l);
    if (s.length) out.push({ ligne: i + 1, sortes: trier(s.map((v) => sortes.get(v) ?? 'secret')) });
  });
  return out.length ? out : [{ ligne: null, sortes: trier(trouve(texte).map((v) => sortes.get(v) ?? 'secret')) }];
}

const git = (racine, args, input) => execFileSync('git', ['-C', racine, ...args], {
  input, maxBuffer: 1024 * 1024 * 1024, stdio: [input == null ? 'ignore' : 'pipe', 'pipe', 'pipe'],
});

/** Fichiers suivis par git, et nouveaux non ignorés (pas server/data, node_modules…) ; sans git, parcours du dossier. */
export function fichiersDuDepot(racine) {
  try {
    const sortie = git(racine, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']).toString('utf8');
    // Fichiers seulement : un lien vers un dossier (node_modules d'une worktree…) ne se lit pas comme un fichier
    return [...new Set(sortie.split('\0').filter(Boolean))].map((f) => path.join(racine, f)).filter((f) => fs.statSync(f, { throwIfNoEntry: false })?.isFile());
  } catch {
    const exclus = new Set(['node_modules', '.git', 'dist', 'data', '.claude']);
    const parcourir = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
      if (e.isSymbolicLink()) return []; // lien (node_modules d'une worktree, jonction) : hors du dépôt
      if (e.isDirectory()) return exclus.has(e.name) ? [] : parcourir(path.join(d, e.name));
      return e.isFile() ? [path.join(d, e.name)] : [];
    });
    return parcourir(racine);
  }
}

/** Noms d'auteur et de committeur de tous les commits, et user.name de git (minuscules). Sans git : aucun. */
export function auteursDuDepot(racine) {
  const noms = new Set();
  const lire = (args) => {
    try { return git(racine, args).toString('utf8'); } catch { return ''; }
  };
  for (const l of lire(['log', '--all', '--format=%an%n%cn']).split('\n')) if (l.trim()) noms.add(l.trim().toLowerCase());
  const moi = lire(['config', 'user.name']).trim();
  if (moi) noms.add(moi.toLowerCase());
  return [...noms];
}

/**
 * Fouille des fichiers du dépôt (et de `autres`, chemins absolus, par exemple les fixtures hors de git) :
 * { fichiers, fixtures, trouves: [{ fichier, ligne, sortes }] }.
 */
export function fouillerDepot(racine, regles, { autres = [] } = {}) {
  const tous = [...new Set([...fichiersDuDepot(racine), ...autres])];
  const trouves = [];
  let fixtures = 0;
  for (const f of tous) {
    const rel = path.relative(racine, f).replace(/\\/g, '/');
    const fixture = estFixture(rel);
    if (fixture) fixtures += 1;
    for (const t of fouiller(texteAFouiller(fs.readFileSync(f), rel), regles, { fixture })) trouves.push({ fichier: rel, ...t });
  }
  return { fichiers: tous.length, fixtures, trouves };
}

/** Trouvailles regroupées par fichier : « chemin:7, 9 : nom de porteur, indicatif de porteur ». */
export function parFichier(trouves) {
  const groupes = new Map();
  for (const t of trouves) {
    const g = groupes.get(t.fichier) ?? { lignes: [], sortes: new Set() };
    if (t.ligne) g.lignes.push(t.ligne);
    for (const s of t.sortes) g.sortes.add(s);
    groupes.set(t.fichier, g);
  }
  return [...groupes].map(([fichier, g]) => `${fichier}${g.lignes.length ? `:${g.lignes.slice(0, 12).join(', ')}${g.lignes.length > 12 ? '…' : ''}` : ''} : ${trier(g.sortes).join(', ')}`);
}

/** Chemin donné aux objets qu'aucune référence n'atteint plus (git fsck --unreachable). */
export const INATTEIGNABLE = '(objet inatteignable : stash abandonné ou commit réécrit)';

/**
 * Fouille de tout l'historique git : chaque version de chaque fichier atteignable depuis une branche, une étiquette,
 * une autre référence ou le reflog (git rev-list --all --reflog --objects), plus les objets qu'aucune référence n'atteint
 * plus mais que .git garde encore (git fsck --unreachable --no-reflogs : stash abandonné, commit réécrit, avant le
 * ménage de git gc), et chaque message de commit, inatteignables compris. Rend
 * { versions, trouves: [{ chemin, blob, lignes, sortes, commits }], messages: [{ commit, sortes }] }.
 */
export function fouillerHistorique(racine, regles) {
  const lire = (sortie) => sortie.toString('utf8').split('\n')
    .map((l) => {
      const i = l.indexOf(' ');
      return i > 0 ? { sha: l.slice(0, i), chemin: l.slice(i + 1) } : null;
    })
    .filter((o) => o?.chemin);
  const objets = lire(git(racine, ['rev-list', '--all', '--reflog', '--objects']));
  // Inatteignables : blobs isolés, et ce qu'atteignent les commits isolés (avec leurs chemins)
  const isoles = { blob: [], commit: [] };
  for (const l of git(racine, ['fsck', '--unreachable', '--no-reflogs', '--no-progress']).toString('utf8').split('\n')) {
    const m = /^unreachable (blob|commit) ([0-9a-f]{40,64})$/.exec(l.trim());
    if (m) isoles[m[1]].push(m[2]);
  }
  const vus = new Set(objets.map((o) => o.sha));
  const ajouter = (o) => {
    if (vus.has(o.sha)) return;
    vus.add(o.sha);
    objets.push(o);
  };
  if (isoles.commit.length) {
    for (const o of lire(git(racine, ['rev-list', '--objects', '--stdin'], `${isoles.commit.join('\n')}\n`))) ajouter({ ...o, chemin: `${o.chemin} ${INATTEIGNABLE}` });
  }
  for (const sha of isoles.blob) ajouter({ sha, chemin: INATTEIGNABLE });
  const types = git(racine, ['cat-file', '--batch-check=%(objectname) %(objecttype)'], `${objets.map((o) => o.sha).join('\n')}\n`).toString('utf8').split('\n');
  const genre = new Map(types.map((l) => l.split(' ')));
  const blobs = objets.filter((o) => genre.get(o.sha) === 'blob');
  const trouves = [];
  if (blobs.length) {
    const sortie = git(racine, ['cat-file', '--batch'], `${blobs.map((b) => b.sha).join('\n')}\n`);
    let pos = 0;
    for (const b of blobs) {
      const fin = sortie.indexOf(10, pos);
      const [sha, , taille] = sortie.subarray(pos, fin).toString('utf8').split(' ');
      const contenu = sortie.subarray(fin + 1, fin + 1 + Number(taille));
      pos = fin + 1 + Number(taille) + 1;
      if (sha !== b.sha) throw new Error(`Lecture de l'historique désynchronisée (${b.sha.slice(0, 7)})`);
      const t = fouiller(texteAFouiller(contenu, b.chemin), regles, { fixture: estFixture(b.chemin) });
      if (!t.length) continue;
      const commits = git(racine, ['log', '--all', '--reverse', '--format=%h', `--find-object=${sha}`]).toString('utf8').split('\n').filter(Boolean);
      trouves.push({ chemin: b.chemin, blob: sha.slice(0, 7), lignes: t.map((x) => x.ligne).filter(Boolean), sortes: trier(t.flatMap((x) => x.sortes)), commits });
    }
  }
  const messages = [];
  const journaux = [git(racine, ['log', '--all', '--reflog', '--format=%h%x00%B%x1e'])];
  if (isoles.commit.length) journaux.push(git(racine, ['log', '--stdin', '--format=%h%x00%B%x1e'], `${isoles.commit.join('\n')}\n`));
  const dejaLus = new Set();
  for (const bloc of journaux.map((b) => b.toString('utf8')).join('\x1e').split('\x1e')) {
    const [commit, texte] = bloc.replace(/^\s+/, '').split('\0');
    if (!commit || texte == null || dejaLus.has(commit)) continue;
    dejaLus.add(commit);
    const t = fouiller(texte, regles);
    if (t.length) messages.push({ commit, sortes: trier(t.flatMap((x) => x.sortes)) });
  }
  return { versions: blobs.length, trouves, messages };
}
