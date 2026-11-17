// Attaques rejouées sur TOUTES les routes du serveur isolé (liste lue dans le serveur, voir routes.mjs). Chacune porte
// son résultat attendu ; tout écart fait échouer l'étape.
//
// Une attaque : { famille, nom, methode, chemin, entetes, corps, attendu }. attendu : { statuts: [..] ou fonction,
// texte (ce qu'on attend, en clair), message (expression que doit contenir l'erreur), verifier(rep) → écart ou null }.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { GUARD } from '../banc/serveur.mjs';
import { LECTURES, remplir } from './routes.mjs';

// --- Résultats attendus ---

export const refusGarde = (message, quoi) => ({ statuts: [403], texte: `refus 403 de la garde de l'API (${quoi})`, message });
const ERREUR_INTERNE = 'Erreur interne du serveur.';
/** Requête que Node refuse lui-même avant l'app (adresse ou en-têtes mal formés) : 400, aucun corps, connexion fermée. */
export const refuseeParNode = (rep) => rep.statut === 400 && !rep.entetes['content-type'] && !rep.corps.length && rep.entetes.connection === 'close';
/**
 * Paramètre piégé : refusé (400, avec la raison), introuvable (404), ou refusé parce que l'état ne s'y prête pas (409,
 * avec la raison : un paramètre en texte libre, comme un nom de commandant « 0 » ou « constructor », valide en soi, sur
 * un serveur d'escadron pas encore monté) ; jamais accepté, jamais une erreur du serveur.
 */
export const REFUS_PROPRE = {
  statuts: [400, 404, 409],
  texte: 'refus propre : 400 ou 409 (avec la raison) ou 404, jamais accepté ni erreur serveur',
  verifier: (rep) => ([400, 409].includes(rep.statut) && !refuseeParNode(rep) && !(typeof rep.json?.error === 'string' && rep.json.error && rep.json.error !== ERREUR_INTERNE) ? `refus ${rep.statut} sans raison lisible` : null),
};
/** Réseau coupé : un service extérieur indisponible répond 502, 503 ou 504, avec une raison ; jamais 500. */
export const sansPlantage = (s, rep) => s < 500 || ([502, 503, 504].includes(s) && typeof rep.json?.error === 'string' && rep.json.error !== ERREUR_INTERNE);
export const SANS_PLANTAGE = { statuts: sansPlantage, texte: 'réponse sans erreur serveur (< 500 ; 502, 503 ou 504 lisible si un service extérieur est coupé)' };

// --- Valeurs piégées ---

/** Marqueur unique de ce lancement : aucun fichier ne doit jamais porter ce nom (chemins piégés). */
export const marqueur = () => `piege${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36)}`;

/** Valeurs déposées dans un paramètre de route (déjà telles qu'envoyées dans l'adresse). */
export function valeursPiegees(M) {
  return {
    chemin: [
      [`..%2F..%2F..%2F${M}`, '../ encodé (%2F)'],
      [`..%5C..%5C..%5C${M}`, '..\\ encodé (%5C)'],
      [`..\\..\\..\\${M}`, '..\\ brut'],
      ['..', '.. seul'],
      ['%2e%2e', '%2e%2e'],
      [`%2e%2e%2f%2e%2e%2f${M}`, '%2e%2e%2f'],
      [`.%2e%5C${M}`, '.%2e\\'],
      ['C%3A%5CWindows%5Cwin.ini', 'chemin absolu C:\\'],
      [`%5C%5C127.0.0.1%5Cc%24%5C${M}`, 'chemin réseau \\\\hôte\\partage'],
      [`%5C%5C.%5Cpipe%5C${M}`, 'périphérique \\\\.\\pipe'],
      ['CON', 'nom réservé CON'],
      ['nul', 'nom réservé nul'],
      ['COM1', 'nom réservé COM1'],
      ['lpt1', 'nom réservé lpt1'],
      ['AUX.png', 'nom réservé AUX.png'],
      ['con.json', 'nom réservé con.json'],
      [`${M}%00.png`, 'octet nul'],
      [`${M}%3A%3A%24DATA`, 'flux NTFS ::$DATA'],
      ['a'.repeat(3000), 'nom de 3 000 caractères'],
      ['%', '% seul (encodage cassé)'],
      ['%E0%A4%A', 'UTF-8 tronqué'],
      [`%EF%BC%8E%EF%BC%8E%EF%BC%8F${M}`, 'points et barre pleine chasse'],
    ],
    prototype: ['__proto__', 'constructor', 'prototype', 'toString', 'valueOf', 'hasOwnProperty', '__defineGetter__', 'isPrototypeOf'].map((v) => [v, v]),
    bornes: [
      ['-1', '-1'], ['0', '0'], ['1.5', '1.5'], ['1e400', '1e400 (infini)'], ['-1e400', '-1e400'],
      ['99999999999999999999', '10^20'], ['9007199254740993', '2^53 + 1'], ['2147483648', '2^31'], ['-2147483649', '-2^31 - 1'],
      ['NaN', 'NaN'], ['Infinity', 'Infinity'], ['0x7FFFFFFF', 'hexadécimal'], ['%20', 'espace'], ['%D9%A1', 'chiffre arabe ١'],
    ],
  };
}

// --- Familles d'en-têtes : sur chaque route ---

const corpsDe = (methode) => (LECTURES.has(methode) ? {} : { entetes: { 'content-type': 'application/json' }, corps: '{}' });

export function famillesEntetes(routes, { port, portInterface }) {
  const att = [];
  for (const r of routes) {
    const chemin = remplir(r.chemin);
    const base = corpsDe(r.methode);
    const ecrit = !LECTURES.has(r.methode) ? GUARD : {};
    att.push({ modele: r.chemin, famille: 'Host étranger', nom: 'Host: evil.example', methode: r.methode, chemin, ...base, entetes: { ...base.entetes, ...ecrit, host: 'evil.example' }, attendu: refusGarde(/ne répond qu'à/, 'Host') });
    att.push({ modele: r.chemin, famille: 'Origin étranger', nom: 'Origin: https://evil.example', methode: r.methode, chemin, ...base, entetes: { ...base.entetes, ...ecrit, origin: 'https://evil.example' }, attendu: refusGarde(/un site web/, 'Origin') });
    att.push({ modele: r.chemin, famille: 'Origin « null »', nom: 'Origin: null', methode: r.methode, chemin, ...base, entetes: { ...base.entetes, ...ecrit, origin: 'null' }, attendu: refusGarde(/un site web/, 'Origin null') });
    att.push({ modele: r.chemin, famille: 'Sec-Fetch-Site cross-site', nom: 'Sec-Fetch-Site: cross-site', methode: r.methode, chemin, ...base, entetes: { ...base.entetes, ...ecrit, 'sec-fetch-site': 'cross-site' }, attendu: refusGarde(/autre site web/, 'Sec-Fetch-Site') });
    // Page d'un autre programme de ce PC (http://127.0.0.1:<autre port>) : Chrome envoie same-site, sans Origin. Avec
    // ?online=1 sur chaque lecture : l'ancienne forme du clic des recherches de Mes repères (zéro tentative attendue,
    // relevé par la sonde après ces familles, attaques/controler.mjs)
    const lecture = r.methode === 'GET' ? `${chemin}${chemin.includes('?') ? '&' : '?'}online=1` : chemin;
    att.push({ modele: r.chemin, famille: 'Sec-Fetch-Site same-site', nom: 'Sec-Fetch-Site: same-site (page d’un autre port de ce PC)', methode: r.methode, chemin: lecture, ...base, entetes: { ...base.entetes, ...ecrit, 'sec-fetch-site': 'same-site', 'sec-fetch-mode': 'no-cors', 'sec-fetch-dest': 'image' }, attendu: refusGarde(/autre programme de ce PC/, 'Sec-Fetch-Site same-site') });
    // Adresse tapée, ou lien ouvert depuis une autre application (Discord…) : la lecture est permise, jamais une erreur ;
    // ?online=1 n'y vaut pas le clic (sonde : aucune recherche au clic). Le flux temps réel, qui ne finit jamais, à part.
    if (r.methode === 'GET' && !r.chemin.endsWith('/stream')) {
      att.push({ modele: r.chemin, famille: 'Sec-Fetch-Site none', nom: 'lien ouvert dans le navigateur, ?online=1', methode: 'GET', chemin: lecture, entetes: { 'sec-fetch-site': 'none', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document', 'sec-fetch-user': '?1' }, attendu: SANS_PLANTAGE });
    }
    if (!LECTURES.has(r.methode)) {
      att.push({ modele: r.chemin, famille: 'Écriture sans X-Elite-Compagnon', nom: 'sans l’en-tête', methode: r.methode, chemin, ...base, attendu: refusGarde(/X-Elite-Compagnon: 1 » manquant/, 'en-tête d’écriture') });
      att.push({ modele: r.chemin, famille: 'Écriture sans X-Elite-Compagnon', nom: 'sans l’en-tête, lien ou formulaire (Sec-Fetch-Site: none)', methode: r.methode, chemin, ...base, entetes: { ...base.entetes, 'sec-fetch-site': 'none' }, attendu: refusGarde(/X-Elite-Compagnon: 1 » manquant/, 'en-tête d’écriture') });
    }
    // Pré-vérification CORS de l'interface elle-même : le serveur n'y répond jamais par une autorisation
    att.push({
      famille: 'Aucun CORS',
      nom: `OPTIONS (pré-vérification ${r.methode})`,
      methode: 'OPTIONS',
      chemin,
      entetes: { origin: `http://localhost:${portInterface}`, 'access-control-request-method': r.methode, 'access-control-request-headers': 'x-elite-compagnon,content-type', 'access-control-request-private-network': 'true' },
      attendu: { statuts: [200, 204, 404], texte: 'pré-vérification sans aucune autorisation CORS (aucun en-tête Access-Control-*)' },
    });
  }
  // Variantes, sur une lecture et une écriture du cœur
  const hotes = [[`evil.example:${port}`, 'evil.example:<port>'], [`localhost:${port + 1}`, 'localhost, autre port'], [`127.0.0.1.nip.io:${port}`, '127.0.0.1.nip.io'], [`localhost.:${port}`, 'localhost. (point final)'], [`[::1]:${port}`, '[::1]'], [`localhost:${port}@evil.example`, 'localhost@evil'], [null, 'aucun Host']];
  // Sans Host du tout, Node refuse lui-même la requête HTTP/1.1 (400, connexion fermée) avant l'app
  const sansHost = { statuts: [400, 403], texte: 'refus 400 de Node (HTTP/1.1 sans Host) ou 403 de la garde', verifier: (rep) => (rep.statut === 403 && !/ne répond qu'à/.test(String(rep.json?.error)) ? `403 « ${rep.json?.error} »` : null) };
  for (const [host, nom] of hotes) {
    const attendu = host === null ? sansHost : refusGarde(/ne répond qu'à/, 'Host');
    att.push({ famille: 'Host étranger', nom, methode: 'GET', chemin: '/api/state', entetes: { host }, attendu });
    att.push({ famille: 'Host étranger', nom, methode: 'PUT', chemin: '/api/settings', entetes: { ...GUARD, 'content-type': 'application/json', host }, corps: '{"hoursPerEvening":7}', attendu });
  }
  const origines = ['http://localhost:5173.evil.example', `http://localhost:${port}`, `http://127.0.0.1:${portInterface + 1}`, `https://localhost:${portInterface}`, 'file://', 'chrome-extension://abcdefgh', `http://localhost:${portInterface}/`, ...(portInterface !== 5173 ? ['http://localhost:5173'] : [])];
  for (const origin of origines) {
    att.push({ famille: 'Origin étranger', nom: `Origin: ${origin}`, methode: 'GET', chemin: '/api/state', entetes: { origin }, attendu: refusGarde(/un site web/, 'Origin') });
    att.push({ famille: 'Origin étranger', nom: `Origin: ${origin}`, methode: 'PUT', chemin: '/api/settings', entetes: { ...GUARD, 'content-type': 'application/json', origin }, corps: '{"hoursPerEvening":7}', attendu: refusGarde(/un site web/, 'Origin') });
  }
  att.push({ famille: 'Sec-Fetch-Site cross-site', nom: 'Sec-Fetch-Site: CROSS-SITE (majuscules)', methode: 'GET', chemin: '/api/state', entetes: { 'sec-fetch-site': 'CROSS-SITE' }, attendu: refusGarde(/autre site web/, 'Sec-Fetch-Site') });
  att.push({ famille: 'Sec-Fetch-Site cross-site', nom: 'flux temps réel', methode: 'GET', chemin: '/api/stream', entetes: { 'sec-fetch-site': 'cross-site' }, attendu: refusGarde(/autre site web/, 'Sec-Fetch-Site') });
  const json = { 'content-type': 'application/json' };
  for (const [entetes, nom] of [[{ 'x-elite-compagnon': '0' }, 'valeur 0'], [{ 'x-elite-compagnon': 'true' }, 'valeur true'], [{ 'x-elite-compagnon': '' }, 'valeur vide'], [{ 'x-elite-compagnon': '11' }, 'valeur 11'], [{ 'x-elite-compagnon': ['1', '1'] }, 'en-tête répété'], [{ 'x-elite-compagnonn': '1' }, 'nom approchant']]) {
    att.push({ famille: 'Écriture sans X-Elite-Compagnon', nom, methode: 'PUT', chemin: '/api/settings', entetes: { ...json, ...entetes }, corps: '{"hoursPerEvening":7}', attendu: refusGarde(/manquant/, 'en-tête d’écriture') });
  }
  for (const chemin of ['/API/settings', '/Api/Settings', '/api/settings/', '/api/settings?x=1', '/api//settings']) {
    att.push({ famille: 'Écriture sans X-Elite-Compagnon', nom: `chemin ${chemin}`, methode: 'PUT', chemin, entetes: json, corps: '{"hoursPerEvening":7}', attendu: { statuts: [403, 404], texte: 'refus 403 de la garde, ou route introuvable (404) : jamais écrit' } });
  }
  for (const methode of ['PROPFIND', 'MKCOL', 'PURGE']) {
    att.push({ famille: 'Écriture sans X-Elite-Compagnon', nom: `méthode ${methode}`, methode, chemin: '/api/settings', attendu: refusGarde(/manquant/, 'méthode inconnue = écriture') });
  }
  att.push({ famille: 'Aucun CORS', nom: 'pré-vérification depuis un site', methode: 'OPTIONS', chemin: '/api/settings', entetes: { origin: 'https://evil.example', 'access-control-request-method': 'PUT', 'access-control-request-headers': 'x-elite-compagnon' }, attendu: refusGarde(/un site web/, 'Origin') });
  return att;
}

// --- Corps : trop gros, illisible, piégé ---

/** Limites attendues des corps JSON (server/src/core/localGuard.js) : tout changement doit être voulu. */
export const LIMITES = [
  [/^\/api\/modules\/engineering\/ships\/[^/]+\/image$/, 12 * 1024 * 1024],
  [/^\/api\/modules\/waypoints\/captures$/, 12 * 1024 * 1024],
  [/^\/api\/modules\/builder\/inara\/import$/, 4 * 1024 * 1024],
];
const limiteDe = (chemin) => LIMITES.find(([re]) => re.test(chemin))?.[1] ?? 1024 * 1024;

const TROP_GROS = { statuts: [413], texte: 'refus 413 « Requête trop volumineuse. »', message: /^Requête trop volumineuse\.$/ };
const ILLISIBLE = { statuts: [400], texte: 'refus 400 « Corps de la requête illisible (JSON invalide). »', message: /^Corps de la requête illisible \(JSON invalide\)\.$/ };
const ENCODAGE = { statuts: [415], texte: 'refus 415 avec la raison en français', message: /^(Encodage du corps|Jeu de caractères) non pris en charge/ };

export function famillesCorps(routes) {
  const att = [];
  const json = { ...GUARD, 'content-type': 'application/json' };
  for (const r of routes.filter((x) => !LECTURES.has(x.methode))) {
    const chemin = remplir(r.chemin);
    const limite = limiteDe(chemin);
    const gros = `{"x":"${'a'.repeat(limite - 7 + 1024)}"}`;
    att.push({ modele: r.chemin, famille: 'Corps trop gros', nom: `${Math.round(limite / 1048576)} Mo + 1 Ko`, methode: r.methode, chemin, entetes: json, corps: gros, attendu: TROP_GROS });
    att.push({ modele: r.chemin, famille: 'JSON invalide', nom: '{"a":', methode: r.methode, chemin, entetes: json, corps: '{"a":', attendu: ILLISIBLE });
  }
  // Variantes, sur une écriture du cœur
  const c = '/api/settings';
  const bombe = zlib.gzipSync(Buffer.from(`{"x":"${'a'.repeat(64 * 1024 * 1024)}"}`));
  att.push({ famille: 'Corps trop gros', nom: `gzip de ${Math.round(bombe.length / 1024)} Ko qui fait 64 Mo décompressé`, methode: 'PUT', chemin: c, entetes: { ...json, 'content-encoding': 'gzip' }, corps: bombe, attendu: TROP_GROS });
  att.push({ famille: 'Corps trop gros', nom: 'Content-Length annoncé de 100 Go', methode: 'PUT', chemin: c, entetes: { ...json, 'content-length': '100000000000' }, corps: '{}', attendu: TROP_GROS });
  att.push({ famille: 'Corps trop gros', nom: 'Content-Encoding inconnu', methode: 'PUT', chemin: c, entetes: { ...json, 'content-encoding': 'x-inconnu' }, corps: '{}', attendu: ENCODAGE });
  att.push({ famille: 'Corps trop gros', nom: 'Content-Encoding br', methode: 'PUT', chemin: c, entetes: { ...json, 'content-encoding': 'br' }, corps: zlib.brotliCompressSync(Buffer.from('{}')), attendu: { ...ENCODAGE, statuts: [415, 200] } });
  // utf-16 et utf-32 sont lus par Express (ici : '{}' en UTF-8 lu comme de l'UTF-16 = JSON illisible) ; le reste est refusé
  att.push({ famille: 'JSON invalide', nom: 'jeu de caractères utf-16', methode: 'PUT', chemin: c, entetes: { ...json, 'content-type': 'application/json; charset=utf-16' }, corps: '{}', attendu: ILLISIBLE });
  att.push({ famille: 'Corps trop gros', nom: 'jeu de caractères iso-8859-1', methode: 'PUT', chemin: c, entetes: { ...json, 'content-type': 'application/json; charset=iso-8859-1' }, corps: '{}', attendu: { ...ENCODAGE, message: /^Jeu de caractères non pris en charge/ } });
  for (const [corps, nom] of [['null', 'null'], ['"texte"', 'texte seul'], ['1', 'nombre seul'], ['NaN', 'NaN'], ["{'a':1}", 'apostrophes'], ['{"a":1}x', 'texte après l’objet'], ['{"a":1,}', 'virgule finale'], [Buffer.from([0xff, 0xfe, 0x7b, 0x7d]), 'octets qui ne sont pas de l\u2019UTF-8']]) {
    att.push({ famille: 'JSON invalide', nom, methode: 'PUT', chemin: c, entetes: json, corps, attendu: ILLISIBLE });
  }
  att.push({ famille: 'JSON invalide', nom: 'tableaux imbriqués sur 100 000 niveaux', methode: 'PUT', chemin: c, entetes: json, corps: `${'['.repeat(100_000)}${']'.repeat(100_000)}`, attendu: SANS_PLANTAGE });
  att.push({ famille: 'JSON invalide', nom: 'objets imbriqués sur 50 000 niveaux', methode: 'PUT', chemin: c, entetes: json, corps: `${'{"a":'.repeat(50_000)}1${'}'.repeat(50_000)}`, attendu: SANS_PLANTAGE });
  return att;
}

// --- Paramètres de route : chemins piégés, clés de prototype, identifiants hors bornes ---

/** Valeurs « hors bornes » qui sont pourtant légitimes pour un paramètre : le ShipID du jeu commence à 0. */
const VALIDES = { shipId: ['0'] };

export function famillesParametres(routes, M) {
  const att = [];
  const v = valeursPiegees(M);
  for (const r of routes.filter((x) => x.params.length && x.methode !== 'OPTIONS' && x.methode !== 'HEAD')) {
    const base = corpsDe(r.methode);
    const entetes = { ...base.entetes, ...(LECTURES.has(r.methode) ? {} : GUARD) };
    for (const p of r.params) {
      for (const [famille, liste] of [['Chemins piégés', v.chemin], ['Clés de prototype (paramètres)', v.prototype], ['Identifiants hors bornes', v.bornes]]) {
        for (const [valeur, nom] of liste) {
          if (Object.hasOwn(VALIDES, p) && VALIDES[p].includes(valeur)) continue; // valeur légitime pour ce paramètre
          att.push({ modele: r.chemin, famille, nom: `:${p} = ${nom}`, methode: r.methode, chemin: remplir(r.chemin, { [p]: valeur }), entetes, corps: base.corps, attendu: REFUS_PROPRE });
        }
      }
    }
  }
  return att;
}

/** Corps piégés : chaque écriture reçoit tous les champs que son module lit, avec chaque sorte de valeur piégée. */
export function famillesCorpsPieges(routes, champs, M) {
  const att = [];
  const proto = `"__proto__":{"pollue":"${M}"},"constructor":{"prototype":{"pollue":"${M}"}}`;
  const sortes = [
    ['clés __proto__ et constructor', (n) => `{${proto},"toString":"${M}","valueOf":"${M}","hasOwnProperty":"${M}"${n.map((k) => `,"${k}":{${proto}}`).join('')}}`],
    ['valeur « __proto__ »', (n) => JSON.stringify(Object.fromEntries(n.map((k) => [k, '__proto__'])))],
    ['valeur « constructor »', (n) => JSON.stringify(Object.fromEntries(n.map((k) => [k, 'constructor'])))],
    ['valeur « toString »', (n) => JSON.stringify(Object.fromEntries(n.map((k) => [k, 'toString'])))],
    ['nombres infinis (1e999)', (n) => `{${n.map((k) => `"${k}":1e999`).join(',')}}`],
    ['nombres -1e999', (n) => `{${n.map((k) => `"${k}":-1e999`).join(',')}}`],
    ['entiers énormes', (n) => `{${n.map((k) => `"${k}":99999999999999999999`).join(',')}}`],
    ['négatifs', (n) => JSON.stringify(Object.fromEntries(n.map((k) => [k, -1])))],
    ['fractions', (n) => JSON.stringify(Object.fromEntries(n.map((k) => [k, 0.5])))],
    ['tableaux', (n) => JSON.stringify(Object.fromEntries(n.map((k) => [k, []])))],
    ['tableaux d’objets', (n) => JSON.stringify(Object.fromEntries(n.map((k) => [k, [{}, null, '__proto__']])))],
    ['objets', (n) => JSON.stringify(Object.fromEntries(n.map((k) => [k, {}])))],
    ['null', (n) => JSON.stringify(Object.fromEntries(n.map((k) => [k, null])))],
    ['vrai', (n) => JSON.stringify(Object.fromEntries(n.map((k) => [k, true])))],
    ['textes longs', (n) => JSON.stringify(Object.fromEntries(n.map((k) => [k, 'x'.repeat(Math.floor(400_000 / Math.max(1, n.length)))])))],
    ['chemins piégés', (n) => JSON.stringify(Object.fromEntries(n.map((k) => [k, `..\\..\\..\\${M}`])))],
    ['noms réservés', (n) => JSON.stringify(Object.fromEntries(n.map((k) => [k, 'CON'])))],
    ['tableau à la place de l’objet', () => '[]'],
  ];
  for (const r of routes.filter((x) => !LECTURES.has(x.methode))) {
    const noms = champs.corps.get(r.module) || [];
    for (const [nom, corps] of sortes) {
      att.push({ modele: r.chemin, famille: 'Corps piégés', nom, methode: r.methode, chemin: remplir(r.chemin), entetes: { ...GUARD, 'content-type': 'application/json' }, corps: corps(noms), attendu: SANS_PLANTAGE });
    }
  }
  return att;
}

/** Requêtes piégées (?x=…) sur chaque lecture : tableaux, objets, clés de prototype, valeurs hors bornes. */
export function famillesRequetes(routes, champs, M) {
  const att = [];
  const sortes = [
    ['tableaux', (k) => `${k}[]=a&${k}[]=b`],
    ['objets', (k) => `${k}[x]=1`],
    ['clés __proto__', (k) => `${k}[__proto__][pollue]=${M}&${k}[constructor][prototype][pollue]=${M}`],
    ['valeur « __proto__ »', (k) => `${k}=__proto__`],
    ['valeur « constructor »', (k) => `${k}=constructor`],
    ['valeur « toString »', (k) => `${k}=toString`],
    ['chemins piégés', (k) => `${k}=..%5C..%5C${M}`],
    ['nombres hors bornes', (k) => `${k}=1e400`],
    ['négatifs', (k) => `${k}=-1`],
    ['vides', (k) => `${k}=`],
    ['longs', (k) => `${k}=${'a'.repeat(200)}`],
  ];
  const pollution = `__proto__[pollue]=${M}&constructor[prototype][pollue]=${M}&a[__proto__][pollue]=${M}`;
  for (const r of routes.filter((x) => x.methode === 'GET' && !x.chemin.endsWith('/stream'))) {
    const chemin = remplir(r.chemin);
    att.push({ famille: 'Requêtes piégées', nom: 'clés __proto__ dans la requête', methode: 'GET', chemin: `${chemin}?${pollution}`, attendu: SANS_PLANTAGE });
    const noms = champs.requete.get(r.module) || [];
    if (!noms.length) continue;
    for (const [nom, valeur] of sortes) {
      att.push({ famille: 'Requêtes piégées', nom: `${nom} (${noms.join(', ')})`, methode: 'GET', chemin: `${chemin}?${noms.map(valeur).join('&')}`, attendu: SANS_PLANTAGE });
    }
  }
  return att;
}

/** Hors de /api : rien n'est servi (ni base, ni code, ni données). */
export function familleHorsApi() {
  const chemins = ['/', '/index.html', '/elite.db', '/data/elite.db', '/server/data/elite.db', '/.env', '/../server/data/elite.db', '/%2e%2e/server/data/elite.db', '/..%5C..%5Cserver%5Cdata%5Celite.db', '/node_modules/express/package.json', '/src/index.js', '/reference/meta.json', '/compagnon.json', '/escadron-jeton.json'];
  return chemins.map((chemin) => ({ famille: 'Hors de /api', nom: chemin, methode: 'GET', chemin, attendu: { statuts: [404], texte: '404 : rien n’est servi hors de /api', verifier: (rep) => (rep.corps.length > 2000 ? `corps de ${rep.corps.length} octets` : null) } }));
}

// --- Proxy de l'interface (Vite, même proxy /api que client/vite.config.js) ---

/**
 * Attaques rejouées à travers le proxy de l'interface : Vite refuse lui-même un Host étranger (avant son proxy) ; le
 * reste arrive au serveur, qui doit refuser comme en direct. Vite ne doit ajouter AUCUN en-tête CORS, même pour une
 * origine « localhost » d'un autre port (sa règle par défaut les accepte toutes).
 * @param {object[]} routes
 * @param {object} o
 * @param {number} o.portInterface port du proxy
 * @param {string} o.racine        dossier de la worktree (fichiers qui ne doivent jamais sortir par le proxy)
 * @param {Buffer} o.index         index.html servi par le banc (repli d'une application d'une page)
 */
export function famillesProxy(routes, { portInterface, racine, index }) {
  const att = [];
  const ui = `http://localhost:${portInterface}`;
  const viteHost = { statuts: [403], texte: 'refus 403 de Vite (Host non permis), avant le proxy', message: /Blocked request|not allowed|n'est pas autorisé/ };
  for (const [host, nom] of [['evil.example', 'evil.example'], [`evil.example:${portInterface}`, 'evil.example:<port>'], [`127.0.0.1.nip.io:${portInterface}`, '127.0.0.1.nip.io']]) {
    att.push({ famille: 'Host étranger', nom: `${nom} (lecture)`, methode: 'GET', chemin: '/api/state', entetes: { host }, attendu: viteHost });
    att.push({ famille: 'Host étranger', nom: `${nom} (écriture)`, methode: 'PUT', chemin: '/api/settings', entetes: { ...GUARD, 'content-type': 'application/json', host }, corps: '{"hoursPerEvening":7}', attendu: viteHost });
    att.push({ famille: 'Host étranger', nom: `${nom} (page)`, methode: 'GET', chemin: '/', entetes: { host }, attendu: viteHost });
  }
  for (const r of routes) {
    const chemin = remplir(r.chemin);
    const base = corpsDe(r.methode);
    const ecrit = !LECTURES.has(r.methode) ? GUARD : {};
    att.push({ modele: r.chemin, famille: 'Origin étranger', nom: 'Origin: https://evil.example', methode: r.methode, chemin, ...base, entetes: { ...base.entetes, ...ecrit, origin: 'https://evil.example' }, attendu: refusGarde(/un site web/, 'Origin') });
    att.push({ modele: r.chemin, famille: 'Origin « null »', nom: 'Origin: null', methode: r.methode, chemin, ...base, entetes: { ...base.entetes, ...ecrit, origin: 'null' }, attendu: refusGarde(/un site web/, 'Origin null') });
    att.push({ modele: r.chemin, famille: 'Origin étranger', nom: 'Origin: http://evil.localhost (localhost d’un autre site)', methode: r.methode, chemin, ...base, entetes: { ...base.entetes, ...ecrit, origin: `http://evil.localhost:${portInterface + 1}` }, attendu: refusGarde(/un site web/, 'Origin') });
    att.push({ modele: r.chemin, famille: 'Sec-Fetch-Site cross-site', nom: 'Sec-Fetch-Site: cross-site', methode: r.methode, chemin, ...base, entetes: { ...base.entetes, ...ecrit, 'sec-fetch-site': 'cross-site' }, attendu: refusGarde(/autre site web/, 'Sec-Fetch-Site') });
    // Le proxy laisse passer /api (viteGuard.js) : la page d'un autre port qui vise 127.0.0.1:5173/api est refusée par
    // la garde du serveur, comme en direct
    const lecture = r.methode === 'GET' ? `${chemin}${chemin.includes('?') ? '&' : '?'}online=1` : chemin;
    att.push({ modele: r.chemin, famille: 'Sec-Fetch-Site same-site', nom: 'Sec-Fetch-Site: same-site (page d’un autre port de ce PC)', methode: r.methode, chemin: lecture, ...base, entetes: { ...base.entetes, ...ecrit, 'sec-fetch-site': 'same-site', 'sec-fetch-mode': 'no-cors', 'sec-fetch-dest': 'image' }, attendu: refusGarde(/autre programme de ce PC/, 'Sec-Fetch-Site same-site') });
    if (!LECTURES.has(r.methode)) {
      att.push({ modele: r.chemin, famille: 'Écriture sans X-Elite-Compagnon', nom: 'sans l’en-tête, origine de l’interface', methode: r.methode, chemin, ...base, entetes: { ...base.entetes, origin: ui }, attendu: refusGarde(/X-Elite-Compagnon: 1 » manquant/, 'en-tête d’écriture') });
    }
    for (const origin of [ui, `http://localhost:${portInterface + 1}`, `http://evil.localhost:${portInterface}`, 'https://evil.example']) {
      att.push({
        famille: 'Aucun CORS',
        nom: `pré-vérification ${r.methode} depuis ${origin}`,
        methode: 'OPTIONS',
        chemin,
        entetes: { origin, 'access-control-request-method': r.methode, 'access-control-request-headers': 'x-elite-compagnon,content-type' },
        attendu: { statuts: [200, 204, 403, 404], texte: 'pré-vérification sans aucune autorisation CORS (aucun en-tête Access-Control-*)' },
      });
    }
  }
  const json = { ...GUARD, 'content-type': 'application/json', origin: ui };
  att.push({ famille: 'Corps trop gros', nom: '1 Mo + 1 Ko', methode: 'PUT', chemin: '/api/settings', entetes: json, corps: `{"x":"${'a'.repeat(1024 * 1024 + 1024)}"}`, attendu: TROP_GROS });
  att.push({ famille: 'JSON invalide', nom: '{"a":', methode: 'PUT', chemin: '/api/settings', entetes: json, corps: '{"a":', attendu: ILLISIBLE });
  // Fichiers du projet et données : jamais servis par le proxy (au pire la page de l'interface, à l'identique)
  const viaFs = (p) => `/@fs/${String(racine).replace(/\\/g, '/')}/${p}`;
  const rienQueLaPage = { statuts: [200, 403, 404], texte: 'rien d’autre que la page de l’interface (200 à l’identique) ou un refus', verifier: (rep) => (rep.statut === 200 && !rep.corps.equals(index) ? `fichier de ${rep.corps.length} octets servi (${rep.entetes['content-type']})` : null) };
  for (const chemin of ['/elite.db', '/server/data/elite.db', '/.env', '/package.json', '/vite.config.js', '/src/main.jsx', '/node_modules/vite/package.json', viaFs('server/data/reference/meta.json'), viaFs('package.json'), '/api/../server/data/elite.db', '/%2e%2e/%2e%2e/server/data/elite.db', '/..%5C..%5Cserver%5Cdata%5Celite.db', '/@fs/C:/Windows/win.ini']) {
    att.push({ famille: 'Hors de /api', nom: chemin.length > 60 ? `${chemin.slice(0, 57)}…` : chemin, methode: 'GET', chemin, attendu: rienQueLaPage });
  }
  return att;
}

// --- Interface elle-même (pages, modules, routes internes de Vite) : garde de client/viteGuard.js ---

/**
 * Requêtes faites à l'interface par un autre site (ou un autre port de ce PC), en dehors de /api : route de l'éditeur
 * toujours coupée (404), cadre, image, script et fetch d'ailleurs refusés (403), lien suivi accepté, chaque page avec
 * X-Frame-Options DENY et frame-ancestors 'none'. Avec `dev` (serveur de développement, celui de « npm run dev »), en plus
 * les fichiers hors du client par /@fs/ (server/data, racine du dépôt, .git) : jamais servis.
 * @param {object} o
 * @param {string} o.racine     dossier de la worktree
 * @param {string} o.cible      fichier inerte que l'éditeur ouvrirait (son lancement est surveillé à part)
 * @param {string} o.module     un module de l'interface (script) : /src/main.jsx en développement, /index.html sinon
 * @param {boolean} [o.dev]
 */
export function famillesInterface({ racine, cible, module, dev = false }) {
  const att = [];
  const ailleurs = (dest, mode = 'no-cors', site = 'cross-site') => ({ 'sec-fetch-site': site, 'sec-fetch-mode': mode, 'sec-fetch-dest': dest });
  const fichier = encodeURIComponent(String(cible).replace(/\\/g, '/'));
  const COUPEE = { statuts: [404], texte: "404 : la route de l'éditeur est coupée, rien n'est lancé" };
  for (const [chemin, nom] of [[`/__open-in-editor?file=${fichier}`, 'fichier existant'], [`/__open-in-editor?file=${fichier}%5C..%3A1%3A1`, 'suffixe \\..:1:1'], [`/__OPEN-IN-EDITOR?file=${fichier}`, 'majuscules'], [`/%5F_open-in-editor?file=${fichier}`, '%5F encodé'], [`//__open-in-editor?file=${fichier}`, 'double barre']]) {
    att.push({ famille: 'Interface : éditeur jamais lancé', nom: `${nom}, balise img d'un autre site`, methode: 'GET', chemin, entetes: { ...ailleurs('image'), origin: 'https://evil.example' }, attendu: COUPEE });
    att.push({ famille: 'Interface : éditeur jamais lancé', nom: `${nom}, sans en-tête`, methode: 'GET', chemin, attendu: COUPEE });
  }
  const ANTI_CADRE = (rep) => {
    const xfo = String(rep.entetes['x-frame-options'] || '').toUpperCase();
    const csp = String(rep.entetes['content-security-policy'] || '');
    return xfo === 'DENY' && /frame-ancestors 'none'/.test(csp) ? null : `X-Frame-Options « ${xfo} », Content-Security-Policy « ${csp} »`;
  };
  const REFUS = { statuts: [403], texte: "refus 403 de la garde de l'interface (autre site)", message: /autre site|site web/ };
  for (const site of ['cross-site', 'same-site']) {
    att.push({ famille: 'Interface : page encadrée', nom: `iframe (${site})`, methode: 'GET', chemin: '/escadron', entetes: ailleurs('iframe', 'navigate', site), attendu: REFUS });
    att.push({ famille: 'Interface : page encadrée', nom: `frame (${site})`, methode: 'GET', chemin: '/', entetes: ailleurs('frame', 'navigate', site), attendu: REFUS });
    att.push({ famille: 'Interface : requête d’un autre site', nom: `image (${site})`, methode: 'GET', chemin: '/', entetes: ailleurs('image', 'no-cors', site), attendu: REFUS });
    att.push({ famille: 'Interface : requête d’un autre site', nom: `script (${site})`, methode: 'GET', chemin: module, entetes: ailleurs('script', 'cors', site), attendu: REFUS });
  }
  att.push({ famille: 'Interface : requête d’un autre site', nom: 'fetch avec Origin étranger', methode: 'GET', chemin: module, entetes: { origin: 'https://evil.example' }, attendu: REFUS });
  att.push({ famille: 'Interface : requête d’un autre site', nom: 'Origin « null » (fichier local)', methode: 'GET', chemin: module, entetes: { origin: 'null' }, attendu: REFUS });
  for (const chemin of ['/', '/escadron']) {
    att.push({ famille: 'Interface : page encadrée', nom: `en-têtes anti-cadre de ${chemin}`, methode: 'GET', chemin, attendu: { statuts: [200], texte: "200 avec X-Frame-Options DENY et frame-ancestors 'none'", verifier: ANTI_CADRE } });
    att.push({ famille: 'Interface : requête d’un autre site', nom: `lien suivi depuis un autre site vers ${chemin}`, methode: 'GET', chemin, entetes: ailleurs('document', 'navigate'), attendu: { statuts: [200], texte: '200 : un lien simple ouvre la page (sans cadre possible)', verifier: ANTI_CADRE } });
  }
  if (dev) {
    const viaFs = (p) => `/@fs/${String(racine).replace(/\\/g, '/')}/${p}`;
    // 403 de Vite, ou la page de l'interface (repli d'une application d'une page) : jamais le fichier
    const jamais = (temoin) => ({ statuts: [200, 403, 404], texte: 'refus, ou seulement la page de l’interface : jamais le fichier', verifier: (rep) => (rep.statut === 200 && (temoin.test(rep.texte) || !/<div id="root">/.test(rep.texte)) ? `fichier de ${rep.corps.length} octets servi (${rep.entetes['content-type']})` : null) });
    for (const [p, temoin, nom] of [
      ['server/data/reference/meta.json', /"downloadedAt"|"version"/, 'données de référence'],
      ['server/data/escadron-jeton.json', /"token"/, "jeton d'escadron"],
      ['server/data/elite.db', /SQLite format/, 'base'],
      ['server/src/core/net.js', /NETWORK_HOSTS/, 'code du serveur'],
      ['package.json', /"workspaces"/, 'racine du dépôt'],
      ['.git', /gitdir:|\[core\]/, '.git'],
      ['GIT~1/config', /\[core\]|gitdir/, 'nom court GIT~1'],
      ['server::$INDEX_ALLOCATION/data/reference/meta.json', /"downloadedAt"|"version"/, 'flux NTFS ::$INDEX_ALLOCATION'],
      ['client/../server/data/reference/meta.json', /"downloadedAt"|"version"/, 'client/../'],
      ['client/%2e%2e/server/data/reference/meta.json', /"downloadedAt"|"version"/, 'client/%2e%2e/'],
    ]) {
      att.push({ famille: 'Interface : fichiers hors du client (/@fs/)', nom, methode: 'GET', chemin: viaFs(p), attendu: jamais(temoin) });
    }
    att.push({ famille: 'Interface : fichiers hors du client (/@fs/)', nom: 'C:/Windows/win.ini', methode: 'GET', chemin: '/@fs/C:/Windows/win.ini', attendu: jamais(/\[fonts\]|for 16-bit/i) });
    // Jonctions d'espace de travail : dans une worktree, node_modules contient elite-companion-server/-overlay/-client,
    // jonctions vers server/, overlay/, client/. /@fs/<node_modules réel>/elite-companion-server/… servait l'arborescence
    // du serveur (jeton, base) malgré fs.allow (Vite ne compare que des chaînes). Nom court 8.3, flux NTFS et « .. »
    // mènent au même fichier : tous doivent être refusés (la garde résout le vrai chemin). Sautés hors worktree (pas de
    // jonction : les chemins n'existent pas, Vite répond 404/403, aucun fichier servi).
    let nm = null;
    try { nm = fs.realpathSync(path.join(racine, 'node_modules')).replace(/\\/g, '/'); } catch { nm = null; }
    if (nm) {
      const NOM_PAQUET = /"name":\s*"elite-companion-(server|overlay)"/;
      const viaNm = (p) => `/@fs/${nm}/${p}`;
      for (const [p, temoin, nom] of [
        ['elite-companion-server/package.json', NOM_PAQUET, "jonction d'espace de travail (serveur)"],
        ['elite-companion-server/data/elite.db', /SQLite format/, 'base par la jonction serveur'],
        ['elite-companion-server/data/escadron-jeton.json', /"token"/, 'jeton par la jonction serveur'],
        ['elite-companion-overlay/package.json', NOM_PAQUET, "jonction d'espace de travail (overlay)"],
        ['ELITE-~1/package.json', NOM_PAQUET, 'jonction par son nom court 8.3 (ELITE-~1)'],
        ['elite-companion-server::$INDEX_ALLOCATION/package.json', NOM_PAQUET, 'jonction serveur par un flux NTFS'],
        ['../server/data/elite.db', /SQLite format/, 'node_modules/../server (base)'],
        ['%2e%2e/server/data/elite.db', /SQLite format/, 'node_modules/%2e%2e/server (base)'],
      ]) {
        att.push({ famille: 'Interface : fichiers hors du client (/@fs/)', nom, methode: 'GET', chemin: viaNm(p), attendu: jamais(temoin) });
      }
    }
    // Chemin UNC / espace de noms par /@fs/ : refusé sans que la garde touche au disque (pas de connexion SMB). Espace
    // de noms local (\\.\), jamais un hôte réel : rien ne part sur le réseau même si ce cas était rejoué sans la garde.
    for (const [chemin, nom] of [['/@fs///./sonde-unc/partage/x.js', 'UNC //./ (espace de noms)'], ['/@fs/%5C%5C.%5Csonde-unc%5Cpartage%5Cx.js', 'UNC \\\\.\\ encodé']]) {
      att.push({ famille: 'Interface : fichiers hors du client (/@fs/)', nom, methode: 'GET', chemin, attendu: jamais(/sonde-unc|partage/) });
    }
    att.push({ famille: 'Interface : fichiers hors du client (/@fs/)', nom: 'module du client (servi)', methode: 'GET', chemin: '/src/main.jsx', attendu: { statuts: [200], texte: '200 : le client reste servi', verifier: (rep) => (/createRoot|react/i.test(rep.texte) ? null : 'module du client illisible') } });
  }
  return att;
}
