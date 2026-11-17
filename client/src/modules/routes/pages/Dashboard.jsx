import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { routesApi, useRoutesRefresh } from '../api.js';
import Tile from '../../../core/Tile.jsx';
import { compact, cr, duration, int } from '../../../core/format.js';

/** Totaux globaux, toutes routes confondues. */
export default function Dashboard() {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const load = () => routesApi.dashboard().then(setD).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  useRoutesRefresh(load);

  if (!d) return <p className="muted">{error || 'Chargement…'}</p>;
  const active = d.routes.find((r) => r.active);

  return (
    <div className="page">
      {active && (
        <Link to={`/routes/${active.id}`} className="banner-link">
          <span className="muted">Route active</span> <strong>{active.name}</strong> <span className="arrow">→</span>
        </Link>
      )}
      <div className="tiles tiles-6" data-tuto="commerce-totaux">
        <Tile label="Crédits gagnés" value={compact(d.net)} sub={cr(d.net)} tone="good" />
        <Tile label="Mérites gagnés" value={int(d.merits)} />
        <Tile label="Boucles" value={int(d.loops)} />
        <Tile label="Temps de jeu" value={duration(d.playSec)} sub="pauses exclues" />
        <Tile label="Réparations" value={compact(d.repairs)} sub={`Salaires équipage : ${compact(d.wages)}`} />
        <Tile label="Destructions" value={int(d.destroyed)} sub={d.rebuy ? `Rachats : ${compact(d.rebuy)}` : 'Aucun rachat payé'} tone={d.destroyed ? 'bad' : undefined} />
      </div>

      <section className="panel" data-tuto="commerce-par-route">
        <h2>Par route</h2>
        {!d.routes.length && (
          <p className="muted">
            Aucune route pour l'instant. <Link to="/routes/nouvelle">Créer une route</Link>
          </p>
        )}
        {!!d.routes.length && (
          <table className="table">
            <thead>
              <tr>
                <th>Route</th>
                <th className="right">Boucles</th>
                <th className="right">Gain net</th>
                <th className="right">Mérites</th>
              </tr>
            </thead>
            <tbody>
              {d.routes.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link to={`/routes/${r.id}`}>{r.name}</Link> {r.active && <span className="pill pill-good">active</span>}
                  </td>
                  <td className="right num">{int(r.loops)}</td>
                  <td className="right num">{cr(r.net)}</td>
                  <td className="right num">{int(r.merits)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
