// Gros dossier de journaux : un joueur de longue date (des centaines de Mo de journaux) peut lancer l'app. Le vrai
// serveur isolé démarre sur 40 copies des séances de référence (environ 150 Mo, 400 journaux) :
//   1. sous un tas de V8 plafonné à 220 Mo (--max-old-space-size) : le démarrage aboutit. Avant, il manquait de mémoire
//      (environ 1,4 Mo gardé par Mo de journaux, pour toujours) ;
//   2. la mémoire GARDÉE une fois prêt (après un ramasse-miettes complet, banc/memoire.mjs) croît d'au plus 0,4 Mo par
//      Mo de journaux par rapport à une seule copie. Avant : environ 1,4 Mo par Mo, sans plafond.
// Journaux copiés dans un dossier temporaire (effacé ensuite) ; réseau coupé, rien hors du banc. Une vingtaine de
// secondes. Détail dans le journal de l'étape (72-memoire.log).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { demarrerServeur, lireSeance, listerSeances } from '../banc/serveur.mjs';

export const COPIES = 40;
export const TAS_MO = 220;
export const PAR_MO_MAX = 0.4;

const MO = 1024 * 1024;
const virgule = (x, n = 1) => x.toFixed(n).replace('.', ',');

/** Journaux des séances de référence, chacun recopié `copies` fois sous un nom de journal distinct (dates décalées). */
export function poserCopies(dossier, copies) {
  const sources = listerSeances().flatMap((id) => lireSeance(id).fichiers);
  if (!sources.length) throw new Error('Aucune séance de référence (scripts/controle/seances).');
  const fichiers = [];
  let octets = 0;
  for (let c = 0; c < copies; c++) {
    for (const [i, f] of sources.entries()) {
      const d = new Date(Date.UTC(2020, 0, 1) + (c * sources.length + i) * 3_600_000).toISOString();
      const nom = `Journal.${d.slice(0, 10)}T${d.slice(11, 19).replace(/:/g, '')}.01.log`;
      const cible = path.join(dossier, nom);
      fs.copyFileSync(f, cible);
      octets += fs.statSync(cible).size;
      fichiers.push(cible);
    }
  }
  return { fichiers, mo: octets / MO };
}

async function mesurer(srv) {
  const m = await srv.demander('memoire', 60_000);
  if (m.erreur) throw new Error(`Mesure de la mémoire impossible : ${m.erreur}`);
  return m;
}

export default {
  titre: 'Gros dossier de journaux : démarrage sous un tas plafonné, mémoire gardée bornée',
  async lancer(ctx) {
    const journal = ctx.journal();
    const lignes = [];
    const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-controle-memoire-'));
    try {
      for (const d of ['une', 'toutes']) fs.mkdirSync(path.join(dossier, d));
      const une = poserCopies(path.join(dossier, 'une'), 1);
      const toutes = poserCopies(path.join(dossier, 'toutes'), COPIES);
      ctx.dire(`${toutes.fichiers.length} journaux, ${virgule(toutes.mo)} Mo (${COPIES} copies des séances de référence)`);

      const base = await demarrerServeur({ journaux: une.fichiers, memoire: true });
      let reference;
      try {
        reference = await mesurer(base);
      } finally {
        await base.arreter();
      }
      lignes.push(`Une copie (${virgule(une.mo)} Mo) : ${virgule(reference.tasMo)} Mo gardés (tas plafonné à ${Math.round(reference.limiteMo)} Mo par défaut)`);

      const debut = Date.now();
      let gros;
      try {
        gros = await demarrerServeur({ journaux: toutes.fichiers, memoire: true, tasMo: TAS_MO });
      } catch (err) {
        const manque = /heap out of memory|Allocation failed|code 134/i.test(err.message);
        lignes.push(`Démarrage sur ${virgule(toutes.mo)} Mo sous ${TAS_MO} Mo : ÉCHEC`, err.message);
        fs.writeFileSync(journal, `${lignes.join('\n')}\n`);
        throw new ctx.EchecEtape(manque
          ? `Le serveur manque de mémoire au démarrage avec ${virgule(toutes.mo)} Mo de journaux et un tas de ${TAS_MO} Mo : il garde trop de l'historique.`
          : `Le serveur n'a pas démarré sur ${virgule(toutes.mo)} Mo de journaux : ${err.message.split('\n')[0]}`, { journal });
      }
      const pret = (Date.now() - debut) / 1000;
      let mesure;
      try {
        mesure = await mesurer(gros);
      } finally {
        await gros.arreter();
      }
      const parMo = (mesure.tasMo - reference.tasMo) / (toutes.mo - une.mo);
      lignes.push(`${COPIES} copies (${virgule(toutes.mo)} Mo) : prêt en ${virgule(pret)} s sous un tas de ${TAS_MO} Mo ; ${virgule(mesure.tasMo)} Mo gardés, soit ${virgule(parMo, 2)} Mo de plus par Mo de journaux (plafond ${virgule(PAR_MO_MAX, 1)})`);
      fs.writeFileSync(journal, `${lignes.join('\n')}\n`);
      if (parMo > PAR_MO_MAX) {
        throw new ctx.EchecEtape(`Mémoire gardée trop grosse : ${virgule(parMo, 2)} Mo par Mo de journaux (plafond ${virgule(PAR_MO_MAX, 1)}) ; un module garde l'historique au lieu d'en tirer ce qu'il lui faut.`, { journal });
      }
      return `${virgule(toutes.mo, 0)} Mo de journaux : démarrage sous ${TAS_MO} Mo de tas en ${virgule(pret)} s, ${virgule(parMo, 2)} Mo gardé par Mo de journaux (plafond ${virgule(PAR_MO_MAX, 1)})`;
    } finally {
      fs.rmSync(dossier, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  },
};
