import { ruleBadges } from '../routeView.js';

/**
 * Badges des règles non mesurées sur lesquelles repose une étape (« R5b · à vérifier »), avec au survol le texte de la
 * règle et ce qui la fonde (table de l'itinéraire, GET /route/rules).
 */
export default function RuleBadges({ ids = [], rules }) {
  const list = ruleBadges(ids, rules);
  if (!list.length) return null;
  return (
    <>
      {list.map((b) => (
        <span key={b.id} className={b.className} title={b.help}>{b.label}</span>
      ))}
    </>
  );
}
