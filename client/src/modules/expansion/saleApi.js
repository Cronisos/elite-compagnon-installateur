// Appels API des mérites prévus à la vente (serveur : server/src/modules/expansion/sale.js).

import { api } from '../../core/api.js';

const base = '/modules/expansion';

export const saleApi = {
  forecast: () => api(`${base}/sale`),
  cases: (zero) => api(`${base}/sales${zero ? '?zero=1' : ''}`),
  text: (zero) => api(`${base}/sales/text${zero ? '?zero=1' : ''}`),
  settings: (body) => api(`${base}/sale/settings`, { method: 'PUT', body }),
};
