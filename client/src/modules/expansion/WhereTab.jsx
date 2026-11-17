// Onglet « Où agir cette semaine » du Projet extension : les systèmes valides pour une activité Powerplay ou une
// tâche de la semaine, à portée de soi, par l'API du module serveur whereto (données Spansh, confirmées par le
// journal à l'arrivée).

import { useEffect, useState } from 'react';
import { api } from '../../core/api.js';
import { useEvent } from '../../core/stream.js';
import { useGameState } from '../../core/useGameState.js';
import Tile from '../../core/Tile.jsx';
import ExternalLinks from '../../core/ExternalLinks.jsx';
import { ago, dateTime, dec1, int } from '../../core/format.js';
import { RELATION_LABELS, ageTone, isUsefulArrival, pctText, progressText, reachText, shareText, stateLabel, taskToSend } from './whereto.js';
import NomSysteme from '../../core/NomSysteme.jsx';

const base = '/modules/whereto';
const STORE = 'whereto.filters';
const DEFAULTS = {
  choice: 'acquisition', followPosition: true, system: '', radius: 30, power: '', enemy: '', sort: 'distance',
  stationGroups: [], largePad: false, powerContact: false, conflictZone: false,
};
const EMPTY_TASK = { name: '', relation: 'enemy', states: ['Exploited', 'Fortified', 'Stronghold'], stationGroups: [], largePad: false, powerContact: false, conflictZone: false, enemy: '', note: '' };

function loadFilters() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE) || '{}') };
  } catch {
    return DEFAULTS;
  }
}

const toggle = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

function CopyName({ name }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(name);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // presse-papiers indisponible
    }
  }
  return <button type="button" className="btn btn-ghost small" onClick={copy}>{copied ? 'Copié ✓' : 'Copier'}</button>;
}

/** Bandeau : dernière arrivée, confirmée ou démentie par le journal. */
function Arrival({ a }) {
  if (!a) return null;
  const tone = a.valid === true ? 'pill-good' : a.valid === false ? 'pill-bad' : 'pill-warn';
  const verdict = a.valid === true ? 'valide' : a.valid === false ? 'pas valide' : 'à confirmer';
  return (
    <div className={`alert ${a.valid === false ? 'alert-danger' : a.valid == null ? 'alert-warning' : ''}`}>
      <strong>Arrivé à <NomSysteme nom={a.system} /></strong> {a.at && <span className="tiny muted">({ago(a.at)})</span>} :{' '}
      <span className={`pill ${tone}`}>{verdict}</span> pour « {a.task} » d'après le journal — {a.reasons.join(' · ')}.
      {a.spansh && a.spansh.state !== a.state && (
        <> Spansh disait {stateLabel(a.spansh.state)} : son relevé était dépassé.</>
      )}
      {!a.inResults && <span className="tiny muted"> (système hors de la dernière liste)</span>}
      {a.stationNote && <div className="tiny muted">{a.stationNote}</div>}
    </div>
  );
}

/** Ligne discrète pour un saut de transit : hors de la liste et pas valide (le bandeau garde la dernière cible). */
function Transit({ a }) {
  if (!a) return null;
  return (
    <p className="tiny muted">
      En route : <NomSysteme nom={a.system} /> {a.at && <>({ago(a.at)})</>}, hors de la dernière liste — {a.reasons.join(' · ')}.
    </p>
  );
}

/** Formulaire d'une tâche de la semaine (le journal ne les écrit pas : c'est toi qui la saisis). */
function TaskForm({ ctx, onSaved, onCancel }) {
  const [t, setT] = useState(EMPTY_TASK);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setT({ ...t, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const statesLocked = t.relation === 'acquisition';

  async function save(e) {
    e.preventDefault();
    setError(null);
    try {
      const saved = await api(`${base}/tasks`, { method: 'POST', body: { ...t, enemy: t.enemy || null } });
      onSaved(saved);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="panel form planner-form" data-tuto="extension-agir-tache-form" onSubmit={save}>
      <h3>Nouvelle tâche de la semaine</h3>
      <div className="planner-fields">
        <label>
          Nom de la tâche
          <input value={t.name} onChange={set('name')} maxLength={120} placeholder="ex. Scanner des mégavaisseaux" required />
        </label>
        <label>
          Système visé
          <select value={t.relation} onChange={set('relation')}>
            {Object.entries(RELATION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        {t.relation === 'enemy' && (
          <label>
            Puissance visée
            <select value={t.enemy} onChange={set('enemy')}>
              <option value="">toutes sauf la tienne</option>
              {ctx?.powers.filter((p) => p !== ctx.power).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        )}
        <label>
          Note
          <input value={t.note} onChange={set('note')} maxLength={500} placeholder="ex. 10 scans, récompense 2 000 mérites" />
        </label>
      </div>
      <div className="form-actions">
        <span className="small muted">États :</span>
        {Object.entries(ctx?.states || {}).map(([k, v]) => (
          <label key={k} className="check">
            <input
              type="checkbox"
              disabled={statesLocked || (k === 'Unoccupied' && t.relation !== 'any')}
              checked={statesLocked ? k === 'Unoccupied' : t.states.includes(k)}
              onChange={() => setT({ ...t, states: toggle(t.states, k) })}
            /> {v}
          </label>
        ))}
      </div>
      <div className="form-actions">
        <span className="small muted">Station exigée :</span>
        {ctx?.stationGroups.map((g) => (
          <label key={g.id} className="check">
            <input type="checkbox" checked={t.stationGroups.includes(g.id)} onChange={() => setT({ ...t, stationGroups: toggle(t.stationGroups, g.id) })} /> {g.label}
          </label>
        ))}
        <label className="check"><input type="checkbox" checked={t.largePad} onChange={set('largePad')} /> Plateforme L</label>
        <label className="check"><input type="checkbox" checked={t.powerContact} onChange={set('powerContact')} /> Contact Powerplay</label>
        <label className="check"><input type="checkbox" checked={t.conflictZone} onChange={set('conflictZone')} /> Zones de conflit (guerre en cours)</label>
      </div>
      <div className="form-actions">
        <button className="btn btn-primary">Enregistrer la tâche</button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Annuler</button>
        {error && <span className="bad">{error}</span>}
      </div>
    </form>
  );
}

function Results({ result }) {
  const [copied, setCopied] = useState(false);
  const { task, results, meta } = result;
  const relation = task.relation;

  async function share() {
    try {
      await navigator.clipboard.writeText(shareText(result, results.slice(0, 10), ago));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // presse-papiers indisponible
    }
  }

  return (
    <section className="panel">
      <div className="form-actions">
        <p>
          <strong>{int(meta.found)}</strong> système{meta.found > 1 ? 's' : ''} pour « {task.name} » à {int(result.radius)} al de{' '}
          <strong>{result.reference}</strong>
          {result.power && <> · {result.power}</>}
          {meta.found > meta.shown && <> ({int(meta.shown)} affichés)</>}
        </p>
        {results.length > 0 && <button type="button" className="btn small" onClick={share}>{copied ? 'Copié ✓' : 'Copier pour Discord'}</button>}
      </div>
      {meta.truncated && <p className="warn small">Recherche trop large : Spansh a plus de systèmes que l'app n'en lit. Réduis le rayon.</p>}
      {!results.length && <p className="muted">Aucun système valide à portée. Élargis le rayon ou change de point de départ.</p>}
      {results.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Système</th>
                <th className="right">Distance</th>
                <th>État</th>
                <th>Avancement</th>
                <th>{relation === 'acquisition' ? 'Portée' : 'Stations'}</th>
                <th>Relevé Spansh</th>
                <th>En jeu</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.name} className={r.seen?.newer && r.seen.valid === false ? 'row-muted' : ''}>
                  <td>
                    <strong>{r.name}</strong> <CopyName name={r.name} />
                    <div><ExternalLinks kind="system" vars={{ system: r.name, systemAddress: r.id64 }} /></div>
                  </td>
                  <td className="right num">{dec1(r.distance)} al</td>
                  <td>
                    <span className="pill">{stateLabel(r.state)}</span>
                    {relation !== 'own' && r.controllingPower && <div className="tiny muted">{r.controllingPower}</div>}
                    {r.warZones > 0 && <div className="tiny warn">guerre en cours</div>}
                  </td>
                  <td className="small">{progressText(r, relation)}</td>
                  <td className="small">
                    {relation === 'acquisition' && <div>{reachText(r.reach)}</div>}
                    {r.stations.slice(0, 3).map((s) => (
                      <div key={s.name} className="tiny">
                        {s.name} <span className="muted">· {s.type}{s.largePad ? ' · L' : ''}{s.powerContact ? ' · contact Powerplay' : ''}{s.arrival != null ? ` · ${int(s.arrival)} ls` : ''}</span>
                      </div>
                    ))}
                    {r.stations.length > 3 && <div className="tiny muted">+ {r.stations.length - 3} autres</div>}
                    {!r.stations.length && relation !== 'acquisition' && <span className="muted">aucune station</span>}
                  </td>
                  <td className={`small ${ageTone(r.updatedAt, result.weekStart)}`} title={r.updatedAt ? dateTime(r.updatedAt) : ''}>
                    {ago(r.updatedAt)}
                    {!r.thisWeek && <div className="tiny">avant le passage de semaine</div>}
                  </td>
                  <td className="small">
                    {!r.seen && <span className="muted">jamais visité</span>}
                    {r.seen && (
                      <>
                        <span className={r.seen.valid === true ? 'good' : r.seen.valid === false ? 'bad' : 'warn'}>
                          {r.seen.valid === true ? '✓' : r.seen.valid === false ? '⚠' : '?'} {stateLabel(r.seen.state)}
                        </span>{' '}
                        <span className="tiny muted">{ago(r.seen.at)}{r.seen.newer ? ', plus récent que Spansh' : ''}</span>
                        {r.seen.valid === false && <div className="tiny">{r.seen.reasons.join(' · ')}</div>}
                        {relation === 'acquisition' && r.seen.progress != null && <div className="tiny muted">{pctText(r.seen.progress)} à ton passage</div>}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="tiny muted">
        Données : <a href="https://spansh.co.uk" target="_blank" rel="noopener noreferrer">Spansh</a>, relevées par les joueurs
        (EDDN) et d'âge variable : un relevé d'avant le passage de semaine (jeudi) peut être dépassé. {int(meta.scanned)} systèmes
        lus{relation === 'acquisition' ? `, ${int(meta.anchors)} systèmes d'appui (dont ${int(meta.journalAnchors)} vus en jeu)` : ''},{' '}
        {meta.cached ? 'en cache' : `${int(meta.requests)} requête${meta.requests > 1 ? 's' : ''}`}, {dec1(meta.ms / 1000)} s. À ton arrivée,
        le journal confirme l'état du système.
      </p>
    </section>
  );
}

/** Où agir cette semaine : systèmes valides pour une activité ou une tâche Powerplay, à portée de soi. */
export default function WhereTab() {
  const { game } = useGameState();
  const [ctx, setCtx] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [f, setF] = useState(loadFilters);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [arrival, setArrival] = useState(null);
  const [transit, setTransit] = useState(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api(`${base}/context`).then(setCtx).catch(() => {});
  }, [game?.system]);
  const loadTasks = () => api(`${base}/tasks`).then(setTasks).catch(() => {});
  useEffect(() => {
    loadTasks();
    api(`${base}/arrival`).then(setArrival).catch(() => {});
  }, []);
  useEvent('whereto:tasks', loadTasks);
  useEvent('whereto:arrival', (a) => {
    if (isUsefulArrival(a)) {
      setArrival(a);
      setTransit(null);
    } else setTransit(a);
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify(f));
    } catch {
      // stockage indisponible : filtres non mémorisés
    }
  }, [f]);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const system = f.followPosition ? ctx?.system || '' : f.system;
  const activities = ctx?.activities || [];
  const chosenTask = f.choice.startsWith('task:') ? tasks.find((t) => `task:${t.id}` === f.choice) : null;
  const preset = activities.find((a) => a.id === f.choice);
  const relation = chosenTask?.relation || preset?.relation;

  async function search(e) {
    e?.preventDefault();
    const task = taskToSend(f.choice, { activities, tasks, extras: f });
    if (!task) return setError('Choisis une activité ou une tâche.');
    setBusy(true);
    setError(null);
    try {
      setResult(await api(`${base}/search`, { method: 'POST', body: { task, system, radius: f.radius === '' ? undefined : Number(f.radius), power: f.power || undefined, sort: f.sort } }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeTask(t) {
    if (!window.confirm(`Supprimer la tâche « ${t.name} » ?`)) return;
    await api(`${base}/tasks/${t.id}`, { method: 'DELETE' }).catch(() => {});
    if (f.choice === `task:${t.id}`) setF({ ...f, choice: 'acquisition' });
  }

  const power = f.power || ctx?.power;
  return (
    <div>
      <div className="tiles tiles-4" data-tuto="extension-agir-tuiles">
        <Tile label="Ta puissance" value={power || '—'} sub={f.power ? 'choisie ici' : ctx?.power ? 'lue dans le journal' : 'inconnue : choisis-la'} />
        <Tile label="Position" value={ctx?.system || '—'} sub={ctx?.system ? 'point de départ par défaut' : 'lance le jeu pour la lire'} />
        <Tile label="Systèmes vus en jeu" value={int(ctx?.seen)} sub="leur état confirme ou dément Spansh" />
        <Tile label="Portée de prise" value={ctx ? `${ctx.reach.fortified} / ${ctx.reach.stronghold} al` : '—'} sub="d'un Consolidé / d'une Forteresse" />
      </div>

      <Arrival a={arrival} />
      <Transit a={transit} />

      <section className="panel" data-tuto="extension-agir-choix">
        <h3>Que veux-tu faire ?</h3>
        <div className="form-actions">
          {activities.map((a) => (
            <button key={a.id} type="button" className={`btn ${f.choice === a.id ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setF({ ...f, choice: a.id })}>{a.name}</button>
          ))}
          {tasks.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`btn ${f.choice === `task:${t.id}` ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setF({ ...f, choice: `task:${t.id}` })}
              title={t.note || RELATION_LABELS[t.relation]}
            >
              {t.name}{!t.current && ' (semaine passée)'}
            </button>
          ))}
          {!creating && <button type="button" className="btn btn-ghost small" data-tuto="extension-agir-tache" onClick={() => setCreating(true)}>+ Tâche de la semaine</button>}
        </div>
        {chosenTask && (
          <p className="small muted">
            {RELATION_LABELS[chosenTask.relation]} · {chosenTask.states.map(stateLabel).join(', ')}
            {chosenTask.stationGroups.length > 0 && <> · station : {chosenTask.stationGroups.map((g) => ctx?.stationGroups.find((x) => x.id === g)?.label || g).join(', ')}</>}
            {chosenTask.largePad && ' · plateforme L'}
            {chosenTask.powerContact && ' · contact Powerplay'}
            {chosenTask.conflictZone && ' · zones de conflit'}
            {chosenTask.enemy && ` · ${chosenTask.enemy}`}
            {chosenTask.note && <> · {chosenTask.note}</>}{' '}
            {!chosenTask.current && (
              <button type="button" className="btn btn-ghost small" onClick={() => api(`${base}/tasks/${chosenTask.id}/renew`, { method: 'POST' }).catch(() => {})}>
                Reprendre cette semaine
              </button>
            )}
            <button type="button" className="btn btn-ghost small" onClick={() => removeTask(chosenTask)}>Supprimer</button>
          </p>
        )}
      </section>

      {creating && ctx && (
        <TaskForm
          ctx={ctx}
          onCancel={() => setCreating(false)}
          onSaved={(t) => {
            setCreating(false);
            setF({ ...f, choice: `task:${t.id}` });
            loadTasks();
          }}
        />
      )}

      <form className="panel form planner-form" onSubmit={search}>
        <div className="planner-fields" data-tuto="extension-agir-filtres">
          <label>
            Autour de
            <input value={system} onChange={set('system')} disabled={f.followPosition} placeholder="ex. Synuefe OU-E c28-2" />
          </label>
          <label>
            Rayon (al)
            <input type="number" min={ctx?.radius?.min || 5} max={ctx?.radius?.max || 60} value={f.radius} onChange={set('radius')} />
          </label>
          <label>
            Ta puissance
            <select value={f.power} onChange={set('power')}>
              <option value="">celle du journal ({ctx?.power || '?'})</option>
              {ctx?.powers.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          {preset && relation === 'enemy' && (
            <label>
              Puissance visée
              <select value={f.enemy} onChange={set('enemy')}>
                <option value="">toutes sauf la tienne</option>
                {ctx?.powers.filter((p) => p !== power).map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
          )}
          <label>
            Classer par
            <select value={f.sort} onChange={set('sort')}>
              <option value="distance">distance</option>
              <option value="fresh">relevé le plus récent</option>
              <option value="progress">{relation === 'acquisition' ? 'prise la plus avancée' : 'le plus menacé (sape − renfort)'}</option>
            </select>
          </label>
        </div>
        {preset && (
          <div className="form-actions">
            <span className="small muted">Exiger :</span>
            {ctx?.stationGroups.map((g) => (
              <label key={g.id} className="check">
                <input type="checkbox" checked={f.stationGroups.includes(g.id)} onChange={() => setF({ ...f, stationGroups: toggle(f.stationGroups, g.id) })} /> {g.label}
              </label>
            ))}
            <label className="check"><input type="checkbox" checked={f.largePad} onChange={set('largePad')} /> Plateforme L</label>
            <label className="check"><input type="checkbox" checked={f.powerContact} onChange={set('powerContact')} /> Contact Powerplay</label>
            <label className="check"><input type="checkbox" checked={f.conflictZone} onChange={set('conflictZone')} /> Zones de conflit</label>
          </div>
        )}
        <div className="form-actions">
          <label className="check">
            <input type="checkbox" checked={f.followPosition} onChange={set('followPosition')} /> Ma position actuelle
          </label>
          <button className="btn btn-primary" data-tuto="extension-agir-chercher" disabled={busy || !system}>{busy ? 'Recherche…' : 'Chercher'}</button>
          {error && <span className="bad">{error}</span>}
          <span className="tiny muted">Seuls le nom du système de départ, la puissance et les états partent vers Spansh, au clic.</span>
        </div>
      </form>

      {result && <Results result={result} />}
    </div>
  );
}
