import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { engApi, useEngineeringRefresh } from '../api.js';
import ExternalLinks from '../../../core/ExternalLinks.jsx';
import PinEditor from '../components/PinEditor.jsx';
import RuleBadges from '../components/RuleBadges.jsx';
import { EngineerConditions } from '../components/EngineerFacts.jsx';
import { OFFERS_NOTE, baseText, headerText, homeStateText, offersByGroup, padsPermitText, planModuleText, routeHereText } from '../engineerView.js';
import { remoteLine, taskLine } from '../routeView.js';

/**
 * Page d'un ingénieur : où il est (base, plateformes, permis, distance), son état chez toi et ses conditions, ton
 * épingle chez lui, ce qu'il peut faire pour tes plans validés et ce que le dernier itinéraire prévoit chez lui, ce
 * qu'il propose, ses points incertains et ses sources.
 */
export default function EngineerPage() {
  const { id } = useParams();
  const [e, setE] = useState(null);
  const [route, setRoute] = useState(null);
  const [list, setList] = useState(null);
  const [rules, setRules] = useState(new Map());
  const [error, setError] = useState('');
  const load = () => Promise.all([
    engApi.engineer(id).then((x) => {
      setE(x);
      setError('');
    }),
    engApi.route().then(setRoute).catch(() => setRoute(null)),
    engApi.engineers().then(setList).catch(() => setList(null)),
  ]).catch((err) => setError(err.message));
  useEffect(() => {
    setE(null);
    setError('');
    load();
  }, [id]);
  useEffect(() => {
    engApi.routeRules().then((r) => setRules(new Map(r.rules.map((x) => [x.id, x])))).catch(() => {});
  }, []);
  useEngineeringRefresh(load, { live: true });
  const names = useMemo(() => new Map((list?.engineers || []).map((x) => [x.id, x.name])), [list]);

  if (!e) return <p className="muted">{error || 'Chargement…'}</p>;
  const result = route?.result || null;
  const live = route?.live || {};
  const here = routeHereText(e);
  const stop = { engineer: e.id, tasks: e.route?.tasks || [] };
  const groups = offersByGroup(e.offers);

  return (
    <div className="page">
      <section data-tuto="ingenierie-fiche-lieu" className="panel">
        <h2>{headerText(e)} <ExternalLinks kind="system" vars={{ system: e.system, systemAddress: e.systemAddress }} /></h2>
        <p className="small">{baseText(e)}</p>
        <p className="small">{padsPermitText(e)}</p>
        <p>{homeStateText(e)}</p>
        <EngineerConditions e={e} />
      </section>

      <PinEditor engineer={e} rule={rules.get('R2a') || null} onSaved={load} />

      <section data-tuto="ingenierie-fiche-plans" className="panel">
        <h2>Ici, pour tes plans validés</h2>
        {e.plans.length ? (
          <ul className="notes small">
            {e.plans.flatMap((p) => p.modules.map((m) => <li key={`${p.planId}/${m.slot}`}>{planModuleText(p, m)}</li>))}
          </ul>
        ) : <p className="small muted">Aucun de tes plans validés n’a de module qu’il modifie.</p>}
        <p className={`small ${here.empty ? 'muted' : ''}`}>{here.title}</p>
        {!here.empty && (
          <ul className="task-list small">
            {(e.route.remote || []).map((t) => {
              const l = remoteLine(t, { result, live, names });
              return <li key={`d-${t.id}`}><span className="task-mark">{l.mark}</span> {l.text} · {l.when} <RuleBadges ids={l.rules} rules={rules} /></li>;
            })}
            {stop.tasks.map((t) => {
              const l = taskLine(t, stop, { result, live, names });
              return <li key={t.id}><span className="task-mark">{l.mark}</span> {l.text} <RuleBadges ids={l.rules} rules={rules} /></li>;
            })}
          </ul>
        )}
      </section>

      <section data-tuto="ingenierie-fiche-offres" className="panel">
        <h2>Ce qu’il propose (grade maximal)</h2>
        <ul className="notes small">
          {groups.map((g) => <li key={g.group}><strong>{g.group}</strong> : {g.text}</li>)}
        </ul>
        <p className="small muted">{OFFERS_NOTE} <RuleBadges ids={['R5b']} rules={rules} /></p>
      </section>

      {e.uncertain.length > 0 && (
        <section className="panel">
          <h2>Points incertains</h2>
          <ul className="notes small">
            {e.uncertain.map((u, i) => <li key={i}>{u.reason}</li>)}
          </ul>
        </section>
      )}

      <section className="panel">
        <details>
          <summary data-tuto="ingenierie-fiche-sources">Sources (lues le 8 nov. 2026)</summary>
          <ul className="notes small">
            {Object.entries(e.sources || {}).map(([k, v]) => (
              <li key={k}><span className="muted">{k}</span> : {[v].flat().join(' ; ')}</li>
            ))}
          </ul>
        </details>
      </section>
    </div>
  );
}
