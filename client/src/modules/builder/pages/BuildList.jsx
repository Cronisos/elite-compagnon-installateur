import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { builderApi, copy } from '../api.js';
import ShipNickname, { shipTitle } from '../../../core/ShipNickname.jsx';
import ShipRole from '../../../core/ShipRole.jsx';
import { useShipRoles } from '../../../core/useShips.js';
import { ago } from '../../../core/format.js';

/** Mes builds enregistrés, et mes vaisseaux (avec leur nom) pour en créer un. */
export default function BuildList() {
  const [builds, setBuilds] = useState(null);
  const [fleet, setFleet] = useState([]);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(null);
  const navigate = useNavigate();
  const { roleOf } = useShipRoles(); // rôles des vaisseaux (cœur), tenus à jour en temps réel
  const load = () => {
    builderApi.builds().then(setBuilds).catch((e) => setError(e.message));
    builderApi.fleet().then(setFleet).catch(() => {});
  };
  useEffect(load, []);

  // Vaisseau visé : un des tiens (mine : le build vise un vaisseau de ce commandant ; le même numéro chez un autre
  // compte joué sur ce PC n'est pas le même vaisseau)
  const owner = (b) => (b.mine === false ? null : fleet.find((f) => f.gameShipId === b.gameShipId));

  async function share(b) {
    const r = await builderApi.stats(b);
    if (await copy(r.share)) {
      setCopied(b.id);
      setTimeout(() => setCopied(null), 2000);
    }
  }
  async function duplicate(b) {
    const r = await builderApi.duplicate(b.id);
    navigate(`/builder/build/${r.id}`);
  }
  async function remove(b) {
    if (!window.confirm(`Supprimer le build « ${b.name} » ?`)) return;
    await builderApi.remove(b.id);
    load();
  }

  if (error) return <p className="bad">{error}</p>;
  if (!builds) return <p className="muted">Chargement…</p>;
  return (
    <div className="page">
      <section className="panel">
        <div className="form-actions">
          <h2>Mes builds</h2>
          <Link className="btn btn-primary" data-tuto="builds-nouveau" to="/builder/nouveau">Nouveau build</Link>
          {builds.length >= 2 && <Link className="btn" data-tuto="builds-comparer" to="/builder/comparer">Comparer deux builds</Link>}
        </div>
        {builds.length ? (
          <table className="table" data-tuto="builds-table">
            <thead>
              <tr><th>Build</th><th>Vaisseau</th><th>Pour</th><th>Modifié</th><th /></tr>
            </thead>
            <tbody>
              {builds.map((b) => (
                <tr key={b.id}>
                  <td><Link to={`/builder/build/${b.id}`}><strong>{b.name}</strong></Link></td>
                  <td>{b.ship}</td>
                  <td className="small">{owner(b) ? shipTitle(owner(b)) : <span className="muted">{b.mine === false ? 'un vaisseau d’un autre commandant' : '—'}</span>}</td>
                  <td className="small muted">{ago(b.updatedAt)}</td>
                  <td className="right">
                    <span className="form-actions" data-tuto="builds-ligne-actions">
                      <button className="btn small" onClick={() => share(b)}>{copied === b.id ? 'Copié ✓' : 'Partager'}</button>
                      {b.edsy && <a className="btn btn-ghost small" href={b.edsy} target="_blank" rel="noopener noreferrer">EDSY ↗</a>}
                      <button className="btn btn-ghost small" onClick={() => duplicate(b)}>Dupliquer</button>
                      <button className="btn btn-ghost small" onClick={() => remove(b)} aria-label="Supprimer">✕</button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">Aucun build. Pars d'un de tes vaisseaux ci-dessous, ou d'un vaisseau neuf.</p>
        )}
      </section>

      <section className="panel" data-tuto="builds-mes-vaisseaux">
        <h2>Mes vaisseaux</h2>
        <p className="small muted">Donne un nom à chaque vaisseau : deux vaisseaux du même modèle restent distincts (l'app les reconnaît à leur identifiant du jeu). Son rôle dit quel mode s'ouvre seul quand tu montes à bord.</p>
        <table className="table">
          <tbody>
            {fleet.map((f) => (
              <tr key={f.gameShipId}>
                <td>
                  <strong>{shipTitle(f)}</strong>
                  <div className="tiny muted">{[shipTitle(f) !== f.ship ? f.ship : null, f.nickname && f.name ? `« ${f.name} » en jeu` : null, f.ident].filter(Boolean).join(' · ')}</div>
                </td>
                <td className="small muted">config lue {ago(f.at)}</td>
                <td className="right">
                  <span className="form-actions" data-tuto="builds-vaisseau-actions">
                    <ShipNickname shipId={f.gameShipId} nickname={f.nickname} onSaved={load} />
                    <ShipRole shipId={f.gameShipId} role={roleOf(f.gameShipId)} />
                    <Link className="btn small" to={`/builder/nouveau?depuis=${f.gameShipId}`}>Build depuis ce vaisseau</Link>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
