// Appels API du module Projet extension.

import { api } from '../../core/api.js';

const base = '/modules/expansion';

export const expansionApi = {
  list: () => api(`${base}/projects`),
  // Route d'extension : { name, description, steps: [{ name, role, jump }] }
  create: (route) => api(`${base}/projects`, { method: 'POST', body: route }),
  update: (id, route) => api(`${base}/projects/${id}`, { method: 'PUT', body: route }),
  remove: (id) => api(`${base}/projects/${id}`, { method: 'DELETE' }),
  // Portée de chaque objectif (dépôt des règles du serveur), pour le contrôle en direct de l'éditeur
  rules: () => api(`${base}/rules`),
  // Sauts d'après les positions des journaux, dans l'ordre de la route
  jumps: (names) => api(`${base}/jumps?${new URLSearchParams(names.map((n) => ['systems', n]))}`),
  // Palier déclaré atteint (ou plus) pour la semaine en cours
  palier: (system, atteint) => api(`${base}/palier`, { method: 'PUT', body: { system, atteint } }),
  merits: (project, week) => {
    const q = new URLSearchParams();
    if (project) q.set('project', project);
    if (week) q.set('week', week);
    return api(`${base}/merits?${q}`);
  },
};
