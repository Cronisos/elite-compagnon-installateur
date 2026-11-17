import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { engApi, useEngineeringRefresh } from '../api.js';
import StopCard from '../components/StopCard.jsx';
import VisitSheet, { VISIT_CSS } from '../components/VisitSheet.jsx';
import { visitTitle } from '../visitView.js';
import { useEvent } from '../../../core/stream.js';
import RuleBadges from '../components/RuleBadges.jsx';
import {
  LEGEND, NO_PLAN, NO_RECOMPUTE, REMOTE_SUBTITLE, REMOTE_TITLE, TITLE, UNKNOWN_POSITION, bannerText, computeButton, engineerOptionText, excludedItems,
  ifUnlockedText, impossibleLine, orderText, partTitle, planCheckText, remoteHereText, remoteLine, splitNotes, startLabel, storeWarningText,
  summaryPills, warningLines,
} from '../routeView.js';

const START_KINDS = ['position', 'sol', 'colonia', 'engineer'];

/**
 * Onglet Itinéraire : les plans validés à cocher, le point de départ, puis l'itinéraire calculé (seulement au clic) :
 * bandeau (d'où, quand, ce qui a changé depuis), tâches à distance, parties (ta région, à préparer, traversée, retour)
 * et leurs escales. L'ordre et les choix datent du calcul ; les cases faites et les manques sont à jour (GET /route).
 */
export default function RoutePage() {
  const [view, setView] = useState(null);
  const [list, setList] = useState(null);
  const [rules, setRules] = useState(new Map());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [unchecked, setUnchecked] = useState(() => new Set());
  const [start, setStart] = useState(null);
  const [engineerStart, setEngineerStart] = useState('');
  // Fiche « Chez l'ingénieur » : affichée en tête quand tu es à quai chez un ingénieur qui a des tâches
  const [visit, setVisit] = useState(null);
  useEffect(() => {
    engApi.visit().then(setVisit).catch(() => {});
  }, []);
  useEvent('engineering:visit', setVisit);

  const load = () => Promise.all([engApi.route(), engApi.engineers()])
    .then(([v, e]) => {
      setView(v);
      setList(e);
    })
    .catch((e) => setError(e.message));
  useEffect(() => {
    load();
    engApi.routeRules().then((r) => setRules(new Map(r.rules.map((x) => [x.id, x])))).catch(() => {});
  }, []);
  useEngineeringRefresh(load, { live: true });

  const names = useMemo(() => new Map((list?.engineers || []).map((e) => [e.id, e.name])), [list]);
  const engs = useMemo(() => new Map((list?.engineers || []).map((e) => [e.id, e])), [list]);

  if (!view || !list) return <p className="muted">{error || 'Chargement…'}</p>;
  const result = view.result;
  // Départ : le choix du joueur, sinon celui du dernier calcul, sinon sa position (ou Sol si elle est inconnue)
  const fromResult = result?.from?.kind;
  const kind = start ?? (fromResult && START_KINDS.includes(fromResult) ? fromResult : view.position ? 'position' : 'sol');
  const engStart = engineerStart || String(result?.from?.engineerId ?? list.engineers[0]?.id ?? '');
  const checkable = view.validated.filter((p) => !p.stale);
  const planIds = checkable.filter((p) => !unchecked.has(p.id)).map((p) => p.id);
  const exclude = result?.options?.exclude || [];
  const button = computeButton(view);
  const banner = bannerText(view, names);
  const notes = splitNotes(result?.notes || []);
  const excluded = excludedItems(exclude, names);
  const warnings = [...(view.warnings || []), ...(list.warnings || [])].filter((w, i, a) => a.findIndex((x) => x.file === w.file) === i);
  const live = view.live || {};
  const here = remoteHereText(live.remoteHere);

  const fromBody = () => (kind === 'engineer' ? { engineer: Number(engStart) } : kind);
  async function compute({ excludeIds = exclude, from = fromBody() } = {}) {
    setBusy(true);
    setError('');
    try {
      await engApi.computeRoute({ planIds, from, exclude: excludeIds });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const toggle = (id) => setUnchecked((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  return (
    <div className="page">
      {visit?.modules?.length > 0 && (
        <section className="panel">
          <style>{VISIT_CSS}</style>
          <h2>{visitTitle(visit)}</h2>
          <VisitSheet state={visit} />
        </section>
      )}
      <section className="panel">
        <h2>{TITLE}</h2>
        {!view.validated.length ? (
          <p data-tuto="ingenierie-iti-plans">
            {NO_PLAN} <Link to="/vaisseaux">Mes vaisseaux</Link>
          </p>
        ) : (
          <div data-tuto="ingenierie-iti-plans" className="route-plans">
            {view.validated.map((p) => {
              const t = planCheckText(p);
              return (
                <label key={p.id} className={`check ${t.disabled ? 'muted' : ''}`}>
                  <input type="checkbox" disabled={t.disabled || busy} checked={!t.disabled && !unchecked.has(p.id)} onChange={() => toggle(p.id)} /> {t.text}
                  {t.note && <span className="warn small"> · {t.note}</span>}
                </label>
              );
            })}
          </div>
        )}
        <fieldset data-tuto="ingenierie-iti-depart" className="route-start" disabled={busy}>
          <legend className="small muted">Partir de :</legend>
          {START_KINDS.map((k) => (
            <label key={k} className={`check ${k === 'position' && !view.position ? 'muted' : ''}`}>
              <input type="radio" name="start" value={k} checked={kind === k} disabled={k === 'position' && !view.position} onChange={() => setStart(k)} /> {startLabel(k, view.position)}
              {k === 'engineer' && (
                <select value={engStart} onChange={(e) => { setEngineerStart(e.target.value); setStart('engineer'); }} aria-label="Ingénieur de départ">
                  {[...list.engineers].sort((a, b) => a.name.localeCompare(b.name, 'fr')).map((e) => <option key={e.id} value={e.id}>{engineerOptionText(e)}</option>)}
                </select>
              )}
            </label>
          ))}
          {!view.position && <p className="small warn">{UNKNOWN_POSITION}</p>}
        </fieldset>
        {excluded && (
          <p className="small">
            {excluded.label}{' '}
            {excluded.items.map((x) => (
              <span key={x.id} className="excluded-item">
                {x.name}{' '}
                <button type="button" className="btn small btn-ghost" disabled={busy} onClick={() => compute({ excludeIds: exclude.filter((id) => id !== x.id) })}>{x.action}</button>
              </span>
            ))}
          </p>
        )}
        <div className="form-actions">
          <button data-tuto="ingenierie-iti-calculer" type="button" className={`btn ${button.primary ? 'btn-primary' : ''}`} disabled={busy || !planIds.length} onClick={() => compute()}>{button.label}</button>
          {busy && <span className="muted small">Calcul…</span>}
        </div>
        <p className="small muted">{NO_RECOMPUTE}</p>
        {error && <p className="bad">{error}</p>}
      </section>

      {warnings.map((w) => <p key={w.file} className="alert alert-warning small">{storeWarningText(w)}</p>)}

      {result && (
        <>
          <section data-tuto="ingenierie-iti-resume" className="panel">
            <p>{banner.computed}</p>
            {banner.here && (
              <p className={banner.here.tone || ''}>
                {banner.here.text}{' '}
                {banner.here.recompute && <button type="button" className="btn small btn-primary" disabled={busy || !planIds.length} onClick={() => compute({ from: 'position' })}>Recalculer</button>}
              </p>
            )}
            {banner.changes && <p className="warn small">{banner.changes}</p>}
            <p className="small muted">{banner.note}</p>
            <div className="route-pills">
              {summaryPills(result).map((t) => <span key={t} className="pill">{t}</span>)}
            </div>
            {orderText(result, names).map((t, i) => <p key={i} className="small muted">{t}</p>)}
            {notes.other.length > 0 && (
              <ul className="notes small">
                {notes.other.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            )}
            {ifUnlockedText(result.ifUnlocked, names) && <p className="small accent">{ifUnlockedText(result.ifUnlocked, names)}</p>}
          </section>

          {result.remote.length > 0 && (
            <section data-tuto="ingenierie-iti-distance" className="panel">
              <h2>{REMOTE_TITLE}</h2>
              <p className="small muted">{REMOTE_SUBTITLE}</p>
              {here && <p className={`small ${here.tone}`}>{here.text}</p>}
              <ul className="task-list small">
                {result.remote.map((t) => {
                  const l = remoteLine(t, { result, live, names });
                  return (
                    <li key={t.id} className={l.state === 'fait' ? 'good' : ''}>
                      <span className="task-mark">{l.mark}</span> {l.text}
                      {l.state && <span className="muted"> · {l.state}</span>} <RuleBadges ids={l.rules} rules={rules} />
                      {l.caveat && <div className="muted">{l.caveat}</div>}
                      <div>{l.when}</div>
                      {l.check && <div className="warn">{l.check}</div>}
                      {warningLines([t], { result, names }).map((w, i) => <div key={i} className={w.tone}>{w.text}</div>)}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {result.parts.map((part, i) => {
            const t = partTitle(part, names);
            return (
              <section key={`${part.kind}-${i}`} className="panel">
                <h2>{t.title}</h2>
                {t.detail && <p className="small muted">{t.detail}</p>}
                {part.kind === 'traversee' && notes.crossing.map((n, j) => <p key={j} className="small warn">{n}</p>)}
                <div className="eng-list stop-list">
                  {part.stops.map((s) => (
                    <StopCard key={s.n} stop={s} result={result} live={live} names={names} engs={engs} labels={list.labels} rules={rules} busy={busy}
                      onExclude={(id) => compute({ excludeIds: [...new Set([...exclude, id])] })} />
                  ))}
                </div>
              </section>
            );
          })}

          {result.impossible.length > 0 && (
            <section className="panel">
              <h2 className="bad">Impossible</h2>
              <ul className="notes small">
                {result.impossible.map((x) => <li key={x.id}>{impossibleLine(x, result)}</li>)}
              </ul>
            </section>
          )}
          <p className="small muted">{LEGEND}</p>
        </>
      )}
    </div>
  );
}
