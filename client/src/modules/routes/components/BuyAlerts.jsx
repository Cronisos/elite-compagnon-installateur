import { useEffect, useState } from 'react';
import { useEvent } from '../../../core/stream.js';
import { time } from '../../../core/format.js';

/**
 * Alertes d'achat, affichées par-dessus toute l'application dès qu'un achat est fait en jeu.
 * Rouge : mauvais achat (son + notification Windows) ; orange : à vérifier ; vert : rentable.
 */

let audioCtx = null;
/** Trois bips d'alarme (Web Audio, aucun fichier son). */
function alarm() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = audioCtx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'square';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, t0 + i * 0.28);
      gain.gain.exponentialRampToValueAtTime(0.18, t0 + i * 0.28 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.28 + 0.2);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0 + i * 0.28);
      osc.stop(t0 + i * 0.28 + 0.22);
    }
  } catch {
    // son indisponible : l'alerte visuelle suffit
  }
}

function notify(a) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(a.title, { body: [a.text, a.advice].filter(Boolean).join('\n'), requireInteraction: true });
  } catch {
    // notifications indisponibles
  }
}

const AUTO_CLOSE_MS = { ok: 8000, warning: 60000 };

export default function BuyAlerts() {
  const [alerts, setAlerts] = useState([]);

  useEvent('routes:buy-check', (a) => {
    const item = { ...a, key: `${a.at}-${a.commodity}-${Math.random()}` };
    setAlerts((list) => [item, ...list].slice(0, 6));
    if (a.level === 'danger') {
      alarm();
      notify(a);
    }
    const ms = AUTO_CLOSE_MS[a.level];
    if (ms) setTimeout(() => dismiss(item.key), ms);
  });

  // Débloque le son dès le premier clic (règle des navigateurs)
  useEffect(() => {
    const unlock = () => {
      try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        audioCtx.resume();
      } catch {
        // ignoré
      }
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  const dismiss = (key) => setAlerts((list) => list.filter((x) => x.key !== key));

  if (!alerts.length) return null;
  return (
    <div className="buy-alerts" role="alert">
      {alerts.map((a) => (
        <div key={a.key} className={`buy-alert buy-alert-${a.level}`}>
          <div className="buy-alert-head">
            <strong>
              {a.level === 'danger' ? '⚠ ' : a.level === 'ok' ? '✓ ' : ''}
              {a.title}
            </strong>
            <span className="muted small">
              {a.test ? 'revérification · ' : ''}
              {time(a.at)}
            </span>
          </div>
          <div>{a.text}</div>
          {a.advice && <div className="buy-alert-advice">{a.advice}</div>}
          <button className="btn btn-ghost buy-alert-close" onClick={() => dismiss(a.key)} aria-label="Fermer">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

/** Bouton pour autoriser les notifications Windows (visibles même quand le navigateur est caché). */
export function NotificationToggle() {
  const supported = typeof window !== 'undefined' && 'Notification' in window;
  const [perm, setPerm] = useState(supported ? Notification.permission : 'denied');
  if (!supported || perm === 'granted') return null;
  if (perm === 'denied') return <span className="muted small">Notifications Windows bloquées par le navigateur</span>;
  return (
    <button className="btn" onClick={() => Notification.requestPermission().then(setPerm)}>
      Activer les alertes Windows
    </button>
  );
}
