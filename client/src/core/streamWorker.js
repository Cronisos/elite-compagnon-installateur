// Connexion temps réel partagée (SharedWorker) : UNE seule connexion /api/stream pour toutes les pages et fenêtres de
// l'app ouvertes dans un même navigateur, au lieu d'une par page. En HTTP/1.1 (Vite, le serveur), un navigateur ne
// garde que 6 connexions par adresse : les fenêtres de l'overlay (Electron, une seule session) en ouvrent souvent plus
// (Minage Rhino : 6 fenêtres, plus le Coup d'œil et le Compagnon), et chaque flux en garderait une pour lui ; plus
// aucune requête ne passait alors, ni pour les données, ni pour charger une nouvelle fenêtre.
//
// Messages d'une page : { types: [...] } (elle se présente, ou se représente en revenant du cache), { want: type },
// { bye: true } (elle se ferme). Vers une page : { status: true|false } (connexion), { type, data } (message, texte
// JSON brut, seulement les types qu'elle a demandés).

import { createStreamSource } from './streamSource.js';

const ports = new Map(); // port → Set(types)
let connected = false;

const source = createStreamSource({
  onMessage: (type, data) => {
    for (const [port, types] of ports) if (types.has(type)) port.postMessage({ type, data });
  },
  onStatus: (v) => {
    connected = v;
    for (const port of ports.keys()) port.postMessage({ status: v });
  },
});

function want(port, type) {
  if (typeof type !== 'string' || !type) return;
  ports.get(port).add(type);
  source.want(type);
}

self.onconnect = (e) => {
  const port = e.ports[0];
  port.onmessage = ({ data }) => {
    if (!data || typeof data !== 'object') return;
    if (data.bye) {
      ports.delete(port);
      return;
    }
    if (!ports.has(port)) ports.set(port, new Set());
    if (Array.isArray(data.types)) {
      for (const t of data.types) want(port, t);
      port.postMessage({ status: connected }); // la page sait tout de suite si la connexion est ouverte
    }
    if (Object.hasOwn(data, 'want')) want(port, data.want);
  };
  port.start();
};

source.start();
