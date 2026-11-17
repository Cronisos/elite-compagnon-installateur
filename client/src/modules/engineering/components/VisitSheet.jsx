// Contenu de la fiche « Chez l'ingénieur », partagé par la fenêtre en jeu (VisitOverlay) et la page Itinéraire.
// Toutes les phrases viennent de visitView.js.

import { engApi } from '../api.js';
import { aboardText, costLine, emptyText, planLine, planOption, replacesText, taskLine } from '../visitView.js';

export default function VisitSheet({ state, compact = false }) {
  const empty = emptyText(state);
  if (empty) return <p className="vs-empty">{empty}</p>;
  if (!state?.modules?.length) return null;
  const choose = (e) => engApi.visitPlan(e.target.value === '' ? null : Number(e.target.value)).catch(() => {});
  return (
    <div className={`vs${compact ? ' is-compact' : ''}`}>
      {state.alerts?.map((a) => (
        <div key={a.id} className={`vs-alert ${a.kind.startsWith('remplace') ? 'is-ok' : ''}`}>
          <span>{a.text}</span>
          <button type="button" className="vs-btn" onClick={() => engApi.visitDismiss(a.id).catch(() => {})}>Compris</button>
        </div>
      ))}
      <div className="vs-plan">
        <span>{planLine(state)}</span>
        {state.plans.length > 1 && (
          <select value={state.manual ? state.planId : ''} onChange={choose} title="Plan affiché (indépendant du vaisseau piloté)">
            <option value="">Plan automatique</option>
            {state.plans.map((p) => <option key={p.planId} value={p.planId}>{planOption(p)}</option>)}
          </select>
        )}
      </div>
      <div className="vs-head">Ici tu dois faire :</div>
      {state.modules.map((m) => (
        <div key={`${m.slot}:${m.kind}`} className={`vs-row${m.done ? ' is-done' : ''}`}>
          <div className="vs-label">{m.label}</div>
          <div className="vs-task">{taskLine(m)}</div>
          {aboardText(m) && <div className="vs-note">{aboardText(m)}</div>}
          {replacesText(m) && <div className="vs-warn">{replacesText(m)}</div>}
        </div>
      ))}
      {state.cost?.materials?.length > 0 && (
        <>
          <div className="vs-head">Cela va te coûter :</div>
          <ul className="vs-cost">
            {state.cost.materials.map((x) => <li key={x.key} className={x.missing > 0 ? 'is-missing' : ''}>{costLine(x)}</li>)}
          </ul>
        </>
      )}
    </div>
  );
}

/** Styles de la fiche (fenêtre en jeu et page). */
export const VISIT_CSS = `
.vs { display: flex; flex-direction: column; gap: 5px; font-size: 13px; }
.vs-empty { color: #8a94a0; font-size: 13px; margin: 0; }
.vs-plan { display: flex; gap: 8px; align-items: center; color: #8a94a0; flex-wrap: wrap; }
.vs-plan select { font: inherit; }
.vs-head { color: #ffd24a; font-weight: 700; margin-top: 4px; }
.vs-row { padding: 4px 8px; border-left: 3px solid var(--accent); background: rgba(255,255,255,.035); }
.vs-row.is-done { border-left-color: #5fd38d; opacity: .8; }
.vs-label { font-weight: 600; }
.vs-task { font-variant-numeric: tabular-nums; }
.vs-note { color: #8a94a0; font-size: 12px; }
.vs-warn { color: #ff6b6b; font-size: 12px; }
.vs-alert { display: flex; gap: 8px; align-items: flex-start; padding: 4px 8px; background: rgba(255,107,107,.12); border-left: 3px solid #ff6b6b; }
.vs-alert.is-ok { background: rgba(95,211,141,.12); border-left-color: #5fd38d; }
.vs-alert span { flex: 1; }
.vs-btn { font: inherit; font-size: 12px; cursor: pointer; }
.vs-cost { margin: 0; padding-left: 18px; }
.vs-cost .is-missing { color: var(--accent); }
`;
