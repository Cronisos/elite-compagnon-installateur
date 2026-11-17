import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { routesApi, useRoutesRefresh } from '../api.js';
import { ago, compact, int } from '../../../core/format.js';

/** Liste des routes sauvegardées, avec « Reprendre ». */
export default function MyRoutes() {
  const [routes, setRoutes] = useState(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const load = () => routesApi.list().then(setRoutes).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  useRoutesRefresh(load);

  async function resume(r) {
    try {
      await routesApi.resume(r.id);
      navigate(`/routes/${r.id}`);
    } catch (e) {
      setError(e.message);
    }
  }

  async function remove(r) {
    if (!window.confirm(`Supprimer la route « ${r.name} » et ses ${r.loopsCount} boucles enregistrées ?`)) return;
    try {
      await routesApi.remove(r.id);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  if (!routes) return <p className="muted">{error || 'Chargement…'}</p>;
  if (!routes.length) {
    return (
      <p className="muted" data-tuto="commerce-liste-vide">
        Aucune route sauvegardée. <Link to="/routes/nouvelle">Créer une route</Link>
      </p>
    );
  }

  return (
    <div className="page">
      {error && <p className="bad">{error}</p>}
      <div className="route-cards">
        {routes.map((r) => (
          <article data-tuto="commerce-liste-carte" key={r.id} className={`panel route-card ${r.active ? 'is-active' : ''}`}>
            <header>
              <h3>
                <Link to={`/routes/${r.id}`}>{r.name}</Link>
              </h3>
              {r.active && <span className="pill pill-good">active</span>}
            </header>
            <p className="muted">
              {r.systems.join(' ⇄ ')} · {r.commodities.slice(0, 3).map((c) => c.name).join(', ')}
            </p>
            <dl className="kv">
              <dt>Boucles</dt>
              <dd className="num">{int(r.loopsCount)}</dd>
              <dt>Gain net</dt>
              <dd className="num">{compact(r.totalNet)} cr</dd>
              <dt>Objectif</dt>
              <dd className="num">{compact(r.goal)} cr</dd>
              <dt>Dernière boucle</dt>
              <dd>{r.lastLoopAt ? ago(r.lastLoopAt) : '—'}</dd>
            </dl>
            <div className="form-actions">
              <button className="btn btn-primary" data-tuto="commerce-liste-reprendre" onClick={() => resume(r)}>Reprendre</button>
              <Link className="btn" data-tuto="commerce-liste-ouvrir" to={`/routes/${r.id}`}>Ouvrir</Link>
              <button className="btn btn-ghost bad" data-tuto="commerce-liste-supprimer" onClick={() => remove(r)}>Supprimer</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
