// Éditeur d'une route d'extension (onglet « Routes d'extension ») : nom, description, systèmes dans l'ordre du départ
// à l'arrivée, avec leur objectif et leur saut, et le contrôle de portée en direct (routeEdit.js). Le serveur
// revérifie tout à l'enregistrement (POST ou PUT /projects).

import { useMemo, useRef, useState } from 'react';
import { dec2, int } from '../../core/format.js';
import { expansionApi } from './api.js';
import { addRow, applyJumps, checkDraft, draftFrom, emptyDraft, MAX_STEPS, moveRow, payload, removeRow, ROLE_OPTIONS, rowLabel, setRow } from './routeEdit.js';

/**
 * @param project route à modifier (réponse de GET /projects), ou null pour en créer une
 * @param reach portée de chaque objectif (GET /rules), null tant qu'elle n'est pas reçue
 * @param onSaved(route enregistrée) ; onCancel()
 */
export default function RouteEditor({ project, reach, onSaved, onCancel }) {
  const [draft, setDraft] = useState(() => (project ? draftFrom(project) : emptyDraft()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [jumpsNote, setJumpsNote] = useState(null);
  const latestRows = useRef(draft.rows);
  latestRows.current = draft.rows;
  const check = useMemo(() => checkDraft(draft, reach), [draft, reach]);
  const rows = (fn) => setDraft((d) => ({ ...d, rows: fn(d.rows) }));

  async function computeJumps() {
    setJumpsNote({ cours: true });
    const asked = draft.rows;
    try {
      const { steps } = await expansionApi.jumps(asked.map((r) => r.name.trim()));
      const { rows: filled, missing } = applyJumps(asked, steps);
      // Lignes du dernier rendu (pas l'updater de setDraft : React peut le différer après un await)
      if (latestRows.current !== asked) return setJumpsNote({ text: 'La route a changé pendant le calcul : relance-le.' });
      setDraft((d) => (d.rows === asked ? { ...d, rows: filled } : d));
      setJumpsNote({ text: missing ?`${missing} saut${missing > 1 ? 's' : ''} inconnu${missing > 1 ? 's' : ''} : tu n'es pas encore passé dans l'un des deux systèmes. Tape la distance (carte de la galaxie, Inara…).` : 'Tous les sauts sont calculés d’après tes journaux.' });
    } catch (err) {
      setJumpsNote({ text: `Calcul impossible : ${err.message}` });
    }
  }

  async function save(e) {
    e.preventDefault();
    if (check.errors.length) return;
    setSaving(true);
    setError(null);
    try {
      const saved = project ? await expansionApi.update(project.id, payload(draft)) : await expansionApi.create(payload(draft));
      onSaved(saved);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <section className="panel">
      <form className="form" onSubmit={save}>
        <h2>{project ? `Modifier « ${project.name} »` : 'Nouvelle route d’extension'}</h2>
        <label data-tuto="extension-route-nom">
          Nom de la route
          <input value={draft.name} maxLength={120} placeholder="Vers Système Test" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </label>
        <label>
          Description <span className="small muted">(facultatif)</span>
          <input value={draft.description} maxLength={2000} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        </label>
        <p className="small muted">
          Du départ (un système déjà tenu par ta puissance) à l’arrivée, dans l’ordre. Le saut de chaque système se compte
          depuis celui juste au-dessus : {reach ? `${reach.fortified} AL au plus depuis un Consolidé, ${reach.stronghold} AL depuis une Forteresse` : 'portée en cours de lecture'}.
          Le nom doit être celui du jeu (tu peux le copier depuis la carte de la galaxie) ; la casse ne compte pas.
        </p>
        <div className="table-wrap" data-tuto="extension-route-systemes">
          <table className="table">
            <thead><tr><th>#</th><th>Système</th><th>Objectif</th><th>Saut (AL)</th><th /></tr></thead>
            <tbody>
              {draft.rows.map((r, i) => {
                const c = check.rows[i];
                return (
                  <tr key={r.key}>
                    <td className="num">{i}</td>
                    <td>
                      <input value={r.name} maxLength={120} aria-label={rowLabel(i)} placeholder={i === 0 ? 'Départ' : 'Système'} onChange={(e) => rows((rs) => setRow(rs, i, { name: e.target.value }))} />
                      {c?.error && <div className="small bad">{c.error}</div>}
                      {!c?.error && c?.warn && <div className="small warn">{c.warn}</div>}
                    </td>
                    <td>
                      <select data-tuto="extension-route-objectif" value={r.role} aria-label={`Objectif : ${rowLabel(i)}`} onChange={(e) => rows((rs) => setRow(rs, i, { role: e.target.value }))}>
                        {ROLE_OPTIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                      </select>
                    </td>
                    <td>
                      {i === 0
                        ? <span className="muted">départ</span>
                        : <input className="input-small num" inputMode="decimal" value={r.jump} aria-label={`Saut vers le système n° ${i}, en AL`} placeholder="ex. 18,4" onChange={(e) => rows((rs) => setRow(rs, i, { jump: e.target.value }))} />}
                    </td>
                    <td>
                      <div className="form-actions">
                        <button type="button" className="btn btn-ghost small" title="Monter" aria-label="Monter" disabled={i === 0} onClick={() => rows((rs) => moveRow(rs, i, -1))}>↑</button>
                        <button type="button" className="btn btn-ghost small" title="Descendre" aria-label="Descendre" disabled={i === draft.rows.length - 1} onClick={() => rows((rs) => moveRow(rs, i, 1))}>↓</button>
                        <button type="button" className="btn btn-ghost small" title="Retirer ce système" aria-label="Retirer ce système" disabled={draft.rows.length <= 2} onClick={() => rows((rs) => removeRow(rs, i))}>✕</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="form-actions" data-tuto="extension-route-sauts">
          <button type="button" className="btn btn-ghost small" disabled={draft.rows.length >= MAX_STEPS} onClick={() => rows(addRow)}>+ Ajouter un système</button>
          <button type="button" className="btn btn-ghost small" disabled={jumpsNote?.cours} onClick={computeJumps}
            title="Distance entre deux systèmes où tu es déjà passé, d'après les positions écrites dans tes journaux">
            Calculer les sauts depuis mes journaux
          </button>
          {jumpsNote?.text && <span className="small muted">{jumpsNote.text}</span>}
        </div>
        <p className="small muted">
          {int(draft.rows.length)} systèmes · {dec2(check.distance)} AL en tout · saut le plus long {dec2(check.longest)} AL
        </p>
        {check.errors.length > 0 && (
          <ul className="small bad">
            {check.errors.map((m) => <li key={m}>{m}</li>)}
          </ul>
        )}
        {project && (
          <p className="small muted">
            Tes mérites, les relevés du jeu et les paliers marqués atteints sont rattachés au nom de chaque système : ils
            restent après la modification. Si ton escadron suit cette route, renvoie-la ensuite à son serveur (page Escadron,
            « Mettre à jour la route sur le serveur »).
          </p>
        )}
        {error && <p className="small bad">{error}</p>}
        <div className="form-actions" data-tuto="extension-route-enregistrer">
          <button type="submit" className="btn btn-primary" disabled={saving || check.errors.length > 0}>{saving ? 'Enregistrement…' : 'Enregistrer la route'}</button>
          <button type="button" className="btn btn-ghost" disabled={saving} onClick={onCancel}>Annuler</button>
        </div>
      </form>
    </section>
  );
}
