// Appels API du module Routes.

import { useEffect, useRef } from 'react';
import { api } from '../../core/api.js';
import { useEvent } from '../../core/stream.js';

const base = '/modules/routes';

export const routesApi = {
  detect: (anchorSystem) => api(`${base}/detect`, { method: 'POST', body: { anchorSystem } }),
  list: () => api(`${base}/routes`),
  create: (data) => api(`${base}/routes`, { method: 'POST', body: data }),
  get: (id) => api(`${base}/routes/${id}`),
  update: (id, data) => api(`${base}/routes/${id}`, { method: 'PATCH', body: data }),
  resume: (id) => api(`${base}/routes/${id}/resume`, { method: 'POST' }),
  redetect: (id, confirm = false) => api(`${base}/routes/${id}/redetect`, { method: 'POST', body: confirm ? { confirm: true } : {} }),
  resync: (id) => api(`${base}/routes/${id}/resync`, { method: 'POST' }),
  recheckLastBuy: () => api(`${base}/buy-check/last`, { method: 'POST' }),
  remove: (id) => api(`${base}/routes/${id}`, { method: 'DELETE' }),
  loops: (params) => api(`${base}/loops?${new URLSearchParams(params)}`),
  dashboard: () => api(`${base}/dashboard`),
};

/**
 * Recharge les données quand le serveur signale une nouvelle boucle ou un changement.
 * Les appels sont regroupés (délai) pour ne pas recharger à chaque ligne du journal.
 */
export function useRoutesRefresh(reload, { routeId, withState = false } = {}) {
  const timer = useRef(null);
  const later = (ms) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(reload, ms);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEvent('routes:update', (d) => {
    if (!routeId || !d?.routeIds?.length || d.routeIds.includes(Number(routeId))) later(400);
  });
  useEvent('state', () => {
    if (withState) later(2000);
  });
}
