// Chantiers de colonisation tenus à jour en temps réel (message « colonisation:update » du serveur).

import { useEffect, useState } from 'react';
import { useEvent } from '../../core/stream.js';
import { colApi } from './api.js';

/** Vue d'ensemble : { sites, claims, active, ship }. */
export function useColonisation() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = () => colApi.sites().then((d) => {
    setData(d);
    setError(null);
  }).catch((err) => setError(err.message));
  useEffect(() => {
    load();
  }, []);
  useEvent('colonisation:update', setData);
  return { data, error, reload: load };
}

/** Chantier actif seulement ({ reason, site } ou null), pour les fenêtres de l'overlay. */
export function useActiveSite() {
  const [active, setActive] = useState(undefined); // undefined : pas encore chargé
  useEffect(() => {
    colApi.active().then(setActive).catch(() => setActive(null));
  }, []);
  useEvent('colonisation:update', (d) => setActive(d.active));
  return active;
}
