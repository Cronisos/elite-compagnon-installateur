// Déclencheurs du compagnon : événements du journal et Status.json → catégorie + contexte (+ cas).
// Pur : aucune lecture de fichier, l'heure est fournie par l'appelant (at, en ms). Champs vérifiés sur de vrais
// journaux (octobre-novembre 2026, jeu 4.4).
//
// Certaines réactions attendent la fin d'une série : ventes (8 s sans nouvelle vente), mérites (20 s), raffinage
// (90 s). tick(at) les libère, et repère la longue inactivité.
//
// Les noms venus du jeu (station, système, vaisseau, PNJ, marchandise) passent par cleanText (core/text.js) :
// entités HTML décodées, espaces retirées, comme partout ailleurs dans l'app.

import { cleanText } from '../../core/text.js';

// Événements lus dans l'historique au démarrage (le reste n'est utile qu'en direct). Les montées et descentes
// (VRS, à pied, chasseur, posé) disent où tu es au moment où l'app démarre.
export const HISTORY_EVENTS = ['LoadGame', 'Commander', 'Loadout', 'Docked', 'Undocked', 'Location', 'FSDJump', 'CarrierJump', 'Shutdown',
  'LaunchSRV', 'DockSRV', 'LaunchFighter', 'DockFighter', 'Disembark', 'Embark', 'Touchdown', 'Liftoff'];

// Indicateurs de Status.json (Flags, puis Flags2)
export const FLAG = {
  docked: 1 << 0,
  landed: 1 << 1,
  lowFuel: 1 << 19,
  danger: 1 << 22,
  beingInterdicted: 1 << 23,
  inMainShip: 1 << 24,
  inFighter: 1 << 25,
  inSRV: 1 << 26,
};
export const FLAG2 = { onFoot: 1 << 0 };

export const SALE_QUIET_MS = 8_000;
export const MERITS_QUIET_MS = 20_000;
export const MINING_QUIET_MS = 90_000;
export const MINING_MIN_TONS = 5;
export const MINING_BIG_TONS = 20;
export const MERITS_MIN = 10;
export const MERITS_BIG = 2000;
export const COMBAT_MS = 60_000; // combat « en cours » jusqu'à 1 min après le dernier signe
export const IDLE_MS = 15 * 60_000;
export const AWAY_DAYS = 3; // bonjour « ça faisait longtemps » au-delà
export const GREETING_DELAY_MS = 6_000; // le temps que le jeu finisse de charger
// Boucliers tombés sans signe de combat juste avant : on attend 15 s qu'il en vienne un (attaque, dégâts, danger),
// sinon c'était autre chose (boucliers coupés, panne d'énergie…) et on se tait
export const SHIELD_WAIT_MS = 15_000;
// Plus rien du jeu (ni journal ni Status.json) pendant 20 min : il a planté ou a été fermé sans « Shutdown »
export const GONE_MS = 20 * 60_000;
const LOAD_QUIET_MS = 45_000; // après un chargement : boucliers « tombés » ignorés (le jeu l'écrit en apparaissant)

// Événements qui ne sont pas une action du joueur (musique, chat des autres, salaires…)
const PASSIVE = new Set(['Music', 'ReceiveText', 'NpcCrewPaidWage', 'Friends', 'CommunityGoal', 'Cargo', 'Statistics', 'SquadronStartup']);
const COMBAT_SIGNS = new Set(['UnderAttack', 'Bounty', 'FactionKillBond', 'CapShipBond', 'PVPKill', 'Interdicted']);
const SUIT = /Suit_Class\d+$/i; // LoadGame à pied : « ExplorationSuit_Class1 » (Combinaison Artemis)
const SRV = /^(testbuggy|mev_rhino|combat_multicrew_srv_\d+)$/i; // Scarabée, Rhino, Scorpion

/** Où est le joueur d'après LoadGame : vaisseau, VRS ou à pied. */
function vehicleAtLoad(ev) {
  if (SUIT.test(String(ev.Ship || ''))) return 'foot';
  if (SRV.test(String(ev.Ship || '')) || /\b(VRS|SRV)\b/.test(String(ev.Ship_Localised || ''))) return 'srv';
  return 'ship';
}

export const DOCK_REASONS = {
  Distance: 'trop loin',
  TooLarge: 'vaisseau trop grand',
  Offences: 'des infractions sur ton dossier',
  NoSpace: 'aucune plateforme libre',
  Hostile: 'on nous considère comme hostiles',
  RestrictedAccess: 'accès réservé',
  ActiveFighter: 'chasseur encore dehors',
  DockOffline: 'amarrage hors service',
  JumpImminent: 'le porteur va sauter',
};

const DOMAINS = {
  Combat: 'Combat',
  Trade: 'Commerce',
  Explore: 'Exploration',
  Soldier: 'Mercenaire',
  Exobiologist: 'Exobiologie',
  CQC: 'CQC',
  Empire: 'Empire',
  Federation: 'Fédération',
};

/** Moment de la journée (heure locale du PC) : matin, aprem, soir ou nuit. */
export function momentOf(date) {
  const h = date.getHours();
  if (h >= 5 && h < 12) return 'matin';
  if (h >= 12 && h < 18) return 'aprem';
  if (h >= 18 && h < 23) return 'soir';
  return 'nuit';
}

/** Nom lisible d'un PNJ ; jamais celui d'un autre joueur, ni un code du jeu ($npc_name…). */
function npcName(ev, field) {
  if (ev.IsPlayer) return 'un autre commandant';
  const name = ev[`${field}_Localised`] || ev[field];
  return typeof name === 'string' && name && !name.trim().startsWith('$') ? cleanText(name).slice(0, 60) || null : null;
}

/** Nom lisible d'une marchandise : celui traduit par le jeu, sinon son code (« iridium », « $iridium_name; ») mis en forme. */
export function goodsName(ev) {
  const label = typeof ev.Type_Localised === 'string' ? cleanText(ev.Type_Localised) : '';
  if (label) return label.slice(0, 60);
  const code = typeof ev.Type === 'string' ? ev.Type.replace(/^\$/, '').replace(/_name;?$/i, '').trim() : '';
  return code ? code.charAt(0).toUpperCase() + code.slice(1, 60) : null;
}

/**
 * Nom à dire : le texte traduit par le jeu, sinon le nom brut, nettoyés (core/text.js) ; rien → null. Le nom brut d'une
 * station est déjà un nom (« TST-001 ») : il n'est pas réécrit comme une clé interne (localised le ferait).
 */
const gameName = (translated, raw) => (cleanText(typeof translated === 'string' ? translated : '') || cleanText(typeof raw === 'string' ? raw : '')).slice(0, 60) || null;

const hhmm = (iso) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : null;
};

export class Triggers {
  /** @param opts { minProfit, bigProfit, idleMs } */
  constructor(opts = {}) {
    this.minProfit = opts.minProfit ?? 1_000_000;
    this.bigProfit = opts.bigProfit ?? 20_000_000;
    this.idleMs = opts.idleMs ?? IDLE_MS;
    this.commander = null;
    this.fuelCapacity = null;
    this.station = null;
    this.docked = false;
    this.visited = new Set();
    this.lastSeen = null; // dernier événement connu (ms), pour le bonjour après une longue absence
    this.sessionFrom = null; // dernier événement avant la session en cours
    this.gameOn = false;
    this.lastSignal = null; // dernier signe de vie du jeu (journal ou Status.json), en direct
    this.lastActivity = null;
    this.sleeping = false;
    this.combatUntil = -Infinity;
    this.danger = false;
    this.flags = null;
    this.quietUntil = -Infinity;
    this.shieldsDownAt = null;
    this.shieldsPending = null; // boucliers tombés, en attente d'un signe de combat
    this.vehicle = null; // ship, srv, foot, fighter ou other (taxi, équipage) ; inconnu : vaisseau
    this.landed = false;
    this.diedOnFoot = null;
    this.sale = null;
    this.merits = null;
    this.mining = null;
  }

  configure({ minProfit, bigProfit } = {}) {
    if (Number.isFinite(minProfit)) this.minProfit = minProfit;
    if (Number.isFinite(bigProfit)) this.bigProfit = bigProfit;
  }

  /** Historique du démarrage : nom du CMDR, réservoir, systèmes déjà visités. Ne déclenche rien. */
  prime(history) {
    for (const ev of history) this.learn(ev);
  }

  learn(ev) {
    const t = Date.parse(ev.timestamp);
    if (Number.isFinite(t) && (this.lastSeen == null || t > this.lastSeen)) this.lastSeen = t;
    switch (ev.event) {
      case 'LoadGame':
        this.commander = ev.Commander || this.commander;
        this.vehicle = vehicleAtLoad(ev);
        this.landed = false;
        break;
      case 'LaunchSRV':
        if (ev.PlayerControlled !== false) this.vehicle = 'srv';
        break;
      case 'LaunchFighter':
        if (ev.PlayerControlled === true) this.vehicle = 'fighter';
        break;
      case 'DockSRV':
      case 'DockFighter':
        this.vehicle = 'ship';
        break;
      case 'Disembark':
        this.vehicle = 'foot';
        break;
      case 'Embark':
        this.vehicle = ev.SRV ? 'srv' : ev.Taxi || ev.Multicrew ? 'other' : 'ship';
        break;
      case 'Touchdown':
        this.landed = true;
        break;
      case 'Liftoff':
        this.landed = false;
        break;
      case 'Commander':
        this.commander = ev.Name || this.commander;
        break;
      case 'Loadout':
        this.fuelCapacity = Number(ev.FuelCapacity?.Main) || this.fuelCapacity;
        break;
      case 'Docked':
        this.docked = true;
        this.station = gameName(ev.StationName_Localised, ev.StationName);
        break;
      case 'Undocked':
        this.docked = false;
        this.station = null;
        break;
      case 'Location':
        this.docked = Boolean(ev.Docked);
        this.station = ev.Docked ? gameName(ev.StationName_Localised, ev.StationName) : null;
        if (ev.StarSystem) this.visited.add(ev.StarSystem);
        break;
      case 'FSDJump':
        this.docked = false;
        this.station = null;
        if (ev.StarSystem) this.visited.add(ev.StarSystem);
        break;
      case 'CarrierJump':
        if (ev.StarSystem) this.visited.add(ev.StarSystem);
        break;
      default:
    }
  }

  inCombat(at) {
    return this.danger || at < this.combatUntil;
  }

  /** Signe de combat : le combat dure encore 1 min, et des boucliers tombés juste avant sont signalés. */
  combatSign(at, out) {
    this.combatUntil = Math.max(this.combatUntil, at + COMBAT_MS);
    if (this.shieldsPending == null) return;
    const recent = at - this.shieldsPending <= SHIELD_WAIT_MS;
    this.shieldsPending = null;
    if (recent) this.shieldsDown(at, out);
  }

  shieldsDown(at, out) {
    this.shieldsDownAt = at;
    out.push({ category: 'boucliers', ctx: {} });
  }

  /** Action du joueur : fin de l'ennui (réveil). */
  activity(at, out) {
    this.lastActivity = at;
    if (this.sleeping) {
      this.sleeping = false;
      out.push({ category: 'reveil', ctx: {} });
    }
  }

  /**
   * Événement du journal reçu en direct.
   * @returns déclencheurs [{ category, ctx, cas?, delay? }]
   */
  event(ev, at) {
    const out = [];
    if (!ev || typeof ev.event !== 'string') return out;
    if (ev.event === 'Fileheader') this.sessionFrom = this.lastSeen;
    this.lastSignal = at;
    const before = this.lastSeen;
    const wasDocked = this.docked;
    const known = ev.event === 'FSDJump' && this.visited.has(ev.StarSystem);
    this.learn(ev);
    if (ev.event === 'Shutdown') {
      this.gameOn = false;
      this.sleeping = false;
      out.push({ category: 'aurevoir', ctx: {} });
      return out;
    }
    this.gameOn = true;
    if (!PASSIVE.has(ev.event)) this.activity(at, out);
    if (COMBAT_SIGNS.has(ev.event) && (ev.event !== 'UnderAttack' || ev.Target === 'You')) this.combatSign(at, out);

    switch (ev.event) {
      case 'LoadGame': {
        this.quietUntil = at + LOAD_QUIET_MS;
        this.combatUntil = -Infinity;
        this.shieldsPending = null;
        const from = this.sessionFrom ?? before;
        this.sessionFrom = null;
        const away = from != null && Date.parse(ev.timestamp) - from >= AWAY_DAYS * 86_400_000;
        out.push({
          category: 'bonjour',
          cas: away ? 'retour' : momentOf(new Date(at)),
          // Le modèle (« Ton Type-11 Prospector »), pas le nom donné au vaisseau ; à pied, pas de vaisseau
          ctx: { cmdr: ev.Commander || this.commander, vaisseau: this.vehicle === 'foot' ? null : cleanText(ev.Ship_Localised).slice(0, 60) || null },
          delay: GREETING_DELAY_MS,
        });
        break;
      }
      case 'Location':
        this.quietUntil = at + LOAD_QUIET_MS;
        break;
      case 'MarketSell': {
        const count = Number(ev.Count) || 0;
        const profit = (Number(ev.SellPrice) - Number(ev.AvgPricePaid || 0)) * count;
        if (!Number.isFinite(profit) || !count) break;
        const name = goodsName(ev);
        const s = this.sale || (this.sale = { profit: 0, count: 0, items: new Map(), station: this.station });
        s.profit += profit;
        s.count += count;
        s.items.set(name, (s.items.get(name) || 0) + profit);
        s.at = at;
        break;
      }
      case 'PowerplayMerits': {
        const gained = Number(ev.MeritsGained) || 0;
        if (gained <= 0) break;
        const m = this.merits || (this.merits = { sum: 0 });
        m.sum += gained;
        m.total = Number(ev.TotalMerits) || m.total;
        m.power = ev.Power || m.power;
        m.at = at;
        break;
      }
      case 'MiningRefined': {
        const m = this.mining || (this.mining = { count: 0, types: new Map() });
        const type = goodsName(ev);
        m.count += 1;
        m.types.set(type, (m.types.get(type) || 0) + 1);
        m.at = at;
        break;
      }
      case 'DockingGranted':
        out.push({ category: 'amarrage', ctx: { station: gameName(ev.StationName_Localised, ev.StationName), plateforme: Number.isFinite(ev.LandingPad) ? ev.LandingPad : null } });
        break;
      case 'DockingDenied': {
        const reason = Object.hasOwn(DOCK_REASONS, ev.Reason) ? ev.Reason : null;
        out.push({
          category: 'refus',
          cas: reason ? reason.toLowerCase() : undefined,
          ctx: { station: gameName(ev.StationName_Localised, ev.StationName), raison: reason ? DOCK_REASONS[reason] : 'sans explication' },
        });
        break;
      }
      case 'Interdicted':
        out.push({ category: 'interdiction', cas: ev.Submitted ? 'soumis' : undefined, ctx: { interdicteur: npcName(ev, 'Interdictor') } });
        break;
      case 'EscapeInterdiction':
        out.push({ category: 'evasion', ctx: { interdicteur: npcName(ev, 'Interdictor') } });
        break;
      case 'ShieldState':
        if (ev.ShieldsUp === false) {
          // Le jeu l'écrit aussi pour le VRS et la combinaison, quand tu coupes tes boucliers ou manques d'énergie :
          // seulement le vaisseau, en vol hors station, et en combat (signe juste avant, ou dans les 15 s)
          const inShip = this.vehicle == null || this.vehicle === 'ship';
          if (wasDocked || at < this.quietUntil || !inShip || this.landed) break;
          if (this.inCombat(at)) this.shieldsDown(at, out);
          else this.shieldsPending = at;
        } else if (ev.ShieldsUp === true) {
          this.shieldsPending = null;
          if (this.shieldsDownAt == null) break;
          const recent = at - this.shieldsDownAt < 10 * 60_000;
          this.shieldsDownAt = null;
          if (recent) out.push({ category: 'boucliersRetour', ctx: {} });
        }
        break;
      case 'HullDamage': {
        if (ev.PlayerPilot !== true || ev.Fighter) break;
        const health = Number(ev.Health);
        if (!Number.isFinite(health)) break;
        this.combatSign(at, out);
        const coque = Math.round(health * 100);
        if (health < 0.35) out.push({ category: 'coqueCritique', ctx: { coque } });
        else if (health < 0.9) out.push({ category: 'degats', ctx: { coque } });
        break;
      }
      case 'Died':
        this.combatUntil = -Infinity;
        this.shieldsDownAt = this.shieldsPending = null;
        this.sale = this.merits = this.mining = null;
        this.diedOnFoot = this.vehicle === 'foot';
        out.push({ category: 'mort', cas: this.diedOnFoot ? 'pied' : 'vaisseau', ctx: {} });
        break;
      case 'Resurrect': {
        this.quietUntil = at + LOAD_QUIET_MS;
        const cost = Number(ev.Cost) || 0;
        const onFoot = this.diedOnFoot ?? this.vehicle === 'foot';
        this.diedOnFoot = null;
        out.push({ category: 'reapparition', cas: onFoot ? 'pied' : cost === 0 ? 'gratuit' : 'rachat', ctx: { cout: cost || null } });
        break;
      }
      case 'Promotion': {
        const key = Object.keys(ev).find((k) => Object.hasOwn(DOMAINS, k));
        if (key) out.push({ category: 'rang', ctx: { domaine: DOMAINS[key], niveau: Number(ev[key]) } });
        break;
      }
      case 'PowerplayRank': {
        // Un rang Powerplay monte souvent : seulement les 10 premiers, puis les rangs ronds
        const rank = Number(ev.Rank);
        if (Number.isInteger(rank) && rank > 0 && (rank <= 10 || rank % 10 === 0)) {
          out.push({ category: 'rang', cas: 'powerplay', ctx: { domaine: 'Powerplay', niveau: rank, puissance: ev.Power || null } });
        }
        break;
      }
      case 'EngineerProgress': {
        if (Array.isArray(ev.Engineers) || !ev.Engineer) break; // liste complète au chargement : rien de nouveau
        const ctx = { ingenieur: String(ev.Engineer).slice(0, 60) };
        if (ev.Progress === 'Unlocked') out.push({ category: 'ingenieur', cas: 'debloque', ctx });
        else if (ev.Progress === 'Invited') out.push({ category: 'ingenieur', cas: 'invite', ctx });
        else if (ev.Progress == null && Number(ev.Rank) === 5) out.push({ category: 'ingenieur', cas: 'grade5', ctx });
        break;
      }
      case 'CarrierJumpRequest':
        out.push({ category: 'porteur', ctx: { systeme: cleanText(ev.SystemName) || null, heure: hhmm(ev.DepartureTime) } });
        break;
      case 'CarrierJump':
        out.push({ category: 'porteurArrivee', ctx: { systeme: cleanText(ev.StarSystem) || null } });
        break;
      case 'FSDJump':
        // Saut vers un autre système : le combat est derrière toi (le jeu réécrit l'état des boucliers à l'arrivée)
        this.combatUntil = -Infinity;
        this.shieldsPending = null;
        if (!known && ev.StarSystem) out.push({ category: 'nouveauSysteme', ctx: { systeme: cleanText(ev.StarSystem), distance: Number(ev.JumpDist) || null } });
        break;
      default:
    }
    return out;
  }

  /**
   * Status.json modifié. initial : lecture au démarrage (on note l'état, sans réagir).
   */
  status(st, at, { initial = false } = {}) {
    const out = [];
    const flags = Number(st?.Flags) || 0;
    const flags2 = Number(st?.Flags2) || 0;
    const prev = this.flags;
    this.flags = flags;
    this.danger = Boolean(flags & FLAG.danger);
    this.docked = Boolean(flags & FLAG.docked);
    if (flags || flags2) {
      this.landed = Boolean(flags & FLAG.landed);
      if (flags2 & FLAG2.onFoot) this.vehicle = 'foot';
      else if (flags & FLAG.inMainShip) this.vehicle = 'ship';
      else if (flags & FLAG.inSRV) this.vehicle = 'srv';
      else if (flags & FLAG.inFighter) this.vehicle = 'fighter';
    }
    if (initial || prev == null) {
      if (flags & FLAG.danger) this.combatUntil = Math.max(this.combatUntil, at + COMBAT_MS);
      return out;
    }
    this.lastSignal = at;
    if (flags & FLAG.danger) this.combatSign(at, out);
    // Indicateurs tous à zéro : menu principal ou jeu qui se ferme, pas une action du joueur
    if (!flags && !flags2) return out;
    this.gameOn = true;
    this.activity(at, out);
    const rose = (bit) => Boolean(flags & bit) && !(prev & bit);
    if (rose(FLAG.beingInterdicted)) out.push({ category: 'interception', ctx: {} });
    if (rose(FLAG.lowFuel) && flags & FLAG.inMainShip && !(flags & FLAG.docked)) {
      const main = Number(st.Fuel?.FuelMain);
      const pct = this.fuelCapacity && Number.isFinite(main) ? Math.round((main / this.fuelCapacity) * 100) : null;
      out.push({ category: 'carburant', ctx: { carburant: pct } });
    }
    return out;
  }

  /**
   * À appeler régulièrement : séries terminées (ventes, mérites, raffinage), longue inactivité, et jeu disparu sans
   * « Shutdown » (plantage, arrêt forcé) : gameOn repasse à false, le prochain événement le remet.
   */
  tick(at) {
    const out = [];
    if (this.shieldsPending != null && at - this.shieldsPending > SHIELD_WAIT_MS) this.shieldsPending = null;
    if (this.gameOn && this.lastSignal != null && at - this.lastSignal >= GONE_MS) {
      this.gameOn = false;
      this.sleeping = false;
    }
    if (this.sale && at - this.sale.at >= SALE_QUIET_MS) {
      const s = this.sale;
      this.sale = null;
      const [name] = [...s.items].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0] || [null];
      const ctx = { marchandise: name, quantite: s.count, station: s.station };
      if (s.profit >= this.bigProfit) out.push({ category: 'jackpot', ctx: { ...ctx, profit: s.profit } });
      else if (s.profit >= this.minProfit) out.push({ category: 'vente', ctx: { ...ctx, profit: s.profit } });
      else if (s.profit <= -1000) out.push({ category: 'perte', ctx: { ...ctx, perte: -s.profit } });
    }
    if (this.merits && at - this.merits.at >= MERITS_QUIET_MS) {
      const m = this.merits;
      this.merits = null;
      if (m.sum >= MERITS_MIN) {
        out.push({ category: 'merites', cas: m.sum >= MERITS_BIG ? 'gros' : undefined, ctx: { merites: m.sum, total: m.total ?? null, puissance: m.power ?? null } });
      }
    }
    if (this.mining && at - this.mining.at >= MINING_QUIET_MS) {
      const m = this.mining;
      this.mining = null;
      if (m.count >= MINING_MIN_TONS) {
        const [type] = [...m.types].sort((a, b) => b[1] - a[1])[0];
        out.push({ category: 'minage', cas: m.count >= MINING_BIG_TONS ? 'gros' : undefined, ctx: { tonnes: m.count, minerai: type } });
      }
    }
    if (this.gameOn && !this.sleeping && this.lastActivity != null && at - this.lastActivity >= this.idleMs) {
      this.sleeping = true;
      out.push({ category: 'ennui', ctx: { minutes: Math.round((at - this.lastActivity) / 60_000) } });
    }
    return out;
  }
}
