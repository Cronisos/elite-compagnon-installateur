// Appels API du module Systèmes importants.

import { api } from '../../core/api.js';

const base = '/modules/systems';

export const sysApi = {
  options: () => api(`${base}/options`),
  list: () => api(`${base}/systems`),
  add: (body) => api(`${base}/systems`, { method: 'POST', body }),
  update: (id, body) => api(`${base}/systems/${id}`, { method: 'PATCH', body }),
  remove: (id) => api(`${base}/systems/${id}`, { method: 'DELETE' }),
  search: (body) => api(`${base}/search`, { method: 'POST', body }),
};
