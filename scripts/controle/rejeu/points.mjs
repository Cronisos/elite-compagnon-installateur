// Ce que le rejeu demande à chaque module, par son API : un fichier de résultats attendus par module
// (scripts/controle/attendu/<module>.json). Surtout des lectures ; quelques écritures de scénario (création d'une route),
// sans risque : le serveur isolé et sa base sont jetés après chaque séance. Les points qui partiraient sur Internet sont
// gardés : réseau coupé, ils doivent répondre proprement.
//
// Ajouter un point : l'écrire ici, lancer « CONTROLE_UPDATE=1 npm run controle -- --etape=rejeu », relire le
// fichier attendu changé (git diff), puis le valider avec le code.
//
// statique : réponse qui ne dépend pas de la séance (catalogues, règles) : demandée une seule fois, sur la
//            première séance, en mode historique.
// corps    : corps JSON d'une écriture (scénario ; le serveur isolé est jetable) ; cle : nom du résultat quand le même
//            point est demandé deux fois (avant et après une écriture).
// scenario : écriture, ou lecture qui la suit : demandé une seule fois, dans l'ordre, après les lectures (qui, elles,
//            sont répétées jusqu'à deux passes identiques : voir rejouer.mjs). Une écriture sans scenario: true serait
//            rejouée à chaque passe : refusé, sauf sansEffet: true (POST qui ne fait que calculer, comme /detect).

/** Loadout écrit à la main pour le scénario de l'itinéraire d'ingénierie (rien d'un joueur). */
const IMPORT_KRAIT = {
  event: 'Loadout', Ship: 'krait_mkii', ShipName: 'Banc', ShipIdent: 'BC-01',
  Modules: [
    { Slot: 'FrameShiftDrive', Item: 'int_hyperdrive_size5_class5', Engineering: { BlueprintName: 'FSD_LongRange', Level: 5, Quality: 1, ExperimentalEffect: 'special_fsd_heavy' } },
    { Slot: 'MainEngines', Item: 'int_engine_size6_class5', Engineering: { BlueprintName: 'Engine_Dirty', Level: 5, Quality: 1 } },
  ],
};

const m = (base, points) => points.map((p) => (typeof p === 'string' ? { point: p } : p)).map((p) => ({ ...p, base }));

export const MODULES = {
  coeur: m('/api', [
    'GET /state', 'GET /journal/recent', 'GET /journal/language', 'GET /settings', 'GET /overlay', 'GET /overlay/suggest',
    { point: 'GET /modules', statique: true }, 'GET /ships/nicknames',
    // Rôles des vaisseaux, vaisseau actuel, avis de bascule (core/shipRoutes.js)
    'GET /ships/roles', 'GET /ships/current', 'GET /overlay/switch',
  ]),
  routes: m('/api/modules/routes', [
    'GET /routes', 'GET /loops', 'GET /questions', 'GET /dashboard', { point: 'POST /detect', sansEffet: true }, 'GET /markets?system=Cemiess',
    // Scénario : « Nouvelle route » avec un objectif, tout l'historique compris, puis ce que le module en tire
    { point: 'POST /routes', corps: { goal: 7_000_000_000, includeHistory: true }, cle: 'POST /routes (objectif 7 Md, historique compris)', scenario: true },
    { point: 'GET /loops', cle: 'GET /loops après création', scenario: true },
    { point: 'GET /routes/1', cle: 'GET /routes/1 après création', scenario: true },
    { point: 'GET /dashboard', cle: 'GET /dashboard après création', scenario: true },
  ]),
  engineering: m('/api/modules/engineering', [
    'GET /status', 'GET /fleet', { point: 'GET /ships', statique: true }, 'GET /plans', 'GET /inventory', 'GET /dashboard', 'GET /ranks', { point: 'GET /ranks/rules', statique: true },
    // Itinéraire d'ingénierie
    'GET /validations', 'GET /engineers', 'GET /engineers/300030', 'GET /route', { point: 'GET /route/rules', statique: true },
    // Scénario : un plan importé (Krait Mk II écrit à la main : FSD 5A Portée augmentée G5 + effet, propulseurs 6A
    // bricolés G5 ; aucune donnée de joueur), validé (un calcul depuis la position, s'il y en a une), puis calculé
    // depuis Sol et depuis la position, et relu
    { point: 'POST /import', corps: { text: JSON.stringify(IMPORT_KRAIT) }, cle: 'POST /import (Krait Mk II, FSD et propulseurs G5)', scenario: true },
    { point: 'POST /plans/1/validation', scenario: true },
    { point: 'POST /route', corps: { planIds: [1], from: 'sol' }, cle: 'POST /route (Sol)', scenario: true },
    { point: 'POST /route', corps: { planIds: [1], from: 'position' }, cle: 'POST /route (position)', scenario: true },
    { point: 'GET /route', cle: 'GET /route après calcul', scenario: true },
  ]),
  builder: m('/api/modules/builder', ['GET /status', { point: 'GET /ships', statique: true }, 'GET /fleet', 'GET /builds', 'GET /inara']),
  planner: m('/api/modules/planner', ['GET /context']),
  waypoints: m('/api/modules/waypoints', [
    'GET /waypoints', 'GET /categories', 'GET /sweep', 'GET /sweep/top-ores', 'GET /sweep/markets', 'GET /here', 'GET /guide-target',
    'GET /session', 'GET /sessions', 'GET /survey', 'GET /survey/systems', 'GET /drills', 'GET /drills/guide', 'GET /captures', 'GET /eeps',
  ]),
  systems: m('/api/modules/systems', [{ point: 'GET /options', statique: true }, 'GET /systems']),
  expansion: m('/api/modules/expansion', ['GET /projects', 'GET /merits', 'GET /here', 'GET /rates', 'GET /rates?period=all', 'GET /sale', 'GET /sales', 'GET /sales/text']),
  whereto: m('/api/modules/whereto', ['GET /context', { point: 'GET /rules', statique: true }, 'GET /arrival', 'GET /tasks']),
  regles: m('/api/modules/regles', [{ point: 'GET /', statique: true }, { point: 'GET /rules', statique: true }]),
  escadron: m('/api/modules/escadron', ['GET /status', 'GET /contribution']),
  shipmining: m('/api/modules/shipmining', ['GET /session']),
  combat: m('/api/modules/combat', ['GET /session']),
  rescue: m('/api/modules/rescue', ['GET /session']),
  groundcombat: m('/api/modules/groundcombat', ['GET /session']),
  bilan: m('/api/modules/bilan', ['GET /sessions', 'GET /fenetre']),
  materials: m('/api/modules/materials', ['GET /session']),
  colonisation: m('/api/modules/colonisation', ['GET /sites', 'GET /here', 'GET /active', 'GET /diagnostics']),
  carrier: m('/api/modules/carrier', ['GET /session']),
  signals: m('/api/modules/signals', ['GET /session']),
  navroute: m('/api/modules/navroute', ['GET /session']),
  fsdcool: m('/api/modules/fsdcool', ['GET /session', 'GET /sco']),
  bindings: m('/api/modules/bindings', ['GET /status']),
  links: m('/api/modules/links', ['GET /links', 'GET /context']),
  glance: m('/api/modules/glance', ['GET /summary']),
  hudcolours: m('/api/modules/hudcolours', ['GET /state']),
  compagnon: m('/api/modules/compagnon', ['GET /state', { point: 'GET /categories', statique: true }, 'GET /packs']),
  // Moniteur PC et Alicia : seulement ce qui ne dépend pas du PC (ni carte graphique mesurée, ni modèle installé)
  systeme: m('/api/modules/systeme', ['GET /reglages']),
  ia: m('/api/modules/ia', ['GET /historique']),
};

/** Modes du rejeu : journaux relus au démarrage, ou écrits pendant que le serveur tourne. */
export const MODES = ['historique', 'direct'];
