// Module « Itinéraire » : avancement de l'itinéraire tracé, dans une fenêtre par-dessus le jeu qui s'ouvre
// d'elle-même dès qu'un itinéraire de plus de 2 sauts est tracé, ou dès que le carburant ne couvre pas les 2 sauts
// suivants (récupérateur compris), et se ferme à l'arrivée ou à l'effacement.

import { MIN_JUMPS, RouteState, ROUTE_EVENTS } from './state.js';

const PAGE = 'navroute'; // page /hud/navroute de l'overlay

export default {
  id: 'navroute',
  name: 'Itinéraire',

  async register({ router, journal, game, broadcast, overlay }) {
    const state = new RouteState();
    // Serveur relancé en plein itinéraire (plantage, code modifié) : l'overlay affiche encore la fenêtre ouverte par le
    // serveur d'avant. Elle reste ouverte tant que l'itinéraire n'est pas fini (sinon elle se ferme), au lieu de se
    // fermer au premier ordre suivant.
    let open = Boolean(overlay.shown?.(PAGE));
    let dernier = null;
    let ouverte = null; // dernier ordre donné à l'overlay (le carburant change sans cesse : pas un ordre à chaque fois)

    // Carburant en direct (Status.json, par l'état du jeu) ; le reste (vaisseau, soute, sauts) vient du journal
    const summary = () => state.summary(game?.state?.loadout?.fuelMain ?? null);

    /** Fenêtre ouverte pendant un itinéraire assez long ou en cas d'alerte de carburant, fermée à l'arrivée. */
    function sync(live) {
      const s = summary();
      if (!s) open = false;
      else if (live) open = s.total >= MIN_JUMPS; // décidé au tracé de l'itinéraire, selon sa longueur
      if (s?.fuel?.alerte) open = true; // carburant insuffisant : on le dit, même sur une route courte
      if (open !== ouverte) overlay.setExtra(PAGE, open);
      ouverte = open;
      const texte = JSON.stringify(s);
      if (texte === dernier) return;
      dernier = texte;
      broadcast('navroute:update', s);
    }

    journal.addInterest(ROUTE_EVENTS);
    journal.on('ready', ({ history }) => {
      for (const ev of history) state.apply(ev);
      sync(false);
    });
    journal.on('event', (ev) => {
      if (state.apply(ev)) sync(false);
    });
    // NavRoute.json change à chaque itinéraire tracé ou effacé
    journal.on('navroute', (file, { initial } = {}) => {
      state.setRoute(file);
      sync(!initial);
    });
    // Carburant (Status.json) et vaisseau (Loadout) : recalcul, diffusé seulement s'il change
    game?.on?.('change', () => sync(false));

    router.get('/session', (req, res) => res.json(summary()));
  },
};
