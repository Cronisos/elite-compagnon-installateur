import { useEffect } from 'react';
import logoEnova from '../assets/enova.png';
import logoGrand from '../assets/enova-grand.png';
import { Link, NavLink, useLocation, useNavigate } from 'react-router';
import { useConnected } from './stream.js';
import { useGameState } from './useGameState.js';
import { compact, int } from './format.js';
import { modules } from '../modules/index.js';
import MenuCascade from './MenuCascade.jsx';
import { FilDAriane } from './Rubriques.jsx';
import { PLAN, rubriqueActive } from './navigation.js';
import NomSysteme from './NomSysteme.jsx';
import ModeMenu from './ModeMenu.jsx';
import LanguageNotice from './LanguageNotice.jsx';
import { MiseAJourNotice } from './MiseAJour.jsx';
import SanteNotice from './SanteNotice.jsx';
import { BoutonsFenetre } from './FenetreBureau.jsx';
import { DETACHEE, bureau } from './bureau.js';
import { confirmerDepart } from './gardeModifs.js';


/** Titre d'une page détachée : le module qui l'affiche. */
function titrePage(pathname) {
  if (pathname === '/') return 'Accueil';
  if (pathname.startsWith('/parametres')) return 'Paramètres';
  return modules.find((m) => m.path && (pathname === m.path || pathname.startsWith(`${m.path}/`)))?.title || 'Enova';
}

/** Fenêtre détachée de l'app de bureau : une barre fine (titre, premier plan, fermer) et la page, sans menus. */
function LayoutDetache({ children }) {
  const { pathname } = useLocation();
  const connected = useConnected();
  return (
    <div className="app est-bureau est-detachee">
      <header className="fen-barre">
        <span className="fen-titre"><span className="brand-mark">◆</span> {titrePage(pathname)}</span>
        <span className={`dot ${connected ? 'dot-on' : 'dot-off'}`} title={connected ? 'Connecté au serveur' : 'Serveur injoignable'} />
        <BoutonsFenetre detachee />
      </header>
      <main className="content">{children}</main>
    </div>
  );
}

/** Cadre commun : état du commandant en temps réel, puis la barre des menus ; fenêtre détachée de l'app de bureau à part. */
export default function Layout({ children }) {
  if (DETACHEE) return <LayoutDetache>{children}</LayoutDetache>;
  return <LayoutPrincipal>{children}</LayoutPrincipal>;
}

function LayoutPrincipal({ children }) {
  const connected = useConnected();
  const { game } = useGameState();
  const { pathname, search } = useLocation();
  const active = rubriqueActive(pathname, search);
  const navigate = useNavigate();
  // Page demandée par la barre de menu de l'app de bureau (en haut à droite de l'écran)
  // (sauf si la page a des changements non enregistrés et que le joueur choisit d'y rester : core/gardeModifs.js)
  useEffect(() => bureau?.surNaviguer?.((chemin) => confirmerDepart() && navigate(chemin)), [navigate]);

  return (
    <div className={`app${bureau ? ' est-bureau' : ''}`}>
      {/* Filigrane : le grand logo, discret, derrière le contenu, en bas à gauche sur toutes les pages */}
      <img className="filigrane" src={logoGrand} alt="" aria-hidden="true" />
      <header className="topbar">
        <div className="topbar-top">
          {/* Menu ☰ : seulement dans un navigateur ; l'app de bureau a sa barre de menu en haut à droite de l'écran */}
          {!bureau && <MenuCascade />}
          <Link to="/" className="brand">
            <img className="brand-logo" src={logoEnova} alt="" /> Enova
          </Link>
          <div className="topbar-state">
            {game?.commander && <span>CMDR {game.commander}</span>}
            {game?.balance != null && (
              <span title={`${int(game.balance)} cr`}>
                <span className="muted">Solde</span> <strong className="num">{compact(game.balance)}</strong>
              </span>
            )}
            {game?.system && (
              <span>
                <span className="muted">{game.docked ? 'À quai' : 'Système'}</span>{' '}
                {game.docked && game.station ? `${game.station} · ` : ''}
                <NomSysteme nom={game.system} />
              </span>
            )}
            {game?.legalState === 'Hostile' && <span className="pill pill-bad">Hostile</span>}
          </div>
          <span className={`dot ${connected ? 'dot-on' : 'dot-off'}`} title={connected ? 'Connecté au serveur' : 'Serveur injoignable'} />
          <BoutonsFenetre />
        </div>
        <nav className="topbar-nav">
          <ModeMenu />
          <span className="topbar-sep" aria-hidden="true" />
          {/* Rubriques (core/navigation.js) : leur page de cartes ; le menu ☰ mène droit aux sous-pages */}
          {PLAN.map((r) => (
            <Link key={r.id} to={r.chemin} className={`topbar-module${active?.id === r.id ? ' active' : ''}`}>
              <span className="topbar-module-icon" aria-hidden="true">{r.icone}</span> {r.titre}
            </Link>
          ))}
          <NavLink to="/parametres" className="topbar-settings">Paramètres</NavLink>
        </nav>
      </header>
      <main className="content">
        <SanteNotice />
        <MiseAJourNotice />
        <LanguageNotice />
        <FilDAriane />
        {children}
      </main>
    </div>
  );
}
