// Bascule de mode à l'embarquement : quand tu montes dans un vaisseau qui a un rôle principal (core/shipRoles.js), l'app
// passe d'elle-même au mode de ce rôle et ouvre ses fenêtres par-dessus le jeu (le Coup d'œil reste s'il était ouvert),
// avec un avis « ⛏ Minage Rhino activé — vaisseau « Pioche » · Annuler ». Annuler remet le mode et les fenêtres d'avant.
//
// Règles (testées dans roleSwitch.test.js, avec un faux overlay) :
// - seulement sur les événements en direct : la relecture du journal au démarrage ne fait que retrouver le vaisseau
//   actuel (et effacer les rôles des vaisseaux vendus entre-temps) ;
// - changement de vaisseau (autre ShipID, ou vaisseau neuf : core/boarding.js) : bascule vers le rôle principal ;
// - même vaisseau au lancement du jeu (LoadGame, relog compris : passage Ouvert → Solo, retour au menu ; ou retour à bord
//   après un lancement à pied) : ce n'est pas un changement de vaisseau. Tout choix fait dans CE vaisseau reste, quel
//   qu'il soit : un mode, « Aucun », Annuler, ou la bascule elle-même ; un mode d'origine inconnue reste aussi. Bascule
//   seulement s'il n'y a aucun choix noté, ou si le choix a été fait dans un autre vaisseau, ou avant que tu quittes ce
//   vaisseau puis y remontes (vu à la relecture, app fermée) ;
// - démarrage du serveur, jeu déjà lancé : jamais si un mode est actif ; en taxi ou en équipage, la décision attend ton
//   retour à bord, et garde la règle du démarrage ; sinon, même règle que le lancement ;
// - un mode choisi à la main (« Aucun » compris) n'est jamais écrasé tant que tu restes dans le même vaisseau : la
//   bascule n'a lieu qu'à un vrai embarquement ;
// - déjà dans le mode du rôle : ses fenêtres, que le serveur croit ouvertes, sont redemandées telles quelles à l'overlay
//   (relancé s'il s'est arrêté sans le dire : PC redémarré, plantage), sans avis ni choix noté. Fermées par toi
//   (Alt+Maj+Q, que l'overlay dit au serveur) : un vrai embarquement les rouvre, avec l'avis ; un lancement, non ;
// - overlay quitté par toi (Alt+Maj+Q) : le serveur ne croit plus ses fenêtres ouvertes. Annuler ne les rouvre donc pas,
//   et c'est un choix fait dans ce vaisseau (un relog n'y rouvre rien). Quitté pendant que le serveur était arrêté :
//   l'overlay garde la fermeture et la transmet à son lancement suivant, avant d'ouvrir quoi que ce soit
//   (overlay/closed.js) ; elle s'applique si rien n'a été voulu depuis (menu, bascule, Annuler), et les fenêtres
//   redemandées telles quelles ne se rouvrent pas ;
// - Polyvalent, pas de rôle principal : aucune bascule ;
// - overlay absent ou coupé : pas de bascule possible, elle devient une proposition normale (core/modeGuess.js), dont
//   le texte dit pourquoi. Rôle sans fenêtre (Commerce) alors que des fenêtres sont ouvertes par-dessus le jeu : la
//   bascule les fermerait sans rien montrer à la place, elle devient aussi une proposition ;
// - session du mode ouvert : remise à zéro seulement à un changement de vaisseau (nouvelle sortie, comme à tout
//   changement de mode). Au démarrage du serveur et au lancement, la session relue depuis le LoadGame reste ;
// - Annuler : mode et fenêtres d'avant, sans remettre à zéro la session du mode retrouvé ; le mode annulé se tait 30 min
//   comme après « Non » ; pas de nouvelle bascule pour ce vaisseau avant le prochain embarquement. Plusieurs bascules à
//   la suite (échanges rapprochés au chantier naval, chacune avant l'échéance de l'avis d'avant) : Annuler remonte à
//   l'état d'avant la première. Le silence de 30 min ne bloque pas la bascule ni la proposition d'un vrai
//   embarquement : elles viennent d'un rôle que tu as choisi, pas d'une devinette ; au lancement dans le même vaisseau
//   et au démarrage, « Non » tient : ni bascule ni proposition, overlay présent ou non, même si l'app a redémarré entre
//   les deux (silences gardés sur disque, core/silences.js) ;
// - l'avis s'efface au bout de SWITCH_NOTICE_MS (le mode reste), ou dès que tu changes de mode toi-même. Il ne survit pas
//   à un redémarrage de l'app (la bascule reste, son choix noté aussi ; le menu remet le mode voulu).

import { modeById, modeName, POLYVALENT, windowsOf } from './modes.js';
import { REAL_TIMERS } from './timers.js';
import { CommanderTracker } from './commander.js';

/** Durée de l'avis de bascule (et du bouton Annuler). Choix de l'app : le temps de décoller, comme l'alerte du rachat. */
export const SWITCH_NOTICE_MS = 3 * 60 * 1000;
/**
 * Jeu lancé au démarrage du serveur : LoadGame sans Shutdown, et un signe de vie (Status.json, journal) depuis moins de
 * 10 min. Un lancement sur cinq finit sans Shutdown (jeu planté) : le Shutdown seul ne suffit pas (même règle que la
 * garde des commandes, modules/bindings/rules.js GAME_SILENT_MS).
 */
export const GAME_SILENT_MS = 10 * 60 * 1000;

/**
 * Le dernier choix de mode a-t-il été fait dans ce vaisseau, et vaut-il encore ? Il ne vaut plus si tu as quitté ce
 * vaisseau puis y es remonté depuis (vrai changement de vaisseau plus récent que le choix, vu par le journal, même
 * pendant que l'app était fermée). Un choix sans heure (ancien fichier) vaut.
 * @param {{ shipId, commander?, at }|null} choice
 * @param {string|null} [commander] commandant du vaisseau actuel (core/commander.js)
 * @param {number|null} boardedAt dernier vrai changement de vaisseau (ms, core/boarding.js)
 */
export function choiceHolds(choice, shipId, boardedAt = null, commander = undefined) {
  if (!choice || choice.shipId === null || choice.shipId !== shipId) return false;
  // Même numéro, autre commandant (second compte sur le même PC) : pas le même vaisseau. Un choix d'un ancien fichier,
  // sans commandant, ne compare que le numéro
  if (commander !== undefined && choice.commander != null && choice.commander !== commander) return false;
  const at = Date.parse(choice.at ?? '');
  return !(Number.isFinite(at) && Number.isFinite(boardedAt) && boardedAt > at);
}

/**
 * Faut-il basculer ? Décision pure.
 * @param {object} o
 * @param {'change'|'launch'|'startup'} o.kind change : autre vaisseau ; launch : même vaisseau au lancement du jeu (relog
 *   compris) ; startup : démarrage du serveur
 * @param {number|null} o.shipId vaisseau actuel
 * @param {string|null} [o.commander] son commandant (core/commander.js)
 * @param {{ primary, secondary }|null} o.role son rôle
 * @param {string|null} o.mode mode actif
 * @param {boolean} o.installed overlay présent (ni absent, ni coupé)
 * @param {{ shipId, kind, at }|null} o.choice dernier changement de mode : dans quel vaisseau, comment, quand
 * @param {number|null} [o.boardedAt] dernier vrai changement de vaisseau (ms)
 * @param {boolean} [o.running] jeu lancé (startup)
 * @param {string|null} [o.away] 'taxi' | 'crew' : à bord d'un vaisseau qui n'est pas le tien (startup)
 * @param {string[]} [o.pages] fenêtres que le serveur croit ouvertes par-dessus le jeu (Coup d'œil compris) ; vide après
 *   un Alt+Maj+Q (core/overlay.js overlayClosed)
 * @param {boolean} [o.silenced] le mode du rôle principal se tait après un « Non » (ou une bascule annulée)
 * @returns {{ action: 'none', why: string } | { action: 'switch', mode: string } | { action: 'reshow', mode: string }
 *   | { action: 'propose', mode: string, because: 'overlay'|'fenetres' }}
 *   reshow : déjà dans ce mode, ses fenêtres redemandées telles quelles à l'overlay (sans effet s'il tourne, relancé
 *   s'il s'est arrêté sans que le serveur le sache : PC redémarré, plantage)
 */
export function decideBoarding({ kind, shipId, commander = undefined, role, mode, installed, choice = null, boardedAt = null, running = false, away = null, pages = [], silenced = false }) {
  const primary = role?.primary ?? null;
  const none = (why) => ({ action: 'none', why });
  if (shipId === null || shipId === undefined) return none('vaisseau inconnu');
  if (!primary) return none('pas de rôle principal');
  if (primary === POLYVALENT.id) return none('polyvalent');
  if (!modeById(primary)) return none('rôle inconnu');
  if (kind === 'startup') {
    if (!running) return none('jeu fermé');
    if (away) return none("à bord d'un vaisseau qui n'est pas le tien");
  } else if (kind !== 'launch' && kind !== 'change') {
    return none('événement inconnu');
  }
  const windows = windowsOf(primary);
  if (mode === primary) {
    if (!installed || !windows.length) return none('déjà dans ce mode');
    if (pages.includes(windows[0])) return { action: 'reshow', mode: primary };
    // Fenêtres de ce mode fermées par toi (Alt+Maj+Q) : un vrai embarquement les rouvre, avec l'avis ; pas un lancement
    return kind === 'change' ? { action: 'switch', mode: primary } : none('déjà dans ce mode, fenêtres fermées par toi');
  }
  if (kind === 'startup' && mode !== null) return none('mode déjà actif');
  if (kind !== 'change') {
    // Même vaisseau : ce que tu y as choisi reste (« Aucun », Annuler et Alt+Maj+Q compris), un mode d'origine inconnue
    // aussi, et « Non » tient 30 min, overlay présent ou non. Seul un vrai embarquement passe outre (rôle choisi par toi)
    if (choiceHolds(choice, shipId, boardedAt, commander)) return none('choix fait dans ce vaisseau');
    if (mode !== null && !choice) return none("mode d'origine inconnue");
    if (silenced) return none('« Non » récent');
  }
  if (!installed) return { action: 'propose', mode: primary, because: 'overlay' };
  // Mode sans fenêtre (Commerce) : basculer fermerait les fenêtres ouvertes sans rien montrer à la place, ni l'avis
  if (!windows.length && pages.some((p) => p !== 'glance')) return { action: 'propose', mode: primary, because: 'fenetres' };
  return { action: 'switch', mode: primary };
}

/**
 * Raison affichée quand la bascule devient une proposition : overlay absent ou coupé (« Ouvrir la page » dans l'app),
 * ou rôle sans fenêtre alors que d'autres sont ouvertes.
 * @param {string|null} title nom affiché du vaisseau
 * @param {{ because?: 'overlay'|'fenetres', disabled?: boolean, mode?: string }} o
 */
export function roleProposalReason(title, { because = 'overlay', disabled = false, mode = null } = {}) {
  const who = `rôle principal${title ? ` de « ${title} »` : ' du vaisseau'}`;
  if (because === 'fenetres') return `${who} : ${modeName(mode)} n'a pas de fenêtre en jeu, l'app ne ferme pas d'elle-même celles qui sont ouvertes`;
  const why = disabled ? "l'overlay est coupé" : "l'overlay n'est pas installé";
  return `${who} : ${why}, pas de fenêtre par-dessus le jeu ; ouvre sa page dans l'app`;
}

/**
 * Bascule à l'embarquement, branchée sur le vaisseau (core/boarding.js), les rôles (core/shipRoles.js), l'overlay et les
 * propositions (core/modeGuess.js).
 * deps :
 * - roles : ShipRoles ; tracker : ShipTracker ; advisor : ModeAdvisor ;
 * - overlay : { state() → { mode, glance, pages, installed, disabled }, snapshot() → { mode, glance, pages, activity,
 *   since }, show(next, { choice, silent, activity, reshow }), restore(snapshot, { choice }), closed({ choice, at })
 *   (quitté par le joueur), choice() → { shipId, kind, at } | null, changedAt() → heure du dernier changement voulu
 *   (ms) ou null, launchPages() → fenêtres à ouvrir, modules compris } (core/overlay.js : showOverlay, restoreOverlay,
 *   overlayClosed, overlayChoice, overlayChangedAt, overlayLaunchPages) ;
 * - broadcast(type, data) ; now() (ms) ; nickname(shipId, commander) → nom donné dans l'app ou null ; signOfLife() → dernier signe
 *   de vie du jeu (ms) ou null ; log(texte) ; timers : { set(fn, ms), clear(t) } (null : pas de minuterie, tests).
 */
export class RoleSwitcher {
  constructor({ roles, tracker, advisor, overlay, broadcast = () => {}, now = () => Date.now(), nickname = () => null, signOfLife = () => null, log = () => {}, timers = REAL_TIMERS }) {
    Object.assign(this, { roles, tracker, advisor, overlay, broadcast, now, nickname, signOfLife, log, timers });
    this.notice = null; // { mode, shipId, ship, at, previous } : dernière bascule, tant qu'on peut l'annuler
    this.timer = null;
    // Démarrage du serveur en taxi ou en équipage, jeu lancé : la décision du démarrage attend ton retour à bord, et
    // garde sa règle (un mode actif n'est jamais touché). Effacée au premier embarquement, au LoadGame et au Shutdown
    this.deferredStartup = false;
    this.seen = new CommanderTracker(); // commandants vus (relecture puis direct) : à qui rattacher les rôles d'avant
  }

  // --- Vaisseau actuel ---

  /**
   * Rôle qui s'applique au vaisseau actuel, celui de SON commandant (null si le rôle a été donné à un autre modèle qui
   * portait ce numéro). clean : ce rôle-là est effacé (embarquement, fin de relecture) ; les lectures (API,
   * propositions) n'écrivent rien. Jamais effacé s'il a été rattaché d'office à ce commandant (guessed : rôle d'avant
   * les commandants, peut-être donné au vaisseau d'un autre compte qui porte ce numéro) : il ne s'applique pas, c'est tout.
   */
  roleOf(ship, { clean = false } = {}) {
    if (!ship) return null;
    const commander = ship.commander ?? null;
    const saved = this.roles.get(ship.shipId, commander);
    const role = this.roles.roleFor(ship.shipId, ship.type, commander);
    if (clean && saved && !role && !saved.guessed) {
      this.log(`Rôle du vaisseau ${ship.shipId} retiré : ce numéro est maintenant un ${ship.model || ship.type}, l'ancien a dû être vendu.`);
      this.forget(ship.shipId, commander);
    }
    return role;
  }

  /** Nom affiché : nom donné dans l'app (à ce vaisseau de ce commandant), sinon nom en jeu, sinon modèle lisible. */
  titleOf(ship) {
    if (!ship) return null;
    return this.nickname(ship.shipId, ship.commander ?? null) || ship.name || ship.model || null;
  }

  /**
   * Vaisseau actuel pour l'API : { shipId, type, model, name, nickname, title, role } ; shipId null s'il est inconnu.
   * Sans le commandant : son FID reste dans le serveur.
   */
  currentShip() {
    const ship = this.tracker.ship();
    if (!ship) return { shipId: null, type: null, model: null, name: null, nickname: null, title: null, role: null };
    const role = this.roleOf(ship);
    const { commander, ...shown } = ship;
    return { ...shown, nickname: this.nickname(ship.shipId, commander ?? null) || null, title: this.titleOf(ship), role: role ? { primary: role.primary, secondary: role.secondary } : null };
  }

  /** Rôles des vaisseaux du commandant chargé, pour l'API et le temps réel. */
  rolesView() {
    return this.roles.view(this.tracker.commander ?? null);
  }

  /**
   * Pour les propositions : { id, role, away } du vaisseau où tu es, ou null s'il est inconnu. En taxi ou en équipage
   * (away), tu n'es pas dans ton vaisseau : ni son numéro ni ses rôles ne s'appliquent.
   */
  advisorShip() {
    if (this.tracker.away) return { id: null, role: null, away: this.tracker.away };
    const ship = this.tracker.ship();
    return ship ? { id: ship.shipId, role: this.roleOf(ship), away: null } : null;
  }

  forget(shipId, commander = this.tracker.commander ?? null) {
    try {
      if (this.roles.remove(shipId, commander)) this.broadcast('ships:roles', { ships: this.rolesView() });
    } catch (err) {
      this.log(`Rôle du vaisseau ${shipId} : non effacé (${err.message}).`);
    }
  }

  // --- Journal ---

  /**
   * Relecture de l'historique (démarrage, ou autre dossier de journaux) : retrouve le vaisseau actuel, efface les rôles
   * des vaisseaux vendus depuis qu'on leur a donné un rôle. Aucune bascule pendant la relecture : la décision
   * « démarrage » vient après (startup), une seule fois.
   */
  replay(history) {
    this.tracker.reset();
    this.deferredStartup = false;
    // Rôles d'avant les commandants (fichier de la version 1) : rattachés au commandant le plus vu dans les journaux (ou
    // au seul), AVANT de relire les ventes : celles de ce commandant les effacent comme avant, celles d'un autre jamais
    this.seen = new CommanderTracker();
    for (const ev of history) this.seen.see(ev);
    this.adoptUnowned(this.seen.mostSeen());
    for (const ev of history) {
      const r = this.tracker.apply(ev);
      for (const id of r.sold) {
        try {
          // Vente de CE commandant : seul son vaisseau à ce numéro perd son rôle
          if (this.roles.soldAt(id, ev.timestamp, r.commander ?? null)) this.log(`Rôle du vaisseau ${id} effacé : vendu (${ev.event}, ${ev.timestamp}).`);
        } catch (err) {
          this.log(`Rôle du vaisseau ${id} : non effacé après la vente (${err.message}).`);
        }
      }
    }
    this.roleOf(this.tracker.ship(), { clean: true });
    this.broadcast('ships:roles', { ships: this.rolesView() });
    this.broadcast('ships:current', this.currentShip());
  }

  /** Rôles sans commandant rattachés à `commander` (jamais une erreur qui arrête la lecture du journal). */
  adoptUnowned(commander) {
    if (!commander || !this.roles.hasUnowned()) return;
    try {
      const n = this.roles.adopt(commander);
      if (n) this.log(`Rôles des vaisseaux : ${n} rôle(s) d'avant les commandants rattaché(s) au commandant le plus vu dans les journaux.`);
    } catch (err) {
      this.log(`Rôles des vaisseaux : rôles d'avant les commandants non rattachés (${err.message}).`);
    }
  }

  /**
   * Après la relecture : jeu déjà lancé et aucun mode actif, rôle principal du vaisseau actuel (voir decideBoarding).
   * Cette décision tient lieu de celle du lancement : partie lancée à pied, le retour à bord n'en est plus un (sinon
   * il rebasculerait après un Annuler). En taxi ou en équipage, elle attend ton retour à bord, et c'est alors elle qui
   * est prise, avec sa règle (un mode actif n'est jamais touché) : descendre du taxi n'est ni un changement de vaisseau
   * ni un lancement du jeu.
   */
  startup() {
    this.deferredStartup = false;
    const ship = this.tracker.ship();
    if (!ship) return { action: 'none', why: 'vaisseau inconnu' };
    if (this.gameRunning()) {
      this.tracker.pendingLaunch = Boolean(this.tracker.away);
      this.deferredStartup = Boolean(this.tracker.away);
    }
    return this.decide('startup', ship.shipId);
  }

  /** Jeu lancé ? LoadGame sans Shutdown, et un signe de vie récent (journal relu, Status.json). */
  gameRunning() {
    if (!this.tracker.running) return false;
    const signs = [this.tracker.lastAt, this.signOfLife()].filter((t) => Number.isFinite(t));
    return signs.length > 0 && this.now() - Math.max(...signs) <= GAME_SILENT_MS;
  }

  /** Un événement en direct, après la relecture. */
  event(ev) {
    const r = this.tracker.apply(ev);
    // Premier commandant connu (aucun dans l'historique) : les rôles sans commandant sont les siens, il est le seul
    const first = this.seen.known().length === 0;
    this.seen.see(ev);
    if (first && r.commander) this.adoptUnowned(r.commander);
    // Partie relancée ou jeu fermé : la décision du démarrage repoussée n'a plus lieu d'être (un LoadGame est un
    // lancement, avec sa propre règle)
    if (ev?.event === 'LoadGame' || ev?.event === 'Shutdown') this.deferredStartup = false;
    for (const id of r.sold) this.forget(id, r.commander ?? null);
    // Autre commandant : ses rôles à lui (l'interface montre ceux du commandant chargé) ; une proposition faite pour un
    // vaisseau de l'autre (« Retenir comme rôle ») ne vaut plus, même avant qu'il monte à bord
    if (r.commanderChanged) {
      this.broadcast('ships:roles', { ships: this.rolesView() });
      this.advisor.shipChanged?.();
    }
    if (r.changed) this.broadcast('ships:current', this.currentShip());
    if (!r.boarding) return null;
    // Retour à bord après un démarrage en taxi ou en équipage : la décision du démarrage, pas celle d'un lancement ; un
    // vrai changement de vaisseau garde la sienne. Dans les deux cas, la décision repoussée est prise (une fois)
    const kind = r.boarding.kind === 'launch' && this.deferredStartup ? 'startup' : r.boarding.kind;
    this.deferredStartup = false;
    let before = null;
    if (kind === 'change') {
      // Bascule précédente encore annulable (changements rapprochés au chantier naval) : si une autre suit, Annuler
      // remontera à l'état d'avant la série, pas au mode automatique d'un vaisseau quitté
      if (this.current()) before = this.notice.previous;
      // Autre vaisseau : la bascule et la proposition d'avant ne valent plus
      this.clearNotice();
      this.advisor.shipChanged?.();
    }
    return this.decide(kind, r.boarding.shipId, { before });
  }

  /**
   * Décide et agit. Rend la décision (tests, journal).
   * before : état d'avant une bascule encore annulable, à reprendre si une nouvelle bascule suit (voir event).
   */
  decide(kind, shipId, { before = null } = {}) {
    const ship = this.tracker.ship();
    if (!ship || ship.shipId !== shipId) return { action: 'none', why: 'vaisseau inconnu' };
    const role = this.roleOf(ship, { clean: true });
    const state = this.overlay.state();
    const d = decideBoarding({
      kind, shipId, commander: ship.commander ?? null, role, mode: state.mode ?? null, installed: Boolean(state.installed), choice: this.overlay.choice(),
      boardedAt: this.tracker.boardedAt, running: kind === 'startup' ? this.gameRunning() : false, away: this.tracker.away,
      pages: state.pages || [], silenced: Boolean(role?.primary && this.advisor.silenced?.(role.primary)),
    });
    const title = this.titleOf(ship);
    // Changement de vaisseau : nouvelle sortie, la session du mode repart ; sinon (démarrage, lancement), elle reste
    if (d.action === 'switch') this.switchTo(d.mode, ship, title, { keepSession: kind !== 'change', previous: before });
    else if (d.action === 'reshow') this.reshow(state);
    else if (d.action === 'propose') {
      const reason = roleProposalReason(title, { because: d.because, disabled: Boolean(state.disabled), mode: d.mode });
      // Un vrai embarquement passe outre un « Non » récent (rôle choisi par toi) ; un lancement dans le même vaisseau, non
      this.advisor.propose({ mode: d.mode, reason, source: 'role', shipId: ship.shipId }, { force: kind === 'change' });
    }
    return d;
  }

  // --- Bascule et avis ---

  /**
   * keepSession : aucune remise à zéro de la session du mode ouvert (démarrage du serveur, lancement du jeu) ;
   * previous : état à remettre par Annuler, s'il ne s'agit pas de l'état actuel (série de bascules, voir event).
   */
  switchTo(mode, ship, title, { keepSession = false, previous = null } = {}) {
    previous ??= this.overlay.snapshot();
    const glance = Boolean(this.overlay.state().glance);
    const origin = { choice: this.choiceHere('bascule', ship.shipId) };
    const state = this.overlay.show(
      { mode, glance, pages: [...windowsOf(mode), ...(glance ? ['glance'] : [])] },
      keepSession ? { ...origin, silent: true, activity: mode } : origin,
    );
    this.log(`Bascule : ${modeName(mode)}, rôle principal du vaisseau ${ship.shipId}.`);
    this.notice = { mode, shipId: ship.shipId, ship: title, at: this.now(), previous };
    this.broadcast('overlay', state);
    this.advisor.modeChanged();
    this.announce();
  }

  /**
   * Déjà dans le mode du rôle : ses fenêtres, que le serveur croit ouvertes, sont redemandées telles quelles à l'overlay.
   * S'il tourne, rien ne change (il ouvre celles qui manquent, il n'y en a pas) ; s'il s'est arrêté sans le dire (PC
   * redémarré, plantage), il se relance. Ni choix noté, ni session remise à zéro, ni avis : rien n'a changé pour toi.
   */
  reshow(state) {
    this.overlay.show({ mode: state.mode ?? null, glance: Boolean(state.glance), pages: [...(state.pages || [])] }, { silent: true, reshow: true });
  }

  /**
   * L'overlay a été quitté par le joueur (Alt+Maj+Q : overlay/main.js le dit au serveur). Plus aucune fenêtre n'est
   * ouverte : le serveur ne le croit plus (le mode reste noté, le menu le montre). Annuler une bascule ne rouvrira donc
   * pas des fenêtres fermées, et un rôle sans fenêtre (Commerce) n'a plus rien à fermer. Noté comme choix fait dans ce
   * vaisseau : un relog n'y rouvre rien ; le prochain vrai embarquement, si (décision de bascule seule).
   *
   * at : heure de la fermeture (ms) quand l'overlay la transmet après coup : quitté pendant que le serveur était arrêté,
   * il l'a gardée et l'envoie à son lancement suivant, avant d'ouvrir quoi que ce soit (overlay/closed.js). Si un
   * changement a été voulu depuis (menu, page, bascule, Annuler), il prime : l'état actuel reste, et seul l'état d'avant
   * une bascule encore annulable, s'il date d'avant la fermeture, perd ses fenêtres (Annuler ne les rouvrira pas).
   * Sinon, la fermeture s'applique comme si elle venait d'avoir lieu, notée à son heure : des fenêtres que le serveur
   * redemandait telles quelles (reshow) ne se rouvrent pas.
   * @param {{ at?: number|null }} [o]
   * @returns {object} état de l'overlay
   */
  overlayClosed({ at = null } = {}) {
    const now = this.now();
    const late = Number.isFinite(at);
    const t = late ? Math.min(at, now) : now; // jamais dans le futur
    const since = this.overlay.changedAt?.() ?? null;
    const superseded = late && Number.isFinite(since) && since > t;
    // Avis encore là : Annuler remettra le mode d'avant, sans rouvrir de fenêtre fermée par toi depuis
    if (this.notice) {
      const before = this.notice.previous?.since;
      if (!superseded || !(Number.isFinite(before) && before > t)) this.notice.previous = { ...this.notice.previous, glance: false, pages: [] };
    }
    if (superseded) {
      this.log(`Overlay quitté par le joueur le ${new Date(t).toISOString()}, serveur arrêté : un changement voulu depuis prime, rien ne change.`);
      return this.overlay.state();
    }
    const state = this.overlay.closed({ choice: { ...this.choiceHere('fermeture'), at: new Date(t).toISOString() }, at: t });
    this.log(late
      ? `Overlay quitté par le joueur le ${new Date(t).toISOString()}, pendant que le serveur était arrêté : plus aucune fenêtre ouverte.`
      : 'Overlay quitté par le joueur (Alt+Maj+Q) : plus aucune fenêtre ouverte.');
    this.broadcast('overlay', state);
    return state;
  }

  /** Avis en cours (null s'il n'y en a pas, ou s'il a expiré) : { mode, shipId, ship, at, until }. */
  current() {
    const n = this.notice;
    if (n && this.now() - n.at >= SWITCH_NOTICE_MS) this.clearNotice();
    return this.notice ? { mode: this.notice.mode, shipId: this.notice.shipId, ship: this.notice.ship, at: this.notice.at, until: this.notice.at + SWITCH_NOTICE_MS } : null;
  }

  announce() {
    if (this.timer && this.timers) this.timers.clear(this.timer);
    this.timer = null;
    const view = this.current();
    this.broadcast('overlay:switch', view);
    // À l'échéance, l'avis s'efface de lui-même dans toutes les fenêtres
    if (view && this.timers) this.timer = this.timers.set(() => this.current(), SWITCH_NOTICE_MS + 1000);
  }

  clearNotice() {
    if (!this.notice) return;
    this.notice = null;
    if (this.timer && this.timers) this.timers.clear(this.timer);
    this.timer = null;
    this.broadcast('overlay:switch', null);
  }

  /**
   * « Annuler » : mode et fenêtres d'avant (le Coup d'œil comme il est maintenant), sans remise à zéro de session ; le
   * mode annulé se tait 30 min ; noté comme choix fait dans ce vaisseau (pas de nouvelle bascule avant le prochain
   * embarquement, même si le serveur redémarre).
   * @returns {object|null} état de l'overlay, ou null s'il n'y a rien à annuler
   */
  cancel() {
    if (!this.current()) return null;
    const { previous, mode, shipId } = this.notice;
    const glance = Boolean(this.overlay.state().glance);
    const pages = [...previous.pages.filter((p) => p !== 'glance'), ...(glance ? ['glance'] : [])];
    const state = this.overlay.restore({ ...previous, glance, pages }, { choice: this.choiceHere('annuler', shipId) });
    this.log(`Bascule annulée : retour à ${previous.mode ? modeName(previous.mode) : 'aucun mode'}.`);
    this.notice = null;
    this.advisor.silence(mode);
    this.broadcast('overlay', state);
    this.advisor.modeChanged();
    this.announce();
    return state;
  }

  /** Mode changé à la main (menu, page, proposition acceptée) : l'avis n'a plus lieu d'être. */
  manualChange() {
    this.clearNotice();
  }

  /**
   * Fenêtres demandées par l'interface (PUT /api/overlay, mode déjà vérifié, overlay présent). Un autre mode que
   * l'actuel est un choix fait à la main : noté avec le vaisseau et l'heure (aucune bascule ne l'écrasera dans ce
   * vaisseau), et l'avis de bascule s'efface. Le Coup d'œil seul n'est pas un choix de mode.
   */
  chooseMode(next) {
    const mode = next?.mode ?? null;
    const changed = mode !== (this.overlay.state().mode ?? null);
    const state = this.overlay.show(next, changed ? { choice: this.choiceHere('menu') } : {});
    this.broadcast('overlay', state);
    if (changed) this.manualChange();
    this.advisor.modeChanged();
    return state;
  }

  /**
   * Choix noté à un changement de mode : dans quel vaisseau (le tien, même si tu en es sorti, et de quel commandant),
   * comment, quand. Il tient
   * jusqu'au prochain vrai changement de vaisseau, relances du jeu comprises (voir choiceHolds) : la partie ne compte pas.
   */
  choiceHere(kind = 'menu', shipId = this.tracker.ship()?.shipId ?? null) {
    const commander = this.tracker.commander ?? null;
    return { shipId, ...(commander ? { commander } : {}), kind, at: new Date(this.now()).toISOString() };
  }
}
