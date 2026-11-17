import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../core/api.js';
import { useEvent } from '../../core/stream.js';
import { ago, dateTime, int } from '../../core/format.js';
import { PRESETS, deltaText, journalCheck, sensorSummary, sinceText, statusClass, tokenCmdrText, valueText, weekNote } from './view.js';
import NomSysteme from '../../core/NomSysteme.jsx';

const base = '/modules/escadron';
const escadronApi = {
  status: () => api(`${base}/status`),
  config: (body) => api(`${base}/config`, { method: 'PUT', body }),
  cmdr: (cmdr) => api(`${base}/cmdr`, { method: 'PUT', body: { cmdr } }),
  retry: () => api(`${base}/retry`, { method: 'POST' }),
  contribution: (query) => api(`${base}/contribution?${new URLSearchParams(Object.entries(query).filter(([, v]) => v))}`),
};

/**
 * Page Escadron : le suivi de l'envoi des mérites (opt-in, à la place du plugin EDMC) et « Mon apport à l'escadron »,
 * d'après les Statistics que le jeu écrit à chaque connexion. On ne rejoint pas d'escadron ici : le code, le serveur
 * et le jeton se règlent à un seul endroit, la page « Rejoindre l'escadron » (GuideMembre.jsx).
 */
export default function EscadronPage() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    escadronApi.status().then(setStatus).catch((e) => setError(e.message));
  }, []);
  useEvent('escadron:update', setStatus);

  return (
    <div className="page">
      <header className="route-header">
        <div>
          <h1>Escadron</h1>
          <p className="muted">L'envoi de tes mérites au tableau de l'escadron, et ton apport à chaque classement.</p>
        </div>
      </header>
      {error && <p className="bad">{error}</p>}
      <div className="two-cols">
        <SensorPanel status={status} setStatus={setStatus} setError={setError} />
        <ContributionPanel />
      </div>
    </div>
  );
}

const TITRE_ENVOI = 'Envoi de mes mérites';

function SensorPanel({ status, setStatus, setError }) {
  const [choice, setChoice] = useState('');
  const [since, setSince] = useState('week');
  const [busy, setBusy] = useState(false);

  async function run(fn) {
    setError('');
    setBusy(true);
    try {
      const vue = await fn();
      if (vue) setStatus(vue);
      return Boolean(vue);
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!status) {
    return (
      <section className="panel">
        <h2>{TITRE_ENVOI}</h2>
        <p className="muted">Chargement…</p>
      </section>
    );
  }
  // Pas encore inscrit : rien à suivre ici, tout se fait sur la page « Rejoindre l'escadron »
  if (!status.hasToken) {
    return (
      <section className="panel">
        <h2>{TITRE_ENVOI}</h2>
        <p>Tu n'as pas encore rejoint d'escadron.</p>
        <p className="muted small">
          Une fois inscrit avec le code posté par ton chef, l'app envoie chacun de tes gains de mérites au tableau de
          l'escadron : ton nom de commandant, le système, les mérites gagnés et l'heure. Rien ne part avant.
        </p>
        <div className="form-actions">
          <Link className="btn btn-primary" to="/escadron/rejoindre">Rejoindre l'escadron</Link>
        </div>
      </section>
    );
  }
  const summary = sensorSummary(status);
  const { counts, tally } = status;
  const commanders = status.commanders ?? [];
  // Plusieurs commandants dans les journaux, jeton pas encore accepté : le joueur dit lequel est le sien
  const canChoose = commanders.length > 1 && !status.tokenCmdr;
  const picked = choice || status.chosenCmdr || '';
  return (
    <section className="panel">
      <h2>{TITRE_ENVOI}</h2>
      <p className={summary.tone}>{summary.text}</p>

      <dl className="kv">
        <dt>Escadron</dt>
        <dd>
          {status.destination ? <code>{status.destination}</code> : <span className="muted">serveur inconnu</span>}
          {' '}<Link className="small" to="/escadron/rejoindre">changer</Link>
        </dd>
        <dt>Inscrit comme</dt>
        <dd className={status.needsChoice ? 'warn' : undefined}>{tokenCmdrText(status) ?? '—'}</dd>
        <dt>Envoi</dt>
        <dd>{status.enabled ? `activé, gains ${sinceText(status)}` : 'désactivé'}</dd>
        <dt>En jeu</dt>
        <dd>{status.commander || '—'}{status.system ? <span className="muted small"> · <NomSysteme nom={status.system} /></span> : null}</dd>
        <dt>Dernier gain confirmé</dt>
        <dd>
          {status.lastConfirmedAt ? dateTime(status.lastConfirmedAt) : '—'}
          {status.lastOkAt && <span className="muted small"> · envoyé {ago(status.lastOkAt)}</span>}
        </dd>
        <dt>File d'attente</dt>
        <dd>
          {int(status.queue)}
          {status.oldestPending && <span className="muted small"> · le plus ancien du {dateTime(status.oldestPending)}</span>}
          {status.blocked > 0 && (status.needsChoice
            ? <span className="warn small"> · {int(status.blocked)} en attente de ton choix de commandant</span>
            : <span className="bad small"> · {int(status.blocked)} en attente du jeton de {(status.blockedCmdrs ?? []).join(', ')}</span>)}
        </dd>
        <dt>Bilan</dt>
        <dd>
          {int(counts.sent)} envoyés · {int(counts.dropped)} refusés par le serveur
          {counts.expired > 0 && ` · ${int(counts.expired)} trop vieux`}
        </dd>
        {(tally.doublon > 0 || tally.annule > 0 || tally.galaxie > 0 || tally.autreCommandant > 0) && (
          <>
            <dt>Non envoyés</dt>
            <dd className="small">
              {[
                tally.doublon > 0 && `${int(tally.doublon)} lignes que le jeu a écrites en double (non créditées)`,
                tally.annule > 0 && `${int(tally.annule)} gains annulés par la ligne suivante du journal (non crédités)`,
                tally.galaxie > 0 && `${int(tally.galaxie)} hors galaxie Live ou en bêta`,
                tally.autreCommandant > 0 && `${int(tally.autreCommandant)} d'un autre commandant`,
              ].filter(Boolean).join(' · ')}
            </dd>
          </>
        )}
        {tally.annuleApresEnvoi > 0 && (
          <>
            <dt>Comptés en trop</dt>
            <dd className="small muted">
              {int(tally.annuleApresEnvoi)} gains déjà envoyés quand le jeu les a annulés : le serveur n'accepte pas de retrait.
            </dd>
          </>
        )}
      </dl>

      {canChoose && (
        <div className={status.needsChoice ? 'warn small' : 'muted small'} style={{ marginTop: '0.9rem' }}>
          <p>
            Plusieurs commandants jouent dans ce dossier de journaux : {commanders.map((name) => `CMDR ${name}`).join(', ')}.
            Dis lequel est celui de ton inscription : seuls ses gains partiront, ceux des autres jamais.
            {status.needsChoice ? ' Rien ne part avant ton choix.' : ''}
          </p>
          <div className="form-actions">
            <select value={picked} onChange={(e) => setChoice(e.target.value)} aria-label="Commandant de ton inscription">
              <option value="">— choisis ton commandant —</option>
              {commanders.map((name) => <option key={name} value={name}>CMDR {name}</option>)}
            </select>
            <button
              className="btn"
              type="button"
              disabled={busy || !picked || picked === status.chosenCmdr}
              onClick={async () => { if (await run(() => escadronApi.cmdr(picked))) setChoice(''); }}
            >
              C'est mon commandant
            </button>
          </div>
        </div>
      )}

      <div className="form-actions" style={{ marginTop: '0.9rem' }}>
        {status.enabled ? (
          <>
            <button className="btn" disabled={busy} onClick={() => run(() => escadronApi.config({ enabled: false }))}>Désactiver l'envoi</button>
            {(status.waitingRetry || status.paused || status.blocked > 0) && (
              <button className="btn" disabled={busy} onClick={() => run(escadronApi.retry)}>Réessayer maintenant</button>
            )}
          </>
        ) : (
          <>
            <select value={since} onChange={(e) => setSince(e.target.value)} aria-label="Gains à envoyer">
              {status.sinceChoices.map((c) => <option key={c.id} value={c.id}>Gains {c.label}</option>)}
            </select>
            <button className="btn btn-primary" disabled={busy} onClick={() => run(() => escadronApi.config({ enabled: true, since }))}>Activer l'envoi</button>
          </>
        )}
      </div>

      <p className="muted small">
        Au démarrage, l'app rattrape les gains restés dans les journaux pendant qu'elle était fermée. Le plugin EDMC
        peut rester actif, le serveur ne compte qu'une fois un même gain ; pour un classement au plus juste, désactive-le
        une fois l'app en place.
      </p>
    </section>
  );
}

function ContributionPanel() {
  const [query, setQuery] = useState({ preset: 'last' });
  const [data, setData] = useState(null);
  const load = () => escadronApi.contribution(query).then(setData).catch(() => {});
  useEffect(() => {
    load();
  }, [query.preset, query.from, query.to]);
  useEvent('escadron:stats', () => load());

  const title = data?.squadron?.name ? `Mon apport à ${data.squadron.name}` : "Mon apport à l'escadron";
  if (!data) {
    return (
      <section className="panel">
        <h2>{title}</h2>
        <p className="muted">Chargement…</p>
      </section>
    );
  }
  if (!data.to) {
    return (
      <section className="panel">
        <h2>{title}</h2>
        <p className="muted">Aucun relevé encore : le jeu écrit tes statistiques d'escadron à chaque connexion.</p>
      </section>
    );
  }
  const pick = (key, value) => setQuery({ from: data.from, to: data.to, [key]: value });
  const note = weekNote(data);
  return (
    <section className="panel">
      <h2>{title}</h2>
      {data.squadron?.rank && <p className="muted small">Rang : {data.squadron.rank}</p>}
      <div className="link-buttons">
        {PRESETS.map(([id, label]) => (
          <button key={id} className={`btn small ${query.preset === id ? 'btn-primary' : ''}`} onClick={() => setQuery({ preset: id })}>{label}</button>
        ))}
      </div>
      <div className="form-actions" style={{ margin: '0.7rem 0' }}>
        <label className="small">
          Du relevé{' '}
          <select value={data.from ?? ''} onChange={(e) => pick('from', e.target.value)}>
            {!data.from && <option value="">—</option>}
            {data.snapshots.map((at) => <option key={at} value={at}>{dateTime(at)}</option>)}
          </select>
        </label>
        <label className="small">
          au relevé{' '}
          <select value={data.to} onChange={(e) => pick('to', e.target.value)}>
            {data.snapshots.map((at) => <option key={at} value={at}>{dateTime(at)}</option>)}
          </select>
        </label>
      </div>
      {note && <p className={`small ${data.week?.spill ? 'warn' : 'muted'}`}>{note}</p>}

      <div className="table-wrap">
        <table className="table compact">
          <thead>
            <tr>
              <th>Classement</th>
              <th className="right">Apport</th>
              <th className="right">Cumul</th>
              <th>Sens</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => {
              const check = journalCheck(r);
              return (
                <tr key={r.key} className={!r.to && !r.delta ? 'row-muted' : ''}>
                  <td>
                    {r.group === 'banque' ? `Banque : ${r.label}` : r.label}
                    {check && <div className={`small ${check.ok ? 'muted' : 'warn'}`}>{check.ok ? check.text : `⚠ ${check.text}`}</div>}
                  </td>
                  <td className="right num">{deltaText(r.delta, r.unit)}</td>
                  <td className="right num">{valueText(r.to, r.unit)}</td>
                  <td><span className={statusClass(r.status)} title={r.note || ''}>{r.status}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        Écart entre deux relevés « Statistics » que le jeu écrit à chaque connexion : ce que tu fais pendant une séance
        n'apparaît qu'à la connexion suivante. Le jeu ne documente pas ces classements : « mesurée » veut dire recoupée
        sur tes journaux, « à vérifier » qu'il faut comparer avec le menu d'escadron du jeu.
      </p>
    </section>
  );
}
