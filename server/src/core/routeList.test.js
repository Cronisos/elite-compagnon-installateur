// Liste des routes pour le banc de contrôle : chemins complets, méthodes, routeurs montés, chemins non textuels signalés.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { listRoutes } from './routeList.js';

test('routes : chemins complets et méthodes, y compris celles des routeurs montés', () => {
  const app = express();
  app.use('/api', (req, res, next) => next());
  app.get('/api/state', (req, res) => res.end());
  app.put('/api/ships/:shipId/nickname', (req, res) => res.end());
  const router = express.Router();
  router.get('/', (req, res) => res.end());
  router.route('/plans/:id').get((req, res) => res.end()).patch((req, res) => res.end());
  router.delete('/plans/:id', (req, res) => res.end());
  const mounts = new Map([[router, '/api/modules/engineering']]);
  app.use('/api/modules/engineering', router);

  assert.deepEqual(listRoutes(app, mounts), [
    { methods: ['GET'], path: '/api/state', raw: '/api/state' },
    { methods: ['PUT'], path: '/api/ships/:shipId/nickname', raw: '/api/ships/:shipId/nickname' },
    { methods: ['GET'], path: '/api/modules/engineering/', raw: '/' },
    { methods: ['GET', 'PATCH'], path: '/api/modules/engineering/plans/:id', raw: '/plans/:id' },
    { methods: ['DELETE'], path: '/api/modules/engineering/plans/:id', raw: '/plans/:id' },
  ]);
});

test('routes : chemin non textuel et routeur monté sans chemin connu rendus avec path null (le banc les signale)', () => {
  const app = express();
  app.get(/^\/api\/regex$/, (req, res) => res.end());
  app.all('/api/tout', (req, res) => res.end());
  const cache = express.Router();
  cache.post('/x', (req, res) => res.end());
  app.use('/api/cache', cache);
  const routes = listRoutes(app, new Map());
  assert.equal(routes.length, 3);
  assert.deepEqual(routes[0], { methods: ['GET'], path: null, raw: String(/^\/api\/regex$/) });
  assert.deepEqual(routes[1], { methods: ['ALL'], path: '/api/tout', raw: '/api/tout' });
  assert.equal(routes[2].path, null);
  assert.match(routes[2].raw, /routeur monté sans chemin connu/);
});

test('routes : app.all() et route().all() rendus ALL, tableau de chemins rendu chemin par chemin', () => {
  const app = express();
  const router = express.Router();
  router.route('/tout').all((req, res) => res.end());
  router.get(['/a', '/b'], (req, res) => res.end());
  app.use('/api/modules/x', router);
  app.all('/api/tout', (req, res) => res.end());
  assert.deepEqual(listRoutes(app, new Map([[router, '/api/modules/x']])), [
    { methods: ['ALL'], path: '/api/modules/x/tout', raw: '/tout' },
    { methods: ['GET'], path: '/api/modules/x/a', raw: '/a' },
    { methods: ['GET'], path: '/api/modules/x/b', raw: '/b' },
    { methods: ['ALL'], path: '/api/tout', raw: '/api/tout' },
  ]);
});
