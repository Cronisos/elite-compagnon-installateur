// Point d'entrée du serveur : services communs + chargement des modules.

import fs from 'node:fs';
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { JournalService } from './core/journalService.js';
import { GameState, GAME_STATE_EVENTS } from './core/gameState.js';
import { sseHandler, broadcast } from './core/realtime.js';
import { getSettings, updateSettings } from './core/settings.js';
import {
  onOverlayMode, overlayChangedAt, overlayChoice, overlayClosed, overlayDisabled, overlayLaunchPages, overlayMode, overlayRequest,
  overlayShown, overlaySnapshot, overlayState, restoreOverlay, setOverlayExtra, settleOverlay, showOverlay, masquerOverlay, garderOverlayActif, quitterOverlay, signalerRaccourcis,
  disposerOverlay, overlayStream,
} from './core/overlay.js';
import { modules } from './modules/index.js';
import { ModeAdvisor } from './core/modeGuess.js';
import { localGuard, jsonBody, errorReply, serverPort, uiPort } from './core/localGuard.js';
import { trackGameLanguage } from './core/language.js';
import { dataDir, dataPath, databaseFileUrl, journalDir } from './core/paths.js';
import { listRoutes } from './core/routeList.js';
import { gameShipId } from './core/ids.js';
import { removeStaleTemps } from './core/atomic.js';
import { installCrashGuard } from './core/crashGuard.js';
import { isMode } from './core/modes.js';
import { ShipRoles } from './core/shipRoles.js';
import { ShipNicknames } from './core/shipNicknames.js';
import { mountShipRoutes } from './core/shipRoutes.js';
import { BOARDING_EVENTS, ShipTracker } from './core/boarding.js';
import { RoleSwitcher } from './core/roleSwitch.js';
import { SilenceStore } from './core/silences.js';
import { Vigie, monterReglageVigie, propositionInvalide } from './core/vigie.js';
import { DOMAINES, TOUTES, fiche } from './regles/index.js';
import { Synthese, SYNTHESE_DERNIER, SYNTHESE_TOUS } from './core/synthese.js';
import { FICHIER_TUTORIELS, Tutoriels } from './core/tutoriels.js';
import { NOM_SAUVEGARDE, creerSauvegarde, dossierSauvegardes, listerSauvegardes } from './core/sauvegardes.js';
import { FICHIER_MISE_A_JOUR, MiseAJour } from './core/miseAJour.js';
import { FICHIER_RACCOURCIS, Raccourcis } from './core/raccourcis.js';
import { netFetch } from './core/net.js';
import { SERVER_DIR } from './core/paths.js';
import path from 'node:path';
import { getReference } from './core/reference/refdata.js';
import { messagePortPris, quiTientLePort } from './core/portPris.js';
import { registerModules } from './core/moduleLoader.js';

// Erreur imprévue hors d'une requête (minuterie, promesse sans traitement) : écrite clairement en français, puis arrêt
// (l'état du serveur n'est plus sûr) ; « npm run dev » (dev.js) le relance de lui-même. Avant tout le reste.
installCrashGuard();
// Restes d'écritures coupées (serveur tué entre l'écriture et le renommage, core/atomic.js)
removeStaleTemps(dataDir());

const OVERLAY_SETTLE_MS = 10_000; // délai laissé aux modules pour reprendre leurs fenêtres après un redémarrage
const PORT = serverPort(); // 3001, ou ELITE_PORT (banc de contrôle)
const UI_PORT = uiPort(); // interface Vite (client/vite.config.js, strictPort) : 5173, ou ELITE_UI_PORT (banc de contrôle)
// Base server/data/elite.db, ou celle d'ELITE_DATA_DIR ; Prisma 7 passe par un adaptateur (better-sqlite3, sans moteur à part)
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databaseFileUrl() }) });
const journal = new JournalService();
const game = new GameState();
const app = express();
app.disable('x-powered-by');
// Protection de l'API locale contre les sites web (Host, Origin, en-tête X-Elite-Compagnon) : voir core/localGuard.js.
// Avant la lecture des corps : une requête refusée n'est jamais lue.
app.use('/api', localGuard({ port: PORT, uiPort: UI_PORT }));
app.use(jsonBody()); // 1 Mo par défaut, 12 Mo pour les routes qui reçoivent une image

// --- Vaisseaux : noms donnés dans l'app (base), rôles (core/shipRoles.js), vaisseau actuel (core/boarding.js) ---
// Noms donnés, par (commandant, ShipID) : copie de la table ShipNickname, pour l'avis de bascule (core/shipNicknames.js)
const nicknames = new ShipNicknames({ prisma, single: () => journal.singleCommander() });
const roles = new ShipRoles({ file: dataPath('ship-roles.json') }).load(); // ne lève jamais d'erreur : un fichier abîmé n'arrête pas le serveur
const tracker = new ShipTracker();
// Proposition de mode de jeu d'après ce que tu fais (une devinette ne bascule jamais d'elle-même), selon les rôles du
// vaisseau actuel ; « Non » (30 min) tient même si l'app redémarre (core/silences.js)
const advisor = new ModeAdvisor({
  mode: overlayMode,
  onChange: (s) => broadcast('overlay:suggest', s),
  ship: () => switcher.advisorShip(),
  store: new SilenceStore({ file: dataPath('mode-silences.json') }),
});
/** Dernier signe de vie du jeu (ms) : Status.json, ou le journal actif écrit. */
function signOfLife() {
  const times = [Date.parse(journal.stateData.status?.timestamp)];
  try {
    if (journal.file) times.push(fs.statSync(journal.file).mtimeMs);
  } catch {
    // journal disparu : pas de signe
  }
  const ok = times.filter((t) => Number.isFinite(t));
  return ok.length ? Math.max(...ok) : null;
}
// Bascule vers le rôle principal à l'embarquement (core/roleSwitch.js)
const switcher = new RoleSwitcher({
  roles,
  tracker,
  advisor,
  broadcast,
  overlay: {
    state: () => ({ ...overlayState(), disabled: overlayDisabled() }),
    snapshot: overlaySnapshot,
    show: showOverlay,
    restore: restoreOverlay,
    closed: overlayClosed,
    choice: overlayChoice,
    changedAt: overlayChangedAt,
    launchPages: overlayLaunchPages,
  },
  nickname: (id, commander) => nicknames.get(id, commander ?? null),
  signOfLife,
  log: (t) => console.log(t),
});

/** Les rôles des vaisseaux ne doivent jamais arrêter la lecture du journal : une erreur est écrite, la lecture continue. */
function safely(what, fn) {
  try {
    return fn();
  } catch (err) {
    console.error(`Rôles des vaisseaux (${what}) : ${err.message}`);
    return null;
  }
}

// --- État du jeu : alimenté par le lecteur de journaux ---
journal.addInterest(GAME_STATE_EVENTS);
journal.addInterest(BOARDING_EVENTS);
journal.on('ready', ({ history }) => {
  game.reset();
  for (const ev of history) game.applyEvent(ev);
  if (journal.stateData.status) game.applyStatus(journal.stateData.status);
  if (journal.stateData.cargo) game.applyCargo(journal.stateData.cargo);
  safely("relecture", () => switcher.replay(history)); // vaisseau actuel retrouvé, rôles des vaisseaux vendus effacés ; jamais de bascule ici
  // Noms d'avant les commandants : rattachés au commandant le plus vu dans les journaux (core/shipNicknames.js)
  nicknames.adopt(journal.mostSeenCommander()).then((n) => {
    if (n) broadcast('ships:current', switcher.currentShip());
  }, (err) => console.warn(`Noms des vaisseaux d'avant les commandants non rattachés (${err.message}) : ils valent tant qu'un seul commandant joue.`));
});
// Historique remis à TOUS les modules (« ready » passe un module par tour, core/journalService.js) : le client peut
// recharger ses pages, elles ne liront plus l'état d'avant d'un module pas encore passé
journal.on('pret', () => broadcast('journal:ready', journal.info()));
journal.on('event', (ev) => {
  game.applyEvent(ev);
  broadcast('journal:event', { event: ev.event, timestamp: ev.timestamp });
  safely("embarquement", () => switcher.event(ev)); // embarquement : bascule vers le rôle principal (avant la proposition, qui en dépend)
  advisor.event(ev, journal.stateData.status);
});
journal.on('status', (st) => game.applyStatus(st));

// --- Synthèse de l'état du jeu (core/synthese.js) : tout ce que le jeu écrit, résumé sans doublons, dans
// GET /api/etat-jeu et le fichier etat-jeu.json du dossier des données (réécrit au plus toutes les 2 s) ---
const synthese = new Synthese({ fichier: dataPath('etat-jeu.json') });
const DERNIER = { last: true }; // même objet pour tous : la règle reste « le dernier » si personne d'autre ne les veut tous
journal.addInterest(SYNTHESE_DERNIER, { history: DERNIER });
journal.addInterest(SYNTHESE_TOUS);
const FICHIERS_SYNTHESE = ['cargo', 'navroute', 'market', 'modulesinfo', 'shiplocker', 'backpack'];
journal.on('ready', ({ history }) => {
  synthese.direct = false;
  synthese.reset();
  for (const ev of history) synthese.applyEvent(ev);
  for (const t of FICHIERS_SYNTHESE) if (journal.stateData[t]) synthese.applyFichier(t, journal.stateData[t]);
  if (journal.stateData.status) synthese.applyStatus(journal.stateData.status);
  synthese.enDirect();
});
journal.on('event', (ev) => synthese.applyEvent(ev));
journal.on('status', (st) => synthese.applyStatus(st));
for (const t of FICHIERS_SYNTHESE) journal.on(t, (data) => synthese.applyFichier(t, data));
journal.on('cargo', (c) => game.applyCargo(c));
journal.on('switch', (file) => broadcast('journal:switch', { file }));
game.on('change', (state) => broadcast('state', state));

// --- API commune ---
app.get('/api/stream', sseHandler);
app.get('/api/state', (req, res) => res.json({ game: game.snapshot(), journal: journal.info() }));
// Jauge des boucliers lue sur l'image du jeu par l'overlay (overlay/bouclier.js) : seulement le pourcentage
app.post('/api/etat-jeu/boucliers', (req, res) => {
  if (!synthese.applyBouclierLu(req.body?.pct)) return res.status(400).json({ error: 'Pourcentage attendu (entier de 0 à 100).' });
  return res.json({ ok: true });
});
// Synthèse de l'état du jeu ; ?partie=marche|materiaux|ingenieurs|missions|sac|casier|… : une partie, avec tout son détail
app.get('/api/etat-jeu', (req, res) => {
  const p = typeof req.query.partie === 'string' ? req.query.partie : null;
  if (!p) return res.json(synthese.snapshot());
  if (!/^[a-zA-Z]{1,30}$/.test(p)) return res.status(400).json({ error: 'Partie invalide.' });
  return res.json({ partie: p, contenu: synthese.partie(p) });
});
// Derniers événements : nom et heure seulement (jamais le chat, le FID ou le nom d'autres CMDR)
app.get('/api/journal/recent', (req, res) => res.json(journal.recent.map(({ event, timestamp }) => ({ event, timestamp })).reverse()));
// Langue du jeu (Fileheader) : l'interface prévient quand le jeu n'est pas en français (OCR et noms non garantis)
const gameLanguage = trackGameLanguage(journal, (status) => broadcast('journal:language', status));
app.get('/api/journal/language', (req, res) => res.json(gameLanguage.current()));
app.get('/api/settings', async (req, res, next) => {
  try {
    res.json(await getSettings(prisma));
  } catch (err) {
    next(err);
  }
});
app.put('/api/settings', async (req, res, next) => {
  try {
    const before = await getSettings(prisma);
    const after = await updateSettings(prisma, req.body || {}); // dossier réseau ou de périphérique : erreur 400
    // Dossier changé : relecture lancée sans l'attendre (ELITE_JOURNAL_DIR reste prioritaire). La réponse part tout de
    // suite ; l'historique se relit par morceaux sans geler le serveur, puis « journal:ready » est diffusé.
    if (after.journalPath !== before.journalPath) journal.start(journalDir(after.journalPath));
    broadcast('settings', after);
    res.json(after);
  } catch (err) {
    next(err); // Express 4 ne rattrape pas seul les erreurs des fonctions async
  }
});
// Tutoriels de l'interface : ceux déjà vus, et leur lancement à la première visite (core/tutoriels.js)
const tutoriels = new Tutoriels({ fichier: dataPath(FICHIER_TUTORIELS), force: process.env.ELITE_SANS_TUTORIEL !== '1' });
app.get('/api/tutoriels', (req, res) => res.json(tutoriels.etat()));
app.put('/api/tutoriels', (req, res) => {
  try {
    res.json(tutoriels.regler(req.body));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.publicMessage || 'Réglage des tutoriels impossible.' });
  }
});
// Overlay en jeu : mode de jeu choisi et fenêtres ouvertes
app.get('/api/overlay', (req, res) => res.json(overlayState()));
// Canal permanent des ordres vers l'overlay lancé (overlay/canal.js) : plus aucun processus lancé à chaque ordre
app.get('/api/overlay/stream', overlayStream);
app.put('/api/overlay', (req, res, next) => {
  // Demande vérifiée d'abord (mode, pages, glance, dismissExtras) : mal formée, 400 avec la raison, que l'overlay soit
  // installé ou non (le banc de contrôle, overlay coupé, la rejoue donc aussi). Un mode bien formé mais inconnu : 400 aussi.
  let request;
  try {
    request = overlayRequest(req.body ?? {});
  } catch (err) {
    return next(err);
  }
  if (request.mode !== null && !isMode(request.mode)) return res.status(400).json({ error: `Mode de jeu inconnu : « ${request.mode} ».` });
  if (!overlayState().installed) {
    const error = overlayDisabled() ? "L'overlay est coupé (ELITE_NO_OVERLAY) : aucune fenêtre ne s'ouvre." : "Fenêtres en jeu indisponibles : l'overlay n'est pas installé. Relance l'installateur d'Enova.";
    return res.status(409).json({ error });
  }
  // Mode changé à la main : noté avec le vaisseau et l'heure, pour qu'aucune bascule ne l'écrase dans ce vaisseau
  res.json(switcher.chooseMode(request));
});
// Paramètres › Disposer les fenêtres : toutes ouvertes en mode déplacement ({ on: true, pages }), puis { on: false }
app.post('/api/overlay/disposition', (req, res, next) => {
  try {
    const b = req.body ?? {};
    if (typeof b.on === 'boolean' && b.on && !overlayState().installed) return res.status(409).json({ error: "L'overlay n'est pas installé ou est coupé : aucune fenêtre ne s'ouvre." });
    res.json(disposerOverlay(b.on, b.pages));
  } catch (err) {
    next(err);
  }
});
// Alt+Maj+K pendant que tout est caché (overlay/main.js, basculerSouris) : l'app de bureau (si elle a lancé ce serveur)
// retire son ◆ et rouvre ce qu'il avait caché
app.post('/api/overlay/demasque', (req, res) => {
  process.send?.({ type: 'overlay-demasque' });
  res.json({ ok: true, bureau: Boolean(process.send) });
});
// App de bureau pilotée depuis l'API (l'IA de bord : « cache l'interface », « ouvre la page… ») : le serveur transmet
// à l'app (desktop/main.js), qui fait comme son ◆ ou son MAR. Sans app de bureau (serveur seul) : 409.
// Page de l'app : « /reperes », « /builder/nouveau », « /extension?onglet=vente » (l'app de bureau revérifie)
const cheminInterne = (c) => typeof c === 'string' && c.length <= 120 && /^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*(?:\?onglet=[a-z-]{1,40})?$/.test(c);
// Raccourcis clavier globaux (core/raccourcis.js) : réglés dans Paramètres, pris par l'overlay, qui les relit à
// chaque changement
const raccourcis = new Raccourcis({ fichier: dataPath(FICHIER_RACCOURCIS), cheminValide: cheminInterne });
app.get('/api/raccourcis', (req, res) => res.json(raccourcis.etat()));
app.put('/api/raccourcis', (req, res) => {
  try {
    const etat = raccourcis.regler(req.body);
    signalerRaccourcis();
    res.json(etat);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.publicMessage || 'Réglage des raccourcis impossible.' });
  }
});
let bureauCache = false; // ◆ : tout caché (message « overlay-masque » de l'app de bureau)
app.get('/api/bureau', (req, res) => res.json({ bureau: Boolean(process.send), cache: bureauCache, donnees: dataDir() }));
// « Effacer mes données » (Paramètres, Mon compte) : seulement avec le mot tapé par le joueur, et seulement l'app de
// bureau (elle se relance et efface avant de rouvrir la base). Aucun outil de l'IA de bord n'y mène.
app.post('/api/bureau/effacer', (req, res) => {
  if (req.body?.confirmation !== 'EFFACER') return res.status(400).json({ error: 'Tape EFFACER pour confirmer.' });
  if (!process.send) return res.status(409).json({ error: 'Seulement dans l’app de bureau : ferme le serveur et vide le dossier des données à la main.' });
  process.send({ type: 'bureau-effacer' });
  return res.json({ ok: true });
});
// Avis de nouvelle version (core/miseAJour.js) : coupé par défaut ; activé, une lecture de la page publique des
// versions toutes les douze heures au plus, par la passerelle réseau (liste blanche)
const miseAJour = new MiseAJour({
  fichier: dataPath(FICHIER_MISE_A_JOUR),
  racine: path.resolve(SERVER_DIR, '..'),
  lire: async (url) => {
    const res = await netFetch(url, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'Elite-Compagnon' } }, { maxBytes: 512 * 1024, timeoutMs: 15_000 });
    if (!res.ok) throw new Error(`GitHub : ${res.status}`);
    return res.json();
  },
});
app.get('/api/mise-a-jour', async (req, res) => res.json(await miseAJour.verifier()));
app.put('/api/mise-a-jour', async (req, res) => {
  try {
    const b = req.body || {};
    if (b.actif !== undefined || b.ignorer === true) miseAJour.regler({ actif: b.actif, ignorer: b.ignorer });
    res.json(await miseAJour.verifier({ force: b.verifier === true || b.actif === true }));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.publicMessage || 'Réglage impossible.' });
  }
});
// Sauvegardes des données (Paramètres, Mon compte) : dans Documents, hors du dossier de l'app (core/sauvegardes.js)
app.get('/api/sauvegardes', (req, res) => res.json({ dossier: dossierSauvegardes(), sauvegardes: listerSauvegardes(dossierSauvegardes()), restauration: Boolean(process.send) }));
let sauvegardeEnCours = false;
app.post('/api/sauvegardes', async (req, res) => {
  if (sauvegardeEnCours) return res.status(409).json({ error: 'Une sauvegarde est déjà en cours.' });
  sauvegardeEnCours = true;
  try {
    // Copie cohérente de la base ouverte : SQLite l'écrit lui-même dans un fichier neuf
    const copierBase = (vers) => prisma.$executeRawUnsafe(`VACUUM INTO '${vers.replace(/'/g, "''")}'`);
    const faite = await creerSauvegarde({ source: dataDir(), dossier: dossierSauvegardes(), copierBase });
    return res.json({ faite, dossier: dossierSauvegardes(), sauvegardes: listerSauvegardes(dossierSauvegardes()) });
  } catch (err) {
    console.error(`Sauvegarde : ${err.message}`);
    return res.status(err.status || 500).json({ error: err.publicMessage || 'Sauvegarde impossible : vérifie que ton dossier Documents est accessible et qu’il reste de la place.' });
  } finally {
    sauvegardeEnCours = false;
  }
});
// Restauration : seulement avec le mot tapé par le joueur, et seulement l'app de bureau (elle se relance et restaure
// avant de rouvrir la base). Les données actuelles sont mises de côté, jamais effacées.
app.post('/api/sauvegardes/restaurer', (req, res) => {
  const nom = req.body?.nom;
  if (req.body?.confirmation !== 'RESTAURER') return res.status(400).json({ error: 'Tape RESTAURER pour confirmer.' });
  if (typeof nom !== 'string' || !NOM_SAUVEGARDE.test(nom) || !listerSauvegardes(dossierSauvegardes()).some((s) => s.nom === nom)) {
    return res.status(404).json({ error: 'Sauvegarde introuvable.' });
  }
  if (!process.send) return res.status(409).json({ error: 'Seulement dans l’app de bureau.' });
  process.send({ type: 'bureau-restaurer', nom });
  return res.json({ ok: true });
});
app.post('/api/bureau/cacher', (req, res) => {
  if (typeof req.body?.cacher !== 'boolean') return res.status(400).json({ error: '« cacher » : vrai ou faux.' });
  if (!process.send) return res.status(409).json({ error: 'L’app de bureau n’est pas lancée : rien à cacher.' });
  process.send({ type: 'bureau-cacher', cacher: req.body.cacher });
  return res.json({ ok: true });
});
app.post('/api/bureau/ouvrir', (req, res) => {
  const chemin = req.body?.chemin;
  if (!cheminInterne(chemin)) return res.status(400).json({ error: 'Chemin d’une page de l’app attendu (« /reperes »).' });
  if (!process.send) return res.status(409).json({ error: 'L’app de bureau n’est pas lancée.' });
  process.send({ type: 'bureau-ouvrir', chemin });
  return res.json({ ok: true });
});
app.get('/api/overlay/suggest', (req, res) => res.json(advisor.current()));
app.post('/api/overlay/suggest/dismiss', (req, res) => {
  advisor.dismiss();
  res.json(null);
});

app.get('/api/modules', (req, res) => res.json(modules.map((m) => ({ id: m.id, name: m.name }))));

// Rôles des vaisseaux (par ShipID), vaisseau actuel, bascule à l'embarquement et son avis (core/shipRoutes.js)
mountShipRoutes(app, { roles, tracker, switcher, advisor, broadcast });

// Noms donnés par le joueur à ses vaisseaux, par (commandant, ShipID) : deux Cutter restent distincts, et le n° 1 d'un
// second compte n'a pas le nom du n° 1 du premier. Ceux du commandant chargé.
app.get('/api/ships/nicknames', async (req, res, next) => {
  try {
    await nicknames.load();
    res.json(nicknames.view(tracker.commander ?? null));
  } catch (err) {
    next(err);
  }
});
app.put('/api/ships/:shipId/nickname', async (req, res, next) => {
  const shipId = gameShipId(req.params.shipId); // ShipID du jeu (0, 1, 2…) : « 1.5 », « 0x1 » ou « -1 » ne sont pas un vaisseau
  const raw = req.body?.nickname;
  if (shipId == null) return res.status(400).json({ error: 'Vaisseau invalide.' });
  if (raw != null && typeof raw !== 'string') return res.status(400).json({ error: 'Nom invalide : un texte est attendu.' });
  let nickname;
  try {
    nickname = await nicknames.set(tracker.commander ?? null, shipId, raw);
  } catch (err) {
    return next(err); // base verrouillée… : erreur 500, le serveur continue
  }
  broadcast('ships:nicknames', { shipId, nickname });
  broadcast('ships:current', switcher.currentShip());
  res.json({ shipId, nickname });
});

// --- Vigie des règles (core/vigie.js) : les modules signalent leurs mesures, les alertes s'ouvrent dans l'overlay ---
// Outil de développement : coupée par défaut, allumée par son réglage (Paramètres) ou, sans choix enregistré, ELITE_VIGIE=1.
const vigie = new Vigie({
  fiche,
  fiches: TOUTES,
  dossier: dataDir(),
  actifParDefaut: process.env.ELITE_VIGIE === '1',
  onChange: (vue) => broadcast('vigie', vue),
  onAlertes: () => setOverlayExtra('vigie', vigie.fenetreOuverte()),
});
monterReglageVigie(app, vigie); // GET / PUT /api/vigie/reglage
const ficheVue = (f) => ({ id: f.id, nom: f.nom, titre: f.titre, valeur: f.valeur, unite: f.unite || null, statut: f.statut, date: f.date, source: f.source, controle: f.controle });
app.get('/api/vigie', (req, res) => {
  res.json({ domaines: DOMAINES.map((d) => ({ nom: d.nom, titre: d.titre, fiches: d.fiches.map(ficheVue) })), ...vigie.vue() });
});
app.get('/api/vigie/observations', (req, res) => {
  const regle = typeof req.query.regle === 'string' ? req.query.regle : null;
  if (regle && !fiche(regle)) return res.status(404).json({ error: 'Règle inconnue.' });
  const limite = Math.min(500, Math.max(1, Number.parseInt(req.query.limite, 10) || 100));
  res.json(vigie.observations({ regle, limite }));
});
app.get('/api/vigie/resume', (req, res) => {
  const jour = typeof req.query.jour === 'string' ? req.query.jour : undefined;
  if (jour !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(jour)) return res.status(400).json({ error: 'Jour invalide : AAAA-MM-JJ attendu.' });
  res.json({ texte: vigie.resume(jour) });
});
app.post('/api/vigie/regles/:id/compris', (req, res) => {
  const vue = vigie.compris(req.params.id);
  if (!vue) return res.status(404).json({ error: 'Règle inconnue.' });
  res.json(vue);
});
app.post('/api/vigie/regles/:id/proposition', (req, res) => {
  if (!fiche(req.params.id)) return res.status(404).json({ error: 'Règle inconnue.' });
  const pb = propositionInvalide(req.body);
  if (pb) return res.status(400).json({ error: pb });
  res.json(vigie.proposer(req.params.id, req.body));
});
app.post('/api/vigie/fenetre/fermer', (req, res) => {
  vigie.fermerFenetre();
  res.json({ ok: true });
});

// --- Modules : chacun reçoit son propre routeur et les services communs ---
const ctx = {
  prisma,
  journal,
  game,
  broadcast,
  getSettings: () => getSettings(prisma),
  selfUrl: `http://127.0.0.1:${PORT}`, // pour lire l'API HTTP d'un autre module (jamais son code)
  // Fenêtres par-dessus le jeu (ouvrir, fermer ; shown : déjà affichée, même par le serveur d'avant une relance), mode
  // de jeu choisi (et ses changements)
  overlay: { setExtra: setOverlayExtra, shown: overlayShown, mode: overlayMode, onMode: onOverlayMode },
  // Vigie des règles : un module y signale une mesure EN DIRECT (jamais à la relecture du journal)
  vigie: { observe: (o) => vigie.observe(o) },
};
// mounts : routeur → chemin de montage (liste des routes pour le banc de contrôle, core/routeList.js). Un module qui
// échoue à démarrer est désactivé et signalé (modulesEnPanne), les autres démarrent (core/moduleLoader.js)
const { mounts, enPanne: modulesEnPanne } = await registerModules({ app, modules, ctx });

// État de santé au démarrage, montré en bandeau par l'interface (client/src/core/SanteNotice.jsx) : journaux du jeu
// introuvables, module en panne, données de référence abîmées ou pas aux versions figées de cette version de l'app
app.get('/api/sante', (req, res) => {
  const r = getReference();
  const integrity = r.ref?.integrity;
  res.json({
    journal: { dir: journal.dir ?? null, error: journal.error ?? null },
    modules: modulesEnPanne,
    reference: r.error ? { error: r.error } : integrity && !integrity.pinned ? { pinned: false, problems: integrity.problems } : null,
  });
});

// Démarrage, jeu déjà lancé : rôle du vaisseau actuel si aucun mode n'est actif (core/roleSwitch.js). Après la relecture
// de l'historique par TOUS les modules (écouteur posé après les leurs) : la bascule trouve leurs sessions à jour, et
// les garde (aucune remise à zéro au démarrage).
journal.on('ready', () => safely("démarrage", () => switcher.startup()));

// Erreurs : réponse lisible en français
app.use((err, req, res, next) => {
  // Refus attendu (corps trop gros ou illisible, adresse mal encodée, refus d'un module) ou service extérieur
  // indisponible (core/net.js) : une ligne, pas la pile. Erreur imprévue : la pile, et « Erreur interne du serveur. »
  const { status, message, level } = errorReply(err);
  if (level === 'warn') console.warn(`${req.method} ${req.path} : ${message}`);
  else console.error(err);
  res.status(status).json({ error: message });
});

try {
  await nicknames.load();
} catch (err) {
  console.warn(`Noms des vaisseaux non lus (${err.message}) : l'avis de bascule montrera le nom en jeu.`);
}
const settings = await getSettings(prisma);
const journalFolder = journalDir(settings.journalPath); // réglage du joueur, ou ELITE_JOURNAL_DIR
// Démarrage : historique relu avant d'ouvrir le port (« prêt » veut toujours dire « modules à jour »), sans bloquer
// le serveur pendant la lecture (core/journalService.js)
await journal.start(journalFolder);
// Les modules ont relu l'historique et repris leurs fenêtres : celles que le serveur d'avant avait ouvertes et qu'aucun
// module n'a reprises se ferment (core/overlay.js ; jamais un lancement de l'overlay s'il ne tournait pas)
setTimeout(settleOverlay, OVERLAY_SETTLE_MS).unref();

// Express 5 appelle ce rappel AUSSI quand l'écoute échoue, avec l'erreur : avant, un port déjà pris écrivait « Serveur
// prêt » et disait « pret » à l'app de bureau, puis s'arrêtait sur une « Erreur imprévue » en anglais.
const server = app.listen(PORT, '127.0.0.1', (err) => {
  if (err) return ecouteImpossible(err);
  console.log(`Serveur prêt sur http://localhost:${PORT}`);
  console.log(`Journaux : ${journalFolder}`);
  if (journal.error) console.warn(journal.error);
  process.send?.({ type: 'pret', port: PORT });
  // App de bureau : l'overlay tourne toujours (ses raccourcis, Alt+Maj+K pour la souris, ne vont jamais au jeu)
  if (garderOverlayActif()) console.log('Overlay toujours actif (app de bureau)');
  return undefined;
});

/**
 * Port déjà pris (autre copie de l'app, autre programme) : qui le tient et quoi faire, en français (core/portPris.js),
 * dit aussi à l'app de bureau ({ type: 'erreur' }, affiché tel quel), puis arrêt. Autre erreur d'écoute : arrêt aussi.
 */
function ecouteImpossible(err) {
  const message = err?.code === 'EADDRINUSE' ? messagePortPris(PORT, quiTientLePort(PORT)) : `Enova ne peut pas démarrer : écoute impossible sur le port ${PORT} (${err?.code || err?.message}).`;
  console.error(message);
  process.send?.({ type: 'erreur', message });
  process.exitCode = 1;
  setTimeout(() => process.exit(1), 200); // le message à l'app de bureau part avant l'arrêt
}

// Lancé avec un canal IPC (banc de contrôle, scripts/controle/banc/serveur.mjs ; jamais par npm run dev) : arrêt propre
// sur demande, base refermée avant que le banc efface son dossier, et arrêt aussi si le lanceur disparaît. Le banc y
// demande aussi la liste des routes (attaques rejouées sur toutes) : jamais en HTTP.
if (process.send) {
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    journal.stop();
    synthese.stop();
    server.close();
    server.closeAllConnections?.(); // flux temps réel (SSE) ouverts
    await prisma.$disconnect().catch(() => {});
    process.exit(0);
  };
  process.on('message', (msg) => {
    if (msg?.type === 'arret') {
      if (msg.quitter === true) quitterOverlay(); // l'app de bureau s'en va : les fenêtres en jeu aussi
      stop();
    }
    else if (msg?.type === 'routes') process.send({ type: 'routes', id: msg.id, routes: listRoutes(app, mounts) });
    // App de bureau : son ◆ cache (ou réaffiche) aussi les fenêtres en jeu
    else if (msg?.type === 'overlay-masque') {
      bureauCache = msg.masque === true;
      masquerOverlay(bureauCache);
    }
  });
  process.on('disconnect', stop);
}
