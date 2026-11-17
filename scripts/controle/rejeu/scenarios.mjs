// Scénarios du rejeu : une séance de référence rejouée EN DIRECT après une préparation par l'API (ce que le joueur
// ferait avant de lancer le jeu), puis des vérifications écrites en dur, qui ne se regénèrent pas avec les attendus.
// Chaque scénario : { titre, seance, preparer(srv) (avant le premier journal), verifier(srv) → null ou la raison }.
// Lancés par rejeu/rejouer.mjs quand toutes les séances tournent, chacun sur son serveur isolé (overlay coupé).

// Sans overlay, « Oui » ne pourrait ouvrir aucune fenêtre : le texte dit ce qui marche, et l'interface offre « Ouvrir la page »
const OVERLAY_COUPE = "rôle principal de « Type-11 Prospector » : l'overlay est coupé, pas de fenêtre par-dessus le jeu ; ouvre sa page dans l'app";

export const SCENARIOS = [
  {
    titre: 'Rôle principal d’un vaisseau de séance, overlay coupé : la bascule devient la proposition attendue',
    // Minage Rhino du 7 nov. : le jeu se lance dans le Rhino (n° 44), le Type-11 (n° 43) se révèle au retour du SRV.
    // Rôle principal seul : le raffinage (compté « en vaisseau », la séance n'a pas de Status.json) et la capsule ramassée
    // sont hors rôle, donc discrets ; ils ne chassent pas la proposition du rôle.
    seance: 'minage-rhino-2026-11-07',
    async preparer(srv) {
      const r = await srv.requete('PUT', '/api/ships/43/role', { primary: 'waypoints', secondary: [] });
      if (r.statut !== 200) throw new Error(`PUT /api/ships/43/role : ${r.statut} ${JSON.stringify(r.corps).slice(0, 200)}`);
    },
    async verifier(srv) {
      const s = await srv.get('/api/overlay/suggest');
      if (s?.mode !== 'waypoints' || s.source !== 'role' || s.shipId !== 43) return `proposition attendue : Minage Rhino venue du rôle du vaisseau 43 ; obtenu ${JSON.stringify(s)}`;
      if (s.reason !== OVERLAY_COUPE) return `raison : « ${s.reason} » au lieu de « ${OVERLAY_COUPE} »`;
      if (s.discreet || s.canRemember) return `proposition du rôle : ni discrète ni « Retenir » (obtenu ${JSON.stringify(s)})`;
      const o = await srv.get('/api/overlay');
      if (o.mode !== null || o.installed !== false) return `overlay coupé : aucun mode ne doit s'ouvrir (obtenu ${JSON.stringify(o)})`;
      const avis = await srv.get('/api/overlay/switch');
      if (avis !== null) return `aucun avis de bascule sans overlay (obtenu ${JSON.stringify(avis)})`;
      const v = await srv.get('/api/ships/current');
      if (v.shipId !== 43 || v.title !== 'Type-11 Prospector' || v.role?.primary !== 'waypoints') return `vaisseau actuel : ${JSON.stringify(v)}`;
      // Ce que « Oui » enverrait : refusé sans overlay (409), d'où « Ouvrir la page » dans l'interface (client/src/core/shipRole.js
      // menuBubbles), qui ouvre la page du mode et répond à la proposition comme « Non »
      const oui = await srv.requete('PUT', '/api/overlay', { mode: 'waypoints', glance: false, pages: ['waypoints'] });
      if (oui.statut !== 409) return `sans overlay, PUT /api/overlay doit répondre 409 (obtenu ${oui.statut})`;
      if ((await srv.get('/api/overlay/suggest'))?.source !== 'role') return 'le refus de « Oui » ne doit pas effacer la proposition';
      // « Ouvrir la page » (ou « Non ») la fait taire, et rien d'autre n'attendait derrière elle
      await srv.post('/api/overlay/suggest/dismiss');
      const apres = await srv.get('/api/overlay/suggest');
      if (apres !== null) return `après « Ouvrir la page » ou « Non », plus de proposition attendue (obtenu ${JSON.stringify(apres)})`;
      return null;
    },
  },
];
