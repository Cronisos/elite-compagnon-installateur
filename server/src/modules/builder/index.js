// Module « Constructeur de builds » : composer un vaisseau (modules, modifications, effets
// expérimentaux), voir ses statistiques, enregistrer ses builds et les partager (lien EDSY).
// Données : eddb.js d'EDSY et données de référence, téléchargées par le module Ingénierie dans
// server/data/reference/ (lues ici par le cœur, sans importer le code de l'ingénierie).

import fs from 'node:fs';
import path from 'node:path';
import { REF_DIR } from '../../core/reference/download.js';
import { dataPath } from '../../core/paths.js';
import { isPlainObject, readJsonFile, writeJsonAtomicSync } from '../../core/atomic.js';
import { currentReference } from '../../core/reference/refdata.js';
import { GROUPS, loadEddb, extractHash, decodeEdsy, findLoadout } from '../../core/reference/edsy.js';
import { boundBuild, boundGrade, decodedToBuild, encodeEdsy, loadoutToBuild, maxCoreBuild, moduleAllowed, moduleOf, stockBuild } from '../../core/reference/edsyBuild.js';
import { computeStats } from './stats.js';
import { inaraName, inaraSearch, parseInaraPage } from './inara.js';
import { frenchName, moduleInfo, moduleLabel } from './names.js';
import { shareText } from './share.js';
import { ecartBuild } from './ecart.js';
import { apercuVaisseaux } from './apercu.js';
import { depassements, limitText } from './limites.js';
import { requireRowId } from '../../core/ids.js';
import { belongsTo, CommanderTracker } from '../../core/commander.js';
import { ShipNicknames } from '../../core/shipNicknames.js';

const INARA_FILE = dataPath('inara-modules.json'); // data/inara-modules.json : liste nom → numéro Inara

const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

function bad(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  err.publicMessage = message;
  return err;
}

const GROUP_LABELS = { hardpoint: "Points d'emport", utility: 'Utilitaires', component: 'Modules de base', military: 'Compartiments militaires', internal: 'Internes' };
const CORE_LABELS = ['Blindage', 'Générateur', 'Propulseurs', 'Réacteur FSD', 'Support vital', 'Distributeur', 'Capteurs', 'Réservoir'];
const HP_LABELS = { 0: 'Utilitaire', 1: 'Petit', 2: 'Moyen', 3: 'Grand', 4: 'Énorme' };
const DONE = new Set(['ShipyardSell', 'SellShipOnRebuy']);

/**
 * Modules ingéniérés d'après le Loadout lui-même (ce que le jeu écrit, même pour une modification que les données EDSY
 * ne connaissent pas) : leur nombre et le grade le plus haut (badge des cartes de Mes vaisseaux).
 */
export function ingenierieDe(lo) {
  const faits = (Array.isArray(lo?.Modules) ? lo.Modules : []).filter((m) => m && typeof m.Engineering === 'object' && m.Engineering);
  const grades = faits.map((m) => Number(m.Engineering.Level)).filter((g) => Number.isInteger(g) && g >= 1 && g <= 5);
  return { modules: faits.length, gradeMax: grades.length ? Math.max(...grades) : null };
}

export default {
  id: 'builder',
  name: 'Constructeur de builds',

  async register({ router, prisma, journal, game }) {
    // --- Données de référence (rechargées si l'ingénierie les met à jour) ---
    let cache = { stamp: null, eddb: null, ref: null, catalogs: new Map() };
    function data() {
      const meta = path.join(REF_DIR, 'meta.json');
      const stamp = fs.existsSync(meta) ? fs.statSync(meta).mtimeMs : null;
      if (stamp !== cache.stamp) {
        cache = { stamp, eddb: stamp ? loadEddb(REF_DIR) : null, ref: stamp ? currentReference(REF_DIR) : null, catalogs: new Map(), apercu: null };
      }
      if (!cache.eddb) throw bad("Données EDSY absentes : ouvre « Mon ingénierie → Données » et télécharge les données de référence.", 503);
      return cache;
    }

    // --- Configurations réelles des vaisseaux, lues dans le journal ---
    // Par (commandant, ShipID) : le n° 1 d'un second compte sur le même PC n'est pas le n° 1 du compte principal
    // (core/commander.js). Mes vaisseaux, leurs fiches et leurs builds liés : ceux du commandant chargé.
    let commanders = new CommanderTracker();
    const fleets = new Map(); // commandant (null : inconnu) → Map ShipID → dernier Loadout
    const fleetOf = (c) => {
      if (!fleets.has(c)) fleets.set(c, new Map());
      return fleets.get(c);
    };
    let loadouts = fleetOf(null); // flotte du commandant chargé
    const learn = (ev) => {
      const before = commanders.current;
      const who = commanders.see(ev);
      if (who !== before) {
        const unknown = before === null ? fleets.get(null) : null;
        loadouts = fleetOf(who);
        // Commandant enfin connu : les vaisseaux vus avant lui sont les siens
        if (unknown) {
          for (const [id, lo] of unknown) if (!loadouts.has(id)) loadouts.set(id, lo);
          fleets.delete(null);
        }
      }
      // ShipID entier et type de vaisseau en texte : un Loadout abîmé n'entre pas dans la flotte (« /fleet » en erreur 500)
      if (ev.event === 'Loadout' && Number.isInteger(ev.ShipID) && typeof ev.Ship === 'string' && ev.Ship) loadouts.set(ev.ShipID, ev);
      else if (DONE.has(ev.event)) loadouts.delete(ev.SellShipID ?? ev.SellShipId);
    };
    const commander = () => commanders.current;
    /** Build lié à un vaisseau du commandant chargé (ou d'avant les commandants, s'il est seul) ? */
    const mine = (row) => belongsTo(row.commanderId ?? null, commander(), commanders.single());
    // LoadGame : le commandant chargé, même sans la note du lecteur des journaux
    journal.addInterest(['Loadout', 'LoadGame', ...DONE]);
    journal.on('ready', ({ history }) => {
      commanders = new CommanderTracker();
      fleets.clear();
      loadouts = fleetOf(null);
      for (const ev of history) learn(ev);
      // Builds liés à un vaisseau d'avant les commandants : rattachés au commandant le plus vu dans les journaux
      const owner = (typeof journal.mostSeenCommander === 'function' ? journal.mostSeenCommander() : null) ?? commanders.mostSeen();
      if (owner && typeof prisma.build?.updateMany === 'function') {
        prisma.build.updateMany({ where: { commanderId: null, gameShipId: { not: null } }, data: { commanderId: owner } })
          .catch((e) => console.warn("Builds d'avant les commandants non rattachés (" + e.message + ") : ils valent tant qu'un seul commandant joue."));
      }
    });
    journal.on('event', learn);

    // Libellés des modules : noms français tirés des noms EDSY (names.js), les mêmes dans toutes les listes
    const blueprintLabel = (bp) => {
      const { ref } = data();
      const key = ref?.blueprintKey(bp.fdname);
      return (key && ref.blueprintLabel(key)) || bp.name;
    };
    const expLabel = (x) => data().ref?.specialLabel(x.fdname) || x.name;

    function slotLabel(ship, g, i) {
      const size = ship.slots[g][i];
      if (g === 'component') return CORE_LABELS[i];
      if (g === 'hardpoint') return `${HP_LABELS[size]} point d'emport`;
      if (g === 'utility') return 'Utilitaire';
      const name = String(ship.slotnames?.[g]?.[i] || '');
      if (/^cargo/i.test(name)) return `Soute uniquement (${size})`;
      if (g === 'military') return `Militaire (${size})`;
      return `Interne (${size})`;
    }

    /**
     * Emplacements du vaisseau et modules possibles pour chacun (mis en cache par vaisseau). Les modules cachés par
     * EDSY (hidden : retirés du jeu, doublons gratuits des hangars, blindages Mk II Ablative) ne sont pas proposés,
     * mais restent décrits dans `modules` : un build venu du journal peut en porter un, il s'affiche alors normalement.
     */
    function catalog(shipId) {
      const { eddb, catalogs } = data();
      if (catalogs.has(shipId)) return catalogs.get(shipId);
      const ship = eddb.ship[shipId];
      if (!ship) throw bad('Vaisseau inconnu.', 404);
      const ids = [...new Set([...Object.keys(eddb.module), ...Object.keys(ship.module || {})])].map(Number);
      const modules = {};
      const mtypes = {};
      const slots = {};
      for (const g of GROUPS) {
        slots[g] = (ship.slots[g] || []).map((size, i) => {
          const allowed = ids.filter((id) => moduleAllowed(eddb, shipId, g, i, id));
          const options = allowed.filter((id) => !moduleOf(eddb, ship, id).hidden);
          for (const id of allowed) {
            if (modules[id]) continue;
            const m = moduleOf(eddb, ship, id);
            const nobp = m.noblueprints || {};
            const noexp = m.noexpeffects || {};
            modules[id] = {
              id, label: moduleLabel(m), info: moduleInfo(m) || null, mass: m.mass ?? 0, power: m.pwrdraw ?? 0,
              class: m.class, rating: m.rating, mtype: m.mtype, mount: m.mount || null, nobp: nobp['*'] ? ['*'] : Object.keys(nobp),
              noexp: noexp['*'] ? ['*'] : Object.keys(noexp), // effets expérimentaux interdits sur ce module ('*' : tous)
              limit: m.limit || null, // famille limitée en nombre (limites.js)
              // Relève la limite d'une autre famille (stabilisateur d'armes expérimentales : +1 ou +2 armes expérimentales)
              unlimit: m.unlimit ? { key: m.unlimit, count: Number(m.unlimitcount) || 0 } : null,
            };
            if (!mtypes[m.mtype]) {
              const mt = eddb.mtype[m.mtype] || {};
              mtypes[m.mtype] = {
                name: mt.name,
                blueprints: (mt.blueprints || []).filter((b) => eddb.blueprint[b]).map((b) => ({ id: b, label: blueprintLabel(eddb.blueprint[b]), maxgrade: eddb.blueprint[b].maxgrade })),
                expeffects: (mt.expeffects || []).filter((x) => eddb.expeffect[x]).map((x) => ({ id: x, label: expLabel(eddb.expeffect[x]) })),
              };
            }
          }
          options.sort((a, b) => modules[a].label.localeCompare(modules[b].label, 'fr', { numeric: true }));
          return { size, label: slotLabel(ship, g, i), options };
        });
      }
      // Familles limitées en nombre présentes sur ce vaisseau : { clé: { max, texte, textes } } (« un seul générateur de
      // boucliers »). max : limite de base ; textes : libellé de chaque limite relevée (max + unlimitcount d'un module
      // installé), pour le grisé du constructeur
      const limits = {};
      for (const m of Object.values(modules)) {
        if (m.limit && eddb.limit?.[m.limit] && !limits[m.limit]) {
          const max = eddb.limit[m.limit];
          limits[m.limit] = { max, texte: limitText(m.limit, max, moduleOf(eddb, ship, m.id)), textes: {} };
        }
      }
      for (const m of Object.values(modules)) {
        const l = m.unlimit && limits[m.unlimit.key];
        if (!l || !m.unlimit.count) continue;
        const max = l.max + m.unlimit.count;
        l.textes[max] ??= `${limitText(m.unlimit.key, max)} avec le ${frenchName(moduleOf(eddb, ship, m.id)).replace(/^\S/, (c) => c.toLowerCase())} ${m.class}${m.rating}`;
      }
      const out = { shipId, name: ship.name, groups: GROUPS.map((g) => ({ key: g, label: GROUP_LABELS[g] })), slots, modules, mtypes, limits, stock: stockBuild(eddb, shipId) };
      catalogs.set(shipId, out);
      return out;
    }

    /** Vérifie un build reçu du navigateur ; renvoie une copie propre. */
    function clean(body) {
      const { eddb } = data();
      const shipId = Number(body?.shipId);
      const ship = eddb.ship[shipId];
      if (!ship) throw bad('Choisis un vaisseau.');
      const slots = {};
      for (const g of GROUPS) {
        slots[g] = (ship.slots[g] || []).map((_, i) => {
          const s = body.slots?.[g]?.[i];
          if (!s?.modid) {
            if (g === 'component') throw bad(`Module de base manquant : ${CORE_LABELS[i]}.`);
            return null;
          }
          const modid = Number(s.modid);
          if (!moduleAllowed(eddb, shipId, g, i, modid)) throw bad(`Module impossible dans cet emplacement (${slotLabel(ship, g, i)}).`);
          const sheet = moduleOf(eddb, ship, modid);
          const mt = eddb.mtype[sheet.mtype] || {};
          // Modification admise par son type et pas interdite sur ce module (noblueprints d'EDSY : toutes, '*', ou une
          // liste ; armes AX et lasers de minage sans modification, modules gardiens hybrides…), comme le catalogue
          const nobp = sheet.noblueprints || {};
          const bpid = s.bpid && (mt.blueprints || []).includes(s.bpid) && eddb.blueprint[s.bpid] && !nobp['*'] && !nobp[s.bpid] ? s.bpid : null;
          const grade = bpid ? boundGrade(eddb, bpid, s.grade) : 0;
          // Effet expérimental : seulement sur un module modifié (le jeu n'en pose pas sans modification), admis par son
          // type, et pas interdit sur ce module (noexpeffects d'EDSY : tous, '*', ou une liste ; Lance-missiles 2B et
          // Munitions à traînée, Abrasion Blaster et Munitions incendiaires…)
          const noexp = sheet.noexpeffects || {};
          const expid = bpid && s.expid && (mt.expeffects || []).includes(s.expid) && !noexp['*'] && !noexp[s.expid] ? s.expid : null;
          return { modid, bpid, grade, expid };
        });
      }
      return { shipId, name: String(body.name || '').trim().slice(0, 120), slots };
    }

    /** Statistiques et avertissements (énergie, modules limités à un exemplaire…). */
    function evaluate(build, opts = {}) {
      const { eddb } = data();
      const stats = computeStats(eddb, build, opts);
      const warnings = [];
      if (stats.power.retracted > stats.power.capacity + 1e-6) warnings.push(`Énergie insuffisante, armes rentrées : ${stats.power.retracted.toFixed(2)} MW pour ${stats.power.capacity.toFixed(2)} MW.`);
      else if (stats.power.deployed > stats.power.capacity + 1e-6) warnings.push(`Énergie insuffisante, armes sorties : ${stats.power.deployed.toFixed(2)} MW pour ${stats.power.capacity.toFixed(2)} MW.`);
      // Modules limités en nombre (un seul générateur de boucliers…) : limites.js
      for (const d of depassements(eddb, build)) warnings.push(`Impossible dans le jeu : ${d.texte}.`);
      return { stats, warnings };
    }

    /** Texte « Copier pour Discord » (share.js : le nom du build y est neutralisé, ni mention ni lien masqué). */
    const shareOf = (build, stats, edsy) => shareText(build, data().eddb.ship[build.shipId].name, stats, edsy);

    // commanderId : commandant du vaisseau réel visé (gameShipId), null si le build n'en vise aucun
    const toRow = (b, gameShipId, commanderId = gameShipId != null ? commander() : null) => ({
      name: b.name || data().eddb.ship[b.shipId].name,
      shipId: b.shipId,
      shipType: String(data().eddb.ship[b.shipId].fdname).toLowerCase(),
      gameShipId: gameShipId ?? null,
      commanderId: gameShipId != null ? commanderId ?? null : null,
      slots: JSON.stringify(b.slots),
    });
    function fromRow(r) {
      // Grades bornés au grade maximal actuel (données de référence mises à jour depuis l'enregistrement) : edsyBuild.js
      const build = boundBuild(data().eddb, { shipId: r.shipId, name: r.name, slots: JSON.parse(r.slots) });
      let edsy = null;
      try {
        edsy = encodeEdsy(data().eddb, build);
      } catch {
        // vaisseau retiré des données : lien indisponible
      }
      // mine : le vaisseau visé est à toi (commandant chargé) ; sans le commandant lui-même (son FID reste dans le serveur)
      return { id: r.id, name: r.name, shipId: r.shipId, shipType: r.shipType, ship: data().eddb.ship[r.shipId]?.name || r.shipType, gameShipId: r.gameShipId, mine: r.gameShipId == null || mine(r), notes: r.notes, createdAt: r.createdAt, updatedAt: r.updatedAt, slots: build.slots, edsy };
    }

    // --- API ---

    router.get('/status', (req, res) => {
      try {
        data();
        res.json({ ready: true });
      } catch (err) {
        res.json({ ready: false, message: err.publicMessage || err.message });
      }
    });

    router.get('/ships', wrap(async (req, res) => {
      const { eddb } = data();
      res.json(Object.entries(eddb.ship).map(([id, s]) => ({ id: Number(id), name: s.name, size: s.class })).sort((a, b) => a.name.localeCompare(b.name, 'fr')));
    }));

    // Aperçu de tous les vaisseaux du jeu, pour choisir avant d'en faire un build (apercu.js) : calculé une fois par
    // version des données de référence
    router.get('/ships/apercu', wrap(async (req, res) => {
      const d = data();
      d.apercu ??= apercuVaisseaux(d.eddb);
      res.json(d.apercu);
    }));

    /** Mes vaisseaux réels (ShipID), avec le nom qu'on leur a donné. */
    router.get('/fleet', wrap(async (req, res) => {
      const { eddb } = data();
      // Noms donnés aux vaisseaux du commandant chargé (core/shipNicknames.js)
      const nicknames = await new ShipNicknames({ prisma, single: () => commanders.single() }).load();
      const out = [];
      for (const lo of loadouts.values()) {
        const r = loadoutToBuild(eddb, lo);
        if (!r) continue;
        out.push({ gameShipId: lo.ShipID, shipId: r.build.shipId, ship: eddb.ship[r.build.shipId].name, name: r.build.name, ident: typeof lo.ShipIdent === 'string' ? lo.ShipIdent : '', nickname: nicknames.get(lo.ShipID, commander()) || null, at: lo.timestamp });
      }
      res.json(out.sort((a, b) => a.ship.localeCompare(b.ship, 'fr') || a.gameShipId - b.gameShipId));
    }));

    // --- Lecture seule, pour Mes vaisseaux : ce qu'est chaque vaisseau aujourd'hui, d'après le jeu (jamais un build) ---

    /** Configuration actuelle d'un vaisseau, en build (null : jamais piloté depuis les journaux, ou inconnu d'EDSY). */
    function configActuelle(gameShipId) {
      const lo = loadouts.get(gameShipId);
      const r = lo && loadoutToBuild(data().eddb, lo);
      return r ? { lo, build: r.build, warnings: r.warnings } : null;
    }
    const nombre = (v) => (Number.isFinite(v) ? v : null);
    // Taille de pad d'atterrissage, d'après la taille du vaisseau dans EDSY (1, 2, 3)
    const PADS = { 1: 'S', 2: 'M', 3: 'L' };
    const padDe = (build) => PADS[data().eddb.ship[build.shipId]?.class] ?? null;

    /** Chiffres d'une carte de vaisseau : saut, soute, boucliers, rachat (ceux du jeu quand il les écrit), ingénierie. */
    function resume({ lo, build }) {
      const s = computeStats(data().eddb, build);
      return {
        saut: nombre(lo.MaxJumpRange) ?? s.jump.max,
        soute: nombre(lo.CargoCapacity) ?? s.cargo,
        boucliers: s.shields,
        coque: s.armour,
        rachat: nombre(lo.Rebuy) ?? s.cost.rebuy,
        pad: padDe(build),
        ingenierie: ingenierieDe(lo),
      };
    }

    /** Résumé de toute la flotte (cartes de Mes vaisseaux), par ShipID. */
    router.get('/fleet/resumes', wrap(async (req, res) => {
      const out = {};
      for (const id of loadouts.keys()) {
        const c = configActuelle(id);
        if (!c) continue;
        try {
          out[id] = resume(c);
        } catch {
          // vaisseau absent des données de référence : pas de chiffres, la carte reste
        }
      }
      res.json(out);
    }));

    /**
     * Fiche d'un vaisseau (lecture seule) : ses modules en clair (emplacement, module, ingénierie, effet) et toutes ses
     * statistiques, calculées sur sa configuration actuelle. Les chiffres que le jeu écrit lui-même (saut maximal, soute,
     * rachat, valeur) passent avant le calcul.
     */
    router.get('/fleet/:gameShipId/fiche', wrap(async (req, res) => {
      const gameShipId = Number(req.params.gameShipId);
      if (!Number.isInteger(gameShipId)) throw bad('Vaisseau inconnu.', 400);
      const c = configActuelle(gameShipId);
      if (!c) throw bad('Configuration de ce vaisseau inconnue : monte à bord en jeu pour qu\'elle soit lue.', 404);
      const { eddb } = data();
      const ship = eddb.ship[c.build.shipId];
      const modules = [];
      for (const g of GROUPS) {
        (c.build.slots[g] || []).forEach((s, i) => {
          if (!s?.modid) return;
          const m = moduleOf(eddb, ship, s.modid);
          const bp = s.bpid ? eddb.blueprint[s.bpid] : null;
          const ex = s.expid ? eddb.expeffect[s.expid] : null;
          // « 5A Propulseurs » : classe et note à part, pour les afficher en gros comme à l'écran d'équipement
          const label = moduleLabel(m);
          const cn = `${m.class ?? ''}${m.rating ?? ''}`;
          modules.push({
            groupe: g,
            emplacement: slotLabel(ship, g, i),
            taille: ship.slots[g][i],
            module: label,
            // Le blindage n'a ni classe ni note à l'écran d'équipement : seulement si le libellé commence par elles
            classe: cn && label.startsWith(`${cn} `) ? cn : null,
            nom: cn && label.startsWith(`${cn} `) ? label.slice(cn.length + 1) : frenchName(m) || label,
            info: moduleInfo(m) || null,
            ingenierie: bp ? { plan: blueprintLabel(bp), grade: s.grade, max: bp.maxgrade } : null,
            effet: ex ? expLabel(ex) : null,
          });
        });
      }
      const { stats, warnings } = evaluate(c.build);
      const lo = c.lo;
      res.json({
        gameShipId,
        ship: ship.name,
        nom: typeof lo.ShipName === 'string' ? lo.ShipName : '',
        ident: typeof lo.ShipIdent === 'string' ? lo.ShipIdent : '',
        pad: padDe(c.build),
        lu: lo.timestamp,
        groupes: GROUPS.map((g) => ({ key: g, label: GROUP_LABELS[g] })),
        modules,
        stats,
        jeu: { saut: nombre(lo.MaxJumpRange), soute: nombre(lo.CargoCapacity), rachat: nombre(lo.Rebuy), valeur: nombre(lo.HullValue) != null ? (lo.HullValue + (nombre(lo.ModulesValue) ?? 0)) : null },
        alertes: [...c.warnings, ...warnings],
      });
    }));

    /**
     * Builds d'un de mes vaisseaux (onglet « Builds » de sa fiche) : ceux qui lui sont destinés, puis ceux du même modèle
     * (destinés à aucun ou à un autre vaisseau), chacun avec « ce qu'il te faut » depuis sa configuration actuelle
     * (ecart.js) : modules à acheter, à retirer, modifications d'ingénierie, prix catalogue des achats.
     */
    router.get('/fleet/:gameShipId/builds', wrap(async (req, res) => {
      const gameShipId = Number(req.params.gameShipId);
      if (!Number.isInteger(gameShipId)) throw bad('Vaisseau inconnu.', 400);
      const c = configActuelle(gameShipId);
      if (!c) throw bad("Configuration de ce vaisseau inconnue : monte à bord en jeu pour qu'elle soit lue.", 404);
      const { eddb } = data();
      const ship = eddb.ship[c.build.shipId];
      const libelles = { emplacement: (g, i) => slotLabel(ship, g, i), module: moduleLabel, plan: blueprintLabel, effet: expLabel };
      const rows = await prisma.build.findMany({ where: { shipId: c.build.shipId }, orderBy: { updatedAt: 'desc' } });
      const vue = (r) => {
        const b = fromRow(r);
        let ecart = null;
        try {
          ecart = ecartBuild({ eddb, ship, actuel: c.build, cible: b, libelles, moduleOf });
        } catch {
          // build illisible (données changées) : il reste listé, sans écart
        }
        return { id: b.id, name: b.name, gameShipId: b.gameShipId, notes: b.notes, updatedAt: b.updatedAt, edsy: b.edsy, ecart };
      };
      // Liés : à CE vaisseau (même numéro et même commandant) ; le build d'un autre compte au même numéro est un modèle
      const lie = (r) => r.gameShipId === gameShipId && mine(r);
      res.json({ lies: rows.filter(lie).map(vue), modele: rows.filter((r) => !lie(r)).map(vue) });
    }));

    router.get('/catalog/:shipId', wrap(async (req, res) => res.json(catalog(Number(req.params.shipId)))));

    /** Build de départ : vaisseau d'origine, ou configuration actuelle d'un de mes vaisseaux. */
    router.post('/start', wrap(async (req, res) => {
      const { eddb } = data();
      const b = req.body || {};
      if (b.gameShipId != null) {
        const lo = loadouts.get(Number(b.gameShipId));
        if (!lo) throw bad('Configuration de ce vaisseau inconnue : monte à bord en jeu pour qu\'elle soit lue.', 404);
        const r = loadoutToBuild(eddb, lo);
        if (!r) throw bad(`Vaisseau inconnu d'EDSY : ${lo.Ship}.`);
        return res.json({ build: r.build, warnings: r.warnings, gameShipId: lo.ShipID });
      }
      const build = maxCoreBuild(eddb, Number(b.shipId)); // modules de base au maximum, en A
      if (!build) throw bad('Vaisseau inconnu.', 404);
      res.json({ build, warnings: [] });
    }));

    /** Import d'un lien EDSY ou d'un export JSON (format Loadout). */
    router.post('/import', wrap(async (req, res) => {
      const { eddb } = data();
      const text = String(req.body?.text || '');
      const hash = extractHash(text);
      if (hash) {
        try {
          return res.json({ build: decodedToBuild(eddb, decodeEdsy(eddb, hash)), warnings: [] });
        } catch (err) {
          throw bad(err.message);
        }
      }
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw bad('Colle un lien EDSY (https://edsy.org/#/L=…) ou un export JSON au format Loadout.');
      }
      const lo = findLoadout(json);
      if (!lo) throw bad('Aucune configuration (Loadout) trouvée dans ce JSON.');
      const r = loadoutToBuild(eddb, lo);
      if (!r) throw bad(`Vaisseau inconnu d'EDSY : ${lo.Ship || lo.ship}.`);
      res.json(r);
    }));

    router.post('/stats', wrap(async (req, res) => {
      const build = clean(req.body);
      // Pips SYS (0 à 4, 2 par défaut comme EDSY) : boucliers effectifs et recharge (stats.js)
      const { stats, warnings } = evaluate(build, { sysPips: req.body?.sysPips });
      const edsy = encodeEdsy(data().eddb, build);
      res.json({ stats, warnings, edsy, share: shareOf(build, stats, edsy) });
    }));

    // --- Recherche d'équipement d'Inara : modules du build, autour du système actuel ---
    const inaraIds = () => {
      const saved = readJsonFile(INARA_FILE, { fallback: null, accept: (v) => isPlainObject(v) && isPlainObject(v.ids), label: 'Page Inara importée' });
      return saved;
    };

    router.get('/inara', (req, res) => {
      const saved = inaraIds();
      res.json({ modules: saved ? Object.keys(saved.ids).length : 0, at: saved?.at || null });
    });

    /** Page Inara enregistrée (Ctrl+S) : on n'en garde que la liste des modules et leurs numéros. */
    router.post('/inara/import', wrap(async (req, res) => {
      const ids = parseInaraPage(req.body?.html || '');
      const count = Object.keys(ids).length;
      if (count < 100) throw bad("Liste des modules introuvable : enregistre la page « recherche d'équipement » d'Inara (Ctrl+S, HTML uniquement).");
      writeJsonAtomicSync(INARA_FILE, { at: new Date().toISOString(), ids }); // jamais un fichier coupé (core/atomic.js)
      res.json({ modules: count });
    }));

    router.post('/inara', wrap(async (req, res) => {
      const saved = inaraIds();
      if (!saved) throw bad("Charge d'abord la liste des modules d'Inara.", 409);
      const build = clean(req.body);
      const { eddb } = data();
      const ship = eddb.ship[build.shipId];
      const names = [];
      for (const g of GROUPS) {
        (build.slots[g] || []).forEach((s, i) => {
          if (s?.modid) names.push(inaraName(moduleOf(eddb, ship, s.modid), { armour: g === 'component' && i === 0, ship: ship.name }));
        });
      }
      res.json(inaraSearch(names, saved.ids, game.snapshot().system, ship.name));
    }));

    router.get('/builds', wrap(async (req, res) => {
      const rows = await prisma.build.findMany({ orderBy: { updatedAt: 'desc' } });
      res.json(rows.map(fromRow));
    }));

    router.get('/builds/:id', wrap(async (req, res) => {
      const r = await prisma.build.findUnique({ where: { id: requireRowId(req.params.id, 'Build introuvable.') } });
      if (!r) throw bad('Build introuvable.', 404);
      res.json(fromRow(r));
    }));

    /** Un build que le jeu refuserait (deux générateurs de boucliers…) n'est pas enregistré. */
    const refuserSiImpossible = (build) => {
      const d = depassements(data().eddb, build);
      if (d.length) throw bad(`Impossible dans le jeu : ${d.map((x) => x.texte).join(' · ')}.`);
    };

    router.post('/builds', wrap(async (req, res) => {
      const build = clean(req.body);
      if (!build.name) throw bad('Donne un nom à ton build.');
      refuserSiImpossible(build);
      const gid = req.body.gameShipId != null && req.body.gameShipId !== '' ? Number(req.body.gameShipId) : null;
      const r = await prisma.build.create({ data: { ...toRow(build, gid), notes: String(req.body.notes || '') } });
      res.status(201).json(fromRow(r));
    }));

    router.put('/builds/:id', wrap(async (req, res) => {
      const id = requireRowId(req.params.id, 'Build introuvable.');
      const before = await prisma.build.findUnique({ where: { id } });
      if (!before) throw bad('Build introuvable.', 404);
      const build = clean(req.body);
      if (!build.name) throw bad('Donne un nom à ton build.');
      refuserSiImpossible(build);
      const gid = req.body.gameShipId != null && req.body.gameShipId !== '' ? Number(req.body.gameShipId) : null;
      // Même vaisseau visé qu'avant : il garde son commandant (le build d'un autre compte, modifié pendant que tu joues
      // celui-ci, vise toujours le vaisseau de l'autre) ; un autre vaisseau visé : celui du commandant chargé
      const owner = gid != null && before.gameShipId === gid && before.commanderId != null ? before.commanderId : undefined;
      const r = await prisma.build.update({ where: { id }, data: { ...toRow(build, gid, owner), notes: String(req.body.notes || '') } });
      res.json(fromRow(r));
    }));

    router.post('/builds/:id/duplicate', wrap(async (req, res) => {
      const src = await prisma.build.findUnique({ where: { id: requireRowId(req.params.id, 'Build introuvable.') } });
      if (!src) throw bad('Build introuvable.', 404);
      const { id, createdAt, updatedAt, ...rest } = src;
      const r = await prisma.build.create({ data: { ...rest, name: `${src.name} (copie)` } });
      res.status(201).json(fromRow(r));
    }));

    router.delete('/builds/:id', wrap(async (req, res) => {
      await prisma.build.deleteMany({ where: { id: requireRowId(req.params.id, 'Build introuvable.') } });
      res.json({ ok: true });
    }));
  },
};
