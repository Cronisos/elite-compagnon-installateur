// Source temps réel (Server-Sent Events, /api/stream) qui survit aux coupures : sans React ni page, pour servir
// telle quelle dans une page (repli) ou dans le SharedWorker qui la partage entre toutes les fenêtres (streamWorker.js).

export const RETRY_MS = 2000;
export const SILENCE_MS = 30000; // le serveur envoie un ping toutes les 10 s
// Plus rien depuis 15 s (un ping et demi) : la connexion est dite perdue (voyant, fenêtres de l'overlay), sans attendre
// la réouverture. Le proxy de Vite garde ouverte la connexion d'un serveur arrêté ou planté : sans cela, l'app ne le
// voyait qu'au bout de SILENCE_MS. Le premier message suivant la dit de nouveau ouverte.
export const STALE_MS = 15000;

/**
 * @param {object} o
 * @param {typeof EventSource} [o.EventSourceImpl] EventSource du navigateur (ou un faux, pour les tests)
 * @param {(type: string, data: string) => void} o.onMessage message reçu (texte JSON brut)
 * @param {(connected: boolean) => void} o.onStatus connexion ouverte ou perdue
 * @returns {{ want(type: string): void, start(): void, close(): void }}
 */
export function createStreamSource({ EventSourceImpl = globalThis.EventSource, url = '/api/stream', onMessage, onStatus }) {
  const types = new Set();
  let source = null;
  let silence = null; // une seule minuterie : « perdue » à STALE_MS, puis réouverture à SILENCE_MS
  let isStale = false;
  let retry = null;
  let closed = false;

  /** Le proxy de Vite peut garder une connexion morte ouverte : sans ping, on la rouvre. */
  function watchSilence() {
    clearTimeout(silence);
    if (isStale) {
      isStale = false;
      onStatus(true); // un message est arrivé : la connexion vit
    }
    silence = setTimeout(() => {
      isStale = true;
      onStatus(false);
      silence = setTimeout(reopen, SILENCE_MS - STALE_MS);
    }, STALE_MS);
  }

  function reopen() {
    clearTimeout(silence);
    isStale = false;
    source?.close();
    source = null;
    onStatus(false);
    if (closed) return;
    // Deux réouvertures rapprochées n'ouvrent qu'une source : open() ne fait rien s'il y en a déjà une
    retry = setTimeout(() => {
      retry = null;
      open();
    }, RETRY_MS);
  }

  function bind(type) {
    source.addEventListener(type, (e) => {
      watchSilence();
      onMessage(type, e.data);
    });
  }

  function open() {
    if (source || closed) return;
    const current = new EventSourceImpl(url);
    source = current;
    current.addEventListener('ping', watchSilence);
    watchSilence();
    current.onopen = () => onStatus(true);
    current.onerror = () => {
      onStatus(false);
      // Sur une coupure simple, le navigateur se reconnecte seul. Sur une erreur HTTP, par exemple
      // pendant un redémarrage du serveur, il abandonne pour de bon : il faut rouvrir la connexion.
      if (current.readyState === EventSourceImpl.CLOSED) reopen();
    };
    for (const type of types) bind(type);
  }

  return {
    /** Recevoir aussi ce type de message (la connexion s'ouvre au premier). */
    want(type) {
      if (!types.has(type)) {
        types.add(type);
        if (source) bind(type);
      }
      open();
    },
    start: open,
    close() {
      closed = true;
      clearTimeout(silence);
      clearTimeout(retry);
      source?.close();
      source = null;
    },
  };
}
