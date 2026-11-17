// MAR, le menu d'accès rapide de l'app de bureau (page /barre, fenêtre collée en haut à gauche de l'écran, sur le jeu) :
// les rubriques du plan (core/navigation.js) en ligne : un clic ouvre la page de la rubrique (Mes vaisseaux : la flotte),
// le survol ou ▾ ses sous-menus, juste sous la rubrique (alignés sur son bord gauche, ou droit quand le MAR est à droite),
// puis vers l'intérieur de l'écran, sur autant de niveaux qu'il faut.
// Un clic sur une page l'ouvre dans la fenêtre principale. En tête, « Mode de jeu » : choisir un mode ouvre ses fenêtres
// en jeu (comme le menu de la fenêtre principale), sans ouvrir la fenêtre principale. Le ◆ cache toute l'app ou la
// réaffiche ; clic droit : le menu de l'app (Quitter…). Rien dans un navigateur.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { bureau } from './bureau.js';
import { PLAN, filDAriane } from './navigation.js';
import { MODES } from './modes.js';
import { useOverlay } from './overlay.jsx';

function Colonne({ entrees, ouverte, survoler, cliquer }) {
  return (
    <ul className="bb-col" role="menu">
      {entrees.map((e) => (
        <li key={e.id} role="none">
          <button
            type="button"
            role="menuitem"
            className={`bb-item${ouverte === e.id ? ' is-open' : ''}`}
            onMouseEnter={() => survoler(e)}
            onClick={() => cliquer(e)}
            aria-haspopup={e.enfants ? 'menu' : undefined}
          >
            {e.icone && <span className="bb-icone" aria-hidden="true">{e.icone}</span>}
            <span className="bb-titre">{e.titre}</span>
            {e.enfants && <span className="bb-fleche" aria-hidden="true">›</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function BarreBureau() {
  const [ouverte, setOuverte] = useState(null); // rubrique ouverte
  const [chemin, setChemin] = useState([]); // sous-menus ouverts sous elle, un par niveau
  const [cache, setCache] = useState(false);
  const [coin, setCoin] = useState('haut-gauche'); // réglage du MAR : sens d'ouverture des menus
  const [principale, setPrincipale] = useState({ cachee: false, chemin: null }); // fenêtre principale réduite ou fermée
  const racine = useRef(null);
  const ligne = useRef(null);
  const blocs = useRef({}); // bloc de chaque rubrique (et du mode de jeu), pour placer son menu juste en dessous
  const [decalage, setDecalage] = useState(0);
  const { state: overlay, show } = useOverlay(); // mode de jeu actuel, fenêtres en jeu

  // Page transparente : seule la barre se voit par-dessus le jeu
  useLayoutEffect(() => {
    document.documentElement.classList.add('est-barre');
    return () => document.documentElement.classList.remove('est-barre');
  }, []);
  // La fenêtre prend la taille de la barre (menu fermé : une ligne ; ouvert : la place des sous-menus)
  useLayoutEffect(() => {
    const el = racine.current;
    if (!bureau || !el) return undefined;
    const envoyer = () => bureau.tailleBarre(Math.ceil(el.scrollWidth) + 2, Math.ceil(el.scrollHeight) + 2);
    envoyer();
    const obs = new ResizeObserver(envoyer);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  // Le menu ouvert se place sous sa rubrique : décalage depuis le bord de la barre où le MAR est collé
  useLayoutEffect(() => {
    const bloc = blocs.current[ouverte];
    const l = ligne.current;
    if (!bloc || !l) return setDecalage(0);
    const gauche = bloc.offsetLeft - l.offsetLeft;
    const droite = l.offsetLeft + l.offsetWidth - (bloc.offsetLeft + bloc.offsetWidth);
    setDecalage(Math.max(0, coin.endsWith('droite') ? droite : gauche));
    return undefined;
  }, [ouverte, coin, cache]);
  useEffect(() => {
    if (!bureau) return undefined;
    const fermer = bureau.surFermerMenu(() => {
      setOuverte(null);
      setChemin([]);
    });
    const voile = bureau.surCache(setCache);
    const place = bureau.surCoinMar?.(setCoin);
    const fenetre = bureau.surPrincipale?.(setPrincipale);
    return () => {
      fermer?.();
      voile?.();
      place?.();
      fenetre?.();
    };
  }, []);

  if (!bureau) return null;
  const rubrique = PLAN.find((r) => r.id === ouverte);
  const basculerRubrique = (r) => {
    setChemin([]);
    setOuverte(r.id);
  };
  const niveau = (n) => (e) => setChemin((c) => [...c.slice(0, n), ...(e.enfants ? [e] : [])]);
  const aller = (e) => {
    bureau.naviguer(e.chemin);
    setOuverte(null);
    setChemin([]);
  };
  const colonnes = rubrique ? [rubrique.enfants, ...chemin.map((e) => e.enfants)] : [];
  const fermer = () => {
    setOuverte(null);
    setChemin([]);
  };
  // Mode de jeu : ses fenêtres en jeu ; « Aucun » ferme aussi celles que les modules ont ouvertes d'eux-mêmes
  const modeActuel = MODES.find((m) => m.id === overlay?.mode);
  const choisirMode = (m) => {
    show(m?.id ?? null, overlay?.glance, true, { dismissExtras: !m });
    fermer();
  };

  // Page de la fenêtre principale réduite : son nom dans le plan (« Tous les vaisseaux »), sinon « Accueil »
  const pageCachee = principale.cachee ? (() => {
    const [p, q = ''] = (principale.chemin || '/').split('?');
    return filDAriane(p, q).at(-1)?.titre || (p === '/' ? 'Accueil' : 'la fenêtre');
  })() : null;

  return (
    <div className={`bb bb-${coin}`} ref={racine} onMouseLeave={() => { setOuverte(null); setChemin([]); }}>
      <div className="bb-ligne" ref={ligne}>
        <button
          type="button"
          className={`bb-losange${cache ? ' is-cache' : ''}`}
          onClick={() => bureau.basculer()}
          onContextMenu={(e) => {
            e.preventDefault();
            bureau.menuLanceur();
          }}
          title={cache ? 'Réafficher Elite Compagnon (clic droit : menu)' : 'Tout cacher : fenêtres, fenêtres en jeu et ce menu ; le ◆ reste (clic droit : menu)'}
        >
          ◆
        </button>
        {/* Tout caché : seul le ◆ reste, pour tout réafficher */}
        {!cache && (
          <span ref={(el) => { blocs.current.mode = el; }} className={`bb-rubrique-bloc bb-mode${ouverte === 'mode' ? ' is-open' : ''}`} onMouseEnter={() => ouverte !== 'mode' && (setChemin([]), setOuverte('mode'))}>
            <button type="button" className="bb-rubrique" onClick={() => (ouverte === 'mode' ? fermer() : (setChemin([]), setOuverte('mode')))} title="Mode de jeu : ses fenêtres par-dessus le jeu">
              <span className="bb-icone" aria-hidden="true">{modeActuel?.icon ?? '◌'}</span> {modeActuel ? modeActuel.label : 'Mode de jeu'}
            </button>
            <button type="button" className="bb-deplier" onClick={() => (ouverte === 'mode' ? fermer() : (setChemin([]), setOuverte('mode')))} aria-label="Modes de jeu" aria-expanded={ouverte === 'mode'}>▾</button>
          </span>
        )}
        {!cache && PLAN.map((r) => (
          <span key={r.id} ref={(el) => { blocs.current[r.id] = el; }} className={`bb-rubrique-bloc${ouverte === r.id ? ' is-open' : ''}`} onMouseEnter={() => ouverte !== r.id && basculerRubrique(r)}>
            <button type="button" className="bb-rubrique" onClick={() => aller(r)} title={`${r.description} : ouvrir`}>
              <span className="bb-icone" aria-hidden="true">{r.icone}</span> {r.titre}
            </button>
            {/* ▾ : ses pages au clic (le survol les ouvre aussi) */}
            <button
              type="button"
              className="bb-deplier"
              onClick={() => (ouverte === r.id ? (setOuverte(null), setChemin([])) : basculerRubrique(r))}
              aria-label={`Pages de ${r.titre}`}
              aria-expanded={ouverte === r.id}
            >
              ▾
            </button>
          </span>
        ))}
        {/* Fenêtre principale réduite ou fermée : la rouvrir sur sa page, sans repasser par les menus */}
        {!cache && pageCachee && bureau.reafficherPrincipale && (
          <button type="button" className="bb-rubrique bb-reafficher" onClick={() => bureau.reafficherPrincipale()} title={`Réafficher la fenêtre principale, sur « ${pageCachee} »`}>
            <span className="bb-icone" aria-hidden="true">↺</span> {pageCachee}
          </button>
        )}
      </div>
      {ouverte === 'mode' && !cache && (
        <div className="bb-menu" style={coin.endsWith('droite') ? { marginRight: decalage } : { marginLeft: decalage }}>
          <ul className="bb-col" role="menu" aria-label="Modes de jeu">
            {MODES.map((m) => (
              <li key={m.id} role="none">
                <button type="button" role="menuitem" className={`bb-item${m.id === overlay?.mode ? ' is-actif' : ''}`} onClick={() => choisirMode(m)}>
                  <span className="bb-icone" aria-hidden="true">{m.icon}</span>
                  <span className="bb-titre">{m.label}</span>
                  {m.id === overlay?.mode && <span className="bb-coche" aria-hidden="true">●</span>}
                </button>
              </li>
            ))}
            <li role="none">
              <button type="button" role="menuitem" className={`bb-item${overlay && !overlay.mode ? ' is-actif' : ''}`} onClick={() => choisirMode(null)}>
                <span className="bb-icone" aria-hidden="true">○</span>
                <span className="bb-titre">Aucun</span>
              </button>
            </li>
            <li role="none" className="bb-separe">
              <button type="button" role="menuitemcheckbox" aria-checked={Boolean(overlay?.glance)} className="bb-item" onClick={() => show(overlay?.mode ?? null, !overlay?.glance)}>
                <span className="bb-icone" aria-hidden="true">{overlay?.glance ? '☑' : '☐'}</span>
                <span className="bb-titre">Fenêtre Coup d’œil</span>
              </button>
            </li>
          </ul>
        </div>
      )}
      {rubrique && !cache && (
        <div className="bb-menu" style={coin.endsWith('droite') ? { marginRight: decalage } : { marginLeft: decalage }}>
          {colonnes.map((entrees, n) => (
            <Colonne key={n} entrees={entrees} ouverte={chemin[n]?.id} survoler={niveau(n)} cliquer={(e) => (e.enfants ? niveau(n)(e) : aller(e))} />
          ))}
        </div>
      )}
    </div>
  );
}
