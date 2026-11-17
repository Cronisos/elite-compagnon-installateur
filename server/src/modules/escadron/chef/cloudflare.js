// Serveur de l'escadron chez le chef, monté par l'app avec sa clé d'API Cloudflare (sans console ni wrangler) :
// base D1 et ses tables, Worker du Squadron Tracker avec ses trois secrets, adresse workers.dev. Refaire l'opération
// met le serveur à jour sans toucher aux membres ni aux mérites (CREATE TABLE IF NOT EXISTS, même base).
//
// API utilisée (https://developers.cloudflare.com/api/) : comptes, sous-domaine workers.dev, D1 (création, requête),
// envoi du script (multipart, liaisons D1 et secret_text), activation sur workers.dev, secrets du script.
// La clé n'est jamais gardée ni journalisée : elle ne sert que le temps de l'opération.

import fs from 'node:fs';

export const CF_API = 'https://api.cloudflare.com/client/v4';
export const NOM_WORKER = 'squadron-tracker-api';
export const NOM_BASE = 'squadron-tracker';
const COMPATIBILITE = '2026-10-01';
const DELAI_MS = 30_000;

const WORKER_SOURCE = new URL('./worker/squadron-worker.js', import.meta.url);
const SCHEMA = new URL('./worker/schema.sql', import.meta.url);

/** Le code du Worker et le schéma de sa base, embarqués dans l'app. */
export function sourcesWorker() {
  return { source: fs.readFileSync(WORKER_SOURCE, 'utf8'), schema: fs.readFileSync(SCHEMA, 'utf8') };
}

/** Instructions SQL du schéma, une par une (commentaires retirés). */
export function instructions(schema) {
  return schema
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function erreurPublique(status, message, code) {
  const err = new Error(message);
  err.status = status;
  err.publicMessage = message;
  if (code) err.code = code;
  return err;
}

/** Erreur de l'API Cloudflare, en clair pour le chef (jamais la clé). */
function erreurCf(status, errors, quoi) {
  const e = errors?.[0];
  const detail = e?.message ? ` (${String(e.message).slice(0, 200)})` : '';
  if (status === 401 || status === 403 || e?.code === 10000 || e?.code === 9109) {
    return erreurPublique(400, `Clé Cloudflare refusée pour « ${quoi} » : vérifie qu'elle a les trois permissions demandées${detail}.`, 'cle');
  }
  return erreurPublique(502, `Cloudflare a refusé « ${quoi} » (erreur ${status})${detail}.`);
}

/** Un appel à l'API Cloudflare ; renvoie `result`. */
async function cf(envoyer, token, quoi, method, chemin, { json, form } = {}) {
  let res;
  try {
    res = await envoyer(`${CF_API}${chemin}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(json ? { 'content-type': 'application/json' } : {}) },
      body: json ? JSON.stringify(json) : form,
      redirect: 'error', // la clé ne suit jamais une redirection
      signal: AbortSignal.timeout(DELAI_MS),
    });
  } catch (err) {
    if (err?.publicMessage) throw err; // refus de la passerelle, déjà en clair
    throw erreurPublique(502, `Cloudflare injoignable pendant « ${quoi} » : vérifie ta connexion.`);
  }
  let corps = null;
  try {
    corps = await res.json();
  } catch {
    // corps illisible : traité ci-dessous
  }
  if (!res.ok || corps?.success === false) throw Object.assign(erreurCf(res.status, corps?.errors, quoi), { cfCode: corps?.errors?.[0]?.code, httpStatus: res.status });
  return corps?.result;
}

/** Sous-domaine workers.dev permis par Cloudflare : lettres minuscules, chiffres, tirets. */
export function sousDomaineValide(v) {
  return typeof v === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(v);
}

/**
 * Monte (ou met à jour) le serveur de l'escadron sur le compte Cloudflare de la clé.
 * `secrets` : { ADMIN_TOKEN, TRACKER_TOKEN, JOIN_PASSWORD } ; `sousDomaine` : à créer si le compte n'en a pas encore.
 * Un serveur déjà en place sur ce compte (monté à la main, ou depuis un autre PC) n'est remplacé que si `remplacer`
 * est vrai : sinon erreur 409 « existant » (ses secrets changeraient, et la carte Discord déjà installée s'arrêterait).
 * Remplacé, il garde sa base D1 (celle qui lui est liée), donc ses membres, mérites et route.
 * `etape(texte)` : avancement, pour la page. Renvoie { url, compte, sousDomaine, base, existait }.
 */
export async function monterServeur({ fetch: envoyer, token, secrets, sousDomaine = null, remplacer = false, etape = () => {}, sources = sourcesWorker() }) {
  if (typeof token !== 'string' || token.trim().length < 20) throw erreurPublique(400, 'Colle la clé d’API Cloudflare (une quarantaine de caractères).');
  const cle = token.trim();

  etape('Compte Cloudflare');
  const comptes = await cf(envoyer, cle, 'lire ton compte', 'GET', '/accounts?per_page=5');
  if (!Array.isArray(comptes) || comptes.length === 0) {
    throw erreurPublique(400, 'Cette clé ne donne accès à aucun compte Cloudflare : à la création, choisis ton compte dans « Ressources du compte ».', 'cle');
  }
  const compte = comptes[0];
  const A = `/accounts/${encodeURIComponent(compte.id)}`;

  etape('Adresse workers.dev');
  let sous = null;
  try {
    sous = (await cf(envoyer, cle, 'lire ton adresse workers.dev', 'GET', `${A}/workers/subdomain`))?.subdomain ?? null;
  } catch (err) {
    if (err.code === 'cle') throw err;
    sous = null; // pas encore de sous-domaine (Cloudflare répond par une erreur)
  }
  if (!sous) {
    if (!sousDomaineValide(sousDomaine)) {
      throw erreurPublique(409, 'Ton compte Cloudflare n’a pas encore d’adresse workers.dev : choisis-lui un nom (lettres minuscules, chiffres, tirets).', 'sous-domaine');
    }
    sous = (await cf(envoyer, cle, 'créer ton adresse workers.dev', 'PUT', `${A}/workers/subdomain`, { json: { subdomain: sousDomaine } }))?.subdomain ?? sousDomaine;
  }

  etape('Serveur déjà en place ?');
  let existant = null;
  try {
    existant = await cf(envoyer, cle, 'lire le serveur en place', 'GET', `${A}/workers/scripts/${NOM_WORKER}/settings`);
  } catch (err) {
    if (err.code === 'cle') throw err;
    if (err.httpStatus !== 404) throw err;
    existant = null; // pas de serveur sur ce compte
  }
  if (existant && !remplacer) {
    throw erreurPublique(409, 'Un serveur d’escadron tourne déjà sur ce compte Cloudflare. Reprends-le d’abord (« Reprendre un serveur existant », avec sa clé de chef), ou confirme son remplacement : ses clés changeront et il faudra réinstaller la carte Discord.', 'existant');
  }
  const lieeA = (existant?.bindings ?? []).find((b) => b.type === 'd1' && b.name === 'DB')?.id ?? null;

  etape('Base de données');
  let baseId = lieeA; // celle du serveur en place : membres, mérites et route gardés
  if (!baseId) {
    const bases = await cf(envoyer, cle, 'lister tes bases D1', 'GET', `${A}/d1/database?name=${NOM_BASE}`);
    const base = (bases ?? []).find((b) => b.name === NOM_BASE)
      ?? await cf(envoyer, cle, 'créer la base', 'POST', `${A}/d1/database`, { json: { name: NOM_BASE } });
    baseId = base?.uuid;
  }
  if (!baseId) throw erreurPublique(502, 'Cloudflare n’a pas donné l’identifiant de la base.');
  for (const sql of instructions(sources.schema)) {
    await cf(envoyer, cle, 'créer les tables', 'POST', `${A}/d1/database/${encodeURIComponent(baseId)}/query`, { json: { sql } });
  }

  etape('Serveur et secrets');
  const meta = {
    main_module: 'squadron-worker.js',
    compatibility_date: COMPATIBILITE,
    bindings: [
      { type: 'd1', name: 'DB', id: baseId },
      ...['ADMIN_TOKEN', 'TRACKER_TOKEN', 'JOIN_PASSWORD'].map((name) => ({ type: 'secret_text', name, text: secrets[name] })),
    ],
  };
  for (const [nom, v] of Object.entries(secrets)) {
    if (typeof v !== 'string' || !v) throw erreurPublique(400, `Secret ${nom} manquant.`);
  }
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
  form.append('squadron-worker.js', new Blob([sources.source], { type: 'application/javascript+module' }), 'squadron-worker.js');
  await cf(envoyer, cle, 'envoyer le serveur', 'PUT', `${A}/workers/scripts/${NOM_WORKER}`, { form });
  await cf(envoyer, cle, 'le mettre en ligne', 'POST', `${A}/workers/scripts/${NOM_WORKER}/subdomain`, { json: { enabled: true, previews_enabled: false } });

  return { url: `https://${NOM_WORKER}.${sous}.workers.dev`, compte: compte.name ?? null, sousDomaine: sous, base: baseId, existait: Boolean(existant) };
}

/** Change un secret du serveur en place (mot de passe JOIN_PASSWORD, ou clé de chef ADMIN_TOKEN), sans rien d'autre. */
export async function changerSecret({ fetch: envoyer, token, nom, valeur }) {
  if (typeof token !== 'string' || token.trim().length < 20) throw erreurPublique(400, 'Colle la clé d’API Cloudflare.');
  if (!['JOIN_PASSWORD', 'ADMIN_TOKEN'].includes(nom)) throw erreurPublique(400, 'Secret inconnu.');
  const cle = token.trim();
  const comptes = await cf(envoyer, cle, 'lire ton compte', 'GET', '/accounts?per_page=5');
  if (!comptes?.length) throw erreurPublique(400, 'Cette clé ne donne accès à aucun compte Cloudflare.', 'cle');
  const A = `/accounts/${encodeURIComponent(comptes[0].id)}`;
  await cf(envoyer, cle, nom === 'JOIN_PASSWORD' ? 'changer le mot de passe' : 'changer la clé de chef', 'PUT', `${A}/workers/scripts/${NOM_WORKER}/secrets`, {
    json: { name: nom, text: valeur, type: 'secret_text' },
  });
}

/** Change le mot de passe de l'escadron (secret JOIN_PASSWORD) : les membres inscrits gardent leur jeton. */
export const changerMotDePasse = ({ fetch, token, motDePasse }) => changerSecret({ fetch, token, nom: 'JOIN_PASSWORD', valeur: motDePasse });
