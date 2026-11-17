import { useLocation, useNavigate } from 'react-router';
import CompanionView from './CompanionView.jsx';
import { useCompanion } from './useCompanion.js';
import { bureau } from '../../core/bureau.js';
import { confirmerDepart } from '../../core/gardeModifs.js';

/**
 * Petit compagnon de l'application, en bas à droite de chaque page (réglage « dans l'application »).
 * Un clic sur lui ouvre ses réglages ; il n'apparaît pas sur la page des réglages, qui a son propre aperçu.
 * App de bureau : jamais ici, le copilote a sa propre fenêtre par-dessus le jeu (déplaçable, comme les modules).
 */
export default function CompanionDock() {
  const { state, line, pack, mood, name } = useCompanion();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const s = state?.settings;
  if (bureau || !s?.enabled || !s.inApp || pathname.startsWith('/compagnon')) return null;
  return (
    <CompanionView
      pack={pack}
      mood={mood}
      line={line}
      name={name}
      side="right"
      variant="dock"
      onFigureClick={() => confirmerDepart() && navigate('/compagnon')}
      figureTitle={`${name} : réglages du compagnon`}
    />
  );
}
