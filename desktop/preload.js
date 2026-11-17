// Seul pont entre l'app de bureau et ses pages : boutons de la fenêtre (réduire, agrandir, fermer, premier plan), page
// détachée, site externe, rapport de la semaine en GIF pour Discord, et pour la barre de menu (en haut à droite de l'écran) : ouvrir une page dans la fenêtre
// principale, sa taille, la bascule « tout cacher / tout réafficher ». Le processus principal (main.js)
// vérifie l'expéditeur de chaque message.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('eliteBureau', {
  reduire: () => ipcRenderer.send('bureau:fenetre', 'reduire'),
  agrandir: () => ipcRenderer.send('bureau:fenetre', 'agrandir'),
  fermer: () => ipcRenderer.send('bureau:fenetre', 'fermer'),
  premierPlan: () => ipcRenderer.send('bureau:fenetre', 'premierPlan'),
  etat: () => ipcRenderer.invoke('bureau:etat'),
  detacher: (chemin) => ipcRenderer.invoke('bureau:detacher', String(chemin).slice(0, 200)),
  surAgrandie: (fn) => ecouter('bureau:agrandie', (v) => fn(Boolean(v))),
  surPremierPlan: (fn) => ecouter('bureau:premierPlan', (v) => fn(Boolean(v))),
  // Version de l'app (paquet.json du paquet de l'escadron) et son empreinte, vérifiée sur les fichiers (Paramètres)
  version: () => ipcRenderer.invoke('bureau:version'),
  // Site externe (page « Inara »…) : zone réservée par la page, en pixels de la fenêtre ; l'identifiant seulement
  site: {
    afficher: (id, r) => ipcRenderer.send('bureau:site:afficher', String(id), { x: Number(r?.x), y: Number(r?.y), width: Number(r?.width), height: Number(r?.height) }),
    cacher: (id) => ipcRenderer.send('bureau:site:cacher', String(id)),
    commande: (id, c) => ipcRenderer.send('bureau:site:commande', String(id), String(c)),
    surEtat: (fn) => {
      const f = (_e, etat) => fn(etat);
      ipcRenderer.on('bureau:site:etat', f);
      return () => ipcRenderer.removeListener('bureau:site:etat', f);
    },
  },
  // Page de chargement
  surEtape: (fn) => ecouter('bureau:etape', (t) => fn(String(t))),
  // Barre de menu : page à ouvrir dans la fenêtre principale (chemin vérifié par main.js), taille de la barre
  naviguer: (chemin) => ipcRenderer.send('bureau:naviguer', String(chemin).slice(0, 200)),
  tailleBarre: (w, h) => ipcRenderer.send('bureau:barre:taille', Number(w) || 0, Number(h) || 0),
  surFermerMenu: (fn) => ecouter('bureau:barre:fermer', () => fn()),
  basculer: () => ipcRenderer.send('bureau:basculer'),
  menuLanceur: () => ipcRenderer.send('bureau:menuLanceur'),
  surCache: (fn) => ecouter('bureau:cache', (v) => fn(Boolean(v))),
  // Réglage du MAR (Paramètres) : coin de l'écran et décalage ; le MAR suit son coin pour ouvrir ses menus
  lireMar: () => ipcRenderer.invoke('bureau:mar:lire'),
  reglerMar: (r) => ipcRenderer.send('bureau:mar:regler', { coin: String(r?.coin ?? ''), decalage: Number(r?.decalage) || 0, decalageY: Number(r?.decalageY) || 0, ecran: Number.isInteger(r?.ecran) ? r.ecran : null }),
  // Écrans du PC, et envoi de la fenêtre principale sur l'un d'eux (Paramètres)
  lireEcrans: () => ipcRenderer.invoke('bureau:ecrans:lire'),
  principaleSurEcran: (numero) => ipcRenderer.send('bureau:principale:ecran', Number.isInteger(numero) ? numero : null),
  surCoinMar: (fn) => ecouter('bureau:mar:coin', (c) => fn(String(c))),
  // Pavé tactile (Paramètres) : fenêtre de menus à gros boutons, pour un petit écran tactile
  lirePave: () => ipcRenderer.invoke('bureau:pave:lire'),
  reglerPave: (actif) => ipcRenderer.send('bureau:pave:regler', actif === true),
  surPave: (fn) => ecouter('bureau:pave:etat', (v) => fn(Boolean(v))),
  // Favoris du pavé (sa première page) : pages (« /combat ») et modes de jeu (« mode:rescue »)
  reglerFavoris: (liste) => ipcRenderer.send('bureau:pave:favoris', (Array.isArray(liste) ? liste : []).slice(0, 8).map((x) => String(x).slice(0, 200))),
  surFavoris: (fn) => ecouter('bureau:pave:favoris', (v) => fn(Array.isArray(v) ? v.map(String) : [])),
  // Rapport de la semaine en GIF animé pour Discord : fabriqué hors écran et mis dans le presse-papiers (le fichier),
  // puis glissé-déposé dans Discord. La page ne donne que la route et la semaine, jamais un chemin.
  rapportGif: (d) => ipcRenderer.invoke('bureau:rapport:gif', { projet: String(d?.projet ?? 'all').slice(0, 20), semaine: d?.semaine == null ? null : Number(d.semaine) }),
  glisserRapport: () => ipcRenderer.send('bureau:rapport:glisser'),
  // MAR : fenêtre principale réduite ou fermée ({ cachee, chemin }), et le bouton ↺ qui la rouvre sur sa page
  surPrincipale: (fn) => ecouter('bureau:principale', (v) => fn({ cachee: v?.cachee === true, chemin: typeof v?.chemin === 'string' ? v.chemin : null })),
  reafficherPrincipale: () => ipcRenderer.send('bureau:principale:reafficher'),
  // Fenêtre principale : page demandée par la barre de menu
  surNaviguer: (fn) => ecouter('bureau:naviguer', (chemin) => fn(String(chemin))),
});

/** Abonnement à un message du processus principal ; rend la fonction qui le désabonne (démontage d'un composant). */
function ecouter(canal, fn) {
  const f = (_e, v) => fn(v);
  ipcRenderer.on(canal, f);
  return () => ipcRenderer.removeListener(canal, f);
}
