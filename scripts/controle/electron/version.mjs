// Version d'Electron (overlay) : encore suivie, ou plus de correctifs de sécurité ? Lu sans réseau, dans le calendrier
// officiel recopié ici (releases.electronjs.org/schedule, relevé le 9 nov. 2026 ; † : dates prévues). Electron suit les
// trois dernières versions majeures : une version sort de la liste quand la troisième suivante paraît. Au-delà du
// calendrier recopié, les dates sont estimées au rythme d'Electron (une version majeure toutes les 8 semaines).
//
// Une version hors suivi fait échouer le contrôle, sauf si elle est déclarée « en attente » ci-dessous (mise à jour déjà
// décidée, à faire dans l'app principale par npm install) : le contrôle passe alors avec un avertissement, à chaque fois.
// Une attente qui ne correspond plus à la version installée fait échouer : elle doit être retirée après la mise à jour.

import fs from 'node:fs';
import path from 'node:path';

/** [majeure, sortie, fin du suivi] (AAAA-MM-JJ). */
export const CALENDRIER = Object.freeze([
  [30, '2024-04-15', '2024-10-14'],
  [31, '2024-06-10', '2025-01-14'],
  [32, '2024-08-19', '2025-03-03'],
  [33, '2024-10-14', '2025-04-28'],
  [34, '2025-01-14', '2025-06-23'],
  [35, '2025-03-03', '2025-09-02'],
  [36, '2025-04-28', '2025-10-27'],
  [37, '2025-06-23', '2026-01-15'],
  [38, '2025-09-02', '2026-03-10'],
  [39, '2025-10-27', '2026-05-05'],
  [40, '2026-01-15', '2026-07-01'],
  [41, '2026-03-10', '2026-08-24'],
  [42, '2026-05-05', '2026-10-20'],
  [43, '2026-06-29', '2027-01-05'], // †
  [44, '2026-08-24', '2027-03-02'], // †
  [45, '2026-10-20', '2027-04-27'], // †
  [46, '2027-01-05', '2027-06-22'], // † sortie et fin prévues
  [47, '2027-03-02', '2027-08-17'], // † sortie et fin prévues
]);
export const CALENDRIER_RELEVE = '2026-11-09';
const CADENCE_JOURS = 56;
const JOUR = 86_400_000;

/**
 * Mises à jour d'Electron déjà décidées, pas encore faites : la version installée est hors suivi, le contrôle le dit à
 * chaque fois sans échouer. node_modules d'une worktree est un lien vers l'app du joueur : la mise à jour se fait par
 * npm install dans l'app principale (overlay/package.json « electron », allowScripts du package.json racine), jamais
 * depuis le banc.
 */
export const ATTENTES = Object.freeze([]); // Electron 45.2.3 installé le 9 nov. 2026 (étape M2) : plus rien en attente

const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const jour = (s) => Date.parse(`${s}T00:00:00Z`);

/** Sortie et fin du suivi d'une version majeure : { sortie, fin, estimee } (estimee : hors du calendrier recopié). */
export function suiviDe(majeure) {
  const ligne = CALENDRIER.find(([m]) => m === majeure);
  if (ligne) return { sortie: ligne[1], fin: ligne[2], estimee: false };
  const [premiere] = CALENDRIER[0];
  if (majeure < premiere) {
    // Plus ancienne que le calendrier recopié : finie à la sortie de la troisième suivante (au plus tard la première)
    const suivante = CALENDRIER.find(([m]) => m === majeure + 3);
    return { sortie: null, fin: suivante ? suivante[1] : CALENDRIER[0][1], estimee: !suivante };
  }
  const [derniere, sortieDerniere] = CALENDRIER.at(-1);
  const sortie = (m) => jour(sortieDerniere) + (m - derniere) * CADENCE_JOURS * JOUR;
  return { sortie: iso(sortie(majeure)), fin: iso(sortie(majeure + 3)), estimee: true };
}

/** Version x.y.z (sans préfixe) : { majeure, mineure, correctif }, ou null. */
export function lireVersion(texte) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(String(texte ?? '').trim());
  return m ? { majeure: Number(m[1]), mineure: Number(m[2]), correctif: Number(m[3]) } : null;
}

const comparer = (a, b) => a.majeure - b.majeure || a.mineure - b.mineure || a.correctif - b.correctif;

/** La version installée respecte-t-elle la plage d'overlay/package.json (^x.y.z, ~x.y.z ou x.y.z) ? */
export function dansLaPlage(version, plage) {
  const v = lireVersion(version);
  const m = /^([~^]?)(\d+\.\d+\.\d+)$/.exec(String(plage ?? '').trim());
  if (!v || !m) return false;
  const base = lireVersion(m[2]);
  if (comparer(v, base) < 0) return false;
  if (m[1] === '^') return v.majeure === base.majeure;
  if (m[1] === '~') return v.majeure === base.majeure && v.mineure === base.mineure;
  return comparer(v, base) === 0;
}

/**
 * Verdict sur Electron : { niveau: 'ok' | 'avertissement' | 'echec', message, majeure, fin, estimee }.
 * @param {object} o
 * @param {string} o.installee  version de node_modules/electron
 * @param {string} o.plage      overlay/package.json, devDependencies.electron
 * @param {object} o.autorises  allowScripts du package.json racine
 * @param {string} o.aujourdhui AAAA-MM-JJ
 * @param {Array} [o.attentes]
 */
export function verdictElectron({ installee, plage, autorises, aujourdhui, attentes = ATTENTES }) {
  const v = lireVersion(installee);
  if (!v) return { niveau: 'echec', message: `Electron : version installée illisible (« ${installee} »). Lance npm install dans l’app principale.` };
  const incoherences = [];
  if (!dansLaPlage(installee, plage)) incoherences.push(`overlay/package.json demande « ${plage} », installée ${installee}`);
  const cles = Object.keys(autorises || {}).filter((k) => k.startsWith('electron@'));
  if (autorises?.[`electron@${installee}`] !== true || cles.length !== 1) incoherences.push(`allowScripts du package.json racine : « electron@${installee} » attendu seul (trouvé : ${cles.join(', ') || 'aucun'})`);
  const { fin, estimee } = suiviDe(v.majeure);
  const base = { majeure: v.majeure, fin, estimee };
  if (incoherences.length) return { ...base, niveau: 'echec', message: `Electron ${installee} : versions incohérentes (${incoherences.join(' ; ')}).` };
  const attente = attentes.find((a) => a.version === installee);
  const perimees = attentes.filter((a) => a.version !== installee);
  if (perimees.length) {
    return { ...base, niveau: 'echec', message: `Electron : attente périmée pour ${perimees.map((a) => a.version).join(', ')} (installée ${installee}) : retire-la de ATTENTES (scripts/controle/electron/version.mjs).` };
  }
  const fini = jour(aujourdhui) >= jour(fin);
  const quand = `${estimee ? 'estimée au ' : ''}${fin}`;
  if (!fini) {
    if (attente) return { ...base, niveau: 'echec', message: `Electron ${installee} est encore suivi (fin ${quand}) : retire son attente de ATTENTES (scripts/controle/electron/version.mjs).` };
    return { ...base, niveau: 'ok', message: `Electron ${installee} suivi jusqu’au ${quand}` };
  }
  const depuis = Math.floor((jour(aujourdhui) - jour(fin)) / JOUR);
  const hors = `Electron ${installee} n’a plus de correctifs de sécurité depuis le ${quand} (${depuis} jours)`;
  if (attente) return { ...base, niveau: 'avertissement', message: `${hors} : mise à jour en attente, ${attente.raison}` };
  return { ...base, niveau: 'echec', message: `${hors}. Passe à une version suivie (npm install dans l’app principale, overlay/package.json et allowScripts), ou déclare la mise à jour en attente dans scripts/controle/electron/version.mjs.` };
}

/** Versions lues sur le disque : { installee, plage, autorises }. */
export function lireVersions(racine) {
  const json = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
  const paquet = path.join(racine, 'node_modules', 'electron', 'package.json');
  if (!fs.existsSync(paquet)) throw new Error('Electron absent (node_modules/electron) : lance npm install dans l’app principale.');
  return {
    installee: json(paquet).version,
    plage: json(path.join(racine, 'overlay', 'package.json')).devDependencies?.electron,
    autorises: json(path.join(racine, 'package.json')).allowScripts || {},
  };
}
