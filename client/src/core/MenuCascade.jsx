// Menu en cascade (bouton ☰ en haut à gauche) : toutes les pages de l'app, rangées par rubrique (core/navigation.js).
// Survol ou clic sur une entrée qui a des sous-pages : elles s'ouvrent à droite, et ainsi de suite (sous-menus de
// sous-menus). Un clic sur une page y va ; la page d'une rubrique s'ouvre par la barre du haut. Échap ou un clic ailleurs referme.

import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { PLAN, filDAriane } from './navigation.js';
import { confirmerDepart } from './gardeModifs.js';

function Colonne({ entrees, ouverte, survoler, cliquer, actifs }) {
  return (
    <ul className="mc-col" role="menu">
      {entrees.map((e) => (
        <li key={e.id} role="none">
          <button
            type="button"
            role="menuitem"
            className={`mc-item${ouverte === e.id ? ' is-open' : ''}${actifs.has(e.id) ? ' is-here' : ''}`}
            onMouseEnter={() => survoler(e)}
            onFocus={() => survoler(e)}
            onClick={() => cliquer(e)}
            aria-haspopup={e.enfants ? 'menu' : undefined}
          >
            {e.icone && <span className="mc-icone" aria-hidden="true">{e.icone}</span>}
            <span className="mc-titre">{e.titre}</span>
            {e.enfants && <span className="mc-fleche" aria-hidden="true">›</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function MenuCascade() {
  const [ouvert, setOuvert] = useState(false);
  const [chemin, setChemin] = useState([]); // entrées ouvertes, une par niveau
  const ref = useRef(null);
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const actifs = new Set(filDAriane(pathname, search).map((e) => e.id));

  useEffect(() => {
    if (!ouvert) return undefined;
    const fermerDehors = (e) => !ref.current?.contains(e.target) && setOuvert(false);
    const echap = (e) => e.key === 'Escape' && setOuvert(false);
    document.addEventListener('mousedown', fermerDehors);
    document.addEventListener('keydown', echap);
    return () => {
      document.removeEventListener('mousedown', fermerDehors);
      document.removeEventListener('keydown', echap);
    };
  }, [ouvert]);

  const basculer = () => {
    setChemin([]);
    setOuvert((o) => !o);
  };
  const niveau = (n) => (e) => setChemin((c) => [...c.slice(0, n), ...(e.enfants ? [e] : [])]);
  const aller = (e) => {
    if (!confirmerDepart()) return; // changements non enregistrés sur la page : le joueur reste
    navigate(e.chemin);
    setOuvert(false);
  };
  const colonnes = [PLAN, ...chemin.map((e) => e.enfants)];

  return (
    <div className="mc" ref={ref}>
      <button type="button" className={`mc-bouton${ouvert ? ' is-open' : ''}`} onClick={basculer} aria-expanded={ouvert} title="Toutes les pages">
        <span aria-hidden="true">☰</span> Menu
      </button>
      {ouvert && (
        <div className="mc-panneau">
          <div className="mc-cols">
            {colonnes.map((entrees, n) => (
              <Colonne key={n} entrees={entrees} ouverte={chemin[n]?.id} survoler={niveau(n)} cliquer={(e) => (e.enfants ? niveau(n)(e) : aller(e))} actifs={actifs} />
            ))}
          </div>
          <div className="mc-pied">
            <button type="button" className="mc-item" onClick={() => aller({ chemin: '/' })}><span className="mc-icone">◆</span> Accueil</button>
            <button type="button" className="mc-item" onClick={() => aller({ chemin: '/parametres' })}><span className="mc-icone">⚙</span> Paramètres</button>
          </div>
        </div>
      )}
    </div>
  );
}
