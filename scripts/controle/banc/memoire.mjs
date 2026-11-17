// Préchargé dans le serveur isolé du banc avec demarrerServeur({ memoire: true }) (node --expose-gc --import) : mesure
// de la mémoire que le serveur GARDE. Sur la demande { type: 'memoire', id } du canal IPC (srv.demander('memoire')), il
// nettoie sa mémoire (ramasse-miettes complet, deux fois, avec une pause entre les deux pour laisser partir ce que les
// références faibles tenaient encore), puis répond { type: 'memoire', id, tasMo, rssMo, limiteMo }.
// Jamais chargé par l'app elle-même ; rien n'est lu ni écrit sur le disque.

import v8 from 'node:v8';

const MO = 1024 * 1024;

if (process.send) {
  process.on('message', async (m) => {
    if (m?.type !== 'memoire' || typeof m.id !== 'string') return;
    if (typeof globalThis.gc !== 'function') {
      process.send({ type: 'memoire', id: m.id, erreur: 'ramasse-miettes indisponible (node --expose-gc attendu)' });
      return;
    }
    globalThis.gc();
    await new Promise((r) => setImmediate(r));
    globalThis.gc();
    const u = process.memoryUsage();
    process.send({ type: 'memoire', id: m.id, tasMo: u.heapUsed / MO, rssMo: u.rss / MO, limiteMo: v8.getHeapStatistics().heap_size_limit / MO });
  });
}
