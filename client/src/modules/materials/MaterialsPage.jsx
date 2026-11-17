import { PauseButton, pauseLabel } from '../../core/hud.jsx';
import { OverlayToggle } from '../../core/overlay.jsx';
import { clock, int, time } from '../../core/format.js';
import Tile from '../../core/Tile.jsx';
import { GRADE_COLORS, useMaterials } from './useMaterials.jsx';

const CATEGORY = { Raw: 'Brut', Manufactured: 'Manufacturé', Encoded: 'Encodé' };

export default function MaterialsPage() {
  const session = useMaterials();
  const { data, seconds } = session;

  async function reset() {
    if (window.confirm('Remettre la session de matériaux à zéro ?')) await session.reset();
  }

  if (!data) return <div className="page"><h1>Matériaux</h1><p className="muted">Chargement…</p></div>;

  return (
    <div className="page">
      <header className="route-header">
        <div>
          <h1>Matériaux</h1>
          <p className="muted">Session {data.startedAt ? `depuis ${time(data.startedAt)}, ${clock(seconds)}${session.pause ? ` (${pauseLabel(session.pause)})` : ''}` : 'non commencée'}</p>
        </div>
        <div className="form-actions">
          <OverlayToggle page="materials" />
          <PauseButton session={session} />
          <button className="btn" data-tuto="activites-materiaux-zero" onClick={reset}>Remettre à zéro</button>
        </div>
      </header>

      <div className="tiles tiles-4" data-tuto="activites-materiaux-tuiles">
        <Tile label="Récupérés" value={int(data.total)} sub="unités, toutes catégories" />
        <Tile label="Bruts" value={int(data.byCategory.Raw)} />
        <Tile label="Manufacturés" value={int(data.byCategory.Manufactured)} />
        <Tile label="Encodés" value={int(data.byCategory.Encoded)} />
      </div>
      <p data-tuto="activites-materiaux-grades">
        {data.byGrade.map((count, i) => (
          <span key={i} className="pill" style={{ color: GRADE_COLORS[i] }}>G{i + 1} : {int(count)}</span>
        ))}
      </p>

      <h2 data-tuto="activites-materiaux-liste">Récupérés pendant la session</h2>
      {data.materials.length ? (
        <div className="table-wrap">
          <table className="table compact">
            <thead><tr><th>Matériau</th><th>Catégorie</th><th>Grade</th><th className="right">Quantité</th></tr></thead>
            <tbody>
              {data.materials.map((m) => (
                <tr key={m.label}>
                  <td>{m.label}</td>
                  <td>{CATEGORY[m.category] || m.category}</td>
                  <td style={{ color: m.grade ? GRADE_COLORS[m.grade - 1] : undefined }}>{m.grade ? `G${m.grade}` : '—'}</td>
                  <td className="right num">{int(m.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">Aucun matériau récupéré pendant cette session.</p>
      )}

      <p className="tiny muted" data-tuto="activites-materiaux-signaux">
        En mode Matériaux comme en mode Sauvetage, la fenêtre « Signaux » s'ouvre par-dessus le jeu à chaque arrivée dans
        un système : sources de signal non identifiées, sites au sol, zones de conflit, sites d'extraction. Les grades
        viennent des données de référence téléchargées par l'ingénierie.
      </p>
    </div>
  );
}
