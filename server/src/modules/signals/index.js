// Module « Signaux » : les signaux utiles du système où l'on arrive, dans une fenêtre par-dessus le jeu qui
// s'ouvre d'elle-même à l'arrivée en mode Sauvetage ou Matériaux, et se ferme au départ du système.

import { SignalState, SIGNAL_EVENTS, SIGNAL_HISTORY } from './state.js';

const SET = new Set(SIGNAL_EVENTS);
const PAGE = 'signals'; // page /hud/signals de l'overlay
const MODES = ['rescue', 'materials']; // modes de jeu où la fenêtre s'ouvre
// Arrivée ou départ : diffusé tout de suite. La fenêtre rangée (cachée, overlay/main.js) est réaffichée dès que l'ordre
// lui arrive, LAUNCH_DELAY_MS plus tard (core/overlay.js) : elle doit déjà montrer le nouveau système, jamais un
// instant l'ancien (titre, heure d'arrivée et signaux du système d'avant).
const SYSTEME = new Set(['FSDJump', 'Location', 'CarrierJump', 'StartJump']);
export const RAFALE_MS = 300; // rafale de signaux (scan FSS) : une seule diffusion, 300 ms après le dernier

export default {
  id: 'signals',
  name: 'Signaux',

  async register({ router, journal, broadcast, overlay }) {
    let state = new SignalState();
    let timer = null;
    const diffuser = () => {
      clearTimeout(timer);
      timer = null;
      broadcast('signals:update', state.summary());
    };
    const notify = () => {
      clearTimeout(timer);
      timer = setTimeout(diffuser, RAFALE_MS);
    };

    journal.addInterest(SIGNAL_EVENTS.filter((n) => n !== 'FSSSignalDiscovered'));
    journal.addInterest(['FSSSignalDiscovered'], { history: SIGNAL_HISTORY }); // ceux du dernier système seulement
    journal.on('ready', ({ history }) => {
      state = new SignalState();
      for (const ev of history) if (SET.has(ev.event)) state.apply(ev);
      notify();
    });
    journal.on('event', (ev) => {
      if (!SET.has(ev.event) || !state.apply(ev)) return;
      // Les données d'abord, l'ordre à l'overlay ensuite
      if (SYSTEME.has(ev.event)) diffuser();
      else notify();
      if (['FSDJump', 'Location', 'CarrierJump'].includes(ev.event)) overlay.setExtra(PAGE, MODES.includes(overlay.mode()));
      if (ev.event === 'StartJump') overlay.setExtra(PAGE, false);
    });

    router.get('/session', (req, res) => res.json(state.summary()));
  },
};
