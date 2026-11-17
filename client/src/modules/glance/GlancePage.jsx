import GlancePanel from './GlancePanel.jsx';
import { OverlayToggle } from '../../core/overlay.jsx';

/** Page plein écran (second écran) : même contenu que le panneau. */
export default function GlancePage() {
  return (
    <div className="page">
      <header className="route-header">
        <h1>Coup d'œil</h1>
        <div className="form-actions" data-tuto="outils-coupdoeil-fenetre">
          <OverlayToggle page="glance" />
        </div>
      </header>
      <GlancePanel />
    </div>
  );
}
