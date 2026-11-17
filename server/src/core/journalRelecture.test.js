// Relecture de l'historique sans geler le serveur (audit M10) : elle se fait par morceaux, avec des pauses où le
// serveur répond aux requêtes ; un changement de dossier dans Paramètres répond tout de suite, et une relecture
// abandonnée (nouveau dossier, arrêt) ne publie jamais « ready ». Journaux factices dans un dossier temporaire.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JournalService, MORCEAU_OCTETS } from './journalService.js';

const T = (i) => new Date(Date.UTC(2026, 10, 8, 12) + i * 1000).toISOString();
const ligne = (o) => `${JSON.stringify(o)}\r\n`;

/** Dossier de `fichiers` journaux de `parFichier` arrimages chacun (noms de station accentués, assez longs). */
function dossier(fichiers, parFichier, systeme = 'Système Test') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-relecture-'));
  let n = 0;
  for (let f = 0; f < fichiers; f++) {
    const debut = new Date(Date.UTC(2026, 10, 8, 12) + f * 3_600_000).toISOString();
    const nom = `Journal.${debut.slice(0, 10)}T${debut.slice(11, 19).replace(/:/g, '')}.01.log`;
    const lignes = [ligne({ timestamp: debut, event: 'Fileheader', part: 1 })];
    for (let i = 0; i < parFichier; i++) {
      lignes.push(ligne({ timestamp: T(n), event: 'Docked', StarSystem: systeme, StationName: `Échange Été ${n} ${'é'.repeat(40)}` }));
      lignes.push(ligne({ timestamp: T(n), event: 'Music', MusicTrack: 'x'.repeat(60) })); // non demandé : sauté
      n++;
    }
    fs.writeFileSync(path.join(dir, nom), lignes.join(''));
  }
  return { dir, total: n };
}

test('relecture par morceaux : le serveur reprend la main entre deux morceaux, rien n’est perdu ni coupé', async () => {
  // Environ 4 Mo par journal : plusieurs morceaux par fichier, coupés en fin de ligne au milieu de lettres accentuées
  const { dir, total } = dossier(3, 16_000);
  const taille = fs.readdirSync(dir).reduce((s, f) => s + fs.statSync(path.join(dir, f)).size, 0);
  assert.ok(taille > 6 * MORCEAU_OCTETS, 'assez gros pour plusieurs morceaux');
  const svc = new JournalService();
  svc.addInterest(['Docked']);
  let history = null;
  svc.on('ready', (r) => (history = r.history));
  let tours = 0;
  let arret = false;
  const compter = () => {
    if (arret) return;
    tours++;
    setImmediate(compter);
  };
  try {
    const fin = svc.start(dir);
    assert.equal(history, null, 'start() rend la main avant toute lecture');
    assert.equal(svc.ready, false);
    setImmediate(compter);
    await fin;
    arret = true;
    assert.ok(tours >= 6, `la boucle d’événements a tourné pendant la relecture (${tours} tours)`);
    assert.equal(svc.ready, true);
    assert.equal(history.length, total, 'chaque arrimage, une fois');
    assert.ok(history.every((ev, i) => ev.StationName === `Échange Été ${i} ${'é'.repeat(40)}`), 'dans l’ordre, lettres intactes');
    assert.ok(svc.timer, 'suivi en direct lancé après « ready »');
    // Suivi repris à la fin du dernier journal : une nouvelle ligne arrive en direct, l'historique n'est pas republié
    const direct = [];
    svc.on('event', (ev) => direct.push(ev.StationName));
    const dernier = fs.readdirSync(dir).sort().pop();
    fs.appendFileSync(path.join(dir, dernier), ligne({ timestamp: T(total), event: 'Docked', StationName: 'Nouvelle' }));
    svc.tick();
    assert.deepEqual(direct, ['Nouvelle']);
  } finally {
    arret = true;
    svc.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('nouveau dossier pendant une relecture : la première est abandonnée, un seul « ready », celui du nouveau', async () => {
  const a = dossier(2, 8_000, 'Système Ancien');
  const b = dossier(1, 10, 'Système Test');
  const svc = new JournalService();
  svc.addInterest(['Docked']);
  const recus = [];
  svc.on('ready', ({ history }) => recus.push(history.map((e) => e.StarSystem)));
  try {
    const premiere = svc.start(a.dir);
    await new Promise((r) => setImmediate(r)); // la première a commencé à lire
    const seconde = svc.start(b.dir);
    await Promise.all([premiere, seconde]);
    assert.equal(recus.length, 1);
    assert.equal(recus[0].length, 10);
    assert.ok(recus[0].every((s) => s === 'Système Test'));
    assert.equal(path.dirname(svc.file), b.dir, 'journal suivi : celui du nouveau dossier');
    // Rien de l'ancienne lecture n'arrive plus tard
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(recus.length, 1);
  } finally {
    svc.stop();
    fs.rmSync(a.dir, { recursive: true, force: true });
    fs.rmSync(b.dir, { recursive: true, force: true });
  }
});

test('arrêt pendant une relecture : pas de « ready », pas de suivi qui repart', async () => {
  const { dir } = dossier(2, 8_000);
  const svc = new JournalService();
  svc.addInterest(['Docked']);
  let ready = 0;
  svc.on('ready', () => ready++);
  try {
    const fin = svc.start(dir);
    await new Promise((r) => setImmediate(r));
    svc.stop();
    await fin;
    assert.equal(ready, 0);
    assert.equal(svc.timer, null);
  } finally {
    svc.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('dossier introuvable : « ready » vide publié après l’appel, erreur claire, nouvel essai programmé', async () => {
  const svc = new JournalService();
  let history = null;
  svc.on('ready', (r) => (history = r.history));
  try {
    const fin = svc.start(path.join(os.tmpdir(), 'elite-relecture-absent-xyz'));
    assert.equal(history, null, 'rien pendant l’appel');
    await fin;
    assert.deepEqual(history, []);
    assert.match(svc.error, /^Dossier introuvable/);
    assert.ok(svc.timer);
  } finally {
    svc.stop();
  }
});

test('« ready » remis un module par tour : le serveur répond entre deux modules, « pret » une fois tous passés', async () => {
  const { dir } = dossier(1, 10);
  const svc = new JournalService();
  svc.addInterest(['Docked']);
  const suite = [];
  // Premier module : une « requête » arrive pendant qu'il réduit l'historique ; elle passe avant le module suivant
  svc.on('ready', () => {
    suite.push('module 1');
    setImmediate(() => suite.push(`requête (${svc.info().ready})`)); // GET /api/state : pas encore prêt
  });
  svc.on('ready', () => {
    throw new Error('bogue au démarrage'); // isolé : les suivants le reçoivent quand même
  });
  svc.once('ready', ({ history }) => suite.push(`module 3 (${history.length})`));
  svc.on('pret', () => suite.push(`pret (${svc.ready})`));
  const erreur = console.error;
  console.error = () => {};
  try {
    await svc.start(dir);
    assert.deepEqual(suite, ['module 1', 'requête (false)', 'module 3 (10)', 'pret (true)']);
    assert.equal(svc.listenerCount('ready'), 2, 'écouteur « once » retiré après son passage');
    assert.ok(svc.timer, 'suivi en direct lancé une fois tous les modules passés');
  } finally {
    console.error = erreur;
    svc.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('arrêt pendant la remise aux modules : les suivants ne reçoivent rien, pas de « pret », pas de suivi', async () => {
  const { dir } = dossier(1, 10);
  const svc = new JournalService();
  svc.addInterest(['Docked']);
  const suite = [];
  svc.on('ready', () => {
    suite.push('module 1');
    svc.stop(); // dossier changé ou serveur arrêté pendant ce module
  });
  svc.on('ready', () => suite.push('module 2'));
  svc.on('pret', () => suite.push('pret'));
  try {
    await svc.start(dir);
    assert.deepEqual(suite, ['module 1']);
    assert.equal(svc.timer, null);
  } finally {
    svc.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('dossier introuvable : « pret » publié aussi (le client recharge ses pages)', async () => {
  const svc = new JournalService();
  let pret = 0;
  svc.on('pret', () => pret++);
  try {
    await svc.start(path.join(os.tmpdir(), 'elite-relecture-absent-xyz'));
    assert.equal(pret, 1);
  } finally {
    svc.stop();
  }
});

test('« journal:ready » diffusé au client sur « pret », une fois l’historique remis à tous les modules', () => {
  const src = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.match(src, /journal\.on\('pret', \(\) => broadcast\('journal:ready', journal\.info\(\)\)\)/);
  assert.equal(src.match(/broadcast\('journal:ready'/g).length, 1);
});

test('PUT /api/settings ne relit jamais l’historique dans la requête ; le démarrage l’attend avant d’ouvrir le port', () => {
  const src = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  const put = src.slice(src.indexOf("app.put('/api/settings'"), src.indexOf("app.get('/api/overlay'"));
  assert.match(put, /journal\.start\(journalDir\(after\.journalPath\)\)/);
  assert.doesNotMatch(put, /await journal\.start/, 'la réponse part sans attendre la relecture');
  const demarrage = src.indexOf('await journal.start(journalFolder)');
  assert.ok(demarrage > 0 && demarrage < src.indexOf('app.listen('), 'historique relu avant l’ouverture du port');
});
