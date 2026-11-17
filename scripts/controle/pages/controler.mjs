// Contrôle des pages et des fenêtres (étape 75-pages) : chaque page de l'interface et chaque fenêtre de l'overlay
// (/hud/<page>) ouverte dans Chrome sans fenêtre, sur l'interface compilée de la worktree (banc/client.mjs) reliée à un
// serveur isolé (banc/serveur.mjs), dans chaque passe de pages/attendus.mjs.
//
// Échec si une page lance une exception, écrit une erreur dans la console, reçoit une réponse ≥ 400 non prévue, appelle
// l'extérieur, écrit quelque chose à sa seule ouverture, ou n'affiche pas ses éléments clés (titre, onglet actif, texte
// d'état vide ou valeurs des séances). Les captures (PNG, avec le texte lu à côté) restent dans le dossier des journaux
// du contrôle, pour revue. Serveurs, interface et Chrome sont arrêtés et leurs dossiers effacés, même en cas d'échec.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CLIENT } from '../banc/chemins.mjs';
import { lancerChrome, scriptHorloge, trouverChrome } from '../banc/chrome.mjs';
import { preparerClient, servirClient } from '../banc/client.mjs';
import { demarrerServeur, lireSeance, listerSeances, nettoyerBanc, portLibre } from '../banc/serveur.mjs';
import { MODULES } from '../rejeu/points.mjs';
import { APP, CADRE, EN_DIRECT, FENETRES, HUD } from './attendus.mjs';
import { scriptPont } from './pont.mjs';
import { MODES } from '../../../server/src/core/modes.js';
import { PLAN, aSaPage } from '../../../client/src/core/navigation.js';
import { concordanceModes, manquesVue, normaliser, problemesDuReleve, sousPages, trous } from './verifier.mjs';

// Pages du cœur, hors modules : accueil, paramètres, page inconnue, et les pages des rubriques (client/src/core/navigation.js)
const FIXES = ['/', '/parametres', '/page-inconnue', ...PLAN.filter(aSaPage).map((r) => r.chemin)];
const ONGLETS_EN_MEME_TEMPS = 4; // chacun dans son contexte (ses propres connexions) : les pages ne se gênent pas
const VUE_MS = 20_000;
const FENETRE_REQUETE_MS = 5000;
const STABLE_MS = 400;
const STABLE_MAX_MS = 60_000;
const APP_TAILLE = { largeur: 1400, hauteur: 1000 };
const HUD_TAILLE = { largeur: 760, hauteur: 520 };
const FOND_JEU = { r: 14, g: 17, b: 22, a: 1 }; // fenêtres transparentes : capturées sur un fond sombre, comme en jeu

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const liste = (v) => (Array.isArray(v) ? v : []);

/** Toutes les séances de référence, dans l'ordre de leurs journaux, et l'heure figée de la plus récente. */
export function toutesLesSeances() {
  const seances = listerSeances().map(lireSeance);
  const journaux = seances.flatMap((s) => s.fichiers).sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
  const maintenant = seances.map((s) => s.maintenant).sort().at(-1);
  return { journaux, maintenant, ids: seances.map((s) => s.id) };
}

/** Attendu d'une passe : liste de textes, objet, ou false (pas ouverte). */
function partie(v) {
  if (v === false) return false;
  if (Array.isArray(v)) return { textes: v };
  return v || {};
}

/** Vue attendue d'une entrée (ou d'un de ses onglets) dans une passe, cadre de l'application compris ou non. */
export function vueAttendue(entree, passe, { cadre = null, plus = [] } = {}) {
  const p = partie(entree[passe]);
  if (p === false) return null;
  const c = cadre ? partie(cadre[passe]) || {} : {};
  return {
    titre: entree.titre || null,
    onglet: entree.onglet || null,
    textes: [...(cadre ? liste(cadre.textes) : []), ...liste(c.textes), ...liste(entree.textes), ...liste(p.textes), ...plus],
    absents: [...liste(c.absents), ...liste(entree.absents), ...liste(p.absents)],
    infobulles: [...(cadre ? liste(cadre.infobulles) : []), ...liste(entree.infobulles)],
    styles: [...liste(entree.styles), ...liste(p.styles)],
    toleres: [...liste(entree.toleres), ...liste(p.toleres)],
    rien: Boolean(p.rien ?? entree.rien),
    url: p.url instanceof RegExp ? p.url : null,
    adresse: typeof p.url === 'string' ? p.url : null,
    depuis: p.depuis || null,
  };
}

/** Pages à ouvrir dans une passe : [{ cle, genre, adresse, vue, vues (onglets), depuis, ecrit, pont }]. */
export function tachesDeLaPasse(passe, modules) {
  const taches = [];
  // Accueil : une carte par module qui a une page (titre de son mode de jeu, sinon le sien), comme core/Home.jsx
  for (const [cle, entree] of Object.entries(APP)) {
    const vue = vueAttendue(entree, passe, { cadre: CADRE, plus: [] });
    if (!vue) continue;
    const vues = liste(entree.vues).map((o) => ({ cliquer: o.cliquer, vue: vueAttendue({ ...o, titre: entree.titre, onglet: entree.onglet }, passe, { cadre: CADRE }) })).filter((o) => o.vue);
    if (!vue.depuis && !vue.adresse && cle.includes(':')) throw new Error(`pages/attendus.mjs : ${cle} (${passe}) : route à paramètre sans url ni depuis.`);
    taches.push({
      cle,
      genre: 'page',
      adresse: vue.depuis ? vue.depuis.url : vue.adresse || cle,
      vue,
      vues,
      depuis: vue.depuis,
      ecrit: Boolean(vue.depuis?.ecrit),
    });
  }
  for (const [page, entree] of Object.entries(HUD)) {
    const vue = vueAttendue(entree, passe);
    if (!vue) continue;
    const vues = liste(entree.vues).map((o) => ({ cliquer: o.cliquer, vue: vueAttendue({ ...o, toleres: entree.toleres }, passe) })).filter((o) => o.vue);
    taches.push({ cle: `/hud/${page}`, genre: 'fenetre', adresse: `/hud/${page}`, vue, vues, pont: true });
    // La même fenêtre ouverte dans un navigateur ordinaire, sans l'overlay : elle ne doit pas casser
    taches.push({ cle: `/hud/${page} (navigateur)`, genre: 'fenetre', adresse: `/hud/${page}`, vue: { ...vue, textes: [], absents: [], rien: false, libre: true }, vues: [], pont: false });
  }
  return taches;
}

const nomFichier = (n, cle) => `${String(n).padStart(3, '0')}-${cle.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'accueil'}`;

/** Lectures GET du rejeu (rejeu/points.mjs), répétées jusqu'à deux passes identiques : le serveur a fini sa lecture. */
async function attendreStable(srv) {
  const chemins = Object.values(MODULES).flatMap((points) => points.filter((p) => p.point.startsWith('GET ') && !p.scenario && !p.statique).map((p) => `${p.base}${p.point.slice(4) === '/' ? '' : p.point.slice(4)}`));
  const photo = async () => JSON.stringify(await Promise.all(chemins.map((c) => srv.requete('GET', c).then((r) => [r.statut, r.corps]).catch((e) => e.message))));
  const limite = Date.now() + STABLE_MAX_MS;
  let avant = await photo();
  for (;;) {
    await attendre(STABLE_MS);
    const apres = await photo();
    if (apres === avant) return;
    if (Date.now() > limite) throw new Error(`le serveur isolé ne se stabilise pas en ${STABLE_MAX_MS / 1000} s après la lecture des journaux.`);
    avant = apres;
  }
}

/** Lignes d'erreur du serveur (pile, erreur interne) pendant la passe. */
function erreursServeur(lignes) {
  return lignes.filter((l) => /\bat .+:\d+:\d+\)?$|TypeError|ReferenceError|SyntaxError|Erreur interne|Unhandled|uncaught/i.test(l));
}

/**
 * Ouvre une page, attend chacune de ses vues, capture, et rend { cle, adresse, vues: [{ nom, manque, ms, capture }],
 * problemes }. `onglet` : banc/chrome.mjs.
 */
async function visiter(onglet, tache, { origine, dossier, numero }) {
  const debut = Date.now();
  const vuesFaites = [];
  const base = nomFichier(numero, tache.cle);
  const page = await onglet.ouvrir(`${origine}${tache.adresse}`);
  const ouverture = Date.now() - debut;
  let bilan = null;
  try {
    const verifier = (vue) => (lu) => manquesVue(lu, vue);
    const garder = async (nom, r) => {
      const fichier = path.join(dossier, `${base}${nom ? `-${nom.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}` : ''}`);
      const t = Date.now();
      // Une capture manquée n'est pas une faute de la page, mais une revue sans elle serait incomplète : signalée
      const manque = await page.capturer(`${fichier}.png`, { pleinePage: tache.genre === 'page' }).then(() => r.manque, (e) => [...r.manque, `capture impossible (${e.message})`]);
      fs.writeFileSync(`${fichier}.txt`, `${r.lu?.url || ''}\n${manque.length ? `MANQUE :\n- ${manque.join('\n- ')}\n` : ''}----\n${r.lu?.texte || ''}\n`);
      vuesFaites.push({ nom: nom || 'ouverture', manque, ms: r.ms, captureMs: Date.now() - t, capture: `${fichier}.png` });
    };
    if (tache.depuis) {
      // Parcours : la page de départ, puis chaque geste (clic sur un texte, ou { saisir: champ, texte } au clavier),
      // chacun attendant que son bouton ou son champ soit là et utilisable, puis la page d'arrivée
      const gestes = [tache.depuis.cliquer].flat();
      const nomGeste = (g) => (typeof g === 'string' ? `« ${g} »` : `champ « ${g.saisir} »`);
      let arrete = false;
      for (const [i, geste] of gestes.entries()) {
        const ou = i ? `après ${nomGeste(gestes[i - 1])}` : `sur ${tache.depuis.url}`;
        const essayer = () => (typeof geste === 'string' ? page.cliquer(geste) : page.saisir(geste.saisir, geste.texte));
        let etat = 'absent';
        const avant = await page.attendre(() => (etat === 'ok' ? [] : [`${nomGeste(geste)} ${etat} (${ou})`]), { delaiMs: VUE_MS, calmeMs: 300, avant: async () => { if (etat !== 'ok') etat = await essayer(); } });
        if (avant.manque.length) {
          await garder(`geste-${i + 1}`, avant);
          arrete = true;
          break;
        }
      }
      if (!arrete) await garder('', await page.attendre(verifier(tache.vue), { delaiMs: VUE_MS, styles: tache.vue.styles }));
    } else {
      await garder('', await page.attendre(verifier(tache.vue), { delaiMs: VUE_MS, styles: tache.vue.styles }));
    }
    for (const v of tache.vues) {
      const clic = await page.cliquer(v.cliquer);
      if (clic !== 'ok') {
        vuesFaites.push({ nom: v.cliquer, manque: [`clic sur « ${v.cliquer} » : ${clic}`], ms: 0 });
        continue;
      }
      await garder(v.cliquer, await page.attendre(verifier(v.vue), { delaiMs: VUE_MS, styles: v.vue.styles }));
    }
  } finally {
    const t = Date.now();
    bilan = await page.quitter();
    bilan.quitterMs = Date.now() - t;
  }
  const toleres = [...tache.vue.toleres, ...tache.vues.flatMap((v) => v.vue.toleres)];
  const problemes = problemesDuReleve(bilan, { origine, toleres, lecture: !tache.ecrit });
  return {
    cle: tache.cle, adresse: tache.adresse, genre: tache.genre, vues: vuesFaites, problemes, requetes: bilan.requetes.length,
    ms: Date.now() - debut, ouvertureMs: ouverture, quitterMs: bilan.quitterMs,
  };
}

/** Une passe : serveur isolé, interface, pages (lectures en parallèle, puis parcours qui écrivent, un par un). */
async function passe({ id, journaux, maintenant, preparer }, { client, chrome, pont, dossier, journal, filtre }) {
  fs.mkdirSync(dossier, { recursive: true });
  const portUi = await portLibre();
  const flux = fs.createWriteStream(journal);
  let srv = null;
  let ui = null;
  const contextes = [];
  try {
    srv = await demarrerServeur({ journaux, maintenant, portInterface: portUi, sortie: (l) => flux.write(`${l}\n`) });
    await attendreStable(srv);
    if (preparer) await preparer(srv);
    ui = await servirClient({ client, api: srv.url, port: portUi, sortie: (l) => flux.write(`[interface] ${l}\n`) });
    const horloge = scriptHorloge(srv.maintenant);
    const taches = tachesDeLaPasse(id, client.modules).filter((t) => !filtre || filtre.test(t.cle));
    const lectures = taches.filter((t) => !t.ecrit);
    const ecritures = taches.filter((t) => t.ecrit);
    const resultats = [];
    let numero = 0;
    const ouvrier = async () => {
      const ctxNav = await chrome.contexte();
      contextes.push(ctxNav);
      const onglets = {
        page: await ctxNav.onglet({ ...APP_TAILLE, scripts: [horloge] }),
        fenetre: await ctxNav.onglet({ ...HUD_TAILLE, scripts: [horloge, pont], fond: FOND_JEU }),
        navigateur: await ctxNav.onglet({ ...HUD_TAILLE, scripts: [horloge], fond: FOND_JEU }),
      };
      return async (tache) => {
        const o = tache.genre === 'page' ? onglets.page : tache.pont ? onglets.fenetre : onglets.navigateur;
        numero += 1;
        resultats.push(await visiter(o, tache, { origine: ui.url, dossier, numero }));
      };
    };
    // Lectures : plusieurs onglets à la fois, chacun dans son contexte
    const file = lectures.slice();
    const ouvriers = await Promise.all(Array.from({ length: Math.min(ONGLETS_EN_MEME_TEMPS, file.length) }, () => ouvrier()));
    await Promise.all(ouvriers.map(async (faire) => {
      while (file.length) await faire(file.shift());
    }));
    // Parcours qui écrivent : à la fin, un par un, dans l'ordre (rien ne lit pendant qu'ils écrivent)
    if (ecritures.length) {
      const faire = ouvriers[0] || (await ouvrier());
      for (const t of ecritures) await faire(t);
    }
    const erreurs = erreursServeur(srv.sortie());
    return { id, resultats, erreursServeur: erreurs, maintenant: srv.maintenant };
  } finally {
    for (const c of contextes) await c.fermer();
    if (ui) await ui.arreter();
    if (srv) await srv.arreter();
    await new Promise((r) => flux.end(r));
  }
}

/** Réponse d'une requête faite depuis la fenêtre elle-même : 'ok' ou la raison de l'échec (connexions saturées…). */
const SONDE_REQUETE = `(async () => {
  const t = performance.now();
  try {
    const r = await fetch('/api/state', { signal: AbortSignal.timeout(${FENETRE_REQUETE_MS}) });
    await r.text();
    return r.ok ? 'ok' : 'HTTP ' + r.status;
  } catch (e) {
    return (e.name === 'TimeoutError' ? 'pas de réponse' : e.message) + ' après ' + Math.round(performance.now() - t) + ' ms';
  }
})()`;

/**
 * Toutes les fenêtres de l'overlay ouvertes ensemble, dans UNE session (comme les fenêtres d'Electron, qui partagent
 * leurs connexions : 6 au plus par adresse), sur un serveur sans journal ; puis le jeu écrit une séance pendant qu'elles
 * sont ouvertes (mode direct). Chaque fenêtre doit montrer son état vide, puis suivre la séance sans être rechargée, et
 * pouvoir encore interroger le serveur à la fin.
 */
async function fenetresEnsemble({ seance }, { client, chrome, pont, dossier, journal }) {
  fs.mkdirSync(dossier, { recursive: true });
  const s = lireSeance(seance);
  const portUi = await portLibre();
  const flux = fs.createWriteStream(journal);
  let srv = null;
  let ui = null;
  let session = null;
  const ouvertes = [];
  const resultats = [];
  try {
    srv = await demarrerServeur({ journaux: [], maintenant: s.maintenant, portInterface: portUi, sortie: (l) => flux.write(`${l}\n`) });
    ui = await servirClient({ client, api: srv.url, port: portUi, sortie: (l) => flux.write(`[interface] ${l}\n`) });
    const horloge = scriptHorloge(srv.maintenant);
    const pages = client.modules.flatMap((m) => [...(m.hud ? [m.id] : []), ...m.pagesHud]);
    session = await chrome.contexte();
    const onglets = [];
    for (const p of pages) onglets.push(await session.onglet({ ...HUD_TAILLE, scripts: [horloge, pont], fond: FOND_JEU }));
    // Toutes ensemble, comme l'overlay qui ouvre les fenêtres d'un mode
    ouvertes.push(...(await Promise.all(onglets.map((o, i) => o.ouvrir(`${ui.url}/hud/${pages[i]}`)))));
    const etats = pages.map((p) => ({ page: p, vues: [] }));
    const relever = async (nom, attenduDe) => Promise.all(ouvertes.map(async (page, i) => {
      const vue = attenduDe(pages[i]);
      const r = await page.attendre((lu) => manquesVue(lu, vue), { delaiMs: VUE_MS });
      const fichier = path.join(dossier, `${String(i + 1).padStart(2, '0')}-${pages[i]}-${nom}`);
      const manque = await page.capturer(`${fichier}.png`, { pleinePage: false }).then(() => r.manque, (e) => [...r.manque, `capture impossible (${e.message})`]);
      fs.writeFileSync(`${fichier}.txt`, `${r.lu?.url || ''}\n${manque.length ? `MANQUE :\n- ${manque.join('\n- ')}\n` : ''}----\n${r.lu?.texte || ''}\n`);
      etats[i].vues.push({ nom, manque, ms: r.ms });
    }));
    await relever('avant', (p) => vueAttendue(HUD[p], 'vide'));
    for (const f of s.fichiers) await srv.poser(f); // le jeu écrit pendant que les fenêtres sont ouvertes
    await relever('apres', (p) => vueAttendue(FENETRES.attendus[p] || {}, 'apres'));
    const reponses = await Promise.all(ouvertes.map((page) => page.evaluer(SONDE_REQUETE, { delaiMs: FENETRE_REQUETE_MS + 5000 }).catch((e) => e.message)));
    for (const [i, page] of ouvertes.entries()) {
      const bilan = await page.quitter();
      const problemes = problemesDuReleve(bilan, { origine: ui.url, toleres: [...liste(HUD[pages[i]].toleres)] });
      if (reponses[i] !== 'ok') problemes.push(`requête depuis la fenêtre, une fois toutes ouvertes : ${reponses[i]}`);
      resultats.push({ cle: `/hud/${pages[i]}`, genre: 'fenetre', vues: etats[i].vues, problemes, requetes: bilan.requetes.length, ms: 0 });
    }
    ouvertes.length = 0;
    return { id: 'fenetres', resultats, erreursServeur: erreursServeur(srv.sortie()), maintenant: srv.maintenant };
  } finally {
    for (const p of ouvertes) await p.quitter().catch(() => {});
    if (session) await session.fermer();
    if (ui) await ui.arreter();
    if (srv) await srv.arreter();
    await new Promise((r) => flux.end(r));
  }
}

/** Fenêtres essayées sans l'app : celles qui affichent des valeurs qu'on croirait en direct (rachat, combat, minage). */
export const SANS_APP = Object.freeze({ seance: 'mort-srv-2026-10-29', pages: Object.freeze(['glance', 'combat', 'waypoints']), delaiMs: 35_000 });

/**
 * L'app s'arrête (serveur arrêté, comme la fenêtre « EliteApp serveur » fermée) pendant que des fenêtres de l'overlay
 * sont ouvertes : chacune doit dire, en moins de 25 s, que ses valeurs sont figées (bandeau OFFLINE_TEXT, contenu grisé
 * par la classe OFFLINE_CLASS de client/src/core/hudConnection.js), au lieu de les présenter comme en direct. Avant,
 * leur texte restait identique au caractère près, « en direct ». Le relevé des requêtes n'est pas jugé ici : sans
 * serveur, les requêtes échouent forcément.
 */
async function fenetresSansApp({ seance, pages, delaiMs }, { client, chrome, pont, dossier, journal }) {
  fs.mkdirSync(dossier, { recursive: true });
  const { OFFLINE_CLASS, OFFLINE_TEXT } = await import(pathToFileURL(path.join(CLIENT, 'src', 'core', 'hudConnection.js')).href);
  const portUi = await portLibre();
  const flux = fs.createWriteStream(journal);
  let srv = null;
  let ui = null;
  let session = null;
  const ouvertes = [];
  const resultats = [];
  let maintenant = null;
  try {
    srv = await demarrerServeur({ seance, portInterface: portUi, sortie: (l) => flux.write(`${l}\n`) });
    maintenant = srv.maintenant;
    ui = await servirClient({ client, api: srv.url, port: portUi, sortie: (l) => flux.write(`[interface] ${l}\n`) });
    const horloge = scriptHorloge(srv.maintenant);
    session = await chrome.contexte();
    const onglets = [];
    for (const p of pages) onglets.push(await session.onglet({ ...HUD_TAILLE, scripts: [horloge, pont], fond: FOND_JEU }));
    ouvertes.push(...(await Promise.all(onglets.map((o, i) => o.ouvrir(`${ui.url}/hud/${pages[i]}`)))));
    const bandeau = (lu) => String(lu?.texte || '').includes(OFFLINE_TEXT);
    // App en marche : la fenêtre se remplit, sans bandeau
    const avant = await Promise.all(ouvertes.map((page, i) => page.attendre((lu) => (bandeau(lu) ? ['pas de bandeau tant que l’app tourne'] : String(lu?.texte || '').trim() ? [] : ['contenu de la fenêtre']), { delaiMs: VUE_MS })));
    const arret = Date.now();
    await srv.arreter();
    srv = null;
    const apres = await Promise.all(ouvertes.map((page) => page.attendre((lu) => (bandeau(lu) ? [] : [`bandeau « ${OFFLINE_TEXT} »`]), { delaiMs, calmeMs: 0 })));
    for (const [i, page] of ouvertes.entries()) {
      const grise = await page.evaluer(`document.documentElement.classList.contains(${JSON.stringify(OFFLINE_CLASS)})`).catch((e) => `illisible (${e.message})`);
      const fichier = path.join(dossier, `${String(i + 1).padStart(2, '0')}-${pages[i]}-sans-app`);
      await page.capturer(`${fichier}.png`, { pleinePage: false }).catch(() => {});
      fs.writeFileSync(`${fichier}.txt`, `${apres[i].lu?.url || ''}\n----\n${apres[i].lu?.texte || ''}\n`);
      const manque = [...apres[i].manque, ...(grise === true ? [] : [`contenu grisé (classe ${OFFLINE_CLASS} : ${grise})`])];
      resultats.push({
        cle: `/hud/${pages[i]}`,
        genre: 'fenetre',
        vues: [{ nom: 'app en marche', manque: avant[i].manque, ms: avant[i].ms }, { nom: 'app arrêtée', manque, ms: Date.now() - arret }],
        problemes: [],
        requetes: 0,
        ms: Date.now() - arret,
      });
    }
    return { id: 'sans-app', resultats, erreursServeur: [], maintenant };
  } finally {
    for (const p of ouvertes) await p.quitter().catch(() => {});
    if (session) await session.fermer();
    if (ui) await ui.arreter();
    if (srv) await srv.arreter();
    await new Promise((r) => flux.end(r));
  }
}

/**
 * Parcours en direct (attendus.mjs, EN_DIRECT) : une page de l'app sur un serveur sans journal ; le jeu y écrit des
 * séances une à une entre des clics, et chaque étape attend ce que la page doit montrer. Lecture seule : un clic qui
 * écrirait (enregistrer un rôle…) est un défaut, comme à l'ouverture d'une page.
 */
export async function parcoursEnDirect({ url, etapes }, { client, chrome, dossier, journal }) {
  fs.mkdirSync(dossier, { recursive: true });
  const seances = [...new Set(etapes.filter((e) => e.poser).map((e) => e.poser))].map(lireSeance);
  const maintenant = seances.map((s) => s.maintenant).sort().at(-1); // toutes les séances écrites avant l'heure figée
  const portUi = await portLibre();
  const flux = fs.createWriteStream(journal);
  let srv = null;
  let ui = null;
  let nav = null;
  let page = null;
  const vues = [];
  try {
    srv = await demarrerServeur({ journaux: [], maintenant, portInterface: portUi, sortie: (l) => flux.write(`${l}\n`) });
    ui = await servirClient({ client, api: srv.url, port: portUi, sortie: (l) => flux.write(`[interface] ${l}\n`) });
    nav = await chrome.contexte();
    const onglet = await nav.onglet({ ...APP_TAILLE, scripts: [scriptHorloge(srv.maintenant)] });
    for (const [i, etape] of etapes.entries()) {
      const nom = etape.poser ? `journal ${etape.poser}` : `clic ${etape.cliquer}`;
      if (etape.poser) for (const f of lireSeance(etape.poser).fichiers) await srv.poser(f); // le jeu écrit
      if (!page) page = await onglet.ouvrir(`${ui.url}${url}`);
      if (etape.cliquer) {
        const clic = await page.cliquer(etape.cliquer);
        if (clic !== 'ok') {
          vues.push({ nom, manque: [`clic sur « ${etape.cliquer} » : ${clic}`], ms: 0 });
          break;
        }
      }
      const vue = { textes: etape.textes || [], absents: etape.absents || [], styles: etape.styles || [] };
      const r = await page.attendre((lu) => manquesVue(lu, vue), { delaiMs: VUE_MS, styles: vue.styles });
      const fichier = path.join(dossier, `${String(i + 1).padStart(2, '0')}-${nom.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`);
      const manque = await page.capturer(`${fichier}.png`, { pleinePage: true }).then(() => r.manque, (e) => [...r.manque, `capture impossible (${e.message})`]);
      fs.writeFileSync(`${fichier}.txt`, `${r.lu?.url || ''}\n${manque.length ? `MANQUE :\n- ${manque.join('\n- ')}\n` : ''}----\n${r.lu?.texte || ''}\n`);
      vues.push({ nom, manque, ms: r.ms });
      if (manque.length) break; // la suite dépend de cette étape
    }
    const bilan = page ? await page.quitter() : { requetes: [], exceptions: [], consoles: [], journaux: [], dialogues: [], plantage: false };
    page = null;
    const problemes = problemesDuReleve(bilan, { origine: ui.url, toleres: [], lecture: true });
    return { id: 'direct', resultats: [{ cle: url, genre: 'page', vues, problemes, requetes: bilan.requetes.length, ms: 0 }], erreursServeur: erreursServeur(srv.sortie()), maintenant: srv.maintenant };
  } finally {
    if (page) await page.quitter().catch(() => {});
    if (nav) await nav.fermer();
    if (ui) await ui.arreter();
    if (srv) await srv.arreter();
    await new Promise((r) => flux.end(r));
  }
}

/**
 * Le contrôle complet. `ctx` : contexte d'une étape (lancer.mjs). Rend le résumé, ou lance ctx.EchecEtape.
 * `seulement` (mise au point, jamais par l'étape) : { passes: ['vide'], filtre: /regex sur la clé/ }.
 */
export async function controlerPages(ctx, seulement = {}) {
  const executable = trouverChrome();
  if (!executable) {
    if (process.env.CONTROLE_SANS_CHROME === '1') return { saute: 'Chrome introuvable sur ce PC (CONTROLE_SANS_CHROME=1)' };
    throw new ctx.EchecEtape('Chrome introuvable : installe Google Chrome, ou règle CONTROLE_CHROME (chemin de chrome.exe). CONTROLE_SANS_CHROME=1 saute l’étape (contrôle incomplet).');
  }
  const racine = path.join(path.dirname(ctx.journal()), path.basename(ctx.journal(), '.log'));
  fs.mkdirSync(racine, { recursive: true });
  const journalInterface = fs.createWriteStream(path.join(racine, 'interface.log'));
  let client = null;
  let chrome = null;
  const bilans = [];
  try {
    client = await preparerClient({ sortie: (l) => journalInterface.write(`${l}\n`) });
    const sous = sousPages(client.modules, path.join(CLIENT, 'src', 'modules'));
    const manquants = trous({ modules: client.modules, app: Object.keys(APP), hud: Object.keys(HUD), sous, fixes: FIXES, ensemble: Object.keys(FENETRES.attendus) });
    if (manquants.length) throw new ctx.EchecEtape(`${manquants.length} page(s) ou fenêtre(s) sans attendu, ou attendu sans page.`, { details: manquants.join('\n') });
    // Modes de jeu : ce que le serveur ouvre seul (server/src/core/modes.js) = ce que les modules clients déclarent
    const ecartsModes = concordanceModes(client.modules, MODES);
    if (ecartsModes.length) throw new ctx.EchecEtape(`${ecartsModes.length} écart(s) entre les modes déclarés (server/src/core/modes.js) et les modules clients.`, { details: ecartsModes.join('\n') });
    const pont = scriptPont();
    chrome = await lancerChrome({ executable });
    ctx.dire(`${chrome.version}, ${client.modules.length} modules clients, ${Object.keys(APP).length} pages et ${Object.keys(HUD).length} fenêtres attendues`);

    const seances = toutesLesSeances();
    const passes = [
      {
        id: 'seances',
        titre: `${seances.ids.length} séances rejouées`,
        journaux: seances.journaux,
        maintenant: seances.maintenant,
        // Comme le rejeu : « Nouvelle route » avec un objectif, tout l'historique compris
        preparer: async (srv) => {
          const r = await srv.requete('POST', '/api/modules/routes/routes', { goal: 7_000_000_000, includeHistory: true });
          if (r.statut !== 201 || r.corps?.id !== 1) throw new Error(`création de la route : ${r.statut} ${JSON.stringify(r.corps).slice(0, 200)}`);
        },
      },
      { id: 'vide', titre: 'sans journal', journaux: [], maintenant: seances.maintenant },
    ];
    for (const p of passes.filter((x) => !seulement.passes || seulement.passes.includes(x.id))) {
      const debut = Date.now();
      const b = await passe(p, { client, chrome, pont, dossier: path.join(racine, p.id), journal: path.join(racine, `serveur-${p.id}.log`), filtre: seulement.filtre });
      bilans.push({ ...p, ...b });
      const temps = b.resultats.slice().sort((x, y) => y.ms - x.ms)
        .map((r) => `${String(r.ms).padStart(6)} ms  ${r.cle}  (ouverture ${r.ouvertureMs}, ${r.vues.map((v) => `${v.nom} ${v.ms}+${v.captureMs ?? 0}`).join(', ')}, sortie ${r.quitterMs})`);
      fs.writeFileSync(path.join(racine, `temps-${p.id}.txt`), `${temps.join('\n')}\n`);
      const vues = b.resultats.reduce((n, r) => n + r.vues.length, 0);
      ctx.dire(`${p.titre} : ${b.resultats.length} pages et fenêtres, ${vues} vues, ${Math.round((Date.now() - debut) / 100) / 10} s`);
    }
    if (!seulement.passes || seulement.passes.includes('fenetres')) {
      const debut = Date.now();
      const b = await fenetresEnsemble(FENETRES, { client, chrome, pont, dossier: path.join(racine, 'fenetres'), journal: path.join(racine, 'serveur-fenetres.log') });
      bilans.push({ ...b, titre: 'fenêtres ensemble' });
      ctx.dire(`toutes les fenêtres ensemble, ${FENETRES.seance} écrite en direct : ${b.resultats.length} fenêtres, ${Math.round((Date.now() - debut) / 100) / 10} s`);
    }
    if (!seulement.passes || seulement.passes.includes('sans-app')) {
      const debut = Date.now();
      const b = await fenetresSansApp(SANS_APP, { client, chrome, pont, dossier: path.join(racine, 'sans-app'), journal: path.join(racine, 'serveur-sans-app.log') });
      bilans.push({ ...b, titre: 'app arrêtée, fenêtres ouvertes' });
      ctx.dire(`app arrêtée pendant que ${b.resultats.length} fenêtres sont ouvertes : ${Math.round((Date.now() - debut) / 100) / 10} s`);
    }
    if (!seulement.passes || seulement.passes.includes('direct')) {
      const debut = Date.now();
      const b = await parcoursEnDirect(EN_DIRECT, { client, chrome, dossier: path.join(racine, 'direct'), journal: path.join(racine, 'serveur-direct.log') });
      bilans.push({ ...b, titre: 'parcours en direct' });
      ctx.dire(`parcours en direct sur ${EN_DIRECT.url} : ${b.resultats[0].vues.length}/${EN_DIRECT.etapes.length} étapes, ${Math.round((Date.now() - debut) / 100) / 10} s`);
    }
  } finally {
    if (chrome) await chrome.fermer();
    client?.effacer();
    nettoyerBanc();
    await new Promise((r) => journalInterface.end(r));
  }

  const defauts = [];
  for (const b of bilans) {
    for (const r of b.resultats.sort((x, y) => x.cle.localeCompare(y.cle))) {
      for (const v of r.vues) for (const m of v.manque) defauts.push(`[${b.id}] ${r.cle}${v.nom !== 'ouverture' ? ` › ${v.nom}` : ''} : manque ${m}`);
      for (const pb of r.problemes) defauts.push(`[${b.id}] ${r.cle} : ${pb}`);
    }
    for (const l of b.erreursServeur) defauts.push(`[${b.id}] serveur : ${l.slice(0, 200)}`);
  }
  const pages = bilans.reduce((n, b) => n + b.resultats.length, 0);
  const vues = bilans.reduce((n, b) => n + b.resultats.reduce((m, r) => m + r.vues.length, 0), 0);
  // Journal de l'étape : chaque ouverture, ses vues, ses défauts
  const lignes = bilans.flatMap((b) => [`== ${b.id} (${b.titre || ''}), heure figée ${b.maintenant}`, ...b.resultats.map((r) => {
    const d = [...r.vues.flatMap((v) => v.manque.map((m) => `manque ${m}`)), ...r.problemes];
    return `${d.length ? '✖' : '✔'} ${r.cle} : ${r.vues.map((v) => v.nom).join(', ')} ; ${r.requetes} requêtes${d.length ? `\n    ${d.join('\n    ')}` : ''}`;
  }), ...b.erreursServeur.map((l) => `✖ serveur : ${l}`)]);
  fs.writeFileSync(ctx.journal(), `${lignes.join('\n')}\n\nCaptures et textes lus : ${racine}\n`);
  if (defauts.length) {
    throw new ctx.EchecEtape(`Pages et fenêtres : ${defauts.length} défaut(s) sur ${pages} ouvertures.`, {
      details: `${defauts.slice(0, 60).join('\n')}${defauts.length > 60 ? `\n… et ${defauts.length - 60} autre(s)` : ''}\n\nCaptures et textes lus : ${racine}`,
      journal: ctx.journal(),
    });
  }
  return `${pages} ouvertures (${bilans.map((b) => `${b.resultats.length} ${b.id}`).join(', ')}), ${vues} vues sans défaut ; captures : ${racine}`;
}
