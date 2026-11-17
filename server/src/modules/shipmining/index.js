// Module « Minage vaisseau » (mode de jeu) : prospecteur, drones, raffinage et soute, en temps réel.

import { liveSession } from '../../core/sessions.js';
import { ShipMiningState, SHIP_MINING_EVENTS } from './state.js';

export default {
  id: 'shipmining',
  name: 'Minage vaisseau',

  async register({ router, journal, game, broadcast, overlay }) {
    /** Soute du vaisseau : remplissage, capacité et drones restants. */
    const hold = () => {
      const g = game.snapshot();
      return {
        count: g.cargoCount ?? null,
        capacity: g.loadout?.cargoCapacity ?? null,
        drones: (g.cargo || []).find((c) => c.name === 'drones')?.count ?? 0,
      };
    };
    const session = liveSession({
      id: 'shipmining', router, journal, overlay, broadcast, events: SHIP_MINING_EVENTS,
      create: () => new ShipMiningState(),
      summary: (state) => state.summary(hold()),
    });
    game.on('change', session.notify); // soute
  },
};
