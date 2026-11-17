// Navigation dans la page : le fil d'Ariane en haut de chaque page, et la page d'une rubrique (Mes vaisseaux,
// Activités…) faite de cartes vers ses pages. Le plan vient de core/navigation.js.

import { Link, useLocation } from 'react-router';
import { filDAriane } from './navigation.js';

/** « Accueil › Ingénierie › Ingénieurs » : chaque étape mène à sa page. Rien sur l'accueil ni hors du plan. */
export function FilDAriane() {
  const { pathname, search } = useLocation();
  const fil = filDAriane(pathname, search);
  if (!fil.length) return null;
  return (
    <nav className="fil" aria-label="Fil d’Ariane">
      <Link to="/">Accueil</Link>
      {fil.map((e, i) => (
        <span key={e.id}>
          <span className="fil-sep" aria-hidden="true">›</span>
          {i === fil.length - 1 ? <span className="fil-ici">{e.titre}</span> : <Link to={e.chemin}>{e.titre}</Link>}
        </span>
      ))}
    </nav>
  );
}

/** Page d'une rubrique : une carte par page, ses sous-pages en liens dans la carte. */
export function RubriquePage({ rubrique }) {
  return (
    <div className="page">
      <h1><span className="rub-icone" aria-hidden="true">{rubrique.icone}</span> {rubrique.titre}</h1>
      <div className="rub-cartes">
        {rubrique.enfants.map((e) => (
          <div key={e.id} className="rub-carte">
            <Link to={e.chemin} className="rub-tete">
              <span className="rub-carte-icone" aria-hidden="true">{e.icone}</span>
              <span className="rub-carte-titre">{e.titre}</span>
            </Link>
            {e.description && <p className="rub-desc">{e.description}</p>}
            {e.enfants && (
              <ul className="rub-sous">
                {e.enfants.map((s) => <li key={s.id}><Link to={s.chemin}>{s.titre}</Link></li>)}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
