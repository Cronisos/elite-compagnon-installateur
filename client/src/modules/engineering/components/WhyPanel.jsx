import { whyText } from '../routeView.js';

/**
 * « Pourquoi lui ? » d'une escale, fermé par défaut : ce qui l'a fait choisir, contre quelles autres options, ce que
 * coûterait de s'en passer, et ce que ce choix coûte (phrases de routeView.whyText).
 */
export default function WhyPanel({ stop, result, names, engs }) {
  const w = whyText(stop, { result, names, engs });
  if (!w) return null;
  return (
    <details className="why small">
      <summary>Pourquoi lui ?</summary>
      <div className="eng-title">{w.title}</div>
      {w.units.map((u) => (
        <div key={u.id} className="why-unit">
          {u.lines.map((l, i) => <div key={i}>{l}</div>)}
          {u.options.length > 0 && (
            <ul className="notes muted">
              {u.options.map((o, i) => <li key={i}>{o}</li>)}
            </ul>
          )}
        </div>
      ))}
      {w.locked && <div className="warn">{w.locked}</div>}
      {w.without && <div>{w.without}</div>}
      <div className="muted">{w.cost}</div>
    </details>
  );
}
