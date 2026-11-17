import { useState } from 'react';
import { useNavigate } from 'react-router';
import { routesApi } from '../api.js';
import LoopStructure from '../components/LoopStructure.jsx';
import GoalInput, { parseCredits } from '../components/GoalInput.jsx';
import Tile from '../../../core/Tile.jsx';
import { compact, cr, dateTime, duration, int } from '../../../core/format.js';

/** Création d'une route à partir de la dernière boucle trouvée dans le journal. */
export default function NewRoute() {
  const [det, setDet] = useState(null);
  const [anchor, setAnchor] = useState('');
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [includeHistory, setIncludeHistory] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  async function detect(anchorSystem) {
    setBusy(true);
    setError('');
    try {
      const d = await routesApi.detect(anchorSystem);
      setDet(d);
      setAnchor(d.startSystem);
      setName(d.suggestedName);
    } catch (e) {
      setDet(null);
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function create(e) {
    e.preventDefault();
    const g = parseCredits(goal);
    if (!g) return setError('Indique ton objectif de crédits.');
    setBusy(true);
    setError('');
    try {
      const r = await routesApi.create({ anchorSystem: anchor, name, goal: g, includeHistory });
      navigate(`/routes/${r.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (!det) {
    return (
      <div className="page narrow">
        <section className="panel center" data-tuto="commerce-nouvelle-depart">
          <h2>Nouvelle route</h2>
          <p>
            Fais d'abord ta route une fois en jeu : un aller-retour complet, de l'achat de la marchandise de départ
            jusqu'à son rachat au même endroit.
          </p>
          <button className="btn btn-primary btn-big" data-tuto="commerce-nouvelle-detecter" onClick={() => detect()} disabled={busy}>
            {busy ? 'Lecture du journal…' : "J'ai fait ma route"}
          </button>
          {error && <p className="bad">{error}</p>}
        </section>
      </div>
    );
  }

  const l = det.loop;
  return (
    <form className="page" onSubmit={create}>
      <section className="panel" data-tuto="commerce-nouvelle-detectee">
        <h2>Route détectée</h2>
        {det.anchors.length > 1 && (
          <div className="anchor-choice">
            <span className="muted">Point de départ de la boucle :</span>
            {det.anchors.map((a) => (
              <label key={a.system} className="radio">
                <input
                  type="radio"
                  checked={anchor === a.system}
                  onChange={() => detect(a.system)}
                  disabled={busy}
                />
                {a.station} <span className="muted">(achat de {a.name.toLocaleLowerCase('fr-FR')})</span>
              </label>
            ))}
          </div>
        )}
        {l && (
          <div className="tiles tiles-4">
            <Tile label="Gain net de la boucle" value={compact(l.netGain)} sub={cr(l.netGain)} tone="good" />
            <Tile label="Durée jouée" value={duration(l.activeSec || l.durationSec)} sub={`départ ${dateTime(l.startAt)}`} />
            <Tile label="Mérites" value={int(l.merits)} />
            <Tile label="Sauts" value={int(det.jumpsPerLoop)} sub={`plus long : ${det.longestJump} al`} />
          </div>
        )}
        <LoopStructure structure={det} />
      </section>

      <section className="panel form" data-tuto="commerce-nouvelle-reglages">
        <label>
          Nom de la route
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Objectif de crédits <span className="muted">(seul champ obligatoire)</span>
          <GoalInput value={goal} onChange={setGoal} autoFocus />
        </label>
        {det.earlierLoops > 0 && (
          <label className="check">
            <input type="checkbox" checked={includeHistory} onChange={(e) => setIncludeHistory(e.target.checked)} />
            Importer aussi les {det.earlierLoops} boucles précédentes trouvées dans les journaux
          </label>
        )}
        <div className="form-actions">
          <button className="btn btn-primary" data-tuto="commerce-nouvelle-creer" type="submit" disabled={busy}>
            Créer la route
          </button>
          <button className="btn" data-tuto="commerce-nouvelle-relire" type="button" onClick={() => detect(anchor)} disabled={busy}>
            Relire le journal
          </button>
          {error && <span className="bad">{error}</span>}
        </div>
      </section>
    </form>
  );
}
