import { useEffect, useState } from 'react';
import { useEvent } from '../../core/stream.js';
import ExternalLinks from '../../core/ExternalLinks.jsx';
import { dec2, duration, int } from '../../core/format.js';
import { sysApi } from './api.js';
import { tenter } from '../../core/actions.js';
import NomSysteme from '../../core/NomSysteme.jsx';

const powersText = (p) => Object.entries(p).map(([k, v]) => `${k} (${v})`).join(', ') || 'aucune';

/** Tableau des planètes d'un système ou d'une zone. */
function Planets({ planets }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Planète</th><th>Gravité</th><th>Depuis l'arrivée</th><th>EEP connus</th><th>Puissance</th></tr></thead>
        <tbody>
          {planets.map((p) => (
            <tr key={p.name}>
              <td>{p.name}</td>
              <td className="num">{dec2(p.gravity)} G</td>
              <td className="num">{int(p.arrival)} ls</td>
              <td className="num">{p.sites ? int(p.sites) : '—'}</td>
              <td>{p.power || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Formulaire : nom, étiquette et raison pour laquelle le système compte. */
function Describe({ s, onSave, onCancel }) {
  const [f, setF] = useState({ name: s.name, tag: s.tag, description: s.description });
  const [erreur, setErreur] = useState(null);
  const [busy, setBusy] = useState(false);
  // Échec de l'enregistrement (ajout ou modification) : affiché sous le formulaire, la saisie reste
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    await tenter(() => onSave(f), setErreur);
    setBusy(false);
  }
  return (
    <form className="form" onSubmit={save}>
      <label>
        Nom
        <input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </label>
      <label>
        Étiquette
        <input value={f.tag} onChange={(e) => setF({ ...f, tag: e.target.value })} placeholder="ex. Minage iridium" />
      </label>
      <label>
        Important quand…
        <textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="dans quel cas ce système sert" />
      </label>
      <div className="form-actions">
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Fermer</button>
        {erreur && <span className="small bad">{erreur}</span>}
      </div>
    </form>
  );
}

/** Vue d'ensemble : où aller, à quelle distance, et combien de planètes y attendent. */
function Overview({ list }) {
  const [sort, setSort] = useState('near');
  const rows = [...list].sort((a, b) => (sort === 'near'
    ? (a.fromHere ?? Infinity) - (b.fromHere ?? Infinity)
    : b[sort] - a[sort]));
  return (
    <section className="panel">
      <div className="form-actions">
        <h2>Vue d'ensemble</h2>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="near">les plus proches de moi</option>
          <option value="planetCount">le plus de planètes possibles</option>
          <option value="sites">le plus d'EEP</option>
        </select>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Zone</th><th>Depuis ici</th><th>Trajet estimé</th><th>Planètes possibles</th><th>Avec EEP</th><th>EEP connus</th><th>Puissance</th></tr></thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td><a href={`#systeme-${s.id}`}>{s.name}</a></td>
                <td className="num">{s.fromHere == null ? '—' : `${int(s.fromHere)} AL`}</td>
                <td className="num">{s.jumps == null ? '—' : `≈ ${s.jumps} saut${s.jumps > 1 ? 's' : ''}, ${duration(s.minutes * 60)}`}</td>
                <td className="num"><strong>{s.planetCount}</strong></td>
                <td className="num">{s.planetsWithSites}</td>
                <td className="num">{int(s.sites)}</td>
                <td className="small">{powersText(s.powers)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tiny muted">« Planètes possibles » : mondes riches en métaux posables, à moins de 2 G. L'iridium n'y est pas garanti. Le trajet suppose ton saut maximal à vide et 65 s par saut.</p>
    </section>
  );
}

/** Une carte de favori : pourquoi il compte, et le détail des planètes à la demande. */
function SystemCard({ s, onChanged, onRemove }) {
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(s.system);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // presse-papiers indisponible
    }
  }
  async function save(f) {
    onChanged(await sysApi.update(s.id, f));
    setEditing(false);
  }

  if (editing) return <section className="panel"><Describe s={s} onSave={save} onCancel={() => setEditing(false)} /></section>;
  return (
    <section className="panel important-system" id={`systeme-${s.id}`}>
      <div className="form-actions">
        <h2>{s.name}</h2>
        {s.tag && <span className="pill pill-warn">{s.tag}</span>}
        {s.fromHere != null && <span className="pill pill-info">{int(s.fromHere)} AL d'ici</span>}
        {s.sol != null && <span className="small muted">{int(s.sol)} AL de Sol</span>}
      </div>
      <p className="small"><strong>{s.planetCount}</strong> planètes possibles · {s.planetsWithSites} avec EEP · {int(s.sites)} EEP connus</p>
      {s.description && <p className="important-why">{s.description}</p>}
      <div className="form-actions">
        <button className="btn small" onClick={copy}>{copied ? 'Copié ✓' : `Copier « ${s.system} »`}</button>
        {s.planets.length > 0 && <button className="btn btn-ghost small" onClick={() => setOpen(!open)}>{open ? 'Masquer' : 'Voir'} les {s.planets.length} planètes</button>}
        <button className="btn btn-ghost small" onClick={() => setEditing(true)}>Modifier</button>
        <ExternalLinks kind="system" vars={{ system: s.system }} />
        <button className="btn btn-ghost small" onClick={() => onRemove(s)} aria-label="Supprimer">✕</button>
      </div>
      {open && <Planets planets={s.planets} />}
    </section>
  );
}

/** Recherche des zones qui regroupent le plus de planètes. */
function Search({ onAdded }) {
  const [subtypes, setSubtypes] = useState({});
  const [f, setF] = useState({ subtypes: ['Metal-rich body'], maxGravity: 2, maxDistance: 500, diameter: 40, onlySites: false, maxArrival: '', power: '', sort: 'planets' });
  const [running, setRunning] = useState(false);
  const [loaded, setLoaded] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(null);

  useEffect(() => {
    sysApi.options().then((o) => setSubtypes(o.subtypes)).catch(() => {});
  }, []);
  useEvent('systems:progress', (d) => setLoaded(d.loaded));

  const toggle = (k) => setF({ ...f, subtypes: f.subtypes.includes(k) ? f.subtypes.filter((x) => x !== k) : [...f.subtypes, k] });

  async function run(e) {
    e.preventDefault();
    setRunning(true);
    setLoaded(0);
    setError(null);
    try {
      setResult(await sysApi.search(f));
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }
  async function add(c, form) {
    await sysApi.add({ ...form, system: c.system, sol: c.sol, planets: c.planets });
    setAdding(null);
    onAdded();
  }

  return (
    <>
      <form className="panel form" onSubmit={run}>
        <div className="form-actions" data-tuto="powerplay-systemes-types">
          {Object.entries(subtypes).map(([k, v]) => (
            <button type="button" key={k} className={`btn small ${f.subtypes.includes(k) ? 'btn-primary' : 'btn-ghost'}`} onClick={() => toggle(k)}>{v}</button>
          ))}
        </div>
        <div className="important-fields" data-tuto="powerplay-systemes-filtres">
          <label>Gravité max (G)<input type="number" step="0.1" min="0.05" value={f.maxGravity} onChange={(e) => setF({ ...f, maxGravity: e.target.value })} /></label>
          <label>Distance max de Sol (AL)<input type="number" min="20" max="800" value={f.maxDistance} onChange={(e) => setF({ ...f, maxDistance: e.target.value })} /></label>
          <label>Taille de la bulle (AL)<input type="number" min="10" max="100" value={f.diameter} onChange={(e) => setF({ ...f, diameter: e.target.value })} /></label>
          <label>Max depuis l'arrivée (ls)<input type="number" min="0" value={f.maxArrival} onChange={(e) => setF({ ...f, maxArrival: e.target.value })} placeholder="sans limite" /></label>
          <label>
            Trier par
            <select value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })}>
              <option value="planets">nombre de planètes</option>
              <option value="sites">nombre d'EEP</option>
            </select>
          </label>
          <label>
            Puissance
            <select value={f.power} onChange={(e) => setF({ ...f, power: e.target.value })}>
              <option value="">toutes</option>
              {(result?.powers || []).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        </div>
        <div className="form-actions">
          <label className="small"><input type="checkbox" checked={f.onlySites} onChange={(e) => setF({ ...f, onlySites: e.target.checked })} /> Seulement les planètes avec EEP connus</label>
          <button className="btn btn-primary" data-tuto="powerplay-systemes-chercher" disabled={running || !f.subtypes.length}>{running ? `Recherche… ${int(loaded)} planètes` : 'Chercher'}</button>
        </div>
        <p className="tiny muted">Données Spansh, relevées par les joueurs. La première recherche prend une à deux minutes ; changer les filtres ensuite est immédiat. Un EEP absent veut souvent dire « pas encore scanné ». Spansh ne sait pas si une veine est vide.</p>
      </form>
      {error && <p className="bad">{error}</p>}

      {result && (
        <section className="panel">
          <p className="small muted">{int(result.kept)} planètes retenues sur {int(result.total)}.</p>
          {result.truncated && (
            <p className="small warn">Recherche tronquée : Spansh plafonne une recherche à 10 000 planètes, et une tranche de distance de 0,5 AL en avait plus. Seules ses 10 000 premières sont comptées : resserre la gravité ou les types de planètes.</p>
          )}
          {result.clusters.length ? result.clusters.map((c) => (
            <details key={c.system} className="important-cluster">
              <summary>
                <strong><NomSysteme nom={c.system} /></strong> · {int(c.sol)} AL de Sol · {c.planetCount} planètes dans {c.systemCount} système{c.systemCount > 1 ? 's' : ''} · {int(c.sites)} EEP
                <span className="small muted"> · {powersText(c.powers)}</span>
              </summary>
              <Planets planets={c.planets} />
              {adding === c.system ? (
                <Describe s={{ name: c.system, tag: '', description: '' }} onSave={(form) => add(c, form)} onCancel={() => setAdding(null)} />
              ) : (
                <button className="btn small" onClick={() => setAdding(c.system)}>⭐ Ajouter aux systèmes importants</button>
              )}
            </details>
          )) : <p className="muted">Aucune zone ne correspond.</p>}
        </section>
      )}
    </>
  );
}

/** Systèmes importants : favoris d'un coup d'œil, et recherche de nouvelles zones. */
export default function SystemsPage() {
  const [tab, setTab] = useState('list');
  const [list, setList] = useState([]);
  const [error, setError] = useState(null);

  const load = () => sysApi.list().then(setList).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  useEvent('systems:update', load);

  async function remove(s) {
    if (!window.confirm(`Retirer « ${s.name} » des systèmes importants ?`)) return;
    if (await tenter(() => sysApi.remove(s.id).then(() => true), setError)) load();
  }

  return (
    <div className="page">
      <h1>Systèmes importants</h1>
      <div className="form-actions" data-tuto="powerplay-systemes-onglets">
        <button className={`btn small ${tab === 'list' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('list')}>Mes systèmes ({list.length})</button>
        <button data-tuto="powerplay-systemes-recherche" className={`btn small ${tab === 'search' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('search')}>Recherche multiplanète</button>
      </div>
      {error && <p className="bad">{error}</p>}
      <div hidden={tab !== 'list'} data-tuto="powerplay-systemes-liste">
        {list.length > 0 && <Overview list={list} />}
        {list.length ? list.map((s) => (
          <SystemCard key={s.id} s={s} onRemove={remove} onChanged={(x) => setList((l) => l.map((y) => (y.id === x.id ? x : y)))} />
        )) : <p className="muted">Aucun système. Lance une recherche et ajoute les zones qui t'intéressent.</p>}
      </div>
      <div hidden={tab !== 'search'}><Search onAdded={load} /></div>
    </div>
  );
}
