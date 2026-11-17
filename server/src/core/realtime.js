// Diffusion en temps réel vers le navigateur (Server-Sent Events).
//
// Un client qui ne lit plus (console figée par une sélection de texte, script local bloqué, fenêtre gelée) faisait
// garder au serveur TOUS les messages qui lui étaient destinés, sans limite, jusqu'à la fermeture de sa connexion ; et
// le nombre de clients n'avait pas de plafond. Désormais :
//   - avant chaque message, un client dont le retard dépasse MAX_BACKLOG_BYTES (1 Mo pas encore remis au système), ou
//     bloqué depuis plus de STALL_MS (write() a rendu false, sans « drain » depuis), est coupé et oublié. Le navigateur
//     se reconnecte de lui-même (EventSource, client/src/core/streamSource.js) et repart de l'état actuel ;
//   - au-delà de MAX_CLIENTS connexions ouvertes, une nouvelle est refusée (503, raison en français). Toutes les pages
//     d'un même navigateur partagent UNE connexion (SharedWorker) : 32 laisse une large marge.
// Le ping régulier (10 s) fait aussi ce contrôle quand rien d'autre n'est diffusé.

export const MAX_CLIENTS = 32;
export const MAX_BACKLOG_BYTES = 1024 * 1024;
export const STALL_MS = 30_000;
export const PING_MS = 10_000;

const clients = new Map(); // réponse → { stalledSince: heure du premier write() refusé sans « drain » depuis, ou null }
let now = Date.now;

/** Tests : horloge simulée. Sans argument : la vraie. */
export function setRealtimeClockForTest(fn) {
  now = fn ?? Date.now;
}

/** Nombre de connexions au flux ouvertes (tests). */
export const streamClientCount = () => clients.size;

export function sseHandler(req, res) {
  if (clients.size >= MAX_CLIENTS) {
    res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': '10' });
    res.end(JSON.stringify({ error: `Trop de connexions au flux temps réel (${MAX_CLIENTS}) : ferme des onglets ou des fenêtres de l'app, puis recharge la page.` }));
    return;
  }
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  const client = { stalledSince: null };
  clients.set(res, client);
  req.on('close', () => clients.delete(res));
  res.on('close', () => clients.delete(res));
  send(res, client, 'retry: 2000\n\n');
}

/** Écrit, et note le moment où le système ne prend plus rien (write() rend false) jusqu'au prochain « drain ». */
function send(res, client, msg) {
  if (res.write(msg) || client.stalledSince !== null) return;
  client.stalledSince = now();
  res.once('drain', () => {
    client.stalledSince = null;
  });
}

/** Client qui ne lit plus : trop de retard, ou bloqué trop longtemps. Rend la raison, ou null. */
function lagging(res, client, t) {
  const backlog = Number(res.writableLength) || 0;
  if (backlog > MAX_BACKLOG_BYTES) return `${Math.round(backlog / 1024)} Ko en attente`;
  if (client.stalledSince !== null && t - client.stalledSince > STALL_MS) return `bloqué depuis ${Math.round((t - client.stalledSince) / 1000)} s`;
  return null;
}

function drop(res, why) {
  clients.delete(res);
  console.warn(`Flux temps réel : un client ne lit plus (${why}), connexion coupée ; le navigateur se reconnectera.`);
  try {
    res.destroy();
  } catch {
    // déjà fermée
  }
}

/** Envoie un message typé à tous les navigateurs connectés. */
export function broadcast(type, data) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(data ?? null)}\n\n`;
  const t = now();
  for (const [res, client] of clients) {
    const why = lagging(res, client, t);
    if (why) drop(res, why);
    else send(res, client, msg);
  }
}

// Message régulier : il garde la connexion ouverte, prouve au navigateur qu'elle vit encore, et coupe un client bloqué
setInterval(() => broadcast('ping'), PING_MS).unref();
