// Module « Projet extension » : routes Powerplay à prendre système par système, et historique des mérites
// gagnés dans les systèmes de la route, semaine par semaine.

import { MERIT_EVENTS, MeritLog } from './merits.js';
import { Paliers } from './paliers.js';
import { dataPath } from '../../core/paths.js';
import { registerSale } from './sale.js';
import { registerRates } from './ratesRoutes.js';
import { registerProjects } from './projects.js';

export default {
  id: 'expansion',
  name: 'Projet extension',

  async register({ router, prisma, journal, game, broadcast, overlay, vigie }) {
    // Mérites prévus avant la vente, et ventes à 0 mérite expliquées (sale.js)
    registerSale({ router, journal, game, broadcast, overlay, vigie });
    registerRates({ router, journal, broadcast }); // onglet « Mérites par heure » : ratesRoutes.js
    let merits = new MeritLog();
    // Paliers déclarés atteints par le joueur, pour la semaine en cours (paliers.js)
    const paliers = new Paliers(dataPath('expansion-paliers.json'));
    const interesting = new Set(MERIT_EVENTS);
    journal.addInterest(MERIT_EVENTS);
    journal.on('ready', ({ history }) => {
      merits = new MeritLog();
      for (const ev of history) if (interesting.has(ev.event)) merits.apply(ev);
    });
    journal.on('event', (ev) => {
      if (!interesting.has(ev.event)) return;
      merits.apply(ev);
      if (ev.event === 'PowerplayMerits' || ev.event === 'FSDJump' || ev.event === 'Location' || ev.event === 'CarrierJump') broadcast('expansion:merits', {});
    });

    // Routes d'extension, rapport de la semaine, palier déclaré, Coup d'œil (projects.js)
    // journalReady : avant la lecture des journaux, aucun saut laissé vide ne peut être calculé (réponse 503)
    registerProjects({ router, prisma, broadcast, merits: () => merits, paliers, journalReady: () => journal?.ready !== false });
  },
};
