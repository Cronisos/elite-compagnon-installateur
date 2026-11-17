// Gardes de l'overlay (guards.js), sans Electron : adresse de l'interface, requêtes et navigations permises, messages
// du seul cadre principal, geste de l'utilisateur, ordres qui se croisent, console d'Electron 33 et 35, et surveillance
// de l'app (fenêtres cachées quand l'app ne répond plus, overlay arrêté au bout de 5 min).

const test = require('node:test');
const assert = require('node:assert/strict');
const guards = require('./guards.js');

const { UI_ORIGIN, allowedNavigation, allowedRequest, consoleEntry, fromMainFrame, orderTime, pageUrl, pointInside, samePage, staleOrder, userGesture, watchApp } = guards;

test('adresse de l’interface : 127.0.0.1:5173, jamais « localhost »', () => {
  assert.equal(UI_ORIGIN, 'http://127.0.0.1:5173');
  assert.equal(guards.UI_HOST, '127.0.0.1:5173');
  assert.equal(pageUrl('glance'), 'http://127.0.0.1:5173/hud/glance');
});

test('adresse du banc : seulement http://127.0.0.1:<port>, jamais un autre hôte', () => {
  for (const o of ['http://localhost:5899', 'https://127.0.0.1:5899', 'http://127.0.0.1:80', 'http://127.0.0.1:70000', 'http://evil.example:5899', 'http://127.0.0.1:5899/']) {
    assert.throws(() => guards.setUiOriginForTest(o), /Interface du banc attendue/, o);
  }
  assert.equal(guards.UI_ORIGIN, 'http://127.0.0.1:5173', 'inchangée après un refus');
});

test('navigation : seulement le rechargement de la même adresse', () => {
  assert.equal(allowedNavigation('http://127.0.0.1:5173/hud/glance', 'http://127.0.0.1:5173/hud/glance'), true);
  for (const t of ['http://127.0.0.1:5173/hud/combat', 'http://127.0.0.1:5173/hud/glance#x', 'http://localhost:5173/hud/glance', 'about:blank', 'mailto:x@example.invalid', undefined, null]) {
    assert.equal(allowedNavigation(t, 'http://127.0.0.1:5173/hud/glance'), false, String(t));
  }
});

test('requêtes : http et ws vers 127.0.0.1:5173 seulement', () => {
  for (const u of ['http://127.0.0.1:5173/hud/combat', 'ws://127.0.0.1:5173/', 'http://127.0.0.1:5173/api/stream', 'http://127.0.0.1:5173/src/core/streamWorker.js?worker_file&type=module']) assert.equal(allowedRequest(u), true, u);
  for (const u of ['https://127.0.0.1:5173/', 'wss://127.0.0.1:5173/', 'http://127.0.0.1:5173.evil.example/', 'http://localhost:5173/', 'http://[::1]:5173/', 'http://127.0.0.1:5174/', 'http://127.0.0.1:3001/api/state', 'http://user:pass@127.0.0.1:5173/', 'file:///C:/Windows/win.ini', 'data:text/html,x', 'devtools://x', 'mailto:x@example.invalid', 'pas une adresse', '', null]) {
    assert.equal(allowedRequest(u), false, String(u));
  }
});

test('pont : seulement le cadre principal, à l’adresse de la fenêtre', () => {
  const url = 'http://127.0.0.1:5173/hud/combat';
  const mainFrame = { url };
  const wc = { mainFrame };
  assert.equal(fromMainFrame({ senderFrame: mainFrame }, wc, url), true);
  assert.equal(fromMainFrame({ senderFrame: { ...mainFrame, url: `${url}?x=1#y` } }, wc, url), false, 'un autre objet cadre');
  assert.equal(fromMainFrame({ senderFrame: { url } }, wc, url), false, 'cadre inclus à la même adresse');
  assert.equal(fromMainFrame({ senderFrame: null }, wc, url), false, 'cadre détaché ou inconnu');
  assert.equal(fromMainFrame({}, wc, url), false);
  assert.equal(fromMainFrame({ senderFrame: mainFrame }, {}, url), false);
  mainFrame.url = 'http://127.0.0.1:5173/hud/glance';
  assert.equal(fromMainFrame({ senderFrame: mainFrame }, wc, url), false, 'cadre principal parti sur une autre page');
  mainFrame.url = `${url}?x=1#y`;
  assert.equal(fromMainFrame({ senderFrame: mainFrame }, wc, url), true, 'même page (recherche et ancre ignorées)');
  assert.equal(samePage('http://127.0.0.1:5173/hud/combat', 'http://localhost:5173/hud/combat'), false);
  assert.equal(samePage('pas une adresse', url), false);
});

test('geste de l’utilisateur : fenêtre affichée et curseur sur elle, ou mode souris', () => {
  const bounds = { x: 100, y: 50, width: 400, height: 120 };
  assert.equal(userGesture({ shown: true, mouseMode: false, cursor: { x: 300, y: 100 }, bounds }), true);
  assert.equal(userGesture({ shown: true, mouseMode: false, cursor: { x: 95, y: 45 }, bounds }), true, 'bord du bouton, à 8 px près');
  assert.equal(userGesture({ shown: true, mouseMode: false, cursor: { x: 900, y: 600 }, bounds }), false, 'souris ailleurs');
  assert.equal(userGesture({ shown: false, mouseMode: false, cursor: { x: 300, y: 100 }, bounds }), false, 'fenêtre cachée');
  assert.equal(userGesture({ shown: false, mouseMode: true, cursor: { x: 300, y: 100 }, bounds }), false, 'cachée, même en mode souris');
  assert.equal(userGesture({ shown: true, mouseMode: true, cursor: { x: 900, y: 600 }, bounds }), true, 'mode souris : clavier possible');
  assert.equal(pointInside({ x: NaN, y: 1 }, bounds), false);
  assert.equal(pointInside(null, bounds), false);
});

test('ordres qui se croisent : le plus ancien arrivé en dernier est écarté ; sans heure ou horloge changée, appliqué', () => {
  assert.equal(orderTime(['electron', '.', '--only=combat', '--at=1700000000123']), 1700000000123);
  for (const argv of [['--only=combat'], ['--at='], ['--at=-5'], ['--at=1e9'], ['--at=12x'], ['--at=1234567890123456']]) assert.equal(orderTime(argv), null, argv.join(' '));
  assert.equal(staleOrder(1000, 2000), true, 'parti 1 s avant le dernier appliqué');
  assert.equal(staleOrder(2000, 1000), false);
  assert.equal(staleOrder(2000, 2000), false);
  assert.equal(staleOrder(null, 2000), false, 'npm run overlay, à la main');
  assert.equal(staleOrder(1000, null), false, 'premier ordre');
  assert.equal(staleOrder(1000, 1000 + guards.ORDER_CROSSING_MS), false, 'horloge reculée : appliqué');
});

test('console des pages : forme d’Electron 33 (niveau 3) et d’Electron 35 et plus (event.level « error »)', () => {
  assert.deepEqual(consoleEntry({}, 3, 'boum'), { error: true, message: 'boum' });
  assert.deepEqual(consoleEntry({}, 2, 'avertissement'), { error: false, message: 'avertissement' });
  assert.deepEqual(consoleEntry({ level: 'error', message: 'boum 35' }, 3, 'boum 35'), { error: true, message: 'boum 35' });
  assert.deepEqual(consoleEntry({ level: 'warning', message: 'w' }, 3, 'w'), { error: false, message: 'w' }, 'le niveau de l’événement prime');
  assert.deepEqual(consoleEntry({ level: 'error', message: 'seul' }), { error: true, message: 'seul' }, 'sans arguments dépréciés');
  assert.deepEqual(consoleEntry(undefined, undefined, undefined), { error: false, message: '' });
});

// --- Surveillance de l'app ---

function horloge() {
  let t = 0;
  return { now: () => t, avancer: (ms) => (t += ms) };
}

test('app qui ne répond plus : fenêtres cachées au bout de 30 s, réaffichées à son retour', async () => {
  const h = horloge();
  let repond = true;
  const notes = [];
  const w = watchApp({ check: async () => repond, onDown: () => notes.push('cachées'), onUp: () => notes.push('montrées'), onGone: () => notes.push('arrêt'), now: h.now, setTimer: () => null, clearTimer: () => {} });
  await w.tick();
  repond = false;
  h.avancer(10_000);
  await w.tick();
  h.avancer(10_000);
  await w.tick();
  assert.deepEqual(notes, [], 'pas avant 30 s');
  h.avancer(10_000);
  await w.tick();
  assert.deepEqual(notes, ['cachées']);
  h.avancer(10_000);
  await w.tick();
  assert.deepEqual(notes, ['cachées'], 'une seule fois');
  repond = true;
  await w.tick();
  assert.deepEqual(notes, ['cachées', 'montrées']);
});

test('app disparue depuis 5 min : l’overlay s’arrête ; une vérification qui lève compte comme « ne répond pas »', async () => {
  const h = horloge();
  const notes = [];
  const w = watchApp({ check: async () => { throw new Error('ECONNREFUSED'); }, onDown: () => notes.push('cachées'), onGone: () => notes.push('arrêt'), now: h.now, setTimer: () => null, clearTimer: () => {} });
  for (let i = 0; i < 31; i++) {
    h.avancer(10_000);
    await w.tick();
  }
  assert.deepEqual(notes, ['cachées', 'arrêt']);
});

test('ordre --if-running (fermer une fenêtre de module, remettre en ordre) : jamais un lancement de l’overlay', () => {
  const { ifRunning, startupAction } = guards;
  assert.equal(ifRunning(['electron', '.', '--only=combat', '--at=1', '--if-running']), true);
  assert.equal(ifRunning(['electron', '.', '--only=combat']), false);
  assert.equal(ifRunning(null), false);
  // Aucun overlay ne tournait (verrou pris par ce lancement) : il s'arrête sans rien ouvrir
  assert.equal(startupAction({ locked: true, only: ['combat', 'navroute'], ifRunning: true }), 'arreter');
  assert.equal(startupAction({ locked: true, only: [], ifRunning: false }), 'arreter', 'liste vide : rien à fermer');
  // Un overlay tourne : il reçoit l'ordre, quel qu'il soit
  assert.equal(startupAction({ locked: false, only: ['combat'], ifRunning: true }), 'transmettre');
  assert.equal(startupAction({ locked: false, only: [], ifRunning: false }), 'transmettre');
  // Choix du joueur (mode, fenêtre d'un module qui s'ouvre) : l'overlay s'ouvre
  assert.equal(startupAction({ locked: true, only: ['combat'], ifRunning: false }), 'demarrer');
  assert.equal(startupAction({ locked: true, only: undefined }), 'demarrer', 'npm run overlay -- --page=…');
});

test('overlay toujours actif (app de bureau) : --rester le fait démarrer même sans fenêtre', () => {
  const { startupAction } = require('./guards.js');
  assert.equal(startupAction({ locked: true, only: [] }), 'arreter');
  assert.equal(startupAction({ locked: true, only: [], rester: true }), 'demarrer');
  assert.equal(startupAction({ locked: false, only: [], rester: true }), 'transmettre');
});

test('port de l’interface : ELITE_UI_PORT (1024 à 65535) passé par l’app de bureau, sinon 5173 ; jamais un autre hôte', () => {
  assert.equal(guards.uiPortFrom({}), 5173);
  assert.equal(guards.uiPortFrom({ ELITE_UI_PORT: '5174' }), 5174);
  for (const v of ['', '80', '70000', 'abc', '5174; x', 'evil.example:5174', '-1']) assert.equal(guards.uiPortFrom({ ELITE_UI_PORT: v }), 5173, v);
});

test('cadre de la fenêtre principale : seulement la démonstration d’une fenêtre en jeu, sur l’interface', () => {
  const g = require('./guards.js');
  const ui = `http://${g.UI_HOST}`;
  for (const oui of ['/hud/waypoints?demo=1', '/hud/waypoints-sweep?demo', '/hud/glance?x=1&demo=1']) assert.equal(g.demoFrame(ui + oui), true, oui);
  for (const non of ['/hud/waypoints', '/?demo=1', '/escadron?demo=1', '/hud/a/b?demo=1', '/hud/?demo=1', '/api/state?demo=1', '/hud/WAYPOINTS?demo=1']) assert.equal(g.demoFrame(ui + non), false, non);
  for (const ailleurs of ['https://evil.example/hud/waypoints?demo=1', 'http://127.0.0.1:9999/hud/waypoints?demo=1', 'http://user@' + g.UI_HOST + '/hud/waypoints?demo=1', 'file:///hud/waypoints?demo=1', 'pas une adresse']) {
    assert.equal(g.demoFrame(ailleurs), false, ailleurs);
  }
});
