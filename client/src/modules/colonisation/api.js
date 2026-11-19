// Appels API du module Colonisation.

import { api } from '../../core/api.js';

const base = '/modules/colonisation';

export const colApi = {
  sites: () => api(`${base}/sites`),
  site: (marketId) => api(`${base}/sites/${encodeURIComponent(marketId)}`),
  here: () => api(`${base}/here`),
  active: () => api(`${base}/active`),
  sources: (marketId, { maxDistance, maxDaysAgo, carriers } = {}) => {
    const qs = new URLSearchParams({ maxDistance: String(maxDistance ?? 50), maxDaysAgo: String(maxDaysAgo ?? 14), carriers: carriers ? '1' : '0' });
    return api(`${base}/sites/${encodeURIComponent(marketId)}/sources?${qs}`);
  },
  update: (marketId, body) => api(`${base}/sites/${encodeURIComponent(marketId)}`, { method: 'PUT', body }),
  forget: (marketId) => api(`${base}/sites/${encodeURIComponent(marketId)}`, { method: 'DELETE' }),
  diagnostics: () => api(`${base}/diagnostics`),
  // Projet de l'escadron vu d'ici : chantiers dans l'ordre du chef, avec la lecture la plus récente
  escadron: () => api(`${base}/escadron`),
};

// Projet de colonisation de l'escadron, par le module Escadron : le suivre, le relire ; côté chef, le publier
export const projetApi = {
  activer: (actif) => api('/modules/escadron/colonisation/actif', { method: 'PUT', body: { actif } }),
  lire: (force = false) => api('/modules/escadron/colonisation/lire', { method: 'POST', body: { force } }),
  serveur: () => api('/modules/escadron/chef/colonisation/lire', { method: 'POST', body: {} }),
  publier: (projet) => api('/modules/escadron/chef/colonisation', { method: 'PUT', body: { projet } }),
  arreter: () => api('/modules/escadron/chef/colonisation', { method: 'DELETE' }),
};
