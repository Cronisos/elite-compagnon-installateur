// Module « Moniteur PC » : carte graphique, mémoire vidéo (dont celle de l'IA), processeur, mémoire, mémoire du jeu,
// en direct, dans une petite fenêtre en jeu (/hud/systeme) et sur sa page. Lecture seule, rien ne sort du PC.
// Les relevés (toutes les 2 s) ne tournent que si la fenêtre est ouverte ou la page regardée.

import { isPlainObject, readJsonFile, writeJsonAtomicSync } from '../../core/atomic.js';
import { dataPath } from '../../core/paths.js';
import { releve, sources } from './mesures.js';

const PAGE = 'systeme';
export const PERIODE_MS = 2_000;
const LECTEUR_MS = 15_000; // la page a lu il y a moins de 15 s : les relevés continuent

export default {
  id: 'systeme',
  name: 'Moniteur PC',

  async register({ router, broadcast, overlay }, { fichier = dataPath('systeme.json'), src = sources() } = {}) {
    let reglages = { fenetre: false, ...readJsonFile(fichier, { fallback: {}, accept: isPlainObject, label: 'Moniteur PC' }) };
    reglages.fenetre = reglages.fenetre === true;
    let dernier = null;
    let pic = 0;
    let lu = 0;
    let enCours = false;

    const actif = () => reglages.fenetre || Date.now() - lu < LECTEUR_MS;
    async function mesurer() {
      if (enCours) return dernier;
      enCours = true;
      try {
        dernier = await releve(src, pic);
        pic = dernier.vram?.picMo ?? pic;
        broadcast('systeme:mesure', dernier);
      } finally {
        enCours = false;
      }
      return dernier;
    }
    setInterval(() => {
      if (actif()) mesurer();
    }, PERIODE_MS).unref();

    const setWindow = (on) => overlay?.setExtra?.(PAGE, on);
    if (reglages.fenetre) setWindow(true);

    router.get('/mesure', async (req, res) => {
      lu = Date.now();
      res.json(dernier && Date.now() - Date.parse(dernier.at) < PERIODE_MS * 2 ? dernier : await mesurer());
    });
    router.get('/reglages', (req, res) => res.json(reglages));
    router.put('/reglages', (req, res) => {
      const b = req.body || {};
      if (Object.hasOwn(b, 'fenetre') && typeof b.fenetre !== 'boolean') return res.status(400).json({ error: '« fenetre » : vrai ou faux.' });
      if (b.repartirPic === true) pic = 0;
      if (typeof b.fenetre === 'boolean' && b.fenetre !== reglages.fenetre) {
        reglages = { ...reglages, fenetre: b.fenetre };
        try {
          writeJsonAtomicSync(fichier, reglages);
        } catch (err) {
          console.error(`Moniteur PC : réglage non enregistré (${err.message})`);
        }
        setWindow(b.fenetre);
      }
      broadcast('systeme:reglages', reglages);
      return res.json(reglages);
    });
  },
};
