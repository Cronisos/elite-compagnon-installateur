// Pavé tactile de l'app de bureau (page /pave, fenêtre à part, desktop/main.js creerPave) : les menus de l'app en gros
// boutons, pour un petit écran tactile posé sous l'écran principal (à la manière d'un Stream Deck). D'abord ta page de
// favoris (8 boutons au plus : des pages ou des modes de jeu), composée sur le pavé avec ✎ ; « ☰ Tous les menus » ouvre
// les menus. Un bouton à sous-menu l'ouvre, « ◂ Retour » remonte d'un niveau ; un bouton de page l'ouvre dans la
// fenêtre principale, devant le jeu. « Mode de jeu » choisit le mode, comme le MAR. La barre du haut sert à déplacer la
// fenêtre ; ◆ cache ou réaffiche toute l'app ; ✕ ferme le pavé (Paramètres le rouvre). Rien dans un navigateur.

import { useEffect, useLayoutEffect, useState } from 'react';
import { bureau } from './bureau.js';
import { PLAN } from './navigation.js';
import { MODES } from './modes.js';
import { useOverlay } from './overlay.jsx';
import { MAX_FAVORIS, MODE, basculerFavori, cleFavori, favorisVue, filPave, vuePave } from './paveVue.js';

function Bouton({ b, onClick, actif = false, edition = false, favori = false }) {
  return (
    <button type="button" className={`pave-bouton${b.page ? ' is-page' : ''}${b.sous ? ' is-sous' : ''}${actif ? ' is-actif' : ''}${favori ? ' is-favori' : ''}`} onClick={onClick}>
      <span className="pave-icone" aria-hidden="true">{b.icone}</span>
      <span className="pave-titre">{b.titre}</span>
      {b.sous && !edition && <span className="pave-sous" aria-hidden="true">›</span>}
      {edition && !b.sous && <span className="pave-etoile" aria-hidden="true">{favori ? '★' : '☆'}</span>}
    </button>
  );
}

export default function PaveTactile() {
  const [pile, setPile] = useState([]);
  const [cache, setCache] = useState(false);
  const [favoris, setFavoris] = useState([]);
  const [surFavoris, setSurFavoris] = useState(true); // la page de favoris d'abord, s'il y en a
  const [edition, setEdition] = useState(false);
  const { state: overlay, show } = useOverlay();

  useLayoutEffect(() => {
    document.documentElement.classList.add('est-pave');
    return () => document.documentElement.classList.remove('est-pave');
  }, []);
  useEffect(() => bureau?.surCache?.(setCache), []);
  useEffect(() => {
    bureau?.lirePave?.().then((r) => setFavoris(r?.favoris || [])).catch(() => {});
    return bureau?.surFavoris?.(setFavoris);
  }, []);

  if (!bureau) return <p className="muted">Le pavé tactile est une fenêtre de l’app de bureau.</p>;
  const pageFavoris = surFavoris && !pile.length && (favoris.length > 0 || edition);
  const vue = vuePave(pile);
  const haut = pile.at(-1);
  const source = haut ? haut.enfants || [] : [MODE, ...PLAN];
  const choisirMode = (m) => show(m?.id ?? null, overlay?.glance, true, { dismissExtras: !m });
  const basculer = (cle) => {
    const n = basculerFavori(favoris, cle);
    setFavoris(n);
    bureau.reglerFavoris?.(n);
  };
  const ouvrir = (b) => {
    if (edition && !b.sous) return basculer(cleFavori(b));
    if (b.modeId) return choisirMode(MODES.find((m) => m.id === b.modeId));
    if (b.sous) {
      const e = source.find((x) => x.id === b.id);
      if (e) {
        setSurFavoris(false);
        setPile([...pile, e]);
      }
      return undefined;
    }
    if (b.chemin) bureau.naviguer(b.chemin);
    return undefined;
  };
  const modeActuel = MODES.find((m) => m.id === overlay?.mode);
  const fil = pageFavoris ? '★ Favoris' : filPave(pile);

  return (
    <div className={`pave${edition ? ' is-edition' : ''}`}>
      <header className="pave-tete">
        {pile.length > 0 ? (
          <button type="button" className="pave-retour" onClick={() => setPile(pile.slice(0, -1))}>◂ Retour</button>
        ) : favoris.length > 0 && !pageFavoris ? (
          <button type="button" className="pave-retour" onClick={() => setSurFavoris(true)}>★ Favoris</button>
        ) : <span className="pave-marque">◆ Enova</span>}
        <span className="pave-fil" title="Fais glisser ici pour déplacer le pavé">{fil}</span>
        <button type="button" className={`pave-outil${edition ? ' is-on' : ''}`} onClick={() => setEdition(!edition)} title={edition ? 'Terminer' : 'Composer tes favoris'}>✎</button>
        <button type="button" className={`pave-outil${cache ? ' is-on' : ''}`} onClick={() => bureau.basculer()} title={cache ? 'Réafficher l’app' : 'Tout cacher (le pavé reste)'}>◆</button>
        <button type="button" className="pave-outil" onClick={() => bureau.fermer()} title="Fermer le pavé (Paramètres le rouvre)">✕</button>
      </header>
      {edition && (
        <p className="pave-aide">
          Touche une page ou un mode pour l’ajouter à tes favoris, ou l’en retirer ({favoris.length}/{MAX_FAVORIS}). ✎ pour terminer.
        </p>
      )}

      {pageFavoris ? (
        <div className="pave-grille">
          {favorisVue(favoris, PLAN, MODES).map((b) => (
            <Bouton key={b.id} b={b} edition={edition} favori actif={b.modeId && b.modeId === overlay?.mode} onClick={() => ouvrir(b)} />
          ))}
          <Bouton b={{ id: 'tous', titre: 'Tous les menus', icone: '☰', sous: true }} onClick={() => setSurFavoris(false)} />
        </div>
      ) : vue.mode ? (
        <div className="pave-grille">
          {MODES.map((m) => {
            const b = { id: m.id, titre: m.label, icone: m.icon, modeId: m.id };
            return <Bouton key={m.id} b={b} edition={edition} favori={favoris.includes(cleFavori(b))} actif={overlay?.mode === m.id} onClick={() => ouvrir(b)} />;
          })}
          {!edition && (
            <>
              <Bouton b={{ id: 'aucun', titre: 'Aucun', icone: '○' }} actif={Boolean(overlay) && !overlay.mode} onClick={() => choisirMode(null)} />
              <Bouton b={{ id: 'glance', titre: `Coup d’œil${overlay?.glance ? ' ✓' : ''}`, icone: '◐' }} actif={Boolean(overlay?.glance)} onClick={() => show(overlay?.mode ?? null, !overlay?.glance)} />
            </>
          )}
        </div>
      ) : (
        <div className="pave-grille">
          {vue.boutons.map((b) => {
            const vu = b.mode && modeActuel ? { ...b, icone: modeActuel.icon, titre: modeActuel.label } : b;
            return <Bouton key={b.id} b={vu} edition={edition} favori={!b.sous && favoris.includes(cleFavori(b))} onClick={() => ouvrir(b)} />;
          })}
        </div>
      )}
    </div>
  );
}
