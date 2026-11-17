// État du compagnon tenu à jour en temps réel : réglages, pack d'avatar, humeur, et la bulle en cours.

import { useEffect, useRef, useState } from 'react';
import { api } from '../../core/api.js';
import { useEvent } from '../../core/stream.js';
import { MOOD_HOLD_MS, bubbleMs, remainingMs } from './bubble.js';

export const base = '/modules/compagnon';

/**
 * @returns {{ state, line, pack, mood, name, show }}
 *   state : { settings, pack, baseMood, last } du serveur ;
 *   line : phrase affichée { text, mood, name, pack, alert, id, visible } ou null ;
 *   pack : avatar à montrer (celui d'un aperçu s'il en a un autre) ; mood : humeur à montrer.
 */
export function useCompanion() {
  const [state, setState] = useState(null);
  const [line, setLine] = useState(null);
  const [otherPacks, setOtherPacks] = useState({}); // aperçu avec un autre pack que celui choisi
  const timers = useRef([]);
  const current = useRef(null);

  function show(l, ms = bubbleMs(l.text)) {
    if (!l?.text || current.current === l.id) return;
    current.current = l.id;
    for (const t of timers.current) clearTimeout(t);
    setLine({ ...l, visible: true });
    timers.current = [
      setTimeout(() => setLine((c) => (c?.id === l.id ? { ...c, visible: false } : c)), ms),
      setTimeout(() => setLine((c) => (c?.id === l.id ? null : c)), ms + MOOD_HOLD_MS),
    ];
  }

  useEffect(() => {
    api(`${base}/state`).then((s) => {
      setState(s);
      // Fenêtre ouverte juste après une phrase (bonjour au lancement) : elle la montre encore
      const left = remainingMs(s.last);
      if (left > 0) show(s.last, left);
    }).catch(() => {});
    return () => timers.current.forEach(clearTimeout);
  }, []);
  useEvent('compagnon:say', (l) => show(l, l.ms || undefined)); // phrase d'un autre module : sa propre durée
  useEvent('compagnon:mood', ({ mood }) => setState((s) => (s ? { ...s, baseMood: mood } : s)));
  useEvent('compagnon:settings', setState);

  const wanted = line?.pack && state && line.pack !== state.pack.id ? line.pack : null;
  useEffect(() => {
    if (!wanted || otherPacks[wanted]) return;
    api(`${base}/packs/${encodeURIComponent(wanted)}`).then((info) => setOtherPacks((p) => ({ ...p, [wanted]: info }))).catch(() => {});
  }, [wanted]);

  const pack = (wanted && otherPacks[wanted]) || state?.pack || null;
  const mood = line?.mood || state?.baseMood || 'neutre';
  const name = line?.name || state?.settings?.name || 'Copilote';
  return { state, line, pack, mood, name, show };
}
