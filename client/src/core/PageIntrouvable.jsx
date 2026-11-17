// Sous-page inconnue d'un module (adresse tapée à la main, ancien lien) : un message et un lien vers sa page
// d'accueil, au lieu d'une page vide.

import { Link } from 'react-router';

/** @param retour adresse de la page d'accueil du module ; @param nom son nom, pour le lien */
export default function PageIntrouvable({ retour, nom }) {
  return (
    <section className="panel">
      <p className="muted">Page introuvable : cette adresse ne mène à rien dans {nom ? `« ${nom} »` : 'ce module'}.</p>
      {retour && <Link className="btn" to={retour}>Revenir à {nom || 'la page du module'}</Link>}
    </section>
  );
}
