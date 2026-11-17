// Ce qui part vers le Squadron Tracker, et rien d'autre : commandant, système, mérites gagnés, heure.
// Même contrat que le plugin EDMC (build_payload de load.py) : le Worker reconnaît donc un gain déjà envoyé
// par le plugin et ne le compte qu'une fois.

import {
  BETA_MARKERS, CANCELLED_BY_NEXT, DUPLICATE_SAME_TOTAL, LIVE_GALAXY_MIN_MAJOR, WORKER_MAX_MERITS, WORKER_MAX_TEXT,
  WORKER_TIMESTAMP,
} from './rules.js';

/** Événements du journal lus par le capteur. */
export const SENSOR_EVENTS = ['Fileheader', 'LoadGame', 'Commander', 'Location', 'FSDJump', 'CarrierJump', 'Docked', 'PowerplayMerits'];

// Événements qui donnent le système où l'on est (pas StartJump : son StarSystem est la destination)
const SYSTEM_EVENTS = new Set(['Location', 'FSDJump', 'CarrierJump', 'Docked']);

const isText = (v) => typeof v === 'string' && v.length > 0;

/** Galaxie Live et pas une bêta, d'après la version écrite par le jeu. Version inconnue : non. */
export function isLiveGalaxy(gameVersion) {
  if (!isText(gameVersion)) return false;
  const lower = gameVersion.toLowerCase();
  if (BETA_MARKERS.some((m) => lower.includes(m))) return false;
  const major = Number.parseInt(gameVersion, 10);
  return Number.isInteger(major) && major >= LIVE_GALAXY_MIN_MAJOR;
}

/** Message envoyé au Worker, ou null s'il ne respecterait pas son format (validMerits). */
export function buildPayload(cmdr, system, ev) {
  const merits = ev?.MeritsGained;
  const at = ev?.timestamp;
  if (!Number.isInteger(merits) || merits < 1 || merits > WORKER_MAX_MERITS) return null;
  if (typeof at !== 'string' || !WORKER_TIMESTAMP.test(at)) return null;
  if (!isText(cmdr) || cmdr.length > WORKER_MAX_TEXT) return null;
  // Un nom de système trop long serait refusé : on l'envoie vide plutôt que de perdre le gain
  const where = typeof system === 'string' && system.length <= WORKER_MAX_TEXT ? system : '';
  return { cmdr, system: where, merits, at };
}

/** Même gain = même commandant, même heure, mêmes mérites : la clé du Worker (sans la casse du nom). */
export const payloadKey = (p) => `${p.cmdr.toLowerCase()}|${p.at}|${p.merits}`;

/** Heure d'un gain d'après sa clé (le nom du commandant peut contenir « | », l'heure et les mérites non). */
export const keyTime = (key) => Date.parse(String(key).split('|').at(-2));

/** Vérifie un message relu sur le disque (fichier abîmé ou modifié à la main). */
export function validPayload(p) {
  if (!p || typeof p !== 'object') return null;
  const clean = buildPayload(p.cmdr, p.system, { MeritsGained: p.merits, timestamp: p.at });
  return clean && clean.system === p.system ? clean : null;
}

/**
 * Suit le journal comme le fait EDMC : commandant, système courant, version du jeu. Pour chaque PowerplayMerits,
 * renvoie le message à envoyer et, s'il ne doit pas partir, pourquoi.
 */
export class MeritContext {
  constructor() {
    this.cmdr = null;
    this.system = null;
    this.gameVersion = null;
    this.lastTotal = null; // TotalMerits de la ligne PowerplayMerits précédente, dans la même partie
    this.prev = null; // ligne PowerplayMerits précédente de la partie : { total, gained, power, candidate }
  }

  /**
   * @returns {null | { payload, key, skip: null | 'doublon' | 'galaxie' | 'invalide', cancels? }}
   * `cancels` : le gain précédent, que cette ligne annule (rules.js CANCELLED_BY_NEXT) ; son `skip` devient 'annule'.
   */
  apply(ev) {
    switch (ev?.event) {
      case 'Fileheader':
        this.gameVersion = isText(ev.gameversion) ? ev.gameversion : null;
        this.lastTotal = null;
        this.prev = null;
        return null;
      case 'LoadGame':
        if (isText(ev.Commander)) this.cmdr = ev.Commander;
        if (isText(ev.gameversion)) this.gameVersion = ev.gameversion;
        this.lastTotal = null;
        this.prev = null;
        return null;
      case 'Commander':
        if (isText(ev.Name)) this.cmdr = ev.Name;
        return null;
      case 'PowerplayMerits':
        return this.merits(ev);
      default:
        if (SYSTEM_EVENTS.has(ev?.event) && isText(ev.StarSystem)) this.system = ev.StarSystem;
        return null;
    }
  }

  merits(ev) {
    const total = Number.isInteger(ev.TotalMerits) ? ev.TotalMerits : null;
    const gained = Number.isInteger(ev.MeritsGained) ? ev.MeritsGained : null;
    const repeated = DUPLICATE_SAME_TOTAL && total !== null && total === this.lastTotal;
    if (total !== null) this.lastTotal = total;
    const cancels = repeated ? null : this.cancelled(total, gained, ev.Power);
    const line = { total, gained, power: ev.Power, candidate: null };
    this.prev = line;
    const payload = buildPayload(this.cmdr, this.system, ev);
    let c;
    if (!payload) c = { payload: null, key: null, skip: 'invalide' };
    else {
      const skip = !isLiveGalaxy(this.gameVersion) ? 'galaxie' : repeated ? 'doublon' : null;
      c = { payload, key: payloadKey(payload), skip };
      line.candidate = c;
    }
    if (cancels) {
      cancels.skip = 'annule';
      c.cancels = cancels;
    }
    return c;
  }

  /**
   * Le gain précédent, si cette ligne l'annule : le total sans le gain de cette ligne n'est pas plus haut que le
   * total sans le gain précédent, donc le jeu ne l'a pas crédité (rules.js CANCELLED_BY_NEXT).
   */
  cancelled(total, gained, power) {
    const p = this.prev;
    if (!CANCELLED_BY_NEXT || !p?.candidate || p.candidate.skip) return null;
    if (total === null || gained === null || p.total === null || p.gained === null || power !== p.power) return null;
    return total - gained <= p.total - p.gained ? p.candidate : null;
  }
}
