import { useEffect, useState } from 'react';
import { api } from '../../../core/api.js';
import { useEvent } from '../../../core/stream.js';
import { questionRetiree } from '../questionsVue.js';

/**
 * Questions de la route active, en pop-up par-dessus toute l'application :
 * « Tu as changé de station, c'est normal ? », « Nouvelle marchandise principale ? ».
 * La réponse met la route à jour sans devoir la recréer.
 */
export default function RouteQuestions() {
  const [questions, setQuestions] = useState([]);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api('/modules/routes/questions').then(setQuestions).catch(() => {});
  }, []);

  useEvent('routes:question', (q) => {
    setQuestions((list) => [...list.filter((x) => !(x.type === q.type && x.legIndex === q.legIndex)), q]);
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(q.title, { body: q.text });
      } catch {
        // notifications indisponibles
      }
    }
  });
  useEvent('routes:question-closed', ({ id }) => setQuestions((list) => list.filter((x) => x.id !== id)));

  // Message d'erreur effacé de lui-même après un moment (il reste fermable avant, par ✕)
  useEffect(() => {
    if (!error) return undefined;
    const t = setTimeout(() => setError(null), 8000);
    return () => clearTimeout(t);
  }, [error]);

  async function answer(q, yes) {
    setBusy(q.id);
    setError(null);
    let echec = null;
    try {
      await api(`/modules/routes/questions/${q.id}`, { method: 'POST', body: { yes } });
    } catch (err) {
      echec = err;
      setError(err.message);
    } finally {
      // Retirée si prise, ou déjà traitée dans une autre fenêtre ; gardée sinon, pour réessayer (questionsVue.js)
      if (questionRetiree(echec)) setQuestions((list) => list.filter((x) => x.id !== q.id));
      setBusy(null);
    }
  }

  if (!questions.length && !error) return null;
  return (
    <div className="route-questions" role="dialog" aria-live="polite">
      {error && (
        <div className="alert alert-danger">
          {error}{' '}
          <button className="btn btn-ghost small" onClick={() => setError(null)} aria-label="Fermer le message" title="Fermer">✕</button>
        </div>
      )}
      {questions.map((q) => (
        <div key={q.id} className="route-question">
          <strong>{q.title}</strong>
          <p>{q.text}</p>
          <div className="form-actions">
            <button className="btn" disabled={busy === q.id} onClick={() => answer(q, true)}>{q.yes}</button>
            <button className="btn btn-ghost" disabled={busy === q.id} onClick={() => answer(q, false)}>{q.no}</button>
          </div>
        </div>
      ))}
    </div>
  );
}
