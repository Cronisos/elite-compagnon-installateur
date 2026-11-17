// Module « Sauvetage » : récupérations, livraisons, récompenses et mérites de la session, en temps réel.

import { currentReference } from '../../core/reference/refdata.js';
import { liveSession } from '../../core/sessions.js';
import { RescueState, RESCUE_EVENTS } from './state.js';

export default {
  id: 'rescue',
  name: 'Sauvetage',

  async register({ router, journal, game, broadcast, overlay }) {
    // Grades et noms des matériaux : données de référence partagées (core/reference/refdata.js), à jour après « Mettre
    // à jour les données » ; null tant qu'elles ne sont pas téléchargées (ou si elles sont abîmées)
    const gradeOf = (key) => currentReference()?.materials.get(key)?.grade || null;
    const labelOf = (key, localised) => {
      const ref = currentReference();
      return ref ? ref.materialLabel(key, localised) : localised || key;
    };
    const session = liveSession({
      id: 'rescue', router, journal, overlay, broadcast, events: RESCUE_EVENTS,
      create: () => new RescueState(gradeOf, labelOf),
      summary: (state) => state.summary(game.snapshot().cargo),
    });
    game.on('change', session.notify); // soute
  },
};
