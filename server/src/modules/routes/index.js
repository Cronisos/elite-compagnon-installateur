// Module « Mes routes commerciales ».
// Ne dépend que des services communs (journal, état du jeu, base, temps réel).

import { RouteTracker } from './services/tracker.js';
import { setupApi } from './api.js';

export default {
  id: 'routes',
  name: 'Mes routes commerciales',

  async register(ctx) {
    const tracker = new RouteTracker(ctx);
    setupApi(ctx.router, { ...ctx, tracker });
  },
};
