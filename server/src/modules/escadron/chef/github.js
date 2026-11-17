// Suivi Discord sur GitHub (mode « GitHub, 24 h/24 »), installé par l'app avec une clé GitHub du chef : copie du
// projet Squadron Tracker sur son compte, secrets d'Actions (scellés : sealed.js), variable TRACKER_ENABLED, tâche
// planifiée activée, puis un premier passage lancé tout de suite. La clé n'est jamais gardée ni journalisée.
//
// API utilisée (https://docs.github.com/rest) : utilisateur, dépôt, copie (fork), clé publique et secrets d'Actions,
// variables, permissions d'Actions, activation et lancement d'une tâche.

import { erreurPublique } from './cloudflare.js';
import { sceller } from './sealed.js';

export const GH_API = 'https://api.github.com';
export const DEPOT_SOURCE = 'Cronisos/squadron-tracker';
export const TACHE = 'tracker.yml';
const DELAI_MS = 30_000;
const attendreMs = (ms) => new Promise((r) => setTimeout(r, ms));

/** Un appel à l'API GitHub ; renvoie le corps (ou null), et le statut. */
async function gh(envoyer, token, quoi, method, chemin, { json, ok = [] } = {}) {
  let res;
  try {
    res = await envoyer(`${GH_API}${chemin}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'Elite-Compagnon',
        ...(json ? { 'content-type': 'application/json' } : {}),
      },
      body: json ? JSON.stringify(json) : undefined,
      redirect: 'error', // la clé ne suit jamais une redirection
      signal: AbortSignal.timeout(DELAI_MS),
    });
  } catch (err) {
    if (err?.publicMessage) throw err;
    throw erreurPublique(502, `GitHub injoignable pendant « ${quoi} » : vérifie ta connexion.`);
  }
  let corps = null;
  try {
    corps = res.status === 204 ? null : await res.json();
  } catch {
    // corps vide
  }
  if (res.ok || ok.includes(res.status)) return { status: res.status, corps };
  const detail = corps?.message ? ` (${String(corps.message).slice(0, 200)})` : '';
  if (res.status === 401) throw erreurPublique(400, `Clé GitHub refusée${detail} : recopie-la, ou crée-en une nouvelle.`, 'cle');
  if (res.status === 403 || res.status === 404) {
    throw erreurPublique(400, `GitHub refuse « ${quoi} »${detail} : la clé doit avoir les droits « repo » et « workflow ».`, 'cle');
  }
  throw erreurPublique(502, `GitHub a refusé « ${quoi} » (erreur ${res.status})${detail}.`);
}

/**
 * Installe le suivi sur le compte GitHub de la clé. `secrets` : ROUTE_JSON, DISCORD_WEBHOOK_URL, API_URL,
 * TRACKER_TOKEN. Renvoie { depot, adresse }.
 */
export async function installerSuivi({ fetch: envoyer, token, secrets, etape = () => {}, attendre = attendreMs, essais = 20 }) {
  if (typeof token !== 'string' || token.trim().length < 20) throw erreurPublique(400, 'Colle la clé GitHub (elle commence par « ghp_ » ou « github_pat_ »).');
  const cle = token.trim();
  for (const [nom, v] of Object.entries(secrets)) {
    if (typeof v !== 'string' || !v) throw erreurPublique(400, `Réglage ${nom} manquant.`);
  }

  etape('Compte GitHub');
  const { corps: moi } = await gh(envoyer, cle, 'lire ton compte', 'GET', '/user');
  const login = moi?.login;
  if (!login) throw erreurPublique(502, 'GitHub n’a pas donné le nom du compte.');
  const nomDepot = DEPOT_SOURCE.split('/')[1];

  etape('Copie du projet');
  const chemin = `/repos/${encodeURIComponent(login)}/${nomDepot}`;
  let { status, corps: depot } = await gh(envoyer, cle, 'chercher ta copie du projet', 'GET', chemin, { ok: [404] });
  if (status === 404) {
    await gh(envoyer, cle, 'copier le projet', 'POST', `/repos/${DEPOT_SOURCE}/forks`, { json: { default_branch_only: true } });
    for (let i = 0; i < essais && status === 404; i++) {
      await attendre(3000); // GitHub prépare la copie en arrière-plan
      ({ status, corps: depot } = await gh(envoyer, cle, 'attendre la copie', 'GET', chemin, { ok: [404] }));
    }
    if (status === 404) throw erreurPublique(504, 'GitHub prépare encore la copie du projet : relance dans une minute.');
  }
  // Un dépôt du même nom qui n'est pas une copie du projet (ni le projet lui-même) n'est jamais touché
  const estSource = `${login}/${nomDepot}`.toLowerCase() === DEPOT_SOURCE.toLowerCase();
  if (depot && !estSource && depot.fork !== true && depot.parent?.full_name !== DEPOT_SOURCE) {
    throw erreurPublique(409, `Ton compte GitHub a déjà un dépôt « ${nomDepot} » qui n'est pas une copie du Squadron Tracker : renomme-le ou supprime-le, puis recommence.`);
  }
  if (depot?.fork === true && depot.parent?.full_name && depot.parent.full_name !== DEPOT_SOURCE) {
    throw erreurPublique(409, `Ton dépôt « ${nomDepot} » est la copie d'un autre projet (${depot.parent.full_name}) : renomme-le ou supprime-le, puis recommence.`);
  }
  const branche = depot?.default_branch || 'main';

  etape('Secrets du suivi');
  const { corps: pk } = await gh(envoyer, cle, 'lire la clé des secrets', 'GET', `${chemin}/actions/secrets/public-key`);
  if (!pk?.key || !pk?.key_id) throw erreurPublique(502, 'GitHub n’a pas donné la clé des secrets.');
  for (const [nom, valeur] of Object.entries(secrets)) {
    await gh(envoyer, cle, `poser le secret ${nom}`, 'PUT', `${chemin}/actions/secrets/${nom}`, {
      json: { encrypted_value: sceller(valeur, pk.key), key_id: pk.key_id },
    });
  }
  const variable = { name: 'TRACKER_ENABLED', value: 'true' };
  const { status: v } = await gh(envoyer, cle, 'allumer le suivi', 'POST', `${chemin}/actions/variables`, { json: variable, ok: [409] });
  if (v === 409) await gh(envoyer, cle, 'allumer le suivi', 'PATCH', `${chemin}/actions/variables/TRACKER_ENABLED`, { json: variable });

  etape('Tâche planifiée');
  // Actions allumées, sans toucher au réglage des actions permises (s'il est plus strict, il le reste)
  await gh(envoyer, cle, 'autoriser les tâches', 'PUT', `${chemin}/actions/permissions`, { json: { enabled: true } });
  await gh(envoyer, cle, 'activer la mise à jour', 'PUT', `${chemin}/actions/workflows/${TACHE}/enable`);
  await gh(envoyer, cle, 'lancer un premier passage', 'POST', `${chemin}/actions/workflows/${TACHE}/dispatches`, { json: { ref: branche } });

  return { depot: `${login}/${nomDepot}`, adresse: depot?.html_url ?? `https://github.com/${login}/${nomDepot}` };
}
