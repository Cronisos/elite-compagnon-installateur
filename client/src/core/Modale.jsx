// Fenêtre modale de l'app : une fiche qui s'ouvre par-dessus la page (Échap, ✕ ou un clic à côté la ferme). Pour lire,
// pas pour modifier : chaque fenêtre a un rôle.
//
// Au clavier : le focus entre dans la fenêtre à l'ouverture, Tab et Maj+Tab y restent (core/focus.js), et il revient
// au bouton qui l'a ouverte à la fermeture. Fenêtre principale seulement : jamais dans les fenêtres en jeu.

import { useEffect, useRef } from 'react';
import { FOCUSABLES, focusSuivant } from './focus.js';

export default function Modale({ titre, onFermer, children, pied = null, large = false }) {
  // Une seule pose à l'ouverture, un seul retrait à la fermeture : la fonction de fermeture peut changer à chaque
  // affichage sans que la page derrière reste bloquée
  const fermer = useRef(onFermer);
  fermer.current = onFermer;
  const boite = useRef(null);
  useEffect(() => {
    const origine = document.activeElement; // le bouton qui a ouvert la fenêtre
    boite.current?.focus({ preventScroll: true });
    // Échap ferme la fenêtre, et seulement elle : écouté avant la page (phase de capture) et marqué (preventDefault),
    // la page derrière (↩ de Mes repères…) ne remonte pas d'un écran en même temps. Tab reste dans la fenêtre.
    const clavier = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        fermer.current();
        return;
      }
      if (e.key !== 'Tab' || !boite.current) return;
      const elements = [...boite.current.querySelectorAll(FOCUSABLES)];
      const cible = focusSuivant(elements, document.activeElement, e.shiftKey);
      if (cible) {
        e.preventDefault();
        cible.focus();
      } else if (!elements.length) e.preventDefault();
    };
    document.addEventListener('keydown', clavier, true);
    const avant = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; // la page derrière ne défile plus
    return () => {
      document.removeEventListener('keydown', clavier, true);
      document.body.style.overflow = avant;
      if (origine && typeof origine.focus === 'function' && document.contains(origine)) origine.focus({ preventScroll: true });
    };
  }, []);
  return (
    <div className="modale-fond" onMouseDown={(e) => e.target === e.currentTarget && onFermer()}>
      <div
        ref={boite}
        tabIndex={-1}
        className={`modale${large ? ' modale-large' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={typeof titre === 'string' ? titre : undefined}
      >
        <header className="modale-tete">
          <div className="modale-titre">{titre}</div>
          <button type="button" className="modale-fermer" onClick={onFermer} title="Fermer (Échap)" aria-label="Fermer">✕</button>
        </header>
        <div className="modale-corps">{children}</div>
        {pied && <footer className="modale-pied">{pied}</footer>}
      </div>
    </div>
  );
}
