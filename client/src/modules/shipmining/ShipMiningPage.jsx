import { PauseButton, pauseLabel } from '../../core/hud.jsx';
import { OverlayToggle } from '../../core/overlay.jsx';
import { clock, compact, int, time } from '../../core/format.js';
import Tile from '../../core/Tile.jsx';
import { ProspectLine, useShipMining, VERDICT } from './useShipMining.jsx';

export default function ShipMiningPage() {
  const session = useShipMining();
  const { data, seconds } = session;

  async function reset() {
    if (window.confirm('Remettre la session de minage à zéro ?')) await session.reset();
  }

  if (!data) return <div className="page"><h1>Minage vaisseau</h1><p className="muted">Chargement…</p></div>;
  const { hold } = data;

  return (
    <div className="page">
      <header className="route-header">
        <div>
          <h1>Minage vaisseau</h1>
          <p className="muted" data-tuto="minage-vaisseau-session">Session {data.startedAt ? `depuis ${time(data.startedAt)}, ${clock(seconds)}${session.pause ? ` (${pauseLabel(session.pause)})` : ''}` : 'non commencée'}</p>
        </div>
        <div className="form-actions" data-tuto="minage-vaisseau-actions">
          <OverlayToggle page="shipmining" />
          <PauseButton session={session} />
          <button className="btn" data-tuto="minage-vaisseau-zero" onClick={reset}>Remettre à zéro</button>
        </div>
      </header>

      <div className="tiles tiles-4" data-tuto="minage-vaisseau-tuiles">
        <Tile label="Soute" value={hold?.count != null ? `${int(hold.count)} t` : '—'} sub={hold?.capacity != null ? `sur ${int(hold.capacity)} t` : 'capacité inconnue'} />
        <Tile label="Drones" value={int(hold?.drones)} sub={`lancés : ${int(data.drones.prospector)} prospecteurs · ${int(data.drones.collection)} collecteurs`} />
        <Tile label="Raffinés" value={`${int(data.totalRefined)} t`} sub={data.perHour != null ? `${int(data.perHour)} t/h sur la dernière demi-heure` : 'rythme après 10 min'} tone={data.totalRefined ? 'good' : undefined} />
        <Tile label="Prospectés" value={int(data.prospected)} sub="astéroïdes pendant la session" />
      </div>

      <h2 data-tuto="minage-vaisseau-prospects">Astéroïdes prospectés</h2>
      {data.prospects.length ? (
        <div className="table-wrap">
          <table className="table compact">
            <thead><tr><th>Heure</th><th>Verdict</th><th className="right">Valeur</th><th>Présence</th><th>Minerais</th></tr></thead>
            <tbody>
              {data.prospects.map((p, i) => (
                <tr key={`${p.at}-${i}`}>
                  <td className="num">{time(p.at)}</td>
                  <td style={{ color: VERDICT[p.verdict].color }}>{VERDICT[p.verdict].label}</td>
                  <td className="right num">{p.value != null ? `${compact(p.value)} cr/t` : '—'}</td>
                  <td>{p.content || '—'}</td>
                  <td className="prospect-line"><ProspectLine p={p} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">Aucun astéroïde prospecté pendant cette session.</p>
      )}

      {data.refined.length > 0 && (
        <>
          <h2>Raffiné</h2>
          <p>{data.refined.map((r) => <span key={r.name} className="pill">{r.name} : {int(r.tons)} t</span>)}</p>
        </>
      )}

      <p className="tiny muted" data-tuto="minage-vaisseau-valeur">
        Valeur : estimation par tonne collectée, somme de la teneur de chaque minerai multipliée par son prix (relevé le
        {' '}{data.pricesDate} sur Ardent Insight, médiane des meilleures offres d'achat). Bon dès 40 k cr/t, moyen dès 15 k.
        Elle sert à comparer les astéroïdes, pas à prévoir le gain exact. Le raffinage fait depuis le SRV est suivi par le
        mode Minage Rhino (Mes repères).
      </p>
    </div>
  );
}
