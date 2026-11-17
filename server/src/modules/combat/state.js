// État de la session de combat reconstruit depuis le journal : primes, obligations,
// ennemis abattus et mérites Powerplay gagnés en combat.
//
// Une session commence au lancement du jeu (LoadGame) ou à une remise à zéro.
// Le journal ne dit pas d'où vient un gain de mérites : il est compté « en combat »
// s'il suit un signe de combat récent (ciblage, attaque, kill) et aucune vente,
// livraison ou mission juste avant.
//
// L'état du vaisseau (coque, boucliers, modules : vaisseau.js) ne repart pas de zéro avec la session.

import { MeritCounter } from '../../core/merits.js';
import { EtatVaisseau, VAISSEAU_EVENTS } from './vaisseau.js';

export const COMBAT_EVENTS = [
  'LoadGame', 'Died',
  'Bounty', 'FactionKillBond', 'CapShipBond', 'PVPKill',
  'ShipTargeted', 'UnderAttack',
  'Powerplay', 'PowerplayMerits',
  'MarketSell', 'PowerplayDeliver', 'PowerplayCollect', 'MissionCompleted', 'RedeemVoucher',
  'SellExplorationData', 'MultiSellExplorationData', 'SellOrganicData', 'SearchAndRescue',
  ...VAISSEAU_EVENTS,
];
const ETAT_VAISSEAU = new Set(VAISSEAU_EVENTS);

const COMBAT_SIGNALS = new Set(['Bounty', 'FactionKillBond', 'CapShipBond', 'PVPKill', 'ShipTargeted', 'UnderAttack']);
const OTHER_SOURCES = new Set([
  'MarketSell', 'PowerplayDeliver', 'PowerplayCollect', 'MissionCompleted', 'RedeemVoucher',
  'SellExplorationData', 'MultiSellExplorationData', 'SellOrganicData', 'SearchAndRescue',
]);
export const COMBAT_WINDOW_MS = 60_000; // un gain de mérites jusqu'à 1 min après un signe de combat
export const OTHER_WINDOW_MS = 10_000; // mais pas dans les 10 s qui suivent une vente ou une livraison
export const KILL_MERIT_MS = 15_000; // mérites d'un kill : reçus 0 à 3 s après le plus souvent, jusqu'à 14 s (journaux de référence, 3-5 nov. 2026)
const RECENT = 20;

const at = (ev) => Date.parse(ev.timestamp);

export class CombatState {
  constructor() {
    this.counter = new MeritCounter(); // total du jeu : ne repart pas de zéro avec la session
    this.vaisseau = new EtatVaisseau(); // le vaisseau non plus
    this.reset(null);
  }

  reset(startedAt) {
    this.startedAt = startedAt;
    this.bounties = { total: 0, count: 0 };
    this.bonds = { total: 0, count: 0 };
    this.capShip = { total: 0, count: 0 };
    this.pvp = 0;
    this.merits = { combat: 0, other: 0 };
    this.deaths = 0;
    this.recent = []; // derniers kills, du plus récent au plus ancien
    this.lastCombatAt = null;
    this.lastOtherAt = null;
    this.lastKillAt = null;
    this.pending = []; // kills qui attendent leurs mérites : { entry, slots } ; slots = une ligne par faction de la prime
    this.dernierGain = null; // dernière ligne de mérites rattachée à un kill : { p, montant, kill }, pour l'annuler
  }

  apply(ev) {
    if (ETAT_VAISSEAU.has(ev.event)) return this.vaisseau.apply(ev);
    const t = at(ev);
    if (COMBAT_SIGNALS.has(ev.event) && !(ev.event === 'ShipTargeted' && !ev.TargetLocked)) this.lastCombatAt = t;
    if (OTHER_SOURCES.has(ev.event)) this.lastOtherAt = t;

    switch (ev.event) {
      case 'LoadGame':
        this.reset(ev.timestamp);
        break;
      case 'Bounty': {
        const reward = ev.TotalReward ?? ev.Reward ?? 0;
        this.bounties.total += reward;
        this.bounties.count++;
        this.kill(ev, 'Prime', reward, ev.VictimFaction);
        break;
      }
      case 'FactionKillBond':
        this.bonds.total += ev.Reward || 0;
        this.bonds.count++;
        this.kill(ev, 'Obligation', ev.Reward || 0, ev.VictimFaction);
        break;
      case 'CapShipBond':
        this.capShip.total += ev.Reward || 0;
        this.capShip.count++;
        this.kill(ev, 'Vaisseau capital', ev.Reward || 0, ev.VictimFaction);
        break;
      case 'PVPKill':
        this.pvp++;
        this.kill(ev, 'Joueur', 0, null, ev.Victim);
        break;
      case 'Powerplay':
        this.counter.setTotal(ev.Merits);
        return false;
      case 'PowerplayMerits': {
        const gained = this.counter.gain(ev); // doublons du journal retirés
        const annonce = ev.MeritsGained || 0;
        // Ligne qui corrige la précédente (TotalMerits plus bas qu'annoncé : 13:50:13 +2 015, puis 13:50:22 +1 773 qui
        // l'annule, 7 nov. 2026) : le kill qui avait reçu la ligne annulée la rend, et retrouve sa place pour la vraie.
        if (gained < annonce) this.annulerDernierGain(gained - annonce);
        this.dernierGain = null;
        if (this.isCombatMerit(t)) {
          this.merits.combat += gained;
          // Rattachés au kill qui vient d'avoir lieu : une ligne par faction de la prime, pas plus (doublons).
          // Deux kills dans la même seconde se servent dans l'ordre.
          const p = this.pending[0];
          if (p && t - Date.parse(p.entry.at) <= KILL_MERIT_MS) {
            p.entry.merits += annonce;
            if (--p.slots === 0) this.pending.shift();
            this.dernierGain = { p, montant: annonce, kill: this.lastKillAt };
          }
        } else this.merits.other += gained;
        break;
      }
      case 'Died':
        this.deaths++;
        break;
      default:
        return COMBAT_SIGNALS.has(ev.event) || OTHER_SOURCES.has(ev.event);
    }
    return true;
  }

  /**
   * La ligne de mérites d'avant était fausse (`correction` < 0 : ce que le jeu a repris) : le kill qui l'avait reçue la
   * rend, et s'il n'a pas été suivi d'un autre kill, la place qu'elle occupait lui revient.
   */
  annulerDernierGain(correction) {
    const d = this.dernierGain;
    if (!d) return;
    d.p.entry.merits += Math.max(correction, -d.montant);
    if (this.lastKillAt !== d.kill) return;
    d.p.slots++;
    if (!this.pending.includes(d.p)) this.pending.unshift(d.p);
  }

  isCombatMerit(t) {
    const combat = this.lastCombatAt != null && t - this.lastCombatAt <= COMBAT_WINDOW_MS;
    const other = this.lastOtherAt != null && t - this.lastOtherAt <= OTHER_WINDOW_MS;
    return combat && !other;
  }

  kill(ev, kind, reward, faction, pilot) {
    const entry = {
      at: ev.timestamp,
      kind,
      reward,
      ship: ev.Target_Localised || ev.Target || null,
      pilot: pilot || ev.PilotName_Localised || null,
      faction: faction || null,
      merits: 0,
    };
    // Un nouveau kill prend la suite de l'ancien, sauf dans la même seconde : les deux attendent leurs mérites
    if (this.lastKillAt !== ev.timestamp) this.pending = [];
    this.pending.push({ entry, slots: ev.Rewards?.length || 1 });
    this.lastKillAt = ev.timestamp;
    this.recent.unshift(entry);
    if (this.recent.length > RECENT) this.recent.length = RECENT;
  }

  kills() {
    return this.bounties.count + this.bonds.count + this.capShip.count + this.pvp;
  }

  summary() {
    return {
      startedAt: this.startedAt,
      kills: this.kills(),
      credits: this.bounties.total + this.bonds.total + this.capShip.total,
      bounties: this.bounties,
      bonds: this.bonds,
      capShip: this.capShip,
      pvp: this.pvp,
      merits: this.merits,
      deaths: this.deaths,
      lastKillAt: this.lastKillAt,
      recent: this.recent,
    };
  }
}

export function buildCombat(events) {
  const c = new CombatState();
  for (const ev of events) c.apply(ev);
  return c;
}
