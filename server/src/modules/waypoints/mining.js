// Minage planétaire vu par le journal : le jeu donne le nombre d'emplacements (EEP) par planète
// et ce qui est raffiné, mais pas la position des emplacements. Leur numéro n'apparaît que comme
// « destination la plus proche » quand le vaisseau se pose ou décolle (Touchdown, Liftoff), ou comme
// cible choisie dans le HUD (Status.json).
// Chaque MiningRefined vaut une tonne. La soute du vaisseau n'est pas écrite tant qu'on est en SRV :
// on la déduit du dernier relevé et des transferts.

export const MINING_EVENTS = [
  'SAASignalsFound', 'FSSBodySignals', 'MiningRefined', 'FSDJump',
  'Cargo', 'CargoTransfer', 'MaterialCollected', 'LaunchSRV', 'SRVDestroyed', 'DockSRV',
  'MarketSell', 'Powerplay', 'PowerplayMerits', 'Touchdown', 'Liftoff', 'Scan',
];

const SITE_SIGNAL = '$PlanetaryMiningLocation_Name;';
const SITE_INDEX = /\$PlanetaryMiningLocation_Name;:#index=(\d+);/;
const RECENT_MS = 10 * 60 * 1000;
const MIN_RATE_MS = 60 * 1000; // en dessous d'une minute, un taux horaire ne veut rien dire
const LOOP_GAP_MS = 40 * 1000; // plus de 40 s sans raffiner : la boucle suivante commencera au prochain raffinage
const LOOPS = 5; // boucles complètes moyennées par le taux récent

/** Numéro d'un emplacement d'après son nom de signal (« $SAA_Unknown_Signal:#type=$PlanetaryMiningLocation_Name;:#index=7; »), sinon rien. */
export function siteIndex(name) {
  const m = SITE_INDEX.exec(String(name || ''));
  return m ? Number(m[1]) : null;
}

/** « $platinum_name; » et « platinum » désignent le même minerai. */
const oreKey = (type) => String(type || '').toLowerCase().replace(/^\$/, '').replace(/_name;$/, '');
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const RUN_GAP_MS = 15 * 60 * 1000; // plus de 15 min sans raffiner : ce n'est plus la même séance de minage

/**
 * Début de la séance de minage en cours : premier raffinage d'une suite sans pause de plus de 15 min, terminée par
 * celui de l'instant t. Sert à démarrer la session automatique en comptant ce qui vient d'être miné.
 */
export function runStart(events, t) {
  let start = t;
  const times = events.filter((ev) => ev.event === 'MiningRefined').map(eventTime).filter((x) => x <= t);
  for (let i = times.length - 1; i >= 0; i--) {
    if (start - times[i] > RUN_GAP_MS) break;
    start = Math.min(start, times[i]);
  }
  return start;
}

export class MiningState {
  sites = new Map(); // planète → nombre d'emplacements
  refined = new Map(); // minerai → quantité raffinée depuis le dernier repère ou saut
  srvCargo = null;
  srvMax = 0; // plus gros chargement vu : le jeu n'écrit pas la capacité du SRV
  srvName = null;
  shipCargo = null;
  prices = new Map(); // minerai → dernier prix de vente
  site = null; // dernier emplacement repéré : { body, number, at } (at : quand, en ms ; une cible ancienne peut être celle d'un autre EEP)
  classes = new Map(); // planète → type scanné (PlanetClass)

  /** Emplacement ciblé dans le HUD (Destination de Status.json), sur la planète où l'on est. */
  target(destination, body) {
    const number = siteIndex(destination?.Name);
    // Rafraîchi à chaque relecture : l'heure dit que la cible est toujours là
    if (number != null && body) this.site = { body, number, at: Date.now() };
  }

  apply(ev) {
    switch (ev.event) {
      case 'MarketSell':
        this.prices.set(oreKey(ev.Type), ev.SellPrice);
        break;
      case 'MiningRefined': {
        const name = ev.Type_Localised || ev.Type;
        this.refined.set(name, (this.refined.get(name) || 0) + 1);
        break;
      }
      case 'FSDJump':
        this.refined.clear();
        this.site = null;
        break;
      case 'Scan':
        if (ev.BodyName && ev.PlanetClass) this.classes.set(ev.BodyName, ev.PlanetClass);
        break;
      case 'Touchdown':
      case 'Liftoff': {
        const number = siteIndex(ev.NearestDestination);
        if (number != null && ev.Body) this.site = { body: ev.Body, number, at: Date.parse(ev.timestamp) || Date.now() };
        break;
      }
      case 'Cargo':
        if (ev.Vessel === 'SRV') {
          this.srvCargo = ev.Count ?? this.srvCargo;
          this.srvMax = Math.max(this.srvMax, ev.Count || 0);
        } else if (ev.Vessel === 'Ship') {
          this.shipCargo = ev.Count ?? this.shipCargo;
        }
        break;
      case 'CargoTransfer':
        if (this.shipCargo == null) break;
        for (const t of ev.Transfers || []) {
          this.shipCargo += t.Direction === 'toship' ? t.Count : -t.Count;
        }
        break;
      case 'LaunchSRV':
        this.srvName = ev.SRVType_Localised || ev.SRVType;
        break;
      case 'SRVDestroyed':
        this.srvCargo = 0;
        break;
      // Rhino rentré dans le vaisseau sans vider sa soute : le jeu la transvase d'office (puis écrit la soute du vaisseau)
      case 'DockSRV':
        this.srvCargo = 0;
        break;
      default: {
        const signal = (ev.Signals || []).find((s) => s.Type === SITE_SIGNAL);
        if (signal && ev.BodyName) this.sites.set(ev.BodyName, signal.Count);
      }
    }
  }

  /** Type, notes et numéro d'emplacement proposés pour un repère pris sur cette planète, ou rien si ce n'est pas du minage. */
  suggestion(body) {
    const sites = this.sites.get(body) || 0;
    const ores = [...this.refined].sort((a, b) => b[1] - a[1]).map(([name]) => name);
    const siteNumber = this.site?.body === body ? this.site.number : null;
    if (!sites && !ores.length && siteNumber == null) return null;
    const parts = [];
    if (sites) parts.push(`${sites} emplacement${sites > 1 ? 's' : ''} sur la planète`);
    if (ores.length) parts.push(`raffiné : ${ores.join(', ')}`);
    return { category: 'mining', notes: parts.join(' · '), ...(siteNumber != null && { siteNumber }) };
  }

  cargo() {
    return { srv: this.srvCargo, srvMax: this.srvMax, srvName: this.srvName, ship: this.shipCargo };
  }
}

const ms = (d) => new Date(d).getTime();
/** Heure d'un événement (ms) : celle d'une forme réduite (sessionEvent), sinon son timestamp. */
export const eventTime = (ev) => (typeof ev.t === 'number' ? ev.t : ms(ev.timestamp));

import { IDLE_MS } from '../../core/activity.js';
import { MeritCounter } from '../../core/merits.js';

export { IDLE_MS }; // plus de 10 min sans rien faire : pause, comptée depuis la dernière action
// Événements qui disent que tu joues (en plus de ceux du minage) ; Shutdown met en pause tout de suite
export const ACTIVITY_EVENTS = [
  'LoadGame', 'Shutdown', 'Location', 'DockSRV', 'Embark', 'Disembark', 'ApproachBody', 'LeaveBody',
  'SupercruiseEntry', 'SupercruiseExit', 'Docked', 'Undocked', 'CollectCargo', 'EjectCargo', 'Died', 'Resurrect',
];

/**
 * Périodes réellement actives d'une session : dans chaque période ouverte au bouton, un trou de plus de `idle` entre
 * deux actions est une pause (de la dernière action à la suivante), et la fermeture du jeu (stop) en est une jusqu'à
 * la prochaine action. Une période encore ouverte sans action depuis `idle` est en pause.
 * @param marks actions triées [{ t, stop }]
 * @returns { segments: [{ start, end }] (end null : en cours), pause: 'idle' | 'offline' | null }
 */
export function activeSegments(segments, marks, now, idle = IDLE_MS) {
  const out = [];
  let pause = null;
  const push = (start, end) => {
    if (end == null || end > start) out.push({ start, end });
  };
  for (const seg of segments) {
    const end = seg.end ?? now;
    let start = seg.start; // null : en pause (jeu fermé)
    let last = seg.start;
    for (const m of marks) {
      if (m.t < seg.start) continue;
      if (m.t > end) break;
      if (start === null) {
        if (!m.stop) start = last = m.t;
        continue;
      }
      if (m.t - last > idle) {
        push(start, last);
        start = m.stop ? null : m.t;
      } else if (m.stop) {
        push(start, m.t);
        start = null;
      }
      last = m.t;
    }
    pause = null;
    if (start === null) pause = 'offline';
    else if (end - last > idle) {
      push(start, last);
      pause = 'idle';
    } else push(start, seg.end ?? null);
  }
  return { segments: out, pause: segments.at(-1)?.end == null ? pause : null };
}

// Noms du jeu (événements, minerais, matériaux) partagés entre les formes réduites : quelques centaines de valeurs
// différentes, gardées une fois au lieu d'une copie par événement. Borné : au-delà, une valeur n'est plus partagée.
const NAMES = new Map();
const NAMES_MAX = 2000;
function shared(v) {
  if (typeof v !== 'string' || v.length > 80) return v;
  const known = NAMES.get(v);
  if (known !== undefined) return known;
  if (NAMES.size < NAMES_MAX) NAMES.set(v, v);
  return v;
}

/**
 * Ce qu'une session de minage (MiningSession.apply), le début d'une série de tonnes (runStart) et la liste des
 * minerais ont besoin de garder d'un événement : son nom, son heure en nombre (`t`, lue par eventTime) et les quelques
 * champs lus par MiningSession.apply. Le module garde ces formes réduites au lieu des événements entiers (un Scan ou
 * un Cargo pèse jusqu'à plusieurs Ko, et il les gardait tous depuis le premier journal), pour pouvoir rejouer une
 * session reprise, même ancienne. Chaque forme est écrite d'un bloc (propriétés dans l'objet même, sans tableau à côté).
 */
export function sessionEvent(ev) {
  const event = shared(ev.event);
  const t = Date.parse(ev.timestamp); // NaN si illisible, comme Date.parse sur l'événement entier
  switch (ev.event) {
    // Le total du jeu (TotalMerits, Merits de l'événement Powerplay) donne le gain réel : doublons et lignes annulées
    // retirés (core/merits.js)
    case 'Powerplay':
      return { event, t, Merits: ev.Merits };
    case 'PowerplayMerits':
      return { event, t, MeritsGained: ev.MeritsGained, TotalMerits: ev.TotalMerits };
    case 'MarketSell':
      return { event, t, Type: shared(ev.Type), Count: ev.Count, TotalSale: ev.TotalSale };
    case 'MiningRefined':
      return { event, t, Type: shared(ev.Type), Type_Localised: shared(ev.Type_Localised) };
    case 'CargoTransfer':
      return {
        event,
        t,
        Transfers: Array.isArray(ev.Transfers)
          ? ev.Transfers.map((tr) => ({ Direction: shared(tr?.Direction), Type: shared(tr?.Type), Type_Localised: shared(tr?.Type_Localised), Count: tr?.Count }))
          : undefined,
      };
    case 'MaterialCollected':
      return { event, t, Name: shared(ev.Name), Name_Localised: shared(ev.Name_Localised), Count: ev.Count };
    default:
      return { event, t };
  }
}

/**
 * Formes réduites gardées à partir de `cutoff` (ms) seulement : ce qui est plus ancien ne sert plus à aucune session
 * (ouverte ou que tu peux reprendre). Le dernier total de mérites connu avant la coupure est gardé en tête, sous forme
 * d'un événement Powerplay : le premier gain gardé se compte encore depuis le vrai total.
 */
export function trimEvents(events, cutoff) {
  if (!Number.isFinite(cutoff)) return events;
  let total = null;
  const kept = [];
  for (const ev of events) {
    const t = eventTime(ev);
    if (t >= cutoff) {
      kept.push(ev);
      continue;
    }
    if (ev.event === 'Powerplay' && ev.Merits != null) total = ev.Merits;
    else if (ev.event === 'PowerplayMerits' && ev.TotalMerits != null) total = ev.TotalMerits;
  }
  if (total != null) kept.unshift({ event: 'Powerplay', t: cutoff - 1, Merits: total });
  return kept;
}

/** Une session de minage : ce qui est récupéré pendant ses périodes actives (une par reprise). */
export class MiningSession {
  ores = new Map(); // clé → { label, refined, transferred, sold, credits }
  materials = new Map(); // nom → { key, label, count }
  times = []; // instants de raffinage, pour le taux récent
  merits = 0;
  // Total du jeu suivi sur tous les événements rejoués, même hors de la session : le premier gain de la session se
  // compte alors depuis le vrai total, comme dans les bilans et le combat
  meritCounter = new MeritCounter();
  lastMeritInside = false; // la dernière ligne PowerplayMerits tombait-elle dans la session ?
  soldOutside = 0; // tonnes vendues en plus de ce que la session a raffiné

  /**
   * @param segments une date de début, ou les périodes [{ start, end }] ouvertes au bouton
   * @param idleMs   pause d'elle-même après ce temps sans action (null : le chrono tourne tant que la période est ouverte)
   */
  constructor(segments, { idleMs = null } = {}) {
    const list = Array.isArray(segments) ? segments : [{ start: segments }];
    this.segments = list.map((s) => ({ start: ms(s.start), end: s.end ? ms(s.end) : null }));
    this.idleMs = idleMs;
    this.marks = []; // actions : [{ t, stop }]
    this.sorted = true;
  }

  /** Une action à l'instant t (stop : le jeu se ferme). */
  mark(t, stop = false) {
    // Une action d'avant la première période ne compte jamais (activeSegments) : pas gardée
    if (!this.idleMs || !Number.isFinite(t) || t < this.segments[0]?.start) return;
    const prev = this.marks.at(-1);
    if (prev && t < prev.t) this.sorted = false;
    this.marks.push({ t, stop });
  }

  /** Périodes réellement actives et raison de la pause en cours. */
  active(now) {
    if (!this.idleMs) return { segments: this.segments, pause: null };
    if (!this.sorted) {
      this.marks.sort((a, b) => a.t - b.t);
      this.sorted = true;
    }
    return activeSegments(this.segments, this.marks, now, this.idleMs);
  }

  inside(t) {
    return this.segments.some((s) => t >= s.start && (s.end == null || t <= s.end));
  }

  elapsed(now) {
    return this.active(now).segments.reduce((sum, s) => sum + (s.end ?? now) - s.start, 0);
  }

  /** Temps actif entre deux instants : les pauses de la session n'y comptent pas. */
  activeBetween(from, to) {
    return this.active(to).segments.reduce((sum, s) => sum + Math.max(0, Math.min(s.end ?? to, to) - Math.max(s.start, from)), 0);
  }

  /** Tonnes et durée des dernières boucles complètes, d'un début de boucle au début d'une autre : l'attente des foreuses compte sans faire chuter le taux. */
  recentLoops(now) {
    const starts = this.times.flatMap((t, i) => (i === 0 || t - this.times[i - 1] > LOOP_GAP_MS ? [i] : []));
    const last = starts.length - 1;
    if (last < 1) return null;
    const first = Math.max(0, last - LOOPS);
    const tons = starts[last] - starts[first];
    const span = this.activeBetween(this.times[starts[first]], this.times[starts[last]]);
    const running = this.activeBetween(this.times[starts[last]], now);
    // Une boucle plus longue que la moyenne compte déjà : à l'arrêt, le taux finit par descendre
    if (running <= span / (last - first)) return { tons, span };
    return { tons: this.times.length - starts[first], span: span + running };
  }

  ore(type, label) {
    const key = oreKey(type);
    if (!this.ores.has(key)) this.ores.set(key, { key, label: label || capitalize(key), refined: 0, transferred: 0, sold: 0, credits: 0 });
    const o = this.ores.get(key);
    if (label) o.label = label;
    return o;
  }

  apply(ev) {
    const t = eventTime(ev);
    this.mark(t, ev.event === 'Shutdown');
    if (ev.event === 'Powerplay') this.meritCounter.setTotal(ev.Merits);
    if (ev.event === 'PowerplayMerits') return this.applyMerits(ev, t);
    if (!this.inside(t)) return;
    if (ev.event === 'MarketSell') {
      // La soute peut contenir du minerai d'avant la session : seul le tonnage raffiné ici compte
      const o = this.ores.get(oreKey(ev.Type));
      const units = o ? Math.min(ev.Count, o.refined - o.sold) : 0;
      if (units > 0) {
        o.sold += units;
        o.credits += Math.round((ev.TotalSale * units) / ev.Count);
      }
      if (o) this.soldOutside += ev.Count - Math.max(units, 0);
    } else if (ev.event === 'MiningRefined') {
      this.ore(ev.Type, ev.Type_Localised).refined += 1;
      this.times.push(t);
    } else if (ev.event === 'CargoTransfer') {
      for (const tr of ev.Transfers || []) {
        if (tr.Direction === 'toship') this.ore(tr.Type, tr.Type_Localised).transferred += tr.Count;
      }
    } else if (ev.event === 'MaterialCollected') {
      const m = this.materials.get(ev.Name) || { key: String(ev.Name).toLowerCase(), label: ev.Name_Localised || capitalize(ev.Name), count: 0 };
      m.count += ev.Count || 0;
      this.materials.set(ev.Name, m);
    }
  }

  /**
   * Une ligne PowerplayMerits. Quand le total du jeu repart plus bas (doublon retiré), la correction est reprise là
   * où le doublon avait été compté, comme dans l'Expansion : une ligne en double d'avant la session ne lui retire
   * rien, et un doublon compté dans la session lui est retiré même si la ligne qui le corrige arrive après.
   */
  applyMerits(ev, t) {
    const diff = this.meritCounter.gain(ev);
    const gained = ev.MeritsGained ?? diff;
    const correction = diff - gained;
    const here = this.inside(t);
    if (correction < 0) {
      if (this.lastMeritInside) this.merits += correction;
      if (here) this.merits += gained;
    } else if (here) {
      this.merits += diff;
    }
    this.lastMeritInside = here;
  }

  summary(now = Date.now()) {
    const elapsed = this.elapsed(now);
    const refined = this.times.length;
    const ores = [...this.ores.values()].sort((a, b) => b.refined - a.refined);
    const credits = ores.reduce((sum, o) => sum + o.credits, 0);
    const sold = ores.reduce((sum, o) => sum + o.sold, 0);
    const perHour = (count, ms) => (ms >= MIN_RATE_MS ? Math.round((count * 3600000) / ms) : null);
    const loops = this.recentLoops(now);
    // Première boucle : rien de complet à moyenner, on garde les 10 dernières minutes
    const recent = loops ?? { tons: this.times.filter((t) => t > now - RECENT_MS).length, span: Math.min(elapsed, RECENT_MS) };
    return {
      durationSec: Math.round(elapsed / 1000),
      refined,
      transferred: [...this.ores.values()].reduce((sum, o) => sum + o.transferred, 0),
      perHour: perHour(refined, elapsed),
      recentPerHour: perHour(recent.tons, recent.span),
      sold,
      unsold: refined - sold,
      soldOutside: this.soldOutside,
      credits,
      creditsPerHour: perHour(credits, elapsed),
      merits: this.merits,
      meritsPerHour: perHour(this.merits, elapsed),
      ores,
      materials: [...this.materials.values()].sort((a, b) => b.count - a.count),
    };
  }
}
