// Module « Saut du porteur » : compte à rebours du saut programmé, dans une fenêtre par-dessus le jeu
// qui s'ouvre d'elle-même à la programmation et se ferme après le saut ou à l'annulation.

import { AFTER_DEPARTURE_MS, CarrierState, CARRIER_EVENTS } from './state.js';
import { CARGO_EVENTS, CarrierCargo } from './cargo.js';

const SET = new Set(CARRIER_EVENTS);
const CARGO = new Set(CARGO_EVENTS);
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

    // Cargaison estimée des porteurs (cargo.js) : rejouée depuis tout l'historique du journal, puis en direct
    let cargo = new CarrierCargo();

    journal.addInterest([...new Set([...CARRIER_EVENTS, ...CARGO_EVENTS])]);
    journal.on('ready', ({ history }) => {
      state = new CarrierState();
      cargo = new CarrierCargo();
      for (const ev of history) {
        if (SET.has(ev.event)) state.apply(ev);
        if (CARGO.has(ev.event)) cargo.apply(ev);
      }
      sync(); // un saut programmé avant le lancement de l'app est encore affiché
      broadcast('carrier:cargo', {});
    });
    journal.on('event', (ev) => {
      if (SET.has(ev.event) && state.apply(ev)) sync();
      if (CARGO.has(ev.event) && cargo.apply(ev)) broadcast('carrier:cargo', {});
    });

    router.get('/session', (req, res) => res.json(state.summary()));
    /** Cargaison estimée de chaque porteur connu (le tien d'abord), avec l'écart au total donné par le jeu. */
    router.get('/cargo', (req, res) => res.json({ carriers: cargo.view() }));
  },
};
