// Module « Combat » : primes, obligations, ennemis abattus et mérites de la session, en temps réel ; et l'alerte du
// vaisseau (coque, modules sous un seuil réglable, boucliers : vaisseau.js).

import { isPlainObject, readJsonFile, writeJsonAtomicSync } from '../../core/atomic.js';
import { dataPath } from '../../core/paths.js';
import { liveSession } from '../../core/sessions.js';
import { CombatState, COMBAT_EVENTS } from './state.js';
import { SEUIL_DEFAUT, SEUIL_MAX, SEUIL_MIN, seuilValide } from './vaisseau.js';

export default {
  id: 'combat',
  name: 'Combat',

  async register({ router, journal, broadcast, overlay }, { fichier = dataPath('combat-alerte.json') } = {}) {
    let seuil = seuilValide(readJsonFile(fichier, { fallback: {}, accept: isPlainObject, label: 'Alerte de combat' })?.seuil) ?? SEUIL_DEFAUT;
    const { notify } = liveSession({
      id: 'combat', router, journal, overlay, broadcast, events: COMBAT_EVENTS, create: () => new CombatState(),
      summary: (s) => ({ ...s.summary(), vaisseau: s.vaisseau.vue(seuil) }),
    });

    /** Seuil de l'alerte du vaisseau, en % : la coque ou un module en dessous allume l'alerte du HUD. */
    router.get('/alerte', (req, res) => res.json({ seuil }));
    router.put('/alerte', (req, res) => {
      const n = seuilValide(req.body?.seuil);
      if (n == null) return res.status(400).json({ error: `Seuil attendu : un nombre entier de ${SEUIL_MIN} à ${SEUIL_MAX} %.` });
      seuil = n;
      try {
        writeJsonAtomicSync(fichier, { seuil });
      } catch (err) {
        console.error(`Alerte de combat : seuil non enregistré (${err.message})`);
      }
      notify();
      return res.json({ seuil });
    });
  },
};
