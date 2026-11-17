// Connexion temps réel (Server-Sent Events) partagée par toute l'application.
//
// Toutes les pages et fenêtres ouvertes dans un même navigateur (les fenêtres de l'overlay partagent une session
// Electron) passent par UNE connexion, tenue par un SharedWorker (streamWorker.js) : chaque page gardant la sienne, six
// fenêtres prenaient les 6 connexions qu'un navigateur garde par adresse, et plus aucune requête ne passait. Sans
// SharedWorker (navigateur qui ne l'a pas, script du worker qui ne se charge pas, worker muet), la page ouvre sa propre
// connexion, comme avant.

import { DEMO } from './demo.js';
import { useEffect, useRef, useState } from 'react';
import { createStreamSource } from './streamSource.js';
import { intervalleVisible } from './visible.js';

const listeners = new Map(); // type → Set(handler)
let transport = null; // { want(type) } : le worker partagé, ou la connexion propre à la page
let connected = false;
const statusListeners = new Set();
const WORKER_MS = 10000; // le worker répond aussitôt qu'il est chargé ; au-delà, la page se connecte seule

function setConnected(v) {
  connected = v;
  for (const fn of statusListeners) fn(v);
}

function dispatch(type, raw) {
  let data = null;
  try {
    data = JSON.parse(raw);
  } catch {
    return;
  }
  for (const fn of listeners.get(type) || []) fn(data);
}

/** Connexion propre à la page (repli). */
function direct() {
  const source = createStreamSource({ onMessage: dispatch, onStatus: setConnected });
  for (const type of listeners.keys()) source.want(type);
  source.start();
  return { want: (type) => source.want(type) };
}

/** Connexion partagée par le SharedWorker, ou null s'il n'y en a pas. */
function shared() {
  if (typeof SharedWorker !== 'function') return null;
  let worker;
  try {
    worker = new SharedWorker(new URL('./streamWorker.js', import.meta.url), { type: 'module', name: 'elite-compagnon-flux' });
  } catch {
    return null;
  }
  const { port } = worker;
  let answered = false;
  let fallen = false;
  const fallback = () => {
    if (fallen) return;
    fallen = true;
    clearTimeout(timer);
    try {
      port.postMessage({ bye: true });
      port.close();
    } catch { /* déjà fermé */ }
    transport = direct();
  };
  const timer = setTimeout(() => answered || fallback(), WORKER_MS);
  worker.addEventListener('error', fallback); // script du worker introuvable ou en erreur
  port.onmessage = ({ data }) => {
    if (fallen || !data || typeof data !== 'object') return;
    if (!answered) {
      answered = true;
      clearTimeout(timer);
    }
    if (Object.hasOwn(data, 'status')) setConnected(Boolean(data.status));
    else if (typeof data.type === 'string') dispatch(data.type, data.data);
  };
  port.start();
  const present = () => port.postMessage({ types: [...listeners.keys()] });
  present();
  // Page fermée : le worker l'oublie ; revenue du cache du navigateur : elle se représente
  addEventListener('pagehide', () => fallen || port.postMessage({ bye: true }));
  addEventListener('pageshow', (e) => e.persisted && !fallen && present());
  return { want: (type) => port.postMessage({ want: type }) };
}

function ensureTransport() {
  if (!transport) transport = shared() || direct();
}

function attach(type) {
  ensureTransport();
  if (listeners.has(type)) return;
  listeners.set(type, new Set());
  transport.want(type);
}

/** Abonnement sans React, pour les tests. */
export function subscribeForTest(type, fn) {
  attach(type);
  listeners.get(type).add(fn);
}

/** Abonnement à un type de message temps réel. */
export function useEvent(type, handler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (DEMO) return undefined; // fenêtre en démonstration : ce qui se passe en jeu ne la change pas (core/demo.js)
    attach(type);
    const fn = (d) => ref.current(d);
    listeners.get(type).add(fn);
    return () => listeners.get(type).delete(fn);
  }, [type]);
}

export function useConnected() {
  const [v, setV] = useState(connected);
  useEffect(() => {
    ensureTransport();
    statusListeners.add(setV);
    setV(connected);
    return () => statusListeners.delete(setV);
  }, []);
  return v;
}

/**
 * Heure courante rafraîchie régulièrement (chronomètres), seulement quand la page est visible (core/visible.js) : une
 * fenêtre cachée ne se redessine pas pour rien, et retrouve l'heure juste en revenant. `intervalMs` null : pas de
 * rafraîchissement (l'heure du dernier dessin).
 */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!intervalMs) return undefined;
    return intervalleVisible(() => setNow(Date.now()), intervalMs);
  }, [intervalMs]);
  return now;
}
