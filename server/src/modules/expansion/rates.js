// Mérites par heure active : chaque gain de mérites rattaché au travail qui l'a produit (vente, kill, livraison…),
// à l'état Powerplay du système où il est crédité, et au temps actif passé à le produire.
//
// - Les gains sont ceux de MeritLog (merits.js) : comptés par l'écart de TotalMerits, ce qui retire les doublons
//   que le jeu écrit puis annule (core/merits.js), et rangés par activité d'après ce qui les précède.
// - Le temps actif suit les règles des chronos des sessions (core/sessions.js, core/activity.js) : pause à quai,
//   jeu fermé, ou plus de 10 min sans action (Status.json, ou une action écrite dans le journal).
// - Un « travail » finit à chaque vente, kill, livraison, mission rendue… même sans mérite : le temps actif depuis
//   le travail précédent lui revient (partagé entre les travaux du même amarrage, voir APPROACH_MS). Un travail à
//   0 mérite compte donc aussi, avec son temps. Un gain sans travail juste avant est compté, sans temps.
//
// Le jeu n'écrit pas les modificateurs de mérites : l'app mesure après coup ce que tu as gagné, elle ne prévoit rien.

import { IDLE_MS } from '../../core/activity.js';
import { PAUSE_EVENTS, PauseClock } from '../../core/sessions.js';
import { ACTIVITIES, COMBAT_VOUCHERS, MERIT_EVENTS, MeritLog, weekStart } from './merits.js';

// --- Règles du jeu connues -----------------------------------------------------------------------------------
// Pour la future « vigie des règles » : chaque entrée a sa source, sa date et son statut :
//   « publiée » (notes de Frontier), « mesurée » (journaux de référence), « à vérifier » (source tierce ou incomplète).
// Notes de Frontier relevées le 7 nov. 2026 dans l'API Steam News
// (https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=359320).

/** Mises à jour qui ont changé ce que rapportent les activités Powerplay, de la plus ancienne à la plus récente. */
export const RULE_CHANGES = [
  {
    id: 'trailblazers-3', date: '2025-04-25', status: 'publiée',
    label: 'Multiplicateurs offensif et défensif sur tous les systèmes ; exploration et exobiologie revalorisées',
    source: 'Notes « Trailblazers | Update 3 », Steam News, 25 avr. 2025',
  },
  {
    id: 'trailblazers-3-4', date: '2025-07-03', status: 'publiée',
    label: 'Renforcement à échelle mobile selon la sape subie ; sape +15 %, prise 0 %',
    source: 'Notes « Trailblazers | Update 3.4 », Steam News, 3 juil. 2025',
  },
  {
    id: 'dodec', date: '2025-11-11', status: 'publiée',
    label: "Ventes à l'unité ajustées par rapport aux ventes en gros ; fin des mérites en trop à l'unité",
    source: 'Notes « Dodec Update », Steam News, 11 nov. 2025',
  },
  {
    id: 'caspian-explorer', date: '2025-12-02', status: 'publiée',
    label: 'Systèmes marqués (+25 % en sape, +35 % en renforcement) ; correctif du commerce Powerplay qui rapportait trop peu',
    source: 'Notes « Caspian Explorer Update », Steam News, 2 déc. 2025',
  },
  {
    id: 'kestrel-mk2', date: '2026-02-24', status: 'publiée',
    label: 'Correctif : les kills de joueurs (PvP) en Powerplay ne rapportaient ni score ni mérites',
    source: 'Notes « Kestrel Mk. II Update », Steam News, 24 févr. 2026',
  },
  {
    id: 'operations', date: '2026-07-01', status: 'à vérifier',
    label: 'Opérations : nouvelle source de mérites en mode Powerplay',
    source: "Annonce « An Update on Operations » (22 avr. 2026) et sortie « Operations Update » (1er juil. 2026), Steam News : les notes de sortie ne chiffrent pas les mérites",
  },
];

/**
 * Modificateurs connus de ce que rapporte une action. Aucun n'est écrit dans le journal : ils servent à lire tes
 * rendements, l'app ne les applique pas.
 */
export const KNOWN_MODIFIERS = [
  {
    id: 'defensive', date: '2025-04-25', status: 'publiée', effect: '−35 %', scope: 'Renforcement',
    label: 'Multiplicateur défensif : un renforcement rapporte 35 % de mérites en moins',
    source: 'Notes « Trailblazers | Update 3 », 25 avr. 2025',
  },
  {
    id: 'sliding', date: '2025-07-03', status: 'publiée', effect: '−20 % à +30 %', scope: 'Renforcement',
    label: "En plus, selon la sape subie par le système dans les dernières 24 h : −20 % s'il n'a pas été sapé du tout",
    source: 'Notes « Trailblazers | Update 3.4 », 3 juil. 2025',
  },
  {
    id: 'offensive', date: '2025-07-03', status: 'publiée', effect: '+15 %', scope: 'Sape',
    label: "Saper le système d'une autre puissance (+5 % auparavant)",
    source: 'Notes « Trailblazers | Update 3.4 », 3 juil. 2025',
  },
  {
    id: 'acquisition', date: '2025-07-03', status: 'publiée', effect: '0 %', scope: 'Prise',
    label: 'Prendre un système inoccupé : plus de bonus (+5 % auparavant)',
    source: 'Notes « Trailblazers | Update 3.4 », 3 juil. 2025',
  },
  {
    id: 'bulk', date: '2025-11-11', status: 'publiée', effect: 'non chiffré', scope: 'Commerce, minage',
    label: "Vendre une marchandise à l'unité ne rapporte plus de mérites en trop ; ventes au détail ajustées par rapport aux ventes en gros",
    source: 'Notes « Dodec Update », 11 nov. 2025',
  },
  {
    id: 'marked-undermining', date: '2025-12-02', status: 'publiée', effect: '+25 %', scope: 'Sape, système marqué',
    label: 'Toute action de sape dans un système marqué pour la sape',
    source: 'Notes « Caspian Explorer Update », 2 déc. 2025',
  },
  {
    id: 'marked-reinforcement', date: '2025-12-02', status: 'publiée', effect: '+35 %', scope: 'Renforcement, système marqué',
    label: 'Toute action de renforcement dans un système marqué pour le renforcement',
    source: 'Notes « Caspian Explorer Update », 2 déc. 2025',
  },
  {
    id: 'marked-where', date: '2025-12-02', status: 'à vérifier', effect: '—', scope: 'Systèmes marqués',
    label: "3 marqueurs au plus par puissance, d'après la sape des joueurs ; d'abord actifs seulement autour de HIP 87621. Étendus depuis ?",
    source: 'Notes « Caspian Explorer Update », 2 déc. 2025 ; aucune note plus récente trouvée',
  },
  {
    id: 'ore-origin', date: '2026-10-31', status: 'mesurée', effect: '0 mérite', scope: 'Prise, minage',
    label: "Minerai miné dans le système à prendre et vendu sur place : 0 mérite. Règle du wiki : en prise, le minerai doit venir d'un système Consolidé ou Forteresse de ta puissance",
    source: "Journaux de référence : 1 184 t d'iridium vendues à Synuefe GA-I b57-6 le 31 oct. 2026 ; wiki.herzbube.ch/wiki/EDPowerPlay (25 oct. 2026)",
  },
];

/**
 * Délai entre un scan complet de vaisseau (ShipTargeted, ScanStage 3) et un petit gain de mérites. Mesurée sur les
 * journaux de référence du 23 oct. au 7 nov. 2026 : 387 des 569 gains de 7 arrivent au plus 3 s après un tel scan, la
 * plupart sans kill dans les 15 s. Ce que le jeu récompense au juste (tout vaisseau, ceux d'une puissance…) est à
 * vérifier.
 */
export const SCAN_MS = 3_000;
/**
 * Gain d'un scan au plus : mesurée sur les mêmes journaux, 7 en renforcement, 14 en prise (Synuefe GA-I b57-6).
 * Un gain plus gros juste après un scan vient d'autre chose (2 000 mérites le 25 oct. 2026 à HIP 95262).
 */
export const SCAN_MAX_MERITS = 14;

// --- Choix de l'app (pas des règles du jeu) ----------------------------------------------------------------------
/** Un gain revient au travail de la même activité fini juste avant : le jeu crédite une vente jusqu'à 30 s après. */
export const MATCH_MS = 60_000;
/**
 * Le temps d'un travail part de la fin du travail précédent, mais au plus 30 min de temps actif avant le premier
 * signe de son activité depuis (premier raffinage, premier achat, première attaque…), ou avant la vente elle-même
 * s'il n'y en a aucun : le trajet pour s'y rendre compte, pas des heures passées à autre chose (ingénieurs, chantier
 * naval…).
 *
 * Travaux finis pendant le même passage (même amarrage, ou même instant : pas de temps actif entre eux), dans
 * n'importe quel ordre : chacun prend le temps depuis le premier signe de son activité jusqu'au premier signe de
 * l'activité suivante, le dernier jusqu'à la fin. Un travail sans aucun signe n'a rien si un autre en a un ; s'ils
 * n'en ont aucun, ils se partagent les 30 min avant le passage.
 */
export const APPROACH_MS = 30 * 60_000;
/** Échantillon jugé faible en dessous : moins de 5 travaux ou moins de 30 min actives. */
export const MIN_UNITS = 5;
export const MIN_ACTIVE_MS = 30 * 60_000;
/** Pas de taux horaire sous 1 min active : la division n'aurait pas de sens. */
export const MIN_RATE_MS = 60_000;
const HOUR_MS = 3600_000;

// --- Ce qu'on lit dans le journal --------------------------------------------------------------------------------
const ARRIVALS = new Set(['Location', 'FSDJump', 'CarrierJump']);
const MERIT_SET = new Set(MERIT_EVENTS);
const PAUSES = new Set(PAUSE_EVENTS);
const KILLS = ['Bounty', 'FactionKillBond', 'CapShipBond', 'PVPKill'];
// Fin d'un travail et son activité (mêmes correspondances que merits.js ; MarketSell : minage ou commerce ;
// RedeemVoucher : seulement les bons de combat)
const DONE = new Map([
  ['PowerplayDeliver', 'delivery'],
  ['MissionCompleted', 'missions'],
  ['SearchAndRescue', 'rescue'],
  ['RedeemVoucher', 'combat'],
  ['SellExplorationData', 'exploration'],
  ['MultiSellExplorationData', 'exploration'],
  ['SellOrganicData', 'exobiology'],
  ...KILLS.map((k) => [k, 'combat']),
]);
/**
 * RedeemVoucher.Type des bons de combat (primes, obligations de combat, zones de conflit au sol). Les bons codex
 * (exploration), trade et scannable ne viennent pas d'un combat : pas un travail. Journaux de référence : 17 bons
 * encaissés (bounty, CombatBond, settlement, codex, trade), aucun suivi d'un gain de mérites. Liste partagée avec
 * l'historique des mérites (COMBAT_VOUCHERS, merits.js).
 */
const doneOf = (ev, ores) => {
  if (ev.event === 'MarketSell') return marketActivity(ev, ores);
  if (ev.event === 'RedeemVoucher') return COMBAT_VOUCHERS.has(String(ev.Type || '').toLowerCase()) ? 'combat' : null;
  return DONE.get(ev.event);
};
// Premier signe d'une activité : le travail commence au plus 30 min actives avant lui. Pas le ciblage d'un vaisseau :
// on cible aussi en minant ou en commerçant. LaunchDrone : seulement le drone de prospection.
const SIGNS = new Map([
  ...['MiningRefined', 'ProspectedAsteroid', 'LaunchDrone'].map((e) => [e, 'mining']),
  ['MarketBuy', 'trade'],
  ...['UnderAttack', ...KILLS].map((e) => [e, 'combat']),
  ['CollectCargo', 'rescue'],
  ...['FSSDiscoveryScan', 'FSSAllBodiesFound', 'SAAScanComplete', 'CodexEntry'].map((e) => [e, 'exploration']),
  ['ScanOrganic', 'exobiology'],
  ['PowerplayCollect', 'delivery'],
  ['MissionAccepted', 'missions'],
]);
/**
 * Actions du joueur écrites dans le journal (en plus des mouvements vus dans Status.json). Pas les messages reçus,
 * les signaux détectés ou les attaques subies : ils arrivent aussi quand tu es absent.
 */
const ACTIONS = new Set([
  'FSDJump', 'StartJump', 'SupercruiseEntry', 'SupercruiseExit', 'SupercruiseDestinationDrop', 'FSDTarget', 'NavRoute',
  'DockingRequested', 'DockingGranted', 'ApproachBody', 'LeaveBody', 'Touchdown', 'Liftoff', 'Market', 'Music',
  'LaunchSRV', 'DockSRV', 'Embark', 'Disembark', 'EjectCargo', 'CargoTransfer', 'MarketSell', 'PowerplayMerits', 'ShipTargeted',
  ...[...DONE.keys(), ...SIGNS.keys()].filter((e) => e !== 'UnderAttack'),
]);

/** Événements à garder dans l'historique du journal pour ce calcul. */
export const RATE_EVENTS = [...new Set([
  ...MERIT_EVENTS, ...PAUSE_EVENTS, ...ACTIONS, ...DONE.keys(), ...SIGNS.keys(), 'PowerplayJoin', 'PowerplayLeave',
])];

const oreKey = (type) => String(type || '').toLowerCase().replace(/^\$/, '').replace(/_name;$/, ''); // comme merits.js
/**
 * Une vente est du commerce quand la marchandise a été achetée (prix d'achat moyen non nul), même si c'est un
 * minerai ; sinon du minage si c'est un minerai (journaux de référence : bauxite, indium, gallium, béryllium et tantale
 * achetés puis revendus, iridium et platine minés à 0 cr).
 */
export const marketActivity = (ev, ores) => (Number(ev.AvgPricePaid) > 0 ? 'trade' : ores.has(oreKey(ev.Type)) ? 'mining' : 'trade');
// merits.js range une vente de minerai acheté en minage : un gain de vente revient à la vente, minage ou commerce
const family = (activity) => (activity === 'mining' || activity === 'trade' ? 'market' : activity);
const list = (v) => (Array.isArray(v) ? v : []);

/** Ce que le jeu écrit de la situation Powerplay d'un système à l'arrivée. */
export function arrivalOf(ev) {
  return {
    controlling: typeof ev.ControllingPower === 'string' ? ev.ControllingPower : null,
    powers: list(ev.Powers).filter((p) => typeof p === 'string'),
    conflicts: list(ev.PowerplayConflictProgress).map((c) => c?.Power).filter((p) => typeof p === 'string'),
    state: typeof ev.PowerplayState === 'string' ? ev.PowerplayState : null,
  };
}

/**
 * État d'un système pour ta puissance :
 * renforcement (tenu par elle), sape (tenu par une autre), prise (inoccupé, ta puissance y est en lice),
 * autre puissance (inoccupé, ta puissance n'y est pas), sans puissance, ou inconnu (pas d'arrivée vue, pas de
 * puissance connue).
 */
export function stateOf(arrival, power) {
  if (!arrival || !power) return { mode: 'unknown', state: null };
  if (arrival.controlling) return { mode: arrival.controlling === power ? 'reinforcement' : 'undermining', state: arrival.state };
  if (arrival.powers.includes(power) || arrival.conflicts.includes(power)) return { mode: 'acquisition', state: arrival.state || 'Unoccupied' };
  if (arrival.powers.length || arrival.conflicts.length) return { mode: 'outside', state: arrival.state };
  return { mode: 'none', state: null };
}

/**
 * Temps actif cumulé, avec les pauses des chronos des sessions (PauseClock : à quai, jeu fermé, inactivité de plus
 * de 10 min, comptée depuis la dernière action). PauseClock repart de zéro à chaque lancement du jeu : on met de côté
 * ce qui a été joué avant.
 */
export class ActiveClock {
  constructor(idleMs = IDLE_MS) {
    this.idleMs = idleMs;
    this.clock = new PauseClock(idleMs);
    this.banked = 0;
    this.start = null;
  }

  /** Temps actif cumulé à l'instant t (t au moins égal à la dernière action vue). */
  at(t) {
    if (this.start === null) return 0;
    return Math.max(this.banked, this.banked + (t - this.start) - this.clock.pausedAt(t));
  }

  touch(t) {
    if (!Number.isFinite(t)) return;
    this.start ??= t;
    this.clock.touch(t);
  }

  /** Lancement du jeu, arrivée, amarrage, départ, fermeture du jeu. */
  apply(ev) {
    const t = Date.parse(ev.timestamp);
    if (!Number.isFinite(t)) return;
    if (ev.event === 'LoadGame') {
      if (this.start !== null) this.banked = this.at(t);
      this.start = t;
    }
    this.start ??= t;
    this.clock.apply(ev);
  }
}

/**
 * Partage du temps actif [boundary, end] entre les travaux d'un même passage, quel que soit l'ordre où ils ont fini
 * (voir APPROACH_MS). members : [{ sign }] (temps actif au premier signe de son activité, ou null).
 * @returns [{ activeMs, skippedMs }] dans l'ordre de members
 */
export function shareVisit(members, boundary, end) {
  const signed = members.filter((m) => m.sign != null).sort((a, b) => a.sign - b.sign);
  const out = new Map(members.map((m) => [m, { activeMs: 0, skippedMs: 0 }]));
  if (signed.length) {
    const first = Math.min(end, Math.max(boundary, signed[0].sign - APPROACH_MS));
    signed.forEach((m, i) => {
      const from = i === 0 ? first : Math.min(end, Math.max(boundary, m.sign));
      const to = i + 1 < signed.length ? Math.min(end, Math.max(boundary, signed[i + 1].sign)) : end;
      out.set(m, { activeMs: Math.max(0, to - from), skippedMs: i === 0 ? Math.max(0, first - boundary) : 0 });
    });
  } else if (members.length) {
    const first = Math.max(boundary, end - APPROACH_MS);
    for (const m of members) out.set(m, { activeMs: (end - first) / members.length, skippedMs: (first - boundary) / members.length });
  }
  return members.map((m) => out.get(m));
}

/**
 * Travaux rattachés à leurs gains : { t, activity, system, mode, state, power, activeMs, skippedMs, merits, gains }.
 * skippedMs : temps actif écarté avant le travail (au-delà de 30 min avant le premier signe de son activité).
 * Un gain sans travail de son activité juste avant est « orphelin » (orphan) : compté, sans temps.
 */
export class RateLog {
  constructor({ idleMs = IDLE_MS } = {}) {
    this.log = new MeritLog();
    this.clock = new ActiveClock(idleMs);
    this.arrivals = new Map(); // système → arrivalOf
    this.units = [];
    this.boundary = 0; // temps actif cumulé déjà réparti entre les travaux
    this.signs = new Map(); // activité → temps actif à son premier signe depuis son dernier travail
    this.visit = null; // passage en cours : { end, members: [{ unit, sign, activeMs, skippedMs }] }
    this.lastJob = null; // dernier travail (pas un gain orphelin)
    this.lastScan = null; // dernier scan complet d'un vaisseau (ms)
    this.lastCredited = null;
    this.left = false;
  }

  /** Une action vue dans Status.json. */
  touch(t) {
    this.clock.touch(t);
  }

  /**
   * Du temps actif s'est écoulé depuis le passage : son partage est définitif. Les signes d'avant le passage sans
   * travail fini n'ouvrent plus rien (une attaque subie en commerçant, des nacelles jamais rendues…) ; ceux du passage
   * (un achat après la vente) ouvrent le travail suivant.
   */
  settle(now) {
    if (!this.visit || now <= this.visit.end) return;
    const { end } = this.visit;
    this.boundary = Math.max(this.boundary, end);
    for (const [activity, at] of this.signs) if (at < end) this.signs.delete(activity);
    this.visit = null;
  }

  /** Ta puissance, null sans allégeance. */
  power() {
    return this.left ? null : this.log.power;
  }

  /** @returns true si un travail ou un gain a été ajouté */
  apply(ev) {
    const t = Date.parse(ev?.timestamp);
    if (!Number.isFinite(t)) return false;
    if (PAUSES.has(ev.event)) this.clock.apply(ev);
    else if (ACTIONS.has(ev.event)) this.clock.touch(t);
    this.settle(this.clock.at(t));
    const before = this.log.entries.length;
    if (MERIT_SET.has(ev.event)) this.log.apply(ev);
    // Allégeance quittée : les travaux d'après ne comptent plus, jusqu'à la prochaine
    if (ev.event === 'PowerplayLeave') this.left = true;
    else if (ev.event === 'Powerplay' || ev.event === 'PowerplayJoin' || ev.event === 'PowerplayMerits') this.left = false;
    if (ARRIVALS.has(ev.event) && typeof ev.StarSystem === 'string') this.arrivals.set(ev.StarSystem, arrivalOf(ev));
    if (ev.event === 'ShipTargeted' && ev.ScanStage === 3) this.lastScan = t;

    const sign = SIGNS.get(ev.event);
    if (sign && (ev.event !== 'LaunchDrone' || ev.Type === 'Prospector') && !this.signs.has(sign)) this.signs.set(sign, this.clock.at(t));

    let changed = false;
    const done = doneOf(ev, this.log.ores);
    if (done) {
      this.close(t, done, ev.event);
      changed = true;
    }
    for (const e of this.log.entries.slice(before)) {
      this.credit(e);
      changed = true;
    }
    return changed;
  }

  close(t, activity, by) {
    const end = this.clock.at(t);
    this.settle(end);
    const last = this.lastJob;
    // Plusieurs ventes à la suite au même endroit, ou des kills enchaînés : un seul travail
    if (last && last.activity === activity && last.system === this.log.system && t - last.t <= MATCH_MS) {
      last.t = t;
      this.join(last, activity, end);
      return last;
    }
    const power = this.power();
    const unit = {
      t, activity, by, system: this.log.system, ...stateOf(this.arrivals.get(this.log.system), power), power,
      activeMs: 0, skippedMs: 0, merits: 0, gains: 0,
    };
    this.units.push(unit);
    this.lastJob = unit;
    this.join(unit, activity, end);
    return unit;
  }

  /** Le travail rejoint le passage en cours (ou en ouvre un), qui est repartagé. */
  join(unit, activity, end) {
    this.visit ??= { end, members: [] };
    let member = this.visit.members.find((m) => m.unit === unit);
    if (!member) {
      // Premier signe de son activité depuis son dernier travail ; un signe venu après, pendant le même passage,
      // est celui du travail suivant (un achat juste après une vente)
      member = { unit, sign: this.signs.get(activity) ?? null, activeMs: unit.activeMs, skippedMs: unit.skippedMs };
      this.signs.delete(activity);
      this.visit.members.push(member);
    }
    const shares = shareVisit(this.visit.members, this.boundary, this.visit.end);
    this.visit.members.forEach((m, i) => {
      m.unit.activeMs = m.activeMs + shares[i].activeMs;
      m.unit.skippedMs = m.skippedMs + shares[i].skippedMs;
    });
  }

  /**
   * Un gain de MeritLog : au travail de la même activité fini juste avant. Sinon il est orphelin : compté, sans
   * temps, et il ne coupe pas le travail en cours (scan de vaisseau s'il suit un scan complet, autre sinon).
   */
  credit(e) {
    if (e.merits < 0) {
      // Doublon retiré par le jeu : repris sur le travail qui l'avait reçu
      if (this.lastCredited) {
        this.lastCredited.merits += e.merits;
        this.lastCredited.gains = Math.max(0, this.lastCredited.gains - 1); // la ligne en double n'était pas un gain
      }
      return;
    }
    let unit = null;
    for (let i = this.units.length - 1; i >= 0 && e.t - this.units[i].t <= MATCH_MS; i--) {
      if (!this.units[i].orphan && family(this.units[i].activity) === family(e.activity)) {
        unit = this.units[i];
        break;
      }
    }
    if (!unit) {
      const power = this.power();
      const scan = this.lastScan != null && e.t - this.lastScan <= SCAN_MS && e.merits <= SCAN_MAX_MERITS;
      unit = {
        t: e.t, activity: scan ? 'scan' : 'other', by: 'PowerplayMerits',
        system: this.log.system, ...stateOf(this.arrivals.get(this.log.system), power), power,
        activeMs: 0, skippedMs: 0, merits: 0, gains: 0, orphan: true,
      };
      this.units.push(unit);
    }
    unit.merits += e.merits;
    unit.gains += 1;
    this.lastCredited = unit;
  }
}

/**
 * Rejoue l'historique du journal avec les actions vues dans Status.json (triées), à leur place.
 * @param moves instants (ms) des actions
 */
export function replayRates(history, moves = [], options) {
  const log = new RateLog(options);
  let m = 0;
  for (const ev of history) {
    const t = Date.parse(ev.timestamp);
    for (; m < moves.length && moves[m] <= t; m++) log.touch(moves[m]);
    log.apply(ev);
  }
  for (; m < moves.length; m++) log.touch(moves[m]);
  return log;
}

const ORDER = new Map(ACTIVITIES.map((a, i) => [a, i]));

/** Taille de l'échantillon : travaux (un gain d'origine inconnue n'en est pas un), gains, travaux à 0 mérite. */
function row(units) {
  const merits = units.reduce((s, u) => s + u.merits, 0);
  const activeMs = units.reduce((s, u) => s + u.activeMs, 0);
  const jobs = units.filter((u) => !u.orphan);
  return {
    merits,
    activeMs,
    units: jobs.length,
    gains: units.reduce((s, u) => s + u.gains, 0),
    zero: jobs.filter((u) => u.merits <= 0).length,
    rate: activeMs >= MIN_RATE_MS ? Math.round(merits / (activeMs / HOUR_MS)) : null,
    small: jobs.length < MIN_UNITS || activeMs < MIN_ACTIVE_MS,
  };
}

function groups(units, keyOf, fields) {
  const by = new Map();
  for (const u of units) {
    const k = keyOf(u);
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(u);
  }
  return [...by.entries()].map(([key, list]) => ({ key, ...fields(list[0]), ...row(list) }))
    .sort((a, b) => b.merits - a.merits || b.activeMs - a.activeMs);
}

/**
 * Rendements sur une période : total, par activité, par état du système, croisés, et les derniers travaux.
 * Seuls comptent les travaux faits avec une puissance connue (allégeance prêtée).
 * @param modifiers modificateurs saisis : ceux qui nomment un système reçoivent ce que tu y as fait pendant la
 *                  semaine Powerplay de leur date
 */
export function rateReport(units, { from = -Infinity, to = Infinity, modifiers = [] } = {}) {
  const kept = units.filter((u) => u.power && u.t >= from && u.t < to);
  const state = (u) => ({ mode: u.mode, state: u.state });
  const byActivity = groups(kept, (u) => u.activity, (u) => ({ activity: u.activity }))
    .sort((a, b) => b.merits - a.merits || (ORDER.get(a.activity) ?? ORDER.size) - (ORDER.get(b.activity) ?? ORDER.size));
  return {
    from: Number.isFinite(from) ? from : (kept[0]?.t ?? null),
    to: Number.isFinite(to) ? to : null,
    total: { ...row(kept), skippedMs: kept.reduce((s, u) => s + u.skippedMs, 0) },
    byActivity,
    byState: groups(kept, (u) => `${u.mode}:${u.state ?? ''}`, state),
    cross: groups(kept, (u) => `${u.activity}|${u.mode}:${u.state ?? ''}`, (u) => ({ activity: u.activity, ...state(u) })),
    recent: kept.filter((u) => !u.orphan).slice(-15).reverse().map((u) => ({
      t: u.t, activity: u.activity, system: u.system, mode: u.mode, state: u.state, activeMs: u.activeMs, merits: u.merits, gains: u.gains,
    })),
    modifiers: modifiers.map((m) => {
      if (!m.system) return { ...m, measured: null };
      const week = weekStart(Date.parse(`${m.date}T12:00:00Z`));
      const here = units.filter((u) => u.power && u.system?.toLowerCase() === m.system.toLowerCase() && weekStart(u.t) === week);
      return { ...m, week, measured: here.length ? row(here) : null };
    }),
  };
}

/** Dernier changement de règles connu : le plus récent des notes connues et de ceux que tu as saisis. */
export function lastRuleChange(mine = []) {
  return [...RULE_CHANGES, ...mine].reduce((last, r) => (!last || r.date > last.date ? r : last), null);
}
