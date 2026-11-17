import { useState } from 'react';
import { api } from './api.js';

/** Nom affiché d'un vaisseau : le nom donné dans l'app, sinon le nom en jeu, sinon le modèle. */
export function shipTitle(s) {
  return s.nickname || s.name || s.model || s.ship || '';
}

/**
 * Nom donné par le joueur à un vaisseau (par ShipID du jeu), modifiable sur place.
 * Deux vaisseaux du même modèle gardent chacun leur nom.
 */
export default function ShipNickname({ shipId, nickname, onSaved }) {
  const [edit, setEdit] = useState(false);
  const [value, setValue] = useState(nickname || '');
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/ships/${shipId}/nickname`, { method: 'PUT', body: { nickname: value } });
      setEdit(false);
      onSaved?.(value.trim() || null);
    } finally {
      setBusy(false);
    }
  }

  if (!edit) {
    return (
      <button type="button" className="btn btn-ghost small" onClick={() => setEdit(true)} title="Donner un nom à ce vaisseau dans l'app">
        ✎ {nickname ? 'Renommer' : 'Nommer'}
      </button>
    );
  }
  return (
    <form className="glance-inline" onSubmit={save}>
      <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="ex. Cutter commerce" maxLength={60} />
      <button className="btn small" disabled={busy}>OK</button>
      <button type="button" className="btn btn-ghost small" onClick={() => setEdit(false)}>Annuler</button>
    </form>
  );
}
