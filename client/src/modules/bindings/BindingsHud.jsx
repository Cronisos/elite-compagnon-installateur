import { useOverlayPage } from '../../core/hud.jsx';
import { useBindings } from './useBindings.js';
import './bindings.css';

/**
 * Page de l'overlay (/hud/bindings) : alerte par-dessus le jeu quand le profil de commandes a été ignoré.
 * Le serveur ouvre la fenêtre de lui-même et la ferme au ✕, à la fermeture du jeu ou quand le rapport change.
 * Taille d'un HUD (700 × 124) : titre et consigne, puis la sauvegarde du jeu sur la ligne du bas.
 */
export default function BindingsHud() {
  const { editing, pin, hover } = useOverlayPage();
  const { status, dismiss } = useBindings();
  const alert = status?.alert;
  if (!alert || status.level === 'info') return null;

  return (
    <div className={`hud hud-overlay bnd-hud ${status.level === 'warning' ? 'is-warning' : ''} ${editing ? 'hud-editing' : ''}`}>
      <div className="bnd-hud-row">
        <span className="bnd-hud-icon" aria-hidden="true">⚠</span>
        <div>
          <div className="hud-title bnd-hud-title">{alert.title}</div>
          <div className="bnd-hud-message">{alert.message}</div>
        </div>
      </div>
      <div className="hud-last">
        <span className="hud-tag">{editing ? 'Déplacement' : 'Sauvegarde'}</span>
        <span>
          {editing
            ? 'fais glisser le cadre, puis 📌 pour le fixer'
            : alert.backup ? <><b>{alert.backup}</b> · {status.displayDir}</> : `aucune .backup dans ${status.displayDir}`}
        </span>
        <button className="hud-pin" title="Fermer cette alerte" {...hover} onClick={() => dismiss('overlay')}>✕</button>
        {pin}
      </div>
    </div>
  );
}
