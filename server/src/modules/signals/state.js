// Signaux du système actuel (FSSSignalDiscovered), triés pour le sauvetage et la récupération de matériaux :
// sources de signal non identifiées, sites au sol, zones de conflit, sites d'extraction, mégavaisseaux,
// installations. Stations, porteurs et balises sont ignorés.

export const SIGNAL_EVENTS = ['FSDJump', 'Location', 'CarrierJump', 'StartJump', 'FSSSignalDiscovered'];
/**
 * Historique des signaux (journal.addInterest, core/journalService.js) : seuls comptent ceux du dernier système, la
 * liste repart à chaque arrivée (apply). Les signaux des systèmes d'avant (des dizaines de milliers en exploration) ne
 * pèsent plus sur la mémoire du démarrage.
 */
export const SIGNAL_HISTORY = Object.freeze({ since: Object.freeze(['FSDJump', 'Location', 'CarrierJump']) });

// Groupes affichés, dans cet ordre
export const GROUPS = {
  uss: 'Signaux non identifiés',
  site: 'Sites au sol',
  combat: 'Zones de conflit',
  res: "Sites d'extraction",
  megaship: 'Mégavaisseaux',
  installation: 'Installations',
};
const GROUP_OF = { USS: 'uss', Generic: 'site', Combat: 'combat', ResourceExtraction: 'res', Megaship: 'megaship', Installation: 'installation' };

/** Signal utile, ou null pour un signal ignoré (station, porteur, balise…). */
export function classify(ev) {
  const group = GROUP_OF[ev.SignalType];
  if (!group || ev.IsStation) return null;
  const name = ev.SignalName_Localised || ev.SignalName;
  return {
    group,
    // Pour une source non identifiée, son type dit ce qu'on y trouve (émissions, détresse, convoi…)
    label: group === 'uss' ? ev.USSType_Localised || name : name,
    threat: ev.ThreatLevel ?? null,
    expires: ev.TimeRemaining != null ? new Date(Date.parse(ev.timestamp) + ev.TimeRemaining * 1000).toISOString() : null,
  };
}

export class SignalState {
  constructor() {
    this.system = null; // { name, address, at }
    this.signals = [];
    this.away = false; // saut en cours : on a quitté le système
  }

  apply(ev) {
    switch (ev.event) {
      case 'FSDJump':
      case 'Location':
      case 'CarrierJump':
        this.system = { name: ev.StarSystem, address: ev.SystemAddress, at: ev.timestamp };
        this.signals = [];
        this.away = false;
        break;
      case 'StartJump':
        if (ev.JumpType !== 'Hyperspace') return false;
        this.away = true;
        break;
      case 'FSSSignalDiscovered': {
        if (!this.system || ev.SystemAddress !== this.system.address) return false;
        const s = classify(ev);
        if (!s) return false;
        // Le jeu peut signaler deux fois le même signal
        if (this.signals.some((x) => x.group === s.group && x.label === s.label && x.expires === s.expires)) return false;
        this.signals.push(s);
        break;
      }
      default:
        return false;
    }
    return true;
  }

  /** Signaux encore actifs, regroupés : [{ group, title, items: [{ label, count, threat, expires }] }]. */
  summary(now = Date.now()) {
    const live = this.signals.filter((s) => !s.expires || Date.parse(s.expires) > now);
    const groups = Object.entries(GROUPS).map(([group, title]) => {
      const items = [];
      for (const s of live.filter((x) => x.group === group)) {
        const same = items.find((i) => i.label === s.label && i.threat === s.threat);
        if (same) {
          same.count++;
          if (s.expires && (!same.expires || s.expires < same.expires)) same.expires = s.expires;
        } else items.push({ label: s.label, count: 1, threat: s.threat, expires: s.expires });
      }
      return { group, title, items };
    }).filter((g) => g.items.length);
    return { system: this.system, away: this.away, count: live.length, groups };
  }
}

export function buildSignals(events) {
  const s = new SignalState();
  for (const ev of events) s.apply(ev);
  return s;
}
