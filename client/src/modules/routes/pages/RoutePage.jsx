import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { routesApi, useRoutesRefresh } from '../api.js';
import LiveBox from '../components/LiveBox.jsx';
import Tile from '../../../core/Tile.jsx';
import LoopStructure from '../components/LoopStructure.jsx';
import LoopTable from '../components/LoopTable.jsx';
import RouteSettings from '../components/RouteSettings.jsx';
import ShareRoute from '../components/ShareRoute.jsx';
import { BoutonPartager } from '../../../core/PartageEscadron.jsx';
import { NotificationToggle } from '../components/BuyAlerts.jsx';
import { compact, cr, date, dec1, duration, int, pct, time } from '../../../core/format.js';

/** Page d'une route : progression, temps réel, indicateurs, boucle, journal. */
export default function RoutePage() {
  const { id } = useParams();
  const [view, setView] = useState(null);
  const [error, setError] = useState('');

  const load = () =>
    routesApi
      .get(id)
      .then((v) => {
        setView(v);
        setError('');
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    setView(null);
    load();
  }, [id]);
  useRoutesRefresh(load, { routeId: id, withState: true });

  async function resume() {
    await routesApi.resume(id);
    load();
  }

  async function redetect() {
    if (!window.confirm('Refaire la détection de la boucle à partir des journaux ? (l’objectif est conservé)')) return;
    try {
      await routesApi.redetect(id);
      load();
    } catch (e) {
      // Autre boucle proposée (autre station ou marchandise) : le serveur n'a rien changé ; on demande avant de remplacer
      if (!String(e.message).startsWith('La détection propose une autre boucle')) return setError(e.message);
      if (!window.confirm(`${e.message}\n\nRemplacer la route par cette boucle ?`)) return;
      try {
        await routesApi.redetect(id, true);
        load();
      } catch (e2) {
        setError(e2.message);
      }
    }
  }

  if (!view && !error) return <p className="muted">Chargement…</p>;
  if (!view) {
    // Page en échec (route abîmée en base…) : les gestes qui la réparent restent à portée
    return (
      <div className="page route-page">
        <p className="bad">{error}</p>
        <div className="form-actions">
          <button className="btn" onClick={redetect}>Re-détecter la boucle</button>
          <Link className="btn btn-ghost" to="/routes/liste">Retour à Mes routes</Link>
        </div>
      </div>
    );
  }
  const { route, stats, live, structure, alerts } = view;
  const p = stats.projection;
  const reached = stats.remaining != null && stats.remaining <= 0;

  return (
    <div className="page route-page">
      <header className="route-header">
        <div>
          <h1>{route.name}</h1>
          <p className="muted">
            Créée le {date(route.createdAt)} · {int(stats.loopsCount)} boucles enregistrées
          </p>
        </div>
        <div className="form-actions" data-tuto="commerce-route-actions">
          {!route.active && (
            <button className="btn btn-primary" data-tuto="commerce-route-reprendre" onClick={resume}>Reprendre cette route</button>
          )}
          <NotificationToggle />
          <button className="btn" data-tuto="commerce-route-verifier" onClick={() => routesApi.recheckLastBuy().catch((e) => setError(e.message))} title="Revérifie le dernier achat et affiche l'alerte">
            Vérifier le dernier achat
          </button>
          <button className="btn" data-tuto="commerce-route-redetecter" onClick={redetect} title="Refait la détection des stations et marchandises de la boucle">
            Re-détecter la boucle
          </button>
          <ShareRoute view={view} />
          <BoutonPartager kind="route-commerce" refId={route.id} titre={route.name} apercu="ses stations, ses marchandises et ce qu’elle rapporte en moyenne" className="btn" />
        </div>
        {error && <p className="bad">{error}</p>}
      </header>

      {/* Bandeau de progression */}
      <section className="panel progress-banner">
        <div className="progress-figures">
          <div>
            <div className="tile-label">Solde actuel</div>
            <div className="huge num">{compact(stats.balance)}</div>
          </div>
          <div>
            <div className="tile-label">Objectif</div>
            <div className="huge num muted-strong">{compact(stats.goal)}</div>
          </div>
          <div>
            <div className="tile-label">Progression</div>
            <div className="huge num accent">{pct(stats.progress)}</div>
          </div>
          <div>
            <div className="tile-label">Reste à gagner</div>
            <div className={`huge num ${reached ? 'good' : ''}`}>{reached ? 'Atteint' : compact(stats.remaining)}</div>
          </div>
        </div>
        <div className="progress">
          <div className="progress-bar" style={{ width: `${Math.round((stats.progress || 0) * 100)}%` }} />
        </div>
      </section>

      <LiveBox live={live} legAverages={stats.legAverages} />

      {/* Alertes */}
      {alerts.alerts.length > 0 && (
        <section className="alerts">
          {alerts.alerts.map((a, i) => (
            <div key={i} className={`alert alert-${a.level}`}>{a.text}</div>
          ))}
        </section>
      )}

      {/* Indicateurs */}
      {p ? (
        <div className="tiles tiles-6" data-tuto="commerce-route-indicateurs">
          <Tile label="Allers-retours restants" value={int(p.loops)} sub={`soit ${int(p.jumps)} sauts`} tone={p.reachable ? undefined : 'warn'} />
          <Tile label="Temps de jeu restant" value={duration((p.hours || 0) * 3600)} sub={`${dec1(stats.avgMinutes)} min par boucle`} />
          <Tile
            label="Gain par boucle"
            value={compact(p.firstGain)}
            sub={[
              stats.check ? `mesuré : ${compact(stats.check.measured)} (10 dernières)` : null,
              p.lastGain != null && p.loops > 1 ? `→ ${compact(p.lastGain)} à la dernière (érosion)` : null,
            ].filter(Boolean).join(' · ') || 'net, coûts déduits'}
            tone={stats.check && !stats.check.ok ? 'bad' : undefined}
          />
          <Tile label="Gain par heure" value={compact(p.perHour)} tone={p.perHour != null && p.perHour < 150e6 ? 'warn' : 'good'} />
          <Tile label="Mérites en bonus" value={int(p.merits)} sub={`≈ ${int(stats.meritsPerLoop)} par boucle`} />
        </div>
      ) : (
        <p className="muted panel">
          {reached ? 'Objectif atteint, bravo commandant.' : 'Indicateurs disponibles dès que le solde et les prix sont connus (lance le jeu).'}
        </p>
      )}

      <div className="two-cols">
        <section className="panel" data-tuto="commerce-route-boucle">
          <h2>La boucle</h2>
          <LoopStructure structure={structure} laden={view.laden} />
        </section>
        <RouteSettings view={view} onSaved={load} />
      </div>

      <div className="two-cols">
        <section className="panel">
          <h2>Sensibilité au prix de vente aller</h2>
          {stats.sensitivity.length ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Prix de vente</th>
                  <th className="right">Gain par boucle</th>
                  <th className="right">Gain par heure</th>
                  <th className="right">Boucles nécessaires</th>
                </tr>
              </thead>
              <tbody>
                {stats.sensitivity.map((r) => (
                  <tr key={r.price} className={r.current ? 'row-current' : ''}>
                    <td className="num">
                      {int(r.price)} cr/t {r.current && <span className="pill pill-muted">actuel</span>}
                    </td>
                    <td className="right num">{compact(r.gainPerLoop)}</td>
                    <td className={`right num ${r.low ? 'warn' : ''}`}>{compact(r.gainPerHour)}</td>
                    <td className="right num">{r.loops != null ? int(r.loops) : 'non rentable'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">Pas encore de données de prix.</p>
          )}
        </section>

        <section className="panel">
          <h2>Notes de vigilance</h2>
          {alerts.notes.length ? (
            <ul className="notes">
              {alerts.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">Rien à signaler.</p>
          )}
        </section>
      </div>

      <Topups market={view.market} />

      <section className="panel">
        <h2>Journal des boucles</h2>
        <LoopTable loops={view.loops} />
        <div className="loop-footer">
          <span>
            Réparations depuis le début : <strong className="num">{cr(stats.totals.repairs)}</strong>
          </span>
          <span>
            Salaires d'équipage : <strong className="num">{cr(stats.totals.wages)}</strong>
          </span>
          <span>
            Pertes liées aux destructions : <strong className={`num ${stats.totals.destroyed ? 'bad' : ''}`}>{cr(stats.totals.destructionLoss)}</strong>
            {stats.totals.destroyed > 0 && <span className="muted"> ({stats.totals.destroyed} destruction{stats.totals.destroyed > 1 ? 's' : ''}, rachats {cr(stats.totals.rebuy)})</span>}
          </span>
        </div>
      </section>
    </div>
  );
}

/** Marchandises d'appoint : à acheter en plus, d'après les derniers relevés de marché. */
function Topups({ market }) {
  const legs = market.filter((m) => m.topups.length);
  return (
    <section className="panel">
      <h2>Marchandises d'appoint</h2>
      {!legs.length && (
        <p className="muted">
          Ouvre le marché en jeu dans chaque station de la route : l'app archive Market.json et proposera ici les
          marchandises à plus forte marge.
        </p>
      )}
      <div className="two-cols">
        {legs.map((m) => (
          <div key={m.leg}>
            <h3>
              {m.from.station} → {m.to.station}
            </h3>
            <table className="table compact">
              <thead>
                <tr>
                  <th>Marchandise</th>
                  <th className="right">Marge</th>
                  <th className="right">Achat</th>
                  <th className="right">Vente</th>
                  <th className="right">Stock</th>
                  <th className="right">Demande</th>
                </tr>
              </thead>
              <tbody>
                {m.topups.map((t) => (
                  <tr key={t.commodity}>
                    <td>{t.name}</td>
                    <td className="right num good">+{int(t.margin)}</td>
                    <td className="right num">{int(t.buyPrice)}</td>
                    <td className="right num">{int(t.sellPrice)}</td>
                    <td className="right num">{int(t.stock)}</td>
                    <td className="right num">{int(t.demand)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {m.snapshotAt && (
              <p className="muted small">
                Relevés : {time(m.snapshotAt.buy)} ({m.from.station}) et {time(m.snapshotAt.sell)} ({m.to.station})
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
