// État de la session de combat au sol (Odyssey) reconstruit depuis le journal : kills en zone de conflit (obligations
// de combat), primes à pied, mérites Powerplay gagnés à pied, morts, consommables utilisés, crimes, largages de
// Frontline Solutions, et le contexte : guerres du système (factions, enjeu, jours gagnés), installation où tu es,
// combinaison et armes.
//
// À pied ou pas : Disembark (on descend du vaisseau, du SRV ou du taxi) et Embark (on remonte). Les obligations de
// combat et les primes gagnées en vaisseau restent au module Combat : seules celles gagnées à pied comptent ici.
// Une session commence au lancement du jeu (LoadGame) ou à une remise à zéro. Une relance du jeu en plein combat (pour se
// débloquer, revenir en ligne) ne la coupe pas : un LoadGame moins de RELANCE_MS après le dernier événement la continue.

import { MeritCounter } from '../../core/merits.js';

export const GROUND_EVENTS = [
  'LoadGame', 'Location', 'FSDJump', 'CarrierJump', 'Disembark', 'Embark', 'Died', 'Resurrect',
  'FactionKillBond', 'Bounty', 'CommitCrime', 'UseConsumable', 'SuitLoadout', 'SwitchSuitLoadout',
  'ApproachSettlement', 'BookDropship', 'DropshipDeploy', 'Powerplay', 'PowerplayMerits',
];
export const RECENT = 15;
export const RELANCE_MS = 30 * 60_000;

const at = (ev) => Date.parse(ev.timestamp);
const nom = (ev, cle) => ev[`${cle}_Localised`] || ev[cle] || null;
const ajouter = (map, cle, n = 1) => map.set(cle, (map.get(cle) || 0) + n);
const trie = (map) => [...map].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));

/** Guerres et guerres civiles d'un système (Conflicts de FSDJump / Location), lisibles. */
export function guerresDe(ev) {
  return (ev.Conflicts || [])
    .filter((c) => ['war', 'civilwar'].includes(String(c.WarType || '').toLowerCase()))
    .map((c) => ({
      type: String(c.WarType).toLowerCase() === 'civilwar' ? 'Guerre civile' : 'Guerre',
      enCours: String(c.Status || '').toLowerCase() === 'active',
      a: { nom: c.Faction1?.Name || '?', enjeu: c.Faction1?.Stake || null, jours: c.Faction1?.WonDays ?? 0 },
      b: { nom: c.Faction2?.Name || '?', enjeu: c.Faction2?.Stake || null, jours: c.Faction2?.WonDays ?? 0 },
    }));
}

export class GroundCombatState {
  constructor() {
    this.counter = new MeritCounter(); // total du jeu : ne repart pas de zéro avec la session
    this.aPied = false;
    this.systeme = null;
    this.guerres = [];
    this.installation = null;
    this.equipement = null;
    this.vuA = null; // heure du dernier événement lu (ms)
    this.reset(null);
  }

  reset(startedAt) {
    this.startedAt = startedAt;
    this.kills = 0;
    this.bonds = 0; // crédits d'obligations de combat
    this.primes = { n: 0, total: 0 };
    this.merites = 0;
    this.morts = 0;
    this.crimes = 0;
    this.largages = 0;
    this.parVictime = new Map(); // faction abattue → kills
    this.parPayeur = new Map(); // faction qui paie → crédits
    this.consommables = new Map(); // nom → utilisations
    this.recent = []; // derniers kills, du plus récent au plus ancien : { at, victime, payeur, reward, kind }
    this.premierKillAt = null;
    this.dernierKillAt = null;
  }

  kill(ev, kind, reward, victime, payeur) {
    const t = at(ev);
    this.kills += 1;
    this.premierKillAt ??= t;
    this.dernierKillAt = t;
    if (victime) ajouter(this.parVictime, victime);
    if (payeur && reward) ajouter(this.parPayeur, payeur, reward);
    this.recent.unshift({ at: ev.timestamp, kind, victime, payeur, reward });
    this.recent.length = Math.min(this.recent.length, RECENT);
  }

  apply(ev) {
    const t = at(ev);
    const avant = this.vuA;
    if (Number.isFinite(t)) this.vuA = t;
    switch (ev.event) {
      case 'LoadGame':
        this.aPied = false;
        if (avant == null || !(t - avant < RELANCE_MS)) this.reset(ev.timestamp); // relance en plein combat : on continue
        return true;
      case 'Location':
      case 'FSDJump':
      case 'CarrierJump':
        this.systeme = ev.StarSystem || this.systeme;
        this.guerres = guerresDe(ev);
        if (ev.event === 'Location') this.aPied = Boolean(ev.OnFoot);
        if (ev.event !== 'Location') this.installation = null;
        return true;
      case 'Disembark':
        this.aPied = true;
        return true;
      case 'Embark':
        this.aPied = false;
        return true;
      case 'ApproachSettlement':
        this.installation = { nom: nom(ev, 'Name'), faction: ev.StationFaction?.Name || null, corps: ev.BodyName || null };
        return true;
      case 'SuitLoadout':
      case 'SwitchSuitLoadout':
        this.equipement = {
          combinaison: nom(ev, 'SuitName'),
          config: ev.LoadoutName || null,
          armes: (Array.isArray(ev.Modules) ? ev.Modules.filter((m) => m && typeof m === 'object') : []).map((m) => m.ModuleName_Localised || m.ModuleName).filter(Boolean),
        };
        return true;
      case 'FactionKillBond':
        if (!this.aPied) return false;
        this.bonds += ev.Reward || 0;
        this.kill(ev, 'bond', ev.Reward || 0, nom(ev, 'VictimFaction'), nom(ev, 'AwardingFaction'));
        return true;
      case 'Bounty':
        if (!this.aPied) return false;
        this.primes.n += 1;
        this.primes.total += ev.TotalReward || ev.Reward || 0;
        this.kill(ev, 'prime', ev.TotalReward || ev.Reward || 0, nom(ev, 'VictimFaction'), ev.Rewards?.[0]?.Faction || nom(ev, 'Faction'));
        return true;
      case 'Died':
        if (!this.aPied) return false;
        this.morts += 1;
        return true;
      case 'Resurrect':
        this.aPied = false; // réapparition : à bord ou en station, l'Embark suivant le confirme
        return false;
      case 'CommitCrime':
        if (!this.aPied) return false;
        this.crimes += 1;
        return true;
      case 'UseConsumable':
        ajouter(this.consommables, nom(ev, 'Name') || 'Consommable');
        return true;
      case 'BookDropship':
      case 'DropshipDeploy':
        if (ev.event === 'DropshipDeploy') this.largages += 1;
        return ev.event === 'DropshipDeploy';
      case 'Powerplay':
        this.counter.setTotal(ev.Merits);
        return false;
      case 'PowerplayMerits': {
        const gagne = this.counter.gain(ev);
        if (!this.aPied) return false;
        this.merites += gagne;
        return gagne !== 0;
      }
      default:
        return false;
    }
  }

  /** Ce que montrent la page et le HUD. */
  summary() {
    const minutes = this.premierKillAt && this.dernierKillAt > this.premierKillAt ? (this.dernierKillAt - this.premierKillAt) / 60000 : null;
    return {
      startedAt: this.startedAt,
      aPied: this.aPied,
      kills: this.kills,
      bonds: this.bonds,
      primes: { ...this.primes },
      gains: this.bonds + this.primes.total,
      merites: this.merites,
      morts: this.morts,
      crimes: this.crimes,
      largages: this.largages,
      // kills par heure, entre le premier et le dernier kill de la session (dès 2 kills)
      killsHeure: minutes && this.kills > 1 ? Math.round(((this.kills - 1) / minutes) * 60) : null,
      parVictime: trie(this.parVictime),
      parPayeur: trie(this.parPayeur),
      consommables: trie(this.consommables),
      recent: this.recent.map((k) => ({ ...k })),
      systeme: this.systeme,
      guerres: this.guerres.map((g) => ({ ...g, a: { ...g.a }, b: { ...g.b } })),
      installation: this.installation && { ...this.installation },
      equipement: this.equipement && { ...this.equipement, armes: [...this.equipement.armes] },
    };
  }
}
