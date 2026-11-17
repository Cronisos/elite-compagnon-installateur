// Session de sauvetage en temps réel, et son contenu dans le HUD (mini-fenêtre et overlay).

import { perHour, useLiveSession } from '../../core/hud.jsx';
import { compact, cr, int, time } from '../../core/format.js';
import MateriauxGrades from './MateriauxGrades.jsx';

export function useRescue() {
  const session = useLiveSession('/modules/rescue', 'rescue:update');
  const { data, seconds } = session;
  return {
    ...session,
    creditsHour: data && perHour(data.credits, seconds),
    meritsHour: data && perHour(data.merits, seconds),
  };
}

// Libellés courts du HUD et couleurs, par type récupéré
const TYPE_CELLS = { pods: ['Nacelles', '#6fd3ff'], blackBoxes: ['Boîtes noires', '#d3a6ff'], wreckage: ['Débris', 'var(--accent)'] };

/** Props du HUD : récupérés par type, récompenses, mérites, la dernière action, et les matériaux par grade en bas. */
export function rescueHud({ data, seconds, chrono, resetTime, creditsHour, meritsHour, pause, togglePause }) {
  if (!data) return null;
  const last = data.recent[0];
  return {
    title: '✚ Sauvetage',
    seconds: chrono ?? seconds, // chrono affiché : depuis le dernier ↺ (les taux gardent toute la session)
    pause,
    onPause: togglePause,
    onResetTime: resetTime,
    dense: true,
    columns: 'auto repeat(5, 1fr)',
    cells: [
      ...(data.types || []).map((t) => ({
        label: TYPE_CELLS[t.key]?.[0] || t.label,
        value: int(t.collected),
        color: TYPE_CELLS[t.key]?.[1] || '#6fd3ff',
        sub: `${int(t.hold)} en soute`,
      })),
      { label: 'Récompenses', value: compact(data.credits), color: '#5fd38d', sub: creditsHour != null ? `${compact(creditsHour)}/h` : '' },
      { label: 'Mérites', value: int(data.merits), color: '#ffd24a', sub: meritsHour != null ? `${int(meritsHour)}/h` : '' },
    ],
    last: last ? (
      <>
        <b>{last.kind} : {last.count > 1 ? `${int(last.count)} × ` : ''}{last.label}</b>
        <span>{time(last.at)}</span>
        {(last.reward > 0 || last.merits > 0) && (
          <span className="hud-gain">{last.reward > 0 && `+${cr(last.reward)}`}{last.merits > 0 && ` (${int(last.merits)} mérites)`}</span>
        )}
      </>
    ) : <span>aucun sauvetage pour l'instant</span>,
    extra: <MateriauxGrades materiaux={data.materials} />,
  };
}
