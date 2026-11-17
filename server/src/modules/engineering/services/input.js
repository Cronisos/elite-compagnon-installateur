// Corps et identifiants reçus par les routes de l'itinéraire : vérifiés strictement avant tout calcul ou écriture.
// Erreurs 400 en français ; rien n'est écrit après un refus.

import { isPlainObject } from '../../../core/atomic.js';

function inputError(status, message) {
  const err = new Error(message);
  err.status = status;
  err.publicMessage = message;
  return err;
}
export { inputError };

/**
 * Corps JSON strict : un objet ordinaire dont chaque clé est permise. Corps absent ou {} permis si optional.
 * @returns {object} le corps (jamais modifié)
 */
export function strictBody(body, allowed, { optional = false } = {}) {
  if (body === undefined || body === null) {
    if (optional) return {};
    throw inputError(400, 'Corps attendu : un objet JSON.');
  }
  if (!isPlainObject(body) || ![Object.prototype, null].includes(Object.getPrototypeOf(body))) throw inputError(400, 'Corps attendu : un objet JSON.');
  for (const k of Object.keys(body)) {
    if (!allowed.includes(k)) throw inputError(400, `Champ inconnu : « ${k} ».`);
  }
  return body;
}

/** Identifiant d'ingénieur dans une adresse : six chiffres (300000…), connu des données ; sinon 404. */
export function engineerIdParam(value, idx) {
  if (typeof value !== 'string' || !/^[1-9]\d{5}$/.test(value)) throw inputError(404, 'Ingénieur introuvable.');
  const id = Number(value);
  if (!idx?.byId.has(id)) throw inputError(404, 'Ingénieur introuvable.');
  return id;
}
