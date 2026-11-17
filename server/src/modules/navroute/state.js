// Itinéraire tracé dans la carte de la galaxie (NavRoute.json), avancement saut par saut (FSDJump) et carburant :
// combien de sauts de la route le réservoir permet, récupérateur de carburant compris s'il y en a un.
// Règles (étoiles récupérables, exposants du FSD, marge, sauts à couvrir) : server/src/regles/saut.js.
//
// Consommation : carburant = k × (distance × masse)^exposant, avec k mesuré sur les derniers sauts du même vaisseau et
// du même FSD (masse au saut : à vide + soute + carburant avant le saut). Vérifié sur près de 1 000 sauts du joueur.

import { FSD_POWER_CONSTANT, FSD_POWER_CONSTANT_MKII, FUEL_ALERT_JUMPS, FUEL_MARGIN, FUEL_SAMPLES, SCOOPABLE_CLASSES } from '../../regles/saut.js';
import { commanderOf } from '../../core/commander.js';

export const ROUTE_EVENTS = ['FSDJump', 'Location', 'CarrierJump', 'Loadout', 'Cargo'];
export const MIN_JUMPS = 3; // la fenêtre s'ouvre au-delà de 2 sauts (ou dès qu'une alerte de carburant tombe)

const SCOOPABLE = new Set(SCOOPABLE_CLASSES);
const MAX_SAMPLES = 50;
const EXPOSANT_DEFAUT = FSD_POWER_CONSTANT[5]; // FSD inconnu : le cas du milieu

/** Étoile récupérable : « K », « M_RedGiant », « B_BlueWhiteSuperGiant »… mais pas « TTS », « N », « DA »… */
export function scoopable(starClass) {
  const c = String(starClass || '');
  return c.length > 0 && SCOOPABLE.has(c.split('_')[0]);
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const arrondi = (v, n = 2) => Math.round(v * 10 ** n) / 10 ** n;
const nombre = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null);

/** Exposant de consommation d'un FSD, d'après son nom (Loadout) : selon la taille, ou celui des Mk II. */
export function exposantFsd(item) {
  const i = String(item || '').toLowerCase();
  if (i.includes('mkii')) return FSD_POWER_CONSTANT_MKII;
  const size = Number(/size(\d)/.exec(i)?.[1]);
  return FSD_POWER_CONSTANT[size] ?? EXPOSANT_DEFAUT;
}

/** Ce qui sert au carburant dans un Loadout : vaisseau + FSD (clé des mesures), masse à vide, réservoir, récupérateur. */
export function vaisseauDe(ev) {
  const modules = Array.isArray(ev.Modules) ? ev.Modules.filter((m) => m && typeof m === 'object') : [];
  const fsd = modules.find((m) => m.Slot === 'FrameShiftDrive');
  const item = String(fsd?.Item || '').toLowerCase();
  const optimal = (Array.isArray(fsd?.Engineering?.Modifiers) ? fsd.Engineering.Modifiers : []).find((x) => x?.Label === 'FSDOptimalMass')?.Value;
  return {
    // Même vaisseau ET même FSD (ingénierie comprise) : sinon la consommation mesurée ne vaut plus. Vaisseau : son
    // commandant aussi (core/commander.js), le n° 1 d'un second compte n'est pas celui du compte principal
    cle: `${commanderOf(ev) ? `${commanderOf(ev)}#` : ''}${ev.ShipID ?? '?'}|${item}|${optimal ?? ''}`,
    exposant: exposantFsd(item),
    aVide: nombre(ev.UnladenMass),
    reservoir: nombre(ev.FuelCapacity?.Main),
    recuperateur: modules.some((m) => /fuelscoop/i.test(String(m.Item || ''))),
  };
}

/**
 * Coefficient k du vaisseau : médiane de ses derniers sauts normaux, ou null s'il n'a encore jamais sauté. Les sauts
 * boostés (étoile à neutrons, naine blanche, injection FSD) consomment autant pour bien plus loin : écartés.
 */
export function coefficient(sauts, exposant) {
  const k = sauts
    .filter((s) => !s.boost && s.dist > 0 && s.fuel > 0 && s.masse > 0)
    .slice(-FUEL_SAMPLES)
    .map((s) => s.fuel / (s.dist * s.masse) ** exposant)
    .sort((a, b) => a - b);
  if (!k.length) return null;
  const m = Math.floor(k.length / 2);
  return k.length % 2 ? k[m] : (k[m - 1] + k[m]) / 2;
}

/**
 * Carburant sur la route. `legs` : sauts à venir [{ name, starClass, dist }] ; `sec` : masse sans le carburant (à
 * vide + soute). Avec un récupérateur, on suppose le plein refait à chaque étoile récupérable ; sans, le réservoir ne
 * fait que baisser. Alerte si les FUEL_ALERT_JUMPS sauts suivants (ou moins s'il en reste moins) ne passent pas.
 */
export function planCarburant({ level, capacity, scoop, k, exposant, sec, legs }) {
  const base = { level: Number.isFinite(level) ? arrondi(level) : null, capacity: Number.isFinite(capacity) ? capacity : null, scoop: Boolean(scoop) };
  if (!Number.isFinite(level) || k == null || !Number.isFinite(sec) || !legs.length) return { ...base, known: false, alerte: null };
  const besoin = (d, fuel) => k * (d * (sec + fuel)) ** exposant * FUEL_MARGIN;
  let fuel = level;
  let jumps = 0;
  for (const leg of legs) {
    const b = besoin(leg.dist, fuel);
    if (fuel < b) break;
    fuel -= b;
    jumps += 1;
    if (scoop && scoopable(leg.starClass) && Number.isFinite(capacity)) fuel = capacity;
  }
  const voulus = Math.min(FUEL_ALERT_JUMPS, legs.length);
  const bloque = legs[jumps];
  const alerte = jumps >= voulus ? null : {
    in: jumps + 1,
    name: bloque.name,
    need: arrondi(besoin(bloque.dist, fuel)),
    fuel: arrondi(fuel),
    raison: scoop ? 'pas d’étoile récupérable d’ici là' : 'pas de récupérateur de carburant',
  };
  return { ...base, known: true, nextNeed: arrondi(besoin(legs[0].dist, level)), jumps, all: jumps === legs.length, alerte };
}

export class RouteState {
  constructor() {
    this.route = []; // [{ name, address, starClass, pos }], le premier est le système de départ
    this.address = null; // système actuel
    this.vaisseau = null; // vaisseauDe(dernier Loadout)
    this.soute = 0; // tonnes en soute (Cargo du vaisseau)
    this.sauts = []; // [{ cle, dist, fuel, masse, boost }] : sauts récents, pour la consommation
  }

  /** Contenu de NavRoute.json : nouvel itinéraire, ou itinéraire effacé. */
  setRoute(file) {
    const list = file?.event === 'NavRouteClear' ? [] : file?.Route || [];
    this.route = list.map((r) => ({ name: r.StarSystem, address: r.SystemAddress, starClass: r.StarClass, pos: r.StarPos }));
  }

  apply(ev) {
    if (!ROUTE_EVENTS.includes(ev.event)) return false;
    if (ev.event === 'Loadout') {
      this.vaisseau = vaisseauDe(ev);
      return true;
    }
    if (ev.event === 'Cargo') {
      if (ev.Vessel && ev.Vessel !== 'Ship') return false; // soute du SRV : sans effet sur les sauts
      this.soute = nombre(ev.Count) ?? this.soute;
      return true;
    }
    const d = nombre(ev.JumpDist);
    const used = nombre(ev.FuelUsed);
    if (ev.event === 'FSDJump' && d > 0 && used !== null && this.vaisseau) {
      const masse = (this.vaisseau.aVide ?? NaN) + this.soute + (nombre(ev.FuelLevel) ?? NaN) + used;
      this.sauts.push({ cle: this.vaisseau.cle, dist: d, fuel: used, masse: Number.isFinite(masse) ? masse : null, boost: Number(ev.BoostUsed) > 0 });
      if (this.sauts.length > MAX_SAMPLES) this.sauts.shift();
    }
    this.address = ev.SystemAddress;
    return true;
  }

  /**
   * Avancement : null sans itinéraire, ou une fois arrivé à destination. `fuelMain` (Status.json, en direct) ajoute le
   * carburant ; sans lui, pas de partie carburant.
   */
  summary(fuelMain = undefined) {
    if (this.route.length < 2) return null;
    const at = Math.max(0, this.route.findIndex((r) => r.address === this.address));
    const ahead = this.route.slice(at + 1);
    if (!ahead.length) return null;
    let distance = 0;
    for (let i = at; i < this.route.length - 1; i++) distance += dist(this.route[i].pos, this.route[i + 1].pos);
    const firstBad = ahead.findIndex((r) => !scoopable(r.starClass));
    const s = {
      total: this.route.length - 1,
      jumpsLeft: ahead.length,
      destination: this.route.at(-1).name,
      distance: Math.round(distance * 100) / 100,
      next: { name: ahead[0].name, starClass: ahead[0].starClass, scoopable: scoopable(ahead[0].starClass) },
      unscoopable: ahead.filter((r) => !scoopable(r.starClass)).length,
      // Prochaine étoile non récupérable : dans combien de sauts
      nextUnscoopable: firstBad < 0 ? null : { in: firstBad + 1, name: ahead[firstBad].name, starClass: ahead[firstBad].starClass },
    };
    const v = this.vaisseau;
    if (fuelMain === undefined || !v) return s;
    const legs = ahead.map((r, i) => ({ name: r.name, starClass: r.starClass, dist: dist(this.route[at + i].pos, r.pos) }));
    s.fuel = planCarburant({
      level: nombre(fuelMain) ?? NaN,
      capacity: v.reservoir ?? NaN,
      scoop: v.recuperateur,
      k: coefficient(this.sauts.filter((x) => x.cle === v.cle), v.exposant),
      exposant: v.exposant,
      sec: (v.aVide ?? NaN) + this.soute,
      legs,
    });
    return s;
  }
}
