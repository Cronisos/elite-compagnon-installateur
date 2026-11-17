import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useOverlay } from './overlay.jsx';
import { api } from './api.js';
import { confirmerDepart, partirSiAccepte } from './gardeModifs.js';
import { texteOverlayAbsent } from './installation.js';
import { modules } from '../modules/index.js';
import ShipRole from './ShipRole.jsx';
import { menuBubbles, REMEMBER_TEXT, rememberTitle, roleSummary, saveRole, suggestionTitle, switchText } from './shipRole.js';
import { useCurrentShip, useSuggestion, useSwitchNotice } from './useShips.js';

// Modes de jeu : les modules qui déclarent un mode (core/modes.js). Leur HUD d'overlay, s'ils en ont un, est la page /hud/<id>.
const MODES = modules.filter((m) => m.mode && m.Component);
const GLANCE = modules.find((m) => m.id === 'glance' && m.Hud);

/** Avis de bascule vers le rôle principal du vaisseau : « ⛏ Minage Rhino activé — vaisseau « Pioche » · Annuler ». */
function SwitchNotice({ notice }) {
  const [error, setError] = useState(null);
  const cancel = () => api('/overlay/switch/cancel', { method: 'POST' }).then(() => setError(null), (e) => setError(e.message));
  const close = () => api('/overlay/switch/dismiss', { method: 'POST' }).catch(() => {});
  return (
    <span className="mode-switched" title="Rôle principal de ce vaisseau : l'app a ouvert ce mode d'elle-même">
      {switchText(notice)}
      <button className="btn small" onClick={cancel}>Annuler</button>
      <button className="btn btn-ghost small" onClick={close} title="Fermer l'avis (le mode reste)" aria-label="Fermer l'avis">✕</button>
      {error && <span className="small bad">{error}</span>}
    </span>
  );
}

/**
 * Menu « Mode de jeu » de la barre du haut : choisir un mode ouvre sa page et ses fenêtres d'overlay
 * par-dessus le jeu (et ferme celles de l'ancien mode). La fenêtre Coup d'œil s'ajoute à n'importe quel mode.
 * Le menu montre aussi le vaisseau où tu es et son rôle, modifiable sur place.
 */
export default function ModeMenu() {
  const { state, error, show } = useOverlay();
  const [open, setOpen] = useState(false);
  const [roleError, setRoleError] = useState(null);
  const ref = useRef(null);
  const navigate = useNavigate();
  // Mode proposé d'après ce que tu fais : « Oui » l'ouvre, « Non » le fait taire 30 min
  const suggestion = useSuggestion();
  const notice = useSwitchNotice();
  const ship = useCurrentShip();
  const proposed = suggestion && MODES.find((m) => m.id === suggestion.mode);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    // Échap referme le menu et rend la main au bouton qui l'ouvre (navigation au clavier)
    const echap = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setOpen(false);
      ref.current?.querySelector('.mode-button')?.focus();
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', echap);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', echap);
    };
  }, [open]);

  function choose(m) {
    // « Aucun » ferme tout : les fenêtres du mode, et celles que les modules ont ouvertes d'eux-mêmes (le Coup d'œil
    // coché reste, il a sa propre case)
    setOpen(false);
    const changerMode = () => show(m?.id ?? null, state?.glance, true, { dismissExtras: !m });
    if (!m) {
      changerMode();
      return;
    }
    // Changements non enregistrés sur la page : la question vient AVANT de toucher au mode et aux fenêtres en jeu. Le
    // joueur qui reste sur sa page (« Annuler ») garde aussi son mode tel quel.
    partirSiAccepte(() => navigate(m.path), { avant: changerMode });
  }
  const refuse = () => api('/overlay/suggest/dismiss', { method: 'POST' }).catch(() => {});
  const bubbles = menuBubbles({ notice, suggestion, known: Boolean(proposed), installed: state ? state.installed : true });
  // « Oui » : le mode et ses fenêtres. Sans overlay, aucune fenêtre ne peut s'ouvrir (le serveur refuserait) : « Ouvrir la
  // page » ouvre la page du mode dans l'app, et la proposition se tait comme après « Non » (elle a eu sa réponse)
  function accept(m) {
    if (state && !state.installed) {
      if (confirmerDepart()) navigate(m.path);
      setOpen(false);
      refuse();
      return;
    }
    choose(m);
  }
  // « Retenir comme rôle de ce vaisseau » : rôle principal enregistré, puis le mode s'ouvre, comme « Oui »
  async function remember(s, m) {
    setRoleError(null);
    try {
      await saveRole(s.shipId, { primary: s.mode, secondary: [] });
    } catch (err) {
      setRoleError(err.message);
      return;
    }
    accept(m);
  }

  const current = MODES.find((m) => m.id === state?.mode);
  return (
    <div className="mode-menu" ref={ref}>
      <button className={`mode-button ${current ? 'is-active' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="true">
        <span aria-hidden="true">{current ? current.mode.icon : '🎮'}</span> {current ? current.mode.label : 'Mode de jeu'} ▾
      </button>
      {bubbles.notice && <SwitchNotice notice={notice} />}
      {bubbles.suggest === 'normal' && (
        <span className="mode-suggest" title={suggestionTitle(suggestion)}>
          {proposed.mode.icon} {proposed.mode.label} ?
          {suggestion.source === 'role' && <span className="mode-suggest-why">{suggestion.reason}</span>}
          <button className="btn small btn-primary" onClick={() => accept(proposed)}>{bubbles.accept}</button>
          <button className="btn small btn-ghost" onClick={refuse}>Non</button>
          {bubbles.remember && (
            <button className="btn small btn-ghost" onClick={() => remember(suggestion, proposed)} title={rememberTitle(suggestion.mode)}>
              {REMEMBER_TEXT}
            </button>
          )}
          {roleError && <span className="small bad">{roleError}</span>}
        </span>
      )}
      {bubbles.suggest === 'quiet' && (
        // Activité hors des rôles du vaisseau : proposée sans attirer l'œil
        <span className="mode-suggest is-quiet" title={suggestionTitle(suggestion)}>
          {proposed.mode.icon} {proposed.mode.label} ?
          <button className="mode-quiet-btn" onClick={() => accept(proposed)}>{bubbles.accept.toLowerCase()}</button>
          <button className="mode-quiet-btn" onClick={refuse} aria-label="Non">✕</button>
        </span>
      )}
      {open && (
        <div className="mode-list">
          <div className="mode-head">Mode de jeu</div>
          {MODES.map((m) => (
            <button key={m.id} className={`mode-item ${m.id === state?.mode ? 'is-active' : ''}`} onClick={() => choose(m)}>
              <span className="mode-icon" aria-hidden="true">{m.mode.icon}</span>
              <span>{m.mode.label}</span>
            </button>
          ))}
          <button className={`mode-item ${state && !state.mode ? 'is-active' : ''}`} onClick={() => choose(null)}>
            <span className="mode-icon" aria-hidden="true">✕</span>
            <span>Aucun</span>
          </button>
          {GLANCE && (
            <label className="mode-item mode-check">
              <input type="checkbox" checked={Boolean(state?.glance)} onChange={(e) => show(state?.mode ?? null, e.target.checked)} />
              <span>Fenêtre Coup d'œil</span>
            </label>
          )}
          <div className="mode-ship">
            <div className="mode-head">Vaisseau actuel</div>
            {ship?.shipId != null ? (
              <>
                <div className="mode-ship-name">
                  <strong>{ship.title || ship.model}</strong>
                  {ship.model && ship.title !== ship.model && <span className="small muted"> · {ship.model}</span>}
                </div>
                <div className="small">{roleSummary(ship.role)}</div>
                <div className="form-actions">
                  {/* key : un autre vaisseau (échange en jeu, menu ouvert) referme l'éditeur au lieu de lui donner le brouillon de l'ancien */}
                  <ShipRole key={ship.shipId} shipId={ship.shipId} role={ship.role} summary={false} />
                </div>
              </>
            ) : (
              <p className="mode-note">{ship ? 'Vaisseau inconnu pour l’instant : lance le jeu.' : 'Chargement…'}</p>
            )}
          </div>
          <p className="mode-note">
            {state && !state.installed
              ? texteOverlayAbsent({ coupe: state.disabled })
              : 'Les fenêtres s’affichent par-dessus le jeu, en plein écran fenêtré.'}
          </p>
          {error && <p className="mode-note bad">{error}</p>}
        </div>
      )}
    </div>
  );
}
