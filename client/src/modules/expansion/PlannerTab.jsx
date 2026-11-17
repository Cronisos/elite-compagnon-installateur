// Onglet « Calculateur de routes » du Projet extension : routes rentables autour de soi, par l'API du
// module serveur planner (données de marché Ardent Insight).

import { Fragment, useEffect, useRef, useState } from 'react';
import { api } from '../../core/api.js';
import { creerSuggestions } from '../../core/suggestions.js';
import { useGameState } from '../../core/useGameState.js';
import Tile from '../../core/Tile.jsx';
import ExternalLinks from '../../core/ExternalLinks.jsx';
import { ago, compact, dec1, duration, int } from '../../core/format.js';
import { plannerDiscordText } from './plannerText.js';
import NomSysteme from '../../core/NomSysteme.jsx';

const base = '/modules/planner';
const STORE = 'planner.filters';
const DEFAULTS = { followPosition: true, system: '', maxDistance: 30, maxDaysAgo: 3, maxArrival: 5000, pad: '', planetary: true, settlements: false, sort: 'hour' };

function loadFilters() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE) || '{}') };
  } catch {
    return DEFAULTS;
  }
}

/** Âge des prix : vert < 6 h, orange < 2 j, rouge au-delà. */
function ageTone(iso) {
  const h = (Date.now() - new Date(iso).getTime()) / 3600e3;
  return h < 6 ? 'good' : h < 48 ? 'warn' : 'bad';
}

/** Moyennes mesurées de la route active (module Routes, par son API ; absente = rien). */
function useActiveRoute() {
  const [route, setRoute] = useState(null);
  useEffect(() => {
    api('/modules/routes/routes')
      .then((rs) => rs.find((r) => r.active))
      .then((r) => r && api(`/modules/routes/routes/${r.id}`))
      .then((d) => d?.stats?.avgNet && setRoute({ name: d.route.name, net: d.stats.avgNet, minutes: d.stats.avgMinutes }))
      .catch(() => {});
  }, []);
  return route;
}

function Station({ s }) {
  return (
    <div>
      <strong>{s.station}</strong> <span className="muted">· <NomSysteme nom={s.system} /></span>
      <div className="tiny muted">
        {s.distance > 0.05 ? `${dec1(s.distance)} al d'ici` : 'ce système'} · {int(s.arrival)} ls
        {s.planetary && ' · planétaire'} · plateforme {['', 'S', 'M', 'L'][s.pad] || '?'}
      </div>
    </div>
  );
}

function Trade({ t, label }) {
  return (
    <div className="planner-trade">
      <span className="muted small">{label}</span>{' '}
      <strong>{t.name}</strong> · {int(t.units)} t · achat {int(t.buy)} → vente {int(t.sell)} cr ·{' '}
      <span className="good">+{int(t.margin)} cr/t</span>
      <div className="tiny muted">
        stock {int(t.stock)} t · demande {int(t.demand)} t · prix relevés{' '}
        <span className={ageTone(t.buyAt)}>{ago(t.buyAt)}</span> / <span className={ageTone(t.sellAt)}>{ago(t.sellAt)}</span>
      </div>
    </div>
  );
}

function Results({ list, loop, active }) {
  const [open, setOpen] = useState(null);
  const [copied, setCopied] = useState(null);
  if (!list.length) return <p className="muted">Aucune route rentable avec ces filtres. Élargis le rayon ou l'âge des prix.</p>;

  async function copy(r, i) {
    try {
      await navigator.clipboard.writeText(plannerDiscordText(r, loop));
      setCopied(i);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // presse-papiers indisponible
    }
  }

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Départ</th>
            <th>{loop ? 'Retour à' : 'Arrivée'}</th>
            <th>Marchandises</th>
            <th className="right">Gain / {loop ? 'boucle' : 'trajet'}</th>
            <th className="right">Sauts</th>
            <th className="right">≈ Durée</th>
            <th className="right">≈ Gain / h</th>
            <th className="right">Prix</th>
          </tr>
        </thead>
        <tbody>
          {list.map((r, i) => {
            const better = active && loop && r.profit > active.net * 1.05;
            return (
              <Fragment key={`${r.from.marketId}-${r.to.marketId}`}>
                <tr className="clickable" onClick={() => setOpen(open === i ? null : i)}>
                  <td><Station s={r.from} /></td>
                  <td><Station s={r.to} /></td>
                  <td className="small">
                    {r.out.name}
                    {loop && <> / {r.back.name}</>}
                  </td>
                  <td className={`right num ${better ? 'good' : ''}`}>{compact(r.profit)}</td>
                  <td className="right num">{r.jumps}</td>
                  <td className="right num">{duration(r.seconds)}</td>
                  <td className="right num"><strong>{compact(r.perHour)}</strong></td>
                  <td className={`right small ${ageTone(r.oldest)}`}>{ago(r.oldest)}</td>
                </tr>
                {open === i && (
                  <tr className="planner-detail">
                    <td colSpan={8}>
                      <Trade t={r.out} label={`À ${r.from.station} :`} />
                      {loop && <Trade t={r.back} label={`À ${r.to.station} :`} />}
                      <div className="form-actions">
                        <button className="btn small" onClick={() => copy(r, i)}>{copied === i ? 'Copié ✓' : 'Copier pour Discord'}</button>
                        <ExternalLinks kind="station" vars={{ station: r.from.station, system: r.from.system, marketId: r.from.marketId, systemAddress: r.from.systemAddress }} />
                        <ExternalLinks kind="station" vars={{ station: r.to.station, system: r.to.system, marketId: r.to.marketId, systemAddress: r.to.systemAddress }} />
                      </div>
                      {loop && (
                        <p className="tiny muted">
                          Fais une boucle en jeu, puis crée-la dans « Mes routes commerciales » : elle sera détectée et suivie automatiquement.
                        </p>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Calculateur de routes : routes rentables autour de la position, avec le vaisseau actuel. */
export default function PlannerTab() {
  const { game } = useGameState();
  const [ctx, setCtx] = useState(null);
  const [f, setF] = useState(loadFilters);
  const [cargo, setCargo] = useState('');
  const [range, setRange] = useState('');
  const [result, setResult] = useState(null);
  const [tab, setTab] = useState('loops');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [suggest, setSuggest] = useState([]);
  const active = useActiveRoute();

  // Vaisseau et position : relus quand le jeu change (saut, changement de vaisseau)
  const shipKey = `${game?.ship}|${game?.loadout?.cargoCapacity}|${game?.system}`;
  useEffect(() => {
    api(`${base}/context`).then(setCtx).catch(() => {});
  }, [shipKey]);

  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify(f));
    } catch {
      // stockage indisponible : filtres non mémorisés
    }
  }, [f]);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const system = f.followPosition ? ctx?.system || '' : f.system;

  // Suggestions de systèmes (Ardent) : une requête quand la frappe marque une pause, la précédente annulée, les
  // réponses dépassées ignorées (core/suggestions.js)
  const suggestions = useRef(null);
  suggestions.current ??= creerSuggestions({
    chercher: (q, signal) => api(`${base}/systems?q=${encodeURIComponent(q)}`, { signal }),
    recevoir: setSuggest,
  });
  useEffect(() => () => suggestions.current.annuler(), []);

  function onSystemInput(e) {
    const v = e.target.value;
    setF({ ...f, system: v });
    suggestions.current.demander(v);
  }

  async function search(e) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = {
        system,
        maxDistance: Number(f.maxDistance),
        maxDaysAgo: Number(f.maxDaysAgo),
        maxArrival: Number(f.maxArrival),
        pad: f.pad || undefined,
        planetary: f.planetary,
        settlements: f.settlements,
        sort: f.sort,
        cargo: cargo ? Number(cargo) : undefined,
        range: range ? Number(range) : undefined,
      };
      setResult(await api(`${base}/search`, { method: 'POST', body }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const best = result?.loops[0];
  return (
    <div>

      <div className="tiles tiles-4" data-tuto="extension-calc-tuiles">
        <Tile label="Vaisseau" value={ctx?.ship || '—'} sub={ctx?.pad ? `plateforme ${ctx.pad}` : 'lance le jeu pour le lire'} />
        <Tile label="Soute" value={ctx?.cargo != null ? `${int(ctx.cargo)} t` : '—'} sub="lue dans le journal" />
        <Tile label="Portée chargée" value={ctx?.range ? `${dec1(ctx.range)} al` : '—'} sub={ctx?.rangeEmpty ? `à vide ${dec1(ctx.rangeEmpty)} al` : undefined} />
        <Tile
          label="Ta route actuelle"
          value={active ? compact(active.net) : '—'}
          sub={active ? `par boucle · ≈ ${compact((active.net / active.minutes) * 60)} / h mesuré` : 'aucune route active'}
        />
      </div>

      <form className="panel form planner-form" onSubmit={search}>
        <div className="planner-fields" data-tuto="extension-calc-filtres">
          <label>
            Système de départ
            <input
              value={system}
              onChange={onSystemInput}
              disabled={f.followPosition}
              list="planner-systems"
              placeholder="ex. Cemiess"
            />
            <datalist id="planner-systems">
              {suggest.map((s) => <option key={s} value={s} />)}
            </datalist>
          </label>
          <label>
            Rayon (al)
            <input type="number" min="5" max="80" value={f.maxDistance} onChange={set('maxDistance')} />
          </label>
          <label>
            Prix de moins de (jours)
            <input type="number" min="1" max="30" value={f.maxDaysAgo} onChange={set('maxDaysAgo')} />
          </label>
          <label>
            Station à moins de (ls)
            <input type="number" min="100" step="500" value={f.maxArrival} onChange={set('maxArrival')} />
          </label>
          <label>
            Plateforme
            <select value={f.pad} onChange={set('pad')}>
              <option value="">celle du vaisseau ({ctx?.pad || '?'})</option>
              <option value="L">L</option>
              <option value="M">M</option>
              <option value="S">S</option>
            </select>
          </label>
          <label>
            Classer par
            <select value={f.sort} onChange={set('sort')}>
              <option value="hour">gain par heure (estimé)</option>
              <option value="trip">gain par boucle</option>
            </select>
          </label>
          <label>
            Soute (t)
            <input type="number" min="1" value={cargo} onChange={(e) => setCargo(e.target.value)} placeholder={ctx?.cargo != null ? String(ctx.cargo) : ''} />
          </label>
          <label>
            Portée chargée (al)
            <input type="number" min="1" step="0.1" value={range} onChange={(e) => setRange(e.target.value)} placeholder={ctx?.range ? dec1(ctx.range) : ''} />
          </label>
        </div>
        <div className="form-actions" data-tuto="extension-calc-cases">
          <label className="check">
            <input type="checkbox" checked={f.followPosition} onChange={set('followPosition')} /> Ma position actuelle
          </label>
          <label className="check">
            <input type="checkbox" checked={f.planetary} onChange={set('planetary')} /> Stations planétaires
          </label>
          <label className="check">
            <input type="checkbox" checked={f.settlements} onChange={set('settlements')} /> Colonies Odyssey
          </label>
        </div>
        <div className="form-actions">
          <button className="btn btn-primary" data-tuto="extension-calc-chercher" disabled={busy || !system}>{busy ? 'Recherche… (≈ 10 s)' : 'Chercher'}</button>
          {error && <span className="bad">{error}</span>}
          <span className="tiny muted">Soute, portée et position : celles du vaisseau en jeu, sauf si tu les changes ici.</span>
        </div>
      </form>

      {result && (
        <section className="panel">
          {best && (
            <p>
              Meilleure boucle autour de <strong><NomSysteme nom={result.reference.system} /></strong> : <strong className="good">{compact(best.profit)}</strong> par
              boucle ({best.out.name.toLocaleLowerCase('fr-FR')} puis {best.back.name.toLocaleLowerCase('fr-FR')}), ≈ {compact(best.perHour)} / h.
            </p>
          )}
          <nav className="tabs">
            <a href="#" className={tab === 'loops' ? 'active' : ''} onClick={(e) => (e.preventDefault(), setTab('loops'))}>
              Boucles A ⇄ B ({result.loops.length})
            </a>
            <a href="#" className={tab === 'oneWay' ? 'active' : ''} onClick={(e) => (e.preventDefault(), setTab('oneWay'))}>
              Allers simples ({result.oneWay.length})
            </a>
          </nav>
          {tab === 'loops' ? <Results list={result.loops} loop active={active} /> : <Results list={result.oneWay} />}
          {tab === 'oneWay' && <p className="tiny muted">Aller simple : le gain par heure ne compte pas le retour à vide.</p>}
          <p className="tiny muted">
            Prix : <a href="https://ardent-insight.com" target="_blank" rel="noopener noreferrer">Ardent Insight</a> (relevés des joueurs via EDDN),{' '}
            {result.meta.markets} stations, {result.meta.commodities} marchandises, {result.meta.requests} requêtes
            {result.meta.cached ? ` (+${result.meta.cached} en cache)` : ''}, {dec1(result.meta.ms / 1000)} s
            {result.meta.failed ? `, ${result.meta.failed} requêtes en échec` : ''}. Durées et gains par heure estimés : la boucle réelle est
            mesurée par « Mes routes commerciales ».
          </p>
        </section>
      )}
    </div>
  );
}
