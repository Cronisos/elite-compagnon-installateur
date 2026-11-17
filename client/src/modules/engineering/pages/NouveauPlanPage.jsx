// Ingénierie › Nouveau plan : à partir d'un de mes vaisseaux (sa config actuelle), d'un build (un de mes builds, un lien
// EDSY, un export Loadout) ou d'un vaisseau vierge. Le plan s'ouvre ensuite (modules, grades, matériaux).

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { engApi } from '../api.js';
import { api } from '../../../core/api.js';
import { shipTitle } from '../../../core/ShipNickname.jsx';

/**
 * Import d'un build : un de mes builds (module Constructeur, par son API), un lien EDSY ou un
 * export JSON au format Loadout.
 */
function ImportPanel({ fleet, onDone }) {
  const [text, setText] = useState('');
  const [shipId, setShipId] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [builds, setBuilds] = useState([]);
  const [buildId, setBuildId] = useState('');
  useEffect(() => {
    api('/modules/builder/builds').then(setBuilds).catch(() => setBuilds([])); // module absent : liste vide
  }, []);

  function pickBuild(id) {
    setBuildId(id);
    const b = builds.find((x) => String(x.id) === id);
    if (!b) return;
    setText(b.edsy || '');
    // Vaisseau auquel le build est destiné, sinon le premier du même modèle
    const own = fleet.find((s) => s.hasConfig && s.shipId === b.gameShipId) || fleet.find((s) => s.hasConfig && s.type === b.shipType);
    setShipId(own ? String(own.shipId) : '');
  }

  async function submit(e) {
    e.preventDefault();
    const target = fleet.find((s) => String(s.shipId) === shipId);
    if (target?.planId && !window.confirm(`Le ${target.model} a déjà un plan : le remplacer par ce build ?`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await engApi.importBuild(text.trim(), shipId === '' ? null : Number(shipId));
      if (r.warnings?.length) window.alert(`Build importé, avec des remarques :\n\n${r.warnings.join('\n')}`);
      onDone(r.plan.id);
    } catch (err) {
      setMsg(err.message);
      setBusy(false);
    }
  }

  return (
    <form data-tuto="ingenierie-np-import" className="panel form" onSubmit={submit}>
      <h2>Importer un build</h2>
      {builds.length > 0 && (
        <label>
          Un de mes builds (Constructeur de builds)
          <select value={buildId} onChange={(e) => pickBuild(e.target.value)}>
            <option value="">Choisir un build…</option>
            {builds.map((b) => (
              <option key={b.id} value={b.id}>{b.name} · {b.ship}</option>
            ))}
          </select>
        </label>
      )}
      <label>
        Lien EDSY (https://edsy.org/#/L=…) ou export JSON au format Loadout
        <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} placeholder="https://edsy.org/#/L=…" />
      </label>
      <div data-tuto="ingenierie-np-cible" className="form-actions">
        <label className="check">
          Appliquer à
          <select value={shipId} onChange={(e) => setShipId(e.target.value)}>
            <option value="">un vaisseau vierge</option>
            {fleet.filter((s) => s.hasConfig).map((s) => (
              <option key={s.shipId} value={s.shipId}>
                mon {s.model}{shipTitle(s) !== s.model ? ` « ${shipTitle(s)} »` : ''} (sa config actuelle sera prise en compte)
              </option>
            ))}
          </select>
        </label>
        <button className="btn btn-primary" disabled={busy || !text.trim()}>Importer</button>
        {msg && <span className="bad">{msg}</span>}
      </div>
    </form>
  );
}

export default function NouveauPlanPage() {
  const [fleet, setFleet] = useState([]);
  const [ships, setShips] = useState([]);
  const [blank, setBlank] = useState('');
  const [mien, setMien] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  useEffect(() => {
    engApi.fleet().then((l) => {
      setFleet(l);
      // Le vaisseau où tu es, choisi d'avance (le cas le plus courant)
      const ici = l.find((x) => x.current && x.key);
      if (ici) setMien((m) => m || String(ici.shipId));
    }).catch((e) => setError(e.message));
    engApi.ships().then(setShips).catch(() => {});
  }, []);

  async function open(body) {
    try {
      const p = await engApi.createPlan(body);
      navigate(`/ingenierie/plan/${p.id}`);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="page">
      {error && <p className="bad">{error}</p>}
      <section data-tuto="ingenierie-np-mien" className="panel form-actions">
        <span>À partir d’un de mes vaisseaux :</span>
        <select value={mien} onChange={(e) => setMien(e.target.value)} aria-label="Mon vaisseau">
          <option value="">Choisir un vaisseau…</option>
          {fleet.filter((s) => s.key).map((s) => (
            <option key={s.shipId} value={s.shipId}>{shipTitle(s)}{s.ident ? ` (${s.ident})` : ''}{s.planId ? ' · a déjà un plan' : ''}</option>
          ))}
        </select>
        {(() => {
          const s = fleet.find((x) => String(x.shipId) === mien);
          return s?.planId
            ? <button className="btn btn-primary" onClick={() => navigate(`/ingenierie/plan/${s.planId}`)}>Ouvrir le plan</button>
            : <button className="btn btn-primary" disabled={!s} onClick={() => open({ shipId: s.shipId })}>Créer un plan</button>;
        })()}
      </section>
      <ImportPanel fleet={fleet} onDone={(id) => navigate(`/ingenierie/plan/${id}`)} />
      <section data-tuto="ingenierie-np-vierge" className="panel form-actions">
        <span>Vaisseau vierge :</span>
        <select value={blank} onChange={(e) => setBlank(e.target.value)}>
          <option value="">Choisir un vaisseau…</option>
          {ships.map((s) => (
            <option key={s.key} value={s.key}>{s.name}</option>
          ))}
        </select>
        <button className="btn" disabled={!blank} onClick={() => open({ shipType: blank })}>Créer un plan vierge</button>
      </section>
    </div>
  );
}
