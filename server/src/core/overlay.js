// Ouverture des fenêtres de l'overlay (dossier overlay/, Electron) depuis l'application.
//
// L'overlay ne tourne qu'en un exemplaire : chaque ordre lui transmet la liste exacte des pages
// à afficher (--only=combat,glance), il ouvre celles qui manquent et ferme les autres. Une fois lancé, il reçoit ses
// ordres par un canal permanent (overlayStream, plus bas) : un processus n'est lancé que s'il n'y est pas branché.
//
// Fenêtres ouvertes d'elles-mêmes par un module (« extras » : itinéraire, saut du porteur, alerte de rachat, vente à
// quai…), en plus de celles du mode :
//   - elles sont enregistrées avec le choix (overlay.json, `extras`). L'overlay garde ses fenêtres quand le serveur
//     redémarre (plantage relancé par dev.js, code modifié) : le nouveau serveur sait donc qu'elles sont peut-être encore
//     affichées (« héritées »). Le module qui en ferme une la ferme vraiment ; celui qui la garde la reprend
//     (overlayShown) ; celles qu'aucun module n'a reprises sont fermées une fois les modules prêts (settleOverlay).
//     Avant, le serveur relancé ne savait plus les fermer : elles restaient par-dessus le jeu ;
//   - « Aucun » (dismissExtras) les ferme aussi. Chacune reste fermée jusqu'à ce que son module la ferme lui-même
//     (arrivée, fin de l'alerte, départ du quai…) ; à sa prochaine occasion, elle s'ouvre de nouveau d'elle-même ;
//   - un ordre qui ne fait que fermer ou remettre en ordre part avec --if-running : il ne lance jamais l'overlay s'il
//     ne tournait pas (overlay/main.js s'arrête aussitôt). Avant, la fermeture d'une fenêtre de module relançait
//     l'overlay avec les fenêtres du mode.
//
// PUT /api/overlay est vérifié (overlayRequest) avant tout : une demande mal formée est refusée (400, avec la raison),
// même quand l'overlay est coupé ou absent.
//
// Ce que le serveur croit ouvert est gardé dans overlay.json (dossier des données), avec l'heure du dernier changement
// voulu (changedAt : menu, page, bascule, Annuler, overlay quitté). Des fenêtres redemandées telles quelles (reshow,
// core/roleSwitch.js) n'en sont pas un : une fermeture faite pendant que le serveur était arrêté, et transmise plus
// tard par l'overlay (overlay/closed.js), s'applique si rien n'a été voulu depuis.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPlainObject, readJsonFile, writeJsonAtomicSync } from './atomic.js';
import { dataPath } from './paths.js';
import { isMode } from './modes.js';
import { MAX_SHIP_ID } from './shipRoles.js';
import { isCommanderId } from './commander.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../overlay'); // code de l'overlay
const START = path.join(ROOT, 'start.js');
// Nom de page : minuscules, chiffres et tirets, jamais une propriété d'Object (« constructor »)
const validPage = (p) => typeof p === 'string' && /^[a-z0-9-]{1,30}$/.test(p) && !(p in Object.prototype);
// Dernier choix enregistré : le menu le retrouve après un redémarrage du serveur
const SAVED = dataPath('overlay.json');
// Garde-fou, pas une limite d'usage : le Minage Rhino ouvre déjà 6 pages (HUD, liste, guidage, capture, balayage et
// son tiroir Top 10), plus le Coup d'œil. À 6, le Coup d'œil sautait.
export const MAX_PAGES = 16;

/**
 * Origines d'un changement de mode ou de fenêtres, gardées avec lui (core/roleSwitch.js) : menu ou page, bascule d'un
 * rôle, Annuler, overlay quitté par le joueur (Alt+Maj+Q).
 */
const CHOICE_KINDS = new Set(['menu', 'bascule', 'annuler', 'fermeture']);

/**
 * ELITE_NO_OVERLAY (banc de contrôle) : toute valeur sauf vide, 0 ou false. L'overlay est alors vu comme absent et
 * n'est jamais lancé, même par un module (saut du porteur…).
 */
export function overlayDisabled(env = process.env) {
  const v = String(env.ELITE_NO_OVERLAY ?? '').trim().toLowerCase();
  return v !== '' && v !== '0' && v !== 'false';
}

const pageList = (v) => [...new Set((Array.isArray(v) ? v : []).filter((p) => validPage(p)))].slice(0, MAX_PAGES);

/** Choix enregistré, ou null (absent ; illisible : mis de côté, core/atomic.js). */
function readSaved() {
  return readJsonFile(SAVED, { fallback: null, accept: isPlainObject, label: 'Overlay' });
}

const isoDate = (v) => (typeof v === 'string' && v.length <= 40 && Number.isFinite(Date.parse(v)) ? v : null);
const isoMs = (v) => (isoDate(v) ? Date.parse(v) : null);

/**
 * Dernier changement de mode : dans quel vaisseau (ShipID, et commandant), à quelle heure (at), et comment. Sert à ne jamais écraser
 * un mode, ni « Aucun », choisi dans le vaisseau où tu es (core/roleSwitch.js) : il tient jusqu'au prochain vrai
 * changement de vaisseau, relances du jeu comprises. Illisible : null. (Un ancien champ `session` est ignoré.)
 */
export function cleanChoice(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c) || !CHOICE_KINDS.has(c.kind)) return null;
  const shipId = Number.isSafeInteger(c.shipId) && c.shipId >= 0 && c.shipId <= MAX_SHIP_ID ? c.shipId : null;
  // Commandant du vaisseau (core/commander.js) : le même numéro chez un autre commandant n'est pas le même vaisseau
  const commander = isCommanderId(c.commander) ? c.commander : null;
  return { shipId, ...(commander ? { commander } : {}), kind: c.kind, at: isoDate(c.at) };
}

const saved = readSaved() ?? {};
// Un mode retiré de l'app depuis (core/modes.js) n'est plus actif
let current = { mode: isMode(saved.mode) ? saved.mode : null, glance: saved.glance === true, pages: pageList(saved.pages) };
// Dernier mode de jeu choisi, gardé quand on masque tout : réafficher le même mode n'est pas un changement d'activité
let activity = [saved.activity, saved.mode].find((m) => isMode(m)) ?? null;
let choice = cleanChoice(saved.choice);
// Heure (ms) du dernier changement voulu du mode ou des fenêtres, ou null (ancien fichier)
let changedAt = isoMs(saved.changedAt);
const extras = new Set(); // fenêtres que les modules veulent ouvertes (saut du porteur…), en plus du mode
// Fenêtres de modules fermées par « Aucun » : cachées jusqu'à ce que leur module les ferme lui-même
const dismissed = new Set(pageList(saved.dismissed));
// Fenêtres de modules affichées par le serveur d'avant, pas encore reprises ni fermées par leur module (settleOverlay)
const inherited = new Set(pageList(saved.extras).filter((p) => !dismissed.has(p)));
const modeListeners = new Set();

/** Raison du refus (400) d'une demande, en français. */
function invalid(message) {
  return Object.assign(new Error(message), { status: 400, publicMessage: message });
}
const shown = (v) => (typeof v === 'string' ? v : JSON.stringify(v) ?? String(v)).slice(0, 40);
const given = (o, k) => Object.hasOwn(o, k) && o[k] !== undefined && o[k] !== null;

/**
 * Demande de PUT /api/overlay vérifiée : { mode, glance, pages, dismissExtras }, ou erreur 400 avec la raison.
 *   - mode : null, ou un identifiant de page (minuscules, chiffres, tirets, 30 caractères au plus) ;
 *   - pages : liste d'au plus MAX_PAGES identifiants ;
 *   - glance, dismissExtras (« Aucun » : fermer aussi les fenêtres des modules) : vrai ou faux.
 * Absents (ou null) : null, [] et faux. Les autres champs sont ignorés.
 */
export function overlayRequest(body) {
  if (!isPlainObject(body)) throw invalid('Demande invalide : un objet { mode, glance, pages } est attendu.');
  const mode = given(body, 'mode') ? body.mode : null;
  if (mode !== null && !validPage(mode)) throw invalid(`Mode de jeu invalide (« ${shown(mode)} ») : un identifiant (minuscules, chiffres, tirets, 30 caractères au plus) ou null est attendu.`);
  const pages = given(body, 'pages') ? body.pages : [];
  if (!Array.isArray(pages)) throw invalid('Pages invalides : une liste d’identifiants est attendue.');
  if (pages.length > MAX_PAGES) throw invalid(`Trop de pages demandées (${pages.length}) : ${MAX_PAGES} au plus.`);
  const bad = pages.find((p) => !validPage(p));
  if (bad !== undefined) throw invalid(`Page invalide : « ${shown(bad)} ».`);
  for (const k of ['glance', 'dismissExtras']) {
    if (given(body, k) && typeof body[k] !== 'boolean') throw invalid(`Valeur invalide pour « ${k} » : vrai ou faux est attendu.`);
  }
  return { mode, glance: body.glance === true, pages: [...new Set(pages)], dismissExtras: body.dismissExtras === true };
}

/** Mode de jeu choisi dans le menu (combat, rescue…), ou null. */
export function overlayMode() {
  return current.mode;
}

/**
 * Appelle listener(mode) quand on passe à un autre mode de jeu. Pas quand seul le Coup d'œil change, ni quand on
 * masque puis réaffiche le même mode, ni quand une bascule est annulée (restoreOverlay).
 */
export function onOverlayMode(listener) {
  modeListeners.add(listener);
}

export function overlayState() {
  // npm installe Electron à la racine du projet (espaces de travail), ou dans overlay/
  const disabled = overlayDisabled();
  const installed = !disabled && ['node_modules', '../node_modules'].some((dir) => fs.existsSync(path.join(ROOT, dir, 'electron')));
  // disabled : coupé exprès (ELITE_NO_OVERLAY), pour que l'interface ne conseille pas de réinstaller ; la clé n'existe
  // qu'overlay coupé, comme disposition n'existe que pendant la disposition
  return { ...current, installed, ...(disabled ? { disabled: true } : {}), ...(disposition ? { disposition: true } : {}) };
}

/** Fenêtres de modules affichées (ni fermées par « Aucun »), puis celles héritées du serveur d'avant. */
const moduleWindows = () => [...[...extras].filter((p) => !dismissed.has(p)), ...inherited];

/**
 * La fenêtre de ce module est-elle (peut-être) affichée ? Vrai aussi pour une fenêtre héritée du serveur d'avant : le
 * module qui la reprend au démarrage (itinéraire encore en cours…) la garde, sans qu'elle se ferme puis se rouvre.
 */
export function overlayShown(page) {
  return validPage(page) && ((extras.has(page) && !dismissed.has(page)) || inherited.has(page));
}

/**
 * Mode, fenêtres et activité en ce moment, pour les remettre ensuite (Annuler une bascule) ; since : depuis quand
 * (heure du dernier changement voulu, ms, ou null).
 */
export function overlaySnapshot() {
  return { mode: current.mode, glance: current.glance, pages: [...current.pages], activity, since: changedAt };
}

/** Heure (ms) du dernier changement voulu (menu, page, bascule, Annuler, overlay quitté), ou null. */
export function overlayChangedAt() {
  return changedAt;
}

/** Fenêtres que l'overlay doit avoir ouvertes : celles du mode (et le Coup d'œil), puis celles des modules. */
export function overlayLaunchPages() {
  return [...new Set([...(disposition || []), ...current.pages, ...moduleWindows()])];
}

// « Disposer les fenêtres » (Paramètres) : toutes les fenêtres en jeu ouvertes d'un coup, en mode déplacement, pour les
// placer, même celles qui ne s'ouvrent que quelques secondes (FSD prêt…). Les pages viennent de l'interface (elle seule
// connaît les fenêtres des modules). Rien d'enregistré dans overlay.json : le mode et ses fenêtres ne changent pas.
// « --disposer=1 » joint à chaque ordre pendant ce temps, « --disposer=0 » une fois à la fin (l'overlay enregistre alors
// les places et ferme les fenêtres en trop).
export const MAX_PAGES_DISPOSITION = 40;
let disposition = null;
let finDisposition = false;

/** Ouvre (on, avec la liste des pages) ou referme la disposition des fenêtres ; erreur 400 si la demande est mal formée. */
export function disposerOverlay(on, pages = []) {
  if (typeof on !== 'boolean') throw invalid('Choix attendu : « on » à true (disposer) ou false (terminé).');
  if (on) {
    if (!Array.isArray(pages) || !pages.length) throw invalid('Pages attendues : la liste des fenêtres à disposer.');
    if (pages.length > MAX_PAGES_DISPOSITION) throw invalid(`Trop de pages (${pages.length}) : ${MAX_PAGES_DISPOSITION} au plus.`);
    const bad = pages.find((p) => !validPage(p));
    if (bad !== undefined) throw invalid(`Page invalide : « ${shown(bad)} ».`);
    disposition = [...new Set(pages)];
    finDisposition = false;
    launch();
  } else if (disposition) {
    disposition = null;
    finDisposition = true;
    launch({ ifRunning: true });
  }
  return overlayState();
}

/** Dernier changement de mode noté (voir cleanChoice), ou null. */
export function overlayChoice() {
  return choice ? { ...choice } : null;
}

/**
 * Choix du menu (ou d'une page), bascule d'un rôle, Annuler : mode, Coup d'œil, pages. Demande vérifiée
 * (overlayRequest : erreur 400 si elle est mal formée, rien n'est changé). Avec dismissExtras (« Aucun »), les fenêtres
 * des modules se ferment aussi.
 * @param {{ mode: string|null, glance?: boolean, pages?: string[], dismissExtras?: boolean }} next pages = identifiants des pages /hud/...
 * @param {{ choice?: object, silent?: boolean, activity?: string|null, reshow?: boolean }} [o] choice : origine du
 *   changement, gardée avec lui ; silent : remise d'un état d'avant (Annuler) : aucune remise à zéro de session, et
 *   l'activité redevient `activity` ; reshow : fenêtres redemandées telles que le serveur les croit ouvertes (overlay
 *   peut-être arrêté sans le dire) : pas un changement voulu, changedAt ne bouge pas
 */
export function showOverlay(next, { choice: origin, silent = false, activity: previousActivity, reshow = false } = {}) {
  const request = overlayRequest(next);
  current = { mode: request.mode, glance: request.glance, pages: request.pages };
  if (request.dismissExtras) {
    // Héritées comprises : un module qui la reprendrait juste après la garderait fermée
    for (const p of [...extras, ...inherited]) dismissed.add(p);
    inherited.clear();
  }
  if (origin !== undefined) choice = cleanChoice(origin);
  if (!reshow) changedAt = Date.now();
  let changed = false;
  if (silent) {
    if (previousActivity !== undefined) activity = typeof previousActivity === 'string' ? previousActivity : null;
  } else {
    changed = current.mode !== null && current.mode !== activity;
    if (current.mode !== null) activity = current.mode;
  }
  launch();
  if (changed) for (const listener of modeListeners) listener(current.mode);
  return overlayState();
}

/** Remet un état pris par overlaySnapshot, sans prévenir les sessions (pas de remise à zéro). */
export function restoreOverlay(snapshot, { choice: origin } = {}) {
  return showOverlay(snapshot, { choice: origin, silent: true, activity: snapshot.activity ?? null });
}

/**
 * L'overlay a été quitté par le joueur (Alt+Maj+Q : overlay/main.js le dit, POST /api/overlay/closed). Sans cet avis, le
 * serveur croyait ses fenêtres encore ouvertes. Plus aucune fenêtre de mode ni Coup d'œil ; le mode reste noté (le menu
 * le montre), l'activité aussi : le rouvrir n'est pas un changement de mode. Rien n'est lancé. Les fenêtres ouvertes
 * d'elles-mêmes par un module (setOverlayExtra) restent à lui : il les rouvre ou les ferme comme avant.
 * @param {{ choice?: object, at?: number }} [o] choice : origine, gardée comme celle d'un changement de mode ; at :
 *   heure de la fermeture (ms) quand elle date d'avant (transmise après coup par l'overlay), sinon maintenant
 */
export function overlayClosed({ choice: origin, at } = {}) {
  current = { mode: current.mode, glance: false, pages: [] };
  if (origin !== undefined) choice = cleanChoice(origin);
  changedAt = Number.isFinite(at) ? at : Date.now();
  if (!overlayDisabled()) save(); // overlay coupé : rien d'écrit, comme launch()
  return overlayState();
}

/**
 * Ouvre ou ferme une fenêtre en plus de celles du mode, à l'initiative d'un module.
 * Sans effet si l'overlay n'est pas installé. Fermer ne lance jamais l'overlay s'il ne tournait pas.
 */
export function setOverlayExtra(page, on) {
  if (!validPage(page)) return;
  if (on) {
    if (extras.has(page)) return;
    extras.add(page);
    const reprise = inherited.delete(page); // déjà affichée par le serveur d'avant : la liste ne change pas
    if (!overlayState().installed) return;
    if (reprise || dismissed.has(page)) save();
    else launch();
    return;
  }
  const herited = inherited.delete(page);
  const had = extras.delete(page);
  const hidden = dismissed.delete(page);
  if (!herited && !had && !hidden) return;
  if (!overlayState().installed) return;
  if (herited || (had && !hidden)) launch({ ifRunning: true });
  else save(); // fermée par « Aucun » : rien à fermer, la prochaine fois elle s'ouvrira de nouveau
}

/**
 * Une fois les modules prêts (quelques secondes après le démarrage) : les fenêtres héritées du serveur d'avant
 * qu'aucun module n'a reprises sont fermées (ordre --if-running : rien n'est lancé si l'overlay ne tourne pas), et
 * « Aucun » est oublié pour celles que leur module ne demande plus.
 */
export function settleOverlay() {
  let changed = false;
  for (const p of dismissed) {
    if (!extras.has(p)) {
      dismissed.delete(p);
      changed = true;
    }
  }
  if (!overlayState().installed) return;
  if (inherited.size) {
    inherited.clear();
    launch({ ifRunning: true });
  } else if (changed) save();
}

/** Tests : état des fenêtres des modules. */
export function overlayExtrasForTest() {
  return { extras: [...extras], dismissed: [...dismissed], inherited: [...inherited] };
}

// Ordres regroupés : plusieurs changements dans le même instant (modules qui réagissent au même événement du journal,
// double clic) partent en UN lancement, avec le dernier état complet. Deux lancements à quelques millisecondes se
// croisaient dans l'overlay (une fenêtre fermée puis rouverte restait orpheline) et pouvaient arriver dans le désordre.
// Chaque lancement porte aussi son heure (--at=<ms>, toujours croissante) : si deux lancements plus espacés se croisent
// quand même (Electron qui démarre plus lentement), l'overlay n'applique pas le plus ancien arrivé en dernier.
export const LAUNCH_DELAY_MS = 120;
let launchTimer = null;
let lastAt = 0;
let mayStart = false; // un des ordres regroupés peut lancer l'overlay (sinon : --if-running)
let spawnImpl = spawn;
/** Tests : lancement simulé (rien n'est lancé). Sans argument : le vrai. */
export function setOverlaySpawnForTest(fn) {
  spawnImpl = fn ?? spawn;
}

/** Choix et fenêtres des modules enregistrés d'un coup (core/atomic.js). */
function save() {
  if (overlayDisabled()) return;
  try {
    writeJsonAtomicSync(SAVED, {
      ...current, activity, choice, changedAt: Number.isFinite(changedAt) ? new Date(changedAt).toISOString() : null,
      extras: moduleWindows(), dismissed: [...dismissed],
    });
  } catch (err) {
    console.error(`Overlay : choix non enregistré (${err.message})`);
  }
}

// « Tout cacher » de l'app de bureau (son ◆) : les fenêtres en jeu se cachent aussi, et celles qui s'ouvrent pendant ce
// temps naissent cachées. « --masque=1 » joint à chaque ordre tant que c'est caché, « --masque=0 » une fois au retour ;
// les ordres habituels restent tels quels. Pas gardé d'un lancement du serveur à l'autre.
let masque = false;
let demasquer = false; // le prochain ordre réaffiche les fenêtres

/**
 * Overlay toujours actif (app de bureau, ELITE_OVERLAY_TOUJOURS=1) : lancé dès le démarrage et gardé même sans
 * fenêtre (--rester), pour que ses raccourcis (Alt+Maj+K : la souris) marchent toujours et n'aillent jamais au jeu.
 * Avec npm run dev : comme avant, lancé seulement quand il a une fenêtre à montrer.
 */
export const overlayToujours = (env = process.env) => String(env.ELITE_OVERLAY_TOUJOURS || '') === '1';

/** Démarrage du serveur : l'overlay toujours actif est lancé, même sans fenêtre. */
export function garderOverlayActif(env = process.env) {
  if (!overlayToujours(env) || overlayDisabled(env)) return false;
  launch();
  return true;
}

/** Cache (true) ou réaffiche (false) toutes les fenêtres de l'overlay, sans en ouvrir ni en fermer. */
export function masquerOverlay(on) {
  const v = Boolean(on);
  if (v === masque) return;
  masque = v;
  demasquer = !v;
  launch({ ifRunning: true }); // jamais un lancement de l'overlay pour le cacher
}
export const overlayMasque = () => masque;

function launch({ ifRunning = false } = {}) {
  if (overlayDisabled()) return; // ceinture et bretelles : overlayState() le dit déjà absent
  save();
  if (!ifRunning) mayStart = true;
  clearTimeout(launchTimer);
  launchTimer = setTimeout(sendToOverlay, LAUNCH_DELAY_MS);
}

function sendToOverlay() {
  launchTimer = null;
  const start = mayStart;
  mayStart = false;
  if (overlayDisabled()) return;
  const pages = overlayLaunchPages();
  lastAt = Math.max(Date.now(), lastAt + 1);
  // Dans une minuterie : une erreur de lancement est écrite, jamais levée (elle arrêterait le serveur)
  try {
    // Liste vide : l'overlay déjà lancé ferme toutes ses fenêtres et s'arrête. Elle part en « , » : sous Windows,
    // l'overlay déjà lancé reçoit « --only= » sans le « = », et rouvrait Combat par défaut au lieu de tout fermer.
    const toujours = overlayToujours();
    const args = [`--only=${pages.join(',') || ','}`, `--at=${lastAt}`];
    if (toujours) args.push('--rester');
    if (disposition) args.push('--disposer=1');
    else if (finDisposition) {
      args.push('--disposer=0');
      finDisposition = false;
    }
    if (masque) args.push('--masque=1');
    else if (demasquer) {
      args.push('--masque=0');
      demasquer = false;
    }
    // Fermer ou remettre en ordre : rien à faire si l'overlay ne tourne pas (sauf toujours actif : il doit tourner)
    if (!start && !toujours) args.push('--if-running');
    // Overlay branché sur le canal : l'ordre passe par lui, sans lancer aucun processus. Liste vide (sans --rester) :
    // il peut s'arrêter, le canal est donc fermé tout de suite (jamais un ordre écrit dans un overlay qui quitte) et
    // l'ordre suivant le relancera. L'overlay qui reste (fenêtres rangées gardées, ordre périmé écarté, resterActif
    // hérité d'un serveur d'avant) voit la fermeture et se rebranche au bout de 2 s (overlay/canal.js).
    if (parCanal(args)) {
      if (!pages.length && !toujours) fermerCanal();
      return;
    }
    launcher(args);
  } catch (err) {
    console.error(`Overlay : lancement impossible (${err.message})`);
  }
}

// --- Canal permanent vers l'overlay (GET /api/overlay/stream, overlay/canal.js) ---
// Avant, CHAQUE ordre lançait node overlay/start.js, qui lançait electron.exe, qui transmettait ses arguments à
// l'overlay déjà lancé puis s'arrêtait : 190 à 220 ms et deux processus par ordre, en plein jeu (Signaux et le
// refroidissement FSD changent à chaque saut). L'overlay lancé se branche sur ce flux et y reçoit les mêmes arguments.
// Un processus n'est lancé que si aucun overlay n'est branché : premier démarrage, ou serveur relancé avant que
// l'overlay se rebranche (l'ordre lui arrive alors comme avant, par un lancement transmis).
export const MAX_CANAL = 4; // un seul overlay tourne ; marge pour une reconnexion qui croise l'ancienne
export const CANAL_PING_MS = 20_000;
const canal = new Set(); // réponses ouvertes (flux SSE)
let canalPing = null;

/** GET /api/overlay/stream : l'overlay s'y branche ; une ligne « data: { args } » par ordre. */
export function overlayStream(req, res) {
  if (canal.size >= MAX_CANAL) {
    res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': '5' });
    res.end(JSON.stringify({ error: 'Canal de l’overlay déjà occupé.' }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.write(': canal des ordres de l’overlay\n\n');
  canal.add(res);
  const oublier = () => canal.delete(res);
  req.on('close', oublier);
  res.on('close', oublier);
  if (!canalPing) {
    // Un overlay disparu sans fermer sa connexion est oublié à l'écriture suivante
    canalPing = setInterval(() => {
      for (const r of canal) ecrireCanal(r, ': ping\n\n');
    }, CANAL_PING_MS);
    canalPing.unref?.();
  }
}

/** Overlays branchés sur le canal (tests, état). */
export const overlayCanalCount = () => canal.size;

function ecrireCanal(res, texte) {
  if (res.destroyed || res.writableEnded) {
    canal.delete(res);
    return false;
  }
  try {
    res.write(texte);
    return true;
  } catch {
    canal.delete(res);
    return false;
  }
}

/**
 * Ferme toutes les connexions du canal (fin de réponse, pas seulement oubliées) : un overlay resté lancé le voit et se
 * rebranche, au lieu de rester branché sur un flux où plus rien n'est écrit (chaque ordre relancerait alors un processus).
 */
function fermerCanal() {
  for (const res of [...canal]) {
    canal.delete(res);
    try {
      res.end();
    } catch {
      // connexion déjà coupée
    }
  }
}

/**
 * L'app de bureau quitte pour de bon : l'overlay branché reçoit l'ordre de s'arrêter tout de suite (« --quitter »),
 * au lieu d'attendre 5 min le retour du serveur, sans fenêtre visible. Rend vrai si un overlay l'a reçu. Un overlay
 * pas encore branché (lancé à l'instant) s'arrêtera de lui-même, comme avant.
 */
export function quitterOverlay() {
  const remis = parCanal(['--quitter']);
  fermerCanal();
  return remis;
}

/** Raccourcis changés (Paramètres) : l'overlay branché relit le réglage. Rend vrai si un overlay l'a reçu. */
export function signalerRaccourcis() {
  return parCanal(['--raccourcis']);
}

/** Ordre remis par le canal : vrai si au moins un overlay branché l'a reçu. */
function parCanal(args) {
  let remis = false;
  const texte = `data: ${JSON.stringify({ args })}\n\n`;
  for (const res of [...canal]) if (ecrireCanal(res, texte)) remis = true;
  return remis;
}

/** Lance l'overlay (Electron) avec ces arguments ; détaché, il survit au serveur. */
function spawnOverlay(args) {
  const child = spawnImpl(process.execPath, [START, ...args], {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.on('error', (err) => console.error(`Overlay : ${err.message}`));
  child.unref();
}

let launcher = spawnOverlay;

/**
 * Tests seulement : remplace le lancement d'Electron par `fn(args)` (aucun overlay réel ne s'ouvre), pour vérifier ce
 * qui est écrit dans overlay.json et ce qui serait demandé à l'overlay. null : remet le vrai lancement.
 */
export function setOverlayLauncher(fn) {
  launcher = typeof fn === 'function' ? fn : spawnOverlay;
}

