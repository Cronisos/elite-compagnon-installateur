// Module « Combat au sol » : kills en zone de conflit au sol, primes, mérites, morts et consommables de la session à pied,
// avec les guerres du système et l'installation où tu es, en temps réel.

import { liveSession } from '../../core/sessions.js';
import { GroundCombatState, GROUND_EVENTS } from './state.js';

export default {
  id: 'groundcombat',
  name: 'Combat au sol',

  async register({ router, journal, broadcast, overlay }) {
    // Choisir le mode 🪖 en plein combat ne remet pas les kills à zéro (le bouton « Remettre à zéro » le fait)
    liveSession({ id: 'groundcombat', router, journal, overlay, broadcast, events: GROUND_EVENTS, create: () => new GroundCombatState(), resetAuMode: false });
  },
};
