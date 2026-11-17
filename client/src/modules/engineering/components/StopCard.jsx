import { Link } from 'react-router';
import RuleBadge from './RuleBadge.jsx';
import RuleBadges from './RuleBadges.jsx';
import EngineerFacts from './EngineerFacts.jsx';
import WhyPanel from './WhyPanel.jsx';
import {
  UNLOCK_TITLE, VARIANT_TEXT, fallbackText, materialsLine, rankLine, stopHeader, stopOrderText, stopStateText, taskLine, unlockLines, vehicleLines, warningLines,
} from '../routeView.js';

/**
 * Une escale de l'itinéraire : qui, où, à quelle distance ; sa fiche ; ce que tu vas y faire (cases cochées en direct) ;
 * les règles à vérifier, replis et avertissements ; le vaisseau à amener ; le rang ; le déblocage ; les matériaux qui
 * manqueront ; « Pourquoi lui ? ». « Ne pas y passer » l'écarte et relance le calcul (un clic).
 */
export default function StopCard({ stop, result, live, names, engs, labels, rules, onExclude, busy }) {
  const eng = engs.get(stop.engineer) || null;
  const ctx = { result, live, names };
  const unlock = unlockLines(stop.unlock, { names, home: result.from?.region });
  const warnings = warningLines(stop.tasks.filter((t) => t.kind !== 'reference'), { result, names });
  const vehicle = vehicleLines(stop, { result });
  const rank = rankLine(stop);
  const order = stopOrderText(stop);
  const mats = materialsLine(stop, live);
  return (
    <article data-tuto="ingenierie-iti-escale" className="eng-item stop-card">
      <div className="stop-head">
        <span className="eng-title">{stopHeader(stop, eng, names)}</span>
        <span className="stop-actions">
          <Link className="btn small" to={`/ingenierie/ingenieurs/${stop.engineer}`}>Fiche</Link>
          <button type="button" className="btn small btn-ghost" disabled={busy} onClick={() => onExclude(stop.engineer)}>Ne pas y passer</button>
        </span>
      </div>
      <div className="small muted">{stopStateText(stop, eng, result)}</div>
      <EngineerFacts eng={eng} stop={stop} labels={labels} />

      {unlock.length > 0 && (
        <div className="small">
          <div className="warn">{UNLOCK_TITLE}</div>
          <ol className="notes">
            {unlock.map((s, i) => (
              <li key={i}>
                {s.text}
                {s.note && <span className="muted"> ({s.note})</span>}
                {(s.items || []).map((x, j) => <div key={j} className={x.tone}>{x.text}</div>)}
              </li>
            ))}
          </ol>
        </div>
      )}

      <ul className="task-list small">
        {stop.tasks.map((t) => {
          const l = taskLine(t, stop, ctx);
          const fb = t.kind === 'effet' ? fallbackText(t, stop, names) : null;
          return (
            <li key={t.id} className={l.state === 'fait' ? 'good' : ''}>
              <span className="task-mark">{l.mark}</span> {l.text}
              {l.state && <span className="muted"> · {l.state}</span>} <RuleBadges ids={l.rules} rules={rules} />
              {fb && <div className="muted">{fb}</div>}
              {t.variant && <div className="muted">{VARIANT_TEXT}</div>}
            </li>
          );
        })}
      </ul>

      {warnings.map((w, i) => <div key={i} className={`small ${w.tone}`}>{w.text}</div>)}
      {vehicle.map((v, i) => <div key={`v${i}`} className={`small ${v.tone || ''}`}>{v.text}</div>)}

      {rank && (
        <div className="small">
          {rank} {stop.rank.status && stop.rank.status !== 'mesurée' && <RuleBadge status={stop.rank.status} />}
          {order && <div className="muted">{order}</div>}
        </div>
      )}
      {mats && <div className={`small ${mats.tone}`}>{mats.text}</div>}
      <WhyPanel stop={stop} result={result} names={names} engs={engs} />
    </article>
  );
}
