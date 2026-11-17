// Module « Saut du porteur » : compte à rebours du saut programmé, dans une fenêtre par-dessus le jeu
// qui s'ouvre d'elle-même à la programmation et se ferme après le saut ou à l'annulation.

import { AFTER_DEPARTURE_MS, CarrierState, CARRIER_EVENTS } from './state.js';

const SET = new Set(CARRIER_EVENTS);
const PAGE = 'carrier'; // page /hud/carrier de l'overlay

export default {
  id: 'carrier',
  name: 'Saut du porteur',

  async register({ router, journal, broadcast, overlay }) {
    let state = new CarrierState();
    let closer = null;

    /** Fenêtre ouverte tant qu'un saut est programmé, fermée ensuite. */
    function sync() {
      const jump = state.pending();
      overlay.setExtra(PAGE, Boolean(jump));
      clearTimeout(closer);
      if (jump) closer = setTimeout(sync, Date.parse(jump.departure) + AFTER_DEPARTURE_MS - Date.now() + 1000);
      broadcast('carrier:update', state.summary());
    }

    journal.addInterest(CARRIER_EVENTS);
    journal.on('ready', ({ history }) => {
      state = new CarrierState();
      for (const ev of history) if (SET.has(ev.event)) state.apply(ev);
      sync(); // un saut programmé avant le lancement de l'app est encore affiché
    });
    journal.on('event', (ev) => {
      if (SET.has(ev.event) && state.apply(ev)) sync();
    });

    router.get('/session', (req, res) => res.json(state.summary()));
  },
};
