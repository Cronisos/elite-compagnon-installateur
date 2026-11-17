// Session de combat au sol en temps réel, et son contenu dans le HUD (overlay).

import { perHour, useLiveSession } from '../../core/hud.jsx';
import { compact, cr, int, time } from '../../core/format.js';

export function useGroundCombat() {
  const session = useLiveSession('/modules/groundcombat', 'groundcombat:update');
  const { data, seconds } = session;
  return {
    ...session,
    creditsHour: data && perHour(data.gains, seconds),
    meritsHour: data && perHour(data.merites, seconds),
  };
}

/** Guerre du système en une ligne : « Guerre : A 2 – 1 B ». */
export const ligneGuerre = (g) => `${g.type} : ${g.a.nom} ${g.a.jours} – ${g.b.jours} ${g.b.nom}`;

/** Props du HUD : kills, obligations et primes, mérites ; en bas, le dernier kill ou la guerre du système. */
export function groundCombatHud({ data, seconds, chrono, resetTime, creditsHour, meritsHour, pause, togglePause }) {
  if (!data) return null;
  const dernier = data.recent[0];
  const guerre = data.guerres?.[0];
  return {
    title: '🪖 Combat au sol',
    seconds: chrono ?? seconds,
    pause,
    onPause: togglePause,
    onResetTime: resetTime,
    cells: [
      { label: 'Kills', value: int(data.kills), color: '#ff6b6b', centerValue: true, sub: [data.killsHeure != null && `${int(data.killsHeure)}/h`, data.morts > 0 && `${int(data.morts)} mort${data.morts > 1 ? 's' : ''}`].filter(Boolean).join(' · ') },
      { label: 'Gains', value: compact(data.gains), color: '#5fd38d', centerValue: true, sub: [data.primes.n > 0 && `dont ${compact(data.primes.total)} de primes`, creditsHour != null && `${compact(creditsHour)}/h`].filter(Boolean).join(' · ') },
      { label: 'Mérites', value: int(data.merites), color: '#ffd24a', centerValue: true, sub: meritsHour != null ? `${int(meritsHour)}/h` : '' },
    ],
    ...(dernier ? {} : { tag: guerre ? 'Système' : 'Dernier' }),
    last: dernier ? (
      <>
        <b>{dernier.victime || 'ennemi'}</b>
        <span>{time(dernier.at)}</span>
        {dernier.reward > 0 && <span className="hud-gain">+{cr(dernier.reward)}</span>}
      </>
    ) : guerre ? <b>{ligneGuerre(guerre)}</b> : <span>{data.aPied ? 'aucun kill pour l’instant' : 'pas à pied'}</span>,
  };
}
