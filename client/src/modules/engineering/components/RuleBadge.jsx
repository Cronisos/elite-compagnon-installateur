import { statusBadge } from '../rankView.js';

/**
 * Badge du statut d'une règle des rangs (mesurée, à vérifier, inconnue), avec son explication au survol. source : la
 * source déclarée dans la table des règles (journaux de référence…) ; why : le motif du statut (la table ou statusWhy du
 * calcul), sans lequel « à vérifier » se lit « déduite avec une hypothèse ». help remplace toute l'explication.
 */
export default function RuleBadge({ status, source = null, why = null, help = null }) {
  const b = statusBadge(status, source, why);
  return <span className={b.className} title={help || b.help}>{b.label}</span>;
}
