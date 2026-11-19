// Appels HTTP vers le serveur local.
//
// Toutes les requêtes du client passent par ici (sauf le flux temps réel EventSource et les images,
// qui sont des GET). L'en-tête X-Elite-Compagnon est exigé par le serveur pour toute écriture : un site
// web tiers ne peut pas l'ajouter, ce qui le protège des requêtes forgées (server/src/core/localGuard.js).
//
// Les erreurs remontées sont en français et parlent au joueur : un serveur local qui ne répond pas (relancé, arrêté)
// ne donne pas « Failed to fetch » mais un conseil. L'erreur porte le code HTTP (err.status, 0 sans réponse).

import { DEMO, repondreEnDemo } from './demo.js';

export const API_HEADERS = { 'X-Elite-Compagnon': '1' };

export const MESSAGE_SANS_REPONSE = "L'app ne répond plus : attends quelques secondes, ou relance Enova.";
export const MESSAGE_SERVEUR_INJOIGNABLE = 'Serveur local injoignable : relance Enova si ça dure.';

/** Message d'une réponse en erreur qui n'en donne pas, selon son code HTTP. */
export function messageStatut(status) {
  if (status >= 500) return MESSAGE_SERVEUR_INJOIGNABLE;
  if (status === 404) return 'Introuvable : la donnée a peut-être été supprimée entre-temps.';
  if (status === 403) return 'Demande refusée par le serveur local.';
  return `Le serveur local a refusé la demande (erreur ${status}).`;
}

function erreur(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/** Réponse en JSON d'un appel au serveur local ; `signal` (AbortController) annule la requête. */
export async function api(path, { method = 'GET', body, signal } = {}) {
  // Fenêtre en démonstration (tutoriel des fenêtres en jeu) : rien n'est lu ni écrit sur le serveur (core/demo.js)
  if (DEMO) return repondreEnDemo(path, method);
  return appel(path, {
    method,
    headers: body ? { ...API_HEADERS, 'Content-Type': 'application/json' } : API_HEADERS,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
}

/**
 * Envoi d'un corps brut (un enregistrement audio…) au serveur local, réponse en JSON : mêmes en-têtes et mêmes
 * messages d'erreur que api(). `type` : type du contenu (audio/wav…).
 */
export async function apiBrut(path, corps, { type, method = 'POST', signal } = {}) {
  if (DEMO) return repondreEnDemo(path, method);
  return appel(path, { method, headers: { ...API_HEADERS, 'Content-Type': type }, body: corps, signal });
}

async function appel(path, init) {
  let res;
  try {
    res = await fetch(`/api${path}`, init);
  } catch (err) {
    if (err?.name === 'AbortError') throw err; // requête annulée par la page : pas une panne
    throw erreur(MESSAGE_SANS_REPONSE, 0);
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    // réponse vide
  }
  if (!res.ok) throw erreur(data?.error || messageStatut(res.status), res.status);
  return data;
}
