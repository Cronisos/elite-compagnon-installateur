// Service du module Ingénierie : tient à jour la flotte et l'inventaire à partir du
// lecteur de journaux, gère les données de référence et les plans.

import fs from 'node:fs';
import path from 'node:path';
import { dataPath } from '../../../core/paths.js';
import { writeFileAtomicSync } from '../../../core/atomic.js';
import { getReference, engineerKey as engineerKeyOf } from '../../../core/reference/refdata.js';
import { downloadReference, REF_DIR } from '../../../core/reference/download.js';
import { extractHash, loadEddb, decodeEdsy, edsyToTargets, findLoadout } from '../../../core/reference/edsy.js';
import { Inventory, MATERIAL_EVENTS } from './inventory.js';
import { Fleet, mapLoadout, FLEET_EVENTS } from './fleet.js';
import { planNeeds, sharedStock } from './calc.js';
import { buildRankLog, engineerStates, rankView, PLACE_EVENTS } from './ranks.js';
import { RANK_TABLE, RANK_RULES, RULES_DATE, JOURNAUX_PERIOD, UPDATE_18_08 } from './rankRules.js';
import { obtainMethod, MAX_BY_GRADE } from './methods.js';
import { planEchanges } from './echanges.js';
import { Traders } from './traders.js';
import { DEFAULT_BLUEPRINTS, TYPE_LABELS } from '../../../core/reference/labels.js';
import { gameShipId, requireRowId } from '../../../core/ids.js';
import { belongsTo, keepCommander, shipKey as shipKeyOf } from '../../../core/commander.js';
import { decodeImageDataUrl } from '../../../core/imageCheck.js';
import { loadEngineerData, indexEngineerData, DATA_FILE } from './engineerData.js';
import { POSITION_EVENTS, positionOf } from './position.js';
import { dockOf, hostOf, authorIdOf } from './workshop.js';
import { Itinerary } from './itinerary.js';
import { dessinVaisseau } from '../../../core/reference/vaisseaux.js';

const MAT_SET = new Set(MATERIAL_EVENTS);
const FLEET_SET = new Set(FLEET_EVENTS);
// Lieu des applications (atelier ou à distance) : stations où l'on est amarré, gardées avec la flotte, mais seulement
// ce qu'en lit buildRankLog (MarketID, Docked) : un Docked complet (factions, services) n'a rien à faire en mémoire.
// Le lieu ne compte qu'à la prochaine EngineerCraft, qui refait le calcul et le diffuse : un amarrage, un décollage ou
// un chargement ne change rien de ce qu'affichent les pages, il ne reconstruit ni ne diffuse rien.
// Pour l'hôte d'une application (R8 de itineraryRules.js : base reconnue par son MarketID, ou par son nom et son
// système) et l'atelier à distance (type de station, taxi, équipage, service « engineer »), la copie garde aussi le nom
// et le type de la station, le système, Taxi, Multicrew, trois services, et pour Location la position et « à pied ».
const PLACE_SET = new Set(PLACE_EVENTS);
const POSITION_SET = new Set(POSITION_EVENTS);
const FOOT_EVENTS = ['Embark', 'Disembark'];
/** Événements de flotte que lisent les rangs (ranks.js). */
const RANK_EVENTS = new Set(['LoadGame', 'ShipyardSwap', 'Loadout', 'EngineerProgress', 'EngineerCraft']);

/**
 * Copie réduite d'un événement pour les rangs des ingénieurs, ou null s'ils ne le lisent pas. Un Loadout pèse plusieurs
 * Ko : n'en restent que les modules modifiés, avec ce que ranks.js en lit (Slot, Item, BlueprintName, Level, Quality).
 */
export function rankEventOf(ev) {
  if (!ev || !RANK_EVENTS.has(ev.event)) return null;
  if (ev.event !== 'Loadout') return ev;
  const modules = (Array.isArray(ev.Modules) ? ev.Modules : [])
    .filter((m) => m && typeof m === 'object' && m.Engineering && typeof m.Engineering === 'object')
    .map((m) => ({ Slot: m.Slot, Item: m.Item, Engineering: { BlueprintName: m.Engineering.BlueprintName, Level: m.Engineering.Level, Quality: m.Engineering.Quality } }));
  return keepCommander(ev, { event: 'Loadout', timestamp: ev.timestamp, ShipID: ev.ShipID, Modules: modules }); // son commandant reste noté (ranks.js)
}

export function placeOf(ev) {
  const out = { event: ev.event, timestamp: ev.timestamp };
  if (ev.MarketID !== undefined) out.MarketID = ev.MarketID;
  if (ev.Docked !== undefined) out.Docked = ev.Docked;
  for (const k of ['StationName', 'StationType', 'StarSystem', 'SystemAddress', 'Taxi', 'Multicrew']) if (ev[k] !== undefined) out[k] = ev[k];
  if (Array.isArray(ev.StationServices)) {
    const list = ev.StationServices;
    out.services = { engineer: list.includes('engineer'), outfitting: list.includes('outfitting'), shipyard: list.includes('shipyard') };
  }
  if (ev.event === 'Location') {
    if (ev.StarPos !== undefined) out.StarPos = ev.StarPos;
    if (ev.OnFoot !== undefined) out.OnFoot = ev.OnFoot;
  }
  return out;
}
export const IMAGES_DIR = dataPath('images') + path.sep;

export class EngineeringService {
  /**
   * @param {object} ctx contexte du module (prisma, journal, broadcast, game : soute et solde)
   * @param {object} [o] tests : files (fichiers JSON de l'itinéraire), engineersFile (données des ingénieurs)
   */
  constructor({ prisma, journal, broadcast, game = null, vigie = null }, { files = {}, engineersFile = DATA_FILE(), fsImpl, warn } = {}) {
    this.vigie = vigie;
    this.prisma = prisma;
    this.shipLocks = new Map(); // ShipID → écriture de plan en cours (withShipLock)
    this.broadcast = broadcast;
    this.game = game;
    // Données de référence partagées (core/reference/refdata.js) ; abîmées : ref null, refError dit pourquoi (503 lisible)
    ({ ref: this.ref, error: this.refError } = getReference());
    this.warnIfNotPinned();
    // Données publiques des ingénieurs (data/engineers.json) : illisibles, le serveur continue, l'itinéraire répond 503
    const eng = loadEngineerData(engineersFile);
    this.engError = eng.error;
    this.engIdx = eng.data ? indexEngineerData(eng.data) : null;
    if (eng.error) console.warn(`Ingénierie : données des ingénieurs illisibles (${eng.error}) : la liste des ingénieurs, l'itinéraire et la fiche chez l'ingénieur sont indisponibles.`);
    // Position (R10), systèmes vus (permis), à pied, dernier amarrage, soute relue
    this.position = null;
    this.visitedSystems = new Set();
    this.onFoot = false;
    this.lastDock = null;
    this.cargoSeen = false;
    this.download = { running: false, message: null, error: null };
    this.fleet = new Fleet(); // tenue au fil du journal (fleet.js) : les événements bruts ne sont pas gardés
    // Rangs des ingénieurs : seulement les événements qu'ils lisent, réduits (rankEventOf) ; jamais un Loadout entier
    this.rankEvents = [];
    this.ranks = buildRankLog([]);
    this.inventory = new Inventory();
    this.traders = new Traders(); // échangeurs de matériaux connus (journal)
    this.notifyTimer = null;
    this.itin = new Itinerary(this, { files, fsImpl, warn });

    // Sauts (position), embarquement et débarquement (à pied), soute : jamais dans les événements des rangs
    journal.addInterest([...MATERIAL_EVENTS, ...FLEET_SET, ...PLACE_SET, ...POSITION_EVENTS, ...FOOT_EVENTS, 'Cargo']);
    journal.on('ready', ({ history }) => {
      this.inventory = new Inventory();
      this.traders = new Traders();
      const fleet = new Fleet();
      this.rankEvents = [];
      this.position = null;
      this.visitedSystems = new Set();
      this.onFoot = false;
      this.lastDock = null;
      this.cargoSeen = false;
      for (const ev of history) {
        if (MAT_SET.has(ev.event)) this.inventory.apply(ev);
        this.trackPlace(ev);
        this.traders.apply(ev);
        if (FLEET_SET.has(ev.event)) {
          fleet.apply(ev);
          this.keepRankEvent(ev);
        } else if (PLACE_SET.has(ev.event)) this.rankEvents.push(placeOf(ev));
      }
      this.fleet = fleet;
      this.rebuild();
      this.saveInventory().catch((e) => console.error('Inventaire :', e.message));
      // Plans d'avant les commandants : rattachés au commandant le plus vu dans les journaux
      const owner = (typeof journal.mostSeenCommander === 'function' ? journal.mostSeenCommander() : null) ?? fleet.commanders.mostSeen();
      this.adoptPlans(owner).catch((e) => console.warn(`Plans d'ingénierie d'avant les commandants non rattachés (${e.message}) : ils valent tant qu'un seul commandant joue.`));
      this.notify();
    });
    journal.on('event', (ev) => {
      // Fiche « Chez l'ingénieur » : avant tout le reste (état du module d'avant une application, pour ses alertes)
      this.visit?.onEvent(ev);
      const moved = this.trackPlace(ev);
      this.traders.apply(ev);
      // Alertes de passage : ingénieur ou échangeur utile aux plans dans le système où l'on arrive (services/passage.js)
      this.passage?.onEvent(ev);
      if (moved) this.broadcast('engineering:position', { system: this.position.system, systemAddress: this.position.systemAddress, at: this.position.at });
      if (POSITION_SET.has(ev.event) || FOOT_EVENTS.includes(ev.event) || ev.event === 'Cargo') return;
      if (PLACE_SET.has(ev.event)) {
        this.rankEvents.push(placeOf(ev));
        return;
      }
      let changed = false;
      if (MAT_SET.has(ev.event)) changed = this.inventory.apply(ev) || changed;
      if (FLEET_SET.has(ev.event)) {
        this.fleet.apply(ev);
        if (this.keepRankEvent(ev)) this.rebuild({ live: ev.event === 'EngineerCraft' });
        if (ev.event === 'EngineerCraft') this.vigieApplication();
        changed = true;
      }
      if (changed) {
        this.notify();
        if (MAT_SET.has(ev.event)) this.saveInventory().catch(() => {});
      }
    });

    // Premier lancement, ou données abîmées : téléchargement automatique des données de référence (les données en place
    // ne sont remplacées que si tout le téléchargement est vérifié)
    if (!this.ref) this.updateReference().catch(() => {});
  }

  /** Données en place qui ne sont pas les versions figées de cette version de l'app : dit dans la console. */
  warnIfNotPinned() {
    const i = this.ref?.integrity;
    if (i && !i.pinned) console.warn(`Données de référence : pas les versions figées de cette version de l'app (${i.problems.join(' ; ')}). Onglet Mon ingénierie → Données : « Mettre à jour les données ».`);
  }

  /**
   * Position, systèmes vus, à pied, dernier amarrage et soute, d'après un événement (historique ou direct). Ne
   * reconstruit rien. Rend vrai quand le système change (pour diffuser engineering:position).
   */
  trackPlace(ev) {
    let moved = false;
    if (ev.event === 'Location' || POSITION_SET.has(ev.event)) {
      const p = positionOf(ev);
      if (p) {
        moved = !this.position || (p.systemAddress != null ? p.systemAddress !== this.position.systemAddress : p.system !== this.position.system);
        this.position = p;
        if (p.systemAddress != null) this.visitedSystems.add(p.systemAddress);
      }
    }
    switch (ev.event) {
      case 'Location':
        this.onFoot = ev.OnFoot === true;
        this.lastDock = ev.Docked ? dockOf(ev) : null;
        break;
      case 'Docked':
        this.onFoot = false;
        this.lastDock = dockOf(ev);
        if (Number.isSafeInteger(ev.SystemAddress)) this.visitedSystems.add(ev.SystemAddress);
        break;
      case 'Undocked':
      case 'LoadGame':
        this.onFoot = false;
        this.lastDock = null;
        break;
      case 'Embark':
        this.onFoot = false;
        break;
      case 'Disembark':
        this.onFoot = true;
        break;
      case 'Cargo':
        if (!ev.Vessel || ev.Vessel === 'Ship') this.cargoSeen = true;
        break;
      default:
        break;
    }
    return moved;
  }

  /**
   * Garde, réduit, un événement que lisent les rangs des ingénieurs (ranks.js) : applications, relevés de progression,
   * lancement, échange de vaisseau, et du Loadout seulement les modules modifiés (emplacement, module, plan, grade,
   * qualité). Rend vrai s'il est gardé. La flotte, elle, est tenue au fil du journal (Fleet) : rien d'autre n'est gardé.
   */
  keepRankEvent(ev) {
    const r = rankEventOf(ev);
    if (r) this.rankEvents.push(r);
    return Boolean(r);
  }

  /**
   * Vigie des règles (en direct) : qualité gagnée par la dernière application face à la table des rangs
   * (ingenierie.rangs.applications : 1 / (grade + 5 − rang)). Seules les applications qui mesurent quelque chose sont
   * signalées (gain net, ou grade fini plus vite que la table) ; une fin de grade plafonnée n'est pas une mesure.
   */
  vigieApplication() {
    const a = this.ranks?.applications?.at(-1);
    if (!this.vigie || !a || a.expected == null || a.step == null || (!a.informative && !a.faster)) return;
    const ecart = a.faster || Math.abs(a.step - a.expected) >= 0.01;
    this.vigie.observe({
      regle: 'ingenierie.rangs.applications', attendu: Math.round(a.expected * 1000) / 1000, observe: Math.round(a.step * 1000) / 1000, ecart,
      explication: ecart && a.reroll ? 'grade refait (cas inconnu de la table)' : null,
      details: { ingenieur: a.engineer, rang: a.rank, grade: a.grade, lieu: a.place },
    });
  }

  /** Rangs des ingénieurs, relus depuis les événements réduits gardés (chaque application ajoute ses mesures). */
  rebuild({ live = false } = {}) {
    const idx = this.engIdx;
    this.ranks = buildRankLog(this.rankEvents, {
      workshopOf: (name) => this.workshopOf(name),
      ...(idx ? { hostOf: (dock) => hostOf(dock, idx), authorIdOf: (ev) => authorIdOf(ev, idx) } : {}),
    });
    this.itin?.refreshPins({ live });
  }

  /** MarketID de l'atelier d'un ingénieur (data/engineers.json, sinon FDevIDs engineers.csv), null si inconnu. */
  workshopOf(name) {
    const fromData = this.engIdx?.byName.get(engineerKeyOf(name))?.marketId;
    if (Number.isSafeInteger(fromData)) return fromData;
    const id = Number(this.ref?.engineerBases.get(name)?.marketId);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  /** Vue « Ce que tes journaux montrent » : mesures, séquences, écarts (la table des règles : rankRules()). */
  rankReport() {
    return rankView(this.ranks);
  }

  /** Table des règles des rangs, telle que déclarée (rankRules.js), avec la période des mesures et la mise à jour 18.08. */
  rankRules() {
    return { date: RULES_DATE, table: RANK_TABLE, general: RANK_RULES, period: JOURNAUX_PERIOD, update: UPDATE_18_08 };
  }

  /** Noms français des effets expérimentaux, tels que le jeu les écrit dans les Loadout. */
  learnLabels() {
    if (!this.ref) return;
    for (const s of this.fleet.ships.values()) {
      const modules = Array.isArray(s.loadout?.Modules) ? s.loadout.Modules : []; // Loadout abîmé : rien à apprendre
      for (const m of modules) {
        const e = m?.Engineering;
        if (e?.ExperimentalEffect && e.ExperimentalEffect_Localised) this.ref.localSpecials.set(e.ExperimentalEffect, e.ExperimentalEffect_Localised);
      }
    }
  }

  notify() {
    this.learnLabels();
    this.visit?.schedule(); // plans, validations, itinéraire ou inventaire changés : la fiche se refait
    clearTimeout(this.notifyTimer);
    this.notifyTimer = setTimeout(() => this.broadcast('engineering:update', {}), 400);
  }

  /** @param {object} [o] tests : download (téléchargement), reread (relecture des données en place) */
  async updateReference({ download = downloadReference, reread = () => getReference(REF_DIR, { fresh: true }) } = {}) {
    if (this.download.running) return;
    this.download = { running: true, message: 'Démarrage…', error: null };
    const progress = (message) => {
      this.download.message = message;
      this.broadcast('engineering:refdata', this.download);
    };
    try {
      const meta = await download(progress);
      // Cache commun relu tout de suite : les autres modules (matériaux, sauvetage, bilan, repères) passent aussi aux
      // nouvelles données
      const fresh = reread();
      ({ ref: this.ref, error: this.refError } = fresh);
      if (fresh.error) {
        // Téléchargement vérifié, mais le contenu ne se lit pas (format des données changé…) : retélécharger ne
        // changerait rien, alors pas de « retélécharge-les » ici
        this.refError = `Données de référence téléchargées, mais illisibles (${fresh.detail ?? 'format inattendu'}) : signale-le avec le journal de l'app (bureau.log).`;
        throw Object.assign(new Error(this.refError), { downloaded: true });
      }
      this.warnIfNotPinned();
      this.eddb = null; // rechargé à la prochaine importation
      this.rebuild(); // ateliers des ingénieurs connus : lieu des applications
      await this.prisma.referenceData.upsert({
        where: { id: 1 },
        create: { id: 1, version: meta.version, downloadedAt: new Date(meta.downloadedAt), files: meta.files },
        update: { version: meta.version, downloadedAt: new Date(meta.downloadedAt), files: meta.files },
      });
      this.download = { running: false, message: `Données à jour (${meta.files} fichiers).`, error: null };
    } catch (err) {
      this.download = { running: false, message: null, error: err.downloaded ? err.message : `Téléchargement impossible : ${err.message}` };
    }
    this.broadcast('engineering:refdata', this.download);
    this.notify();
  }

  requireRef() {
    if (!this.ref) {
      // Abîmées (fichier tronqué…) : le fichier en cause et comment réparer ; absentes : le bouton à cliquer
      const err = new Error(this.refError || 'Données de référence absentes : clique sur « Mettre à jour les données » (Mon ingénierie → Données).');
      err.status = 503;
      err.publicMessage = err.message;
      throw err;
    }
    return this.ref;
  }

  /**
   * Inventaire enregistré en base (table MaterialInventory). Seulement un inventaire complet, parti du relevé
   * « Materials » du jeu : sans lui (dossier des journaux vide, déplacé, ou journaux effacés), l'inventaire en mémoire
   * est vide ou partiel, et il effacerait celui qui est enregistré.
   */
  async saveInventory() {
    if (!this.ref || !this.inventory.baselineAt) return;
    const rows = this.inventoryRows();
    await this.prisma.$transaction([
      this.prisma.materialInventory.deleteMany({}),
      this.prisma.materialInventory.createMany({
        data: rows.map((r) => ({ name: r.key, label: r.label, type: r.type || '?', grade: r.grade || 0, count: r.count })),
      }),
    ]);
  }

  /**
   * Matériaux du jeu que le joueur n'a pas (à 0), pour ranger la page Matériaux comme un échangeur : chaque catégorie
   * complète, du grade 1 au grade 5. Seulement les trois types du jeu, grades 1 à 5. Le jeu ne donne le nom français
   * d'un matériau qu'une fois ramassé : un matériau jamais vu garde son nom anglais (absent: true).
   */
  absentRows() {
    const ref = this.ref;
    if (!ref) return [];
    const owned = new Set(this.inventory.toJSON().map((it) => it.key)); // déjà dans l'inventaire, même à 0
    const out = [];
    for (const [key, info] of ref.materials) {
      if (owned.has(key) || !TYPE_LABELS[info.type] || !(info.grade >= 1 && info.grade <= 5)) continue;
      out.push({
        key,
        label: ref.materialLabel(key, null),
        english: info.name || null,
        absent: true,
        type: info.type,
        typeLabel: TYPE_LABELS[info.type],
        category: info.category || null,
        grade: info.grade,
        count: 0,
        max: MAX_BY_GRADE[info.grade] || null,
        method: obtainMethod(key, info),
      });
    }
    return out;
  }

  inventoryRows() {
    const ref = this.ref;
    return this.inventory.toJSON().map((it) => {
      const info = ref?.materials.get(it.key);
      return {
        key: it.key,
        label: ref ? ref.materialLabel(it.key, it.label) : it.label || it.key,
        english: info?.name || null, // nom anglais (FDevIDs material.csv) : survol et recherche bilingue
        type: info?.type || it.type,
        typeLabel: TYPE_LABELS[info?.type || it.type] || '',
        category: info?.category || null,
        grade: info?.grade || null,
        count: it.count,
        max: MAX_BY_GRADE[info?.grade] || null,
        method: obtainMethod(it.key, info),
      };
    });
  }

  // --- Flotte ---

  shipList() {
    const ref = this.requireRef();
    const out = [];
    for (const s of this.fleet.ships.values()) {
      const key = ref.shipKey(s.type);
      if (!key && !s.loadout) continue; // SRV, chasseurs…
      out.push({
        shipId: s.shipId,
        type: s.type,
        key,
        model: ref.shipName(key, s.type),
        name: s.name,
        ident: s.ident,
        system: s.system,
        hasConfig: !!s.loadout,
        current: s.shipId === this.fleet.currentShipId,
        lastSeen: s.lastSeen,
      });
    }
    return out.sort((a, b) => Number(b.current) - Number(a.current) || Number(b.hasConfig) - Number(a.hasConfig) || a.model.localeCompare(b.model));
  }

  // --- Commandant (core/commander.js) : un ShipID n'est unique que pour un commandant ---

  /** Commandant chargé, ou null. */
  commander() {
    return this.fleet?.commander ?? null;
  }

  /** Un seul commandant (ou aucun) dans les journaux : un plan d'avant les commandants est le sien. */
  singleCommander() {
    return this.fleet?.commanders?.single?.() ?? true;
  }

  /**
   * Vaisseau `shipId` du commandant `commanderId` : undefined, le commandant chargé ; null, plan d'avant les
   * commandants (le vaisseau du commandant chargé s'il est seul, sinon aucun). Jamais celui d'un autre commandant.
   */
  shipOf(shipId, commanderId = undefined) {
    if (shipId == null) return null;
    const id = Number(shipId);
    const cur = this.commander();
    if (commanderId === undefined || commanderId === cur) return this.fleet.ships.get(id) ?? null;
    if (commanderId === null) return this.singleCommander() ? this.fleet.ships.get(id) ?? null : null;
    return this.fleet.shipOf?.(commanderId, id) ?? null;
  }

  /** Le plan vise-t-il un vaisseau du commandant chargé ? Son ShipID alors, sinon null (vaisseau d'un autre compte). */
  ownShipId(plan) {
    if (plan?.shipId == null) return null;
    return belongsTo(plan.commanderId ?? null, this.commander(), this.singleCommander()) ? plan.shipId : null;
  }

  /**
   * Plans d'un vaisseau d'avant les commandants (commanderId null, migration 0002) : rattachés à `commander`, le plus
   * vu dans les journaux. Les plans vierges (sans vaisseau) restent à personne. Rend le nombre de plans rattachés.
   */
  async adoptPlans(commander) {
    if (!commander || typeof this.prisma?.engineeringPlan?.updateMany !== 'function') return 0;
    const { count } = await this.prisma.engineeringPlan.updateMany({ where: { commanderId: null, shipId: { not: null } }, data: { commanderId: commander } });
    return count;
  }

  /** Le plan vaut-il pour le commandant chargé (le sien, ou d'avant les commandants s'il est seul) ? */
  isMine(plan) {
    return belongsTo(plan?.commanderId ?? null, this.commander(), this.singleCommander());
  }

  /** Plan du vaisseau `shipId` du commandant chargé (ou d'avant les commandants, s'il est seul), ou null. */
  async planOfShip(shipId) {
    const cur = this.commander();
    const mine = await this.prisma.engineeringPlan.findFirst({ where: { shipId, commanderId: cur } });
    if (mine || cur === null || !this.singleCommander()) return mine;
    return this.prisma.engineeringPlan.findFirst({ where: { shipId, commanderId: null } });
  }

  /**
   * Emplacements d'un vaisseau avec sa config actuelle (Loadout) si elle est connue. Un Loadout d'un autre type que
   * shipKey n'est jamais appliqué (R17 : le numéro d'un vaisseau vendu sert au suivant) : emplacements vides.
   * commanderId : commandant du vaisseau (celui du plan ; undefined : le commandant chargé), voir shipOf.
   */
  shipSlots(shipKey, shipId, commanderId = undefined) {
    const ref = this.requireRef();
    const loadout = this.loadoutOf(shipKey, shipId, commanderId);
    if (loadout) return mapLoadout(ref, shipKey, loadout);
    return (ref.shipSlots(shipKey) || []).map((s) => ({ ...s, current: null }));
  }

  /** Loadout du vaisseau shipId (de ce commandant, voir shipOf), seulement s'il est bien du type shipKey (R17), sinon null. */
  loadoutOf(shipKey, shipId, commanderId = undefined) {
    const loadout = this.shipOf(shipId, commanderId)?.loadout ?? null;
    if (!loadout) return null;
    const key = this.ref?.shipKey(loadout.Ship) || String(loadout.Ship || '').toLowerCase();
    return key === shipKey ? loadout : null;
  }

  // --- Plans ---

  /**
   * Écritures de plan d'un même vaisseau, l'une après l'autre : « chercher le plan du vaisseau, sinon le créer » fait
   * deux requêtes, et un double clic (ou un import pendant une création) créait deux plans pour le même vaisseau.
   */
  async withShipLock(shipId, fn) {
    if (shipId == null) return fn();
    const key = shipKeyOf(this.commander(), Number(shipId)); // le vaisseau de ce commandant
    const before = this.shipLocks.get(key) ?? Promise.resolve();
    const run = before.then(fn);
    const tail = run.catch(() => {});
    this.shipLocks.set(key, tail);
    try {
      return await run;
    } finally {
      if (this.shipLocks.get(key) === tail) this.shipLocks.delete(key);
    }
  }

  async createPlan({ shipId, shipType }) {
    if (shipId != null && gameShipId(shipId) == null) throw publicError(400, 'Vaisseau invalide.');
    return this.withShipLock(shipId, () => this.createPlanNow({ shipId, shipType }));
  }

  /** createPlan, sans le verrou du vaisseau (appelée seulement par createPlan). */
  async createPlanNow({ shipId, shipType }) {
    const ref = this.requireRef();
    let key;
    let name;
    if (shipId != null) {
      // Le plan de CE vaisseau : celui du même numéro chez un autre commandant n'est pas le sien
      const existing = await this.planOfShip(Number(shipId));
      if (existing) return existing;
      const s = this.shipOf(Number(shipId));
      if (!s) throw publicError(404, 'Vaisseau introuvable dans le journal.');
      key = ref.shipKey(s.type) || s.type;
      name = [ref.shipName(key, s.type), s.name || s.ident].filter(Boolean).join(' · ');
    } else {
      key = shipType;
      if (typeof key !== 'string' || !Object.hasOwn(ref.ships, key)) throw publicError(400, 'Type de vaisseau inconnu.');
      name = `${ref.shipName(key)} (vierge)`;
    }
    const slots = this.shipSlots(key, shipId != null ? Number(shipId) : null);
    return this.prisma.engineeringPlan.create({
      data: {
        shipId: shipId != null ? Number(shipId) : null,
        // Plan d'un vaisseau : rattaché à son commandant ; plan vierge : à personne
        commanderId: shipId != null ? this.commander() : null,
        shipType: key,
        name,
        modules: {
          create: slots.map((s) => ({
            slot: s.key,
            module: s.current?.module || null,
            blueprint: ref.blueprintKey(s.current?.blueprint) || null,
            grade: s.current?.grade || 0,
            experimental: s.current?.experimental || null,
            ...currentFields(s.current, ref),
          })),
        },
      },
    });
  }

  async getPlan(id) {
    const plan = await this.prisma.engineeringPlan.findUnique({ where: { id: requireRowId(id, 'Plan introuvable.') }, include: { modules: true } });
    if (!plan) throw publicError(404, 'Plan introuvable.');
    return plan;
  }

  /** Assemble la page d'un plan : emplacements, options, cibles, calcul. */
  async planView(id) {
    const ref = this.requireRef();
    const plan = await this.getPlan(id);
    const slots = this.shipSlots(plan.shipType, plan.shipId, plan.commanderId ?? null);
    const targets = new Map(plan.modules.map((m) => [m.slot, m]));
    const optionSets = {};
    const groups = {};

    const rows = slots.map((s) => {
      const t = targets.get(s.key);
      const target = t ? { module: t.module, blueprint: t.blueprint, grade: t.grade, experimental: t.experimental } : { module: s.current?.module || null };
      const grp = ref.groupOf(target.module);
      const setKey = `${s.group}|${s.size}|${s.grp || ''}|${(s.eligible || []).join(',')}`;
      if (!optionSets[setKey]) {
        optionSets[setKey] = ref.modulesForSlot(plan.shipType, s)
          .map((m) => ({ symbol: m.symbol, label: ref.moduleLabel(m.symbol), grp: m.grp }))
          .sort((a, b) => a.label.localeCompare(b.label, 'fr'));
      }
      if (grp && !groups[grp]) groups[grp] = { blueprints: ref.blueprintsFor(grp), specials: ref.specialsFor(grp) };
      return {
        key: s.key,
        group: s.group,
        size: s.size,
        label: s.label,
        restriction: s.restriction || null,
        optionSet: setKey,
        grp,
        current: s.current && {
          ...s.current,
          label: ref.moduleLabel(s.current.module),
          blueprintKey: ref.blueprintKey(s.current.blueprint),
          blueprintLabel: s.current.blueprint ? ref.blueprintLabel(ref.blueprintKey(s.current.blueprint) || s.current.blueprint) : null,
          experimentalLabel: s.current.experimental ? s.current.experimentalLabel || ref.specialLabel(s.current.experimental) : null,
        },
        target: { ...target, label: target.module ? ref.moduleLabel(target.module) : null },
      };
    });

    const calc = this.calcFor(rows);
    return {
      plan: { id: plan.id, name: plan.name, shipId: plan.shipId, shipType: plan.shipType, selected: plan.selected, updatedAt: plan.updatedAt },
      validation: this.itin.validationOf(plan),
      ship: {
        key: plan.shipType,
        model: ref.shipName(plan.shipType),
        hasImage: this.hasImage(plan.shipType),
        live: plan.shipId != null && !!this.loadoutOf(plan.shipType, plan.shipId, plan.commanderId ?? null),
      },
      slots: rows,
      optionSets,
      groups,
      calc,
    };
  }

  /** Modules d'un plan à calculer (ceux qui visent une modification). */
  calcModules(rows, prefix = '') {
    return rows
      .filter((r) => r.target.blueprint && r.target.grade)
      .map((r) => ({ slot: `${prefix}${r.key}`, label: `${r.label} · ${r.target.label || ''}`, grp: r.grp, target: r.target, current: r.current }));
  }

  /** Calcul d'un ensemble de modules, rangs des ingénieurs compris (montées partagées entre ces modules). */
  calcFor(rows, modules = this.calcModules(rows)) {
    const ref = this.ref;
    const res = planNeeds(ref, { modules, inventory: this.inventory, engineers: engineerStates(this.ranks) });
    for (const m of res.materials) m.method = obtainMethod(m.key, ref.materials.get(m.key));
    for (const m of res.rankExtra.materials) m.method = obtainMethod(m.key, ref.materials.get(m.key));
    for (const m of res.modules) {
      for (const st of m.steps) {
        st.label = st.experimental ? `Effet expérimental : ${ref.specialLabel(st.experimental)}` : `G${st.grade}`;
        if (st.status.best) st.status.best.base = ref.engineerBases.get(st.status.best.name) || null;
        if (st.status.afterUnlock) st.status.afterUnlock.base = ref.engineerBases.get(st.status.afterUnlock.name) || null;
      }
    }
    for (const e of res.engineers) e.base = ref.engineerBases.get(e.name) || null;
    return res;
  }

  async setModule(planId, slot, input) {
    const ref = this.requireRef();
    const plan = await this.getPlan(planId);
    const data = {};
    if ('module' in input) data.module = input.module || null;
    if ('blueprint' in input) data.blueprint = input.blueprint || null;
    if ('grade' in input) data.grade = Math.max(0, Math.min(5, Number(input.grade) || 0));
    if ('experimental' in input) data.experimental = input.experimental || null;
    // Nouveau module : la modification doit lui correspondre
    if (data.module !== undefined) {
      const grp = ref.groupOf(data.module);
      const bps = ref.blueprintsFor(grp).map((b) => b.key);
      const cur = plan.modules.find((m) => m.slot === slot);
      const bp = data.blueprint !== undefined ? data.blueprint : cur?.blueprint;
      if (bp && !bps.includes(bp)) {
        data.blueprint = null;
        data.grade = 0;
        data.experimental = null;
      }
    }
    if (data.blueprint === null) {
      data.grade = 0;
      data.experimental = null;
    } else if (data.blueprint && !('grade' in input)) {
      const cur = plan.modules.find((m) => m.slot === slot);
      if (!cur?.grade) data.grade = maxGrade(ref, data.blueprint);
    }
    await this.prisma.planModule.upsert({
      where: { planId_slot: { planId: plan.id, slot } },
      create: { planId: plan.id, slot, ...data },
      update: data,
    });
    await this.prisma.engineeringPlan.update({ where: { id: plan.id }, data: { updatedAt: new Date() } });
  }

  /** Raccourci « tout en G5 » : modification actuelle, sinon la plus courante, au grade max. */
  async allG5(planId) {
    const ref = this.requireRef();
    const view = await this.planView(planId);
    for (const r of view.slots) {
      const module = r.target.module;
      if (!module) continue;
      const grp = ref.groupOf(module);
      const bps = ref.blueprintsFor(grp);
      if (!bps.length) continue;
      const keep = r.target.blueprint && bps.some((b) => b.key === r.target.blueprint) ? r.target.blueprint : null;
      const bp = keep || bps.find((b) => b.key === DEFAULT_BLUEPRINTS[grp])?.key || bps[0].key;
      await this.setModule(planId, r.key, { module, blueprint: bp, grade: maxGrade(ref, bp), experimental: r.target.experimental });
    }
  }

  /** Revient à la config actuelle du vaisseau. */
  async resetPlan(planId) {
    const ref = this.requireRef();
    const plan = await this.getPlan(planId);
    const slots = this.shipSlots(plan.shipType, plan.shipId, plan.commanderId ?? null);
    // Les deux étapes ensemble : un échec de la seconde ne laisse plus un plan vide
    await this.prisma.$transaction([
      this.prisma.planModule.deleteMany({ where: { planId: plan.id } }),
      this.prisma.planModule.createMany({
        data: slots.map((s) => ({
          planId: plan.id,
          slot: s.key,
          module: s.current?.module || null,
          blueprint: ref.blueprintKey(s.current?.blueprint) || null,
          grade: s.current?.grade || 0,
          experimental: s.current?.experimental || null,
          ...currentFields(s.current, ref),
        })),
      }),
    ]);
  }

  /** Besoins d'un plan sous forme de Map (pour le stock commun), rangs des ingénieurs compris. */
  async planNeedsMap(plan) {
    const view = await this.planView(plan.id);
    const needs = new Map(view.calc.materials.map((m) => [m.key, m.need]));
    return { view, needs };
  }

  async dashboard(ids) {
    return (await this.dashboardData(ids)).result;
  }

  /** Tableau de bord, et les vues des plans inclus (alertes de passage : modules et étapes de chaque plan). */
  async dashboardData(ids) {
    const ref = this.requireRef();
    const plans = await this.prisma.engineeringPlan.findMany({ orderBy: { updatedAt: 'desc' } });
    const chosen = ids?.length ? plans.filter((p) => ids.includes(p.id)) : plans.filter((p) => p.selected);
    const items = [];
    for (const p of chosen) {
      const { view, needs } = await this.planNeedsMap(p);
      items.push({ id: p.id, name: p.name, needs, view });
    }
    // Tous les plans ensemble : une montée de rang chez un ingénieur sert à tous les plans faits chez lui
    const together = items.length > 1 ? this.calcFor(null, items.flatMap((it) => this.calcModules(it.view.slots, `${it.id}/`))) : items[0]?.view.calc || null;
    const globalNeeds = together ? new Map(together.materials.map((m) => [m.key, m.need])) : null;
    const shared = sharedStock(ref, items, this.inventory, globalNeeds);
    for (const m of shared.global.materials) m.method = obtainMethod(m.key, ref.materials.get(m.key));
    const extraByKey = new Map((together?.materials || []).map((m) => [m.key, m]));
    for (const m of shared.global.materials) {
      const t = extraByKey.get(m.key);
      m.base = t?.base ?? m.need;
      m.rankExtra = t?.rankExtra ?? 0;
    }
    shared.global.rankExtra = together?.rankExtra || { materials: [], units: 0, unitsFavorable: 0, rolls: 0, rollsFavorable: 0 };
    // Ingénieurs dont le rang coûte quelque chose : sous le rang 5, rang inconnu, ou pas encore débloqués
    shared.global.engineers = (together?.engineers || []).filter((e) => e.locked || e.rank == null || e.rank < 5);
    const result = {
      // Tous les plans, inclus ou non : les cartes du tableau de bord (image et modèle aussi pour ceux qu'on n'a pas inclus)
      plans: plans.map((p) => ({
        id: p.id, name: p.name, shipType: p.shipType, model: ref.shipName(p.shipType), hasImage: this.hasImage(p.shipType),
        selected: chosen.some((c) => c.id === p.id),
      })),
      global: shared.global,
      echanges: this.echangesPour(shared.global.materials),
      perPlan: items.map((it, i) => ({
        ...shared.perPlan[i],
        shipType: it.view.ship.key,
        hasImage: it.view.ship.hasImage,
        modulesDone: it.view.calc.modulesDone,
        modulesTotal: it.view.calc.modulesTotal,
        missing: it.view.calc.materials.filter((m) => m.missing > 0).map((m) => ({ key: m.key, label: m.label, missing: m.missing })),
      })),
    };
    return { result, items };
  }

  /**
   * Échangeur de matériaux pour le tableau de bord : pour chaque matériau qui manque aux plans, quoi donner (surplus
   * seulement), et les échangeurs connus les plus proches de chaque type (appris dans le journal).
   */
  echangesPour(materiaux) {
    const besoin = new Map(materiaux.map((m) => [m.key, m.need]));
    const stock = [...this.inventoryRows(), ...this.absentRows()].map((r) => ({ ...r, need: besoin.get(r.key) || 0 }));
    const propositions = planEchanges(materiaux.filter((m) => m.missing > 0), stock);
    const ici = this.position?.starPos || null;
    const types = [...new Set(materiaux.filter((m) => m.missing > 0).map((m) => m.type))].filter((t) => ['Raw', 'Manufactured', 'Encoded'].includes(t));
    return {
      propositions,
      echangeurs: Object.fromEntries(types.map((t) => [t, this.traders.plusProches(t, ici)])),
      position: this.position?.system || null,
    };
  }

  /**
   * Import d'un build : lien EDSY (#/L=…) ou JSON au format Loadout.
   * Avec shipId, le plan est rattaché à ce vaisseau (sa config actuelle compte dans le calcul).
   */
  async importBuild({ text, shipId }) {
    const ref = this.requireRef();
    let shipKey;
    let name;
    let targets;
    let warnings = [];
    const hash = extractHash(text);
    if (hash) {
      if (!this.eddb) this.eddb = loadEddb(REF_DIR);
      if (!this.eddb) throw publicError(503, 'Données EDSY absentes : clique sur « Mettre à jour les données ».');
      let dec;
      try {
        dec = decodeEdsy(this.eddb, hash);
      } catch (err) {
        throw publicError(400, err.message);
      }
      shipKey = ref.shipKey(dec.shipFdname);
      if (!shipKey) throw publicError(400, `Vaisseau absent des données de référence : ${dec.shipName}.`);
      ({ targets, warnings } = edsyToTargets(ref, shipKey, dec));
      name = dec.name ? `${dec.name} · ${ref.shipName(shipKey)}` : `${ref.shipName(shipKey)} (EDSY)`;
    } else {
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw publicError(400, 'Colle un lien EDSY (https://edsy.org/#/L=…) ou un export JSON au format Loadout.');
      }
      const lo = findLoadout(json);
      if (!lo) throw publicError(400, 'Aucune configuration (Loadout) trouvée dans ce JSON.');
      shipKey = ref.shipKey(lo.Ship || lo.ship);
      if (!shipKey) throw publicError(400, `Vaisseau inconnu : ${lo.Ship || lo.ship}.`);
      targets = new Map(mapLoadout(ref, shipKey, lo).filter((s) => s.current).map((s) => [s.key, {
        module: s.current.module,
        blueprint: ref.blueprintKey(s.current.blueprint),
        grade: s.current.grade,
        experimental: s.current.experimental,
      }]));
      name = `${(lo.ShipName || '').trim() || ref.shipName(shipKey)} (import)`;
    }

    let owned = null;
    if (shipId != null && shipId !== '') {
      owned = this.shipOf(Number(shipId)); // un vaisseau du commandant chargé
      if (!owned) throw publicError(404, 'Vaisseau introuvable dans le journal.');
      if (ref.shipKey(owned.type) !== shipKey) throw publicError(400, `Ce build est pour un ${ref.shipName(shipKey)}, pas pour ce vaisseau.`);
    }
    const slots = this.shipSlots(shipKey, owned ? owned.shipId : null);
    const modules = slots.map((s) => {
      const t = targets.get(s.key);
      return {
        slot: s.key,
        module: t ? t.module : null,
        blueprint: t?.blueprint || null,
        grade: t?.blueprint ? t.grade || 0 : 0,
        experimental: t?.experimental || null,
        ...currentFields(s.current, ref),
      };
    });

    // Vaisseau qui a déjà un plan : le plan est remplacé par le build importé, en une seule transaction (un échec au
    // milieu ne laisse plus un plan vide). Même vaisseau : après une création ou un import en cours (withShipLock).
    return this.withShipLock(owned ? owned.shipId : null, async () => {
      const existing = owned ? await this.planOfShip(owned.shipId) : null;
      if (existing) {
        const [, , plan] = await this.prisma.$transaction([
          this.prisma.planModule.deleteMany({ where: { planId: existing.id } }),
          this.prisma.planModule.createMany({ data: modules.map((m) => ({ ...m, planId: existing.id })) }),
          this.prisma.engineeringPlan.update({ where: { id: existing.id }, data: { name } }),
        ]);
        return { plan, warnings };
      }
      const plan = await this.prisma.engineeringPlan.create({
        data: { shipId: owned ? owned.shipId : null, commanderId: owned ? this.commander() : null, shipType: shipKey, name, modules: { create: modules } },
      });
      return { plan, warnings };
    });
  }

  // --- Images ---
  // La clé du vaisseau devient un nom de fichier : elle est vérifiée avant tout accès au disque.

  /**
   * Image choisie par le joueur (data/images/<clé>.png|jpg|webp) ; clé invalide : erreur 400. Une clé qui n'est pas un
   * vaisseau des données de référence (« nul », « con », « __proto__ »…) ne désigne aucun fichier : rien n'est lu.
   */
  customImage(key) {
    checkShipKey(key);
    if (this.ref?.ships && !Object.hasOwn(this.ref.ships, key)) return null;
    for (const ext of ['png', 'jpg', 'webp']) {
      const p = path.join(IMAGES_DIR, `${key}.${ext}`);
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  /** Vaisseau sans clé connue (null…) ou clé invalide : pas d'image, sans erreur (listes de la flotte). */
  hasImage(key) {
    if (!isShipKey(key)) return false;
    return !!(this.customImage(key) || dessinVaisseau(key) || this.ref?.imageFile(key));
  }

  /** Image envoyée par le joueur, sinon dessin livré avec l'app (core/reference/vaisseaux.js), sinon dessin téléchargé. */
  imagePath(key) {
    return this.customImage(key) || dessinVaisseau(key) || this.ref?.imageFile(key) || null;
  }

  /**
   * Image envoyée pour un vaisseau. La clé doit être celle d'un vaisseau des données de référence (jamais un nom choisi
   * par la requête : « nul », « com1 » ou « __proto__ » ne deviennent pas des fichiers), et l'image est reconnue à son
   * contenu (core/imageCheck.js) : un texte ou un SVG annoncé « png » est refusé. Écriture atomique (fichier
   * temporaire puis renommage), l'ancienne image retirée seulement ensuite.
   */
  saveCustomImage(key, dataUrl) {
    checkShipKey(key);
    const img = decodeImageDataUrl(dataUrl, ['png', 'jpeg', 'webp']);
    if (img.error) throw publicError(400, img.error);
    const ref = this.requireRef();
    if (!ref.ships || !Object.hasOwn(ref.ships, key)) throw publicError(400, 'Vaisseau inconnu des données de référence.');
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
    const file = path.join(IMAGES_DIR, `${key}.${img.ext}`);
    writeFileAtomicSync(file, img.buf); // core/atomic.js
    for (const ext of ['png', 'jpg', 'webp']) if (ext !== img.ext) fs.rmSync(path.join(IMAGES_DIR, `${key}.${ext}`), { force: true });
  }
}

function currentFields(c, ref) {
  return {
    currentModule: c?.module || null,
    currentBlueprint: ref.blueprintKey(c?.blueprint) || c?.blueprint || null,
    currentGrade: c?.grade || 0,
    currentQuality: c?.quality || 0,
    currentExperimental: c?.experimental || null,
  };
}

function maxGrade(ref, bp) {
  return Math.max(...Object.keys(ref.blueprints[bp]?.grades || { 0: 1 }).map(Number));
}

/** Clé de vaisseau coriolis (« federal_corvette ») : minuscules, chiffres et _, rien qui sorte du dossier. */
export function isShipKey(key) {
  return typeof key === 'string' && key.length <= 64 && /^[a-z0-9_]+$/.test(key);
}

export function checkShipKey(key) {
  if (!isShipKey(key)) throw publicError(400, 'Vaisseau invalide.');
  return key;
}

export function publicError(status, message) {
  const err = new Error(message);
  err.status = status;
  err.publicMessage = message;
  return err;
}
