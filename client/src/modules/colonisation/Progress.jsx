import { pct } from '../../core/format.js';

/** Barre d'avancement d'un chantier (verte une fois terminé). */
export default function Progress({ value, done }) {
  const w = Math.max(0, Math.min(100, (value || 0) * 100));
  return (
    <div className="progress small-progress" title={pct(value)}>
      <div className={`progress-bar ${done ? 'bar-good' : ''}`} style={{ width: `${w}%` }} />
    </div>
  );
}
