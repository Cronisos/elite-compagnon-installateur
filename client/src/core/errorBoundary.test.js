// Garde-fou des pages (core/errorBoundary.js) et cases d'EEP bornées (waypoints/surveyTiles.js) : une donnée
// imprévue venue de Spansh ne donne plus une page blanche ni un onglet saturé.

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PAGE_ERROR_TEXT, PageErrorBoundary } from './errorBoundary.js';
import { MAX_TILES, tileCount } from '../modules/waypoints/surveyTiles.js';

test('erreur d’affichage : la page en cause montre un message, le reste continue ; autre adresse : remise à zéro', () => {
  assert.deepEqual(PageErrorBoundary.getDerivedStateFromError(new RangeError('Invalid array length')).error.message, 'Invalid array length');
  const b = new PageErrorBoundary({ resetKey: '/reperes/planete/x', children: 'contenu' });
  assert.equal(b.render(), 'contenu');
  b.state = { ...b.state, ...PageErrorBoundary.getDerivedStateFromError(new RangeError('Invalid array length')) };
  const vue = b.render();
  assert.equal(vue.props.role, 'alert');
  assert.equal(vue.props.children[0].props.children, PAGE_ERROR_TEXT);
  assert.match(vue.props.children[1].props.children, /Invalid array length/);
  assert.deepEqual(PageErrorBoundary.getDerivedStateFromProps({ resetKey: '/reperes' }, b.state), { error: null, key: '/reperes' });
  assert.equal(PageErrorBoundary.getDerivedStateFromProps({ resetKey: '/reperes/planete/x' }, b.state), null);
  const err = mock.method(console, 'error', () => {});
  b.componentDidCatch(new Error('x'), { componentStack: 'pile' });
  assert.equal(err.mock.callCount(), 1, 'écrite dans la console');
  err.mock.restore();
});

test('chaque page et chaque fenêtre de l’overlay passent par le garde-fou (App.jsx)', () => {
  const app = fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
  const elements = [...app.matchAll(/<Route\b[^>]*element=\{([^}]*(?:\}[^}]*)?)\}/g)].map((m) => m[1]);
  assert.ok(elements.length >= 6, `${elements.length} routes lues`);
  const sansGarde = elements.filter((e) => !/<Guarded[ >]/.test(e) && !/Page introuvable|<Main \/>/.test(e));
  assert.deepEqual(sansGarde, []);
  assert.match(app, /<PageErrorBoundary key=\{m\.id\}>\s*<Suspense fallback=\{null\}><m\.Overlay \/>/, 'éléments permanents des modules aussi');
  // Fenêtres en jeu et pages de capture, chargées à la demande : jamais de « Chargement… » au-dessus du jeu
  const enJeu = elements.filter((e) => /^<Guarded/.test(e) && !/<Home|<SettingsPage|<RubriquePage|<m\.Component|<BarreBureau|<PaveTactile|<FenetresEnJeu|<TutorielsPage/.test(e));
  assert.ok(enJeu.length >= 3, `${enJeu.length} routes en jeu lues`);
  assert.deepEqual(enJeu.filter((e) => !/^<Guarded attente=\{null/.test(e)), []);
});

test('cases d’EEP : nombre démesuré, texte ou négatif borné ; numéros notés toujours montrés', () => {
  assert.equal(tileCount({ count: 4294967296, sites: [] }), MAX_TILES);
  assert.equal(tileCount({ count: 30_000_000, sites: [] }), MAX_TILES);
  assert.equal(tileCount({ count: '1e9', sites: [] }), 0);
  assert.equal(tileCount({ count: -5, sites: [{ number: 3 }] }), 3);
  assert.equal(tileCount({ count: 12, sites: [{ number: 25 }] }), 25);
  assert.equal(tileCount({ count: null, sites: [{ number: 1e12 }] }, 4), MAX_TILES);
  assert.equal(tileCount({ count: 2, sites: [] }, 7), 7);
  assert.equal(tileCount(null), 0);
  // Le tableau des cases se crée sans exception, quelle que soit la donnée
  assert.doesNotThrow(() => Array.from({ length: tileCount({ count: 4294967296, sites: [] }) }));
});
