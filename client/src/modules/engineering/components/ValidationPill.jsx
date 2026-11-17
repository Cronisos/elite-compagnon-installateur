import { validationPill } from '../routeView.js';

/** Pastille d'un plan validé (Dashboard, Mes vaisseaux) : « validé », ou « validé · modifié depuis » ; rien sinon. */
export default function ValidationPill({ v }) {
  const p = validationPill(v);
  return p ? <span className={p.className}>{p.label}</span> : null;
}
