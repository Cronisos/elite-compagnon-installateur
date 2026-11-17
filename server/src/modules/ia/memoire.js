// Mémoire vidéo et choix du modèle : le jeu passe d'abord.
//
// - La mémoire libre est lue sur la carte NVIDIA (nvidia-smi, livré avec le pilote). Sans carte NVIDIA, elle est
//   inconnue : seul le petit modèle est permis, par prudence.
// - Avant chaque question, dans l'ordre : le grand s'il tient entièrement sur la carte avec la marge ; le moyen, entier
//   ou réparti entre la carte et le processeur (jamais dans la marge laissée au jeu, et au moins la moitié de ses
//   couches sur la carte, sinon trop lent) ; le léger s'il tient entièrement ; sinon aucun.
// - Ollama ne voit pas la mémoire prise par le jeu (il s'est cru à 21 Go libres pour 14 réels, le 12 nov. 2026, et a
//   fait ramer le jeu et une vidéo) : le nombre de couches sur la carte est donc toujours calculé ici et imposé.
// - Un modèle chargé n'est jamais chassé par Windows ni par le pilote pour faire de la place au jeu : c'est le
//   module qui le décharge quand la mémoire libre passe sous la marge (surveillance dans index.js).

import { execFile } from 'node:child_process';

/** Mémoire en plus du fichier du modèle une fois chargé (contexte de la conversation) : mesuré 0,4 à 0,5 Go. */
export const SURCOUT_MO = 700;
/** Part minimale des couches d'un modèle réparti qui doit être sur la carte (en dessous, la lecture devient trop lente). */
export const PART_CARTE_MIN = 0.5;

/** Lit « memory.free, memory.total » (Mo) de la première carte dans la sortie de nvidia-smi, ou null. */
export function lireNvidiaSmi(sortie) {
  const ligne = String(sortie || '').split(/\r?\n/).map((l) => l.trim()).find(Boolean);
  const m = /^(\d+)\s*,\s*(\d+)$/.exec(ligne || '');
  if (!m) return null;
  const libreMo = Number(m[1]);
  const totalMo = Number(m[2]);
  return totalMo > 0 && libreMo <= totalMo ? { libreMo, totalMo } : null;
}

/** Mémoire vidéo libre et totale (Mo) de la carte NVIDIA, ou null (pas de carte NVIDIA, pilote absent, délai). */
export function memoireVideo({ executer = execFile } = {}) {
  return new Promise((resolve) => {
    try {
      executer('nvidia-smi', ['--query-gpu=memory.free,memory.total', '--format=csv,noheader,nounits'], { timeout: 4000, windowsHide: true }, (err, stdout) => {
        resolve(err ? null : lireNvidiaSmi(stdout));
      });
    } catch {
      resolve(null);
    }
  });
}

/** Mémoire qu'un modèle prendra une fois chargé (Mo), d'après la taille de son fichier (octets). */
export const besoinMo = (tailleOctets) => Math.ceil(tailleOctets / 1024 ** 2) + SURCOUT_MO;

/**
 * Modèle à utiliser pour une question.
 * @param o.memoire    { libreMo, totalMo } ou null (inconnue)
 * @param o.modeles    [{ role: 'grand' | 'moyen' | 'leger', nom, besoinMo, charge, numGpuCharge, reparti: { couches,
 *                     parCoucheMo } | null }] : les modèles installés, dans l'ordre préféré
 * @param o.margeMo    mémoire toujours libre pour un modèle entier sur la carte (sous elle, le modèle chargé est déchargé)
 * @param o.margeJeuMo mémoire laissée au jeu quand un modèle est réparti (le jeu peut encore grossir)
 * @returns {{ nom, role, numGpu? } | { nom: null, raison }}  numGpu : couches sur la carte, à imposer à Ollama
 */
export function choisirModele({ memoire, modeles, margeMo, margeJeuMo = margeMo }) {
  const installes = modeles.filter((m) => m.nom);
  if (!installes.length) return { nom: null, raison: 'Aucun modèle installé.' };
  if (!memoire) {
    const leger = installes.find((m) => m.role === 'leger');
    return leger
      ? { nom: leger.nom, role: 'leger' }
      : { nom: null, raison: 'Mémoire vidéo inconnue (pas de carte NVIDIA) : seul le petit modèle est permis, et il n’est pas installé.' };
  }
  for (const m of installes) {
    // Déjà chargé : sa place est déjà prise, il suffit que le jeu garde sa marge (mêmes couches, sinon Ollama recharge)
    if (m.charge) {
      if (memoire.libreMo >= margeMo) return { nom: m.nom, role: m.role, ...(m.numGpuCharge != null ? { numGpu: m.numGpuCharge } : {}) };
      continue;
    }
    if (memoire.libreMo - m.besoinMo >= margeMo) return { nom: m.nom, role: m.role, ...(m.reparti ? { numGpu: m.reparti.couches } : {}) };
    if (m.reparti?.couches > 0 && m.reparti.parCoucheMo > 0) {
      const numGpu = Math.floor((memoire.libreMo - margeJeuMo - SURCOUT_MO) / m.reparti.parCoucheMo);
      if (numGpu >= Math.ceil(m.reparti.couches * PART_CARTE_MIN)) return { nom: m.nom, role: m.role, numGpu: Math.min(numGpu, m.reparti.couches) };
    }
  }
  return { nom: null, raison: `Mémoire vidéo presque pleine (${(memoire.libreMo / 1024).toFixed(1)} Go libres) : le jeu passe d’abord.` };
}

/** Le modèle chargé doit-il être déchargé ? La mémoire libre est passée sous la marge. */
export const aDecharger = (memoire, margeMo) => Boolean(memoire) && memoire.libreMo < margeMo;
