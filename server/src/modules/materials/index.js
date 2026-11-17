// Module « Matériaux » (mode de jeu) : matériaux récupérés pendant la session, en temps réel.

import { currentReference } from '../../core/reference/refdata.js';
import { liveSession } from '../../core/sessions.js';
import { MaterialState, MATERIAL_EVENTS } from './state.js';

export default {
  id: 'materials',
  name: 'Matériaux',

  async register({ router, journal, broadcast, overlay }) {
    // Grades des matériaux : données de référence partagées (core/reference/refdata.js), à jour après « Mettre à jour
    // les données » ; null tant qu'elles ne sont pas téléchargées (ou si elles sont abîmées)
    const gradeOf = (key) => currentReference()?.materials.get(key)?.grade || null;
    liveSession({ id: 'materials', router, journal, overlay, broadcast, events: MATERIAL_EVENTS, create: () => new MaterialState(gradeOf) });
  },
};
