// Pont de la page cachée de capture (vision.html) : recevoir un ordre du processus principal, lui rendre la réponse.
// Rien d'autre n'est exposé à la page.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('visionJeu', {
  surOrdre: (fn) => ipcRenderer.on('vision-ordre', (_event, n, ordre, donnees) => fn(n, ordre, donnees)),
  repondre: (n, reponse) => ipcRenderer.send('vision-reponse', n, reponse),
});
