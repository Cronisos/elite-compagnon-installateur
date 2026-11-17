// Ports de l'app de bureau : 3001 (serveur) et 5173 (interface) d'habitude. Si l'un est pris par un autre programme
// (Discord, un autre outil de développement…), l'app en prend un libre juste après (3002…, 5174…) au lieu de refuser
// de démarrer. Les ports choisis sont passés au serveur, à l'interface et à l'overlay (ELITE_PORT, ELITE_UI_PORT),
// qui n'écoutent et ne joignent que 127.0.0.1.

const net = require('node:net');

const DEFAUT = Object.freeze({ serveur: 3001, interface: 5173 });
const ESSAIS = 50; // au plus 50 ports essayés après celui d'habitude

/** Le port est-il libre sur 127.0.0.1 ? (on essaie d'y écouter, puis on le rend tout de suite) */
function portLibre(port, hote = '127.0.0.1') {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.unref();
    s.once('error', () => resolve(false));
    s.listen({ port, host: hote, exclusive: true }, () => s.close(() => resolve(true)));
  });
}

const portValide = (p) => Number.isInteger(p) && p >= 1024 && p <= 65535;

/**
 * Premier port libre à partir de `depart` (lui compris), en sautant `eviter` ; null si aucun dans les ESSAIS suivants.
 * `libre` : remplaçable dans les tests.
 */
async function premierLibre(depart, { eviter = [], libre = portLibre } = {}) {
  for (let p = depart; p < depart + ESSAIS && p <= 65535; p++) {
    if (eviter.includes(p)) continue;
    if (await libre(p)) return p;
  }
  return null;
}

/**
 * Ports de ce lancement : ceux d'habitude, sinon les premiers libres après eux. Rend { serveur, interface, changes }
 * (changes : la liste des ports d'habitude pris, pour le journal). Erreur claire si rien n'est libre.
 */
async function choisirPorts({ habitude = DEFAUT, libre = portLibre } = {}) {
  const serveur = await premierLibre(habitude.serveur, { libre });
  if (serveur === null) throw new Error(`Aucun port libre entre ${habitude.serveur} et ${habitude.serveur + ESSAIS - 1} pour le serveur de l'app.`);
  const iface = await premierLibre(habitude.interface, { eviter: [serveur], libre });
  if (iface === null) throw new Error(`Aucun port libre entre ${habitude.interface} et ${habitude.interface + ESSAIS - 1} pour l'interface de l'app.`);
  const changes = [];
  if (serveur !== habitude.serveur) changes.push({ quoi: 'serveur', habituel: habitude.serveur, pris: serveur });
  if (iface !== habitude.interface) changes.push({ quoi: 'interface', habituel: habitude.interface, pris: iface });
  return { serveur, interface: iface, changes };
}

module.exports = { DEFAUT, ESSAIS, choisirPorts, portLibre, portValide, premierLibre };
