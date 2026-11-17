import { useEffect, useState } from 'react';
import { routesApi, useRoutesRefresh } from '../api.js';
import LoopTable from '../components/LoopTable.jsx';
import Tile from '../../../core/Tile.jsx';
import { compact, duration, int } from '../../../core/format.js';

/** Toutes les boucles enregistrées, filtrables par route et par date. */
export default function History() {
  const [routes, setRoutes] = useState([]);
  const [filters, setFilters] = useState({ routeId: '', from: '', to: '' });
  const [loops, setLoops] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    routesApi.loops(params).then(setLoops).catch((e) => setError(e.message));
  };
  useEffect(() => {
    routesApi.list().then(setRoutes).catch(() => {});
  }, []);
  useEffect(load, [filters]);
  useRoutesRefresh(load);

  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });
  const net = loops?.reduce((a, l) => a + l.netGain, 0) ?? 0;
  const merits = loops?.reduce((a, l) => a + l.merits, 0) ?? 0;
  const play = loops?.reduce((a, l) => a + (l.activeSec > 0 ? l.activeSec : l.durationSec), 0) ?? 0; // temps réellement joué

  return (
    <div className="page">
      <div className="filters panel" data-tuto="commerce-historique-filtres">
        <label>
          Route
          <select value={filters.routeId} onChange={set('routeId')}>
            <option value="">Toutes les routes</option>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </label>
        <label>
          Du
          <input type="date" value={filters.from} onChange={set('from')} />
        </label>
        <label>
          Au
          <input type="date" value={filters.to} onChange={set('to')} />
        </label>
        {(filters.routeId || filters.from || filters.to) && (
          <button className="btn btn-ghost" onClick={() => setFilters({ routeId: '', from: '', to: '' })}>
            Effacer les filtres
          </button>
        )}
      </div>
      {error && <p className="bad">{error}</p>}
      {loops && (
        <>
          <div className="tiles tiles-4" data-tuto="commerce-historique-totaux">
            <Tile label="Boucles" value={int(loops.length)} />
            <Tile label="Gain net" value={compact(net)} tone="good" />
            <Tile label="Mérites" value={int(merits)} />
            <Tile label="Temps de jeu" value={duration(play)} sub="pauses exclues" />
          </div>
          <section className="panel" data-tuto="commerce-historique-boucles">
            <LoopTable loops={loops} showRoute empty="Aucune boucle pour ces filtres." />
          </section>
        </>
      )}
    </div>
  );
}
