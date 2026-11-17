// « SCO prêt » dans la fenêtre du Refroidissement FSD : où en est le compte à rebours de l'overdrive, et ses cases du HUD.
// Le serveur donne l'heure de la coupure et l'heure prévue du retour (server/src/modules/fsdcool/sco.js).

import { clock } from '../../core/format.js';

export const SCO_SOURCES = { measured: 'mesurée', default: "d'après SCO-Cooldown", unknown: 'vaisseau inconnu' };
export const SCO_GENERATIONS = { legacy: 'ancien vaisseau', newGeneration: 'nouvelle génération', caspian: 'Caspian Explorer', unknown: 'vaisseau inconnu' };

/**
 * Phase du SCO à l'instant now (ms) : null s'il n'y a rien à montrer (SCO actif, hors supercruise, signal passé),
 * sinon { phase: 'cooldown' | 'ready', leftS, durationS, source, generation, shipName, measured }.
 */
export function scoPhase(sco, now) {
  const c = sco?.countdown;
  if (!c || sco.active || !sco.supercruise) return null;
  const ready = Date.parse(c.readyAt);
  if (!Number.isFinite(ready)) return null;
  const base = { durationS: (c.durationMs ?? 0) / 1000, source: c.source, generation: c.generation, shipName: c.shipName ?? null, measured: c.measured ?? 0 };
  if (now < ready) return { phase: 'cooldown', leftS: (ready - now) / 1000, ...base };
  if (now < ready + (sco.signalMs ?? 0)) return { phase: 'ready', leftS: 0, ...base };
  return null;
}

/** Case principale : compte à rebours, puis « PRÊT » en vert (la case change de clé : elle flashe une fois). */
export function scoCell(p, label = 'Prêt dans') {
  if (p.phase === 'ready') return { label: 'SCO', value: 'PRÊT', big: true, color: '#5fd38d', sub: '' };
  return { label, value: clock(Math.ceil(p.leftS)), big: true, still: true, color: p.leftS > 3 ? '#ff9a3c' : '#5fd38d', sub: '' };
}

/** Case de la durée du compte à rebours et de son origine (valeur de départ ou mesurée). */
export function scoDurationCell(p) {
  const sub = p.source === 'measured' ? `mesurée · ${p.measured}` : SCO_SOURCES[p.source] || '';
  return { label: 'Durée', value: `${Math.round(p.durationS)} s`, still: true, color: '#8a94a0', sub };
}

/** Ligne du bas : le signal, ou le vaisseau et sa génération. */
export function scoLine(p) {
  if (p.phase === 'ready') return 'SCO prêt';
  const gen = SCO_GENERATIONS[p.generation] || '';
  return p.shipName && p.generation !== 'unknown' ? `${p.shipName} · ${gen}` : gen;
}
