// npm run controle : vérifie que TOUT marche avant une mise à jour. Exécute les étapes du dossier
// scripts/controle/etapes/, une par fichier, dans l'ordre de leur nom, s'arrête au premier échec avec un message clair,
// puis résume.
//
//   npm run controle                          toutes les étapes
//   npm run controle -- --etape=rejeu         seulement celles dont le nom contient « rejeu » (plusieurs : virgules)
//   npm run controle -- --depuis=60           à partir de la première dont le nom commence par « 60 » ou le contient
//   npm run controle -- --liste               liste des étapes, sans rien lancer
//   CONTROLE_UPDATE=1 npm run controle -- --etape=rejeu   réécrit les résultats attendus du rejeu (après relecture !)
//
// Ajouter une étape : un fichier NN-nom.mjs dans etapes/ (NN : deux chiffres ou plus, qui fixent l'ordre), qui exporte
//   export default { titre: 'Ce que je vérifie', async lancer(ctx) { … ; return 'résumé d’une ligne'; } };
// Un échec : lancer une erreur (de préférence ctx.EchecEtape, avec un message en français). Une étape réussie peut rendre
// { resume, avertissement } : un point à décider qui ne bloque pas (dépendance hors suivi dont la mise à jour est déjà
// prévue…), répété sous l'étape et à la fin du résumé à chaque contrôle. Voir le README, section « Contrôles avant mise à
// jour », et outils.mjs pour les aides (node, suiteNodeTest…).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CLIENT, CONTROLE, ETAPES, RACINE, SERVEUR } from './banc/chemins.mjs';
import * as outils from './outils.mjs';
import { nettoyerAnciens } from './banc/serveur.mjs';

const NOM_ETAPE = /^\d{2,}-[a-z0-9][a-z0-9-]*\.mjs$/;

function options(argv) {
  const o = {};
  for (const a of argv) {
    const m = /^--([a-z]+)(?:=(.*))?$/.exec(a);
    if (!m) throw new outils.EchecEtape(`Option inconnue : « ${a} » (--etape=…, --depuis=…, --liste).`);
    o[m[1]] = m[2] ?? true;
  }
  for (const k of Object.keys(o)) if (!['etape', 'depuis', 'liste'].includes(k)) throw new outils.EchecEtape(`Option inconnue : --${k} (--etape=…, --depuis=…, --liste).`);
  return o;
}

/** Étapes du dossier, dans l'ordre ; un fichier mal nommé ou mal formé arrête tout (une étape ne doit pas disparaître). */
export async function chargerEtapes(dossier = ETAPES) {
  const fichiers = fs.readdirSync(dossier).filter((f) => f.endsWith('.mjs')).sort();
  const etapes = [];
  for (const f of fichiers) {
    if (!NOM_ETAPE.test(f)) throw new outils.EchecEtape(`Étape mal nommée : ${f} (attendu : NN-nom.mjs, minuscules, chiffres et tirets).`);
    const mod = await import(pathToFileURL(path.join(dossier, f)).href);
    const e = mod.default;
    if (!e || typeof e.titre !== 'string' || !e.titre.trim() || typeof e.lancer !== 'function') {
      throw new outils.EchecEtape(`Étape mal formée : ${f} (export default { titre, async lancer(ctx) }).`);
    }
    etapes.push({ fichier: f, nom: f.slice(0, -4), titre: e.titre.trim(), lancer: e.lancer });
  }
  return etapes;
}

const duree = (ms) => (ms < 60_000 ? `${(ms / 1000).toFixed(1).replace('.', ',')} s` : `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`);

export async function controler(argv = process.argv.slice(2), ecrire = (l) => console.log(l), dossier = ETAPES, { journaux: dossierJournaux } = {}) {
  const o = options(argv);
  let etapes = await chargerEtapes(dossier);
  if (o.liste) {
    for (const e of etapes) ecrire(`${e.nom} : ${e.titre}`);
    return 0;
  }
  if (typeof o.etape === 'string') {
    const motifs = o.etape.split(',').map((s) => s.trim()).filter(Boolean);
    etapes = etapes.filter((e) => motifs.some((m) => e.nom.includes(m)));
  }
  if (typeof o.depuis === 'string') {
    const i = etapes.findIndex((e) => e.nom.startsWith(o.depuis) || e.nom.includes(o.depuis));
    if (i < 0) throw new outils.EchecEtape(`--depuis=${o.depuis} : aucune étape ne correspond.`);
    etapes = etapes.slice(i);
  }
  if (!etapes.length) throw new outils.EchecEtape('Aucune étape à lancer (vérifie --etape / --depuis, ou le dossier scripts/controle/etapes).');

  if (!dossierJournaux) nettoyerAnciens(); // restes d'un contrôle interrompu (plus de deux jours)
  const horodatage = new Date().toISOString().replace(/[:.]/g, '-');
  const journaux = dossierJournaux || path.join(os.tmpdir(), `elite-controle-${horodatage}`);
  fs.mkdirSync(journaux, { recursive: true });
  ecrire(`Contrôle avant mise à jour : ${etapes.length} étape(s). Journaux : ${journaux}`);

  const bilan = [];
  let echec = null;
  for (const [i, e] of etapes.entries()) {
    ecrire(`\n▶ [${i + 1}/${etapes.length}] ${e.titre} (${e.fichier})`);
    const debut = Date.now();
    const ctx = {
      ...outils,
      racine: RACINE, serveur: SERVEUR, client: CLIENT, controle: CONTROLE,
      journal: (nom = e.nom) => path.join(journaux, `${nom}.log`),
      dire: (l) => ecrire(`  ${l}`),
      maj: process.env.CONTROLE_UPDATE === '1',
    };
    try {
      const r = await e.lancer(ctx);
      const resume = typeof r === 'string' ? r : r?.resume || '';
      const saute = typeof r === 'object' && r?.saute ? r.saute : null;
      const avertissement = typeof r === 'object' && typeof r?.avertissement === 'string' && r.avertissement.trim() ? r.avertissement.trim() : null;
      bilan.push({ e, etat: saute ? 'sautée' : 'réussie', ms: Date.now() - debut, resume: saute || resume, avertissement });
      ecrire(`${saute ? '⚠ sautée' : '✔ réussie'} en ${duree(Date.now() - debut)}${saute || resume ? ` : ${saute || resume}` : ''}`);
      if (avertissement) ecrire(`  ⚠ AVERTISSEMENT : ${avertissement}`);
    } catch (err) {
      echec = { e, err };
      bilan.push({ e, etat: 'échec', ms: Date.now() - debut, resume: err.message });
      ecrire(`✖ ÉCHEC en ${duree(Date.now() - debut)} : ${err.message}`);
      if (err.details) ecrire(`\n${err.details.split('\n').map((l) => `    ${l}`).join('\n')}`);
      if (err.journal) ecrire(`\n  Journal complet : ${err.journal}`);
      if (!(err instanceof outils.EchecEtape) && err.stack) ecrire(`\n${err.stack}`);
      break;
    }
  }
  for (const e of etapes.slice(bilan.length)) bilan.push({ e, etat: 'non lancée', ms: 0, resume: '' });

  ecrire('\nRésumé :');
  const marque = { réussie: '✔', sautée: '⚠', échec: '✖', 'non lancée': '·' };
  for (const b of bilan) ecrire(`  ${marque[b.etat]} ${b.e.titre} — ${b.etat}${b.ms ? `, ${duree(b.ms)}` : ''}${b.resume && b.etat !== 'échec' ? ` (${b.resume})` : ''}`);
  if (echec) {
    ecrire(`\nContrôle arrêté : « ${echec.e.titre} » a échoué. Ne publie pas de mise à jour avant de l'avoir réparé.`);
    return 1;
  }
  const sautees = bilan.filter((b) => b.etat === 'sautée').length;
  const avertissements = bilan.filter((b) => b.avertissement);
  if (avertissements.length) {
    ecrire(`\n${avertissements.length} avertissement(s), à décider (ils ne bloquent pas) :`);
    for (const b of avertissements) ecrire(`  ⚠ ${b.e.titre} : ${b.avertissement}`);
  }
  ecrire(sautees ? `\nContrôle terminé, mais ${sautees} étape(s) sautée(s) : le contrôle n'est pas complet.` : `\nTout est vert : la mise à jour peut partir${avertissements.length ? ' (lis les avertissements ci-dessus)' : ''}.`);
  return sautees ? 2 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync.native(process.argv[1])).href) {
  try {
    process.exitCode = await controler();
  } catch (err) {
    console.error(err instanceof outils.EchecEtape ? `✖ ${err.message}` : err);
    process.exitCode = 1;
  }
}
