// Mérites par heure active : tes rendements réels par activité et par état du système, avec la taille de
// l'échantillon, le dernier changement de règles connu et les modificateurs connus (notes de Frontier, tes mesures).

import { useEffect, useState } from 'react';
import { api } from '../../core/api.js';
import { useEvent } from '../../core/stream.js';
import { duration, int } from '../../core/format.js';
import Tile from '../../core/Tile.jsx';
import { ACTIVITIES } from './HistoryTab.jsx';
import { RATE_ACTIVITIES, STATUS_PILLS, periodLabel, ruleDate, sampleText, stateLabel } from './ratesView.js';
import NomSysteme from '../../core/NomSysteme.jsx';

const base = '/modules/expansion';
const ratesApi = {
  rates: (period) => api(`${base}/rates?${new URLSearchParams({ period })}`),
  add: (body) => api(`${base}/modifiers`, { method: 'POST', body }),
  remove: (id) => api(`${base}/modifiers/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
const STORE = 'expansion.rates.period';
const PERIODS = ['rules', 'week', 'month', 'all'];

function readStore() {
  try {
    return localStorage.getItem(STORE);
  } catch {
    return null;
  }
}
function writeStore(v) {
  try {
    localStorage.setItem(STORE, v);
  } catch {
    // stockage indisponible : le choix ne sera pas retenu
  }
}

const hours = (ms) => duration(ms / 1000);
const activityOf = (a) => (Object.hasOwn(ACTIVITIES, a) ? ACTIVITIES[a] : RATE_ACTIVITIES.get(a));
const activityLabel = (a) => activityOf(a)?.label ?? a;
const stamp = (ms) => new Date(ms).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function Status({ status }) {
  return <span className={`pill ${STATUS_PILLS.get(status) ?? 'pill-muted'}`}>{status}</span>;
}

function Swatch({ activity }) {
  const a = activityOf(activity);
  if (!a) return null;
  return <span className="mh-swatch" style={{ background: a.color }} />;
}

/** Tableau de rendements : une ligne par activité, par état ou par paire. */
function RateTable({ rows, head, label }) {
  if (!rows.length) return <p className="muted small">Aucun travail sur cette période.</p>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr><th>{head}</th><th className="num">Mérites / h actif</th><th className="num">Mérites</th><th className="num">Temps actif</th><th>Échantillon</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className={r.small ? 'row-muted' : ''}>
              <td>{label(r)}</td>
              <td className="num"><strong>{r.rate != null ? int(r.rate) : '—'}</strong></td>
              <td className="num">{int(r.merits)}</td>
              <td className="num">{hours(r.activeMs)}</td>
              <td className="small">
                {sampleText(r)}
                {r.small && <> <span className="pill pill-warn">échantillon faible</span></>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const EMPTY = { kind: 'modifier', label: '', effect: '', scope: '', system: '', date: '', status: 'à vérifier', source: '', note: '' };

/** Saisie d'un modificateur ou d'un changement de règles, avec sa source et sa date. */
function ModifierForm({ statuses }) {
  const [f, setF] = useState(EMPTY);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save(e) {
    e.preventDefault();
    setError(null);
    try {
      await ratesApi.add(f);
      setF({ ...EMPTY, kind: f.kind });
    } catch (err) {
      setError(err.message);
    }
  }
  const rules = f.kind === 'rules';
  return (
    <form className="form" data-tuto="extension-heure-ajouter" onSubmit={save}>
      <div className="form-actions">
        <label className="check"><input type="radio" checked={!rules} onChange={() => setF({ ...f, kind: 'modifier' })} />Modificateur de mérites</label>
        <label className="check"><input type="radio" checked={rules} onChange={() => setF({ ...f, kind: 'rules' })} />Changement de règles (tes rendements repartent de sa date)</label>
      </div>
      <label>
        {rules ? 'Ce qui a changé' : 'Modificateur'}
        <input value={f.label} onChange={set('label')} placeholder={rules ? 'ex. Mise à jour de décembre : refonte du crime' : 'ex. Synuefe OU-E c28-2 marqué pour le renforcement'} />
      </label>
      <div className="form-actions">
        {!rules && (
          <>
            <label>Effet<input className="input-small" value={f.effect} onChange={set('effect')} placeholder="ex. +35 %" /></label>
            <label>Concerne<input value={f.scope} onChange={set('scope')} placeholder="ex. Renforcement, système marqué" /></label>
            <label>Système (facultatif)<input value={f.system} onChange={set('system')} placeholder="mesure sa semaine Powerplay" /></label>
          </>
        )}
        <label>Date<input type="date" value={f.date} onChange={set('date')} /></label>
        <label>
          Statut
          <select value={f.status} onChange={set('status')}>
            {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>
      <label>Source<input value={f.source} onChange={set('source')} placeholder="lien, notes de mise à jour, ta mesure…" /></label>
      <label>Note<input value={f.note} onChange={set('note')} /></label>
      {error && <p className="alert alert-warning">{error}</p>}
      <div className="form-actions"><button className="btn btn-primary">Ajouter</button></div>
    </form>
  );
}

function Measured({ m }) {
  if (!m.system) return <span className="muted">—</span>;
  if (!m.measured) return <span className="muted small">rien fait dans ce système la semaine du {ruleDate(m.date)}</span>;
  return (
    <span className="small">
      {m.measured.rate != null ? `${int(m.measured.rate)} /h` : '—'} · {hours(m.measured.activeMs)} · {sampleText(m.measured)}
    </span>
  );
}

export default function RatesTab() {
  const [period, setPeriod] = useState(() => (PERIODS.includes(readStore()) ? readStore() : 'rules'));
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = () => ratesApi.rates(period).then((d) => { setData(d); setError(null); }, (err) => setError(err.message));
  useEffect(() => { load(); }, [period]);
  useEvent('expansion:rates', load);

  function choose(v) {
    setPeriod(v);
    writeStore(v);
  }
  async function remove(m) {
    if (window.confirm(`Supprimer « ${m.label} » ?`)) await ratesApi.remove(m.id).catch((err) => setError(err.message));
  }

  if (error && !data) return <p className="alert alert-warning">{error}</p>;
  if (!data) return <p className="muted">Chargement…</p>;
  return (
    <>
      {error && <p className="alert alert-warning">{error}</p>}
      <RatesReport data={data} period={period} onPeriod={choose} onRemove={remove} />
    </>
  );
}

/** Le rapport lui-même, d'après la réponse de GET /rates. */
export function RatesReport({ data, period, onPeriod, onRemove }) {
  const [detail, setDetail] = useState(false);
  const { total, rules } = data;
  const last = rules.last;
  const mine = data.modifiers;

  return (
    <>
      <div className="form-actions mh-controls" data-tuto="extension-heure-periode">
        <select value={period} onChange={(e) => onPeriod(e.target.value)}>
          {PERIODS.map((p) => <option key={p} value={p}>{periodLabel(p, last)}</option>)}
        </select>
        {data.period.from && <span className="small muted">depuis le {stamp(data.period.from)}</span>}
      </div>

      <div className="tiles tiles-4" data-tuto="extension-heure-tuiles">
        <Tile label="Mérites par heure active" value={total.rate != null ? int(total.rate) : '—'} sub={`${int(total.merits)} mérites`} tone={total.rate ? 'good' : undefined} />
        <Tile label="Temps actif" value={hours(total.activeMs)} sub={sampleText(total)} />
        <Tile label="Temps actif écarté" value={hours(total.skippedMs)} sub="joué sans rapport avec un travail : ingénieurs, chantier naval, longs détours…" />
        <Tile label="Dernier changement de règles" value={last ? ruleDate(last.date) : '—'} sub={last?.label} />
      </div>

      <section className="panel" data-tuto="extension-heure-activite">
        <h2>Par activité</h2>
        <RateTable rows={data.byActivity} head="Activité" label={(r) => <><Swatch activity={r.activity} />{activityLabel(r.activity)}</>} />
      </section>

      <section className="panel" data-tuto="extension-heure-etat">
        <h2>Par état du système</h2>
        <p className="small muted">L'état du système où le gain est crédité (celui de la vente, du kill…), à ta dernière arrivée, pour ta puissance.</p>
        <RateTable rows={data.byState} head="État" label={(r) => stateLabel(r.mode, r.state)} />
      </section>

      <section className="panel">
        <div className="form-actions">
          <h2>Par activité et par état</h2>
          <button className="btn btn-ghost small" data-tuto="extension-heure-detail" onClick={() => setDetail(!detail)}>{detail ? 'Masquer' : 'Afficher'}</button>
        </div>
        {detail && (
          <RateTable rows={data.cross} head="Activité · état" label={(r) => <><Swatch activity={r.activity} />{activityLabel(r.activity)} · {stateLabel(r.mode, r.state)}</>} />
        )}
      </section>

      <section className="panel" data-tuto="extension-heure-modificateurs">
        <h2>Modificateurs connus</h2>
        <p className="small muted">Le jeu ne les écrit pas dans le journal : l'app ne les applique pas, elle mesure ce que tu as gagné. Ils aident à lire tes rendements.</p>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Modificateur</th><th>Effet</th><th>Concerne</th><th>Date</th><th>Statut</th><th>Source</th><th /></tr></thead>
            <tbody>
              {data.known.map((m) => (
                <tr key={m.id}>
                  <td>{m.label}</td><td className="nowrap">{m.effect}</td><td>{m.scope}</td><td className="nowrap">{ruleDate(m.date)}</td>
                  <td><Status status={m.status} /></td><td className="small">{m.source}</td><td />
                </tr>
              ))}
              {mine.map((m) => (
                <tr key={m.id}>
                  <td>
                    {m.label}
                    {m.system && <div className="small"><NomSysteme nom={m.system} /> : <Measured m={m} /></div>}
                    {m.note && <div className="small muted">{m.note}</div>}
                  </td>
                  <td className="nowrap">{m.effect || '—'}</td><td>{m.scope || '—'}</td><td className="nowrap">{ruleDate(m.date)}</td>
                  <td><Status status={m.status} /></td><td className="small">{m.source || 'saisi par toi'}</td>
                  <td><button className="btn btn-ghost small" onClick={() => onRemove(m)}>Supprimer</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3>Ajouter</h3>
        <p className="small muted">Un système marqué, un bonus constaté, un patch… avec sa source et sa date. Avec un système, l'app mesure tes rendements dans ce système pendant la semaine Powerplay de cette date.</p>
        <ModifierForm statuses={data.choices.statuses} />
      </section>

      <section className="panel">
        <h2>Changements de règles</h2>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Date</th><th>Ce qui a changé</th><th>Statut</th><th>Source</th><th /></tr></thead>
            <tbody>
              {rules.list.map((r) => (
                <tr key={r.id} className={r.id === last?.id ? 'row-current' : ''}>
                  <td className="nowrap">{ruleDate(r.date)}</td><td>{r.label}</td><td><Status status={r.status} /></td>
                  <td className="small">{r.source || 'saisi par toi'}</td>
                  <td>{r.kind === 'rules' && <button className="btn btn-ghost small" onClick={() => onRemove(r)}>Supprimer</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel" data-tuto="extension-heure-travaux">
        <h2>Derniers travaux</h2>
        {data.recent.length === 0 && <p className="muted small">Aucun travail sur cette période.</p>}
        {data.recent.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Fini le</th><th>Activité</th><th>Système</th><th>État</th><th className="num">Temps actif</th><th className="num">Mérites</th></tr></thead>
              <tbody>
                {data.recent.map((u) => (
                  <tr key={`${u.t}-${u.activity}`} className={u.merits <= 0 ? 'row-muted' : ''}>
                    <td className="nowrap">{stamp(u.t)}</td>
                    <td><Swatch activity={u.activity} />{activityLabel(u.activity)}</td>
                    <td>{u.system || '—'}</td>
                    <td>{stateLabel(u.mode, u.state)}</td>
                    <td className="num">{hours(u.activeMs)}</td>
                    <td className="num">{int(u.merits)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="small muted">
        Chaque gain est compté par l'écart de TotalMerits, ce qui retire les doublons que le jeu écrit puis annule. Un
        travail finit à chaque vente, kill, livraison, mission rendue ou sauvetage, même sans mérite : il reçoit le temps
        actif écoulé depuis le travail précédent, au plus {int(data.thresholds.approachMs / 60000)} min avant le premier
        signe de son activité (premier raffinage, premier achat, première attaque…). Les travaux finis pendant le même
        amarrage se partagent ce temps d'après le premier signe de chacun, quel que soit l'ordre de tes clics ; un
        travail sans aucun signe n'en reçoit pas quand un autre en a un. Un gain sans travail de son activité juste
        avant compte dans tes mérites, sans temps : « Scan de vaisseaux » s'il arrive au plus
        {' '}{int(data.thresholds.scanMs / 1000)} s après un scan complet, « Autre » sinon. Une vente est du commerce quand la
        marchandise a été achetée, du minage quand c'est un minerai que tu n'as pas payé. Le temps actif exclut les
        pauses : à quai, jeu fermé, et plus de {int(data.coverage.idleMs / 60000)} min sans action.
        {data.coverage.since
          ? ` Tes mouvements (Status.json) sont connus depuis le ${stamp(data.coverage.since)} ; avant, seules les actions écrites dans le journal comptent, et le temps actif peut être un peu court.`
          : ' Tes mouvements (Status.json) ne sont pas encore connus : seules les actions écrites dans le journal comptent.'}
        {' '}Un échantillon de moins de {data.thresholds.minUnits} travaux ou de {int(data.thresholds.minActiveMs / 60000)} min actives est grisé.
      </p>
    </>
  );
}
