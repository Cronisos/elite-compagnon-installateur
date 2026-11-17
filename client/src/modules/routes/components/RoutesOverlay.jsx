import BuyAlerts from './BuyAlerts.jsx';
import RouteQuestions from './RouteQuestions.jsx';

/** Affiché sur toutes les pages : alertes d'achat et questions sur la route active. */
export default function RoutesOverlay() {
  return (
    <>
      <RouteQuestions />
      <BuyAlerts />
    </>
  );
}
