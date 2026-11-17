// Actions de l'IA de bord : retrouver un repère malgré les fautes, guider la boussole (mode ouvert, interface
// réaffichée), changer de mode, cacher l'interface, ouvrir une page ; arguments du modèle bien passés.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { actions, chargerPages, chercherReperes, distance, repereCourt } from './actions.js';
import { argumentsDe, definitions, executer } from './outils.js';
import { repondre } from './conversation.js';
import { windowsOf } from '../../core/modes.js';

const REPERES = [
  { id: 18, label: 'Iridiul + 3 or', siteNumber: 25, drills: 3, body: 'Système Test 4', system: 'Système Test', depletedAt: '2026-11-07T11:00:00Z', createdAt: '2026-11-06T10:00:00Z', notes: '25 emplacements sur la planète' },
  { id: 25, label: 'Iridium', siteNumber: 25, drills: 2, body: 'Système Test 4', system: 'Système Test', createdAt: '2026-11-07T10:00:00Z', notes: '' },
  { id: 4, label: 'iridim', siteNumber: 5, drills: 4, body: 'Planète Test 1', system: 'Autre Test', createdAt: '2026-10-20T10:00:00Z' },
  { id: 5, label: 'Platine', siteNumber: 5, drills: 4, body: 'Planète Test 1', system: 'Autre Test', createdAt: '2026-10-21T10:00:00Z' },
  { id: 47, label: 'Tritium', siteNumber: 8, drills: 4, body: 'Système Test 10 a', system: 'Système Test', createdAt: '2026-11-11T18:00:00Z' },
];

test('actions : recherche de repères (fautes, numéros d’emplacement et de forages, mots parasites)', () => {
  assert.equal(distance('iridium', 'iridiul'), 1);
  const ids = (q) => chercherReperes(REPERES, q).map((w) => w.id);
  // La demande de l’auteur, transcrite au micro : « ELP 25 » pour « emplacement 25 », « 3 » forages
  assert.deepEqual(ids('dans l’ELP 25, là où j’avais miné l’iridium, j’en avais trouvé 3'), [18]);
  assert.deepEqual(ids('iridium'), [25, 18, 4]); // « iridim », « Iridiul » : fautes de frappe des repères
  assert.deepEqual(ids('platine'), [5]);
  assert.deepEqual(ids('zzz'), []);
  assert.deepEqual(ids(''), [47, 25, 18, 5, 4]); // sans recherche : les plus récents
  assert.deepEqual(repereCourt(REPERES[0]), {
    id: 18, nom: 'Iridiul + 3 or', emplacement: 25, forages: 3, corps: 'Système Test 4', systeme: 'Système Test', epuise: true, note: '25 emplacements sur la planète', date: '2026-11-06',
  });
});

/** App simulée : lectures et écritures notées. */
function fausseApp({ mode = 'combat', cache = false, glance = true, installed = true } = {}) {
  const ecrits = [];
  const lire = async (chemin) => ({
    '/api/modules/waypoints/waypoints': REPERES,
    '/api/overlay': { mode, glance, installed },
    '/api/bureau': { bureau: true, cache },
  })[chemin] ?? null;
  const agir = async (chemin, { method = 'POST', body } = {}) => {
    ecrits.push([method, chemin, body]);
    return { ok: true };
  };
  return { lire, agir, ecrits };
}
const outil = (nom, pages) => actions({ pages }).find((o) => o.nom === nom);

test('actions : guider vers un repère ouvre le Minage Rhino, pose la boussole, réaffiche l’interface cachée', async () => {
  const app = fausseApp({ mode: 'combat', cache: true });
  const r = await outil('guider_vers_repere').lire(app.lire, { id: 18 }, app.agir);
  assert.equal(r.fait, true);
  assert.equal(r.boussole_vers.id, 18);
  assert.equal(r.mode_ouvert, 'Minage Rhino');
  assert.equal(r.interface_reaffichee, true);
  assert.deepEqual(app.ecrits, [
    ['PUT', '/api/overlay', { mode: 'waypoints', glance: true, pages: [...windowsOf('waypoints'), 'glance'] }],
    ['PUT', '/api/modules/waypoints/guide-target', { id: 18 }],
    ['POST', '/api/bureau/cacher', { cacher: false }],
  ]);
  // Déjà en Minage Rhino, interface visible : seulement la boussole
  const deja = fausseApp({ mode: 'waypoints' });
  await outil('guider_vers_repere').lire(deja.lire, { id: 25 }, deja.agir);
  assert.deepEqual(deja.ecrits, [['PUT', '/api/modules/waypoints/guide-target', { id: 25 }]]);
  // Repère inconnu : rien d'écrit, une erreur pour le modèle
  const rien = fausseApp();
  assert.match((await outil('guider_vers_repere').lire(rien.lire, { id: 999 }, rien.agir)).erreur, /chercher_reperes/);
  assert.deepEqual(rien.ecrits, []);
});

test('actions : mode, « aucun », overlay absent ; interface cachée ou affichée ; arrêt du guidage', async () => {
  const app = fausseApp({ glance: false });
  assert.deepEqual(await outil('changer_mode').lire(app.lire, { mode: 'shipmining' }, app.agir), { fait: true, mode: 'Minage vaisseau' });
  assert.deepEqual(await outil('changer_mode').lire(app.lire, { mode: 'aucun' }, app.agir), { fait: true, mode: 'aucun' });
  assert.match((await outil('changer_mode').lire(app.lire, { mode: 'pirate' }, app.agir)).erreur, /inconnu/);
  assert.deepEqual(app.ecrits.map((e) => e[2]), [{ mode: 'shipmining', glance: false, pages: ['shipmining'] }, { mode: null, glance: false, pages: [] }]);
  const sans = fausseApp({ installed: false });
  assert.match((await outil('changer_mode').lire(sans.lire, { mode: 'combat' }, sans.agir)).erreur, /overlay/);
  const i = fausseApp();
  await outil('interface').lire(i.lire, { action: 'cacher' }, i.agir);
  await outil('arreter_guidage').lire(i.lire, {}, i.agir);
  assert.deepEqual(i.ecrits, [['POST', '/api/bureau/cacher', { cacher: true }], ['PUT', '/api/modules/waypoints/guide-target', { id: null }]]);
  assert.match((await outil('interface').lire(i.lire, { action: 'exploser' }, i.agir)).erreur, /cacher ou afficher/);
});

test('actions : pages de l’app (plan de l’interface) ouvertes par leur id, chemins acceptés par l’app de bureau', async () => {
  const pages = await chargerPages();
  assert.ok(pages.length > 20 && pages.some((p) => p.id === 'minage-rhino' && p.chemin === '/reperes'));
  const { cheminNavigable } = createRequire(import.meta.url)('../../../../desktop/etat.js');
  for (const p of pages) assert.equal(cheminNavigable(p.chemin), p.chemin, `page refusée par l’app de bureau : ${p.chemin}`);
  const app = fausseApp();
  assert.deepEqual(await outil('ouvrir_page', pages).lire(app.lire, { page: 'minage-rhino' }, app.agir), { fait: true, page: 'Minage Rhino' });
  assert.deepEqual(app.ecrits, [['POST', '/api/bureau/ouvrir', { chemin: '/reperes' }]]);
  assert.equal(outil('ouvrir_page', []), undefined); // sans plan : pas d'outil
  assert.deepEqual(await chargerPages(async () => { throw new Error('absent'); }), []);
});

test('actions : paramètres déclarés au modèle, arguments (objet ou texte JSON) passés à l’outil', async () => {
  const defs = definitions(actions());
  assert.deepEqual(defs.find((d) => d.function.name === 'guider_vers_repere').function.parameters.required, ['id']);
  assert.deepEqual(argumentsDe('{"id": 18}'), { id: 18 });
  assert.deepEqual(argumentsDe('n’importe quoi'), {});
  const app = fausseApp({ mode: 'waypoints' });
  const r = JSON.parse(await executer('guider_vers_repere', app.lire, actions(), '{"id":18}', app.agir));
  assert.equal(r.fait, true);
  // Une conversation : le modèle cherche, guide, puis répond ; la consigne lui dit qu'il peut agir
  const tours = [
    { message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'chercher_reperes', arguments: { recherche: 'iridium 25 3' } } }] } },
    { message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'guider_vers_repere', arguments: { id: 18 } } }] } },
    { message: { role: 'assistant', content: 'Boussole sur l’iridium de l’emplacement 25.' } },
  ];
  const vus = [];
  const chat = async (messages) => {
    vus.push(messages.map((m) => m.content)); // copie : la liste continue de grandir
    return tours.shift();
  };
  const conv = fausseApp({ mode: 'waypoints' });
  const fin = await repondre({ question: 'Guide-moi vers l’iridium 25', chat, lire: conv.lire, agir: conv.agir, outils: actions() });
  assert.deepEqual(fin.appels, ['chercher_reperes', 'guider_vers_repere']);
  assert.match(vus[0][0], /Tu PEUX agir sur l’app/);
  assert.match(vus[1].at(-1), /"id":18/); // résultat de la recherche, donné au modèle
  assert.deepEqual(conv.ecrits, [['PUT', '/api/modules/waypoints/guide-target', { id: 18 }]]);
});
