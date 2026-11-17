// Escale à plusieurs vaisseaux (R13, R16, R16b). Les bases d'ingénieurs n'ont pas de chantier naval (R13, à vérifier) :
// on n'y change pas de vaisseau. Quand une escale a des tâches pour des plans de vaisseaux différents, on y vient avec
// UN vaisseau, sur lequel on monte d'abord les modules des autres (entrepôt, transfert : FetchRemoteModule), s'ils y
// rentrent ; sinon il faudra revenir avec l'autre vaisseau (seconde visite, comptée dans le coût).

const STANDARD = new Set(['pp', 't', 'fsd', 'ls', 'pd', 's', 'ft']);
const MASS = new Set(['t', 'sg']);

/** Genre d'emplacement d'un module : standard (et sa fonction), point d'emport, utilitaire, interne. */
function kindOf(ref, item) {
  const grp = ref.groupOf(item);
  const mod = ref.modules?.get(String(item || '').toLowerCase());
  if (grp === 'bh') return { kind: 'blindage', grp, mod };
  if (!mod) return { kind: null, grp, mod: null };
  if (STANDARD.has(grp)) return { kind: 'standard', grp, mod };
  if (String(mod.symbol).startsWith('hpt_')) return { kind: mod.class === 0 ? 'utility' : 'hardpoint', grp, mod };
  return { kind: 'internal', grp, mod };
}

/**
 * Un module rentre-t-il sur un vaisseau (R16, R16b) ?
 * @returns {{ ok: boolean, slot: string|null, why: null|'trop petit'|'réservé'|'masse'|'blindage'|'inconnu' }}
 */
export function fits(ref, shipKey, item, { taken = new Set() } = {}) {
  const slots = ref.shipSlots(shipKey);
  const { kind, grp, mod } = kindOf(ref, item);
  if (kind === 'blindage') return { ok: false, slot: null, why: 'blindage' };
  if (!slots || !kind) return { ok: false, slot: null, why: 'inconnu' };
  const same = slots.filter((s) => (kind === 'standard' ? s.group === 'standard' && s.grp === grp : s.group === kind));
  let why = 'trop petit';
  const symbol = String(item).toLowerCase();
  for (const s of same) {
    if (taken.has(s.key)) continue;
    const accepted = ref.modulesForSlot(shipKey, s).some((m) => m.symbol === symbol);
    if (!accepted) {
      // Assez grand mais réservé (compartiment militaire, soute seule, suite d'approche) : la raison est la réservation
      if (kind === 'internal' && (s.size ?? 0) >= (mod.class ?? 0) && (s.restriction || s.eligible)) why = 'réservé';
      continue;
    }
    if (MASS.has(grp)) {
      const hull = ref.ships?.[shipKey]?.properties?.hullMass;
      if (typeof hull === 'number' && typeof mod.maxmass === 'number' && hull > mod.maxmass) {
        why = 'masse';
        continue;
      }
    }
    return { ok: true, slot: s.key, why: null };
  }
  return { ok: false, slot: null, why };
}

/**
 * Vaisseau à amener à une escale qui a des tâches pour plusieurs vaisseaux.
 * @param {object} stop { bring: [{ planId, shipId, shipType, items: [{ slot, item, size, steps }] }] } (items : modules
 *   du plan qui ont une tâche ici ; steps : grades + effet à faire ici)
 * @param {number|null} pilotedShipId vaisseau piloté
 * @returns {{ vehicle: { planId, shipId, shipType }|null, transfers: [{ planId, slot, item, to }], revisits: [{ planId, shipType, slots, why }] }}
 */
export function chooseVehicle(ref, stop, pilotedShipId = null) {
  const bring = [...(stop.bring || [])].sort((a, b) => a.planId - b.planId);
  if (!bring.length) return { vehicle: null, transfers: [], revisits: [] };
  // Vaisseaux de l'escale : un par numéro ; un plan sans vaisseau compte à part
  const vessels = [];
  for (const b of bring) {
    const v = b.shipId != null ? vessels.find((x) => x.shipId === b.shipId) : null;
    if (v) v.plans.push(b);
    else vessels.push({ shipId: b.shipId, shipType: b.shipType, planId: b.planId, plans: [b] });
  }
  if (vessels.length === 1) return { vehicle: { planId: vessels[0].planId, shipId: vessels[0].shipId, shipType: vessels[0].shipType }, transfers: [], revisits: [] };
  const steps = (v) => v.plans.reduce((a, p) => a + p.items.reduce((x, it) => x + (it.steps || 0), 0), 0);
  const tries = vessels.map((v) => {
    const taken = new Set(v.plans.flatMap((p) => p.items.map((it) => it.slot)));
    const transfers = [];
    const failed = new Map(); // vaisseau → { slots, why }
    const others = vessels.filter((o) => o !== v).flatMap((o) => o.plans.flatMap((p) => p.items.map((it) => ({ o, p, it }))));
    // Les plus grands d'abord : ils ont le moins d'emplacements possibles
    others.sort((a, b) => (b.it.size ?? 0) - (a.it.size ?? 0) || a.p.planId - b.p.planId || String(a.it.slot).localeCompare(String(b.it.slot)));
    for (const { o, p, it } of others) {
      const f = fits(ref, v.shipType, it.item, { taken });
      if (f.ok) {
        taken.add(f.slot);
        transfers.push({ planId: p.planId, slot: it.slot, item: it.item, to: f.slot });
      } else {
        const x = failed.get(o) || { planId: o.planId, shipType: o.shipType, slots: [], why: f.why };
        x.slots.push(it.slot);
        failed.set(o, x);
      }
    }
    // Tout rentre ; sinon le plus de modules montés ; puis le plus de tâches ici, le vaisseau piloté, le plus petit plan
    const all = failed.size === 0;
    return { v, transfers, revisits: [...failed.values()], score: [all ? 1 : 0, all ? 0 : transfers.length, steps(v), v.shipId != null && v.shipId === pilotedShipId ? 1 : 0, -v.planId] };
  });
  tries.sort((a, b) => {
    for (let i = 0; i < a.score.length; i++) if (a.score[i] !== b.score[i]) return b.score[i] - a.score[i];
    return 0;
  });
  const best = tries[0];
  return { vehicle: { planId: best.v.planId, shipId: best.v.shipId, shipType: best.v.shipType }, transfers: best.transfers, revisits: best.revisits };
}
