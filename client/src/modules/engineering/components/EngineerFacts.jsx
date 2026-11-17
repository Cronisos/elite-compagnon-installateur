import { useState } from 'react';
import { Link } from 'react-router';
import { engApi } from '../api.js';
import { conditionsLines, factLink, factsText } from '../engineerView.js';

/**
 * Fiche d'un ingénieur à une escale (mêmes fonctions de vue que sa page) : base, ce qu'il propose pour tes tâches,
 * épingle retenue au calcul et points incertains, toujours visibles ; conditions, réputation et permis en dépliant
 * (lus à l'ouverture, GET /engineers/:id), avec le lien vers sa page (sources).
 * @param {{ eng: object, stop: object, labels: object }} props eng : ligne de GET /engineers
 */
export default function EngineerFacts({ eng, stop, labels }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  if (!eng) return null;
  const f = factsText(eng, { stop, labels });
  const open = (e) => {
    if (e.currentTarget.open && !detail) engApi.engineer(eng.id).then(setDetail).catch((err) => setError(err.message));
  };
  return (
    <div className="eng-facts small">
      {f.lines.map((l, i) => <div key={i} className={i ? '' : 'muted'}>{l}</div>)}
      {f.uncertain.map((u, i) => <div key={`u${i}`} className="warn">{u}</div>)}
      <details onToggle={open}>
        <summary className="muted">Conditions, réputation, permis</summary>
        {error && <p className="bad">{error}</p>}
        {!detail && !error && <p className="muted">Chargement…</p>}
        {detail && <EngineerConditions e={detail} />}
        <Link to={`/ingenierie/ingenieurs/${eng.id}`}>{factLink(eng)}</Link>
      </details>
    </div>
  );
}

/** Conditions de découverte, d'invitation et de déblocage (avec ce que tu as), réputation, permis. */
export function EngineerConditions({ e }) {
  return (
    <ul className="notes small">
      {conditionsLines(e).map((l, i) => (
        <li key={i} className={l.tone || ''}>
          {l.text}
          {(l.items || []).map((x, j) => <div key={j} className={x.tone}>{x.text}</div>)}
        </li>
      ))}
    </ul>
  );
}
