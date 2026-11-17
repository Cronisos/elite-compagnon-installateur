// État de la session de sauvetage reconstruit depuis le journal : nacelles, boîtes noires et débris
// récupérés, livraisons au contact de recherche et sauvetage, récompenses et mérites Powerplay, et les matériaux
// ramassés pendant la session (épaves, débris : MaterialCollected), par grade.
//
// Une session commence au lancement du jeu (LoadGame) ou à une remise à zéro.
// Les mérites arrivent juste après la livraison : un gain dans les 10 s qui suivent est compté ici.

import { MeritCounter } from '../../core/merits.js';

export const RESCUE_EVENTS = ['LoadGame', 'Died', 'CollectCargo', 'EjectCargo', 'SearchAndRescue', 'Powerplay', 'PowerplayMerits', 'MaterialCollected'];

// Marchandises acceptées par le contact de recherche et sauvetage (noms internes, en minuscules).
// Celles vues dans une livraison s'y ajoutent.
export const RESCUE_ITEMS = new Set([
  'damagedescapepod', 'occupiedcryopod', 'usscargoblackbox', 'wreckagecomponents',
  'personaleffects', 'thargoidpod', 'usscargomilitaryplans', 'usscargoancientartefact',
  'usscargoexperimentalchemicals', 'usscargoprototypetech', 'usscargorebeltransmissions',
  'usscargotechnicalblueprints', 'usscargotradedata', 'largeexplorationdatacash', 'smallexplorationdatacash',
]);
// Types suivis à part dans le HUD (noms internes) ; le reste compte seulement dans le total
export const TYPES = [
  { key: 'pods', label: 'Nacelles', names: ['damagedescapepod', 'occupiedcryopod'] },
  { key: 'blackBoxes', label: 'Boîtes noires', names: ['usscargoblackbox'] },
  { key: 'wreckage', label: "Débris d'épave", names: ['wreckagecomponents'] },
];
export const MERIT_WINDOW_MS = 10_000;
const RECENT = 20;

const lower = (s) => String(s || '').toLowerCase();

export class RescueState {
  /**
   * @param gradeOf nom interne d'un matériau → grade (1 à 5), ou null s'il est inconnu
   * @param labelOf (nom interne, nom donné par le jeu) → nom affiché (le jeu n'écrit pas toujours le nom français)
   */
  constructor(gradeOf = () => null, labelOf = (key, localised) => localised || key) {
    this.gradeOf = gradeOf;
    this.labelOf = labelOf;
    this.items = new Set(RESCUE_ITEMS);
    this.counter = new MeritCounter(); // total du jeu : ne repart pas de zéro avec la session
    this.reset(null);
  }

  reset(startedAt) {
    this.startedAt = startedAt;
    this.collected = 0;
    this.collectedByName = {}; // nom interne → nombre récupéré
    this.delivered = 0;
    this.lost = 0; // larguées, ou perdues à la destruction du vaisseau
    this.credits = 0;
    this.merits = 0;
    this.deaths = 0;
    this.recent = []; // derniers événements, du plus récent au plus ancien
    this.lastDeliveryAt = null;
    this.lastActionAt = null;
    this.materials = new Map(); // nom interne → { label, grade, count }
  }

  isRescue(name) {
    return this.items.has(lower(name));
  }

  apply(ev) {
    switch (ev.event) {
      case 'LoadGame':
        this.reset(ev.timestamp);
        break;
      case 'CollectCargo':
        if (!this.isRescue(ev.Type)) return false;
        this.collected++;
        this.collectedByName[lower(ev.Type)] = (this.collectedByName[lower(ev.Type)] || 0) + 1;
        this.log(ev, 'Récupéré', ev.Type_Localised || ev.Type, 1, 0);
        break;
      case 'EjectCargo':
        if (!this.isRescue(ev.Type)) return false;
        this.lost += ev.Count || 0;
        this.log(ev, 'Largué', ev.Type_Localised || ev.Type, ev.Count || 0, 0);
        break;
      case 'SearchAndRescue':
        this.items.add(lower(ev.Name));
        this.delivered += ev.Count || 0;
        this.credits += ev.Reward || 0;
        this.lastDeliveryAt = Date.parse(ev.timestamp);
        this.log(ev, 'Livré', ev.Name_Localised || ev.Name, ev.Count || 0, ev.Reward || 0);
        break;
      case 'Powerplay':
        this.counter.setTotal(ev.Merits);
        return false;
      case 'PowerplayMerits': {
        const gained = this.counter.gain(ev); // doublons du journal retirés
        if (this.lastDeliveryAt == null || Date.parse(ev.timestamp) - this.lastDeliveryAt > MERIT_WINDOW_MS) return false;
        this.merits += gained;
        if (this.recent[0]?.kind === 'Livré') this.recent[0].merits += gained;
        break;
      }
      case 'Died':
        this.deaths++;
        break;
      case 'MaterialCollected': {
        const key = lower(ev.Name);
        const count = Number.isInteger(ev.Count) && ev.Count > 0 ? ev.Count : 0;
        if (!key || !count) return false;
        const m = this.materials.get(key) || { label: this.labelOf(key, ev.Name_Localised) || ev.Name, grade: this.gradeOf(key), count: 0 };
        m.count += count;
        this.materials.set(key, m);
        break;
      }
      default:
        return false;
    }
    return true;
  }

  log(ev, kind, label, count, reward) {
    this.lastActionAt = ev.timestamp;
    this.recent.unshift({ at: ev.timestamp, kind, label, count, reward, merits: 0 });
    if (this.recent.length > RECENT) this.recent.length = RECENT;
  }

  /** @param cargo soute actuelle [{ name, label, count }] (Cargo.json) */
  summary(cargo = []) {
    const hold = cargo.filter((c) => this.isRescue(c.name)).map((c) => ({ name: lower(c.name), label: c.label, count: c.count }));
    const sum = (list, names) => list.reduce((a, c) => a + (names.includes(c.name) ? c.count : 0), 0);
    const counts = Object.entries(this.collectedByName).map(([name, count]) => ({ name, count }));
    return {
      startedAt: this.startedAt,
      collected: this.collected,
      types: TYPES.map((t) => ({ key: t.key, label: t.label, collected: sum(counts, t.names), hold: sum(hold, t.names) })),
      delivered: this.delivered,
      lost: this.lost,
      credits: this.credits,
      merits: this.merits,
      deaths: this.deaths,
      hold: { count: hold.reduce((a, c) => a + c.count, 0), items: hold.map(({ label, count }) => ({ label, count })) },
      lastActionAt: this.lastActionAt,
      recent: this.recent,
      materials: this.materialSummary(),
    };
  }

  /** Matériaux de la session : nombre par grade (G1 → G5) et la liste, du plus haut grade au plus bas. */
  materialSummary() {
    const items = [...this.materials.values()].sort((a, b) => (b.grade || 0) - (a.grade || 0) || b.count - a.count || a.label.localeCompare(b.label, 'fr'));
    const byGrade = [0, 0, 0, 0, 0];
    for (const m of items) if (m.grade >= 1 && m.grade <= 5) byGrade[m.grade - 1] += m.count;
    return { total: items.reduce((a, m) => a + m.count, 0), byGrade, items: items.map(({ label, grade, count }) => ({ label, grade, count })) };
  }
}

export function buildRescue(events) {
  const r = new RescueState();
  for (const ev of events) r.apply(ev);
  return r;
}
