// Attente des données d'une page : « Chargement… », ou, si la lecture a échoué, la raison et un bouton Réessayer
// (au lieu d'une page figée sur « Chargement… » quand le serveur local ne répond pas).

import { texteEchec } from './actions.js';

/**
 * @param erreur message de l'échec, ou null pendant le chargement
 * @param quoi ce que la page lit (« l'état des données de référence »)
 * @param onReessayer relance la lecture
 */
export default function Chargement({ erreur, quoi = 'les données de la page', onReessayer }) {
  if (!erreur) return <p className="muted">Chargement…</p>;
  return (
    <div className="form-actions">
      <p className="bad">{texteEchec(quoi, erreur)}</p>
      {onReessayer && <button className="btn" onClick={onReessayer}>Réessayer</button>}
    </div>
  );
}
