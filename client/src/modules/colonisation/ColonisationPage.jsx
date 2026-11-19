import { useEffect, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router';
import { OverlayToggle } from '../../core/overlay.jsx';
import { useEvent } from '../../core/stream.js';
import ExternalLinks from '../../core/ExternalLinks.jsx';
import Tile from '../../core/Tile.jsx';
import { ago, cr, date, dateTime, int, pct } from '../../core/format.js';
import { colApi } from './api.js';
import { useColonisation } from './useColonisation.jsx';
import { deadlineText, etaText, KIND_LABELS, LOOP_SOURCES, REASONS, releveText, statusOf, toBuyList, toLocalInput, tonnes, VERDICTS } from './view.js';
import NomSysteme from '../../core/NomSysteme.jsx';
import PageIntrouvable from '../../core/PageIntrouvable.jsx';
import Progress from './Progress.jsx';
import ProjetEscadron from './ProjetEscadron.jsx';
import Onglets from '../../core/Onglets.jsx';

/**
 * Page du module : liste des chantiers, le détail d'un chantier (/colonisation/<MarketID>), et le projet de colonisation
 * de l'escadron (/colonisation/escadron, et /composer pour le chef), rangé dans le menu sous « Powerplay & Escadron ».
 */
export default function ColonisationPage() {
  return (
    <Routes>
      <Route index element={<SiteList />} />
      <Route path="escadron" element={<PageProjetEscadron key="projet" />} />
      <Route path="escadron/composer" element={<PageProjetEscadron key="composer" composer />} />
      <Route path=":marketId" element={<SiteDetail />} />
      <Route path="*" element={<PageIntrouvable retour="/colonisation" nom="Colonisation" />} />
    </Routes>
  );
}

const Pill = ({ s }) => <span className={`pill pill-${s.tone}`}>{s.label}</span>;

/** Chantier actif : où tu es à quai, épinglé, ou le dernier en cours. */
function ActivePanel({ active }) {
  const { site, reason } = active;
  const plan = site.plan;
  const first = toBuyList(plan.items, 5);
  return (
    <section className="panel live" data-tuto="activites-colo-actif">
      <div className="form-actions">
        <h2><Link to={`/colonisation/${site.marketId}`}>{site.label}</Link></h2>
        <span className="pill pill-info">{REASONS[reason] || reason}</span>
        {site.system && <span className="small muted"><NomSysteme nom={site.system} /></span>}
      </div>
      <Progress value={site.progress} done={site.complete} />
      <div className="tiles tiles-4" style={{ marginTop: '0.9rem' }}>
        <Tile label="Avancement" value={pct(site.progress)} sub={site.provisional ? 'estimé avec tes livraisons, en attendant le dépôt' : site.releve ? releveText(site.releve) : site.updatedAt ? `lu ${ago(site.updatedAt)}` : 'pas encore lu'} />
        <Tile label="Reste à livrer" value={plan.known ? tonnes(plan.totals.remaining) : '?'} sub={plan.known ? `sur ${int(plan.totals.required)} t` : 'ouvre le contact du chantier en jeu'} />
        <Tile label="À acheter" value={plan.known ? tonnes(plan.totals.toBuy) : '?'} sub={plan.totals.onCarrier ? `reste − soute − porteur (${int(plan.totals.inHold || 0)} t en soute, ${int(plan.totals.onCarrier)} t sur le porteur)` : `reste − soute (${int(plan.totals.inHold || 0)} t utiles en soute)`} tone={plan.totals.toBuy === 0 && plan.known ? 'good' : undefined} />
        <Tile label="Trajets restants" value={plan.trips == null ? '?' : int(plan.trips)} sub={plan.capacity ? `avec ${int(plan.capacity)} t de soute` : 'capacité de soute inconnue'} />
      </div>
      {first.length > 0 && (
        <p className="small"><strong>À acheter d'abord :</strong> {first.map((i) => `${i.name} ${int(i.toBuy)} t`).join(' · ')}</p>
      )}
    </section>
  );
}

/**
 * Ton porteur : sa cargaison estimée d'après tes journaux (module Porteur), et le réglage pour la compter dans
 * « À acheter ». L'écart au total que le jeu donne (CarrierStats) est dit : des mouvements manquent à l'estimation.
 */
function CarrierPanel({ carrier, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  async function toggle(e) {
    setBusy(true);
    setError(null);
    try {
      onChange(await colApi.settings({ carrier: e.target.checked }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  const nom = [carrier.name, carrier.callsign].filter(Boolean).join(' · ') || 'Ton porteur';
  return (
    <section className="panel">
      <div className="form-actions">
        <strong>🛸 {nom}</strong>
        <span className="small muted">{int(carrier.total)} t estimées d’après tes transferts, achats et ventes</span>
        <label className="check">
          <input type="checkbox" checked={carrier.counted} disabled={busy} onChange={toggle} />
          Compter sa cargaison dans « À acheter »
        </label>
        {error && <span className="small bad">{error}</span>}
      </div>
      {carrier.gap ? (
        <p className="tiny warn">
          Le jeu compte {int(carrier.reported.cargo)} t à bord ({carrier.gap > 0 ? `${int(carrier.gap)} t de plus` : `${int(-carrier.gap)} t de moins`} que
          l’estimation) : des mouvements ne sont pas dans tes journaux (achats ou ventes d’autres joueurs à son marché,
          ce qui précède tes journaux). Ce qui manque n’est pas compté.
        </p>
      ) : null}
      <p className="tiny muted">
        Le porteur est compté pour le chantier actif seulement, après ta soute, comme elle. Le jeu n’écrit pas le contenu
        d’un porteur : seulement ce que tu y fais.
      </p>
    </section>
  );
}

/** Projet de colonisation de l'escadron, sur sa page, avec ses onglets ; `composer` : l'éditeur du chef ouvert. */
function PageProjetEscadron({ composer = false }) {
  return (
    <div className="module">
      <Onglets de="colonisation-escadron" />
      <div className="page">
        <header className="route-header">
          <div>
            <h1>Colonisation de l’escadron</h1>
            <p className="muted">Les chantiers choisis par le chef, dans son ordre de priorité, et ce qu’il manque à chacun.</p>
          </div>
          <div className="form-actions"><Link className="btn btn-ghost" to="/colonisation">Mes chantiers</Link></div>
        </header>
        <ProjetEscadron seul composer={composer} />
      </div>
    </div>
  );
}

function SiteList() {
  const { data, error, reload } = useColonisation();
  if (error && !data) return <div className="page"><h1>Colonisation</h1><p className="bad">{error}</p></div>;
  if (!data) return <div className="page"><h1>Colonisation</h1><p className="muted">Chargement…</p></div>;
  const { sites, claims, active } = data;
  return (
    <div className="page">
      <header className="route-header">
        <div>
          <h1>Colonisation</h1>
          <p className="muted">Chantiers suivis d'après le journal : besoins, reste, liste de courses et trajets.</p>
        </div>
        <div className="form-actions"><OverlayToggle page="colonisation" /></div>
      </header>

      {active && <ActivePanel active={active} />}

      {data.carrier && <CarrierPanel carrier={data.carrier} onChange={() => reload()} />}

      <p className="small muted">Le projet de colonisation de ton escadron est rangé avec l’escadron : <Link to="/colonisation/escadron">Colonisation de l’escadron</Link>.</p>

      <h2>Chantiers</h2>
      {sites.length ? (
        <div className="table-wrap" data-tuto="activites-colo-tableau">
          <table className="table">
            <thead>
              <tr>
                <th>Chantier</th>
                <th>Avancement</th>
                <th className="right">Reste</th>
                <th className="right">À acheter</th>
                <th className="right">Trajets</th>
                <th className="right">Mes livraisons</th>
                <th>Échéance</th>
                <th>Vu</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((s) => (
                <tr key={s.marketId} className={s.docked ? 'row-current' : s.complete || s.failed ? 'row-muted' : ''}>
                  <td>
                    <Link to={`/colonisation/${s.marketId}`}>{s.label}</Link>
                    {s.pinned && <span title="Épinglé"> 📌</span>}
                    <div className="tiny muted">{[KIND_LABELS[s.kind], s.system].filter(Boolean).join(' · ') || `MarketID ${s.marketId}`}</div>
                  </td>
                  <td style={{ minWidth: 140 }}>
                    <Progress value={s.progress} done={s.complete} />
                    <span className="tiny muted">{pct(s.progress)} </span><Pill s={statusOf(s)} />
                  </td>
                  <td className="right num">{tonnes(s.remaining)}</td>
                  <td className="right num">{tonnes(s.toBuy)}</td>
                  <td className="right num">{s.trips == null ? '—' : int(s.trips)}</td>
                  <td className="right num">{tonnes(s.mine)}</td>
                  <td className="small">{deadlineText(s.deadline) || <span className="muted">—</span>}</td>
                  <td className="small muted">{ago(s.lastSeen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <section className="panel" data-tuto="activites-colo-vide">
          <p>Aucun chantier suivi pour l'instant.</p>
          <p className="small muted">
            Amarre-toi à un vaisseau de colonisation ou à un chantier de construction (« Orbital Construction Site: … »,
            « Planetary Construction Site: … ») : l'app le reconnaît à l'amarrage, puis lit ses besoins dès que le jeu
            les écrit (contact de colonisation). Tes livraisons sont comptées une par une.
          </p>
        </section>
      )}

      {claims.length > 0 && (
        <>
          <h2 data-tuto="activites-colo-revendications">Revendications</h2>
          <div className="table-wrap">
            <table className="table compact">
              <thead><tr><th>Système</th><th>Revendiqué</th><th>Balise</th><th>Abandonné</th></tr></thead>
              <tbody>
                {claims.map((c) => (
                  <tr key={`${c.systemAddress}-${c.system}`} className={c.releasedAt ? 'row-muted' : ''}>
                    <td>{c.system || 'Système inconnu'}</td>
                    <td className="num">{c.claimedAt ? dateTime(c.claimedAt) : '—'}</td>
                    <td className="num">{c.beaconAt ? dateTime(c.beaconAt) : '—'}</td>
                    <td className="num">{c.releasedAt ? dateTime(c.releasedAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="tiny muted">Le jeu n'écrit pas le délai d'une revendication : l'app n'en invente pas.</p>
        </>
      )}

      <Diagnostics />

      <p className="tiny muted">
        Sources : journal du jeu (dépôt de construction, tes livraisons, amarrages) et Ardent Insight pour les stations
        proches. « Reste » = demandé − livré par tous les CMDR ; « À acheter » = reste − ta soute (comptée pour le seul
        chantier actif, sans la cargaison de mission). Aucune règle non vérifiée n'est codée (ni délai de 4 semaines, ni
        fenêtre de revendication) : l'échéance se saisit à la main.
      </p>
    </div>
  );
}

/** Diagnostic (pour affiner le module avec un vrai journal) : écarts, champs inattendus, événements bruts. */
function Diagnostics() {
  const [open, setOpen] = useState(false);
  const [d, setD] = useState(null);
  useEffect(() => {
    if (open) colApi.diagnostics().then(setD).catch(() => setD(null));
  }, [open]);
  return (
    <details className="panel" data-tuto="activites-colo-diagnostic" style={{ marginTop: '1.5rem' }} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary><strong>Diagnostic</strong> <span className="small muted">écarts entre le journal et ce que l'app attend</span></summary>
      {!d ? <p className="muted small">Chargement…</p> : (
        <div className="small">
          <p>
            Événements de colonisation lus : {Object.entries(d.counts).map(([k, v]) => `${k} ${int(v)}`).join(' · ') || 'aucun'}.
          </p>
          <h3>Écarts aux observations ({d.checks.length})</h3>
          {d.checks.length ? (
            <ul className="notes">
              {d.checks.map((c) => (
                <li key={`${c.rule}-${c.marketId}-${c.symbol}`}>
                  <strong>{c.label}</strong> — {c.detail} <span className="muted">({int(c.count)} fois, dernière {dateTime(c.lastAt)}, chantier {c.marketId ?? '?'})</span>
                </li>
              ))}
            </ul>
          ) : <p className="muted">Aucun : le journal suit ce que la spécification décrit.</p>}
          <h3>Champs inattendus ou absents ({d.issues.length})</h3>
          {d.issues.length ? (
            <ul className="notes">
              {d.issues.map((i) => <li key={`${i.event}-${i.kind}-${i.path}`}><code>{i.event}.{i.path}</code> : {i.kind}{i.detail ? ` (${i.detail})` : ''} — {int(i.count)} fois</li>)}
            </ul>
          ) : <p className="muted">Aucun.</p>}
          <h3>Observations vérifiées à chaque lecture</h3>
          <ul className="notes">{d.rules.map((r) => <li key={r.id}>{r.label} <span className="muted">({r.source})</span></li>)}</ul>
          {d.raw.length > 0 && (
            <>
              <h3>Derniers événements bruts ({d.raw.length})</h3>
              <pre className="tiny" style={{ maxHeight: 300, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{d.raw.map((r) => JSON.stringify(r)).join('\n')}</pre>
            </>
          )}
        </div>
      )}
    </details>
  );
}

/** Réglages saisis : nom personnalisé, échéance, durée d'une boucle, notes, épinglé. */
function Settings({ site, onSaved }) {
  const [f, setF] = useState(null);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setF({
      name: site.user.name || '',
      deadline: toLocalInput(site.user.deadline),
      loopMinutes: site.user.loopMinutes ?? '',
      notes: site.user.notes || '',
      pinned: site.user.pinned,
    });
  }, [site.marketId, site.user.name, site.user.deadline, site.user.loopMinutes, site.user.notes, site.user.pinned]);
  if (!f) return null;
  async function save(e) {
    e.preventDefault();
    setError(null);
    try {
      onSaved(await colApi.update(site.marketId, {
        name: f.name,
        deadline: f.deadline ? new Date(f.deadline).toISOString() : null,
        loopMinutes: f.loopMinutes === '' ? null : f.loopMinutes,
        notes: f.notes,
        pinned: f.pinned,
      }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message);
    }
  }
  const measured = site.plan.loop.measured;
  return (
    <form className="form" onSubmit={save}>
      <label>
        Nom personnalisé
        <input value={f.name} maxLength={60} placeholder={site.stationLabel || ''} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </label>
      <label>
        Échéance (saisie : le journal ne la donne pas)
        <input type="datetime-local" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} />
      </label>
      <label>
        Durée d'une boucle (min)
        <input className="input-small" inputMode="decimal" value={f.loopMinutes} placeholder={measured ? String(measured.minutes).replace('.', ',') : ''} onChange={(e) => setF({ ...f, loopMinutes: e.target.value })} />
        <span className="tiny muted">
          {measured ? `Mesurée sur tes livraisons : ${String(measured.minutes).replace('.', ',')} min (médiane de ${measured.loops} boucles). Laisse vide pour l'utiliser.` : 'Mesurée dès 2 boucles livrées à ce chantier ; sinon, saisis-la.'}
        </span>
      </label>
      <label>
        Notes
        <textarea rows={3} maxLength={2000} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      </label>
      <label className="check">
        <input type="checkbox" checked={f.pinned} onChange={(e) => setF({ ...f, pinned: e.target.checked })} />
        Épingler : chantier du HUD quand tu n'es à quai à aucun chantier
      </label>
      <div className="form-actions">
        <button className="btn btn-primary">Enregistrer</button>
        {saved && <span className="small good">Enregistré ✓</span>}
        {error && <span className="small bad">{error}</span>}
      </div>
    </form>
  );
}

/** Stations proches qui vendent ce qu'il reste à livrer (Ardent Insight), à la demande. */
function Sources({ site }) {
  const [opts, setOpts] = useState({ maxDistance: 50, maxDaysAgo: 14, carriers: false });
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  async function search() {
    setBusy(true);
    setError(null);
    try {
      setRes(await colApi.sources(site.marketId, opts));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel" data-tuto="activites-chantier-acheter">
      <h2>Où acheter</h2>
      <div className="filters">
        <label>
          Distance max
          <select value={opts.maxDistance} onChange={(e) => setOpts({ ...opts, maxDistance: Number(e.target.value) })}>
            {[20, 50, 100, 200].map((d) => <option key={d} value={d}>{d} al</option>)}
          </select>
        </label>
        <label>
          Relevé de moins de
          <select value={opts.maxDaysAgo} onChange={(e) => setOpts({ ...opts, maxDaysAgo: Number(e.target.value) })}>
            {[3, 7, 14, 30].map((d) => <option key={d} value={d}>{d} jours</option>)}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={opts.carriers} onChange={(e) => setOpts({ ...opts, carriers: e.target.checked })} /> porteurs compris
        </label>
        <button className="btn btn-primary" disabled={busy || !site.system} onClick={search}>{busy ? 'Recherche…' : 'Chercher'}</button>
      </div>
      {!site.system && <p className="small muted">Système du chantier inconnu : amarre-toi une fois au chantier.</p>}
      {error && <p className="small bad">{error}</p>}
      {res?.error && <p className="small bad">{res.error}</p>}
      {res && !res.error && !res.results.length && <p className="small muted">Plus rien à acheter.</p>}
      {res?.results.map((r) => (
        <div key={r.symbol} style={{ marginTop: '0.9rem' }}>
          <strong>{r.name}</strong> <span className="small muted">{tonnes(r.remaining)} à acheter</span>
          {r.error ? <p className="small bad">{r.error}</p> : r.stations.length ? (
            <div className="table-wrap">
              <table className="table compact">
                <thead><tr><th>Station</th><th>Système</th><th className="right">Distance</th><th className="right">Arrivée</th><th>Plateforme</th><th className="right">Stock</th><th className="right">Prix</th><th>Relevé</th></tr></thead>
                <tbody>
                  {r.stations.map((s) => (
                    <tr key={`${s.system}-${s.station}`}>
                      <td>{s.station}{s.carrier && <span className="pill pill-muted">porteur</span>}</td>
                      <td className="small"><NomSysteme nom={s.system} /></td>
                      <td className="right num">{s.distance === 0 ? 'ici' : `${int(s.distance)} al`}</td>
                      <td className="right num">{s.arrival == null ? '—' : `${int(s.arrival)} ls`}</td>
                      <td>{s.pad || '?'}</td>
                      <td className={`right num ${s.enough ? 'good' : ''}`}>{int(s.stock)}</td>
                      <td className="right num">{cr(s.price)}</td>
                      <td className={`small ${s.ageDays > 7 ? 'warn' : 'muted'}`}>{s.ageDays == null ? '—' : s.ageDays < 1 ? "aujourd'hui" : `il y a ${int(s.ageDays)} j`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="small muted">Aucune station connue dans ce rayon.</p>}
        </div>
      ))}
      <p className="tiny muted">
        Ardent Insight (prix envoyés par les joueurs via EDDN, mis en cache 30 min) : stock et prix d'il y a quelques
        heures ou jours, à vérifier sur place. Plateforme filtrée pour ton vaisseau ({res?.pad || site.ship.pad || '?'}) ;
        en vert, assez de stock pour tout acheter.
      </p>
    </section>
  );
}

function SiteDetail() {
  const { marketId } = useParams();
  const navigate = useNavigate();
  const [site, setSite] = useState(null);
  const [error, setError] = useState(null);
  const load = () => colApi.site(marketId).then((s) => {
    setSite(s);
    setError(null);
  }).catch((err) => setError(err.message));
  useEffect(() => {
    load();
  }, [marketId]);
  useEvent('colonisation:update', load);
  useEvent('escadron:colonisation', load); // relevé d'un membre de l'escadron

  async function forget() {
    if (!window.confirm(`Oublier « ${site.label} » ? Ses lectures et tes livraisons passées ne seront plus comptées.`)) return;
    await colApi.forget(site.marketId);
    navigate('/colonisation');
  }

  if (error && !site) return <div className="page"><p><Link to="/colonisation">← Chantiers</Link></p><p className="bad">{error}</p></div>;
  if (!site) return <div className="page"><p className="muted">Chargement…</p></div>;
  const { plan } = site;
  const verdict = plan.deadline?.verdict ? VERDICTS[plan.deadline.verdict] : null;
  return (
    <div className="page">
      <p><Link to="/colonisation">← Chantiers</Link></p>
      <header className="route-header">
        <div>
          <h1>{site.label}</h1>
          <p className="muted">
            {[KIND_LABELS[site.kind], site.system, site.body].filter(Boolean).join(' · ') || 'Système inconnu'}
            {' · '}<Pill s={statusOf(site)} />
            {site.docked && <span className="pill pill-info">À quai</span>}
          </p>
          {site.releve && (
            <p className="small">
              <span className="pill pill-info">Projet de l’escadron</span> Lecture du dépôt la plus récente : {releveText(site.releve)}
              {site.local ? ', plus récente que la tienne' : ' (tu ne t’es pas encore amarré à ce chantier)'}.
            </p>
          )}
          <p className="tiny muted">
            MarketID {site.marketId} · {site.local ? `suivi depuis le ${date(site.firstSeen)} · ` : ''}dernière lecture du dépôt {site.updatedAt ? dateTime(site.updatedAt) : 'jamais'}
            {site.completedAt && ` · terminé le ${dateTime(site.completedAt)}${site.completedBy === 'amarrage' ? " (d'après l'amarrage)" : ''}`}
            {site.successorMarketId && ` · station terminée : MarketID ${site.successorMarketId}`}
            {site.failedAt && ` · échoué le ${dateTime(site.failedAt)}`}
          </p>
        </div>
        <div className="form-actions">
          {site.system && <ExternalLinks kind="system" vars={{ system: site.system, systemAddress: site.systemAddress }} />}
          {site.local && <button className="btn btn-ghost" data-tuto="activites-chantier-oublier" onClick={forget}>Oublier</button>}
        </div>
      </header>

      <Progress value={site.progress} done={site.complete} />
      <div className="tiles tiles-4" data-tuto="activites-chantier-tuiles" style={{ marginTop: '0.9rem' }}>
        <Tile label="Avancement" value={pct(site.progress)} sub={site.completedBy === 'amarrage' ? "terminé d'après l'amarrage" : site.provisional ? 'estimé avec tes livraisons' : site.updatedAt ? 'lu au dépôt' : 'pas encore lu'} />
        <Tile label="Reste à livrer" value={plan.known ? tonnes(plan.totals.remaining) : '?'} sub={plan.known ? `${int(plan.totals.provided)} t livrées sur ${int(plan.totals.required)}` : 'ouvre le contact du chantier en jeu'} />
        <Tile label="À acheter" value={plan.known ? tonnes(plan.totals.toBuy) : '?'} sub={!plan.holdCounted ? 'soute comptée pour le chantier actif' : plan.totals.onCarrier ? `${int(plan.totals.inHold || 0)} t en soute, ${int(plan.totals.onCarrier)} t sur le porteur` : `${int(plan.totals.inHold || 0)} t utiles en soute`} />
        <Tile label="Trajets restants" value={plan.trips == null ? '?' : int(plan.trips)} sub={plan.capacity ? `avec ${int(plan.capacity)} t de soute` : 'capacité de soute inconnue'} />
      </div>

      <div className="two-cols">
        <section className="panel" data-tuto="activites-chantier-echeance">
          <h2>Échéance et fin estimée</h2>
          <dl className="kv">
            <dt>Boucle</dt>
            <dd>{plan.loop.minutes == null ? 'inconnue' : `${String(plan.loop.minutes).replace('.', ',')} min (${LOOP_SOURCES[plan.loop.source] || plan.loop.source})`}</dd>
            <dt>Temps restant</dt>
            <dd>{site.complete ? 'aucun' : etaText(plan.eta) || (plan.trips === 0 ? 'plus rien à livrer' : '—')}</dd>
            <dt>Sans t'arrêter</dt>
            <dd>{site.complete ? (site.completedAt ? `terminé le ${dateTime(site.completedAt)}` : 'terminé') : plan.eta ? `fini vers ${dateTime(plan.eta.finishAt)}` : '—'}</dd>
            <dt>Échéance</dt>
            <dd>
              {plan.deadline ? <>{dateTime(plan.deadline.at)} <span className="pill pill-muted">saisie</span></> : 'aucune'}
              {verdict && <span className={`pill pill-${verdict.tone}`}>{verdict.label}</span>}
            </dd>
          </dl>
          <p className="tiny muted">« Serré » : plus de soirées de jeu nécessaires que de jours avant l'échéance (une soirée par jour, durée réglée dans Paramètres).</p>
        </section>
        {site.local && (
          <section className="panel" data-tuto="activites-chantier-reglages">
            <h2>Réglages</h2>
            <Settings site={site} onSaved={setSite} />
          </section>
        )}
      </div>

      <h2 data-tuto="activites-chantier-marchandises">Marchandises</h2>
      {plan.known ? (
        <div className="table-wrap">
          <table className="table compact">
            <thead><tr><th>Marchandise</th><th className="right">Demandé</th><th className="right">Livré</th><th className="right">Reste</th><th className="right">En soute</th>{plan.totals.onCarrier > 0 && <th className="right">Porteur</th>}<th className="right">À acheter</th></tr></thead>
            <tbody>
              {plan.items.map((i) => (
                <tr key={i.symbol} className={i.done ? 'row-muted' : ''}>
                  <td>{i.name}{i.done && ' ✓'}</td>
                  <td className="right num">{int(i.required)}</td>
                  <td className="right num">{int(i.provided)}</td>
                  <td className="right num">{int(i.remaining)}</td>
                  <td className="right num">{i.inHold ? int(i.inHold) : '—'}</td>
                  {plan.totals.onCarrier > 0 && <td className="right num">{i.onCarrier ? int(i.onCarrier) : '—'}</td>}
                  <td className="right num"><strong>{i.toBuy ? int(i.toBuy) : '—'}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="muted">Besoins pas encore lus : en jeu, ouvre le contact de colonisation du chantier.</p>}
      {plan.known && site.completedBy === 'amarrage' && (
        <p className="tiny muted">Terminé d'après l'amarrage à la station finie : demandé et livré sont ceux de la dernière lecture du dépôt, avant la fin.</p>
      )}

      {!site.complete && plan.known && <Sources site={site} />}

      <h2 data-tuto="activites-chantier-livraisons">Mes livraisons</h2>
      {site.mine.count ? (
        <>
          <p className="small muted">{int(site.mine.total)} t en {int(site.mine.count)} livraison{site.mine.count > 1 ? 's' : ''}{site.mine.count > site.mine.recent.length ? ` (les ${site.mine.recent.length} dernières ci-dessous)` : ''}.</p>
          <div className="table-wrap">
            <table className="table compact">
              <thead><tr><th>Date</th><th>Marchandises</th><th className="right">Total</th></tr></thead>
              <tbody>
                {site.mine.recent.map((c, i) => (
                  <tr key={`${c.at}-${i}`}>
                    <td className="num">{dateTime(c.at)}</td>
                    <td className="small">{c.items.map((x) => `${int(x.amount)} × ${x.name}`).join(' · ')}</td>
                    <td className="right num">{tonnes(c.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : <p className="muted">Aucune livraison de ta part à ce chantier.</p>}

      {site.user.notes && <><h2>Notes</h2><p className="small" style={{ whiteSpace: 'pre-wrap' }}>{site.user.notes}</p></>}
    </div>
  );
}
