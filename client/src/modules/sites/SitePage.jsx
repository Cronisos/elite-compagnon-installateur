// Page d'un site externe (Inara…). Dans l'app de bureau : une barre (retour, avancer, recharger, accueil, navigateur)
// et une zone que l'app de bureau recouvre avec le vrai site (desktop/main.js, session isolée). Dans un navigateur :
// un lien, car ces sites refusent d'être affichés dans un cadre (X-Frame-Options).

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { bureau } from '../../core/bureau.js';
import { adresseCourte } from './sites.js';

/** Zone du site : sous la barre, jusqu'en bas et sur toute la largeur de la fenêtre. */
function useZone(ref, id) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!bureau || !el) return undefined;
    let image = 0;
    const envoyer = () => {
      cancelAnimationFrame(image);
      image = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        bureau.site.afficher(id, { x: r.left, y: r.top, width: r.width, height: r.height });
      });
    };
    envoyer();
    const obs = new ResizeObserver(envoyer);
    obs.observe(el);
    obs.observe(document.documentElement);
    window.addEventListener('resize', envoyer);
    return () => {
      cancelAnimationFrame(image);
      obs.disconnect();
      window.removeEventListener('resize', envoyer);
      bureau.site.cacher(id);
    };
  }, [ref, id]);
}

/** Bas de la barre de l'app (menus, ou barre fine d'une fenêtre détachée) : la page du site commence là. */
function useHaut() {
  const [haut, setHaut] = useState(0);
  useLayoutEffect(() => {
    const barre = document.querySelector('.topbar, .fen-barre');
    if (!barre) return undefined;
    const lire = () => setHaut(Math.round(barre.getBoundingClientRect().bottom));
    lire();
    const obs = new ResizeObserver(lire);
    obs.observe(barre);
    return () => obs.disconnect();
  }, []);
  return haut;
}

export default function SitePage({ site }) {
  const zone = useRef(null);
  const [etat, setEtat] = useState(null);
  const haut = useHaut();
  useEffect(() => bureau?.site.surEtat((e) => e?.id === site.id && setEtat(e)), [site.id]);
  useZone(zone, site.id);

  if (!bureau) {
    return (
      <div className="page">
        <header className="route-header">
          <div>
            <h1>{site.titre}</h1>
            <p className="muted">{site.titre} refuse d’être affiché dans une autre page web : il s’affiche ici dans l’app de bureau « Enova ».</p>
          </div>
        </header>
        <a className="btn" href={site.accueil} target="_blank" rel="noreferrer noopener">Ouvrir {site.titre} dans le navigateur ↗</a>
      </div>
    );
  }
  const cmd = (c) => () => bureau.site.commande(site.id, c);
  return (
    <div className="site-page" style={{ top: haut }}>
      <div className="site-barre" data-tuto="outils-site-barre">
        <button type="button" className="site-btn" onClick={cmd('retour')} disabled={!etat?.retour} title="Page précédente">←</button>
        <button type="button" className="site-btn" onClick={cmd('avancer')} disabled={!etat?.avancer} title="Page suivante">→</button>
        <button type="button" className="site-btn" onClick={cmd('recharger')} title="Recharger">{etat?.chargement ? '…' : '⟳'}</button>
        <button type="button" className="site-btn" onClick={cmd('accueil')} title={`Accueil de ${site.titre}`}>⌂</button>
        <span className="site-adresse" title={etat?.url || ''}>
          <b>{site.titre}</b> {etat?.titre && etat.titre !== site.titre ? `· ${etat.titre}` : ''} <span className="muted">{adresseCourte(etat?.url)}</span>
        </span>
        <button type="button" className="site-btn site-dehors" data-tuto="outils-site-navigateur" onClick={cmd('navigateur')} title="Ouvrir cette page dans le navigateur">↗ Navigateur</button>
      </div>
      <div ref={zone} className="site-zone" aria-label={`${site.titre} (affiché par l’app de bureau)`}>
        <p className="muted">Chargement de {site.titre}…</p>
      </div>
    </div>
  );
}
