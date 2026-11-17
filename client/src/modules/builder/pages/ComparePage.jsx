import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { builderApi } from '../api.js';
import { shipTitle } from '../../../core/ShipNickname.jsx';
import { STAT_ROWS, compareTone } from '../components/stats.js';

/** Source d'une config : un build enregistré (b:id) ou la config actuelle d'un vaisseau (s:ShipID). */
async function loadSource(key) {
  const [kind, id] = key.split(':');
  if (kind === 'b') {
    const b = await builderApi.build(id);
    return { name: b.name, build: { shipId: b.shipId, name: b.name, slots: b.slots } };
  }
  const r = await builderApi.start({ gameShipId: Number(id) });
  return { name: 'config actuelle', build: r.build };
}

/** Libellés des modules d'un build, emplacement par emplacement. */
function slotLines(catalog, build) {
  const out = [];
  for (const g of catalog.groups) {
    catalog.slots[g.key].forEach((slot, i) => {
      const s = build.slots[g.key][i];
      const m = s?.modid ? catalog.modules[s.modid] : null;
      const mt = m && catalog.mtypes[m.mtype];
      const bp = s?.bpid && mt?.blueprints.find((b) => b.id === s.bpid);
      const x = s?.expid && mt?.expeffects.find((e) => e.id === s.expid);
      out.push({ key: `${g.key}-${i}`, slot: slot.label, text: m ? [m.label, bp && `${bp.label} G${s.grade}`, x?.label].filter(Boolean).join(' · ') : '— vide —' });
    });
  }
  return out;
}

/**
 * Comparaison de deux configurations : du même vaisseau (modules différents, emplacement par emplacement) ou de deux
 * vaisseaux différents (Python Mk II contre Corsair : statistiques, puis l'équipement de chacun côte à côte).
 */
export default function ComparePage() {
  const [builds, setBuilds] = useState([]);
  const [fleet, setFleet] = useState([]);
  const [keys, setKeys] = useState(['', '']);
  const [sides, setSides] = useState([null, null]);
  const [catalogs, setCatalogs] = useState({}); // vaisseau → catalogue de ses emplacements
  const [error, setError] = useState(null);

  useEffect(() => {
    builderApi.builds().then(setBuilds).catch((e) => setError(e.message));
    builderApi.fleet().then(setFleet).catch(() => {});
  }, []);

  const shipOf = (key) => {
    const [kind, id] = key.split(':');
    if (kind === 'b') return builds.find((b) => String(b.id) === id)?.shipId;
    return fleet.find((f) => String(f.gameShipId) === id)?.shipId;
  };
  const shipA = keys[0] ? shipOf(keys[0]) : null;
  const shipB = keys[1] ? shipOf(keys[1]) : null;

  useEffect(() => {
    setError(null);
    Promise.all(keys.map(async (k) => {
      if (!k) return null;
      const src = await loadSource(k);
      return { ...src, result: await builderApi.stats(src.build) };
    })).then(setSides).catch((e) => setError(e.message));
  }, [keys.join('|')]);

  useEffect(() => {
    for (const ship of [shipA, shipB]) {
      if (ship != null && !catalogs[ship]) builderApi.catalog(ship).then((c) => setCatalogs((m) => ({ ...m, [ship]: c }))).catch(() => {});
    }
  }, [shipA, shipB]);

  // 2e config : n'importe quel vaisseau ; celles du même vaisseau que la 1re d'abord
  function options(sideIdx) {
    const ship = sideIdx === 1 ? shipA : null;
    const groupe = (label, bs, fs) => (bs.length > 0 || fs.length > 0) && (
      <optgroup key={label} label={label}>
        {bs.map((b) => <option key={`b${b.id}`} value={`b:${b.id}`}>{b.name} · {b.ship}</option>)}
        {fs.map((f) => <option key={`s${f.gameShipId}`} value={`s:${f.gameShipId}`}>{shipTitle(f)} · {f.ship} (config actuelle)</option>)}
      </optgroup>
    );
    if (ship == null) {
      return (
        <>
          <option value="">Choisir…</option>
          {groupe('Mes builds', builds, [])}
          {groupe('Config actuelle de mes vaisseaux', [], fleet)}
        </>
      );
    }
    return (
      <>
        <option value="">Choisir…</option>
        {groupe('Même vaisseau', builds.filter((b) => b.shipId === ship), fleet.filter((f) => f.shipId === ship))}
        {groupe('Autres builds', builds.filter((b) => b.shipId !== ship), [])}
        {groupe('Config actuelle de mes autres vaisseaux', [], fleet.filter((f) => f.shipId !== ship))}
      </>
    );
  }

  const [a, b] = sides;
  const catA = a ? catalogs[a.build.shipId] : null;
  const catB = b ? catalogs[b.build.shipId] : null;
  const memeVaisseau = a && b && a.build.shipId === b.build.shipId;
  const linesA = catA && a ? slotLines(catA, a.build) : [];
  const linesB = catB && b ? slotLines(catB, b.build) : [];
  return (
    <div className="page">
      <section className="panel form-actions">
        <select data-tuto="builds-comparer-a" value={keys[0]} onChange={(e) => setKeys([e.target.value, keys[1]])}>{options(0)}</select>
        <span className="muted">comparé à</span>
        <select data-tuto="builds-comparer-b" value={keys[1]} onChange={(e) => setKeys([keys[0], e.target.value])} disabled={!keys[0]}>{options(1)}</select>
        {error && <span className="bad">{error}</span>}
      </section>

      {a && b && (
        <>
          <section className="panel" data-tuto="builds-comparer-stats">
            <table className="table">
              <thead>
                <tr>
                  <th />
                  <th className="right">{a.name}{!memeVaisseau && <div className="tiny muted">{a.result.stats.ship}</div>}</th>
                  <th className="right">{b.name}{!memeVaisseau && <div className="tiny muted">{b.result.stats.ship}</div>}</th>
                  <th className="right">Écart</th>
                </tr>
              </thead>
              <tbody>
                {STAT_ROWS.map((r) => {
                  const va = r.get(a.result.stats);
                  const vb = r.get(b.result.stats);
                  const tone = compareTone(r, va, vb);
                  const diff = !r.text && va != null && vb != null ? vb - va : null;
                  return (
                    <tr key={r.key}>
                      <td className="muted">{r.label}</td>
                      <td className="right num">{r.fmt(va)}</td>
                      <td className={`right num ${tone}`}>{r.fmt(vb)}</td>
                      <td className={`right num small ${tone}`}>{diff != null && tone ? `${diff > 0 ? '+' : ''}${r.fmt(diff)}` : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="tiny muted">Vert : la 2e config fait mieux ; rouge : moins bien.</p>
          </section>
          {memeVaisseau && catA && (
            <section className="panel" data-tuto="builds-comparer-modules">
              <h2>Modules différents</h2>
              <table className="table compact">
                <tbody>
                  {linesA.map((l, i) => l.text !== linesB[i]?.text && (
                    <tr key={l.key}>
                      <td className="small muted">{l.slot}</td>
                      <td className="small">{l.text}</td>
                      <td className="small warn">{linesB[i]?.text}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
          {/* Deux vaisseaux différents : pas d'emplacements communs, l'équipement de chacun côte à côte */}
          {!memeVaisseau && catA && catB && (
            <section className="panel" data-tuto="builds-comparer-equipement">
              <h2>Équipement</h2>
              <div className="two-cols">
                {[[a, linesA], [b, linesB]].map(([side, lines]) => (
                  <table key={side.name + side.build.shipId} className="table compact">
                    <thead><tr><th colSpan={2}>{side.name} <span className="muted small">· {side.result.stats.ship}</span></th></tr></thead>
                    <tbody>
                      {lines.filter((l) => l.text !== '— vide —').map((l) => (
                        <tr key={l.key}><td className="small muted">{l.slot}</td><td className="small">{l.text}</td></tr>
                      ))}
                    </tbody>
                  </table>
                ))}
              </div>
            </section>
          )}
        </>
      )}
      {!builds.length && !fleet.length && <p className="muted" data-tuto="builds-comparer-vide">Rien à comparer. <Link to="/builder/nouveau">Crée un build</Link>.</p>}
    </div>
  );
}
