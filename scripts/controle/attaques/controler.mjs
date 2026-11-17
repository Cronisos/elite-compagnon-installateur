// Contrôle des attaques (étape 80-attaques) : tests de non-régression DÉFENSIFS de notre propre serveur, joués
// uniquement contre le serveur isolé du banc (127.0.0.1, port temporaire, données et options temporaires, sonde
// préchargée), puis contre le proxy de l'interface (vite preview, même proxy /api que client/vite.config.js) relié à
// lui. Chaque cas a son résultat attendu : le serveur doit REFUSER proprement (4xx, raison en français, rien d'écrit).
//
// Ordre : refus d'abord (en-têtes, corps, paramètres, hors /api), avec la preuve que rien n'a été écrit ; puis les
// scénarios sur fichiers (packs d'avatar, XML et couleurs du HUD, images de vaisseau) et le jeton d'escadron ; puis les
// corps et requêtes piégés sur toutes les routes (jeton fouillé dans chaque réponse) ; enfin le proxy, et les relevés de
// la sonde (aucune connexion sortante, aucun programme, aucun accès disque hors du banc, prototypes intacts).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compterTables } from '../banc/base.mjs';
import { servirClient, servirDev } from '../banc/client.mjs';
import { demarrerServeur, nettoyerBanc, portLibre } from '../banc/serveur.mjs';
import { lectureAttendue } from '../base/controler.mjs';
import { Bilan } from './bilan.mjs';
import { differences, nomsContenant, photo } from './fichiers.mjs';
import { familleHorsApi, famillesCorps, famillesCorpsPieges, famillesEntetes, famillesInterface, famillesParametres, famillesProxy, famillesRequetes, marqueur } from './familles.mjs';
import { ecouterFlux } from './http.mjs';
import { champsDesModules, routesDuServeur } from './routes.mjs';
import { dossierOptionsReelles, jetonAuHasard, poserBalayage, poserCapture, recherchesAuClic, scenarioAvatars, scenarioCaptures, scenarioCouleurs, scenarioFluxMuet, scenarioImagesVaisseau, scenarioJeton, scenarioJournalPiege, scenarioMinuterie, scenarioOverlay, scenarioProfilPiege, scenarioRecherchesEnLigne, scenarioReseau, scenarioTextesDiscord, spanshHorsRoutes } from './scenarios.mjs';

const SEANCE = 'minage-rhino-2026-11-07';
const ATTENTE_STABLE_MS = 3000;
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

/** Photo de ce qu'un refus ne doit jamais changer : fichiers du dossier du banc et lignes de chaque table. */
function etatDisque(srv) {
  const fichiers = photo(srv.dossiers.racine, { exclure: (rel) => /^donnees\/elite\.db-(journal|wal|shm)$/.test(rel) });
  // La base change d'octets sans changer de contenu (pages réutilisées) : comparée par ses lignes, pas par ses octets
  fichiers.delete('donnees/elite.db');
  const base = compterTables(path.join(srv.dossiers.donnees, 'elite.db'));
  for (const [t, n] of Object.entries(base)) fichiers.set(`base:${t}`, String(n));
  return fichiers;
}

export async function controlerAttaques(ctx) {
  const M = marqueur();
  const jeton = jetonAuHasard();
  const lignes = [];
  const journal = fs.createWriteStream(ctx.journal());
  const ecrireJournal = (l) => journal.write(`${l}\n`);
  const portInterface = await portLibre();
  const srv = await demarrerServeur({ seance: SEANCE, sonde: true, portInterface, preparer: (d) => { poserCapture(d); poserBalayage(d); }, sortie: (l) => lignes.push(l) });
  let ui = null;
  let dev = null;
  let flux = null;
  const dossierUi = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-controle-vite-'));
  const dossierDev = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-controle-dev-'));
  const notes = [];
  const secrets = [];
  const bilans = [];
  try {
    ctx.dire(`Serveur isolé ${srv.url} (séance ${SEANCE}, sonde chargée), marqueur ${M}`);
    const { routes, illisibles } = await routesDuServeur(srv);
    if (illisibles.length) throw new ctx.EchecEtape(`${illisibles.length} route(s) que le banc ne sait pas attaquer : ajoute-les à attaques/routes.mjs avant tout.`, { details: illisibles.join('\n') });
    const champs = champsDesModules();
    const ecritures = routes.filter((r) => !['GET', 'HEAD', 'OPTIONS'].includes(r.methode));
    ctx.dire(`${routes.length} routes (${ecritures.length} écritures), lues dans le serveur`);
    flux = ecouterFlux(srv.url);
    await srv.demander('sonde:repere');

    const b = new Bilan({ base: srv.url, secrets: () => secrets });
    bilans.push(b);

    // Le serveur finit d'abord ses écritures de démarrage (état de l'escadron, sessions…), puis ne doit plus rien écrire
    // de lui-même : sinon « rien d'écrit » ne voudrait rien dire
    let repos = etatDisque(srv);
    for (let essai = 0, stable = 0; stable < 2; essai += 1) {
      await attendre(ATTENTE_STABLE_MS / 2);
      const encore = etatDisque(srv);
      const diff = differences(repos, encore);
      stable = diff.length ? 0 : stable + 1;
      repos = encore;
      if (essai > 20) {
        b.constat('Rien d’écrit après un refus', 'serveur au repos', 'plus aucune écriture sans requête après le démarrage', `écrit encore après ${Math.round((essai * ATTENTE_STABLE_MS) / 2000)} s : ${diff.join(', ')}`);
        break;
      }
    }

    // 1. Refus : en-têtes, corps, paramètres, hors /api. Rien ne doit être écrit : vérifié après chaque route (corps et
    // paramètres), pour nommer celle qui aurait écrit
    const enTetes = famillesEntetes(routes, { port: srv.port, portInterface });
    const parRoute = [...famillesCorps(routes), ...famillesParametres(routes, M), ...familleHorsApi()];
    ctx.dire(`Refus : ${enTetes.length + parRoute.length} requêtes`);
    const sortiesAvant = ((await srv.demander('sonde')).sorties || []).length;
    await b.jouerTout(enTetes);
    // Pas un clic : ni la page d'un autre port (same-site), ni un lien ouvert dans le navigateur (none), ni ?online=1
    const auClic = recherchesAuClic(((await srv.demander('sonde')).sorties || []).slice(sortiesAvant));
    b.constat('Sec-Fetch-Site none', 'recherches de Mes repères réservées au clic (Spansh /api/dump, prix d’Ardent du système), pendant les familles d’en-têtes', 'aucune tentative', auClic.length ? auClic.slice(0, 5).map((s) => s.url).join(' ; ') : null);
    let avant = repos;
    const verifierRien = async (quoi) => {
      const apres = etatDisque(srv);
      b.constat('Rien d’écrit après un refus', quoi, 'fichiers et lignes de la base inchangés', differences(avant, apres).join(', ') || null);
      avant = apres;
    };
    await verifierRien(`${enTetes.length} requêtes refusées par la garde (Host, Origin, Sec-Fetch-Site, en-tête d’écriture)`);
    for (let i = 0; i < parRoute.length;) {
      const groupe = `${parRoute[i].methode} ${parRoute[i].modele || parRoute[i].chemin}`;
      let j = i;
      while (j < parRoute.length && `${parRoute[j].methode} ${parRoute[j].modele || parRoute[j].chemin}` === groupe) j += 1;
      await b.jouerTout(parRoute.slice(i, j));
      await verifierRien(`${groupe} (${j - i} requêtes refusées)`);
      i = j;
    }
    await srv.calme();
    await verifierRien('après le calme (écritures différées)');
    b.constat('Chemins piégés', 'noms des fichiers du banc', 'aucun fichier au nom du marqueur', nomsContenant(srv.dossiers.racine, M).join(', ') || null);

    // 2. Scénarios sur fichiers et jeton
    ctx.dire('Scénarios : packs d’avatar, couleurs du HUD (et horloge qui a reculé), texte Discord d’un build piégé, images de vaisseau, captures, écriture ratée dans une minuterie, journal piégé, profil de commandes piégé, recherches en ligne sans choix du joueur, demande mal formée à l’overlay, jeton d’escadron, réseau coupé');
    notes.push(...(await scenarioAvatars(b, srv, M)));
    await scenarioCouleurs(b, srv, M, { optionsReelles: dossierOptionsReelles() });
    notes.push(...(await scenarioTextesDiscord(b)));
    await scenarioImagesVaisseau(b, srv, M);
    await scenarioCaptures(b, srv);
    await scenarioMinuterie(b, srv, { sortie: () => lignes });
    await scenarioJournalPiege(b, srv, { sortie: () => lignes, demarrer: demarrerServeur });
    await scenarioProfilPiege(b, srv, { sortie: () => lignes });
    // Avant les corps piégés (qui peuvent activer le réglage des recherches automatiques) : le réglage par défaut
    await scenarioRecherchesEnLigne(b, srv);
    await scenarioOverlay(b);
    secrets.push(jeton); // désormais fouillé dans chaque réponse, de chaque cible
    await scenarioJeton(b, srv, jeton, { routes, sortie: () => lignes });
    await scenarioReseau(b, routes);

    // 3. Corps et requêtes piégés sur toutes les routes
    const pieges = [...famillesCorpsPieges(routes, champs, M), ...famillesRequetes(routes, champs, M)];
    ctx.dire(`Corps et requêtes piégés : ${pieges.length} requêtes`);
    await b.jouerTout(pieges);
    await srv.calme();
    b.constat('Chemins piégés', 'noms des fichiers du banc, après les corps piégés', 'aucun fichier au nom du marqueur', nomsContenant(srv.dossiers.racine, M).filter((p) => !/^donnees\/compagnon\/|^hors-pack/.test(p)).join(', ') || null);
    // Après tout ce qui lit le journal : le scénario y ajoute de gros événements inconnus des modules
    ctx.dire('Flux temps réel : client qui ne lit plus, connexions sans fin');
    await scenarioFluxMuet(b, srv, { sortie: () => lignes, flux });
    b.clore();

    // 4. Proxy de l'interface
    fs.mkdirSync(path.join(dossierUi, 'dist'), { recursive: true });
    const index = Buffer.from('<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>banc</title></head><body></body></html>\n');
    fs.writeFileSync(path.join(dossierUi, 'dist', 'index.html'), index);
    ui = await servirClient({ client: { dossier: dossierUi }, api: srv.url, port: portInterface });
    const p = new Bilan({ base: ui.url, cible: 'proxy de l’interface', secrets: () => secrets });
    bilans.push(p);
    p.constat('Aucun CORS', 'réglage server.cors de client/vite.config.js (npm run dev)', 'false (coupé)', ui.securite?.cors === false ? null : `${JSON.stringify(ui.securite?.cors)}`);
    p.constat('Aucun CORS', 'réglage preview.cors résolu par Vite', 'false (coupé)', ui.securite?.corsPreview === false ? null : `${JSON.stringify(ui.securite?.corsPreview)}`);
    const viaProxy = famillesProxy(routes, { portInterface, racine: ctx.racine, index });
    ctx.dire(`Proxy de l’interface ${ui.url} : ${viaProxy.length} requêtes`);
    const sortiesProxy = ((await srv.demander('sonde')).sorties || []).length;
    await p.jouerTout(viaProxy);
    const auClicProxy = recherchesAuClic(((await srv.demander('sonde')).sorties || []).slice(sortiesProxy));
    p.constat('Sec-Fetch-Site same-site', 'recherches de Mes repères réservées au clic, à travers le proxy', 'aucune tentative', auClicProxy.length ? auClicProxy.slice(0, 5).map((s) => s.url).join(' ; ') : null);
    // L'interface elle-même (garde de client/viteGuard.js) : éditeur coupé, cadres et requêtes d'un autre site refusés
    await p.jouerTout(famillesInterface({ racine: ctx.racine, cible: path.join(dossierUi, 'dist', 'index.html'), module: '/index.html' }));
    p.clore();

    // 5. Serveur de développement de l'interface (celui de « npm run dev » et de « Lancer EliteApp.cmd ») : ses routes
    // internes (/__open-in-editor, /@fs/), que vite preview n'a pas. Un éditeur inerte remplace le vrai : s'il est lancé
    // une seule fois, c'est un échec.
    const temoin = path.join(dossierDev, 'editeur-lance.txt');
    const editeur = path.join(dossierDev, 'editeur.cmd');
    fs.writeFileSync(editeur, `@echo off\r\necho %* >> "${temoin}"\r\n`);
    const cible = path.join(dossierDev, 'cible.txt');
    fs.writeFileSync(cible, 'fichier inerte du banc\n');
    dev = await servirDev({ dossier: dossierDev, api: srv.url, port: await portLibre(), editeur });
    const d = new Bilan({ base: dev.url, cible: 'serveur de développement de l’interface', secrets: () => secrets });
    bilans.push(d);
    const viaDev = [
      ...famillesInterface({ racine: ctx.racine, cible, module: '/src/main.jsx', dev: true }),
      // L'API à travers son proxy : la même garde que par preview (quelques routes du cœur suffisent). Seulement les
      // refus d'un Host ou d'une origine étrangers : le serveur isolé n'accepte que l'origine de l'interface preview.
      ...famillesProxy(routes.filter((r) => r.chemin === '/api/state' || r.chemin === '/api/settings'), { portInterface: dev.port, racine: ctx.racine, index })
        .filter((a) => ['Host étranger', 'Origin étranger', 'Origin « null »', 'Sec-Fetch-Site cross-site', 'Sec-Fetch-Site same-site', 'Aucun CORS'].includes(a.famille)),
    ];
    ctx.dire(`Serveur de développement de l’interface ${dev.url} : ${viaDev.length} requêtes`);
    await d.jouerTout(viaDev);
    await attendre(1500); // Vite lance l'éditeur sans attendre : le temps qu'il écrive son témoin
    d.constat('Interface : éditeur jamais lancé', 'programme lancé par /__open-in-editor (éditeur inerte du banc)', 'jamais lancé', fs.existsSync(temoin) ? `lancé : ${fs.readFileSync(temoin, 'utf8').trim().slice(0, 200)}` : null);
    d.clore();

    // 6. Ce que la sonde a vu pendant tout le contrôle, flux temps réel et sortie du serveur
    const sonde = await srv.demander('sonde');
    const releve = (liste) => (liste.length ? liste.slice(0, 10).map((x) => `${x.op} ${x.cible ?? x.chemin}${x.raison ? ` (${x.raison})` : ''}`).join(' ; ') : null);
    b.constat('Sonde du serveur isolé', 'connexions sortantes (ELITE_NO_NETWORK=1)', 'aucune (ni TCP, ni UDP, ni DNS, ni tube)', releve(sonde.reseau));
    b.constat('Sonde du serveur isolé', 'programmes lancés', 'aucun (sauf nvidia-smi et tasklist du Moniteur PC, en lecture)', releve(sonde.programmes.filter((x) => !lectureAttendue('programmes', x))));
    b.constat('Sonde du serveur isolé', 'accès disque hors du banc', 'aucun (sauf les dossiers de voix de l’IA de bord, en lecture)', releve(sonde.disque.filter((x) => !lectureAttendue('disque', x))));
    b.constat('Sonde du serveur isolé', 'écoute hors de ce PC', 'aucune', releve(sonde.ecoutes));
    b.constat('Sonde du serveur isolé', 'prototypes des objets (clés __proto__, constructor…)', 'intacts', sonde.prototypes.length ? sonde.prototypes.slice(0, 10).join(', ') : null);
    b.constat('Sonde du serveur isolé', 'relevés perdus', 'aucun', sonde.perdus ? `${sonde.perdus}` : null);
    // Tout ce que la passerelle réseau aurait demandé pendant le contrôle (réseau coupé) : jamais une adresse de Spansh
    // construite à partir d'un paramètre piégé
    b.constat('Sonde du serveur isolé', `tentatives d’appel sortant (${(sonde.sorties || []).length} relevées)`, 'vers spansh.co.uk, seulement les adresses des modules (dont /api/dump/<entier>)', releve(spanshHorsRoutes(sonde.sorties || []).map((s) => ({ op: 'tentative', cible: s.url }))));
    b.constat('Sonde du serveur isolé', 'tentatives d’appel sortant perdues (plus de 2 000)', 'aucune', sonde.sortiesPerdues ? `${sonde.sortiesPerdues}` : null);
    const texteFlux = flux.texte();
    b.constat('Jeton d’escadron', 'flux temps réel (/api/stream)', 'jamais le jeton', texteFlux.includes(jeton) || texteFlux.includes(jeton.slice(0, 16)) ? 'jeton dans le flux' : null);
    b.constat('Jeton d’escadron', 'flux temps réel écouté', 'des messages reçus', texteFlux.length ? null : 'flux vide');
    b.constat('Jeton d’escadron', 'sortie complète du serveur', 'jamais le jeton', lignes.some((l) => l.includes(jeton) || l.includes(jeton.slice(0, 16))) ? 'jeton écrit dans la sortie' : null);
    const piles = lignes.filter((l) => /^\s+at\s/.test(l));
    b.constat('Jamais d’erreur 500', 'sortie du serveur', 'aucune pile d’erreur (erreur imprévue)', piles.length ? `${piles.length} ligne(s) de pile, par exemple : ${lignes[Math.max(0, lignes.indexOf(piles[0]) - 1)]?.slice(0, 200)}` : null);
  } finally {
    flux?.fermer();
    await ui?.arreter().catch(() => {});
    await dev?.arreter().catch(() => {});
    fs.rmSync(dossierUi, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    fs.rmSync(dossierDev, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    await srv.arreter();
    nettoyerBanc();
    for (const l of lignes) ecrireJournal(`[serveur] ${l}`);
  }

  // Bilan : une ligne par famille dans le journal, les écarts en détail
  const ecarts = bilans.flatMap((x) => x.ecarts());
  for (const x of bilans) {
    ecrireJournal(`\n== ${x.cible} ==`);
    for (const f of x.resume()) ecrireJournal(`${f.ecarts ? '✖' : '✔'} ${f.famille} : ${f.total} cas, ${f.ecarts} écart(s) ; attendu : ${f.attendus.join(' / ')}`);
  }
  for (const e of ecarts) ecrireJournal(`ÉCART ${e}`);
  // Les mêmes écarts, structurés (famille, méthode, route déclarée, cas, obtenu), pour les trier
  const fichierEcarts = path.join(path.dirname(ctx.journal()), '80-attaques-ecarts.json');
  fs.writeFileSync(fichierEcarts, JSON.stringify(bilans.flatMap((x) => x.releves), null, 1));
  await new Promise((r) => journal.end(r));
  const requetes = bilans.reduce((n, x) => n + x.reponses, 0);
  const verifications = bilans.reduce((n, x) => n + x.resume().reduce((m, f) => m + f.total, 0), 0);
  const familles = new Set(bilans.flatMap((x) => x.resume().map((f) => f.famille)));
  if (ecarts.length) {
    throw new ctx.EchecEtape(`Attaques : ${ecarts.length} écart(s) avec les résultats attendus (une faille possible à corriger dans le code, ou un attendu à revoir).`, {
      details: [...ecarts.slice(0, 40), ...(ecarts.length > 40 ? [`… et ${ecarts.length - 40} autre(s)`] : [])].join('\n'),
      journal: ctx.journal(),
    });
  }
  return `${requetes} requêtes (serveur isolé et proxy de l’interface), ${verifications} vérifications en ${familles.size} familles, toutes conformes${notes.length ? ` ; ${notes.join(' ; ')}` : ''}`;
}
