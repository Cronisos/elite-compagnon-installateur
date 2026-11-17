// État du jeu (solde, position, vaisseau…) tenu à jour en temps réel.

import { useEffect, useState } from 'react';
import { api } from './api.js';
import { useEvent } from './stream.js';

export function useGameState() {
  const [game, setGame] = useState(null);
  const [journal, setJournal] = useState(null);

  const load = () =>
    api('/state')
      .then((d) => {
        setGame(d.game);
        setJournal(d.journal);
      })
      .catch(() => {});

  useEffect(() => {
    load();
  }, []);
  useEvent('state', setGame);
  useEvent('journal:ready', () => load());
  useEvent('journal:switch', () => load());
  // Dossier des journaux changé : la relecture commence (journal.ready faux) ; journal:ready suivra
  useEvent('settings', () => load());

  return { game, journal };
}
