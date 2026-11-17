import { useEffect, useRef, useState } from 'react';
import { engApi } from '../api.js';
import RuleBadge from './RuleBadge.jsx';
import { CHOICES, PIN_HELP, PIN_LOCKED, PIN_TITLE, canRevert, deducedActions, deducedText, formInitial, noticeText, pinBody, pinOptions, retainedText } from '../pinView.js';

/**
 * Épingle d'un ingénieur (page de l'ingénieur) : celle que tes journaux montrent (déduite, avec sa date), ce que tu en
 * dis (« J'ai épinglé : … », « Aucun », « Je ne sais pas »), celle que l'itinéraire retient, et l'avis quand tes
 * journaux contredisent ta saisie. Un seul plan épinglé par ingénieur (R2a).
 * @param {{ engineer: object, rule: object|null, onSaved: Function }} props engineer : GET /engineers/:id ; rule : R2a
 */
export default function PinEditor({ engineer, rule, onSaved }) {
  const ps = engineer.pin;
  const init = formInitial(ps);
  const [choice, setChoice] = useState(init.choice);
  const [value, setValue] = useState(init.value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const formRef = useRef(null);
  // Nouvel état du serveur (enregistrement, nouvelle application à distance) : le formulaire le reprend
  const key = JSON.stringify([ps?.saisie, ps?.deduced?.at]);
  useEffect(() => {
    const i = formInitial(ps);
    setChoice(i.choice);
    setValue(i.value);
  }, [key]);

  const locked = !!ps?.locked;
  const groups = pinOptions(engineer.offers);
  const notice = noticeText(ps, { name: engineer.name });

  async function send(fn) {
    setBusy(true);
    setError('');
    try {
      await fn();
      await onSaved?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const save = (body) => send(() => engApi.setPin(engineer.id, body));
  const body = pinBody(choice, value);

  return (
    <section data-tuto="ingenierie-fiche-epingle" className="panel">
      <h2>
        {PIN_TITLE} {rule && <RuleBadge status={rule.status} source={rule.source} why={rule.why} />}
      </h2>
      {ps?.deduced && (
        <div className="small">
          <p>{deducedText(ps.deduced)}</p>
          <div className="form-actions">
            {deducedActions(ps).map((a) => (
              <button key={a.label} type="button" className="btn small" disabled={busy || locked} onClick={() => save(a.body)}>{a.label}</button>
            ))}
          </div>
        </div>
      )}
      {notice && (
        <div className={`small ${notice.tone === 'warn' ? 'warn' : 'accent'}`}>
          <p>{notice.text}</p>
          {notice.buttons.length > 0 && (
            <div className="form-actions">
              <button type="button" className="btn small" disabled={busy || locked} onClick={() => save(deducedActions(ps)[0].body)}>{notice.buttons[0]}</button>
              <button type="button" className="btn small btn-ghost" onClick={() => formRef.current?.querySelector('input')?.focus()}>{notice.buttons[1]}</button>
            </div>
          )}
        </div>
      )}
      <form
        ref={formRef}
        className="form pin-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (body) save(body);
        }}
      >
        <fieldset disabled={busy || locked}>
          <legend className="small muted">Ce que tu dis</legend>
          <label className="check">
            <input type="radio" name="pin" checked={choice === 'pinned'} onChange={() => setChoice('pinned')} /> {CHOICES.pinned}
            <select value={value} onChange={(e) => { setValue(e.target.value); setChoice('pinned'); }} aria-label="Plan épinglé">
              <option value="">Choisir un plan…</option>
              {groups.map((g) => (
                <optgroup key={g.grp} label={g.label}>
                  {g.options.map((o) => <option key={o.value} value={o.value}>{o.text}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="check">
            <input type="radio" name="pin" checked={choice === 'none'} onChange={() => setChoice('none')} /> {CHOICES.none}
          </label>
          <label className="check">
            <input type="radio" name="pin" checked={choice === 'unknown'} onChange={() => setChoice('unknown')} /> {CHOICES.unknown}
          </label>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={!body}>Enregistrer</button>
            {canRevert(ps) && <button type="button" className="btn btn-ghost" onClick={() => send(() => engApi.clearPin(engineer.id))}>Revenir à la déduction</button>}
          </div>
        </fieldset>
        {locked && <p className="small muted">{PIN_LOCKED}</p>}
      </form>
      {retainedText(ps, { name: engineer.name, rank: engineer.state?.rank ?? null }).map((l, i) => <p key={i} className={`small ${i ? 'muted' : ''}`}>{l}</p>)}
      {error && <p className="bad small">{error}</p>}
      <p className="small muted">{PIN_HELP}</p>
    </section>
  );
}
