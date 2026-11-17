// Canal permanent du serveur de l'app vers l'overlay (audit M16) : l'overlay lancé se branche sur GET
// /api/overlay/stream (127.0.0.1, port du serveur) et y reçoit les ordres du serveur, avec les mêmes arguments qu'un
// lancement (--only=…, --at=…, --masque=…). Avant, chaque ordre lançait un Node puis un Electron qui transmettait ses
// arguments à l'overlay déjà lancé et s'arrêtait : 190 à 220 ms et deux processus par ordre, en plein jeu, environ 80
// lancements sur une route de 20 sauts. Le serveur ne lance plus l'overlay que si aucun n'est branché (premier
// démarrage, ou serveur relancé avant que l'overlay se rebranche : l'ordre arrive alors comme avant, par un lancement).
//
// Serveur arrêté ou relancé : nouvel essai toutes les `reessaiMs`. Rien ne part vers l'extérieur : 127.0.0.1 seulement,
// et le flux ne fait que recevoir.

const http = require('node:http');
const { serverPort } = require('./closed.js');

const CHEMIN = '/api/overlay/stream';
const MAX_TAMPON = 64 * 1024; // un ordre fait quelques centaines d'octets
const MAX_ARGS = 20;
const MAX_ARG = 2000;

/** Ordre reçu bien formé : une liste courte de textes courts (sinon ignoré). */
function ordreValide(msg) {
  const args = msg && typeof msg === 'object' ? msg.args : null;
  return Array.isArray(args) && args.length <= MAX_ARGS && args.every((a) => typeof a === 'string' && a.length <= MAX_ARG) ? args : null;
}

/**
 * Lit les messages d'un flux SSE morceau par morceau : rend une fonction (morceau) → liste des ordres complets reçus.
 * Les commentaires (« : ping ») et les lignes illisibles sont ignorés.
 */
function lecteurFlux() {
  let tampon = '';
  return (morceau) => {
    tampon += morceau;
    const ordres = [];
    let fin;
    while ((fin = tampon.indexOf('\n\n')) >= 0) {
      const bloc = tampon.slice(0, fin);
      tampon = tampon.slice(fin + 2);
      const data = bloc.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('');
      if (!data) continue;
      try {
        const args = ordreValide(JSON.parse(data));
        if (args) ordres.push(args);
      } catch {
        // ligne illisible : ignorée
      }
    }
    if (tampon.length > MAX_TAMPON) throw new Error('message trop long');
    return ordres;
  };
}

/**
 * Se branche sur le canal et appelle onOrdre(args) à chaque ordre, dans l'ordre d'arrivée. Rend { fermer(), branche() } :
 * fermer() coupe le canal pour de bon (overlay qui quitte), branche() dit s'il est branché en ce moment.
 * @param {{ onOrdre: (args: string[]) => void, port?: number, reessaiMs?: number, chemin?: string }} o
 */
function ouvrirCanal({ onOrdre, port = serverPort(), reessaiMs = 2000, chemin = CHEMIN }) {
  let ferme = false;
  let req = null;
  let timer = null;
  let branche = false;

  const plusTard = () => {
    branche = false;
    req = null;
    if (ferme) return;
    clearTimeout(timer);
    timer = setTimeout(connecter, reessaiMs);
    timer.unref?.();
  };

  function connecter() {
    timer = null;
    if (ferme) return;
    const lire = lecteurFlux();
    let fini = false;
    const fin = () => {
      if (fini) return;
      fini = true;
      plusTard();
    };
    req = http.get({ host: '127.0.0.1', port, path: chemin, headers: { Accept: 'text/event-stream', 'X-Elite-Compagnon': '1' } }, (res) => {
      if (res.statusCode !== 200) {
        res.resume(); // serveur d'une version sans canal (404), ou refus : nouvel essai plus tard
        return;
      }
      branche = true;
      res.setEncoding('utf8');
      res.on('data', (morceau) => {
        let ordres;
        try {
          ordres = lire(morceau);
        } catch {
          req?.destroy();
          return;
        }
        for (const args of ordres) {
          try {
            onOrdre(args);
          } catch (err) {
            console.warn(`Overlay : ordre du canal non appliqué (${err.message})`);
          }
        }
      });
      res.on('error', () => {});
    });
    req.on('error', () => {});
    req.on('close', fin);
  }

  connecter();
  return {
    fermer() {
      ferme = true;
      clearTimeout(timer);
      req?.destroy();
      branche = false;
    },
    branche: () => branche,
  };
}

module.exports = { CHEMIN, lecteurFlux, ordreValide, ouvrirCanal };
