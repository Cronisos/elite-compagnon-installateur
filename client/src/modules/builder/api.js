// Appels API du module Constructeur de builds.

import { api } from '../../core/api.js';

const base = '/modules/builder';

export const builderApi = {
  status: () => api(`${base}/status`),
  ships: () => api(`${base}/ships`),
  apercu: () => api(`${base}/ships/apercu`),
  fleet: () => api(`${base}/fleet`),
  catalog: (shipId) => api(`${base}/catalog/${shipId}`),
  start: (body) => api(`${base}/start`, { method: 'POST', body }),
  importText: (text) => api(`${base}/import`, { method: 'POST', body: { text } }),
  stats: (build) => api(`${base}/stats`, { method: 'POST', body: build }),
  builds: () => api(`${base}/builds`),
  build: (id) => api(`${base}/builds/${id}`),
  create: (body) => api(`${base}/builds`, { method: 'POST', body }),
  update: (id, body) => api(`${base}/builds/${id}`, { method: 'PUT', body }),
  duplicate: (id) => api(`${base}/builds/${id}/duplicate`, { method: 'POST' }),
  remove: (id) => api(`${base}/builds/${id}`, { method: 'DELETE' }),
  inaraStatus: () => api(`${base}/inara`),
  inaraImport: (html) => api(`${base}/inara/import`, { method: 'POST', body: { html } }),
  inara: (build) => api(`${base}/inara`, { method: 'POST', body: build }),
};

/** Copie dans le presse-papiers ; false si le navigateur refuse. */
export async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
