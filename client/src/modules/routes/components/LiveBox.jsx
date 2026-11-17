import { useNow } from '../../../core/stream.js';
import { clock, compact, dateTime, dec1, int } from '../../../core/format.js';
import NomSysteme from '../../../core/NomSysteme.jsx';

/**
 * Encadré « En ce moment » : étape actuelle, prochaine destination, chronomètres,
 * avance ou retard sur la moyenne.
 */
export default function LiveBox({ live, legAverages }) {
  const now = useNow(1000);

  if (live.state !== 'running') {
    return (
      <section className="panel live live-waiting">
        <div className="live-label">En ce moment</div>
        <div className="live-text">{live.text}</div>
        {live.lastDeparture && <div className="muted">Dernier départ : {dateTime(live.lastDeparture)}</div>}
      </section>
    );
  }

  // Chronos en temps joué : arrêtés si aucune action depuis plus de 4 min, ou au menu
  const sinceLast = live.lastActivityAt ? (now - Date.parse(live.lastActivityAt)) / 1000 : 0;
  const paused = live.inMenu || sinceLast > live.pauseGapSec;
  const extra = paused ? 0 : Math.max(0, sinceLast);
  const elapsed = (live.activeSec ?? 0) + extra;
  const legElapsed = live.legActiveSec != null ? live.legActiveSec + extra : null;

  // Écart avec la moyenne : retard pris sur les étapes terminées + dépassement de l'étape en cours
  let delta = null;
  const prev = legAverages.slice(0, live.legIndex);
  if (prev.every((x) => x != null) && live.avgLegSec != null && legElapsed != null) {
    const doneActual = elapsed - legElapsed;
    const doneAvg = prev.reduce((a, b) => a + b, 0);
    delta = doneActual - doneAvg + Math.max(0, legElapsed - live.avgLegSec);
  }
  const late = delta != null && delta > 30;
  const early = delta != null && delta < -30;

  return (
    <section className={`panel live ${live.destroyed ? 'live-bad' : ''} ${paused ? 'live-paused' : ''}`}>
      <div className="live-head">
        <div className="live-label">En ce moment</div>
        {paused && (
          <span className="pill pill-info">
            ⏸ En pause depuis {dateTime(live.lastActivityAt).split(' ').pop()} · chronos arrêtés
          </span>
        )}
        {!paused && delta != null && (
          <span className={`pill ${late ? 'pill-warn' : early ? 'pill-good' : 'pill-muted'}`}>
            {late ? `En retard de ${dec1(delta / 60)} min` : early ? `En avance de ${dec1(-delta / 60)} min` : "Dans les temps"}
          </span>
        )}
      </div>
      <div className="live-text">{live.text}</div>
      <div className="live-grid">
        <div>
          <div className="live-k">Prochaine destination</div>
          <div className="live-v">
            {live.next.station} <span className="muted">(<NomSysteme nom={live.next.system} />)</span>
          </div>
        </div>
        <div>
          <div className="live-k">Boucle en cours</div>
          <div className="live-v num big">{clock(elapsed)}</div>
          <div className="muted">moyenne {live.avgLoopSec ? clock(live.avgLoopSec) : '—'}</div>
        </div>
        <div>
          <div className="live-k">
            Étape {live.legIndex + 1}/{live.legCount}
          </div>
          <div className="live-v num big">{legElapsed != null ? clock(legElapsed) : '—'}</div>
          <div className="muted">moyenne {live.avgLegSec ? clock(live.avgLegSec) : '—'}</div>
        </div>
        <div>
          <div className="live-k">Depuis le départ</div>
          <div className={`live-v num ${live.netSoFar < 0 ? 'muted' : 'good'}`}>{compact(live.netSoFar)} cr</div>
          <div className="muted">{int(live.meritsSoFar)} mérites</div>
        </div>
      </div>
    </section>
  );
}
