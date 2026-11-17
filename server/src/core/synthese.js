// Synthèse de l'état du jeu : UN endroit qui lit tout ce que le jeu écrit (journaux et fichiers d'état) et en tient
// un résumé compact, sans doublons, toujours à jour. Les lecteurs (l'IA de bord d'abord) lisent ce résumé
// (GET /api/etat-jeu, ou le fichier etat-jeu.json du dossier des données) au lieu de refaire chacun leur tri.
//
// Le jeu donne souvent la même chose deux ou trois fois ; la règle est toujours « le plus récent gagne » :
//   - crédits : Status.json (Balance, en direct) > LoadGame (Credits, au lancement) ;
//   - carburant : Status.json (en direct, celui du véhicule où tu es) ; capacité : Loadout ;
//   - soute du vaisseau : Cargo.json = événement Cargo (Vessel « Ship ») ; celle du SRV : événement Cargo (« SRV ») ;
//   - casier et sac à dos (Odyssey) : ShipLocker.json et Backpack.json (les événements du même nom sont souvent vides) ;
//   - équipement : ModulesInfo.json (puissance de chaque module) = événement ModuleInfo ; Loadout pour le reste ;
//   - marché : Market.json = événement Market ; itinéraire : NavRoute.json = événement NavRoute ;
//   - coque : Loadout (HullHealth) puis HullDamage (seulement quand tu pilotes, pas ton chasseur) ;
//   - boucliers : Status.json (bit « bouclier levé ») = événement ShieldState.
// Rien n'est inventé : ce que le jeu ne dit pas reste absent (null), jamais deviné. Les noms d'autres joueurs (chat,
// ailiers, interdicteurs joueurs) ne sont jamais gardés.

import { EventEmitter } from 'node:events';
import { lireStatus } from './statusFlags.js';
import { writeJsonAtomicSync } from './atomic.js';

/**
 * Événements lus par la synthèse et ce que l'historique doit en garder au démarrage (journalService.addInterest) :
 * le dernier suffit pour un état ; les missions gardent tout (rares, et leur nom en clair n'est que dans MissionAccepted).
 */
export const SYNTHESE_DERNIER = [
  'LoadGame', 'Commander', 'Rank', 'Progress', 'Reputation', 'Powerplay', 'Loadout', 'Location', 'FSDJump', 'CarrierJump',
  'Docked', 'Undocked', 'SupercruiseEntry', 'SupercruiseExit', 'ApproachBody', 'LeaveBody', 'Touchdown', 'Liftoff',
  'HullDamage', 'ShieldState', 'FSDTarget', 'NavRoute', 'NavRouteClear', 'Materials', 'EngineerProgress', 'CarrierStats',
  'UnderAttack', 'HeatWarning', 'HeatDamage', 'Interdicted', 'EscapeInterdiction', 'Died', 'Resurrect', 'LaunchSRV',
  'DockSRV', 'SRVDestroyed', 'LaunchFighter', 'DockFighter', 'Embark', 'Disembark', 'Cargo', 'Missions',
];
export const SYNTHESE_TOUS = ['MissionAccepted', 'MissionCompleted', 'MissionFailed', 'MissionAbandoned', 'MissionRedirected'];

const MAX_EVENEMENTS = 15;
const BOUCLIER_LU_MS = 20_000; // jauge lue sur l'écran : plus vieille, elle ne dit plus rien
const MAX_MISSIONS = 30;
const ECRITURE_MS = 2000; // fichier etat-jeu.json : au plus une écriture toutes les 2 s

const loc = (o, champ) => (o ? o[`${champ}_Localised`] || o[champ] || null : null);
const nom = (x) => (typeof x === 'string' && x.trim() && !x.startsWith('$') ? x.trim() : null);
const arrondi = (x, n = 1) => (Number.isFinite(x) ? Math.round(x * 10 ** n) / 10 ** n : null);
/** Liste d'objets du jeu (soute, sac, casier) → [{ nom, quantite }], les plus nombreux d'abord. */
const objets = (liste) => (Array.isArray(liste) ? liste : [])
  .filter((x) => Number(x?.Count) > 0)
  .map((x) => ({ nom: x.Name_Localised || x.Name, quantite: Number(x.Count), ...(x.Stolen ? { volee: Number(x.Stolen) } : {}) }))
  .sort((a, b) => b.quantite - a.quantite);

/** Libellé court d'un événement marquant (liste « evenements »), ou null s'il ne mérite pas d'y être. */
function marquant(ev, etat) {
  switch (ev.event) {
    case 'UnderAttack': return ev.Target === 'You' ? 'attaqué' : `attaque sur ${ev.Target === 'Fighter' ? 'ton chasseur' : ev.Target === 'Mothership' ? 'ton vaisseau' : 'un allié'}`;
    case 'ShieldState': return ev.ShieldsUp ? 'boucliers revenus' : 'boucliers tombés';
    case 'HullDamage': return ev.PlayerPilot && !ev.Fighter ? `coque à ${Math.round(ev.Health * 100)} %` : null;
    case 'HeatWarning': return 'alerte de chaleur';
    case 'HeatDamage': return 'dégâts de chaleur';
    case 'Interdicted': return ev.Submitted ? 'interdiction subie (soumis)' : 'interdiction subie';
    case 'EscapeInterdiction': return 'interdiction évitée';
    case 'Died': return 'vaisseau détruit';
    case 'FSDJump': return `saut vers ${ev.StarSystem}`;
    case 'Docked': return `à quai à ${ev.StationName}`;
    case 'Undocked': return `décollage de ${ev.StationName}`;
    case 'Touchdown': return ev.PlayerControlled === false ? null : 'posé';
    case 'LaunchSRV': return 'SRV déployé';
    case 'DockSRV': return 'SRV rentré';
    case 'SRVDestroyed': return 'SRV détruit';
    case 'MissionCompleted': return `mission finie : ${etat.missions.get(ev.MissionID)?.nom || ev.LocalisedName || 'mission'}`;
    case 'MissionFailed': return 'mission échouée';
    default: return null;
  }
}

export class Synthese extends EventEmitter {
  /** @param {{ fichier?: string|null, ecrire?: Function, ecritureMs?: number }} [o] fichier : etat-jeu.json, ou rien */
  constructor({ fichier = null, ecrire = writeJsonAtomicSync, ecritureMs = ECRITURE_MS } = {}) {
    super();
    this.fichier = fichier;
    this.ecrire = ecrire;
    this.ecritureMs = ecritureMs;
    this.timer = null;
    this.direct = false; // false pendant la relecture de l'historique : rien n'est écrit
    this.reset();
  }

  reset() {
    this.s = {
      commandant: null, credits: null, creditsAt: null, statutLegal: null,
      rangs: null, reputation: null, powerplay: null,
      vaisseau: null, coque: null, coqueAt: null, boucliers: null, bouclierAt: null,
      position: {}, route: null, cible: null,
      status: null, srv: null,
      soute: null, souteSrv: null, sac: null, casier: null, modules: null,
      materiaux: null, ingenieurs: null, porteVaisseaux: null, marche: null,
      combat: {},
    };
    this.missions = new Map(); // MissionID → { nom, faction, destination, expire, recompense }
    this.actives = null; // MissionID actives d'après le dernier « Missions » (lancement), ou null
    this.evenements = [];
    this.sources = {};
  }

  note(source, at) {
    if (at) this.sources[source] = at;
  }

  /**
   * Changement : regroupé ; en direct seulement, le fichier est réécrit (au plus toutes les 2 s), et seulement si son
   * contenu a changé depuis la dernière écriture réussie (écriture synchrone avec fsync : pas pour rien en plein jeu).
   */
  changed() {
    if (!this.direct || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const vue = this.snapshot();
      this.emit('change', vue);
      if (!this.fichier) return;
      const texte = JSON.stringify(vue);
      if (texte === this.dernierEcrit) return;
      try {
        this.ecrire(this.fichier, vue);
        this.dernierEcrit = texte;
      } catch (err) {
        console.warn(`Synthèse : ${this.fichier} non écrit (${err.message}) ; nouvel essai au prochain changement.`);
      }
    }, this.ecritureMs);
    this.timer.unref?.();
  }

  /** Fin de la relecture de l'historique : la synthèse passe en direct (et s'écrit une première fois). */
  enDirect() {
    this.direct = true;
    this.changed();
  }

  stop() {
    clearTimeout(this.timer);
    this.timer = null;
  }

  applyEvent(ev) {
    if (!ev || typeof ev.event !== 'string') return;
    const s = this.s;
    const at = ev.timestamp || null;
    switch (ev.event) {
      case 'LoadGame':
        s.commandant = nom(ev.Commander);
        if (Number.isFinite(ev.Credits) && !(s.creditsAt > at)) { s.credits = ev.Credits; s.creditsAt = at; }
        s.combat = {};
        break;
      case 'Commander': s.commandant = nom(ev.Name) || s.commandant; break;
      case 'Rank':
      case 'Progress': {
        const champ = ev.event === 'Rank' ? 'rang' : 'progression';
        s.rangs ||= {};
        for (const [jeu, cle] of [['Combat', 'combat'], ['Trade', 'commerce'], ['Explore', 'exploration'], ['Soldier', 'mercenaire'], ['Exobiologist', 'exobiologie'], ['Empire', 'empire'], ['Federation', 'federation'], ['CQC', 'cqc']]) {
          if (Number.isFinite(ev[jeu])) s.rangs[cle] = { ...s.rangs[cle], [champ]: ev[jeu] };
        }
        break;
      }
      case 'Reputation':
        s.reputation = { empire: arrondi(ev.Empire), federation: arrondi(ev.Federation), alliance: arrondi(ev.Alliance), independants: arrondi(ev.Independent) };
        break;
      case 'Powerplay': s.powerplay = { puissance: ev.Power || null, rang: ev.Rank ?? null, merites: ev.Merits ?? null }; break;
      case 'Loadout':
        s.vaisseau = {
          modele: ev.Ship || null, id: ev.ShipID ?? null, nom: nom(ev.ShipName), ident: nom(ev.ShipIdent),
          souteCapacite: ev.CargoCapacity ?? null, sautMax: arrondi(ev.MaxJumpRange, 2), masseVide: arrondi(ev.UnladenMass),
          reservoir: ev.FuelCapacity ? { principal: ev.FuelCapacity.Main ?? null, reserve: ev.FuelCapacity.Reserve ?? null } : null,
          rachat: ev.Rebuy ?? null, valeur: (ev.HullValue || 0) + (ev.ModulesValue || 0) || null,
          modules: Array.isArray(ev.Modules) ? ev.Modules.length : null,
          abimes: (Array.isArray(ev.Modules) ? ev.Modules.filter((m) => m && typeof m === 'object') : []).filter((m) => Number.isFinite(m.Health) && m.Health < 0.8).map((m) => ({ emplacement: m.Slot, sante: Math.round(m.Health * 100) })),
        };
        if (Number.isFinite(ev.HullHealth)) { s.coque = Math.round(ev.HullHealth * 100); s.coqueAt = at; }
        break;
      case 'HullDamage':
        if (ev.PlayerPilot && !ev.Fighter && Number.isFinite(ev.Health)) { s.coque = Math.round(ev.Health * 100); s.coqueAt = at; }
        break;
      case 'ShieldState': s.boucliers = Boolean(ev.ShieldsUp); s.bouclierAt = at; break;
      case 'Location':
      case 'FSDJump':
      case 'CarrierJump': {
        const p = {
          systeme: ev.StarSystem || null, adresse: ev.SystemAddress ?? null,
          allegeance: ev.SystemAllegiance || null, economie: loc(ev, 'SystemEconomy'), gouvernement: loc(ev, 'SystemGovernment'),
          securite: loc(ev, 'SystemSecurity'), population: ev.Population ?? null,
          factionControle: ev.SystemFaction?.Name || null,
          puissanceControle: ev.ControllingPower || null, puissances: ev.Powers || null, etatPowerplay: ev.PowerplayState || null,
          factions: (ev.Factions || []).slice().sort((a, b) => (b.Influence || 0) - (a.Influence || 0)).slice(0, 6).map((f) => ({
            nom: f.Name, influence: arrondi((f.Influence || 0) * 100), etat: f.FactionState && f.FactionState !== 'None' ? f.FactionState : null,
            maReputation: arrondi(f.MyReputation),
          })),
          corps: ev.Body || null, typeCorps: ev.BodyType || null,
        };
        if (ev.event === 'FSDJump') { p.corps = null; p.typeCorps = null; }
        const quai = ev.event !== 'FSDJump' && ev.Docked;
        s.position = { ...p, ...(quai ? { aQuai: true, station: ev.StationName || null, typeStation: ev.StationType || null, distanceEtoileLs: Math.round(ev.DistFromStarLS || 0) } : { aQuai: false }) };
        if (ev.event === 'FSDJump' && s.route && s.route.fin === ev.StarSystem) s.route = null;
        break;
      }
      case 'Docked':
        Object.assign(s.position, {
          aQuai: true, station: ev.StationName || null, typeStation: ev.StationType || null, distanceEtoileLs: Math.round(ev.DistFromStarLS || 0),
          services: Array.isArray(ev.StationServices) ? ev.StationServices.length : null, factionStation: ev.StationFaction?.Name || null,
        });
        break;
      case 'Undocked': Object.assign(s.position, { aQuai: false, station: null, typeStation: null, services: null, factionStation: null }); break;
      case 'SupercruiseEntry': Object.assign(s.position, { corps: null, typeCorps: null }); break;
      case 'SupercruiseExit':
      case 'ApproachBody': Object.assign(s.position, { corps: ev.Body || s.position.corps, typeCorps: ev.BodyType || s.position.typeCorps }); break;
      case 'LeaveBody': Object.assign(s.position, { corps: null, typeCorps: null }); break;
      case 'FSDTarget': s.cible = { systeme: ev.Name || null, sautsRestants: ev.RemainingJumpsInRoute ?? null, etoile: ev.StarClass || null }; break;
      case 'NavRouteClear': s.route = null; s.cible = null; break;
      case 'Materials':
        s.materiaux = {
          at,
          brut: objets(ev.Raw), manufacture: objets(ev.Manufactured), encode: objets(ev.Encoded),
        };
        break;
      case 'EngineerProgress':
        if (Array.isArray(ev.Engineers)) {
          s.ingenieurs = ev.Engineers.map((e) => ({ nom: e.Engineer, etat: e.Progress, rang: e.Rank ?? null }));
        } else if (ev.Engineer && s.ingenieurs) {
          const i = s.ingenieurs.find((e) => e.nom === ev.Engineer);
          if (i) Object.assign(i, { etat: ev.Progress || i.etat, rang: ev.Rank ?? i.rang });
        }
        break;
      case 'CarrierStats':
        s.porteVaisseaux = {
          at, indicatif: ev.Callsign || null, carburant: ev.FuelLevel ?? null, sautMax: ev.JumpRangeMax ?? null,
          espaceLibre: ev.SpaceUsage?.FreeSpace ?? null, solde: ev.Finance?.CarrierBalance ?? null, disponible: ev.Finance?.AvailableBalance ?? null,
        };
        break;
      case 'UnderAttack': if (ev.Target === 'You') s.combat.derniereAttaque = at; break;
      case 'HeatWarning': s.combat.alerteChaleur = at; break;
      case 'HeatDamage': s.combat.degatsChaleur = at; break;
      case 'Interdicted': s.combat.interdiction = { at, parUnJoueur: Boolean(ev.IsPlayer), soumis: Boolean(ev.Submitted), ...(ev.IsPlayer ? {} : { faction: ev.Faction || null }) }; break;
      case 'Died': s.combat.mort = at; break;
      case 'LaunchSRV': s.srv = { type: ev.SRVType_Localised || ev.SRVType || null, depuis: at }; break;
      case 'DockSRV':
      case 'SRVDestroyed': s.srv = null; s.souteSrv = null; break;
      case 'Cargo':
        if (ev.Vessel === 'SRV') s.souteSrv = Array.isArray(ev.Inventory) ? objets(ev.Inventory) : s.souteSrv;
        else if (Array.isArray(ev.Inventory)) s.soute = objets(ev.Inventory);
        break;
      case 'Missions':
        this.actives = new Set();
        for (const m of ev.Active || []) {
          this.actives.add(m.MissionID);
          const old = this.missions.get(m.MissionID) || { nom: (m.Name || '').replace(/^Mission_|_name$/gi, '').replace(/_/g, ' ') };
          const expire = Number.isFinite(m.Expires) && at ? new Date(Date.parse(at) + m.Expires * 1000).toISOString() : old.expire;
          this.missions.set(m.MissionID, { ...old, expire });
        }
        for (const id of [...this.missions.keys()]) if (!this.actives.has(id)) this.missions.delete(id);
        break;
      case 'MissionAccepted':
        this.missions.set(ev.MissionID, {
          nom: ev.LocalisedName || ev.Name, faction: ev.Faction || null,
          destination: [ev.DestinationSystem, ev.DestinationStation || ev.DestinationSettlement].filter(Boolean).join(' / ') || null,
          expire: ev.Expiry || null, recompense: Number(ev.Reward) || null,
          ...(ev.Commodity_Localised || ev.Commodity ? { marchandise: `${ev.Count ?? ''} ${ev.Commodity_Localised || ev.Commodity}`.trim() } : {}),
          ...(ev.KillCount ? { cibles: ev.KillCount } : {}),
        });
        while (this.missions.size > MAX_MISSIONS) this.missions.delete(this.missions.keys().next().value);
        break;
      case 'MissionRedirected': {
        const m = this.missions.get(ev.MissionID);
        if (m) m.destination = [ev.NewDestinationSystem, ev.NewDestinationStation].filter(Boolean).join(' / ') || m.destination;
        break;
      }
      case 'MissionCompleted':
      case 'MissionFailed':
      case 'MissionAbandoned':
        break; // retirée après le libellé (marquant), plus bas
      default:
        break;
    }
    const quoi = marquant(ev, this);
    if (quoi) {
      this.evenements.push({ at, quoi });
      if (this.evenements.length > MAX_EVENEMENTS) this.evenements.shift();
    }
    if (['MissionCompleted', 'MissionFailed', 'MissionAbandoned'].includes(ev.event)) this.missions.delete(ev.MissionID);
    this.note('journal', at);
    this.changed();
  }

  /** Pourcentage des boucliers lu sur l'image du jeu (overlay/bouclier.js) : gardé 20 s, puis oublié. */
  applyBouclierLu(pct, at = new Date().toISOString()) {
    if (!Number.isInteger(pct) || pct < 0 || pct > 100) return false;
    this.s.bouclierLu = { pct, at };
    this.changed();
    return true;
  }

  applyStatus(st) {
    const d = lireStatus(st);
    if (!d) return;
    const s = this.s;
    s.status = d;
    if (d.credits != null && !(s.creditsAt > d.at)) { s.credits = d.credits; s.creditsAt = d.at; }
    if (d.statutLegal) s.statutLegal = d.statutLegal;
    if (d.enJeu && d.vehicule === 'vaisseau' && !(s.bouclierAt > d.at)) s.boucliers = Boolean(d.indicateurs.bouclierLeve);
    this.note('Status.json', d.at);
    this.changed();
  }

  /** Fichiers d'état du jeu (journalService : cargo, navroute, market, modulesinfo, shiplocker, backpack). */
  applyFichier(type, data) {
    if (!data || typeof data !== 'object') return;
    const s = this.s;
    const at = data.timestamp || null;
    switch (type) {
      case 'cargo': if (data.Vessel !== 'SRV' && Array.isArray(data.Inventory)) s.soute = objets(data.Inventory); break;
      case 'navroute': {
        const r = Array.isArray(data.Route) ? data.Route : [];
        s.route = r.length > 1 ? { etapes: r.length - 1, fin: r.at(-1).StarSystem || null, debut: r[0].StarSystem || null } : null;
        break;
      }
      case 'market':
        if (Array.isArray(data.Items)) {
          s.marche = {
            at, station: data.StationName || null, systeme: data.StarSystem || null,
            articles: data.Items.filter((i) => i.Stock > 0 || i.Demand > 0).map((i) => ({
              nom: i.Name_Localised || i.Name, categorie: i.Category_Localised || null,
              achat: i.Stock > 0 ? i.BuyPrice : null, vente: i.Demand > 0 ? i.SellPrice : null, stock: i.Stock || 0, demande: i.Demand || 0,
            })),
          };
        }
        break;
      case 'modulesinfo':
        if (Array.isArray(data.Modules)) {
          s.modules = { at, nombre: data.Modules.length, puissance: arrondi(data.Modules.reduce((t, m) => t + (Number(m.Power) || 0), 0), 2) };
        }
        break;
      case 'shiplocker':
        s.casier = { at, objets: objets(data.Items), composants: objets(data.Components), consommables: objets(data.Consumables), donnees: objets(data.Data) };
        break;
      case 'backpack':
        s.sac = { at, objets: objets(data.Items), composants: objets(data.Components), consommables: objets(data.Consumables), donnees: objets(data.Data) };
        break;
      default:
        return;
    }
    this.note(type, at);
    this.changed();
  }

  /**
   * Le résumé : court en haut (ce qui compte en direct), détails dessous. `partie` : une seule partie, avec ses
   * détails complets (marché, matériaux, casier…), pour l'outil de l'IA.
   */
  snapshot() {
    const s = this.s;
    const st = s.status;
    const v = s.vaisseau;
    const enSrv = st?.vehicule === 'srv';
    const vue = {
      maj: Object.values(this.sources).sort().at(-1) || null,
      commandant: s.commandant,
      credits: s.credits,
      statutLegal: s.statutLegal,
      enDirect: st ? {
        at: st.at,
        enJeu: st.enJeu,
        vehicule: st.vehicule,
        indicateurs: Object.keys(st.indicateurs),
        pips: st.pips || null,
        groupeTir: st.groupeTir ?? null,
        ecran: st.ecran || null,
        carburant: st.carburant || null,
        corps: st.corps || null,
        altitude: st.altitude ?? null,
        coordonnees: st.coordonnees || null,
        gravite: st.gravite ?? null,
        destination: st.destination || null,
        ...(st.oxygene != null ? { oxygene: st.oxygene, sante: st.sante ?? null, temperature: st.temperature ?? null, arme: st.arme || null } : {}),
      } : null,
      vaisseau: v ? {
        modele: v.modele, nom: v.nom, ident: v.ident, id: v.id,
        coque: s.coque, coqueAt: s.coqueAt, boucliers: s.boucliers,
        // Jauge lue sur l'écran (si réglée) : seulement fraîche, et seulement dans le vaisseau
        bouclierLu: s.bouclierLu && Date.now() - Date.parse(s.bouclierLu.at) < BOUCLIER_LU_MS && st?.vehicule === 'vaisseau' ? s.bouclierLu : null,
        // Dans le SRV ou à pied, Status.json donne le carburant du SRV (ou rien) : pas celui du vaisseau
        carburant: !enSrv && st?.vehicule !== 'a pied' ? st?.carburant || null : null,
        reservoir: v.reservoir, souteCapacite: v.souteCapacite, souteUtilisee: s.soute ? s.soute.reduce((t, x) => t + x.quantite, 0) : null,
        sautMax: v.sautMax, masseVide: v.masseVide, rachat: v.rachat, valeur: v.valeur,
        modulesAbimes: v.abimes, puissanceUtilisee: s.modules?.puissance ?? null,
      } : null,
      srv: s.srv || enSrv ? { type: s.srv?.type || null, depuis: s.srv?.depuis || null, carburant: enSrv ? st.carburant : null, soute: s.souteSrv } : null,
      position: s.position.systeme ? s.position : null,
      route: s.route || s.cible ? { ...s.route, prochainSysteme: s.cible?.systeme || null, sautsRestants: s.cible?.sautsRestants ?? null } : null,
      combat: Object.keys(s.combat).length ? s.combat : null,
      rangs: s.rangs,
      reputation: s.reputation,
      powerplay: s.powerplay,
      missions: [...this.missions.values()],
      soute: s.soute,
      porteVaisseaux: s.porteVaisseaux,
      evenements: this.evenements.slice().reverse(),
      // Résumés : le détail est dans la partie demandée seule (outil etat_jeu de l'IA)
      materiaux: s.materiaux ? { at: s.materiaux.at, brut: somme2(s.materiaux.brut), manufacture: somme2(s.materiaux.manufacture), encode: somme2(s.materiaux.encode) } : null,
      ingenieurs: s.ingenieurs ? { debloques: s.ingenieurs.filter((e) => e.etat === 'Unlocked').length, connus: s.ingenieurs.length } : null,
      marche: s.marche ? { at: s.marche.at, station: s.marche.station, systeme: s.marche.systeme, articles: s.marche.articles.length } : null,
      sac: s.sac ? { at: s.sac.at, total: s.sac.objets.length + s.sac.composants.length + s.sac.consommables.length + s.sac.donnees.length } : null,
      casier: s.casier ? { at: s.casier.at, total: s.casier.objets.length + s.casier.composants.length + s.casier.consommables.length + s.casier.donnees.length } : null,
      sources: { ...this.sources },
    };
    return vue;
  }

  /** Une partie avec tout son détail (ou null si inconnue). */
  partie(nomPartie) {
    const s = this.s;
    switch (nomPartie) {
      case 'materiaux': return s.materiaux;
      case 'ingenieurs': return s.ingenieurs;
      case 'marche': return s.marche;
      case 'sac': return s.sac;
      case 'casier': return s.casier;
      case 'missions': return [...this.missions.values()];
      default: {
        const vue = this.snapshot();
        return Object.hasOwn(vue, nomPartie) ? vue[nomPartie] : null;
      }
    }
  }
}

/** Nombre total d'unités d'une liste d'objets. */
function somme2(liste) {
  return liste.reduce((t, x) => t + x.quantite, 0);
}

