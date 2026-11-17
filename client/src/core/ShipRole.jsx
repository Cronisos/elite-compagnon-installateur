import { useState } from 'react';
import { checkRole, hasRole, MAX_SECONDARY_ROLES, MODES, POLYVALENT, ROLES } from './modes.js';
import { draftOf, roleHelp, roleSummary, saveRole, setPrimary, toggleSecondary } from './shipRole.js';

/**
 * Rôle d'un vaisseau (par ShipID du jeu), modifiable sur place, à côté de son nom (ShipNickname) : un rôle principal au
 * plus (ouvert de lui-même quand tu montes à bord) et des rôles secondaires (proposés quand tu t'y mets).
 * @param summary afficher le résumé du rôle à côté du bouton
 */
export default function ShipRole({ shipId, role, onSaved, summary = true }) {
  // Vaisseau dont l'éditeur est ouvert : un autre shipId (vaisseau changé en jeu, menu ouvert) le referme, au lieu
  // d'enregistrer le brouillon de l'un sur l'autre
  const [editing, setEditing] = useState(null);
  const edit = editing !== null && editing === shipId;
  const setEdit = (on) => setEditing(on ? shipId : null);
  const [draft, setDraft] = useState(() => draftOf(role));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  if (shipId === null || shipId === undefined) return null;

  function open() {
    setDraft(draftOf(role));
    setError(null);
    setEdit(true);
  }

  async function save(e) {
    e.preventDefault();
    const checked = checkRole(draft);
    if (!checked.ok) return setError(checked.error);
    setBusy(true);
    setError(null);
    try {
      const r = await saveRole(shipId, checked.role);
      setEdit(false);
      onSaved?.(r?.role ?? null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
    return undefined;
  }

  if (!edit) {
    return (
      <>
        {summary && <span className={`ship-role small ${hasRole(role) ? '' : 'muted'}`}>{roleSummary(role)}</span>}
        <button type="button" className="btn btn-ghost small" onClick={open} title="Rôle du vaisseau : le mode qui s'ouvre seul quand tu montes à bord, et ceux qui te sont proposés">
          ⚑ Rôle
        </button>
      </>
    );
  }
  const polyvalent = draft.primary === POLYVALENT.id;
  return (
    <form className="ship-role-edit" onSubmit={save}>
      <label className="ship-role-field">
        Rôle principal
        <select value={draft.primary ?? ''} onChange={(e) => setDraft(setPrimary(draft, e.target.value))}>
          <option value="">Aucun : rien ne s’ouvre seul</option>
          {ROLES.map((r) => (
            <option key={r.id} value={r.id}>{r.icon} {r.label}</option>
          ))}
        </select>
      </label>
      <fieldset className="ship-role-secondary" disabled={polyvalent}>
        <legend>Rôles secondaires, {MAX_SECONDARY_ROLES} au plus{polyvalent ? ' (Polyvalent couvre déjà tout)' : ''}</legend>
        {MODES.filter((m) => m.id !== draft.primary).map((m) => {
          const on = draft.secondary.includes(m.id);
          return (
            <label key={m.id} className="check">
              <input type="checkbox" checked={on} disabled={!on && draft.secondary.length >= MAX_SECONDARY_ROLES} onChange={() => setDraft(toggleSecondary(draft, m.id))} />
              {m.icon} {m.label}
            </label>
          );
        })}
      </fieldset>
      <p className="tiny muted">{roleHelp(draft)}</p>
      <div className="form-actions">
        <button className="btn small btn-primary" disabled={busy}>Enregistrer le rôle</button>
        <button type="button" className="btn btn-ghost small" onClick={() => setEdit(false)}>Annuler</button>
      </div>
      {error && <p className="small bad">{error}</p>}
    </form>
  );
}
