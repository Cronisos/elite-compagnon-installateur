// Modes de jeu et rôles des vaisseaux, côté interface : la déclaration du serveur, reprise telle quelle. Une seule
// source (server/src/core/modes.js, données pures) : un mode ajouté là-bas apparaît dans le menu, sur l'accueil, dans
// les rôles des vaisseaux, et le serveur sait ouvrir ses fenêtres. Vite l'intègre à la compilation.

export * from '../../../server/src/core/modes.js';
