// Session de récupération de matériaux en temps réel, et son contenu dans le HUD.

import { useLiveSession } from '../../core/hud.jsx';
import { int } from '../../core/format.js';

export const GRADE_COLORS = ['#f4f6f8', '#5fd38d', '#6fd3ff', '#d3a6ff', 'var(--accent)'];

export function useMaterials() {
  return useLiveSession('/modules/materials', 'materials:update');
}

/** Props du HUD : récupérés par catégorie, puis par grade et le dernier sur la ligne du bas. */
export function materialsHud({ data, seconds, chrono, resetTime, pause, togglePause }) {
  if (!data) return null;
  const last = data.recent[0];
  return {
    title: '◈ Matériaux',
    seconds: chrono ?? seconds, // chrono affiché : depuis le dernier ↺ (les taux gardent toute la session)
    pause,
    onPause: togglePause,
    onResetTime: resetTime,
    cells: [
      { label: 'Bruts', value: int(data.byCategory.Raw), color: 'var(--accent)', sub: '' },
      { label: 'Manufacturés', value: int(data.byCategory.Manufactured), color: '#6fd3ff', sub: '' },
      { label: 'Encodés', value: int(data.byCategory.Encoded), color: '#d3a6ff', sub: '' },
    ],
    last: (
      <>
        {data.byGrade.map((count, i) => (
          <span key={i} style={{ color: GRADE_COLORS[i] }}>G{i + 1} {int(count)}</span>
        ))}
        {last && <span className="hud-gain">{last.label}{last.grade ? ` G${last.grade}` : ''} ×{int(last.count)}</span>}
      </>
    ),
  };
}
