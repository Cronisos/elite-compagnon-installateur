// Déblocage d'un ingénieur (fonctions pures) : chaîne de découverte par référence (R14), étapes restantes et ce que
// le joueur a déjà pour les franchir (soute, matériaux, solde). Rien n'est supposé : ce que l'app ne voit pas (primes,
// obligations de combat en attente, invitation) est « inconnu », jamais « ✓ ».

import { ROUTE_SETTINGS, PROGRESS_STATES } from './itineraryRules.js';
import { normItem } from './engineerData.js';

const fmt = (n) => Math.round(n).toLocaleString('fr-FR');

/** Le parrain doit-il monter pour faire connaître son filleul ? (rang 3 et REFERRAL_PROGRESS % de la barre, ou plus). */
export function parentNeedsClimb(p, { referralProgress = ROUTE_SETTINGS.REFERRAL_PROGRESS } = {}) {
  if (!p || p.progress !== 'Unlocked' || !Number.isInteger(p.rank)) return true;
  if (p.rank >= 4) return false;
  if (p.rank < 3) return true;
  return !((p.rankProgress?.min ?? 0) >= referralProgress);
}

/** Étapes propres à un ingénieur (sans celles de ses parrains) : état, +1 pour la montée d'un parrain, +1 pour un permis. */
export function ownSteps(e, chain = null) {
  const base = PROGRESS_STATES[e.progress]?.steps;
  if (base == null) return null;
  const climb = e.progress === 'absent' && chain?.climbs?.length ? 1 : 0;
  return base + climb + (e.permitNeeded ? 1 : 0);
}

/**
 * Chaîne de découverte d'un ingénieur (R14).
 * @param {number} id
 * @param {{ E: Map<number, object>, H: string }} uctx E : ingénieurs (progress, rank, rankProgress, region, referralBy,
 *   permitNeeded, name) ; H : région de référence
 * @returns {{ id, discovery: null|{ state: 'ok'|'manque'|'inconnu', parent: number|null, note: string|null },
 *   climbs: number[], members: number[], reach: 'ici'|'traversee'|'inconnu', totalSteps: number }}
 *   climbs : parrains à faire monter (le plus proche d'abord) ; members : lui et ces parrains (closure)
 */
export function unlockChain(id, uctx, depth = 0, seen = new Set()) {
  const { E, H } = uctx;
  const e = E.get(id);
  const out = { id, discovery: null, climbs: [], members: [id], reach: e.region === H ? 'ici' : 'traversee', totalSteps: 0 };
  if (e.progress === 'unknown') {
    out.discovery = { state: 'inconnu', parent: e.referralBy ?? null, note: 'aucun relevé des ingénieurs dans tes journaux : lance le jeu pour le relever' };
    out.reach = 'inconnu';
  } else if (e.progress === 'absent') {
    const p = e.referralBy;
    if (p == null) out.discovery = { state: 'ok', parent: null, note: 'connu du public : il devrait apparaître au prochain chargement' };
    else if (depth >= ROUTE_SETTINGS.MAX_REFERRAL_DEPTH || seen.has(p) || !E.has(p)) out.discovery = { state: 'inconnu', parent: p, note: 'chaîne de références trop longue ou en boucle' };
    else {
      const pe = E.get(p);
      const needs = parentNeedsClimb(pe);
      const between = pe.progress === 'Unlocked' && pe.rank === 3 && (pe.rankProgress?.min ?? 0) >= 100 / 3 && (pe.rankProgress?.min ?? 0) < ROUTE_SETTINGS.REFERRAL_PROGRESS;
      if (pe.progress === 'Barred') out.discovery = { state: 'inconnu', parent: p, note: `${pe.name} t’a banni : sa référence n’est pas possible` };
      else if (!needs) out.discovery = { state: 'ok', parent: p, note: 'le jeu peut ne l’écrire qu’au prochain chargement : relance-le' };
      else {
        out.discovery = between
          ? { state: 'inconnu', parent: p, note: 'seuil incertain (un tiers ou la moitié de la barre) : la montée est comptée' }
          : { state: 'manque', parent: p, note: null };
        out.climbs.push(p);
        out.members.push(p);
        if (pe.progress !== 'Unlocked') {
          const sub = unlockChain(p, uctx, depth + 1, new Set([...seen, id]));
          for (const c of sub.climbs) if (!out.climbs.includes(c)) out.climbs.push(c);
          for (const m of sub.members) if (!out.members.includes(m)) out.members.push(m);
          if (sub.reach === 'inconnu') out.reach = 'inconnu';
        }
      }
    }
  }
  if (out.reach !== 'inconnu' && out.members.some((m) => E.get(m).region !== H)) out.reach = 'traversee';
  const chainOf = (m) => (m === id ? out : unlockChain(m, uctx, depth + 1, new Set([...seen, id])));
  out.totalSteps = out.members.reduce((a, m) => a + (ownSteps(E.get(m), chainOf(m)) ?? 0), 0);
  return out;
}

const amount = (credits) => (credits.length === 2 ? `${fmt(credits[0])} ou ${fmt(credits[1])} Cr (les sources ne s’accordent pas)` : `${fmt(credits[0])} Cr`);

/**
 * Ce que le joueur a pour un objet de déblocage.
 * @param {object} it objet (engineers.json : en, fr, type, symbol, qty, credits, kind)
 * @param {{ ref, inventory, cargo: { known: boolean, lines: object[] }, balance: number|null }} have
 * @returns {{ state: 'ok'|'manque'|'inconnu', count: number|null, need: number|null, note: string|null }}
 */
export function itemCheck(it, { ref, inventory, cargo, balance }) {
  if (it.type === 'materiau') {
    // Symbole du jeu (material.csv), en minuscules comme l'inventaire ; le nom anglais y mène au même symbole
    // (ref.materialFromComponent, vérifié par le test des données)
    const key = String(it.symbol).toLowerCase();
    const count = inventory ? inventory.count(key) : null;
    if (count == null) return { state: 'inconnu', count: null, need: it.qty, note: 'matériaux pas encore relus' };
    return { state: count >= it.qty ? 'ok' : 'manque', count, need: it.qty, note: null };
  }
  if (it.type === 'marchandise') {
    const mined = /minage/.test(it.kind || '') ? 'extrait demandé : la soute ne dit pas d’où il vient' : null;
    if (!cargo?.known) return { state: 'inconnu', count: null, need: it.qty, note: 'soute pas encore relue : lance le jeu' };
    const symbol = String(it.symbol).toLowerCase();
    const names = new Set([normItem(it.en), it.fr ? normItem(it.fr) : null].filter(Boolean));
    let count = 0;
    for (const l of cargo.lines || []) {
      if (l.missionId != null) continue; // cargaison de mission : réservée à la mission
      if (l.name === symbol || names.has(normItem(l.label))) count += l.count || 0;
    }
    return { state: count >= it.qty ? 'ok' : 'manque', count, need: it.qty, note: mined };
  }
  if (it.type === 'credits') {
    if (typeof balance !== 'number') return { state: 'inconnu', count: null, need: it.credits[0], note: 'solde inconnu' };
    return { state: balance >= it.credits[0] ? 'ok' : 'manque', count: balance, need: it.credits[0], note: balance >= it.credits[0] ? null : `il te manque ${fmt(it.credits[0] - balance)} Cr` };
  }
  // Primes et obligations : le journal ne montre pas ce qui est en attente
  return { state: 'inconnu', count: null, need: it.credits?.[0] ?? null, note: `l’app ne voit pas tes primes ou obligations en attente : vérifie-les dans le jeu (${amount(it.credits || [0])})` };
}

/**
 * Étapes de déblocage d'un ingénieur pas encore débloqué (§ 4.10.8.2), chacune avec ce que l'app en voit (check).
 * @param {object} e ingénieur (record du calcul : progress, permitNeeded, data : fiche d'engineers.json)
 * @param {object} chain unlockChain(e.id)
 * @param {object} have { ref, inventory, cargo, balance }
 * @param {Map<number, object>} E ingénieurs (parrain : nom, état, rang, région)
 */
export function unlockSteps(e, chain, have, E) {
  if (e.progress === 'Unlocked' || e.progress === 'Barred') return [];
  const d = e.data;
  const steps = [];
  if (e.progress === 'absent' || e.progress === 'unknown') {
    const p = chain.discovery?.parent != null ? E.get(chain.discovery.parent) : null;
    steps.push({
      kind: 'decouverte',
      text: d.discovery,
      parent: p ? { id: p.id, name: p.name, progress: p.progress, rank: p.rank ?? null, region: p.region } : null,
      check: { state: chain.discovery?.state ?? 'inconnu', note: chain.discovery?.note ?? null },
    });
  }
  if (['Known', 'Acquainted', 'absent', 'unknown'].includes(e.progress)) {
    steps.push({
      kind: 'invitation',
      text: d.invitation,
      ...(e.progress === 'Acquainted' ? { acquainted: true } : {}),
      check: { state: 'inconnu', note: 'l’app ne le voit pas' },
    });
  }
  steps.push({
    kind: 'deblocage',
    text: d.unlock.text,
    items: d.unlock.items.map((it) => ({
      en: it.en,
      fr: it.fr,
      label: it.fr ?? it.en,
      type: it.type,
      qty: it.qty,
      credits: it.credits ?? null,
      kind: it.kind,
      check: itemCheck(it, have),
    })),
  });
  if (e.permitNeeded) steps.push({ kind: 'permis', name: d.permit.name ?? null, condition: d.permit.condition ?? null, check: { state: 'manque', note: null } });
  return steps;
}
