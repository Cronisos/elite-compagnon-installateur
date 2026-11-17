import { useEffect, useRef, useState } from 'react';
import { useHiddenWindow } from '../../core/hud.jsx';
import { useEvent, useNow } from '../../core/stream.js';
import { meters, wpApi } from './api.js';
import { ago, DANGER_COLOR, drillState, fitMap, scaleBar, sinceText, tons } from './drillsFormat.js';

// Foreuses du Rhino, dans la fenêtre du balayage (carte, une case par foreuse, boussole) et sur la page de la session
// (tableau du rendement, réglage du rayon de destruction). Le serveur reconnaît seul chaque vidange (rafale de
// raffinages en SRV) et note la position ; la pose se marque au bouton ⛏ ou à Alt+Maj+F.
export const DRILLS_CSS = `
.dr { display: flex; flex-direction: column; gap: 4px; }
.dr-map { width: 100%; max-height: 150px; display: block; }
.dr-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font-size: 11px; font-weight: 700;
  letter-spacing: .08em; text-transform: uppercase; color: #8a94a0; }
.dr-head b { color: #f4f6f8; letter-spacing: 0; text-transform: none; font-variant-numeric: tabular-nums; }
.dr-chips { display: flex; gap: 4px; }
.dr-chip { flex: 1; min-width: 0; height: 30px; padding: 0 2px; border: 1px solid var(--c, #4a525c); border-radius: 4px; background: #07090c;
  color: var(--c, #8a94a0); cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.05; }
.dr-chip b { font-size: 14px; }
.dr-chip small { font-size: 10px; color: #8a94a0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; font-variant-numeric: tabular-nums; }
.dr-chip.is-next { box-shadow: 0 0 0 1px var(--c) inset; }
.dr-chip.is-on, .dr-chip:hover { background: color-mix(in srgb, var(--c, var(--accent)) 22%, #07090c); }
.dr-compass { flex: none; width: 34px; font-size: 15px; --c: var(--accent); }
.dr-warn { margin: 0; font-size: 12px; color: ${DANGER_COLOR}; }
.dr-quiet { border: 0; background: none; color: #8a94a0; font-size: 11px; cursor: pointer; padding: 0 2px; }
.dr-quiet.is-warn { color: ${DANGER_COLOR}; }
`;

/** Foreuses de la séance, en direct. */
export function useDrills() {
  const [d, setD] = useState(null);
  useEffect(() => {
    wpApi.drills().then(setD).catch(() => {});
  }, []);
  useEvent('waypoints:drills', setD);
  return [d, setD];
}

/** Alt+Maj+F dans l'overlay (raccourci global) : la fenêtre du balayage note la pose. */
export function useDrillKey(onKey) {
  const ref = useRef(onKey);
  ref.current = onKey;
  useEffect(() => {
    const off = window.eliteOverlay?.onDrillKey?.(() => ref.current());
    return typeof off === 'function' ? off : undefined; // remonté (StrictMode) : jamais deux foreuses pour un appui
  }, []);
}

/** Texte de survol d'une foreuse. */
function drillTitle(x, now) {
  const st = drillState(x, now);
  const parts = [`Foreuse ${x.n}`, sinceText(x, now)];
  if (st.label) parts.push(st.label);
  if (x.vidanges) parts.push(`${x.vidanges} vidange${x.vidanges > 1 ? 's' : ''}, ${tons(x.tons)}`);
  if (x.cycleMs) parts.push(`cycle ${ago(x.cycleMs)}${x.cycleFrom === 'seance' ? ' (celui de la séance)' : ''}`);
  if (x.distance != null) parts.push(`à ${meters(x.distance)}`);
  if (x.spread != null && x.vidanges > 1) parts.push(`vidée à ${meters(x.spread)} au plus de son point`);
  return parts.join(' · ');
}

/** Une foreuse sur une carte : son numéro dans un rond, vert quand elle est prête, et le rayon de destruction s'il est réglé. */
function DrillDot({ x, px, py, k, radius, now, inside = true }) {
  const st = drillState(x, now);
  return (
    <g transform={`translate(${px.toFixed(2)} ${py.toFixed(2)})`}>
      <title>{drillTitle(x, now)}</title>
      {radius && inside && <circle r={radius * k} fill="none" stroke={DANGER_COLOR} strokeOpacity=".45" strokeWidth="0.8" strokeDasharray="2 3" />}
      {x.next && <circle r="9.5" fill="none" stroke={st.color} strokeWidth="1" strokeOpacity=".6" />}
      <circle r="6.5" fill="#07090c" stroke={st.color} strokeWidth={st.ready ? 2 : 1.3} />
      <text y="2.8" textAnchor="middle" fontSize="8" fontWeight="700" fill={st.color}>{x.n}</text>
    </g>
  );
}

/** Les foreuses sur la carte du balayage (même centre, même échelle k), ramenées au bord quand elles sont au-delà. */
export function DrillMarks({ d, k }) {
  const now = useNow(5000);
  if (d?.origin !== 'sweep') return null;
  return d.drills.map((x) => {
    const r = Math.hypot(x.x, x.y) * k;
    const s = Math.min(r, 106) / (r || 1);
    return <DrillDot key={`f${x.n}`} x={x} px={x.x * k * s} py={-x.y * k * s} k={k} radius={d.destroyRadius} now={now} inside={r <= 106} />;
  });
}

/** Petite carte des foreuses quand il n'y a pas de balayage sur cette planète : nord en haut, toi en flèche. */
function MiniMap({ d, now }) {
  const { cx, cy, k } = fitMap([...d.drills, d.you]);
  const at = (p) => [(p.x - cx) * k, -(p.y - cy) * k];
  const bar = scaleBar(200 / k);
  const you = d.you && at(d.you);
  return (
    <svg className="dr-map" viewBox="-112 -112 224 224" aria-label="Carte des foreuses" style={{ overflow: 'hidden' }}>
      <circle r="100" fill="rgba(255,255,255,.03)" stroke="#4a525c" strokeWidth="1" />
      <text x="0" y="-103" textAnchor="middle" fontSize="9" fill="#8a94a0">N</text>
      {d.drills.map((x) => {
        const [px, py] = at(x);
        return <DrillDot key={x.n} x={x} px={px} py={py} k={k} radius={d.destroyRadius} now={now} />;
      })}
      {you && (
        <path d="M0 -7 L5 5 L0 2.5 L-5 5 Z" fill="#f4f6f8" stroke="#07090c" strokeWidth="1.2"
          transform={`translate(${you[0].toFixed(2)} ${you[1].toFixed(2)}) rotate(${d.you.heading ?? 0})`} />
      )}
      <g transform="translate(-104 104)">
        <line x1="0" y1="0" x2={bar * k} y2="0" stroke="#8a94a0" strokeWidth="1.2" />
        <text x={bar * k + 3} y="3" fontSize="8" fill="#8a94a0">{meters(bar)}</text>
      </g>
    </svg>
  );
}

/**
 * Bandeau des foreuses de la fenêtre du balayage : une case par foreuse (temps depuis la vidange, « prête »), un clic
 * pour s'y faire guider, 🧭 pour suivre la prochaine à vider. `map` : avec sa petite carte (pas de balayage ici).
 */
export function DrillStrip({ d, map, hover }) {
  const now = useNow(5000);
  const guideWin = useHiddenWindow('waypoints-guide');
  const [target, setTarget] = useState(null);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    wpApi.drillGuide().then((g) => setTarget(g?.target ?? null)).catch(() => {});
  }, []);
  useEvent('waypoints:drill-guide', (g) => setTarget(g?.target ?? null));
  useEffect(() => {
    if (!confirm) return undefined;
    const t = setTimeout(() => setConfirm(false), 3000);
    return () => clearTimeout(t);
  }, [confirm]);

  /** Boussole vers cette foreuse (ou la prochaine) ; sur celle déjà suivie, la range. */
  async function guide(t) {
    if (target === t && guideWin.shown) {
      await wpApi.setDrillGuide(null).catch(() => {});
      return guideWin.toggle();
    }
    await wpApi.setDrillGuide(t).catch(() => {});
    if (!guideWin.shown) guideWin.toggle();
    return null;
  }
  const clearAll = () => {
    if (!confirm) return setConfirm(true);
    setConfirm(false);
    return wpApi.drillsClear().catch(() => {});
  };

  const next = d.drills.find((x) => x.next);
  const nextState = next && drillState(next, now);
  const warn = d.drills.filter((x) => x.warn);
  return (
    <div className="dr">
      {map && <MiniMap d={d} now={now} />}
      <div className="dr-head">
        <span>Foreuses · {d.cycleMs ? `cycle ${ago(d.cycleMs)}` : 'cycle à mesurer'}</span>
        <span>
          {next && <b>{nextState.ready ? `${next.n} prête` : `Prochaine : ${next.n}`}{next.distance != null ? ` · ${meters(next.distance)}` : ''}</b>}
          <button className={`dr-quiet ${confirm ? 'is-warn' : ''}`} title="Oublier toutes les foreuses (ramassées)" {...hover} onClick={clearAll}>{confirm ? 'Sûr ?' : '✕'}</button>
        </span>
      </div>
      <div className="dr-chips">
        {d.drills.map((x) => {
          const st = drillState(x, now);
          const filling = d.live?.n === x.n;
          return (
            <button key={x.n} className={`dr-chip ${x.next ? 'is-next' : ''} ${target === x.n ? 'is-on' : ''}`} style={{ '--c': st.color }}
              title={`${drillTitle(x, now)} — clic : boussole vers elle`} {...hover} onClick={() => guide(x.n)}>
              <b>{x.n}</b>
              <small>{filling ? `${d.live.tons} t…` : st.ready ? 'prête' : ago(st.since)}</small>
            </button>
          );
        })}
        <button className={`dr-chip dr-compass ${target === 'next' ? 'is-on' : ''}`} title="Boussole vers la prochaine foreuse à vider" {...hover} onClick={() => guide('next')}>🧭</button>
      </div>
      {warn.length > 0 && (
        <p className="dr-warn">
          ⚠ Foreuse {warn.map((x) => x.n).join(', ')} à {meters(Math.max(...warn.map((x) => x.distance)))} : rayon réglé à {meters(d.destroyRadius)}
        </p>
      )}
      {!d.onBody && <span className="sw-dim">Tes foreuses sont sur {d.body}.</span>}
    </div>
  );
}

const rate = (n) => (n == null ? '—' : `${Math.round(n).toLocaleString('fr-FR')} t/h`);

/** Page de la session : rendement de chaque foreuse dans la séance, retrait d'une foreuse ramassée, rayon de destruction. */
export function DrillsTable() {
  const [d, setD] = useDrills();
  const now = useNow(5000);
  const [radius, setRadius] = useState(null); // saisie en km ; null : la valeur du serveur
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(false); // « Tout effacer » : deux clics, comme le ✕ du balayage
  useEffect(() => {
    if (!confirm) return undefined;
    const t = setTimeout(() => setConfirm(false), 3000);
    return () => clearTimeout(t);
  }, [confirm]);
  if (!d?.active) return null;
  const act = (call) => {
    setError(null);
    call().then(setD).catch((e) => setError(e.message));
  };
  const clearAll = () => {
    if (!confirm) return setConfirm(true);
    setConfirm(false);
    return act(wpApi.drillsClear);
  };
  const shown = radius ?? (d.destroyRadius ? String(d.destroyRadius / 1000).replace('.', ',') : '');
  return (
    <div className="mining-drills" style={{ marginTop: '1rem' }}>
      <h3>Foreuses du Rhino</h3>
      <p className="tiny muted">
        Chaque vidange est reconnue seule : une rafale d’au moins 10 t raffinées en SRV, à l’endroit où tu es. La pose
        se marque au bouton ⛏ du balayage ou à Alt+Maj+F. Le cycle est mesuré d’une vidange à la suivante, sans
        compter les retours au vaisseau.
      </p>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>N°</th><th>État</th><th>Dernière</th><th>Vidanges</th><th>Récupéré</th><th>Par vidange</th><th>Cycle</th><th>Rendement</th><th>Distance</th><th /></tr>
          </thead>
          <tbody>
            {d.drills.map((x) => {
              const st = drillState(x, now);
              return (
                <tr key={x.n}>
                  <td><b style={{ color: st.color }}>{x.n}</b></td>
                  <td>{st.label || '—'}{x.warn && <span className="bad"> · trop loin</span>}</td>
                  <td>{sinceText(x, now)}</td>
                  <td className="num">{x.vidanges}</td>
                  <td className="num">{tons(x.tons)}</td>
                  <td className="num">{x.avgTons == null ? '—' : `${x.avgTons.toLocaleString('fr-FR')} t`}</td>
                  <td className="num">{x.cycleMs ? `${ago(x.cycleMs)}${x.cycleFrom === 'seance' ? ' (séance)' : ''}` : '—'}</td>
                  <td className="num">{rate(x.perHour)}</td>
                  <td className="num">{x.distance == null ? '—' : meters(x.distance)}</td>
                  <td><button className="btn btn-ghost small" title="Foreuse ramassée : ne plus la suivre" onClick={() => act(() => wpApi.drillRemove(x.n))}>✕</button></td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr><th colSpan="3">Séance{d.body ? ` · ${d.body}` : ''}</th><th className="num">{d.vidangesTotal}</th><th className="num">{tons(d.tons)}</th><th /><th className="num">{d.cycleMs ? ago(d.cycleMs) : '—'}</th><th colSpan="3" /></tr>
          </tfoot>
        </table>
      </div>
      <div className="form-actions">
        <label className="small">
          Rayon de destruction{' '}
          <input inputMode="decimal" placeholder="non réglé" value={shown} onChange={(e) => setRadius(e.target.value)} style={{ width: '6em' }} /> km
        </label>
        <button className="btn btn-ghost small" onClick={() => act(() => wpApi.drillSettings({ destroyRadiusKm: shown }).then((v) => { setRadius(null); return v; }))}>Enregistrer</button>
        <button className={`btn small ${confirm ? 'btn-danger-on' : 'btn-ghost'}`} title="Oublier toutes les foreuses de la séance" onClick={clearAll}>{confirm ? 'Sûr ? Tout effacer' : 'Tout effacer'}</button>
      </div>
      <p className="tiny muted">
        Le rayon de 5 km vient du seul auteur d’EDSMT et n’a jamais été mesuré : rien n’est affiché ni signalé tant que tu
        ne l’as pas réglé. Réglé, il apparaît en pointillés rouges autour des foreuses, et l’app t’avertit à 90 %.
      </p>
      {error && <p className="bad small">{error}</p>}
    </div>
  );
}
