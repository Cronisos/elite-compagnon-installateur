import { useState } from 'react';
import { Link } from 'react-router';
import { engApi } from '../api.js';
import { validationText } from '../routeView.js';

/**
 * Bloc « Valider ce plan » de la page du plan. Valider (ou revalider) calcule une fois l'itinéraire depuis ta position
 * (POST /plans/:id/validation) ; annuler ne calcule rien. Aucune confirmation : tout est réversible.
 * @param {{ planId, validation, calc, onChanged }} props validation : GET /plans/:id → validation
 */
export default function ValidationBlock({ planId, validation, calc, onChanged }) {
  const [route, setRoute] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Réponse du dernier clic : montrée tant que la validation est celle de ce clic et que le plan n'a pas changé
  const shown = route && validation && !validation.stale && route.at === validation.at ? route : null;
  const v = validationText(validation, { calc, route: shown });

  async function act(label) {
    setBusy(true);
    setError('');
    try {
      if (label === 'Annuler la validation') {
        await engApi.unvalidatePlan(planId);
        setRoute(null);
      } else {
        const r = await engApi.validatePlan(planId);
        setRoute(r.route ? { ...r.route, at: r.at } : null);
      }
      await onChanged?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-tuto="ingenierie-plan-valider" className="validation-block">
      {v.lines.map((l, i) => <p key={i} className={`small ${l.tone || ''}`}>{l.text}</p>)}
      {v.changes.length > 0 && (
        <ul className="notes small">
          {v.changes.map((c, i) => <li key={i}>{c}</li>)}
        </ul>
      )}
      {v.after && <p className="small">{v.after}</p>}
      {(v.notes || []).map((n, i) => <p key={`n${i}`} className={`small ${n.tone || ''}`}>{n.text}</p>)}
      <div className="form-actions">
        {v.buttons.map((b) => (
          <button key={b} type="button" className={`btn ${b === 'Annuler la validation' ? 'btn-ghost' : ''}`} disabled={busy} onClick={() => act(b)}>{b}</button>
        ))}
        {v.link && <Link className="btn btn-ghost" to="/ingenierie/itineraire">Voir l’itinéraire →</Link>}
      </div>
      {error && <p className="bad small">{error}</p>}
    </div>
  );
}
