// Nom d'un système avec son bouton 📋 : un clic le copie, prêt à coller dans la carte de la galaxie. Partout où l'app
// affiche un nom de système (pages et fenêtres en jeu). Dans l'overlay, la copie passe par son pont (le presse-papiers
// du navigateur y est refusé à une fenêtre qui n'a pas le focus).

import { useEffect, useRef, useState } from 'react';

/** Copie un texte : pont de l'overlay s'il existe, sinon le presse-papiers. Rend une promesse. */
export function copierTexte(texte) {
  const t = String(texte ?? '');
  if (typeof window !== 'undefined' && window.eliteOverlay?.copy) {
    window.eliteOverlay.copy(t);
    return Promise.resolve();
  }
  return navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject(new Error('presse-papiers indisponible'));
}

/** Bouton 📋 seul, pour un nom affiché à part (cellule, titre). */
export function BoutonCopier({ texte, quoi = 'le nom du système' }) {
  const [etat, setEtat] = useState('');
  const minuterie = useRef(null);
  useEffect(() => () => clearTimeout(minuterie.current), []);
  if (!texte) return null;
  const copier = (e) => {
    e.preventDefault();
    e.stopPropagation(); // dans un lien ou une ligne cliquable : copier seulement
    copierTexte(texte).then(() => setEtat('ok'), () => setEtat('ko'));
    clearTimeout(minuterie.current);
    minuterie.current = setTimeout(() => setEtat(''), 1500);
  };
  return (
    <button type="button" className={`copier${etat ? ` is-${etat}` : ''}`} onClick={copier} title={etat === 'ko' ? 'Copie impossible' : `Copier ${quoi}`} aria-label={`Copier ${quoi} ${texte}`}>
      {etat === 'ok' ? '✓' : etat === 'ko' ? '✕' : '📋'}
    </button>
  );
}

/** « Synuefe OU-E c28-2 📋 » */
export default function NomSysteme({ nom, className = '' }) {
  if (!nom) return null;
  return (
    <span className={`nom-systeme ${className}`.trim()}>
      {nom}
      <BoutonCopier texte={nom} />
    </span>
  );
}
