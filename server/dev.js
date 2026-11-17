// Lancement en développement : relance le serveur quand le code change, et après un plantage (core/devSupervisor.js).
// Remplace node --watch : OneDrive touche les fichiers qu'il synchronise sans changer leur contenu,
// ce qui relançait le serveur pour rien et coupait le temps réel.

import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { fingerprint } from './src/core/fingerprint.js';
import { superviseServer } from './src/core/devSupervisor.js';

const DIR = 'src';
const SETTLE_MS = 300; // un enregistrement déclenche plusieurs notifications

let timer;
let current = fingerprint(DIR);
const server = superviseServer({ spawnChild: () => spawn(process.execPath, ['src/index.js'], { stdio: 'inherit' }) });

watch(DIR, { recursive: true }, () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    let next;
    try {
      next = fingerprint(DIR);
    } catch (err) {
      // Fichier effacé ou renommé pendant la lecture (enregistrement d'un éditeur) : la notification suivante recompte.
      // Sans cette garde, l'erreur arrêtait dev.js, et l'interface avec lui (concurrently -k).
      console.error(`Surveillance du code : lecture ratée (${err.code || err.message}), on réessaie au prochain changement`);
      return;
    }
    if (next === current) return;
    current = next;
    console.log('Code modifié : redémarrage du serveur');
    server.restart();
  }, SETTLE_MS);
});

process.on('exit', () => server.child()?.kill());
server.start();
