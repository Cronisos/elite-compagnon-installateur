// Routes des rôles des vaisseaux et de la bascule à l'embarquement (core/shipRoles.js, core/roleSwitch.js) :
//   GET  /api/ships/roles            rôles possibles (modes + Polyvalent), maximum de secondaires, rôles de chaque vaisseau
//   PUT  /api/ships/:shipId/role     { primary, secondary } : rôle d'un vaisseau (primary: null et secondary: [] l'efface)
// Rôles et vaisseaux : ceux du commandant chargé (core/commander.js), un ShipID n'étant unique que pour un commandant.
//   GET  /api/ships/current          vaisseau où tu es : nom donné, nom en jeu, modèle, titre affiché, rôle
//   GET  /api/overlay/switch         avis de la dernière bascule, tant qu'on peut l'annuler (null sinon)
//   POST /api/overlay/switch/cancel  « Annuler » : mode et fenêtres d'avant
//   POST /api/overlay/switch/dismiss fermer l'avis (le mode reste)
//   POST /api/overlay/closed         overlay quitté par le joueur (Alt+Maj+Q, avis envoyé par overlay/closed.js) : plus
//                                    aucune fenêtre ouverte, le mode reste noté. { at } : fermeture transmise après coup
//                                    (serveur arrêté à ce moment-là). Rend l'état et open : les fenêtres que l'overlay
//                                    doit ouvrir maintenant
// Les écritures passent par la garde de l'API locale (en-tête X-Elite-Compagnon, core/localGuard.js), posée avant.
// Temps réel : ships:roles, ships:current, overlay:switch (et overlay quand les fenêtres changent).

import { MAX_SECONDARY_ROLES, ROLES } from './modes.js';
import { checkRoleBody, MAX_SHIP_ID, parseShipId } from './shipRoles.js';

/**
 * Corps de POST /api/overlay/closed : rien (fermeture à l'instant), ou { at } (heure ISO de la fermeture, transmise
 * après coup par l'overlay). @returns {{ ok: true, at: number|null } | { ok: false, error: string }}
 */
export function checkClosedBody(body) {
  if (body === undefined || body === null) return { ok: true, at: null };
  if (typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'Avis illisible : envoie {} ou { at }.' };
  const extra = Object.keys(body).filter((k) => k !== 'at');
  if (extra.length) return { ok: false, error: `Champ inconnu : « ${extra[0].slice(0, 40)} ». Seul at (heure de la fermeture) est permis.` };
  if (body.at === undefined) return { ok: true, at: null };
  const at = typeof body.at === 'string' && body.at.length <= 40 ? Date.parse(body.at) : NaN;
  if (!Number.isFinite(at)) return { ok: false, error: 'Heure de fermeture illisible : at doit être une date ISO (2026-11-08T21:30:00.000Z).' };
  return { ok: true, at };
}

/**
 * @param {import('express').Express} app
 * @param {{ roles, tracker, switcher, advisor, broadcast }} deps
 */
export function mountShipRoutes(app, { roles, tracker, switcher, advisor, broadcast }) {
  app.get('/api/ships/roles', (req, res) => res.json({ roles: ROLES, maxSecondary: MAX_SECONDARY_ROLES, ships: roles.view(tracker.commander ?? null) }));

  app.put('/api/ships/:shipId/role', (req, res, next) => {
    const shipId = parseShipId(req.params.shipId);
    if (shipId === null) return res.status(400).json({ error: `Vaisseau invalide : un numéro de vaisseau du jeu (ShipID), de 0 à ${MAX_SHIP_ID}.` });
    const checked = checkRoleBody(req.body);
    if (!checked.ok) return res.status(400).json({ error: checked.error });
    let entry;
    try {
      entry = roles.set(shipId, checked.role, { type: tracker.typeOf(shipId), commander: tracker.commander ?? null });
    } catch (err) {
      err.publicMessage = `Rôle non enregistré : ${err.message}`;
      // Fichier des rôles pas relu (verrouillé par un autre programme…) : 503, rien n'est écrasé. Disque plein, dossier en
      // lecture seule… : 500. Dans les deux cas, rien n'a changé en mémoire
      if (err.unread) err.status = 503;
      return next(err);
    }
    broadcast('ships:roles', { ships: roles.view(tracker.commander ?? null) });
    advisor.roleChanged(shipId);
    broadcast('ships:current', switcher.currentShip());
    return res.json({ shipId, role: entry ? { primary: entry.primary, secondary: entry.secondary } : null });
  });

  app.get('/api/ships/current', (req, res) => res.json(switcher.currentShip()));

  app.get('/api/overlay/switch', (req, res) => res.json(switcher.current()));
  app.post('/api/overlay/switch/cancel', (req, res) => {
    const state = switcher.cancel();
    if (!state) return res.status(409).json({ error: 'Rien à annuler : la bascule est passée, ou tu as changé de mode depuis.' });
    return res.json(state);
  });
  app.post('/api/overlay/switch/dismiss', (req, res) => {
    switcher.clearNotice();
    res.json(null);
  });
  app.post('/api/overlay/closed', (req, res) => {
    const checked = checkClosedBody(req.body);
    if (!checked.ok) return res.status(400).json({ error: checked.error });
    const state = switcher.overlayClosed({ at: checked.at });
    // Ce que l'overlay doit avoir ouvert maintenant : rien après une fermeture appliquée (sauf les fenêtres d'un module),
    // l'état actuel si un changement voulu depuis prime
    const open = typeof switcher.overlay.launchPages === 'function' ? switcher.overlay.launchPages() : [...(state.pages || [])];
    return res.json({ ...state, open });
  });
}
