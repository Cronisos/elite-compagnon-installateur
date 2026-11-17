import { PauseButton, pauseLabel } from '../../core/hud.jsx';
import { OverlayToggle } from '../../core/overlay.jsx';
import { useRescue } from './useRescue.jsx';
import { clock, compact, cr, int, time } from '../../core/format.js';
import Tile from '../../core/Tile.jsx';

const TONES = { Livré: 'good', Largué: 'bad' };

export default function RescuePage() {
  const rescue = useRescue();
  const { data, seconds, creditsHour, meritsHour } = rescue;

  async function reset() {
    if (window.confirm('Remettre la session de sauvetage à zéro ?')) await rescue.reset();
  }

  if (!data) return <div className="page"><h1>Sauvetage</h1><p className="muted">Chargement…</p></div>;

  return (
    <div className="page">
      <header className="route-header">
        <div>
          <h1>Sauvetage</h1>
          <p className="muted" data-tuto="activites-sauvetage-session">
            Session {data.startedAt ? `depuis ${time(data.startedAt)}, ${clock(seconds)}${rescue.pause ? ` (${pauseLabel(rescue.pause)})` : ''}` : 'non commencée'}
            {data.lastActionAt && ` · dernière action à ${time(data.lastActionAt)}`}
            {data.deaths > 0 && <span className="bad"> · {data.deaths} destruction{data.deaths > 1 ? 's' : ''}</span>}
          </p>
        </div>
        <div className="form-actions">
          <OverlayToggle page="rescue" />
          <PauseButton session={rescue} />
          <button className="btn" data-tuto="activites-sauvetage-zero" onClick={reset}>Remettre à zéro</button>
        </div>
      </header>

      <div className="tiles tiles-4" data-tuto="activites-sauvetage-tuiles">
        <Tile
          label="Récupérés"
          value={int(data.collected)}
          sub={data.lost ? `${int(data.lost)} perdu${data.lost > 1 ? 's' : ''} (largués)` : 'nacelles, boîtes noires, débris…'}
        />
        <Tile
          label="En soute"
          value={int(data.hold.count)}
          sub={data.hold.items.map((i) => `${int(i.count)} × ${i.label}`).join(' · ') || 'rien à livrer'}
          tone={data.hold.count ? 'warn' : undefined}
        />
        <Tile
          label="Livrés"
          value={int(data.delivered)}
          sub={`${cr(data.credits)}${creditsHour != null ? ` · ${compact(creditsHour)} cr/h` : ''}`}
          tone={data.delivered ? 'good' : undefined}
        />
        <Tile
          label="Mérites"
          value={int(data.merits)}
          sub={meritsHour != null ? `${int(meritsHour)} par heure` : 'après les livraisons'}
          tone={data.merits ? 'good' : undefined}
        />
      </div>

      <h2 data-tuto="activites-sauvetage-actions">Dernières actions</h2>
      {data.recent.length ? (
        <div className="table-wrap">
          <table className="table compact">
            <thead>
              <tr>
                <th>Heure</th>
                <th>Action</th>
                <th>Marchandise</th>
                <th className="right">Quantité</th>
                <th className="right">Récompense</th>
                <th className="right">Mérites</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.map((a, i) => (
                <tr key={`${a.at}-${i}`}>
                  <td className="num">{time(a.at)}</td>
                  <td className={TONES[a.kind] || ''}>{a.kind}</td>
                  <td>{a.label}</td>
                  <td className="right num">{int(a.count)}</td>
                  <td className="right num">{a.reward ? cr(a.reward) : '—'}</td>
                  <td className="right num">{a.merits ? int(a.merits) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">Aucun sauvetage pendant cette session.</p>
      )}

      <p className="tiny muted">
        Comptés : nacelles d'évacuation, boîtes noires, débris d'épave, effets personnels et autres marchandises
        acceptées par le contact de recherche et sauvetage. Une marchandise livrée une fois est ensuite reconnue
        partout. Les mérites sont ceux reçus dans les 10 s qui suivent une livraison. Une destruction fait perdre ce qui
        est en soute.
      </p>
    </div>
  );
}
