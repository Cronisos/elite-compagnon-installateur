// Page affichée pendant le démarrage (base, serveur, interface) : l'étape en cours.
window.eliteBureau.surEtape((t) => {
  document.getElementById('etape').textContent = t;
});
document.getElementById('r').addEventListener('click', () => window.eliteBureau.reduire());
document.getElementById('x').addEventListener('click', () => window.eliteBureau.fermer());
