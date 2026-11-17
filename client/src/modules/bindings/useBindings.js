// État de la Garde des commandes, tenu à jour en temps réel, et fermeture de l'alerte.

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../core/api.js';
import { useEvent } from '../../core/stream.js';

const BASE = '/modules/bindings';

export function useBindings() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);

  const reload = useCallback(() => {
    api(`${BASE}/status`).then((s) => {
      setStatus(s);
      setError(null);
    }).catch((err) => setError(err.message));
  }, []);
  useEffect(reload, [reload]);
  useEvent('bindings:update', setStatus);

  /** Ferme l'alerte affichée : where = 'overlay' (fenêtre en jeu) ou 'banner' (bandeau de l'app). */
  async function dismiss(where) {
    if (!status?.alert) return;
    try {
      setStatus(await api(`${BASE}/dismiss`, { method: 'POST', body: { where, id: status.alert.id } }));
    } catch (err) {
      setError(err.message);
    }
  }

  return { status, error, reload, dismiss };
}
