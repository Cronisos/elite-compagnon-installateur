// Appels API du module Ingénierie.

import { useEffect, useRef } from 'react';
import { api } from '../../core/api.js';
import { useEvent } from '../../core/stream.js';

const base = '/modules/engineering';

export const engApi = {
  status: () => api(`${base}/status`),
  updateReference: () => api(`${base}/reference/update`, { method: 'POST' }),
  fleet: () => api(`${base}/fleet`),
  ships: () => api(`${base}/ships`),
  importBuild: (text, shipId) => api(`${base}/import`, { method: 'POST', body: { text, shipId } }),
  plans: () => api(`${base}/plans`),
  createPlan: (body) => api(`${base}/plans`, { method: 'POST', body }),
  plan: (id) => api(`${base}/plans/${id}`),
  updatePlan: (id, body) => api(`${base}/plans/${id}`, { method: 'PATCH', body }),
  deletePlan: (id) => api(`${base}/plans/${id}`, { method: 'DELETE' }),
  setModule: (id, slot, body) => api(`${base}/plans/${id}/modules/${encodeURIComponent(slot)}`, { method: 'PUT', body }),
  allG5: (id) => api(`${base}/plans/${id}/all-g5`, { method: 'POST' }),
  reset: (id) => api(`${base}/plans/${id}/reset`, { method: 'POST' }),
  inventory: () => api(`${base}/inventory`),
  ranks: () => api(`${base}/ranks`),
  // Fiche « Chez l’ingénieur »
  visit: () => api(`${base}/visit`),
  visitPlan: (planId) => api(`${base}/visit/plan`, { method: 'PUT', body: { planId } }),
  visitClose: () => api(`${base}/visit/close`, { method: 'POST' }),
  // Alertes de passage (fenêtre en jeu engineering-passage)
  passage: () => api(`${base}/passage`),
  passageClose: () => api(`${base}/passage/close`, { method: 'POST' }),
  visitDismiss: (id) => api(`${base}/visit/dismiss`, { method: 'POST', body: { id } }),
  rankRules: () => api(`${base}/ranks/rules`),
  dashboard: (ids) => api(`${base}/dashboard${ids ? `?ids=${ids.join(',')}` : ''}`),
  // Itinéraire d'ingénierie : plans validés, ingénieurs, épingles, itinéraire (calculé seulement au clic)
  validations: () => api(`${base}/validations`),
  validatePlan: (id) => api(`${base}/plans/${id}/validation`, { method: 'POST' }),
  unvalidatePlan: (id) => api(`${base}/plans/${id}/validation`, { method: 'DELETE' }),
  engineers: () => api(`${base}/engineers`),
  engineer: (id) => api(`${base}/engineers/${encodeURIComponent(id)}`),
  setPin: (id, body) => api(`${base}/engineers/${encodeURIComponent(id)}/pin`, { method: 'PUT', body }),
  clearPin: (id) => api(`${base}/engineers/${encodeURIComponent(id)}/pin`, { method: 'DELETE' }),
  route: () => api(`${base}/route`),
  computeRoute: (body) => api(`${base}/route`, { method: 'POST', body }),
  routeRules: () => api(`${base}/route/rules`),
};

/**
 * Recharge quand l'inventaire, la flotte ou les données de référence changent (validation, épingle, calcul compris).
 * live : aussi quand tu changes de système (distances des pages Itinéraire et Ingénieurs) et quand une application à
 * distance montre une épingle ; jamais un recalcul de l'itinéraire, seulement une relecture.
 */
export function useEngineeringRefresh(reload, { live = false } = {}) {
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const later = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(reload, 300);
  };
  useEvent('engineering:update', later);
  useEvent('engineering:position', () => live && later());
  useEvent('engineering:pin', () => live && later());
  useEvent('engineering:refdata', (d) => {
    if (!d?.running) later();
  });
}
