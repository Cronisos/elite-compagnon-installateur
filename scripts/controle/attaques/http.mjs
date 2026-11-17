// Requêtes brutes des attaques : node:http, sans rien de ce que fait fetch à notre place. Le chemin part tel quel
// (« ../ », « %2e%2e », « \ » ne sont ni normalisés ni réencodés), l'en-tête Host est celui qu'on donne (ou aucun), le
// corps est envoyé octet pour octet, même faux. La réponse est bornée (une réponse énorme est une anomalie en soi).

import http from 'node:http';

export const REPONSE_MAX = 32 * 1024 * 1024;

/**
 * @param {object} r
 * @param {string} r.base        http://127.0.0.1:<port>
 * @param {string} r.methode
 * @param {string} r.chemin      envoyé tel quel
 * @param {object} [r.entetes]   en-têtes (valeur tableau : en-tête répété) ; host: null pour n'en envoyer aucun
 * @param {Buffer|string} [r.corps]
 * @returns {Promise<{ statut, entetes, corps: Buffer, texte: string, json: any, ms: number }>}
 */
// Connexion jamais établie, côté banc : près de 10 000 requêtes, chacune sur sa propre connexion (agent: false), épuisent
// les ports locaux de Windows (17 000 connexions en TIME_WAIT relevées le 9 nov. 2026) et un connect() échoue au hasard
// (ETIMEDOUT, EADDRINUSE, ENOBUFS). Seul ce cas est rejoué, 3 fois au plus : une requête que le serveur a reçue (socket
// connectée) ne l'est jamais, une absence de réponse reste une anomalie du serveur.
const CONNEXION_RATEE = new Set(['ETIMEDOUT', 'EADDRINUSE', 'EADDRNOTAVAIL', 'ENOBUFS']);
const ESSAIS = 4;

export async function envoyer(r) {
  for (let essai = 1; ; essai++) {
    try {
      return await envoyerUneFois(r);
    } catch (err) {
      if (!err.jamaisConnecte || !CONNEXION_RATEE.has(err.code) || essai >= ESSAIS) throw err;
      await new Promise((ok) => setTimeout(ok, 500 * essai));
    }
  }
}

function envoyerUneFois({ base, methode = 'GET', chemin, entetes = {}, corps, delaiMs = 60_000 }) {
  const { hostname, port } = new URL(base);
  const enTetes = { ...entetes };
  const sansHost = Object.hasOwn(enTetes, 'host') && enTetes.host === null;
  if (sansHost) delete enTetes.host;
  const charge = corps === undefined ? null : Buffer.isBuffer(corps) ? corps : Buffer.from(String(corps), 'utf8');
  if (charge && !Object.keys(enTetes).some((k) => k.toLowerCase() === 'content-length')) enTetes['content-length'] = String(charge.length);
  const debut = Date.now();
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname, port, method: methode, path: chemin, headers: enTetes, setHost: !sansHost, agent: false }, (res) => {
      const morceaux = [];
      let total = 0;
      res.on('data', (d) => {
        total += d.length;
        if (total > REPONSE_MAX) {
          req.destroy(new Error(`réponse de plus de ${REPONSE_MAX / 1048576} Mo`));
          return;
        }
        morceaux.push(d);
      });
      res.on('end', () => {
        const buf = Buffer.concat(morceaux);
        const texte = buf.toString('utf8');
        let json;
        if (/json/.test(res.headers['content-type'] || '')) {
          try { json = JSON.parse(texte); } catch { /* corps non JSON */ }
        }
        resolve({ statut: res.statusCode, entetes: res.headers, corps: buf, texte, json, ms: Date.now() - debut });
      });
      res.on('error', reject);
    });
    let connecte = false;
    req.on('socket', (sock) => {
      if (!sock.connecting) connecte = true;
      else sock.once('connect', () => { connecte = true; });
    });
    req.setTimeout(delaiMs, () => req.destroy(new Error(`pas de réponse en ${delaiMs / 1000} s`)));
    req.on('error', (err) => reject(Object.assign(err, { jamaisConnecte: !connecte })));
    if (charge) req.write(charge);
    req.end();
  });
}

/**
 * Écoute le flux temps réel (/api/stream) et garde tout ce qu'il envoie : pour vérifier qu'un secret n'y passe jamais.
 * Rend { texte(), fermer() }.
 */
export function ecouterFlux(base, chemin = '/api/stream') {
  const { hostname, port } = new URL(base);
  let texte = '';
  const req = http.request({ hostname, port, method: 'GET', path: chemin, agent: false }, (res) => {
    res.setEncoding('utf8');
    res.on('data', (d) => {
      if (texte.length < REPONSE_MAX) texte += d;
    });
    res.on('error', () => {});
  });
  req.on('error', () => {});
  req.end();
  return { texte: () => texte, fermer: () => req.destroy() };
}
