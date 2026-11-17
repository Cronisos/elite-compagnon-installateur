import { useEffect, useState } from 'react';
import { clock, compact, cr, dateTime, duration, int } from '../../core/format.js';
import { MERITS_PER_MILLION, simulate } from './sim.js';
import { OverlayToggle } from '../../core/overlay.jsx';
import { pauseLabel } from '../../core/hud.jsx';
import { DrillsTable } from './DrillsPanel.jsx';

const rate = (n) => (n == null ? '—' : `${int(n)} t/h`);
const crRate = (n) => (n == null ? '—' : `${compact(n)} cr/h`);

/** Jauge d'une soute : orange à 80 %, rouge une fois pleine. */
function Hold({ title, count, capacity, hint }) {
  const p = capacity ? Math.min(1, (count ?? 0) / capacity) : 0;
  return (
    <div className="mining-hold">
      <div className="small muted">{title}</div>
      <div className="glance-big num">{count ?? '—'}{capacity ? <span className="small muted"> / {capacity} t</span> : ' t'}</div>
      {capacity != null && (
        <div className="progress small-progress">
          <div className={`progress-bar ${p >= 1 ? 'bar-bad' : p >= 0.8 ? 'bar-warn' : ''}`} style={{ width: `${Math.round(p * 100)}%` }} />
        </div>
      )}
      {hint && <div className="tiny muted">{hint}</div>}
    </div>
  );
}

/** Simulation de vente : tonnage et prix par minerai, gain et mérites théoriques. */
function SaleSimulation({ s }) {
  const [edits, setEdits] = useState({}); // saisies par minerai : la mise à jour en direct ne les écrase pas
  const [extra, setExtra] = useState([]);
  const [sameSystem, setSameSystem] = useState(true);

  const edit = (key, field, value) => setEdits((e) => ({ ...e, [key]: { ...e[key], [field]: value } }));

  const rows = [
    ...s.ores.map((o) => ({
      key: o.key,
      label: o.label,
      tons: edits[o.key]?.tons ?? String(o.refined - o.sold),
      price: edits[o.key]?.price ?? String(s.prices[o.key] ?? ''),
    })),
    ...extra.map((x, i) => ({ key: `extra-${i}`, label: x, tons: edits[`extra-${i}`]?.tons ?? '', price: edits[`extra-${i}`]?.price ?? '', extra: i })),
  ];
  const r = simulate(rows, { sameSystem });

  return (
    <div className="mining-sim">
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Minerai</th><th>Tonnes</th><th>Prix / t</th><th>Crédits</th><th>Mérites</th><th /></tr></thead>
          <tbody>
            {r.lines.map((l) => (
              <tr key={l.key}>
                <td>
                  {l.extra == null ? l.label : (
                    <input value={l.label} placeholder="Minerai" onChange={(e) => setExtra((x) => x.map((v, i) => (i === l.extra ? e.target.value : v)))} />
                  )}
                </td>
                <td><input inputMode="numeric" value={l.tons} onChange={(e) => edit(l.key, 'tons', e.target.value)} /></td>
                <td><input inputMode="numeric" value={l.price} placeholder="prix" onChange={(e) => edit(l.key, 'price', e.target.value)} /></td>
                <td className="num">{cr(l.credits)}</td>
                <td className="num">≈ {int(l.merits)}</td>
                <td>{l.extra != null && l.extra === extra.length - 1 && (
                  <button className="btn btn-ghost small" onClick={() => setExtra((x) => x.slice(0, -1))} aria-label="Retirer">✕</button>
                )}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><th>Total</th><th className="num">{int(r.tons)} t</th><th /><th className="num good">{cr(r.credits)}</th><th className="num">≈ {int(r.merits)}</th><th /></tr>
          </tfoot>
        </table>
      </div>
      <div className="form-actions">
        <button className="btn btn-ghost small" onClick={() => setExtra((x) => [...x, ''])}>+ Ajouter un minerai</button>
        <label className="small"><input type="checkbox" checked={sameSystem} onChange={(e) => setSameSystem(e.target.checked)} /> Vendu dans le système de minage</label>
      </div>
      <p className="tiny muted">Mérites : estimation à {MERITS_PER_MILLION} par million de crédits, mesurée sur tes ventes à Mombaluma. Ailleurs, tes ventes de minerai ont rapporté 0 mérite.</p>
    </div>
  );
}

/** Session de minage en direct : soutes, taux, ressources récupérées. */
export function MiningPanel({ s, onEnd, onReset }) {
  const [tab, setTab] = useState('live');
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const elapsed = s.priorSec + (s.runningSince ? Math.max(0, Math.round((now - s.runningSince) / 1000)) : 0);
  const { cargo } = s;
  const left = cargo.shipCapacity != null && cargo.ship != null ? cargo.shipCapacity - cargo.ship : null;
  const fullIn = left > 0 && s.recentPerHour > 0 ? Math.round((left / s.recentPerHour) * 3600) : null;

  return (
    <section className="panel mining-session">
      <div className="form-actions" data-tuto="reperes-session-tete">
        <h2>⛏ {s.label}</h2>
        {s.siteNumber != null && <span className="pill pill-eep">EEP {s.siteNumber}</span>}
        <span className="num">{clock(elapsed)}</span>
        {s.pause && <span className="muted small">{pauseLabel(s.pause)} : le chrono reprend à ta prochaine action</span>}
        <button className="btn btn-ghost small" data-tuto="reperes-session-reset" onClick={onReset}>Reset</button>
        <button className="btn btn-primary small" data-tuto="reperes-session-stop" onClick={onEnd}>Stop : session finie</button>
      </div>
      <div className="form-actions" data-tuto="reperes-session-onglets">
        <button className={`btn small ${tab === 'live' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('live')}>Session</button>
        <button className={`btn small ${tab === 'sim' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('sim')}>Simulation de vente</button>
        <OverlayToggle page="waypoints" className="small" />
      </div>
      <div hidden={tab !== 'sim'}><SaleSimulation s={s} /></div>
      <div hidden={tab !== 'live'}>
      <div className="mining-grid">
        <Hold title={cargo.srvName || 'SRV'} count={cargo.srv} capacity={cargo.srvMax || null} hint="plus gros chargement vu" />
        <Hold title="Vaisseau" count={cargo.ship} capacity={cargo.shipCapacity} hint={left === 0 ? 'soute pleine' : fullIn != null ? `plein dans ${duration(fullIn)} à ce rythme` : 'calculé avec les transferts'} />
        <div className="mining-hold">
          <div className="small muted">Taux actuel (5 boucles)</div>
          <div className="glance-big num">{rate(s.recentPerHour)}</div>
          <div className="tiny muted">moyenne de la session : {rate(s.perHour)}</div>
        </div>
        <div className="mining-hold">
          <div className="small muted">Récupéré</div>
          <div className="glance-big num">{int(s.refined)} t</div>
          <div className="tiny muted">{int(s.transferred)} t transférées au vaisseau</div>
        </div>
        <div className="mining-hold">
          <div className="small muted">Gagné à la vente</div>
          <div className="glance-big num good">{cr(s.credits)}</div>
          <div className="tiny muted">{int(s.sold)} t vendues, {int(s.unsold)} t restantes{s.soldOutside > 0 && ` · ${int(s.soldOutside)} t hors session non comptées`}</div>
        </div>
        <div className="mining-hold">
          <div className="small muted">Gain horaire depuis le lancement</div>
          <div className="glance-big num">{crRate(s.creditsPerHour)}</div>
        </div>
        <div className="mining-hold">
          <div className="small muted">Mérites</div>
          <div className="glance-big num">{int(s.merits)}</div>
          <div className="tiny muted">{s.meritsPerHour == null ? '—' : `${int(s.meritsPerHour)} /h`}</div>
        </div>
      </div>
      <div className="mining-resources">
        <div>
          <h3>Minerais</h3>
          {s.ores.length ? (
            <table className="table">
              <thead><tr><th>Minerai</th><th>Raffiné</th><th>Transféré</th><th>Vendu</th><th>Crédits</th></tr></thead>
              <tbody>
                {s.ores.map((o) => <tr key={o.label}><td>{o.label}</td><td className="num">{int(o.refined)} t</td><td className="num">{int(o.transferred)} t</td><td className="num">{int(o.sold)} t</td><td className="num">{cr(o.credits)}</td></tr>)}
              </tbody>
            </table>
          ) : <p className="muted small">Rien de raffiné pour l'instant.</p>}
        </div>
        <div>
          <h3>Matériaux</h3>
          {s.materials.length ? (
            <div>{s.materials.map((m) => <span className="pill" key={m.label}>{m.label} × {int(m.count)}{m.grade ? ` (G${m.grade})` : ''}</span>)}</div>
          ) : <p className="muted small">Aucun pour l'instant.</p>}
        </div>
      </div>
      <DrillsTable />
      </div>
    </section>
  );
}

/** Bilan des sessions terminées. */
export function MiningHistory({ sessions, canResume, onResume }) {
  if (!sessions.length) return null;
  return (
    <section className="panel" data-tuto="reperes-historique">
      <h2>Sessions de minage</h2>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Date</th><th>Repère</th><th>Durée</th><th>Récupéré</th><th>Moyenne</th><th>Gagné</th><th>Gain / h</th><th>Mérites</th><th>Minerais</th><th /></tr></thead>
          <tbody>
            {sessions.map((x) => (
              <tr key={x.id}>
                <td>{dateTime(x.startedAt)}</td>
                <td>{x.label}{x.siteNumber != null && <> <span className="pill pill-eep">EEP {x.siteNumber}</span></>}</td>
                <td>{duration(x.summary.durationSec)}</td>
                <td className="num">{int(x.summary.refined)} t</td>
                <td className="num">{rate(x.summary.perHour)}</td>
                <td className="num">{cr(x.summary.credits)}</td>
                <td className="num">{crRate(x.summary.creditsPerHour)}</td>
                <td className="num">{int(x.summary.merits)}</td>
                <td>{(x.summary.ores || []).map((o) => `${o.label} ${int(o.refined)} t`).join(' · ')}</td>
                <td>{canResume && <button className="btn btn-ghost small" onClick={() => onResume(x)}>Reprendre</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
