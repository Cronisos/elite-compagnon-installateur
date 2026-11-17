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
};
