import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router';
import { dateTime } from '../../core/format.js';
import { useBindings } from './useBindings.js';
import './bindings.css';

/**
 * Bandeau affiché sur toutes les pages quand le jeu a ignoré le profil de commandes (manette absente) ou signalé
 * des erreurs en le chargeant. Fermable ; caché sur la page du module, qui montre tout le détail.
 * Il se place au bas de la barre du haut (collante) : il pousse la page au lieu de la couvrir, et les alertes
 * flottantes des autres modules (achats, questions de route) restent au-dessus de lui.
 */
export default function BindingsBanner() {
  const { status, dismiss } = useBindings();
  const { pathname } = useLocation();
  const [bar, setBar] = useState(null);
  useLayoutEffect(() => setBar(document.querySelector('header.topbar')), []);
  const alert = status?.alert;
  if (!status?.banner || !alert || pathname.startsWith('/commandes')) return null;

  const backup = status.backups.find((b) => b.file === alert.backup);
  const banner = (
    <div className={`bnd-banner ${status.level === 'warning' ? 'is-warning' : ''}`} role="alert">
      <span className="bnd-banner-icon" aria-hidden="true">⚠</span>
      <div className="bnd-banner-body">
        <strong>{alert.title}</strong>
        <span className="bnd-banner-message">{alert.message}</span>
        <span className="bnd-banner-hint">
          {backup ? `Sauvegarde du jeu : ${backup.file} (${dateTime(backup.modifiedAt)}), dans ${status.displayDir}. ` : `${alert.backupsHint} `}
          <Link to="/commandes">Détails</Link>
        </span>
      </div>
      <button className="btn btn-ghost bnd-banner-close" onClick={() => dismiss('banner')} aria-label="Fermer" title="Fermer ce bandeau (la page Garde des commandes garde le détail)">
        ✕
      </button>
    </div>
  );
  // Sans barre du haut (autre cadre) : à sa place, dans le flux de la page
  return bar ? createPortal(banner, bar) : banner;
}
