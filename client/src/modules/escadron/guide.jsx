// Pièces communes aux deux guides de l'escadron (rejoindre, monter le serveur) : étapes numérotées et commandes à
// copier.

import { useState } from 'react';

/** Une commande à taper ou un texte à coller, avec son bouton Copier. */
export function Commande({ children }) {
  const [etat, setEtat] = useState('');
  async function copier() {
    try {
      await navigator.clipboard.writeText(children);
      setEtat('Copié');
    } catch {
      setEtat('Sélectionne et Ctrl+C');
    }
    setTimeout(() => setEtat(''), 1600);
  }
  return (
    <div className="guide-cmd">
      <pre>{children}</pre>
      <button type="button" className="btn btn-ghost small" onClick={copier}>{etat || 'Copier'}</button>
    </div>
  );
}

/**
 * Étape numérotée ; `faite` : coche verte (étape déjà réglée dans l'app). Avec un `resume`, une étape faite se lit au
 * lieu de se régler : un bandeau vert « Fait », ce qui est en place en une ligne, et un bouton (`modifier`) pour rouvrir
 * ses réglages. Elle se replie d'elle-même dès qu'elle est faite, et se rouvre si elle ne l'est plus.
 */
export function Etape({ n, titre, faite = false, resume = null, modifier = 'Modifier', children }) {
  const [ouvert, setOuvert] = useState(false);
  const lisible = faite && resume != null;
  const replie = lisible && !ouvert;
  return (
    <li className={`guide-etape${faite ? ' is-faite' : ''}`}>
      <span className="guide-num" aria-hidden="true">{faite ? '✓' : n}</span>
      <div className="guide-corps">
        <h3>{titre}{faite && !lisible && <span className="guide-fait"> · fait</span>}</h3>
        {lisible && (
          <div className="guide-bilan">
            <span className="guide-badge">✓ Fait</span>
            <span className="guide-resume">{resume}</span>
            <button type="button" className="btn btn-ghost small" aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)}>
              {ouvert ? 'Refermer' : modifier}
            </button>
          </div>
        )}
        {!replie && children}
      </div>
    </li>
  );
}

/** Lien vers un site : s'ouvre dans le navigateur (desktop/main.js). */
export function Site({ href, children }) {
  return <a href={href} target="_blank" rel="noopener noreferrer">{children} ↗</a>;
}
