// Contrôle des pages et des fenêtres (étape 75-pages) : vérifications pures (ce qui manque à une page, ce qu'un relevé
// a d'anormal, attendus sans page ou page sans attendu, pont de l'overlay simulé), puis Chrome sans fenêtre sur une
// petite page piégée : chaque sorte de défaut doit être vue, et rien ne doit rester après la fermeture.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { once } from 'node:events';
import { lancerChrome, scriptHorloge, trouverChrome } from '../banc/chrome.mjs';
import { decrireModules, proxyDuBanc, servirClient } from '../banc/client.mjs';
import { demarrerServeur, listerSeances } from '../banc/serveur.mjs';
import { APP, CADRE, EN_DIRECT, FENETRES, HUD } from '../pages/attendus.mjs';
import { tachesDeLaPasse, vueAttendue } from '../pages/controler.mjs';
import { fonctionsDuPreload, MAIN, pasDuMain, PRELOAD, scriptPont } from '../pages/pont.mjs';
import { concordanceModes, manquesVue, normaliser, problemesDuReleve, routesDeclarees, trous } from '../pages/verifier.mjs';
import { MODES } from '../../../server/src/core/modes.js';

const lu = (o = {}) => ({ texte: '', titres: [], actifs: [], infobulles: [], noeuds: 10, url: 'http://127.0.0.1:1/x', ...o });

test('pages : textes comparés sans majuscules, sortes d’espaces ni apostrophes', () => {
  assert.equal(normaliser('  74 591 507 CR  '), '74 591 507 cr');
  assert.equal(normaliser('Aucun système prospecté pour l’instant.'), "aucun système prospecté pour l'instant.");
  assert.equal(normaliser('MES\n\tBUILDS'), 'mes builds');
});

test('pages : ce qui manque à une vue (titre, onglet, textes, absents, interdits, page blanche, fenêtre vide, adresse)', () => {
  assert.deepEqual(manquesVue(lu({ texte: 'Combat\nEnnemis abattus 0', titres: ['Combat'] }), { titre: 'Combat', textes: ['ennemis ABATTUS'] }), []);
  const m = manquesVue(lu({ texte: 'Gain NaN cr · undefined · [object Object] · Invalid Date · Erreur interne du serveur.', titres: ['Autre'] }), { titre: 'Combat', textes: ['Primes'], absents: ['Gain'] });
  assert.equal(m.length, 8, m.join('\n'));
  assert.match(m[0], /titre « Combat » \(titres vus : « Autre »\)/);
  assert.match(manquesVue(lu({ noeuds: 0 }), {})[0], /page blanche/);
  assert.match(manquesVue(lu({ noeuds: 3 }), { rien: true })[0], /fenêtre vide attendue/);
  assert.deepEqual(manquesVue(lu({ noeuds: 0 }), { rien: true }), []);
  assert.deepEqual(manquesVue(lu({ noeuds: 0, texte: 'x' }), { libre: true, textes: [] }), []);
  assert.match(manquesVue(lu({ actifs: ['Dashboard'] }), { onglet: 'Mes routes' })[0], /onglet actif « Mes routes » \(actifs : « Dashboard »\)/);
  assert.match(manquesVue(lu({ infobulles: ['Serveur injoignable'] }), { infobulles: ['Connecté au serveur'] })[0], /infobulle/);
  assert.deepEqual(manquesVue(lu({ url: 'http://127.0.0.1:1/builder/build/7' }), { url: /^\/builder\/build\/\d+$/ }), []);
  assert.match(manquesVue(lu({ url: 'http://127.0.0.1:1/builder/nouveau' }), { url: /^\/builder\/build\/\d+$/ })[0], /adresse vue : \/builder\/nouveau/);
});

test('pages : styles calculés (éditeur de rôle aligné à gauche, constat du 9 nov.) : au moins un élément, chacun avec une valeur permise', () => {
  const ALIGNE = { selecteur: '.ship-role-edit', propriete: 'text-align', valeurs: ['left', 'start'] };
  const vu = (valeurs) => lu({ styles: [{ selecteur: '.ship-role-edit', propriete: 'text-align', valeurs }] });
  assert.deepEqual(manquesVue(vu(['left']), { styles: [ALIGNE] }), []);
  assert.deepEqual(manquesVue(vu(['start', 'left']), { styles: [ALIGNE] }), []);
  assert.deepEqual(manquesVue(vu(['right', 'left', 'right']), { styles: [ALIGNE] }), ['style « .ship-role-edit » : text-align vaut right (attendu : left ou start)']);
  assert.match(manquesVue(vu([]), { styles: [ALIGNE] })[0], /style : aucun élément « \.ship-role-edit »/);
  assert.match(manquesVue(lu(), { styles: [ALIGNE] })[0], /aucun élément/, 'rien relevé');
  // Les vues de l'éditeur de rôle le demandent, Constructeur compris
  const vues = [...Object.values(APP).flatMap((e) => e.vues || []), ...EN_DIRECT.etapes].filter((v) => v.cliquer === '⚑ Rôle');
  assert.ok(vues.length >= 4, `${vues.length} vues`);
  for (const v of vues) assert.deepEqual(v.styles, [ALIGNE]);
  assert.deepEqual(vueAttendue(APP['/builder'].vues[0], 'seances', { cadre: CADRE }).styles, [ALIGNE]);
});

test('pages : relevé anormal (exception, console, navigateur, dialogue, extérieur, HTTP ≥ 400, échec, écriture)', () => {
  const origine = 'http://127.0.0.1:4000';
  const q = (o) => ({ methode: 'GET', statut: 200, echec: null, annule: false, ...o });
  const bilan = {
    exceptions: [{ texte: 'TypeError: x is undefined\n    at …', url: `${origine}/assets/index.js`, ligne: 3 }],
    consoles: [{ type: 'error', texte: 'Warning: oups' }],
    journaux: [{ source: 'network', texte: 'Failed to load resource: 404' }, { source: 'security', texte: 'CSP bloquée' }],
    dialogues: ['confirm : Supprimer ?'],
    plantage: true,
    requetes: [
      q({ url: `${origine}/api/modules/routes/routes/1`, statut: 404 }),
      q({ url: `${origine}/api/modules/waypoints/sweep/top-ores`, statut: 503 }),
      q({ url: `${origine}/api/modules/x`, statut: 500, corps: '{"error":"Erreur interne du serveur."}' }),
      q({ url: 'https://inara.cz/elite/', statut: null, echec: 'net::ERR_PROXY_CONNECTION_FAILED' }),
      q({ url: `${origine}/api/stream`, statut: 200, echec: 'net::ERR_ABORTED', annule: true }),
      q({ url: `${origine}/api/modules/y`, statut: null, echec: 'net::ERR_EMPTY_RESPONSE' }),
      q({ url: `${origine}/api/settings`, methode: 'PUT' }),
      q({ url: 'data:image/svg+xml;base64,AAAA' }),
    ],
  };
  const toleres = [{ requete: 'GET /api/modules/routes/routes/1', statut: 404 }, { requete: 'GET /api/modules/waypoints/sweep/top-ores', statut: 502 }];
  const p = problemesDuReleve(bilan, { origine, toleres });
  const attendus = [
    /^exception : TypeError: x is undefined \(.*index\.js:3\)$/,
    /^erreur de console : Warning: oups$/,
    /^erreur du navigateur \(security\) : CSP bloquée$/,
    /^boîte de dialogue inattendue : confirm : Supprimer \?$/,
    /^onglet planté$/,
    /^HTTP 503 inattendu : GET \/api\/modules\/waypoints\/sweep\/top-ores$/, // toléré en 502, pas en 503
    /^HTTP 500 inattendu : GET \/api\/modules\/x — \{"error":"Erreur interne du serveur\."\}$/,
    /^requête vers l'extérieur : GET https:\/\/inara\.cz\/elite\/$/,
    /^requête en échec : GET \/api\/modules\/y \(net::ERR_EMPTY_RESPONSE\)$/,
    /^écriture à la seule ouverture de la page : PUT \/api\/settings$/,
  ];
  assert.equal(p.length, attendus.length, p.join('\n'));
  for (const [i, re] of attendus.entries()) assert.match(p[i], re);
  // Un parcours qui enregistre a le droit d'écrire
  assert.ok(!problemesDuReleve(bilan, { origine, toleres, lecture: false }).some((x) => x.startsWith('écriture')));
});

test('pages : routes déclarées, et trous entre modules et attendus', () => {
  assert.deepEqual(routesDeclarees(`<Routes><Route index element={<A />} /><Route path="liste" element={<B />} />
    <Route path='plan/:id' element={<C />} /><Route path={\`build/:id\`} /><Route path="*" element={<D />} /></Routes>`), ['', 'liste', 'plan/:id', 'build/:id', '*']);
  const modules = [
    { id: 'routes', chemin: '/routes', hud: false, pagesHud: [] },
    { id: 'combat', chemin: '/combat', hud: true, pagesHud: ['combat-liste'] },
    { id: 'carrier', chemin: null, hud: true, pagesHud: [] },
  ];
  const t = trous({ modules, app: ['/', '/routes', '/routes/:id', '/vieille'], hud: ['combat', 'carrier', 'ancienne'], sous: { '/routes/:id': 'routes', '/routes/liste': 'routes' }, fixes: ['/'], ensemble: ['combat'] });
  assert.deepEqual(t, [
    'page /combat sans attendu (scripts/controle/pages/attendus.mjs, APP)',
    'page /routes/liste sans attendu (scripts/controle/pages/attendus.mjs, APP)',
    "attendu de page /vieille sans page dans l'interface (faute de frappe, ou page retirée ?)",
    'fenêtre /hud/combat-liste sans attendu (scripts/controle/pages/attendus.mjs, HUD)',
    "attendu de fenêtre /hud/ancienne sans fenêtre dans l'interface",
    'fenêtre /hud/combat-liste sans attendu quand toutes sont ouvertes ensemble (attendus.mjs, FENETRES)',
    'fenêtre /hud/carrier sans attendu quand toutes sont ouvertes ensemble (attendus.mjs, FENETRES)',
  ]);
});

test('pages : chaque attendu est complet (route à paramètre ouverte par une adresse ou un parcours, fenêtres ensemble)', () => {
  const modules = [
    ...Object.keys(APP).filter((k) => k !== '/' && !k.includes(':') && k.split('/').length === 2 && !['/parametres', '/page-inconnue'].includes(k))
      .map((k) => ({ id: k.slice(1), titre: k.slice(1), chemin: k, hud: false, pagesHud: [], mode: null })),
  ];
  for (const passe of ['seances', 'vide']) {
    const taches = tachesDeLaPasse(passe, modules);
    assert.ok(taches.length >= Object.keys(APP).length, passe);
    for (const t of taches) {
      assert.ok(t.adresse.startsWith('/'), `${passe} ${t.cle} : adresse ${t.adresse}`);
      assert.ok(!t.adresse.includes(':'), `${passe} ${t.cle} : adresse sans paramètre`);
      if (t.genre === 'page' && !t.cle.includes('navigateur')) assert.ok(t.vue.textes.includes('Elite Compagnon'), `${passe} ${t.cle} : cadre`);
    }
    // Les parcours qui enregistrent passent à la fin : ils ne sont jamais en lecture seule
    assert.ok(taches.filter((t) => t.ecrit).every((t) => t.depuis?.ecrit));
  }
  assert.deepEqual(Object.keys(FENETRES.attendus).sort(), Object.keys(HUD).sort(), 'une attente par fenêtre, ouvertes ensemble');
  assert.deepEqual(vueAttendue({ titre: 'T', textes: ['a'], seances: ['b'], vide: false }, 'vide'), null);
  assert.deepEqual(vueAttendue({ textes: ['a'], seances: { textes: ['b'], rien: true } }, 'seances', { cadre: CADRE }).textes, ['Elite Compagnon', 'CMDR Testeur', 'Solde 710,4 M', 'a', 'b']);
});

test('pages : parcours en direct bien formé (séances connues, une action et une attente par étape, un journal d’abord)', () => {
  const seances = new Set(listerSeances());
  assert.ok(EN_DIRECT.url.startsWith('/'));
  assert.ok(EN_DIRECT.etapes[0].poser, 'la page s’ouvre après la première séance posée');
  for (const [i, e] of EN_DIRECT.etapes.entries()) {
    assert.ok(Boolean(e.poser) !== Boolean(e.cliquer), `étape ${i + 1} : poser une séance OU cliquer`);
    if (e.poser) assert.ok(seances.has(e.poser), `étape ${i + 1} : séance ${e.poser} inconnue`);
    assert.ok((e.textes?.length || 0) + (e.absents?.length || 0) > 0, `étape ${i + 1} : rien à attendre`);
  }
});

test('interface du banc : même proxy que client/vite.config.js, vers le serveur isolé ; port de l’app refusé', async () => {
  const api = 'http://127.0.0.1:41234';
  assert.deepEqual(proxyDuBanc({ '/api': { target: 'http://127.0.0.1:3001', changeOrigin: true } }, api), { '/api': { target: api, changeOrigin: true } });
  assert.deepEqual(proxyDuBanc({ '/api': 'http://127.0.0.1:3001/' }, api), { '/api': { target: api } });
  assert.throws(() => proxyDuBanc({}, api), /plus de proxy \/api/);
  assert.throws(() => proxyDuBanc({ '/api': { target: 'http://127.0.0.1:3001' }, '/ext': { target: 'https://exemple.org' } }, api), /« \/ext » vise https:\/\/exemple\.org/);
  const [m] = decrireModules([{ id: 'colonisation', title: 'Colonisation', path: '/colonisation', Component() {}, Hud() {}, hudPages: { 'colonisation-list': () => null }, hudExtras: { 'colonisation-station': () => null }, mode: { id: 'colonisation', label: 'Colonisation' } }]);
  assert.deepEqual(m, { id: 'colonisation', titre: 'Colonisation', chemin: '/colonisation', hud: true, pagesHud: ['colonisation-list'], pagesExtras: ['colonisation-station'], nav: true, mode: 'Colonisation', modeId: 'colonisation', permanent: false });
  for (const port of [3001, 5173, 80, 70000, '4000']) {
    await assert.rejects(demarrerServeur({ portInterface: port }), /Port d'interface refusé/, String(port));
    await assert.rejects(servirClient({ client: {}, api, port }), /Port d'interface refusé/, String(port));
  }
  await assert.rejects(servirClient({ client: {}, api: 'http://localhost:3001', port: 41235 }), /Serveur isolé attendu/);
});

test('pont de l’overlay simulé : mêmes fonctions que overlay/preload.js, canal inconnu refusé', () => {
  const vraies = fonctionsDuPreload(fs.readFileSync(PRELOAD, 'utf8'));
  assert.ok(vraies.length >= 10, `${vraies.length} fonctions`);
  assert.ok(vraies.some((f) => f.nom === 'isShown' && f.genre === 'invoke' && f.canal === 'window-shown'));
  assert.deepEqual(pasDuMain(fs.readFileSync(MAIN, 'utf8')), { capture: 10 });
  const script = scriptPont();
  for (const f of vraies) assert.ok(script.includes(`    ${f.nom}: `), f.nom);
  const faux = "contextBridge.exposeInMainWorld('eliteOverlay', {\n  nouveau: () => ipcRenderer.invoke('canal-inconnu'),\n});";
  assert.throws(() => scriptPont({ preload: faux }), /nouveau canal « canal-inconnu »/);
  assert.throws(() => fonctionsDuPreload("contextBridge.exposeInMainWorld('eliteOverlay', {\n  bizarre: function () { return 1; },\n});"), /forme inattendue/);
});

test('Chrome sans fenêtre : chaque défaut d’une page piégée est vu, horloge et pont en place, rien ne reste', { skip: !trouverChrome() && 'Chrome introuvable', timeout: 90_000 }, async () => {
  const PAGE = `<!doctype html><meta charset="utf-8"><div id="root"><h1>Piège</h1><p id="t"></p><table><tr><td style="text-align:right"><form class="aligne"></form><form class="aligne" style="text-align:left"></form></td></tr></table></div><script>
    document.getElementById('t').textContent = 'Heure ' + new Date().toISOString() + ' · pont ' + typeof window.eliteOverlay;
    console.error('erreur voulue');
    fetch('/api/absent');
    fetch('/api/ecrit', { method: 'POST' });
    fetch('https://exemple.invalid/fuite').catch(() => {});
    window.eliteOverlay?.isShown('liste').then((v) => { document.getElementById('t').textContent += ' · montrée ' + v; });
    setTimeout(() => { throw new Error('exception voulue'); }, 50);
  </script>`;
  const serveur = http.createServer((req, res) => {
    if (req.url === '/') return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE);
    if (req.url === '/favicon.ico') return res.writeHead(204).end();
    res.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"absent"}');
  });
  serveur.listen(0, '127.0.0.1');
  await once(serveur, 'listening');
  const origine = `http://127.0.0.1:${serveur.address().port}`;
  const chrome = await lancerChrome();
  let fin;
  try {
    const onglet = await chrome.onglet({ largeur: 800, hauteur: 600, scripts: [scriptHorloge('2026-11-07T14:23:13Z'), scriptPont()] });
    const page = await onglet.ouvrir(`${origine}/`);
    const { manque, lu: vu } = await page.attendre((l) => manquesVue(l, { titre: 'Piège', textes: ['montrée true'] }), { delaiMs: 10_000, styles: [{ selecteur: '.aligne', propriete: 'text-align' }] });
    assert.deepEqual(manque, []);
    assert.deepEqual(vu.styles, [{ selecteur: '.aligne', propriete: 'text-align', valeurs: ['right', 'left'] }], 'style calculé, hérité compris');
    assert.match(vu.texte, /Heure 2026-11-07T14:23:1\d\.\d{3}Z · pont object/, 'horloge figée, pont simulé');
    await page.attendre(() => [], { delaiMs: 3000, calmeMs: 300 });
    const bilan = await page.quitter();
    const p = problemesDuReleve(bilan, { origine });
    assert.ok(p.some((x) => /^exception : .*exception voulue/.test(x)), p.join('\n'));
    assert.ok(p.includes('erreur de console : erreur voulue'), p.join('\n'));
    assert.ok(p.some((x) => x.startsWith('HTTP 404 inattendu : GET /api/absent')), p.join('\n'));
    assert.ok(p.some((x) => x.startsWith('HTTP 404 inattendu : POST /api/ecrit')), p.join('\n'));
    assert.ok(p.includes('écriture à la seule ouverture de la page : POST /api/ecrit'), p.join('\n'));
    assert.ok(p.includes("requête vers l'extérieur : GET https://exemple.invalid/fuite"), p.join('\n'));
    const fuite = bilan.requetes.find((q) => q.url.startsWith('https://exemple.invalid'));
    assert.ok(fuite.echec && !fuite.statut, `la requête vers l'extérieur n'aboutit jamais (${fuite.echec})`);
    await onglet.fermer();
  } finally {
    fin = await chrome.fermer();
    serveur.close();
  }
  assert.equal(fin.efface, true, 'profil temporaire effacé');
  assert.equal(fs.existsSync(fin.profil), false);
  assert.throws(() => process.kill(chrome.pid, 0), 'Chrome arrêté');
});

test('modes de jeu : la déclaration commune et les modules clients concordent, chaque écart est nommé', () => {
  // Modules clients tels que decrireModules les décrit, faits d'après la déclaration : tout concorde
  const modules = MODES.map((m) => ({ id: m.id, titre: m.label, chemin: `/${m.id}`, hud: m.windows[0] === m.id, pagesHud: m.windows.slice(m.windows[0] === m.id ? 1 : 0), nav: true, mode: m.label, modeId: m.id, permanent: false }));
  modules.push({ id: 'glance', titre: "Coup d'œil", chemin: '/coup-doeil', hud: true, pagesHud: [], nav: false, mode: null, modeId: null, permanent: true });
  assert.deepEqual(concordanceModes(modules, MODES), []);
  const sans = modules.filter((m) => m.id !== 'rescue');
  assert.match(concordanceModes(sans, MODES).join('\n'), /mode « rescue » déclaré dans server\/src\/core\/modes\.js, mais aucun module client/);
  const fenetre = modules.map((m) => (m.id === 'waypoints' ? { ...m, pagesHud: [...m.pagesHud, 'waypoints-nouvelle'] } : m));
  assert.match(concordanceModes(fenetre, MODES).join('\n'), /mode waypoints : fenêtres déclarées \[waypoints, .*\], module client \[.*waypoints-nouvelle\]/);
  const enDur = [...modules, { id: 'exploration', titre: 'Exploration', chemin: '/exploration', hud: true, pagesHud: [], nav: true, mode: 'Exploration', modeId: null, permanent: false }];
  assert.match(concordanceModes(enDur, MODES).join('\n'), /module exploration : mode écrit en dur/);
  const autre = modules.map((m) => (m.id === 'combat' ? { ...m, modeId: 'rescue' } : m));
  assert.match(concordanceModes(autre, MODES).join('\n'), /modeInfo\('rescue'\) renvoie au mode d'un autre module/);
  const sansPage = modules.map((m) => (m.id === 'materials' ? { ...m, chemin: null } : m));
  assert.match(concordanceModes(sansPage, MODES).join('\n'), /module materials : un mode de jeu a besoin d'une page/);
});
