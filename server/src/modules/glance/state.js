// État du « Coup d'œil » reconstruit depuis le journal : Powerplay, ce qui reste à encaisser
// (primes, obligations, exploration, exobiologie), missions et marchandises Powerplay.

import { scanValue } from './exploration.js';
import { systemPowerplay } from './powerplay.js';
import { cleanText, localised } from '../../core/text.js';
import { CommunityGoals, COMMUNITY_GOAL_EVENTS } from './communityGoals.js';

export const GLANCE_EVENTS = [
  'Powerplay', 'PowerplayMerits', 'PowerplayRank', 'PowerplayJoin', 'PowerplayLeave',
  'PowerplayCollect', 'PowerplayDeliver',
  'Bounty', 'FactionKillBond', 'RedeemVoucher', 'Died',
  'Scan', 'SAAScanComplete', 'SellExplorationData', 'MultiSellExplorationData',
  'ScanOrganic', 'SellOrganicData',
  'Missions', 'MissionAccepted', 'MissionCompleted', 'MissionAbandoned', 'MissionFailed', 'MissionRedirected',
  'ShipLocker',
  'FSDJump', 'Location', 'CarrierJump',
  ...COMMUNITY_GOAL_EVENTS,
];

/**
 * Historique du casier (journal.addInterest, core/journalService.js) : seul le dernier inventaire complet compte (apply
 * le remplace à chaque fois ; un ShipLocker sans liste ne dit rien). Les précédents ne pèsent plus sur la mémoire du
 * démarrage.
 */
export const LOCKER_HISTORY = Object.freeze({ last: true, useful: (ev) => Array.isArray(ev.Items) || Array.isArray(ev.Components) });

const lower = (s) => String(s || '').toLowerCase();

/**
 * Valeur des primes ou obligations encaissées. Chez un Interstellar Factors, le journal donne la somme
 * touchée après commission (BrokerPercentage, 25 %) : la valeur retirée est celle d'avant commission.
 * Le jeu arrondit la commission faction par faction : 1 cr de marge par faction évite des restes fantômes.
 */
export function voucherValue(ev) {
  const amount = ev.Amount || 0;
  const broker = Number(ev.BrokerPercentage) || 0;
  if (!(broker > 0 && broker < 100)) return amount;
  return Math.ceil((amount * 100) / (100 - broker)) + (ev.Factions?.length || 1);
}

export class GlanceState {
  constructor() {
    this.powerplay = { power: null, rank: null, merits: null, at: null };
    this.bounties = 0;
    this.bonds = 0;
    this.bodies = new Map(); // "systemAddress/bodyId" → { system, scan, mapping }
    this.bio = []; // échantillons analysés non vendus
    this.bioValues = new Map(); // espèce → dernière valeur de vente connue
    this.missions = new Map(); // MissionID → mission
    this.powerplayTypes = new Map(); // marchandises Powerplay vues (nom interne → libellé)
    this.locker = null;
    this.lostAt = null; // dernière destruction (données non vendues perdues)
    this.system = null; // système actuel et son Powerplay, relevé à l'arrivée
    this.readings = new Map(); // dernier relevé de chaque système visité
    this.communityGoals = new CommunityGoals(); // objectifs communautaires rejoints (communityGoals.js)
  }

  apply(ev) {
    if (this.communityGoals.apply(ev)) return true;
    switch (ev.event) {
      case 'Powerplay':
        this.powerplay = { power: ev.Power, rank: ev.Rank, merits: ev.Merits, at: ev.timestamp };
        break;
      case 'PowerplayJoin':
        this.powerplay = { power: ev.Power, rank: 1, merits: 0, at: ev.timestamp };
        break;
      case 'PowerplayLeave':
        this.powerplay = { power: null, rank: null, merits: null, at: ev.timestamp };
        break;
      case 'PowerplayMerits':
        this.powerplay.power = ev.Power || this.powerplay.power;
        if (ev.TotalMerits != null) this.powerplay.merits = ev.TotalMerits;
        else this.powerplay.merits = (this.powerplay.merits || 0) + (ev.MeritsGained || 0);
        break;
      case 'PowerplayRank':
        this.powerplay.rank = ev.Rank;
        break;
      case 'PowerplayCollect':
      case 'PowerplayDeliver':
        this.powerplayTypes.set(lower(ev.Type), ev.Type_Localised || ev.Type);
        break;
      case 'Bounty':
        this.bounties += ev.TotalReward ?? ev.Reward ?? 0;
        break;
      case 'FactionKillBond':
        this.bonds += ev.Reward || 0;
        break;
      case 'RedeemVoucher': {
        const t = lower(ev.Type);
        const value = voucherValue(ev);
        if (t === 'bounty') this.bounties = Math.max(0, this.bounties - value);
        if (t === 'combatbond') this.bonds = Math.max(0, this.bonds - value);
        break;
      }
      case 'Died':
        // Tout ce qui n'est pas encaissé est perdu
        this.bounties = 0;
        this.bonds = 0;
        this.bodies.clear();
        this.bio = [];
        this.lostAt = ev.timestamp;
        break;
      case 'Scan': {
        if (ev.ScanType === 'NavBeaconDetail' || ev.BodyID == null) break;
        const key = `${ev.SystemAddress}/${ev.BodyID}`;
        const prev = this.bodies.get(key);
        this.bodies.set(key, { system: ev.StarSystem, scan: ev, mapping: prev?.mapping || null });
        break;
      }
      case 'SAAScanComplete': {
        const key = `${ev.SystemAddress}/${ev.BodyID}`;
        const b = this.bodies.get(key);
        if (b) b.mapping = ev;
        break;
      }
      case 'SellExplorationData':
        for (const sys of ev.Systems || []) this.forgetSystem(sys);
        break;
      case 'MultiSellExplorationData':
        for (const d of ev.Discovered || []) this.forgetSystem(d.SystemName);
        break;
      case 'ScanOrganic':
        if (ev.ScanType === 'Analyse') {
          this.bio.push({ species: ev.Species, name: ev.Species_Localised || ev.Species, variant: ev.Variant_Localised, firstLogged: ev.WasLogged === false, at: ev.timestamp });
        }
        break;
      case 'SellOrganicData':
        for (const b of ev.BioData || []) {
          this.bioValues.set(b.Species, b.Value || 0);
          const i = this.bio.findIndex((x) => x.species === b.Species);
          if (i >= 0) this.bio.splice(i, 1);
        }
        break;
      case 'Missions':
        this.missions = new Map(
          (ev.Active || []).map((m) => [m.MissionID, { id: m.MissionID, name: cleanText(m.Name), passenger: !!m.PassengerMission, expiresAt: m.Expires != null ? new Date(Date.parse(ev.timestamp) + m.Expires * 1000).toISOString() : null }])
        );
        break;
      case 'MissionAccepted':
        this.missions.set(ev.MissionID, {
          id: ev.MissionID,
          name: localised(ev.LocalisedName, ev.Name), // « 1&nbsp;000&nbsp;000 CR » → « 1 000 000 CR »
          expiresAt: ev.Expiry || null,
          destinationSystem: ev.DestinationSystem || null,
          destinationStation: ev.DestinationStation || null,
          commodity: localised(ev.Commodity_Localised, ev.Commodity),
          count: ev.Count || null,
          reward: ev.Reward || null,
        });
        break;
      case 'MissionRedirected': {
        const m = this.missions.get(ev.MissionID);
        if (m) Object.assign(m, { destinationSystem: ev.NewDestinationSystem, destinationStation: ev.NewDestinationStation });
        break;
      }
      case 'MissionCompleted':
      case 'MissionAbandoned':
      case 'MissionFailed':
        this.missions.delete(ev.MissionID);
        break;
      case 'FSDJump':
      case 'Location':
      case 'CarrierJump': {
        // Le relevé précédent du même système sert à mesurer son évolution
        const current = systemPowerplay(ev);
        current.previous = this.readings.get(current.name) || null;
        this.readings.set(current.name, { at: current.at, label: current.label, points: current.points, conflict: current.conflict });
        this.system = current;
        break;
      }
      case 'ShipLocker':
        if (Array.isArray(ev.Items) || Array.isArray(ev.Components)) this.locker = ev;
        break;
      default:
        return false;
    }
    return true;
  }

  forgetSystem(name) {
    for (const [k, b] of this.bodies) if (b.system === name) this.bodies.delete(k);
  }

  exploration() {
    const systems = new Set();
    let value = 0;
    for (const b of this.bodies.values()) {
      systems.add(b.system);
      value += scanValue(b.scan, b.mapping);
    }
    return { systems: systems.size, bodies: this.bodies.size, value };
  }

  exobiology() {
    let known = 0;
    let unknown = 0;
    const items = this.bio.map((b) => {
      const v = this.bioValues.get(b.species);
      if (v != null) known += v;
      else unknown++;
      return { ...b, value: v ?? null };
    });
    return { count: items.length, value: known, unknownValues: unknown, items };
  }
}

export function buildGlance(events) {
  const g = new GlanceState();
  for (const ev of events) g.apply(ev);
  return g;
}

const fmt = (n) => Math.round(n).toLocaleString('fr-FR');
const millions = (n) => (n >= 1e6 ? `${(n / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M` : `${fmt(n)}`);

/**
 * Rappels courts et actionnables.
 * @param {object} p { exploration, exobiology, bounties, bonds, cargo, missions, powerplayCargo }
 */
export function reminders({ exploration, exobiology, bounties, bonds, missions, powerplayCargo, missionCargo }, now = Date.now()) {
  const out = [];
  if (exobiology.count) {
    const v = exobiology.value ? ` (${millions(exobiology.value)} cr${exobiology.unknownValues ? ' et plus' : ''})` : '';
    out.push({ level: 'danger', text: `${exobiology.count} échantillon${exobiology.count > 1 ? 's' : ''} exobio à vendre chez Vista Genomics${v} : ne meurs pas.` });
  }
  if (exploration.value >= 1e5) {
    out.push({ level: 'warning', text: `Au moins ${millions(exploration.value)} cr de données d'exploration à vendre (${exploration.systems} système${exploration.systems > 1 ? 's' : ''}).` });
  }
  if (bounties > 0) out.push({ level: 'warning', text: `${millions(bounties)} cr de primes à encaisser.` });
  if (bonds > 0) out.push({ level: 'warning', text: `${millions(bonds)} cr d'obligations de combat à encaisser.` });
  for (const c of powerplayCargo) out.push({ level: 'warning', text: `Marchandise Powerplay en soute à livrer : ${fmt(c.count)} t ${c.label}.` });
  if (missionCargo > 0) out.push({ level: 'info', text: `${fmt(missionCargo)} t de marchandises de mission en soute.` });
  for (const m of missions) {
    if (!m.expiresAt) continue;
    const left = (Date.parse(m.expiresAt) - now) / 3600e3;
    if (left > 0 && left < 2) out.push({ level: 'warning', text: `Mission « ${m.name} » : expire dans ${Math.max(1, Math.round(left * 60))} min.` });
  }
  return out;
}
