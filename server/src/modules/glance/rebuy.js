// Rachat couvert et mode de jeu, pour le Coup d'œil : rachat du vaisseau piloté comparé aux crédits, total « en jeu »
// (ce qu'une destruction coûterait), mode de jeu (Open, Solo, groupe privé) et bilan de la dernière destruction.
// Tout est relu du journal à chaque démarrage : rien n'est enregistré sur le disque.
// Les noms venus du jeu (groupe privé, nom du vaisseau, station) passent par cleanText (core/text.js).

import { cleanText } from '../../core/text.js';
import { CommanderTracker, shipKey } from '../../core/commander.js';

// --- Règles du jeu ------------------------------------------------------------------------------------------------
// Regroupées ici pour la future « vigie des règles », qui les comparera à ce que le jeu fait réellement.

// Règles du jeu : dépôt des règles, server/src/regles/rachat.js (voir regles/LISEZMOI.md). Le coût payé à la
// résurrection (Resurrect.Cost, option « rebuy ») est le dernier Loadout.Rebuy avant la destruction (fiche
// rachat.cout-paye) : chaque résurrection garde ce rachat attendu (expectedCost) à côté du coût payé, pour que l'écart
// se voie.
import { REBUY_RATE, RESURRECT_OPTIONS, NO_REBUY_UNDOCK_FLAGS, SHIP_KEPT_OPTIONS, PRICE_EVENTS } from '../../regles/rachat.js';

export { REBUY_RATE, RESURRECT_OPTIONS, NO_REBUY_UNDOCK_FLAGS, SHIP_KEPT_OPTIONS, PRICE_EVENTS };

/**
 * Faillite (Resurrect.Bankrupt) en une phrase. À vérifier : témoignages de joueurs, Steam,
 * https://steamcommunity.com/app/359320/discussions/0/1639801448917278263 (nov. 2019) : « If you dont got the money,
 * you loose the ship and upgrades for it and start again with a (free) Sidewinder ».
 */
export const BANKRUPT_TEXT =
  "Faillite : tes crédits ne couvraient pas le rachat, alors le vaisseau et ses modules sont perdus et le jeu t'a confié un Sidewinder gratuit.";

/**
 * Modes de jeu de LoadGame.GameMode, avec Group (nom du groupe privé) pour « Group ».
 * Mesurée : valeurs vues dans les journaux de référence (Open, Solo, Group « EDFR » et un autre groupe privé), oct.–nov. 2026.
 * GameModeChange (MainGame, Operation) est un autre événement : il ne dit pas Open, Solo ou groupe.
 */
export const GAME_MODES = new Map([
  ['Open', { label: 'Open', open: true }],
  ['Solo', { label: 'Solo', open: false }],
  ['Group', { label: 'Groupe privé', open: false }],
]);

// --- Choix de l'app (pas des règles du jeu) -----------------------------------------------------------------------

/** Durée de l'alerte « décollé sans rachat » après Undocked, et de la fenêtre ouverte pour elle. */
export const UNDOCK_ALERT_MS = 3 * 60 * 1000;
/** Pendant combien de temps le bilan d'une résurrection reste dans les rappels et la fenêtre en jeu. */
export const RESURRECT_RECENT_MS = 30 * 60 * 1000;
/** Écart maximal entre Died et Resurrect pour rattacher ce qui a été perdu à cette résurrection. */
const DEATH_LINK_MS = 30 * 60 * 1000;

export const REBUY_EVENTS = [
  'LoadGame', 'Loadout', 'ShipyardSwap', 'ShipyardNew', 'Undocked', 'Docked',
  'Died', 'Resurrect', 'Cargo', ...PRICE_EVENTS.keys(),
];

const lower = (s) => String(s || '').toLowerCase();
const ms = (iso) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};
/** Moins de `limit` ms écoulées depuis `since` (une minute d'avance tolérée). */
const within = (since, now, limit) => since != null && now - since > -60_000 && now - since < limit;
const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const cr = (n) => `${nf.format(Math.round(n))} cr`;
const millions = (n) => (Math.abs(n) >= 1e6 ? `${(n / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M cr` : cr(n));
const capitalize = (s) => {
  s = String(s || '');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Bilan d'une résurrection en une phrase : coût payé, ou faillite expliquée. */
export function resurrectText({ option, cost, bankrupt }) {
  if (bankrupt) return BANKRUPT_TEXT;
  const paid = cost > 0 ? `${cr(cost)} payés` : 'sans frais';
  switch (option) {
    case 'rebuy':
      return `Rachat payé : ${cr(cost)}.`;
    case 'rejoin':
      return cost > 0 ? `Retour au vaisseau : ${paid}.` : 'Retour au vaisseau, sans frais (mort hors du vaisseau).';
    case 'free':
      return `Sidewinder gratuit, ${paid} : l'ancien vaisseau n'a pas été racheté.`;
    default:
      return `Résurrection (option « ${option || '?'} ») : ${paid}.`;
  }
}

/** « 1,2 M cr de primes, au moins 2,4 M cr d'exploration… » ; null si rien n'a été perdu. */
export function lossText(loss) {
  if (!loss) return null;
  const parts = [];
  if (loss.bounties > 0) parts.push(`${millions(loss.bounties)} de primes`);
  if (loss.bonds > 0) parts.push(`${millions(loss.bonds)} d'obligations de combat`);
  if (loss.exploration > 0) parts.push(`au moins ${millions(loss.exploration)} d'exploration`);
  if (loss.exobiology?.count > 0) {
    const n = loss.exobiology.count;
    parts.push(`${n} échantillon${n > 1 ? 's' : ''} exobio${loss.exobiology.value ? ` (${millions(loss.exobiology.value)})` : ''}`);
  }
  if (loss.cargo > 0) parts.push(`${nf.format(loss.cargo)} t de soute`);
  return parts.length ? `Perdu : ${parts.join(', ')}.` : null;
}

/**
 * Ce qu'une destruction fait perdre, relevé dans l'état du Coup d'œil juste avant qu'il ne l'efface (Died).
 * @param {import('./state.js').GlanceState} glance
 */
export function deathLoss(glance, cargoTons = 0) {
  const bio = glance.exobiology();
  return {
    bounties: glance.bounties,
    bonds: glance.bonds,
    exploration: glance.exploration().value,
    exobiology: { count: bio.count, value: bio.value },
    cargo: cargoTons || 0,
  };
}

/** Dernier prix vu pour chaque marchandise (ventes et achats du journal, limpets compris), pour chiffrer la soute. */
export class CargoPrices {
  constructor() {
    this.prices = new Map(); // nom interne en minuscules → { price, at, source }
  }

  learn(ev) {
    const kind = PRICE_EVENTS.get(ev.event);
    const price = kind ? Number(ev[kind.field]) : NaN;
    if (!(price > 0) || !ev.Type) return;
    this.prices.set(lower(ev.Type), { price, at: ev.timestamp || null, source: kind.source });
  }

  /** Valeur de la soute au dernier prix vu ; les marchandises jamais vendues ni achetées restent sans prix. */
  value(cargo = []) {
    let value = 0;
    const unpriced = [];
    for (const c of cargo) {
      const p = this.prices.get(lower(c.name));
      if (p) value += p.price * (c.count || 0);
      else if (c.count > 0) unpriced.push({ name: c.name, label: c.label || c.name, count: c.count });
    }
    return { value, unpriced };
  }
}

export class RebuyState {
  /**
   * @param {{ typeName?: (type: string) => string|null }} o typeName : nom lisible d'un type de vaisseau du Loadout
   *   (« lakonminer » → « Type-11 Prospector »), quand le journal n'a pas donné son nom localisé pour ce ShipID (partie
   *   lancée dans le SRV : LoadGame nomme le VRS Rhino, pas le vaisseau)
   */
  constructor({ typeName = null } = {}) {
    this.typeName = typeof typeName === 'function' ? typeName : null;
    this.ship = null; // { id, type, name, rebuy, estimated, at } d'après le dernier Loadout
    // (commandant, ShipID) → nom du type, localisé (LoadGame, ShipyardSwap, ShipyardNew) : le n° 1 d'un second compte sur
    // le même PC n'est pas le n° 1 du compte principal (core/commander.js)
    this.names = new Map();
    this.commanders = new CommanderTracker();
    this.mode = null; // { mode, group, label, open, at }
    this.undock = null; // { at, station, seenAt } : dernier décollage du vaisseau piloté (ni taxi ni équipage multiple)
    this.death = null; // { at, loss } : dernière destruction
    this.resurrect = null; // { at, seenAt, option, cost, expectedCost, bankrupt, text, loss }
    this.cargoTons = 0;
    this.prices = new CargoPrices();
  }

  /**
   * @param {object} ev événement du journal
   * @param {{ loss?: object, now?: number }} ctx loss : ce que la destruction fait perdre (Died seulement, voir
   *   deathLoss) ; now : heure de réception d'un événement en direct (ms). Les durées d'alerte partent de cette heure,
   *   pas de l'horodatage du journal : une horloge du jeu décalée ne les fausse pas. Sans now (historique), l'horodatage.
   * @returns {boolean} l'état a changé
   */
  apply(ev, { loss = null, now = null } = {}) {
    const seenAt = now ?? ms(ev.timestamp);
    // Autre commandant : le vaisseau du dernier Loadout (et son rachat) est à l'autre, jusqu'au Loadout du sien
    const before = this.commanders.current;
    const who = this.commanders.see(ev);
    if (before !== null && who !== before) this.ship = null;
    switch (ev.event) {
      case 'LoadGame': {
        const known = GAME_MODES.get(ev.GameMode);
        this.mode = ev.GameMode
          ? { mode: ev.GameMode, group: ev.GameMode === 'Group' ? cleanText(ev.Group) || null : null, label: known?.label || String(ev.GameMode), open: Boolean(known?.open), at: ev.timestamp || null }
          : this.mode;
        if (ev.ShipID != null && ev.Ship_Localised) this.names.set(shipKey(who, ev.ShipID), ev.Ship_Localised);
        this.undock = null;
        break;
      }
      case 'ShipyardSwap':
        if (ev.ShipID != null && ev.ShipType_Localised) this.names.set(shipKey(who, ev.ShipID), ev.ShipType_Localised);
        break;
      case 'ShipyardNew':
        if (ev.NewShipID != null && ev.ShipType_Localised) this.names.set(shipKey(who, ev.NewShipID), ev.ShipType_Localised);
        break;
      case 'Loadout': {
        const value = (Number(ev.HullValue) || 0) + (Number(ev.ModulesValue) || 0);
        const given = Number.isFinite(Number(ev.Rebuy)) && ev.Rebuy != null;
        this.ship = {
          id: ev.ShipID ?? null,
          type: lower(ev.Ship),
          // Le jeu écrit parfois un nom fait d'espaces : vaisseau sans nom
          name: cleanText(ev.ShipName) || null,
          ident: String(ev.ShipIdent || '').trim() || null,
          rebuy: given ? Number(ev.Rebuy) : value > 0 ? Math.round(value * REBUY_RATE) : null,
          estimated: !given,
          at: ev.timestamp || null,
        };
        break;
      }
      case 'Undocked':
        // En taxi ou à bord du vaisseau d'un autre (équipage multiple), le rachat n'est pas le tien
        this.undock = NO_REBUY_UNDOCK_FLAGS.some((f) => ev[f]) ? null : { at: ev.timestamp || null, seenAt, station: cleanText(ev.StationName) || null };
        break;
      case 'Docked':
        this.undock = null;
        break;
      case 'Cargo':
        if (ev.Vessel && ev.Vessel !== 'Ship') return false;
        if (ev.Count != null) this.cargoTons = Number(ev.Count) || 0;
        break;
      case 'MarketSell':
      case 'MarketBuy':
      case 'SellDrones':
      case 'BuyDrones':
        this.prices.learn(ev);
        return false; // rien d'affiché ne change avant la prochaine mise à jour de la soute
      case 'Died':
        this.death = { at: ev.timestamp || null, loss };
        this.undock = null;
        this.cargoTons = 0;
        break;
      case 'Resurrect': {
        const option = lower(ev.Option);
        const cost = Number(ev.Cost) || 0;
        const bankrupt = Boolean(ev.Bankrupt);
        const t = ms(ev.timestamp);
        const d = this.death && ms(this.death.at);
        const linked = d != null && t != null && t >= d && t - d <= DEATH_LINK_MS;
        this.resurrect = {
          at: ev.timestamp || null,
          seenAt,
          option,
          optionStatus: RESURRECT_OPTIONS.get(option) || 'à vérifier',
          cost,
          expectedCost: option === 'rebuy' ? this.ship?.rebuy ?? null : null,
          bankrupt,
          text: resurrectText({ option, cost, bankrupt }),
          // Mort hors du vaisseau (rejoin) : on ne prétend pas que le vaisseau a perdu sa soute ou ses données
          loss: linked && !SHIP_KEPT_OPTIONS.has(option) ? lossText(this.death.loss) : null,
        };
        break;
      }
      default:
        return false;
    }
    return true;
  }

  /**
   * Nom affichable du vaisseau piloté : son nom donné en jeu, sinon son type (nom localisé du journal, sinon celui des
   * données de référence, sinon le type interne).
   */
  shipLabel() {
    const s = this.ship;
    if (!s) return null;
    const type = this.names.get(shipKey(this.commanders.current, s.id)) || this.typeName?.(s.type) || capitalize(s.type);
    return s.name ? `${s.name} (${type})` : type;
  }

  /**
   * Vue pour le Coup d'œil.
   * @param {{ balance: number|null, toCash?: number, cargo?: {name, label, count}[], docked?: boolean|null }} p crédits
   *   (Status.json Balance ou LoadGame.Credits), total à encaisser, soute du vaisseau, à quai ou non (état du jeu)
   */
  view({ balance = null, toCash = 0, cargo = [], docked = null } = {}, now = Date.now()) {
    const rebuy = this.ship?.rebuy ?? null;
    const known = rebuy != null && typeof balance === 'number';
    const covered = known ? balance >= rebuy : null;
    const missing = covered === false ? rebuy - balance : 0;
    const alert = covered === false && within(this.undock?.seenAt, now, UNDOCK_ALERT_MS)
      ? { at: this.undock.at, station: this.undock.station, missing }
      : null;
    // Cargaison de mission (missionId, core/gameState.js) : pas à toi, elle n'est pas comptée dans ce qui est en jeu ;
    // seulement dite à part (« + N t de mission, non comptées »)
    const own = cargo.filter((c) => c?.missionId == null);
    const missionTons = cargo.filter((c) => c?.missionId != null).reduce((a, c) => a + (Number(c.count) || 0), 0);
    const soute = this.prices.value(own);
    const stake = (rebuy || 0) + (toCash || 0) + soute.value;
    const r = this.resurrect;
    return {
      ship: this.ship ? { label: this.shipLabel(), type: this.ship.type, at: this.ship.at } : null,
      rebuy,
      estimated: Boolean(this.ship?.estimated),
      balance: typeof balance === 'number' ? balance : null,
      covered,
      missing,
      // Combien de rachats les crédits paieraient d'affilée
      times: known && rebuy > 0 ? Math.floor(balance / rebuy) : null,
      alert,
      docked: typeof docked === 'boolean' ? docked : null,
      atStake: stake > 0 ? { total: stake, rebuy: rebuy || 0, toCash: toCash || 0, cargo: soute.value, unpriced: soute.unpriced, missionTons } : null,
      mode: this.mode,
      resurrect: r ? { ...r, recent: within(r.seenAt, now, RESURRECT_RECENT_MS) } : null,
    };
  }
}

/**
 * Rappels du Coup d'œil : rachat non couvert (plus pressant juste après le décollage ; le conseil dépend de l'état à
 * quai), bilan d'une résurrection récente.
 */
export function rebuyReminders(v) {
  const out = [];
  if (v.covered === false) {
    const risk = 'Si tu meurs, tu risques de perdre ce vaisseau et ses modules.';
    const advice = v.docked === true
      ? "Ne décolle pas avec : gagne d'abord la différence, ou prends un vaisseau moins cher."
      : v.docked === false ? "Tu n'es pas à quai : si tu meurs, tu risques de perdre ce vaisseau et ses modules." : risk;
    out.push({
      level: 'danger',
      text: v.alert
        ? `Tu as décollé sans pouvoir payer ton rachat : il manque ${millions(v.missing)} (rachat ${millions(v.rebuy)}). ${risk}`
        : `Rachat NON COUVERT : il manque ${millions(v.missing)} pour racheter ce vaisseau (${millions(v.rebuy)}). ${advice}`,
    });
  }
  if (v.resurrect?.recent) {
    out.push({ level: v.resurrect.bankrupt ? 'danger' : 'warning', text: [v.resurrect.text, v.resurrect.loss].filter(Boolean).join(' ') });
  }
  return out;
}
