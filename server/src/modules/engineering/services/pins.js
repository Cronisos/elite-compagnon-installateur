// Épingles (R2, R3e, R9). Le jeu n'écrit aucun épinglage : le plan épinglé chez un ingénieur se DÉDUIT de la dernière
// application faite à distance chez lui (« déduite, dernier constat le JJ/MM »). Le joueur peut aussi le dire
// (« J'ai épinglé … », « Aucun », « Je ne sais pas ») : entre sa saisie et la déduction, la plus récente l'emporte. Un
// ingénieur n'a qu'une épingle (R2a) ; elle vaut pour son groupe de modules, toutes tailles (R3e), jamais pour un autre
// groupe (R3f, non compté). Le fichier des saisies (engineering-pins.json) n'est jamais modifié par une déduction.

import { engineerKey } from '../../../core/reference/refdata.js';
import { canonicalBlueprint } from './engineerData.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const fail = (why) => {
  throw new Error(why);
};
const time = (iso) => Date.parse(iso);

/**
 * Épingles déduites des applications relues (buildRankLog) : la dernière application à distance sans effet, par
 * ingénieur (EngineerID, sinon son nom). → Map<id, { grp, blueprint, at, grade, rank, count, stationType }> ; count :
 * applications à distance chez lui (tous plans).
 */
export function deducePins(log, ref, idx) {
  const out = new Map();
  const counts = new Map();
  for (const a of log?.applications || []) {
    if (a.place !== 'distance' || a.experimental) continue;
    const id = Number.isInteger(a.engineerId) && idx.byId.has(a.engineerId) ? a.engineerId : idx.byName.get(engineerKey(a.engineer))?.id;
    if (id == null) continue;
    counts.set(id, (counts.get(id) || 0) + 1);
    const grp = ref.groupOf(a.module);
    const blueprint = canonicalBlueprint(ref, grp, a.blueprint);
    if (!blueprint) continue;
    out.set(id, { grp, blueprint, at: a.at, grade: a.grade, rank: a.rank, count: 0, stationType: a.stationType ?? null });
  }
  for (const [id, p] of out) p.count = counts.get(id) || 0;
  return out;
}

const samePin = (a, b) => !!a && !!b && a.grp === b.grp && a.blueprint === b.blueprint;

/**
 * Épingle retenue d'un ingénieur (R9 : la plus récente l'emporte).
 * @param {object|null} saisie { choice: 'pinned'|'none'|'unknown', grp?, blueprint?, at }
 * @param {object|null} deduced { grp, blueprint, at, … }
 * @returns {{ pin: { grp, blueprint, source: 'saisie'|'journal', at }|null, unused: boolean,
 *   notice: null|{ kind: 'contradiction'|'nouvelle', deduced, saisie } }}
 */
export function effectivePin(saisie, deduced) {
  const fromJournal = deduced ? { grp: deduced.grp, blueprint: deduced.blueprint, source: 'journal', at: deduced.at } : null;
  const fromSaisie = saisie?.choice === 'pinned' ? { grp: saisie.grp, blueprint: saisie.blueprint, source: 'saisie', at: saisie.at } : null;
  if (!saisie) return { pin: fromJournal, unused: false, notice: null };
  if (!deduced) return { pin: fromSaisie, unused: false, notice: null };
  // Même plan dit et vu : retenu, sans rien signaler (la source est la plus récente des deux)
  if (saisie.choice === 'pinned' && samePin(saisie, deduced)) return { pin: time(saisie.at) >= time(deduced.at) ? fromSaisie : fromJournal, unused: false, notice: null };
  if (time(saisie.at) >= time(deduced.at)) {
    if (saisie.choice === 'pinned') return { pin: fromSaisie, unused: false, notice: null };
    return { pin: null, unused: true, notice: null };
  }
  // La déduction est plus récente que la saisie : le jeu a montré une épingle depuis
  if (saisie.choice === 'unknown') return { pin: fromJournal, unused: false, notice: { kind: 'nouvelle', deduced: fromJournal, saisie: { ...saisie } } };
  return { pin: fromJournal, unused: false, notice: { kind: 'contradiction', deduced: fromJournal, saisie: { ...saisie } } };
}

/** Validation stricte du fichier engineering-pins.json (version 1). Un id absent des données est gardé (et ignoré). */
export function validatePinsFile(json) {
  if (!isObj(json) || Object.keys(json).length !== 2 || json.version !== 1 || !isObj(json.pins)) fail('forme inattendue');
  const keys = Object.keys(json.pins);
  if (keys.length > 64) fail('trop d’épingles');
  const pins = {};
  for (const k of keys) {
    if (!/^[1-9]\d{5}$/.test(k)) fail(`ingénieur ${k} invalide`);
    const p = json.pins[k];
    if (!isObj(p) || !['pinned', 'none', 'unknown'].includes(p.choice)) fail(`${k} : choix invalide`);
    const allowed = p.choice === 'pinned' ? ['choice', 'grp', 'blueprint', 'at'] : ['choice', 'at'];
    if (Object.keys(p).length !== allowed.length || !allowed.every((x) => Object.hasOwn(p, x))) fail(`${k} : champs inattendus`);
    if (typeof p.at !== 'string' || p.at.length > 40 || !Number.isFinite(Date.parse(p.at))) fail(`${k} : date illisible`);
    if (p.choice === 'pinned' && (typeof p.grp !== 'string' || !/^[a-z0-9]{1,8}$/.test(p.grp) || typeof p.blueprint !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(p.blueprint))) fail(`${k} : plan invalide`);
    pins[k] = { ...p };
  }
  return { version: 1, pins };
}

export const emptyPins = () => ({ version: 1, pins: {} });
