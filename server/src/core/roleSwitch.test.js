// Rôles des vaisseaux en action : décision d'embarquement, bascule avec un faux overlay, Annuler, démarrage, et ce que
// les rôles changent aux propositions (silence de 30 min, expiration, propositions discrètes, « Retenir »).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { choiceHolds, decideBoarding, GAME_SILENT_MS, RoleSwitcher, roleProposalReason, SWITCH_NOTICE_MS } from './roleSwitch.js';
import { DISMISS_MS, EXPIRE_MS, ModeAdvisor } from './modeGuess.js';
import { ShipRoles } from './shipRoles.js';
import { ShipTracker } from './boarding.js';
import { SilenceStore } from './silences.js';
import { windowsOf } from './modes.js';

const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-roleswitch-'));
process.env.ELITE_DATA_DIR = DATA; // table des noms de vaisseaux absente : noms du journal seulement
process.on('exit', () => fs.rmSync(DATA, { recursive: true, force: true }));

const SRV = { Flags: 1 << 26 };
const SHIP = { Flags: 1 << 24 };

/**
 * Faux overlay : mêmes règles que core/overlay.js (activité, remise à zéro des sessions au changement de mode, heure du
 * dernier changement voulu : changedAt, que des fenêtres redemandées telles quelles ne changent pas).
 */
function fauxOverlay({ installed = true, disabled = false, mode = null, glance = false, pages = [], choice = null, activity = mode, changedAt = null } = {}) {
  const o = {
    cur: { mode, glance, pages: [...pages] },
    activity,
    chosen: choice,
    changed: changedAt,
    now: () => 0, // horloge du banc
    installed,
    disabled,
    resets: [], // sessions remises à zéro (écouteurs onOverlayMode)
    shows: 0,
    reshows: 0,
    state: () => ({ ...o.cur, pages: [...o.cur.pages], installed: o.installed, disabled: o.disabled }),
    snapshot: () => ({ ...o.cur, pages: [...o.cur.pages], activity: o.activity, since: o.changed }),
    choice: () => (o.chosen ? { ...o.chosen } : null),
    changedAt: () => o.changed,
    launchPages: () => [...o.cur.pages],
    // silent : comme showOverlay, aucune remise à zéro de session, et l'activité devient `activity` ; reshow : pas un
    // changement voulu
    show(next, { choice: c, silent = false, activity: a, reshow = false } = {}) {
      o.shows += 1;
      if (reshow) o.reshows += 1;
      else o.changed = o.now();
      o.cur = { mode: next.mode ?? null, glance: Boolean(next.glance), pages: [...(next.pages || [])] };
      if (c !== undefined) o.chosen = c;
      if (silent) {
        if (a !== undefined) o.activity = typeof a === 'string' ? a : null;
        return o.state();
      }
      const changed = o.cur.mode !== null && o.cur.mode !== o.activity;
      if (o.cur.mode !== null) o.activity = o.cur.mode;
      if (changed) o.resets.push(o.cur.mode);
      return o.state();
    },
    restore(snap, { choice: c } = {}) {
      o.cur = { mode: snap.mode ?? null, glance: Boolean(snap.glance), pages: [...(snap.pages || [])] };
      if (c !== undefined) o.chosen = c;
      o.activity = snap.activity ?? null;
      o.changed = o.now();
      return o.state();
    },
    // Overlay quitté par le joueur (Alt+Maj+Q), comme overlayClosed : plus aucune fenêtre, le mode et l'activité restent
    closed({ choice: c, at } = {}) {
      o.cur = { mode: o.cur.mode, glance: false, pages: [] };
      if (c !== undefined) o.chosen = c;
      o.changed = Number.isFinite(at) ? at : o.now();
      return o.state();
    },
  };
  return o;
}

/** Fausses minuteries : rien ne part seul, le test appelle lui-même le rappel en attente. */
function faussesMinuteries() {
  const pending = [];
  return {
    pending,
    set: (fn, ms) => pending.push({ fn, ms }),
    clear: (id) => {
      pending[id - 1] = null;
    },
    /** Rappels encore armés pour cette durée. */
    armed: (ms) => pending.filter((p) => p && p.ms === ms),
  };
}

let n = 0;
/**
 * Un banc complet : vrais rôles (fichier temporaire), vrai suivi du vaisseau, vraies propositions, faux overlay.
 * silences : fichier des silences (core/silences.js) partagé entre deux bancs, comme une app qui redémarre ; debut :
 * heure de l'horloge au départ.
 */
function banc({ overlay = {}, roles = {}, types = {}, nicknames = {}, life = null, timers = null, silences = null, debut = '2026-11-08T10:00:00Z' } = {}) {
  const file = path.join(DATA, `roles-${(n += 1)}.json`);
  const clock = { t: Date.parse(debut) };
  const store = new ShipRoles({ file, now: () => clock.t, warn: () => {} }).load();
  for (const [id, r] of Object.entries(roles)) store.set(Number(id), r, { type: types[id] ?? null });
  const o = fauxOverlay(overlay);
  o.now = () => clock.t;
  const events = [];
  const broadcast = (type, data) => events.push({ type, data });
  const logs = [];
  let sw = null;
  const silenceStore = silences ? new SilenceStore({ file: silences, now: () => clock.t, warn: () => {} }) : null;
  const advisor = new ModeAdvisor({ mode: () => o.cur.mode, now: () => clock.t, onChange: (s) => broadcast('overlay:suggest', s), ship: () => sw.advisorShip(), timers, store: silenceStore });
  const tracker = new ShipTracker();
  sw = new RoleSwitcher({
    roles: store, tracker, advisor, overlay: o, broadcast, now: () => clock.t, timers,
    nickname: (id) => nicknames[id] ?? null, signOfLife: () => life ?? clock.t, log: (l) => logs.push(l),
  });
  // Historique : une heure avant l'horloge. En direct, chaque événement fait avancer l'horloge d'une seconde : le jeu
  // écrit à l'heure du PC, comme l'app, et un choix noté par l'app se compare aux horodatages du journal
  let ts = clock.t - 3600_000;
  const stamp = () => new Date((ts += 1000)).toISOString();
  const live = (ev, status = SHIP) => {
    clock.t = Math.max(clock.t, ts) + 1000;
    ts = clock.t;
    const e = { timestamp: new Date(clock.t).toISOString(), ...ev };
    const d = sw.event(e);
    advisor.event(e, status);
    return d;
  };
  return {
    sw, advisor, tracker, roles: store, overlay: o, events, logs, clock, live, stamp,
    tick: (ms) => (clock.t += ms),
    of: (type) => events.filter((e) => e.type === type).map((e) => e.data),
    menu: (mode) => sw.chooseMode({ mode, glance: o.cur.glance, pages: [...windowsOf(mode), ...(o.cur.glance ? ['glance'] : [])] }),
    replay: (evs) => {
      sw.replay(evs.map((ev) => ({ timestamp: stamp(), ...ev })));
      return sw.startup();
    },
  };
}

const EV = {
  loadGame: (Ship, ShipID, extra = {}) => ({ event: 'LoadGame', Ship, ShipID, ShipName: '', GameMode: 'Solo', ...extra }),
  loadout: (Ship, ShipID, extra = {}) => ({ event: 'Loadout', Ship, ShipID, ShipName: '', Modules: [], ...extra }),
  rhinoLoadout: (ShipID = 43) => ({ event: 'Loadout', Ship: 'lakonminer', ShipID, ShipName: '', Modules: [{ Item: 'int_largebuggybay_size6_class3_free' }] }),
  swap: (ShipType, ShipID, extra = {}) => ({ event: 'ShipyardSwap', ShipType, ShipID, StoreOldShip: 'X', StoreShipID: 1, ...extra }),
  shutdown: () => ({ event: 'Shutdown' }),
};
const PIOCHE = { 43: { primary: 'waypoints', secondary: ['shipmining'] } };
const TYPES = { 43: 'lakonminer', 26: 'federation_corvette', 31: 'panthermkii' };

// --- Décision pure ---

test('décision : rôle principal, déjà dans le mode, polyvalent, overlay', () => {
  const base = { shipId: 43, role: { primary: 'waypoints', secondary: [] }, mode: null, installed: true };
  assert.deepEqual(decideBoarding({ ...base, kind: 'change' }), { action: 'switch', mode: 'waypoints' });
  assert.deepEqual(decideBoarding({ ...base, kind: 'change', installed: false }), { action: 'propose', mode: 'waypoints', because: 'overlay' });
  assert.equal(decideBoarding({ ...base, kind: 'change', mode: 'waypoints', pages: windowsOf('waypoints') }).action, 'reshow', 'déjà dans ce mode : fenêtres redemandées telles quelles');
  assert.equal(decideBoarding({ ...base, kind: 'change', mode: 'combat' }).action, 'switch', 'autre vaisseau : la bascule passe');
  assert.equal(decideBoarding({ ...base, kind: 'change', role: { primary: 'polyvalent', secondary: [] } }).why, 'polyvalent');
  assert.equal(decideBoarding({ ...base, kind: 'change', role: { primary: null, secondary: ['combat'] } }).why, 'pas de rôle principal');
  assert.equal(decideBoarding({ ...base, kind: 'change', role: null }).action, 'none');
  assert.equal(decideBoarding({ ...base, kind: 'change', shipId: null }).action, 'none');
  assert.equal(decideBoarding({ ...base, kind: 'autre' }).action, 'none');
});

test('décision : lancement dans le même vaisseau (relog compris), tout choix fait dans ce vaisseau reste', () => {
  const base = { kind: 'launch', shipId: 43, role: { primary: 'waypoints', secondary: [] }, installed: true };
  const ici = (kind, at = '2026-11-08T09:00:00Z') => ({ shipId: 43, kind, at });
  assert.equal(decideBoarding({ ...base, mode: null }).action, 'switch', 'aucun mode actif, aucun choix');
  assert.equal(decideBoarding({ ...base, mode: 'combat', choice: ici('menu') }).action, 'none', 'choisi dans ce vaisseau');
  assert.equal(decideBoarding({ ...base, mode: 'combat', choice: null }).action, 'none', 'origine inconnue : on ne touche pas');
  assert.equal(decideBoarding({ ...base, mode: 'combat', choice: { shipId: 26, kind: 'menu' } }).action, 'switch', 'mis dans un autre vaisseau');
  assert.equal(decideBoarding({ ...base, mode: null, choice: ici('annuler') }).why, 'choix fait dans ce vaisseau', 'Annuler tient jusqu’au prochain vrai embarquement');
  assert.equal(decideBoarding({ ...base, mode: null, choice: ici('menu') }).why, 'choix fait dans ce vaisseau', '« Aucun » aussi');
  assert.equal(decideBoarding({ ...base, mode: null, choice: { ...ici('menu'), shipId: null } }).action, 'switch', 'choix fait vaisseau inconnu');
  // Parti de ce vaisseau puis revenu depuis le choix (vu à la relecture) : le choix ne vaut plus
  const apres = Date.parse('2026-11-08T09:30:00Z');
  assert.equal(decideBoarding({ ...base, mode: null, choice: ici('menu'), boardedAt: apres }).action, 'switch');
  assert.equal(decideBoarding({ ...base, mode: 'combat', choice: ici('menu'), boardedAt: apres }).action, 'switch');
  assert.equal(decideBoarding({ ...base, mode: null, choice: ici('menu'), boardedAt: Date.parse('2026-11-08T08:00:00Z') }).action, 'none', 'remonté avant le choix');
});

test('choix qui tient : même vaisseau, pas de vrai embarquement depuis ; sans heure (ancien fichier), il tient', () => {
  const c = { shipId: 43, kind: 'menu', at: '2026-11-08T09:00:00.000Z' };
  assert.equal(choiceHolds(c, 43, null), true);
  assert.equal(choiceHolds(c, 26, null), false);
  assert.equal(choiceHolds(null, 43, null), false);
  assert.equal(choiceHolds(c, 43, Date.parse(c.at) + 1), false);
  assert.equal(choiceHolds(c, 43, Date.parse(c.at)), true, 'même instant : le choix suit l’embarquement');
  assert.equal(choiceHolds({ ...c, at: null }, 43, Date.parse(c.at) + 1), true);
});

test('décision : démarrage du serveur, jeu lancé', () => {
  const base = { kind: 'startup', shipId: 43, role: { primary: 'waypoints', secondary: [] }, installed: true, running: true, mode: null };
  const at = '2026-11-08T09:00:00Z';
  assert.equal(decideBoarding(base).action, 'switch');
  assert.equal(decideBoarding({ ...base, running: false }).why, 'jeu fermé');
  assert.equal(decideBoarding({ ...base, mode: 'combat', choice: { shipId: 26, kind: 'menu', at } }).why, 'mode déjà actif', 'jamais écraser un mode, même mis ailleurs');
  assert.equal(decideBoarding({ ...base, choice: { shipId: 43, kind: 'menu', at } }).action, 'none', '« Aucun » choisi ici');
  assert.equal(decideBoarding({ ...base, choice: { shipId: 43, kind: 'annuler', at } }).action, 'none', 'bascule annulée ici');
  assert.equal(decideBoarding({ ...base, choice: { shipId: 43, kind: 'menu', at } }).action, 'none', 'choix fait avant un relancement du jeu, sans avoir quitté ce vaisseau : il tient, comme au lancement');
  assert.equal(decideBoarding({ ...base, choice: { shipId: 43, kind: 'menu', at }, boardedAt: Date.parse(at) + 60_000 }).action, 'switch', 'remonté à bord depuis');
  assert.equal(decideBoarding({ ...base, choice: { shipId: 26, kind: 'menu', at } }).action, 'switch', 'autre vaisseau');
  assert.equal(decideBoarding({ ...base, away: 'taxi' }).action, 'none', 'en taxi');
  assert.equal(decideBoarding({ ...base, away: 'crew' }).action, 'none', 'en équipage');
  assert.equal(decideBoarding({ ...base, installed: false }).action, 'propose');
});

test('décision : rôle sans fenêtre (Commerce), proposé plutôt que de fermer des fenêtres ouvertes', () => {
  const base = { kind: 'change', shipId: 9, role: { primary: 'routes', secondary: [] }, mode: 'combat', installed: true };
  assert.deepEqual(decideBoarding({ ...base, pages: ['combat'] }), { action: 'propose', mode: 'routes', because: 'fenetres' });
  assert.deepEqual(decideBoarding({ ...base, pages: [] }), { action: 'switch', mode: 'routes' });
  assert.deepEqual(decideBoarding({ ...base, pages: ['glance'] }), { action: 'switch', mode: 'routes' }, 'le Coup d’œil seul reste ouvert');
  assert.deepEqual(decideBoarding({ ...base, role: { primary: 'combat', secondary: [] }, mode: 'waypoints', pages: windowsOf('waypoints') }), { action: 'switch', mode: 'combat' }, 'un mode à fenêtres en ouvre d’autres à la place');
});

test("raison de la proposition, quand l'overlay ne peut rien ouvrir, ou qu'un rôle sans fenêtre fermerait les autres", () => {
  // Sans overlay, « Oui » ne peut pas ouvrir de fenêtre : le texte dit ce qui marche (la page, dans l'app)
  assert.equal(roleProposalReason('Pioche', { disabled: true }), "rôle principal de « Pioche » : l'overlay est coupé, pas de fenêtre par-dessus le jeu ; ouvre sa page dans l'app");
  assert.equal(roleProposalReason(null, { disabled: false }), "rôle principal du vaisseau : l'overlay n'est pas installé, pas de fenêtre par-dessus le jeu ; ouvre sa page dans l'app");
  assert.equal(roleProposalReason('Cargo', { because: 'fenetres', mode: 'routes' }), "rôle principal de « Cargo » : ⇄ Commerce n'a pas de fenêtre en jeu, l'app ne ferme pas d'elle-même celles qui sont ouvertes");
});

// --- Bascule en direct ---

test('relecture de l’historique : jamais de bascule, même en passant par le vaisseau à rôle', () => {
  const b = banc({ roles: PIOCHE, types: TYPES, overlay: { mode: 'combat' } });
  const d = b.replay([EV.loadGame('Federation_Corvette', 26), EV.loadout('federation_corvette', 26), EV.swap('lakonminer', 43), EV.rhinoLoadout()]);
  assert.equal(d.action, 'none', 'démarrage : un mode est actif');
  assert.equal(b.overlay.shows, 0);
  assert.equal(b.sw.current(), null);
  assert.equal(b.sw.currentShip().shipId, 43);
  assert.deepEqual(b.sw.currentShip().role, { primary: 'waypoints', secondary: ['shipmining'] });
});

test('embarquement dans un vaisseau à rôle principal : bascule, fenêtres du mode, Coup d’œil gardé, avis', () => {
  const b = banc({ roles: PIOCHE, types: TYPES, nicknames: { 43: 'Pioche' }, overlay: { mode: 'combat', glance: true, pages: ['combat', 'glance'] } });
  b.replay([EV.loadGame('Federation_Corvette', 26), EV.loadout('federation_corvette', 26)]);
  const d = b.live(EV.swap('lakonminer', 43, { ShipType_Localised: 'Type-11 Prospector' }));
  assert.deepEqual(d, { action: 'switch', mode: 'waypoints' });
  assert.deepEqual(b.overlay.cur, { mode: 'waypoints', glance: true, pages: [...windowsOf('waypoints'), 'glance'] });
  assert.deepEqual(b.overlay.resets, ['waypoints'], 'la session du mode repart, comme à tout changement de mode');
  assert.deepEqual(b.overlay.chosen.kind, 'bascule');
  assert.equal(b.overlay.chosen.shipId, 43);
  const avis = b.sw.current();
  assert.deepEqual({ mode: avis.mode, shipId: avis.shipId, ship: avis.ship }, { mode: 'waypoints', shipId: 43, ship: 'Pioche' });
  assert.equal(avis.until - avis.at, SWITCH_NOTICE_MS);
  assert.ok(b.of('overlay').length >= 1);
  assert.equal(b.of('overlay:switch').at(-1).ship, 'Pioche');
  // Le Loadout qui suit (même vaisseau), l'équipement, le retour du SRV, un rachat : rien de plus
  b.live(EV.rhinoLoadout());
  b.live({ event: 'DockSRV', ID: 44 });
  b.live(EV.rhinoLoadout());
  b.live({ event: 'Died' });
  b.live({ event: 'Resurrect', Option: 'rebuy', Cost: 1, Bankrupt: false });
  b.live(EV.rhinoLoadout());
  assert.equal(b.overlay.shows, 1);
  assert.equal(b.advisor.current(), null, 'pas de proposition tirée de l’équipement : le rôle prime');
});

test('nom de l’avis : nom donné dans l’app, sinon nom en jeu, sinon modèle', () => {
  let b = banc({ roles: PIOCHE, types: TYPES });
  b.replay([EV.loadGame('Federation_Corvette', 26)]);
  b.live(EV.swap('lakonminer', 43, { ShipType_Localised: 'Type-11 Prospector' }));
  assert.equal(b.sw.current().ship, 'Type-11 Prospector');
  b = banc({ roles: PIOCHE, types: TYPES });
  b.replay([EV.loadGame('Federation_Corvette', 26)]);
  b.live(EV.loadout('lakonminer', 43, { ShipName: 'Nom en jeu' }));
  assert.equal(b.sw.current().ship, 'Nom en jeu');
  assert.deepEqual(b.sw.currentShip(), { shipId: 43, type: 'lakonminer', model: 'Lakonminer', name: 'Nom en jeu', nickname: null, title: 'Nom en jeu', role: { primary: 'waypoints', secondary: ['shipmining'] } });
});

test('Annuler : mode et fenêtres d’avant, sans remise à zéro, mode annulé silencieux 30 min, pas de nouvelle bascule avant le prochain embarquement', () => {
  const b = banc({ roles: PIOCHE, types: TYPES, overlay: { mode: 'combat', pages: ['combat'] } });
  b.replay([EV.loadGame('Federation_Corvette', 26), EV.loadout('federation_corvette', 26)]);
  b.live(EV.swap('lakonminer', 43));
  assert.equal(b.overlay.cur.mode, 'waypoints');
  b.overlay.cur.glance = true; // Coup d'œil ouvert entre-temps : il reste
  const etat = b.sw.cancel();
  assert.deepEqual({ mode: etat.mode, glance: etat.glance, pages: etat.pages }, { mode: 'combat', glance: true, pages: ['combat', 'glance'] });
  assert.deepEqual(b.overlay.resets, ['waypoints'], 'Combat retrouvé sans remise à zéro de sa session');
  assert.equal(b.overlay.activity, 'combat');
  assert.equal(b.overlay.chosen.kind, 'annuler');
  assert.equal(b.sw.current(), null);
  assert.equal(b.of('overlay:switch').at(-1), null);
  assert.equal(b.sw.cancel(), null, 'plus rien à annuler');
  // Silence : l'activité du rôle annulé n'est pas proposée pendant 30 min…
  b.live({ event: 'LaunchSRV', SRVType: 'mev_rhino' });
  assert.equal(b.advisor.current(), null);
  // … même vaisseau : pas de nouvelle bascule
  b.live(EV.rhinoLoadout());
  assert.equal(b.overlay.cur.mode, 'combat');
  b.tick(DISMISS_MS + 1000);
  b.live({ event: 'LaunchSRV', SRVType: 'mev_rhino' });
  assert.equal(b.advisor.current().mode, 'waypoints', 'après 30 min, de nouveau proposé (rôle principal : proposition normale)');
  assert.ok(!b.advisor.current().discreet);
  // Prochain embarquement : la bascule revient
  b.live(EV.swap('federation_corvette', 26));
  b.live(EV.swap('lakonminer', 43));
  assert.equal(b.overlay.cur.mode, 'waypoints');
});

test('Annuler sans mode avant : tout se referme', () => {
  const b = banc({ roles: PIOCHE, types: TYPES });
  b.replay([EV.loadGame('Federation_Corvette', 26)]);
  b.live(EV.swap('lakonminer', 43));
  const etat = b.sw.cancel();
  assert.deepEqual({ mode: etat.mode, pages: etat.pages }, { mode: null, pages: [] });
  assert.equal(b.overlay.activity, null, 'activité d’avant remise');
});

test('mode choisi à la main : jamais écrasé dans le même vaisseau ; l’avis disparaît', () => {
  const b = banc({ roles: PIOCHE, types: TYPES });
  b.replay([EV.loadGame('Federation_Corvette', 26)]);
  b.live(EV.swap('lakonminer', 43));
  assert.ok(b.sw.current());
  b.menu('combat');
  assert.equal(b.sw.current(), null, 'changer de mode efface l’avis');
  assert.equal(b.sw.cancel(), null, 'et Annuler ne vaut plus');
  assert.deepEqual(b.overlay.chosen, { shipId: 43, kind: 'menu', at: new Date(b.clock.t).toISOString() }, 'vaisseau, sorte et heure : rien d’autre (la partie ne compte pas)');
  for (const ev of [EV.rhinoLoadout(), { event: 'LaunchSRV', SRVType: 'mev_rhino' }, EV.rhinoLoadout(), EV.shutdown(), EV.loadGame('LakonMiner', 43), EV.rhinoLoadout()]) b.live(ev);
  assert.equal(b.overlay.cur.mode, 'combat', 'même vaisseau, relancé ou non : le choix reste');
  // Le Coup d'œil seul n'est pas un choix de mode
  const avant = b.overlay.chosen;
  b.sw.chooseMode({ mode: 'combat', glance: true, pages: ['combat', 'glance'] });
  assert.deepEqual(b.overlay.chosen, avant);
});

test('lancement du jeu dans le vaisseau à rôle : bascule si aucun mode, ou si le mode a été mis ailleurs', () => {
  let b = banc({ roles: PIOCHE, types: TYPES });
  b.replay([EV.loadGame('LakonMiner', 43), EV.rhinoLoadout(), EV.shutdown()]);
  b.live(EV.loadGame('LakonMiner', 43));
  assert.equal(b.overlay.cur.mode, 'waypoints');
  // Mode mis dans un autre vaisseau, puis échange pendant que l'app était fermée : au lancement, bascule
  b = banc({ roles: PIOCHE, types: TYPES, overlay: { mode: 'combat', choice: { shipId: 26, kind: 'menu' } } });
  b.replay([EV.loadGame('Federation_Corvette', 26), EV.swap('lakonminer', 43), EV.rhinoLoadout(), EV.shutdown()]);
  b.live(EV.loadGame('LakonMiner', 43));
  assert.equal(b.overlay.cur.mode, 'waypoints');
  // Lancé en SRV (le Rhino) : c'est un lancement de ce vaisseau
  b = banc({ roles: PIOCHE, types: TYPES });
  b.replay([EV.loadGame('LakonMiner', 43), EV.rhinoLoadout(), EV.shutdown()]);
  b.live(EV.loadGame('MEV_Rhino', 44), SRV);
  assert.equal(b.overlay.cur.mode, 'waypoints');
});

test('démarrage du serveur, jeu lancé : rôle appliqué seulement si rien n’est actif ni choisi ici', () => {
  // Rien d'actif : bascule
  let b = banc({ roles: PIOCHE, types: TYPES });
  assert.equal(b.replay([EV.loadGame('LakonMiner', 43), EV.rhinoLoadout()]).action, 'switch');
  assert.equal(b.overlay.cur.mode, 'waypoints');
  assert.ok(b.sw.current(), 'avec son avis (Annuler possible)');
  // Un mode actif : jamais écrasé
  b = banc({ roles: PIOCHE, types: TYPES, overlay: { mode: 'combat' } });
  assert.equal(b.replay([EV.loadGame('LakonMiner', 43), EV.rhinoLoadout()]).why, 'mode déjà actif');
  // Jeu fermé (Shutdown), ou muet depuis plus de 10 min (planté)
  b = banc({ roles: PIOCHE, types: TYPES });
  assert.equal(b.replay([EV.loadGame('LakonMiner', 43), EV.rhinoLoadout(), EV.shutdown()]).why, 'jeu fermé');
  b = banc({ roles: PIOCHE, types: TYPES, life: Date.parse('2026-11-08T09:00:00Z') - GAME_SILENT_MS });
  b.tracker.lastAt = null;
  const tr = b.replay([EV.loadGame('LakonMiner', 43), EV.rhinoLoadout()]);
  assert.equal(tr.why, 'jeu fermé', 'dernier signe de vie trop vieux');
  // « Aucun » choisi, ou bascule annulée, dans ce vaisseau sans l'avoir quitté depuis : rien (même après un redémarrage)
  b = banc({ roles: PIOCHE, types: TYPES });
  const lancement = { ...EV.loadGame('LakonMiner', 43), timestamp: '2026-11-08T09:00:00.000Z' };
  b.replay([lancement, EV.rhinoLoadout()]);
  b.sw.cancel();
  assert.equal(b.overlay.cur.mode, null);
  const choix = b.overlay.chosen;
  const b2 = banc({ roles: PIOCHE, types: TYPES, overlay: { choice: choix } });
  b2.sw.replay([lancement, { ...EV.rhinoLoadout(), timestamp: lancement.timestamp }]);
  assert.equal(b2.sw.startup().action, 'none');
});

test('Polyvalent : aucune bascule, tout est proposé normalement', () => {
  const b = banc({ roles: { 43: { primary: 'polyvalent', secondary: [] } }, types: TYPES });
  b.replay([EV.loadGame('Federation_Corvette', 26)]);
  b.live(EV.rhinoLoadout());
  assert.equal(b.overlay.shows, 0);
  b.advisor.set(null); // l'équipement : voir « Polyvalent : l'équipement est proposé… » plus bas
  b.live({ event: 'Bounty' });
  assert.deepEqual(b.advisor.current().mode, 'combat');
  assert.equal(b.advisor.current().discreet, undefined);
});

test('vaisseau sans rôle : comme avant, et « Retenir comme rôle » quand l’équipement propose', () => {
  const b = banc();
  b.replay([EV.loadGame('Federation_Corvette', 26)]);
  b.live(EV.rhinoLoadout());
  const s = b.advisor.current();
  assert.deepEqual({ mode: s.mode, reason: s.reason, shipId: s.shipId, canRemember: s.canRemember }, { mode: 'waypoints', reason: 'vaisseau avec hangar à Rhino', shipId: 43, canRemember: true });
  assert.equal(b.overlay.shows, 0, 'pas de bascule sans rôle');
  // « Retenir » : le rôle est donné, l'offre disparaît
  b.roles.set(43, { primary: 'waypoints', secondary: [] }, { type: 'lakonminer' });
  b.advisor.roleChanged(43);
  assert.equal(b.advisor.current(), null);
  // Une activité, sans rôle : proposition normale, sans « Retenir »
  const c = banc();
  c.replay([EV.loadGame('Federation_Corvette', 26), EV.loadout('federation_corvette', 26)]);
  c.live({ event: 'Bounty' });
  assert.equal(c.advisor.current().canRemember, undefined);
  assert.equal(c.advisor.current().discreet, undefined);
});

test('rôles secondaires : proposés normalement ; activité hors rôle : discrète, sans chasser une proposition normale', () => {
  const b = banc({ roles: { 26: { primary: null, secondary: ['combat'] } }, types: TYPES });
  b.replay([EV.loadGame('Federation_Corvette', 26), EV.loadout('federation_corvette', 26)]);
  b.live({ event: 'CollectCargo', Type: 'occupiedcryopod' });
  assert.deepEqual([b.advisor.current().mode, b.advisor.current().discreet], ['rescue', true], 'hors rôle : discrète');
  b.live({ event: 'Bounty' });
  assert.deepEqual([b.advisor.current().mode, b.advisor.current().discreet], ['combat', undefined], 'dans le rôle : la normale remplace la discrète');
  b.live({ event: 'CollectCargo', Type: 'occupiedcryopod' });
  assert.equal(b.advisor.current().mode, 'combat', 'la discrète ne chasse pas la normale');
  // « Non » fait taire aussi une proposition discrète, 30 min
  b.advisor.dismiss();
  b.live({ event: 'SearchAndRescue' });
  assert.equal(b.advisor.current().mode, 'rescue');
  b.advisor.dismiss();
  b.live({ event: 'SearchAndRescue' });
  assert.equal(b.advisor.current(), null);
  b.tick(DISMISS_MS + 1);
  b.live({ event: 'SearchAndRescue' });
  assert.equal(b.advisor.current().discreet, true);
  // Expiration : discrète ou non, au bout de 15 min, et les fenêtres sont prévenues
  b.tick(EXPIRE_MS + 1);
  assert.equal(b.advisor.current(), null);
  assert.equal(b.of('overlay:suggest').at(-1), null);
});

test('overlay absent ou coupé : la bascule devient une proposition normale qui dit pourquoi', () => {
  for (const [overlay, raison] of [[{ installed: false, disabled: true }, /l'overlay est coupé/], [{ installed: false, disabled: false }, /l'overlay n'est pas installé/]]) {
    const b = banc({ roles: PIOCHE, types: TYPES, nicknames: { 43: 'Pioche' }, overlay });
    b.replay([EV.loadGame('Federation_Corvette', 26)]);
    // « Non » sur une devinette juste avant : la proposition du rôle passe quand même (nouvel embarquement)
    b.advisor.propose({ mode: 'waypoints', reason: 'Rhino sorti' });
    b.advisor.dismiss();
    const d = b.live(EV.rhinoLoadout());
    assert.deepEqual(d, { action: 'propose', mode: 'waypoints', because: 'overlay' });
    const s = b.advisor.current();
    assert.equal(s.source, 'role');
    assert.equal(s.shipId, 43);
    assert.match(s.reason, /^rôle principal de « Pioche » : /);
    assert.match(s.reason, raison);
    assert.equal(s.discreet, undefined);
    assert.equal(b.overlay.shows, 0);
    assert.equal(b.sw.current(), null, 'pas d’avis de bascule : rien n’a basculé');
    // Les signes du même mode ne la remplacent pas ; une activité hors rôle reste discrète et ne la chasse pas
    b.live({ event: 'LaunchSRV', SRVType: 'mev_rhino' });
    b.live({ event: 'Bounty' });
    assert.equal(b.advisor.current().source, 'role');
    // Elle expire comme les autres
    b.tick(EXPIRE_MS + 1);
    assert.equal(b.advisor.current(), null);
  }
});

test('silence de 30 min : il ne bloque pas une bascule (le rôle vient de toi, pas d’une devinette)', () => {
  const b = banc({ roles: PIOCHE, types: TYPES });
  b.replay([EV.loadGame('Federation_Corvette', 26)]);
  b.advisor.propose({ mode: 'waypoints', reason: 'Rhino sorti' });
  b.advisor.dismiss();
  b.live(EV.swap('lakonminer', 43));
  assert.equal(b.overlay.cur.mode, 'waypoints');
});

test('changement de vaisseau : la proposition et l’avis de l’ancien s’effacent', () => {
  const b = banc({ roles: PIOCHE, types: TYPES });
  b.replay([EV.loadGame('LakonMiner', 43), EV.rhinoLoadout()]);
  assert.ok(b.sw.current());
  b.live({ event: 'Bounty' });
  assert.equal(b.advisor.current().mode, 'combat');
  b.live(EV.swap('federation_corvette', 26));
  assert.equal(b.sw.current(), null);
  assert.equal(b.advisor.current(), null);
  assert.equal(b.overlay.cur.mode, 'waypoints', 'le vaisseau sans rôle ne change rien au mode');
});

test('avis : s’efface de lui-même au bout de SWITCH_NOTICE_MS, le mode reste ; ou fermé à la main', () => {
  const b = banc({ roles: PIOCHE, types: TYPES });
  b.replay([EV.loadGame('Federation_Corvette', 26)]);
  b.live(EV.swap('lakonminer', 43));
  b.tick(SWITCH_NOTICE_MS - 1);
  assert.ok(b.sw.current());
  b.tick(1);
  assert.equal(b.sw.current(), null);
  assert.equal(b.of('overlay:switch').at(-1), null);
  assert.equal(b.sw.cancel(), null);
  assert.equal(b.overlay.cur.mode, 'waypoints');
  b.live(EV.swap('federation_corvette', 26));
  assert.equal(b.overlay.cur.mode, 'waypoints', 'vaisseau sans rôle : le mode reste');
  b.live(EV.swap('lakonminer', 43));
  assert.equal(b.sw.current(), null, 'déjà dans le mode du rôle : rien à annoncer');
  b.menu('combat');
  b.live(EV.swap('federation_corvette', 26));
  b.live(EV.swap('lakonminer', 43));
  assert.ok(b.sw.current());
  b.sw.clearNotice();
  assert.equal(b.sw.current(), null);
  assert.equal(b.overlay.cur.mode, 'waypoints');
});

test('taxi, équipage d’un autre CMDR, chasseur : jamais de bascule', () => {
  const b = banc({ roles: { 12: { primary: 'combat', secondary: [] }, 5: { primary: 'combat', secondary: [] } }, types: { 12: 'adder', 5: 'cutter' } });
  b.replay([EV.loadGame('LakonMiner', 43), EV.rhinoLoadout()]);
  b.live({ event: 'Disembark', SRV: false, Taxi: false, Multicrew: false, ID: 43 });
  b.live({ event: 'Embark', SRV: false, Taxi: true, Multicrew: false, ID: 12 });
  b.live(EV.loadout('adder', 12));
  b.live({ event: 'Disembark', SRV: false, Taxi: true, Multicrew: false, ID: 12 });
  b.live({ event: 'JoinACrew', Captain: 'Autre' });
  b.live(EV.loadout('cutter', 5));
  b.live({ event: 'QuitACrew', Captain: 'Autre' });
  assert.equal(b.overlay.shows, 0);
  assert.equal(b.sw.currentShip().shipId, 43);
});

test('vaisseau vendu : son rôle s’efface (en direct et à la relecture) et ne passe pas au vaisseau qui reprend son numéro', () => {
  // En direct : Panther n° 30 vendu à l'achat d'un Mandalay, qui reçoit le n° 30
  const b = banc({ roles: { 30: { primary: 'rescue', secondary: [] } }, types: { 30: 'panthermkii' } });
  b.replay([EV.loadGame('PantherMkII', 30), EV.loadout('panthermkii', 30)]);
  assert.equal(b.overlay.cur.mode, 'rescue', 'démarrage, jeu lancé, aucun mode : rôle appliqué');
  const avant = b.overlay.shows;
  b.live({ event: 'ShipyardBuy', ShipType: 'mandalay', SellOldShip: 'PantherMkII', SellShipID: 30 });
  assert.equal(b.roles.get(30), null);
  assert.deepEqual(b.of('ships:roles').at(-1), { ships: {} });
  b.menu(null);
  b.live({ event: 'ShipyardNew', ShipType: 'mandalay', NewShipID: 30 });
  b.live(EV.loadout('mandalay', 30));
  assert.equal(b.overlay.shows, avant + 1, 'le Mandalay n’a pas hérité du rôle (seul « Aucun » a changé le mode)');
  assert.equal(b.overlay.cur.mode, null);
  // À la relecture : vente faite pendant que l'app était fermée, après le choix du rôle
  const c = banc({ roles: { 37: { primary: 'combat', secondary: [] } }, types: { 37: 'python_nx' } });
  c.sw.replay([
    { event: 'LoadGame', Ship: 'Python_NX', ShipID: 37, timestamp: '2026-11-08T11:00:00Z' },
    { event: 'ShipyardBuy', ShipType: 'krait_mkii', SellShipID: 37, timestamp: '2026-11-08T11:10:00Z' },
    { event: 'ShipyardNew', ShipType: 'krait_mkii', NewShipID: 37, timestamp: '2026-11-08T11:10:01Z' },
  ]);
  assert.equal(c.roles.get(37), null);
  assert.ok(c.logs.some((l) => /Rôle du vaisseau 37 effacé : vendu/.test(l)));
  // Rôle donné à un ancien modèle de ce numéro (vente jamais vue) : ignoré à l'embarquement, puis effacé
  const d = banc({ roles: { 30: { primary: 'rescue', secondary: [] } }, types: { 30: 'panthermkii' } });
  d.replay([EV.loadGame('Federation_Corvette', 26)]);
  assert.equal(d.overlay.shows, 0);
  d.live(EV.loadout('mandalay', 30));
  assert.equal(d.overlay.shows, 0);
  assert.equal(d.roles.get(30), null);
  assert.ok(d.logs.some((l) => /maintenant un/.test(l)));
});

// --- Constats de la revue (8 nov.) : chaque test échouait avant sa correction ---

const PANTHER = { 31: { primary: 'waypoints', secondary: [] } };
// Formes réelles du 30 oct. (journaux de référence, lecture seule) : jeu lancé à pied près du Rhino, sorties en SRV, retour
const A_PIED = () => EV.loadGame('ExplorationSuit_Class1', 4293000002, { Ship_Localised: 'Combinaison Artemis' });
const SRV_EMBARK = (ID = 40) => ({ event: 'Embark', SRV: true, Taxi: false, Multicrew: false, ID, OnStation: false, OnPlanet: true });
const SRV_DISEMBARK = (ID = 40) => ({ event: 'Disembark', SRV: true, Taxi: false, Multicrew: false, ID, OnStation: false, OnPlanet: true });
const SORTIE_SRV = () => [SRV_EMBARK(), SRV_DISEMBARK(), SRV_EMBARK(), { event: 'DockSRV', SRVType: 'mev_rhino', ID: 40 }, EV.loadout('panthermkii', 31)];

test('lancé à pied (30 oct.) : « Aucun » choisi avant de remonter, ni la sortie en SRV ni son retour ne rebasculent', () => {
  const b = banc({ roles: PANTHER, types: TYPES, overlay: { mode: 'combat', pages: ['combat'] } });
  b.replay([EV.loadGame('PantherMkII', 31), EV.loadout('panthermkii', 31), EV.shutdown()]);
  b.live(A_PIED());
  b.menu(null); // « Aucun », dans ce vaisseau, pendant cette partie
  for (const ev of SORTIE_SRV()) b.live(ev, SRV);
  assert.equal(b.overlay.cur.mode, null, 'le retour du SRV n’écrase pas « Aucun »');
  assert.equal(b.overlay.shows, 1, 'seul le menu a changé les fenêtres');
  // Sans choix : la bascule a lieu dès le premier signe qu'on est avec son vaisseau (à bord du SRV), pas au retour
  const c = banc({ roles: PANTHER, types: TYPES });
  c.replay([EV.loadGame('PantherMkII', 31), EV.loadout('panthermkii', 31), EV.shutdown()]);
  c.live(A_PIED());
  assert.deepEqual(c.live(SRV_EMBARK(), SRV), { action: 'switch', mode: 'waypoints' });
  for (const ev of SORTIE_SRV()) c.live(ev, SRV);
  assert.equal(c.overlay.shows, 1, 'une seule bascule');
});

test('démarrage pendant une partie lancée à pied : Annuler tient, le retour du SRV ne rebascule pas', () => {
  const b = banc({ roles: PANTHER, types: TYPES });
  assert.equal(b.replay([EV.loadGame('PantherMkII', 31), EV.loadout('panthermkii', 31), EV.shutdown(), A_PIED()]).action, 'switch');
  assert.equal(b.tracker.pendingLaunch, false, 'la décision du démarrage tient lieu de celle du lancement');
  assert.ok(b.sw.cancel());
  for (const ev of SORTIE_SRV()) b.live(ev, SRV);
  assert.equal(b.overlay.cur.mode, null);
  assert.equal(b.overlay.shows, 1);
});

test('jeu fermé : « Aucun » choisi dans ce vaisseau, puis le jeu lancé dans le même vaisseau : rien ne s’ouvre', () => {
  const b = banc({ roles: PANTHER, types: TYPES, overlay: { mode: 'combat', pages: ['combat'] } });
  b.replay([EV.loadGame('PantherMkII', 31), EV.loadout('panthermkii', 31), EV.shutdown()]);
  b.menu(null);
  assert.equal(b.live(EV.loadGame('PantherMkII', 31)).action, 'none');
  assert.equal(b.overlay.cur.mode, null);
});

test('relog dans le même vaisseau après Annuler ou « Aucun » : pas de nouvelle bascule ; overlay coupé, « Non » tient', () => {
  const COBRA = { 5: { primary: 'combat', secondary: [] } };
  const T = { 5: 'cutter' };
  // Annuler, puis passage Ouvert → Solo (nouveau LoadGame, même vaisseau, sans Shutdown)
  let b = banc({ roles: COBRA, types: T });
  b.replay([EV.loadGame('Cutter', 5), EV.loadout('cutter', 5), EV.shutdown()]);
  assert.equal(b.live(EV.loadGame('Cutter', 5, { GameMode: 'Open' })).action, 'switch');
  b.sw.cancel();
  assert.equal(b.live(EV.loadGame('Cutter', 5, { GameMode: 'Solo' })).action, 'none');
  assert.equal(b.overlay.cur.mode, null);
  // Relancé à pied, puis remonté à bord : toujours rien
  b.live(A_PIED());
  b.live({ event: 'Embark', SRV: false, Taxi: false, Multicrew: false, ID: 5, OnStation: true });
  assert.equal(b.overlay.shows, 1);
  // « Aucun » au menu, puis relog
  b = banc({ roles: COBRA, types: T });
  b.replay([EV.loadGame('Cutter', 5), EV.loadout('cutter', 5), EV.shutdown()]);
  b.live(EV.loadGame('Cutter', 5));
  b.menu(null);
  assert.equal(b.live(EV.loadGame('Cutter', 5)).action, 'none');
  assert.equal(b.overlay.cur.mode, null);
  // Overlay coupé : la proposition du rôle, « Non », relog une minute après : elle ne revient pas de force
  b = banc({ roles: COBRA, types: T, overlay: { installed: false, disabled: true } });
  b.replay([EV.loadGame('Cutter', 5), EV.loadout('cutter', 5), EV.shutdown()]);
  assert.equal(b.live(EV.loadGame('Cutter', 5)).action, 'propose');
  b.advisor.dismiss();
  b.tick(60_000);
  b.live(EV.loadGame('Cutter', 5));
  assert.equal(b.advisor.current(), null, '« Non » tient 30 min, même au relog');
  // Un vrai embarquement, lui, la refait passer (rôle choisi par toi)
  b.live(EV.swap('federation_corvette', 26));
  b.live(EV.swap('cutter', 5));
  assert.equal(b.advisor.current()?.source, 'role');
});

test('choix fait dans ce vaisseau, puis départ et retour pendant que l’app était fermée : le choix ne vaut plus', () => {
  const choix = { shipId: 43, kind: 'menu', at: '2026-11-08T08:30:00.000Z' };
  // « Aucun » dans le 43 ; app fermée ; échange vers le 26 puis retour au 43 (vus à la relecture) ; app relancée
  const b = banc({ roles: PIOCHE, types: TYPES, overlay: { mode: null, choice: choix } });
  assert.equal(b.replay([EV.loadGame('LakonMiner', 43), EV.swap('federation_corvette', 26), EV.swap('lakonminer', 43), EV.rhinoLoadout()]).action, 'switch');
  // Même choix, sans départ du 43 depuis : il tient
  const c = banc({ roles: PIOCHE, types: TYPES, overlay: { mode: null, choice: choix } });
  assert.equal(c.replay([EV.loadGame('LakonMiner', 43), EV.rhinoLoadout()]).action, 'none');
});

test('démarrage du serveur et lancement : la bascule ne remet pas à zéro la session déjà en cours', () => {
  // Démarrage en plein jeu, aucun mode actif (« Aucun » après le Combat), rôle principal Minage vaisseau
  const b = banc({ roles: { 26: { primary: 'shipmining', secondary: [] } }, types: TYPES, overlay: { mode: null, activity: 'combat' } });
  assert.equal(b.replay([EV.loadGame('Federation_Corvette', 26), EV.loadout('federation_corvette', 26)]).action, 'switch');
  assert.deepEqual(b.overlay.resets, [], 'l’heure de minage relue depuis le LoadGame reste');
  assert.equal(b.overlay.activity, 'shipmining');
  b.sw.cancel();
  assert.equal(b.overlay.activity, 'combat', 'Annuler remet l’activité d’avant');
  // Lancement du jeu dans le même vaisseau : le LoadGame ouvre déjà une nouvelle session
  const c = banc({ roles: { 26: { primary: 'shipmining', secondary: [] }, ...PIOCHE }, types: TYPES, overlay: { activity: 'combat' } });
  c.replay([EV.loadGame('Federation_Corvette', 26), EV.loadout('federation_corvette', 26), EV.shutdown()]);
  c.live(EV.loadGame('Federation_Corvette', 26));
  assert.equal(c.overlay.cur.mode, 'shipmining');
  assert.deepEqual(c.overlay.resets, []);
  // Changement de vaisseau : nouvelle sortie, la session du mode ouvert repart (inchangé)
  c.live(EV.swap('lakonminer', 43));
  c.live(EV.swap('federation_corvette', 26));
  assert.deepEqual(c.overlay.resets, ['waypoints', 'shipmining']);
});

test('Polyvalent : l’équipement est proposé comme sans rôle (sans « Retenir »)', () => {
  const b = banc({ roles: { 43: { primary: 'polyvalent', secondary: [] } }, types: TYPES });
  b.replay([EV.loadGame('Federation_Corvette', 26)]);
  b.live(EV.rhinoLoadout());
  const s = b.advisor.current();
  assert.deepEqual({ mode: s?.mode, reason: s?.reason, discreet: s?.discreet, canRemember: s?.canRemember }, { mode: 'waypoints', reason: 'vaisseau avec hangar à Rhino', discreet: undefined, canRemember: undefined });
  assert.equal(b.overlay.shows, 0, 'aucune bascule');
});

test('rôle principal sans fenêtre (Commerce) : jamais de fenêtres fermées sans avis', () => {
  const CARGO = { 9: { primary: 'routes', secondary: [] } };
  const T = { 9: 'type9' };
  // Combat ouvert par-dessus le jeu : la bascule fermerait son HUD sans rien montrer à la place : proposition
  let b = banc({ roles: CARGO, types: T, nicknames: { 9: 'Cargo' }, overlay: { mode: 'combat', pages: ['combat'] } });
  b.replay([EV.loadGame('Krait_MkII', 3)]);
  const d = b.live(EV.swap('type9', 9));
  assert.equal(d.action, 'propose');
  assert.equal(b.overlay.shows, 0);
  assert.deepEqual(b.overlay.cur.pages, ['combat'], 'le HUD de Combat reste');
  const s = b.advisor.current();
  assert.equal(s.source, 'role');
  assert.equal(s.reason, "rôle principal de « Cargo » : ⇄ Commerce n'a pas de fenêtre en jeu, l'app ne ferme pas d'elle-même celles qui sont ouvertes");
  // Rien d'ouvert, ou le Coup d'œil seul : rien ne se ferme, la bascule a lieu (avis dans l'app et le Coup d'œil)
  b = banc({ roles: CARGO, types: T, overlay: { mode: null, glance: true, pages: ['glance'] } });
  b.replay([EV.loadGame('Krait_MkII', 3)]);
  assert.equal(b.live(EV.swap('type9', 9)).action, 'switch');
  assert.deepEqual(b.overlay.cur, { mode: 'routes', glance: true, pages: ['glance'] });
  assert.equal(b.sw.current().mode, 'routes');
});

test('démarrage du serveur en taxi ou en équipage : rien, la bascule attend ton retour à bord', () => {
  // LoadGame en taxi (documentation du journal)
  let b = banc({ roles: PANTHER, types: TYPES });
  const d = b.replay([EV.loadGame('PantherMkII', 31), EV.loadout('panthermkii', 31), EV.shutdown(), EV.loadGame('adder_taxi', 99), EV.loadout('adder_taxi', 99)]);
  assert.equal(d.action, 'none');
  assert.equal(b.overlay.shows, 0);
  b.live({ event: 'Disembark', SRV: false, Taxi: true, Multicrew: false, ID: 99 });
  assert.equal(b.live({ event: 'Embark', SRV: false, Taxi: false, Multicrew: false, ID: 31 }).action, 'switch', 'de retour à bord');
  // Taxi pris après le lancement dans ton vaisseau
  b = banc({ roles: PANTHER, types: TYPES });
  assert.equal(b.replay([EV.loadGame('PantherMkII', 31), EV.loadout('panthermkii', 31), { event: 'Disembark', SRV: false, Taxi: false, Multicrew: false, ID: 31 }, { event: 'Embark', SRV: false, Taxi: true, Multicrew: false, ID: 12 }]).action, 'none');
  b.live({ event: 'Disembark', SRV: false, Taxi: true, Multicrew: false, ID: 12 });
  assert.equal(b.live({ event: 'Embark', SRV: false, Taxi: false, Multicrew: false, ID: 31 }).action, 'switch');
  // Équipage d'un autre CMDR
  b = banc({ roles: PANTHER, types: TYPES });
  assert.equal(b.replay([EV.loadGame('PantherMkII', 31), EV.loadout('panthermkii', 31), { event: 'JoinACrew', Captain: 'Autre' }]).action, 'none');
  assert.equal(b.overlay.shows, 0);
  b.live({ event: 'QuitACrew', Captain: 'Autre' });
  assert.equal(b.live(EV.loadout('panthermkii', 31)).action, 'switch');
  // Overlay absent, en équipage : pas de proposition non plus
  b = banc({ roles: PANTHER, types: TYPES, overlay: { installed: false } });
  b.replay([EV.loadGame('PantherMkII', 31), EV.loadout('panthermkii', 31), { event: 'JoinACrew', Captain: 'Autre' }]);
  assert.equal(b.advisor.current(), null);
});

test('Loadout d’un vaisseau qui n’est pas le tien (équipage, taxi) : ni proposition tirée de son équipement, ni « Retenir »', () => {
  const crew = { event: 'JoinACrew', Captain: 'Autre' };
  for (const entree of [[crew], [crew, { event: 'Embark', SRV: false, Taxi: false, Multicrew: true, ID: 12 }], [{ event: 'Embark', SRV: false, Taxi: true, Multicrew: false, ID: 12 }]]) {
    const b = banc();
    b.replay([EV.loadGame('Python', 31), EV.loadout('python', 31)]);
    for (const ev of entree) b.live(ev);
    b.live({ event: 'Loadout', Ship: 'lakonminer', ShipID: 12, ShipName: '', Modules: [{ Item: 'int_buggybay_size6_class2_mkiilargebuggybay' }, { Item: 'hpt_mininglaser_fixed_small' }] });
    assert.equal(b.tracker.ship().shipId, 31);
    assert.equal(b.advisor.current(), null, JSON.stringify(entree));
  }
  // De retour dans ton vaisseau : son équipement propose de nouveau, pour lui
  const c = banc();
  c.replay([EV.loadGame('Python', 31), EV.loadout('python', 31), crew, { event: 'QuitACrew', Captain: 'Autre' }]);
  c.live(EV.loadout('python', 31, { Modules: [{ Item: 'int_largebuggybay_size6_class3_free' }] }));
  assert.deepEqual([c.advisor.current()?.shipId, c.advisor.current()?.canRemember], [31, true]);
});

// --- Constats de la contre-revue (8 nov.) : chaque test échouait avant sa correction ---

const CUTTER = { 5: { primary: 'combat', secondary: [] } };
const RHINOS = { 43: { primary: 'waypoints', secondary: [] }, 31: { primary: 'waypoints', secondary: [] } };
const T5 = { ...TYPES, 5: 'cutter' };
/** Minage Rhino choisi au menu dans le Type-11 n° 43, la veille au soir. */
const CHOIX_43 = { shipId: 43, kind: 'menu', at: '2026-11-07T19:05:00.000Z' };
const RHINO_OUVERT = { mode: 'waypoints', pages: windowsOf('waypoints'), choice: CHOIX_43 };

test('décision : « Non » récent au rôle principal : il tient au lancement et au démarrage, pas à un vrai embarquement', () => {
  const base = { shipId: 5, role: CUTTER[5], mode: 'waypoints', installed: true, choice: CHOIX_43, silenced: true };
  assert.deepEqual(decideBoarding({ ...base, kind: 'launch' }), { action: 'none', why: '« Non » récent' });
  assert.deepEqual(decideBoarding({ ...base, kind: 'launch', installed: false }), { action: 'none', why: '« Non » récent' }, 'overlay coupé : même règle');
  assert.deepEqual(decideBoarding({ ...base, kind: 'startup', running: true, mode: null }), { action: 'none', why: '« Non » récent' });
  assert.deepEqual(decideBoarding({ ...base, kind: 'change' }), { action: 'switch', mode: 'combat' }, 'un vrai embarquement passe outre');
  assert.deepEqual(decideBoarding({ ...base, kind: 'launch', silenced: false }), { action: 'switch', mode: 'combat' });
});

test('relog après « Non », overlay présent : pas de bascule, comme overlay coupé ; un vrai embarquement passe outre', () => {
  // Minage Rhino choisi dans le 43, puis passage dans le Cutter n° 5 (rôle principal Combat) : au démarrage, rien ne change
  let b = banc({ roles: CUTTER, types: T5, overlay: RHINO_OUVERT });
  assert.equal(b.replay([EV.loadGame('LakonMiner', 43), EV.rhinoLoadout(), EV.swap('cutter', 5), EV.loadout('cutter', 5)]).why, 'mode déjà actif');
  b.live({ event: 'Bounty' });
  assert.equal(b.advisor.current()?.mode, 'combat');
  b.advisor.dismiss(); // « Non »
  b.tick(60_000);
  assert.deepEqual(b.live(EV.loadGame('Cutter', 5, { GameMode: 'Solo' })), { action: 'none', why: '« Non » récent' });
  assert.equal(b.overlay.cur.mode, 'waypoints');
  assert.deepEqual(b.overlay.cur.pages, windowsOf('waypoints'), 'les fenêtres du Rhino restent');
  assert.equal(b.overlay.shows, 0);
  // Vrai changement de vaisseau : la bascule passe outre (le rôle vient de toi, pas d'une devinette)
  b.live(EV.swap('federation_corvette', 26));
  assert.deepEqual(b.live(EV.swap('cutter', 5)), { action: 'switch', mode: 'combat' });
  // Silence passé : le relog bascule de nouveau (le choix a été fait dans un autre vaisseau)
  b = banc({ roles: CUTTER, types: T5, overlay: RHINO_OUVERT });
  b.replay([EV.loadGame('LakonMiner', 43), EV.rhinoLoadout(), EV.swap('cutter', 5), EV.loadout('cutter', 5)]);
  b.live({ event: 'Bounty' });
  b.advisor.dismiss();
  b.tick(DISMISS_MS + 1000);
  assert.deepEqual(b.live(EV.loadGame('Cutter', 5)), { action: 'switch', mode: 'combat' });
});

test('décision : déjà dans le mode du rôle, ses fenêtres sont redemandées telles quelles ; fermées par toi, seul un vrai embarquement les rouvre', () => {
  const base = { shipId: 31, role: RHINOS[31], mode: 'waypoints', installed: true };
  const ouvertes = [...windowsOf('waypoints'), 'glance'];
  for (const kind of ['change', 'launch']) assert.deepEqual(decideBoarding({ ...base, kind, pages: ouvertes }), { action: 'reshow', mode: 'waypoints' }, kind);
  assert.deepEqual(decideBoarding({ ...base, kind: 'startup', running: true, pages: ouvertes }), { action: 'reshow', mode: 'waypoints' });
  assert.equal(decideBoarding({ ...base, kind: 'startup', running: false, pages: ouvertes }).why, 'jeu fermé');
  assert.equal(decideBoarding({ ...base, kind: 'startup', running: true, away: 'crew', pages: ouvertes }).action, 'none');
  assert.equal(decideBoarding({ ...base, kind: 'change', pages: ouvertes, installed: false }).why, 'déjà dans ce mode');
  // Fenêtres fermées par toi (Alt+Maj+Q) : un vrai embarquement les rouvre (avec l'avis et Annuler) ; un lancement, non
  assert.deepEqual(decideBoarding({ ...base, kind: 'change', pages: ['glance'] }), { action: 'switch', mode: 'waypoints' });
  assert.equal(decideBoarding({ ...base, kind: 'launch', pages: [] }).action, 'none');
  assert.equal(decideBoarding({ ...base, kind: 'startup', running: true, pages: [] }).action, 'none');
  // Mode sans fenêtre (Commerce) : rien à redemander
  assert.equal(decideBoarding({ ...base, role: { primary: 'routes', secondary: [] }, mode: 'routes', kind: 'change', pages: ['glance'] }).why, 'déjà dans ce mode');
});

test('déjà dans le mode du rôle (overlay arrêté sans que le serveur le sache : PC redémarré) : fenêtres redemandées, sans avis, sans choix', () => {
  const b = banc({ roles: RHINOS, types: TYPES, overlay: { ...RHINO_OUVERT, glance: true, pages: [...windowsOf('waypoints'), 'glance'] } });
  // Démarrage, jeu lancé dans le 43
  assert.deepEqual(b.replay([EV.loadGame('LakonMiner', 43), EV.rhinoLoadout()]), { action: 'reshow', mode: 'waypoints' });
  assert.equal(b.overlay.shows, 1);
  // Échange au chantier vers l'autre porte-Rhino, puis relog
  assert.deepEqual(b.live(EV.swap('panthermkii', 31)), { action: 'reshow', mode: 'waypoints' });
  b.live(EV.loadout('panthermkii', 31));
  assert.deepEqual(b.live(EV.loadGame('PantherMkII', 31)), { action: 'reshow', mode: 'waypoints' });
  assert.equal(b.overlay.shows, 3);
  assert.deepEqual(b.overlay.cur, { mode: 'waypoints', glance: true, pages: [...windowsOf('waypoints'), 'glance'] });
  assert.deepEqual(b.overlay.chosen, CHOIX_43, 'aucun choix noté');
  assert.deepEqual(b.overlay.resets, [], 'aucune session remise à zéro');
  assert.equal(b.overlay.activity, 'waypoints');
  assert.equal(b.sw.current(), null, 'aucun avis : rien n’a changé');
  assert.equal(b.of('overlay:switch').length, 0);
});

test('overlay quitté par le joueur (Alt+Maj+Q) : le serveur ne croit plus ses fenêtres ouvertes', () => {
  // Combat choisi, puis Alt+Maj+Q, puis échange vers le Type-11 (rôle Minage Rhino)
  let b = banc({ roles: PIOCHE, types: TYPES });
  b.replay([EV.loadGame('Federation_Corvette', 26), EV.loadout('federation_corvette', 26)]);
  b.menu('combat');
  const etat = b.sw.overlayClosed();
  assert.deepEqual({ mode: etat.mode, glance: etat.glance, pages: etat.pages }, { mode: 'combat', glance: false, pages: [] }, 'le mode reste noté, plus aucune fenêtre');
  assert.deepEqual(b.of('overlay').at(-1).pages, [], 'le menu le sait');
  assert.deepEqual([b.overlay.chosen.kind, b.overlay.chosen.shipId], ['fermeture', 26]);
  assert.equal(b.live(EV.swap('lakonminer', 43)).action, 'switch', 'un vrai embarquement rouvre l’overlay avec les fenêtres du rôle');
  assert.deepEqual(b.overlay.cur.pages, windowsOf('waypoints'));
  const annule = b.sw.cancel();
  assert.deepEqual({ mode: annule.mode, glance: annule.glance, pages: annule.pages }, { mode: 'combat', glance: false, pages: [] }, 'Annuler ne rouvre pas le HUD fermé par toi');
  // Rôle sans fenêtre (Commerce) : rien n'est ouvert, rien ne se ferme : bascule, pas de fausse raison
  b = banc({ roles: { 9: { primary: 'routes', secondary: [] } }, types: { 9: 'type9' } });
  b.replay([EV.loadGame('Krait_MkII', 3)]);
  b.menu('combat');
  b.sw.overlayClosed();
  assert.deepEqual(b.live(EV.swap('type9', 9)), { action: 'switch', mode: 'routes' });
  // Fermé dans le Cutter (rôle Combat) alors que le Minage Rhino avait été choisi dans le 43 : le relog n'y rouvre rien
  b = banc({ roles: CUTTER, types: T5, overlay: RHINO_OUVERT });
  b.replay([EV.loadGame('LakonMiner', 43), EV.rhinoLoadout(), EV.swap('cutter', 5), EV.loadout('cutter', 5)]);
  b.sw.overlayClosed();
  assert.deepEqual(b.live(EV.loadGame('Cutter', 5)), { action: 'none', why: 'choix fait dans ce vaisseau' });
  assert.equal(b.overlay.shows, 0);
  // Fermé juste après une bascule : Annuler remet le mode d'avant, sans rouvrir de fenêtre
  b = banc({ roles: PIOCHE, types: TYPES });
  b.replay([EV.loadGame('Federation_Corvette', 26)]);
  b.menu('combat');
  b.live(EV.swap('lakonminer', 43));
  b.sw.overlayClosed();
  const r = b.sw.cancel();
  assert.deepEqual({ mode: r.mode, pages: r.pages }, { mode: 'combat', pages: [] });
});

test('fenêtres du rôle fermées par toi, puis échange vers un vaisseau du même rôle : elles se rouvrent, avec l’avis et Annuler', () => {
  const b = banc({ roles: RHINOS, types: TYPES, overlay: RHINO_OUVERT });
  b.replay([EV.loadGame('LakonMiner', 43), EV.rhinoLoadout()]);
  b.sw.overlayClosed();
  assert.equal(b.live(EV.loadGame('LakonMiner', 43)).action, 'none', 'relog : rien ne se rouvre');
  const shows = b.overlay.shows;
  assert.deepEqual(b.live(EV.swap('panthermkii', 31)), { action: 'switch', mode: 'waypoints' });
  assert.equal(b.overlay.shows, shows + 1);
  assert.deepEqual(b.overlay.cur.pages, windowsOf('waypoints'));
  assert.deepEqual(b.overlay.resets, [], 'même mode : sa session continue');
  assert.equal(b.sw.current().mode, 'waypoints');
  assert.deepEqual(b.sw.cancel().pages, [], 'Annuler les referme');
  assert.equal(b.overlay.cur.mode, 'waypoints');
});

test('changements de vaisseau rapprochés (29 oct. : 46 s) : Annuler remonte à l’état d’avant la série', () => {
  const ROLES = { 9: { primary: 'shipmining', secondary: [] }, 26: { primary: 'combat', secondary: [] } };
  const T = { 9: 'anaconda', 26: 'federation_corvette', 31: 'panthermkii' };
  const serie = (b, entre) => {
    b.replay([EV.loadGame('PantherMkII', 31), EV.loadout('panthermkii', 31)]);
    b.menu('waypoints'); // Minage Rhino choisi à la main
    assert.equal(b.live(EV.swap('anaconda', 9, { StoreShipID: 31 })).action, 'switch');
    b.tick(entre);
  };
  let b = banc({ roles: ROLES, types: T });
  serie(b, 45_000);
  assert.equal(b.live(EV.swap('federation_corvette', 26, { StoreShipID: 9 })).action, 'switch');
  const etat = b.sw.cancel();
  assert.deepEqual({ mode: etat.mode, pages: etat.pages }, { mode: 'waypoints', pages: windowsOf('waypoints') }, 'le Minage Rhino choisi à la main');
  assert.equal(b.overlay.activity, 'waypoints');
  assert.deepEqual([b.overlay.chosen.kind, b.overlay.chosen.shipId], ['annuler', 26]);
  // Avis de la première bascule expiré : Annuler ne défait que la dernière
  b = banc({ roles: ROLES, types: T });
  serie(b, SWITCH_NOTICE_MS);
  b.live(EV.swap('federation_corvette', 26, { StoreShipID: 9 }));
  assert.equal(b.sw.cancel().mode, 'shipmining');
  // Passage par un vaisseau sans rôle (le mode y reste, l'avis s'efface) : la série s'arrête là
  b = banc({ roles: ROLES, types: T });
  serie(b, 5_000);
  b.live(EV.swap('python', 50, { StoreShipID: 9 }));
  b.live(EV.swap('federation_corvette', 26, { StoreShipID: 50 }));
  assert.equal(b.sw.cancel().mode, 'shipmining');
  // Mode changé à la main entre les deux : c'est lui que Annuler remet
  b = banc({ roles: ROLES, types: T });
  serie(b, 5_000);
  b.menu('rescue');
  b.live(EV.swap('federation_corvette', 26, { StoreShipID: 9 }));
  assert.equal(b.sw.cancel().mode, 'rescue');
});

test('avis de bascule : la minuterie l’efface d’elle-même dans toutes les fenêtres, sans qu’une page le redemande', () => {
  const timers = faussesMinuteries();
  const b = banc({ roles: PIOCHE, types: TYPES, timers });
  b.replay([EV.loadGame('Federation_Corvette', 26)]);
  b.live(EV.swap('lakonminer', 43));
  const [minuterie] = timers.armed(SWITCH_NOTICE_MS + 1000);
  assert.ok(minuterie, 'minuterie armée à la bascule');
  const avant = b.of('overlay:switch').length;
  b.tick(SWITCH_NOTICE_MS + 1000);
  minuterie.fn(); // seule la minuterie agit : ni current(), ni cancel()
  assert.equal(b.of('overlay:switch').length, avant + 1, 'diffusé par la minuterie');
  assert.equal(b.of('overlay:switch').at(-1), null);
  assert.equal(b.sw.notice, null);
  // Nouvelles bascules et Annuler : une seule minuterie reste armée
  b.menu('combat');
  b.live(EV.swap('federation_corvette', 26));
  b.live(EV.swap('lakonminer', 43));
  b.sw.cancel();
  b.live(EV.swap('federation_corvette', 26));
  b.live(EV.swap('lakonminer', 43));
  assert.equal(timers.armed(SWITCH_NOTICE_MS + 1000).length, 1);
});

test('vaisseau neuf sous le numéro de l’ancien vendu (Panther n° 30 → Mandalay n° 30) : un choix fait dans l’ancien ne bloque pas la bascule', () => {
  const b = banc();
  b.replay([EV.loadGame('PantherMkII', 30), EV.loadout('panthermkii', 30)]);
  b.menu('combat'); // dans le Panther
  b.live({ event: 'ShipyardBuy', ShipType: 'mandalay', SellOldShip: 'PantherMkII', SellShipID: 30, SellPrice: 1 });
  b.live({ event: 'ShipyardNew', ShipType: 'mandalay', NewShipID: 30 });
  b.live(EV.loadout('mandalay', 30));
  b.roles.set(30, { primary: 'waypoints', secondary: [] }, { type: 'mandalay' });
  b.live(EV.shutdown());
  assert.deepEqual(b.live(EV.loadGame('Mandalay', 30)), { action: 'switch', mode: 'waypoints' });
});

// --- Constats de la revue du 9 nov. : chaque test échouait avant sa correction ---

/** Combat choisi au menu dans la Corvette n° 26, la veille au soir (puis l'app a été fermée). */
const COMBAT_26 = { mode: 'combat', pages: ['combat'], choice: { shipId: 26, kind: 'menu', at: '2026-11-07T19:05:00.000Z' } };
const TAXI_EMBARK = (ID = 12) => ({ event: 'Embark', SRV: false, Taxi: true, Multicrew: false, ID, OnStation: true });
const TAXI_DISEMBARK = (ID = 12) => ({ event: 'Disembark', SRV: false, Taxi: true, Multicrew: false, ID, OnStation: true });
const A_BORD = (ID) => ({ event: 'Embark', SRV: false, Taxi: false, Multicrew: false, ID, OnStation: true });
const A_PIED_DE = (ID) => ({ event: 'Disembark', SRV: false, Taxi: false, Multicrew: false, ID, OnStation: true });
const JOIN = { event: 'JoinACrew', Captain: 'Autre' };
const QUIT = { event: 'QuitACrew', Captain: 'Autre' };
const CREW_EMBARK = { event: 'Embark', SRV: false, Taxi: false, Multicrew: true, ID: 7, OnStation: true };
const CREW_DISEMBARK = { event: 'Disembark', SRV: false, Taxi: false, Multicrew: true, ID: 7, OnStation: true };
const PAS_LE_TIEN = { action: 'none', why: "à bord d'un vaisseau qui n'est pas le tien" };

test('démarrage en taxi ou en équipage, un mode actif : la décision repoussée au retour à bord suit la règle du démarrage (rien n’est écrasé)', () => {
  // Combat choisi dans le n° 26 ; app fermée, passage au Type-11 n° 43 (rôle Minage Rhino), taxi Apex ; app relancée en taxi
  const HISTO = [EV.loadGame('Federation_Corvette', 26), EV.loadout('federation_corvette', 26), EV.swap('lakonminer', 43), EV.rhinoLoadout(), A_PIED_DE(43)];
  let b = banc({ roles: PIOCHE, types: TYPES, overlay: COMBAT_26 });
  assert.equal(b.replay([...HISTO, TAXI_EMBARK()]).action, 'none');
  b.live(TAXI_DISEMBARK());
  assert.deepEqual(b.live(A_BORD(43)), { action: 'none', why: 'mode déjà actif' }, 'retour à bord : comme si l’app avait démarré à bord');
  assert.equal(b.overlay.cur.mode, 'combat');
  assert.equal(b.overlay.shows, 0);
  assert.equal(b.sw.current(), null);
  // Démarrée à bord du 43, même règle (témoin)
  b = banc({ roles: PIOCHE, types: TYPES, overlay: COMBAT_26 });
  assert.deepEqual(b.replay(HISTO.slice(0, 4)), { action: 'none', why: 'mode déjà actif' });
  // En équipage : JoinACrew au démarrage, puis QuitACrew et le Loadout de ton vaisseau
  b = banc({ roles: PIOCHE, types: TYPES, overlay: COMBAT_26 });
  assert.equal(b.replay([...HISTO.slice(0, 4), JOIN]).action, 'none');
  b.live(QUIT);
  assert.deepEqual(b.live(EV.rhinoLoadout()), { action: 'none', why: 'mode déjà actif' });
  assert.equal(b.overlay.cur.mode, 'combat');
  // Choix fait dans le 43 lui-même, puis aller-retour 43 → 26 → 43 app fermée (le choix ne vaut plus) : démarré en
  // taxi, le retour à bord ne bascule pas non plus (un mode est actif)
  b = banc({ roles: PIOCHE, types: TYPES, overlay: { ...COMBAT_26, choice: { shipId: 43, kind: 'menu', at: '2026-11-07T19:05:00.000Z' } } });
  assert.equal(b.replay([EV.loadGame('LakonMiner', 43), EV.rhinoLoadout(), EV.swap('federation_corvette', 26), EV.swap('lakonminer', 43), EV.rhinoLoadout(), A_PIED_DE(43), TAXI_EMBARK()]).action, 'none');
  b.live(TAXI_DISEMBARK());
  assert.equal(b.live(A_BORD(43)).why, 'mode déjà actif');
  assert.equal(b.overlay.cur.mode, 'combat');
});

test('décision de démarrage repoussée : sans mode actif, le retour à bord applique le rôle (session gardée) ; un relancement ou un vrai changement la remplace', () => {
  const HISTO = [EV.loadGame('Federation_Corvette', 26), EV.loadout('federation_corvette', 26), EV.swap('lakonminer', 43), EV.rhinoLoadout(), A_PIED_DE(43), TAXI_EMBARK()];
  // Aucun mode actif : la règle du démarrage bascule, sans remettre à zéro la session relue depuis le LoadGame
  let b = banc({ roles: PIOCHE, types: TYPES, overlay: { activity: 'combat' } });
  b.replay(HISTO);
  b.live(TAXI_DISEMBARK());
  assert.deepEqual(b.live(A_BORD(43)), { action: 'switch', mode: 'waypoints' });
  assert.deepEqual(b.overlay.resets, [], 'session gardée, comme au démarrage');
  assert.ok(b.sw.current(), 'avec l’avis');
  // Partie relancée (LoadGame) avant le retour à bord : c'est un lancement, avec sa règle (le Combat venait d'un autre vaisseau)
  b = banc({ roles: PIOCHE, types: TYPES, overlay: COMBAT_26 });
  b.replay(HISTO);
  b.live(EV.shutdown());
  assert.deepEqual(b.live(EV.loadGame('LakonMiner', 43)), { action: 'switch', mode: 'waypoints' }, 'relancement : règle du lancement');
  // Descendu du taxi, puis monté dans un autre de tes vaisseaux : vrai changement, avec sa règle
  b = banc({ roles: { ...PIOCHE, ...PANTHER }, types: TYPES, overlay: COMBAT_26 });
  b.replay(HISTO);
  b.live(TAXI_DISEMBARK());
  assert.deepEqual(b.live(A_BORD(31)), { action: 'switch', mode: 'waypoints' }, 'autre vaisseau : la bascule passe');
  // La décision repoussée ne sert qu'une fois : après Annuler, un autre trajet en taxi ne rebascule pas
  b = banc({ roles: PIOCHE, types: TYPES });
  b.replay(HISTO);
  b.live(TAXI_DISEMBARK());
  assert.equal(b.live(A_BORD(43)).action, 'switch');
  b.sw.cancel();
  b.live(A_PIED_DE(43));
  b.live(TAXI_EMBARK(13));
  b.live(TAXI_DISEMBARK(13));
  assert.equal(b.live(A_BORD(43)), null, 'retour à bord ordinaire : ni lancement ni changement');
  assert.equal(b.overlay.cur.mode, null);
});

test('à pied pendant un équipage (Disembark Multicrew) : toujours en équipage, ni bascule au démarrage ni rôles de ton vaisseau', () => {
  // Démarrage de l'app pendant que tu es à pied, descendu du vaisseau de l'hôte, sans avoir quitté l'équipage
  let b = banc({ roles: PANTHER, types: TYPES });
  assert.deepEqual(b.replay([EV.loadGame('PantherMkII', 31), EV.loadout('panthermkii', 31), JOIN, CREW_EMBARK, CREW_DISEMBARK]), PAS_LE_TIEN);
  assert.equal(b.tracker.away, 'crew');
  assert.equal(b.overlay.shows, 0);
  // Fin de l'équipage puis retour dans ton vaisseau : la décision repoussée a lieu
  b.live(QUIT);
  assert.equal(b.live(EV.loadout('panthermkii', 31)).action, 'switch');
  // Descendu tout de suite (sans Embark Multicrew avant) : même chose
  b = banc({ roles: PANTHER, types: TYPES });
  assert.deepEqual(b.replay([EV.loadGame('PantherMkII', 31), EV.loadout('panthermkii', 31), JOIN, CREW_DISEMBARK]), PAS_LE_TIEN);
  // À pied en équipage, une prime : proposée comme sans rôle (normale), pas d'après les rôles de ton vaisseau
  b = banc({ roles: PANTHER, types: TYPES, overlay: { mode: 'waypoints', pages: windowsOf('waypoints'), choice: { shipId: 31, kind: 'menu', at: '2026-11-08T08:00:00.000Z' } } });
  b.replay([EV.loadGame('PantherMkII', 31), EV.loadout('panthermkii', 31)]);
  b.live(JOIN);
  b.live(CREW_DISEMBARK);
  assert.deepEqual(b.sw.advisorShip(), { id: null, role: null, away: 'crew' });
  b.live({ event: 'Bounty' });
  const s = b.advisor.current();
  assert.equal(s?.mode, 'combat');
  assert.equal(s.discreet, undefined, 'normale, comme sans rôle');
  // Taxi : la descente du taxi, elle, finit bien le trajet
  b = banc({ roles: PANTHER, types: TYPES });
  b.replay([EV.loadGame('PantherMkII', 31), EV.loadout('panthermkii', 31)]);
  b.live(TAXI_EMBARK());
  b.live(TAXI_DISEMBARK());
  assert.equal(b.tracker.away, null);
});

test('« Non » au rôle principal, puis l’app redémarre, jeu toujours lancé : ni proposition ni bascule pendant 30 min', () => {
  // Overlay absent : au lancement, la bascule devient une proposition ; « Non » (ou « Ouvrir la page »)
  const fichier = path.join(DATA, 'silences-redemarrage.json');
  const b = banc({ roles: PIOCHE, types: TYPES, overlay: { installed: false }, silences: fichier });
  b.replay([EV.loadGame('LakonMiner', 43), EV.rhinoLoadout(), EV.shutdown()]);
  assert.equal(b.live(EV.loadGame('LakonMiner', 43)).action, 'propose');
  b.advisor.dismiss();
  const non = b.clock.t;
  // Cinq minutes après, l'app est relancée (nouveau serveur, mêmes données), le jeu tourne toujours dans le 43
  const HISTO = [EV.loadGame('LakonMiner', 43), EV.rhinoLoadout()];
  const apres = (ms, overlay) => banc({ roles: PIOCHE, types: TYPES, overlay, silences: fichier, debut: new Date(non + ms).toISOString() });
  let c = apres(5 * 60_000, { installed: false });
  assert.deepEqual(c.replay(HISTO), { action: 'none', why: '« Non » récent' });
  assert.equal(c.advisor.current(), null, 'la proposition ne revient pas');
  // Overlay revenu entre-temps : pas de bascule non plus
  c = apres(5 * 60_000, {});
  assert.deepEqual(c.replay(HISTO), { action: 'none', why: '« Non » récent' });
  assert.equal(c.overlay.shows, 0);
  // Les 30 min passées : la règle du démarrage s'applique de nouveau
  c = apres(DISMISS_MS + 60_000, {});
  assert.deepEqual(c.replay(HISTO), { action: 'switch', mode: 'waypoints' });
});

test('bascule annulée, puis l’app redémarre : le mode annulé se tait toujours (propositions de l’activité comprises)', () => {
  const fichier = path.join(DATA, 'silences-annuler.json');
  const b = banc({ roles: PIOCHE, types: TYPES, silences: fichier });
  b.replay([EV.loadGame('Federation_Corvette', 26), EV.loadout('federation_corvette', 26)]);
  b.live(EV.swap('lakonminer', 43));
  b.sw.cancel();
  const c = banc({ roles: PIOCHE, types: TYPES, silences: fichier, overlay: { choice: b.overlay.chosen }, debut: new Date(b.clock.t + 60_000).toISOString() });
  c.replay([EV.loadGame('Federation_Corvette', 26), EV.loadout('federation_corvette', 26), EV.swap('lakonminer', 43), EV.rhinoLoadout()]);
  c.live({ event: 'LaunchSRV', SRVType: 'mev_rhino' });
  assert.equal(c.advisor.current(), null, 'Minage Rhino se tait encore');
  assert.equal(c.advisor.silenced('waypoints'), true);
});

// Alt+Maj+Q pressé pendant que le serveur était arrêté : l'overlay (détaché, il survit au serveur) garde la fermeture et
// la transmet à son lancement suivant, avant d'ouvrir quoi que ce soit (overlay/closed.js sendPending)
const HIER = Date.parse('2026-11-07T21:00:00Z');
const FERME = Date.parse('2026-11-07T21:30:00Z');
const RHINO_HIER = { mode: 'waypoints', pages: windowsOf('waypoints'), choice: { shipId: 43, kind: 'bascule', at: new Date(HIER).toISOString() }, changedAt: HIER };

test('Alt+Maj+Q pressé serveur arrêté : la fermeture, transmise au lancement suivant de l’overlay, s’applique ; rien ne se rouvre seul', () => {
  // Ce matin, le jeu tourne dans le 43, l'app démarre : le serveur croit les fenêtres ouvertes et les redemande
  let b = banc({ roles: RHINOS, types: TYPES, overlay: RHINO_HIER });
  assert.deepEqual(b.replay([EV.loadGame('LakonMiner', 43), EV.rhinoLoadout()]), { action: 'reshow', mode: 'waypoints' });
  assert.equal(b.overlay.reshows, 1, 'fenêtres redemandées telles quelles : pas un changement voulu');
  assert.equal(b.overlay.changedAt(), HIER);
  // L'overlay relancé transmet d'abord la fermeture d'hier soir : rien n'a été voulu depuis, elle s'applique
  const etat = b.sw.overlayClosed({ at: FERME });
  assert.deepEqual({ mode: etat.mode, pages: etat.pages }, { mode: 'waypoints', pages: [] });
  assert.deepEqual(b.overlay.launchPages(), [], 'l’overlay n’ouvre rien');
  assert.deepEqual(b.overlay.chosen, { shipId: 43, kind: 'fermeture', at: new Date(FERME).toISOString() }, 'notée à son heure');
  assert.equal(b.sw.current(), null, 'aucun avis');
  assert.deepEqual(b.of('overlay').at(-1).pages, [], 'le menu le sait');
  // Relog : rien ne se rouvre ; un vrai embarquement, si, avec l'avis et Annuler
  assert.equal(b.live(EV.loadGame('LakonMiner', 43)).action, 'none');
  assert.equal(b.live(EV.swap('panthermkii', 31)).action, 'switch');
  assert.ok(b.sw.current());
  // App lancée avant le jeu : au LoadGame, même suite
  b = banc({ roles: RHINOS, types: TYPES, overlay: RHINO_HIER });
  b.replay([EV.loadGame('LakonMiner', 43), EV.rhinoLoadout(), EV.shutdown()]);
  assert.equal(b.live(EV.loadGame('LakonMiner', 43)).action, 'reshow');
  b.sw.overlayClosed({ at: FERME });
  assert.deepEqual(b.overlay.cur.pages, []);
  assert.equal(b.live(EV.loadGame('LakonMiner', 43)).action, 'none', 'relog suivant : toujours rien');
  // Une heure venue du futur (horloge de l'overlay en avance) : prise pour maintenant
  b = banc({ roles: RHINOS, types: TYPES, overlay: RHINO_HIER });
  b.replay([EV.loadGame('LakonMiner', 43), EV.rhinoLoadout()]);
  b.sw.overlayClosed({ at: b.clock.t + 3_600_000 });
  assert.equal(b.overlay.chosen.at, new Date(b.clock.t).toISOString());
});

test('fermeture transmise après coup, alors qu’un changement a été voulu depuis : il prime ; Annuler ne rouvre pas ce qui avait été fermé', () => {
  // Ce matin : échange vers le Cutter n° 5 (rôle Combat), bascule ; l'état d'avant (Minage Rhino) date d'hier soir
  let b = banc({ roles: CUTTER, types: T5, overlay: RHINO_HIER });
  b.replay([EV.loadGame('LakonMiner', 43), EV.rhinoLoadout()]);
  assert.equal(b.live(EV.swap('cutter', 5)).action, 'switch');
  // L'overlay, lancé pour le Combat, transmet la fermeture d'hier : le Combat reste, son choix aussi
  const etat = b.sw.overlayClosed({ at: FERME });
  assert.deepEqual({ mode: etat.mode, pages: etat.pages }, { mode: 'combat', pages: ['combat'] });
  assert.deepEqual(b.overlay.launchPages(), ['combat']);
  assert.equal(b.overlay.chosen.kind, 'bascule');
  assert.ok(b.sw.current(), 'l’avis reste');
  // Annuler : le Minage Rhino d'avant revient, sans les fenêtres fermées hier soir
  const r = b.sw.cancel();
  assert.deepEqual({ mode: r.mode, pages: r.pages }, { mode: 'waypoints', pages: [] });
  // Fenêtres d'avant rouvertes après la fermeture (changement voulu plus récent) : Annuler les remet
  b = banc({ roles: CUTTER, types: T5, overlay: { ...RHINO_HIER, changedAt: FERME + 60_000 } });
  b.replay([EV.loadGame('LakonMiner', 43), EV.rhinoLoadout()]);
  b.live(EV.swap('cutter', 5));
  b.sw.overlayClosed({ at: FERME });
  assert.deepEqual(b.sw.cancel().pages, windowsOf('waypoints'));
  // Fermeture en direct (sans heure), juste après une bascule : comme avant, Annuler ne rouvre rien
  b = banc({ roles: CUTTER, types: T5, overlay: { ...RHINO_HIER, changedAt: FERME + 60_000 } });
  b.replay([EV.loadGame('LakonMiner', 43), EV.rhinoLoadout()]);
  b.live(EV.swap('cutter', 5));
  b.sw.overlayClosed();
  assert.deepEqual(b.sw.cancel().pages, []);
});

// --- Plusieurs commandants sur le même PC (audit du 15 nov. 2026, M7) : « Testeur » (F0000001, n° 1 = Anaconda, rôle
// Combat) et « Testeur 2 » (F0000002, n° 1 = Cobra), sur le même dossier de journaux ---

const CMDR1 = { FID: 'F0000001', Commander: 'Testeur' };
const CMDR2 = { FID: 'F0000002', Commander: 'Testeur 2' };
const COMBAT = { primary: 'combat', secondary: [] };

test('second compte, même ShipID : le rôle de l’Anaconda n’est jamais effacé (relecture, LoadGame, vente) ni appliqué à la Cobra', () => {
  const b = banc();
  b.roles.set(1, COMBAT, { type: 'anaconda', commander: 'F0000001' });
  b.replay([EV.loadGame('Anaconda', 1, CMDR1), EV.loadout('anaconda', 1), EV.shutdown(), EV.loadGame('CobraMkIII', 1, CMDR2), EV.loadout('cobramkiii', 1)]);
  assert.equal(b.roles.get(1, 'F0000001').primary, 'combat', 'avant : « l’ancien a dû être vendu », rôle effacé pour toujours');
  assert.ok(!b.logs.some((l) => /dû être vendu/.test(l)), b.logs.join(' | '));
  assert.equal(b.overlay.cur.mode, null, 'la Cobra n’a pas le rôle de l’Anaconda');
  const cur = b.sw.currentShip();
  assert.equal(cur.role, null);
  assert.equal(Object.hasOwn(cur, 'commander'), false, 'le FID reste dans le serveur');
  assert.deepEqual(b.of('ships:roles').at(-1), { ships: {} }, 'rôles du commandant chargé seulement');
  // Vente du n° 1 par le second compte : seul son vaisseau compte
  b.live({ event: 'ShipyardSell', ShipType: 'cobramkiii', SellShipID: 1 });
  assert.equal(b.roles.get(1, 'F0000001').primary, 'combat');
  // Le second compte se relance : toujours rien pour la Cobra
  b.live(EV.shutdown());
  assert.equal(b.live(EV.loadGame('CobraMkIII', 1, CMDR2)).action, 'none');
  assert.equal(b.roles.get(1, 'F0000001').primary, 'combat');
  // Retour au compte principal : un changement de vaisseau, la bascule vers Combat
  b.live(EV.shutdown());
  assert.deepEqual(b.live(EV.loadGame('Anaconda', 1, CMDR1)), { action: 'switch', mode: 'combat' });
  assert.deepEqual(b.of('ships:roles').at(-1), { ships: { 1: COMBAT } });
});

test('rôle donné par le second compte à SON n° 1 : rangé sous lui, sans toucher celui du compte principal', () => {
  const b = banc();
  b.roles.set(1, COMBAT, { type: 'anaconda', commander: 'F0000001' });
  b.replay([EV.loadGame('CobraMkIII', 1, CMDR2), EV.loadout('cobramkiii', 1)]);
  b.roles.set(1, { primary: 'rescue', secondary: [] }, { type: b.tracker.typeOf(1), commander: b.tracker.commander });
  assert.equal(b.roles.get(1, 'F0000002').type, 'cobramkiii');
  assert.equal(b.roles.get(1, 'F0000001').primary, 'combat');
  assert.deepEqual(b.sw.rolesView(), { 1: { primary: 'rescue', secondary: [] } });
});

test('rôles d’avant les commandants (fichier version 1) : rattachés au plus vu des journaux, jamais effacés par l’autre compte', () => {
  const b = banc({ roles: { 1: COMBAT }, types: { 1: 'anaconda' } });
  assert.equal(b.roles.hasUnowned(), true);
  // Compte principal lancé deux fois, second compte une fois (le dernier), qui vend son n° 1
  b.replay([
    EV.loadGame('Anaconda', 1, CMDR1), EV.loadout('anaconda', 1), EV.shutdown(),
    EV.loadGame('Anaconda', 1, CMDR1), EV.shutdown(),
    EV.loadGame('CobraMkIII', 1, CMDR2), EV.loadout('cobramkiii', 1),
    { event: 'ShipyardSell', ShipType: 'cobramkiii', SellShipID: 1 },
    { event: 'ShipyardNew', ShipType: 'cobramkiii', NewShipID: 1 }, EV.loadout('cobramkiii', 1),
  ]);
  assert.equal(b.roles.hasUnowned(), false);
  const r = b.roles.get(1, 'F0000001');
  assert.equal(r.primary, 'combat', 'rattaché au compte principal, ni effacé par la vente de l’autre ni par « numéro repris »');
  assert.equal(r.guessed, true);
  assert.equal(b.roles.get(1, 'F0000002'), null);
  assert.ok(b.logs.some((l) => /rattaché\(s\) au commandant le plus vu/.test(l)));
  assert.ok(!b.logs.some((l) => /F000000/.test(l)), 'aucun FID dans le journal de l’app');
});

test('rôle rattaché d’office à un commandant dont le n° 1 est d’un autre modèle : il ne s’applique pas, mais n’est pas effacé', () => {
  // Un seul commandant dans les journaux : le rôle d'avant lui revient, mais il visait peut-être le vaisseau d'un autre
  // compte (journaux effacés depuis) : jamais de ménage « numéro repris » sur un rôle rattaché d'office
  const b = banc({ roles: { 1: COMBAT }, types: { 1: 'anaconda' } });
  b.replay([EV.loadGame('CobraMkIII', 1, CMDR2), EV.loadout('cobramkiii', 1)]);
  assert.equal(b.roles.get(1, 'F0000002').guessed, true);
  assert.equal(b.sw.currentShip().role, null);
  assert.equal(b.overlay.cur.mode, null);
  b.live(EV.swap('cutter', 5));
  b.live(EV.swap('cobramkiii', 1));
  assert.equal(b.roles.get(1, 'F0000002').primary, 'combat');
  assert.ok(!b.logs.some((l) => /dû être vendu/.test(l)));
});

test('rôles d’avant les commandants, journaux vides : rattachés au premier commandant vu en direct (le seul)', () => {
  const b = banc({ roles: { 1: COMBAT }, types: { 1: 'anaconda' } });
  b.replay([]);
  assert.equal(b.roles.hasUnowned(), true);
  assert.deepEqual(b.live(EV.loadGame('Anaconda', 1, CMDR1)), { action: 'switch', mode: 'combat' });
  assert.equal(b.roles.get(1, 'F0000001').guessed, true);
});

test('choix noté dans le n° 1 d’un commandant : ne vaut pas pour le n° 1 de l’autre ; un ancien choix sans commandant compare le numéro', () => {
  const at = '2026-11-08T09:00:00Z';
  assert.equal(choiceHolds({ shipId: 1, commander: 'F0000001', kind: 'menu', at }, 1, null, 'F0000001'), true);
  assert.equal(choiceHolds({ shipId: 1, commander: 'F0000001', kind: 'menu', at }, 1, null, 'F0000002'), false);
  assert.equal(choiceHolds({ shipId: 1, kind: 'menu', at }, 1, null, 'F0000002'), true, 'ancien fichier');
  const base = { kind: 'launch', shipId: 1, role: COMBAT, installed: true, mode: null };
  assert.equal(decideBoarding({ ...base, commander: 'F0000002', choice: { shipId: 1, commander: 'F0000001', kind: 'menu', at } }).action, 'switch');
  assert.equal(decideBoarding({ ...base, commander: 'F0000001', choice: { shipId: 1, commander: 'F0000001', kind: 'menu', at } }).why, 'choix fait dans ce vaisseau');
  // Le choix noté par l'app porte le commandant
  const b = banc();
  b.replay([EV.loadGame('Anaconda', 1, CMDR1)]);
  b.menu('combat');
  assert.equal(b.overlay.chosen.commander, 'F0000001');
});
