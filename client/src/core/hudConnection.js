// Fenêtres de l'overlay (/hud/…) : quand la connexion à l'app est perdue (serveur arrêté ou planté, fenêtre « EliteApp
// serveur » fermée), la fenêtre le DIT au lieu de garder des valeurs figées présentées comme en direct (« Couvert ✓ »,
// « tout compte », boussole…). Au bout de 10 s sans connexion au flux temps réel (coupure, ou aucun message depuis 15 s,
// STALE_MS de streamSource.js) : contenu grisé et bandeau « Connexion à l'app perdue : valeurs figées ». L'overlay, de son côté,
// cache ses fenêtres au bout de 30 s sans réponse de l'app et s'arrête au bout de 5 min (overlay/guards.js, watchApp).
// En JavaScript simple (sans JSX) : testé par node --test (hudConnection.test.js) et dans Chrome (étape 75-pages).

import { Fragment, createElement as h, useEffect, useState } from 'react';
import { useConnected } from './stream.js';

export const OFFLINE_MS = 10_000;
export const OFFLINE_TEXT = "Connexion à l'app perdue : valeurs figées";
export const OFFLINE_CLASS = 'hud-offline';

const CSS = `
.hud-offline #root > :not(.hud-offline-banner) { opacity: .35; filter: grayscale(1); }
.hud-offline-banner {
  position: fixed; top: 4px; left: 50%; transform: translateX(-50%); z-index: 1000; pointer-events: none;
  padding: 2px 10px; border-radius: 4px; font: 600 12px 'Segoe UI', system-ui, sans-serif; white-space: nowrap;
  color: #07090c; background: var(--accent); box-shadow: 0 1px 4px rgba(0,0,0,.6);
}`;

/**
 * Minuterie de la coupure : `onChange(true)` au bout de `graceMs` sans connexion, `onChange(false)` dès qu'elle revient.
 * Une reconnexion ordinaire (moins de `graceMs`) ne montre rien. Rend { connected(on), stop() } : connected à chaque
 * changement d'état de la connexion. Rien ne tourne pendant que la connexion tient (pas de rendu chaque seconde).
 */
export function offlineTimer(onChange, { graceMs = OFFLINE_MS, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let timer = null;
  let offline = false;
  const set = (v) => {
    if (v === offline) return;
    offline = v;
    onChange(v);
  };
  return {
    connected(on) {
      clearTimer(timer);
      timer = null;
      if (on) set(false);
      else if (!offline) timer = setTimer(() => set(true), graceMs);
    },
    stop() {
      clearTimer(timer);
      timer = null;
    },
  };
}

function addCss() {
  if (typeof document === 'undefined' || document.getElementById('hud-offline-css')) return;
  const style = document.createElement('style');
  style.id = 'hud-offline-css';
  style.textContent = CSS;
  document.head.appendChild(style);
}

/** Enveloppe d'une fenêtre de l'overlay : son contenu, et le bandeau quand la connexion est perdue. */
export function HudConnection({ children }) {
  const connected = useConnected(); // pas encore connecté au premier rendu : compte comme une coupure
  const [offline, setOffline] = useState(false);
  const [timer] = useState(() => offlineTimer(setOffline));
  useEffect(() => {
    timer.connected(connected);
  }, [connected, timer]);
  useEffect(() => () => timer.stop(), [timer]);
  useEffect(() => {
    addCss();
    document.documentElement.classList.toggle(OFFLINE_CLASS, offline);
  }, [offline]);
  return h(Fragment, null, offline ? h('div', { className: 'hud-offline-banner', role: 'status' }, OFFLINE_TEXT) : null, children);
}
