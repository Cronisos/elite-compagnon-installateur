// Inventaire des matériaux reconstruit depuis le journal.
// « Materials » (à chaque lancement du jeu) donne l'état complet ; les autres événements
// ajoutent ou retirent des quantités jusqu'au « Materials » suivant.

export const MATERIAL_EVENTS = [
  'Materials', 'MaterialCollected', 'MaterialDiscarded', 'EngineerCraft', 'MaterialTrade',
  'Synthesis', 'TechnologyBroker', 'MissionCompleted', 'ScientificResearch', 'EngineerContribution',
];

const TYPES = ['Raw', 'Manufactured', 'Encoded'];

export class Inventory {
  constructor() {
    this.items = new Map(); // nom interne → { key, label, type, count }
    this.baselineAt = null;
    this.lastAt = null;
  }

  add(name, count, extra = {}) {
    if (!name || !Number.isFinite(count)) return;
    const key = String(name).toLowerCase();
    const it = this.items.get(key) || { key, label: null, type: null, count: 0 };
    it.count = Math.max(0, it.count + count);
    if (extra.label) it.label = extra.label;
    if (extra.type && TYPES.includes(extra.type)) it.type = extra.type;
    this.items.set(key, it);
  }

  apply(ev) {
    switch (ev.event) {
      case 'Materials':
        this.items.clear();
        for (const type of TYPES) {
          for (const m of ev[type] || []) this.add(m.Name, m.Count || 0, { label: m.Name_Localised, type });
        }
        this.baselineAt = ev.timestamp;
        break;
      case 'MaterialCollected':
        this.add(ev.Name, ev.Count || 0, { label: ev.Name_Localised, type: ev.Category });
        break;
      case 'MaterialDiscarded':
        this.add(ev.Name, -(ev.Count || 0));
        break;
      case 'EngineerCraft':
        for (const i of ev.Ingredients || []) this.add(i.Name, -(i.Count || 0), { label: i.Name_Localised });
        break;
      case 'Synthesis':
        for (const i of ev.Materials || []) this.add(i.Name, -(i.Count || 0), { label: i.Name_Localised });
        break;
      case 'TechnologyBroker':
        for (const i of ev.Materials || []) this.add(i.Name, -(i.Count || 0), { label: i.Name_Localised, type: i.Category });
        break;
      case 'MaterialTrade':
        if (ev.Paid) this.add(ev.Paid.Material, -(ev.Paid.Quantity || 0), { label: ev.Paid.Material_Localised, type: ev.Paid.Category });
        if (ev.Received) this.add(ev.Received.Material, ev.Received.Quantity || 0, { label: ev.Received.Material_Localised, type: ev.Received.Category });
        break;
      case 'MissionCompleted':
        for (const m of ev.MaterialsReward || []) this.add(m.Name, m.Count || 0, { label: m.Name_Localised, type: m.Category });
        break;
      case 'ScientificResearch':
        this.add(ev.Name, -(ev.Count || 0), { label: ev.Name_Localised, type: ev.Category });
        break;
      case 'EngineerContribution':
        if (ev.Type === 'Materials') this.add(ev.Material, -(ev.Quantity || 0), { label: ev.Material_Localised });
        break;
      default:
        return false;
    }
    this.lastAt = ev.timestamp;
    return true;
  }

  count(key) {
    return this.items.get(key)?.count || 0;
  }

  toJSON() {
    return [...this.items.values()];
  }
}

/** Inventaire complet à partir d'une liste d'événements (ordre chronologique). */
export function buildInventory(events) {
  const inv = new Inventory();
  for (const ev of events) inv.apply(ev);
  return inv;
}

/**
 * Contrôle de cohérence : avant chaque « Materials », compare l'inventaire calculé
 * à celui que donne le jeu. Renvoie la liste des écarts.
 */
export function verifyInventory(events) {
  const inv = new Inventory();
  const reports = [];
  for (const ev of events) {
    if (ev.event === 'Materials' && inv.baselineAt) {
      const diffs = [];
      const game = new Map();
      for (const type of TYPES) for (const m of ev[type] || []) game.set(String(m.Name).toLowerCase(), m.Count || 0);
      const keys = new Set([...game.keys(), ...inv.items.keys()]);
      for (const k of keys) {
        const a = inv.count(k);
        const b = game.get(k) || 0;
        if (a !== b) diffs.push({ key: k, computed: a, game: b });
      }
      reports.push({ from: inv.baselineAt, to: ev.timestamp, diffs });
    }
    inv.apply(ev);
  }
  return reports;
}
