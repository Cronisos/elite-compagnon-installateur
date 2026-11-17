// Échangeurs de matériaux que le joueur connaît, appris dans son journal : stations où il s'est amarré qui en ont un
// (Docked, StationServices « materialtrader »), leur type (exact quand il y a déjà échangé : MaterialTrade TraderType ;
// sinon déduit de l'économie de la station), et la position des systèmes visités (StarPos). Le plus proche d'un type,
// à vol d'oiseau depuis la position du joueur. Rien n'est inventé : un échangeur jamais vu n'existe pas ici.

import { distanceLy, positionOf } from './position.js';

const TYPES = { raw: 'Raw', manufactured: 'Manufactured', encoded: 'Encoded' };
// Type d'un échangeur selon l'économie principale de sa station (règle du jeu publiée ; « déduit » dans l'app)
const PAR_ECONOMIE = { extraction: 'Raw', refinery: 'Raw', industrial: 'Manufactured', hightech: 'Encoded', military: 'Encoded' };
const MAX_STATIONS = 2000;
const MAX_SYSTEMES = 50000;

const economie = (s) => /^\$economy_(\w+);$/.exec(String(s || ''))?.[1]?.toLowerCase() || null;

export class Traders {
  constructor() {
    this.stations = new Map(); // MarketID → { station, system, systemAddress, type, exact }
    this.systemes = new Map(); // SystemAddress → { system, starPos }
  }

  apply(ev) {
    const p = positionOf(ev);
    if (p?.systemAddress != null && (this.systemes.size < MAX_SYSTEMES || this.systemes.has(p.systemAddress))) {
      this.systemes.set(p.systemAddress, { system: p.system, starPos: p.starPos });
    }
    if (ev.event === 'Docked' && Number.isSafeInteger(ev.MarketID) && Array.isArray(ev.StationServices)) {
      if (!ev.StationServices.includes('materialtrader')) return;
      const avant = this.stations.get(ev.MarketID);
      if (!avant && this.stations.size >= MAX_STATIONS) return;
      const deduit = PAR_ECONOMIE[economie(ev.StationEconomy)] || null;
      this.stations.set(ev.MarketID, {
        station: typeof ev.StationName === 'string' ? ev.StationName : '?',
        system: typeof ev.StarSystem === 'string' ? ev.StarSystem : '?',
        systemAddress: Number.isSafeInteger(ev.SystemAddress) ? ev.SystemAddress : null,
        type: avant?.exact ? avant.type : deduit,
        exact: Boolean(avant?.exact),
      });
    }
    if (ev.event === 'MaterialTrade' && Number.isSafeInteger(ev.MarketID)) {
      const type = TYPES[String(ev.TraderType || '').toLowerCase()];
      const s = this.stations.get(ev.MarketID);
      if (type && s) Object.assign(s, { type, exact: true });
    }
  }

  /**
   * Échangeurs connus d'un type (Raw, Manufactured, Encoded), du plus proche au plus loin depuis `starPos` ; ceux dont
   * le système n'a pas de position connue à la fin. [{ station, system, distanceAl, exact }], au plus `n`.
   */
  plusProches(type, starPos, n = 3) {
    return [...this.stations.values()]
      .filter((s) => s.type === type)
      .map((s) => {
        const sys = s.systemAddress != null ? this.systemes.get(s.systemAddress) : null;
        return { station: s.station, system: s.system, exact: s.exact, distanceAl: sys && starPos ? Math.round(distanceLy(starPos, sys.starPos) * 10) / 10 : null };
      })
      .sort((a, b) => (a.distanceAl ?? Infinity) - (b.distanceAl ?? Infinity))
      .slice(0, n);
  }
}
