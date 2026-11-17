// Session de minage en vaisseau en temps réel, et son contenu dans le HUD.

import { useLiveSession } from '../../core/hud.jsx';
import { compact, int } from '../../core/format.js';

export const VERDICT = {
  good: { color: '#5fd38d', label: 'bon' },
  fair: { color: '#ffd24a', label: 'moyen' },
  poor: { color: '#ff6b6b', label: 'à laisser' },
};

export function useShipMining() {
  return useLiveSession('/modules/shipmining', 'shipmining:update');
}

/** Détail d'un astéroïde : minerais, filon mère, déjà miné. */
export function ProspectLine({ p }) {
  return (
    <>
      {p.materials.map((m, i) => (
        <span key={m.name} style={i === 0 ? { color: VERDICT[p.verdict].color, fontWeight: 600 } : undefined}>
          {m.name} {Math.round(m.proportion)} %{m.value != null ? ` (${compact(m.value)})` : ''}
        </span>
      ))}
      {p.motherlode && <b style={{ color: 'var(--accent)' }}>filon mère : {p.motherlode}</b>}
      {p.remaining != null && p.remaining < 100 && <span>déjà miné ({Math.round(p.remaining)} % restant)</span>}
    </>
  );
}

/** Props du HUD : soute, raffinage, et le dernier astéroïde prospecté en évidence. */
export function shipMiningHud({ data, seconds, chrono, resetTime, pause, togglePause }) {
  if (!data) return null;
  const { hold, last } = data;
  const left = hold?.capacity != null && hold?.count != null ? hold.capacity - hold.count : null;
  return {
    title: '☄ Minage vaisseau',
    seconds: chrono ?? seconds, // chrono affiché : depuis le dernier ↺ (les taux gardent toute la session)
    pause,
    onPause: togglePause,
    onResetTime: resetTime,
    tag: 'Astéroïde',
    cells: [
      { label: 'Soute', value: hold?.count != null ? `${int(hold.count)} t` : '—', color: '#6fd3ff', sub: `${left != null ? `reste ${int(left)} t · ` : ''}${int(hold?.drones)} drones` },
      { label: 'Raffinés', value: `${int(data.totalRefined)} t`, color: '#5fd38d', sub: data.perHour != null ? `${int(data.perHour)} t/h` : '' },
      {
        label: 'Dernier astéroïde',
        // Valeur estimée par tonne collectée (teneur × prix), ou la teneur sans prix connu
        value: !last ? '—' : last.value != null ? compact(last.value) : `${Math.round(last.best)} %`,
        color: last ? VERDICT[last.verdict].color : '#8a94a0',
        sub: last ? `${last.value != null ? 'cr/t · ' : ''}${VERDICT[last.verdict].label}` : 'lance un prospecteur',
      },
    ],
    last: last ? <ProspectLine p={last} /> : <span>aucun astéroïde prospecté pendant cette session</span>,
  };
}
