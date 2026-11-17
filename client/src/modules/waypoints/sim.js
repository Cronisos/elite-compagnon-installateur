// Simulation de vente : gain théorique pour un tonnage et un prix par minerai.
// Le jeu ne publie pas de formule de mérites. Le taux est mesuré sur deux ventes réelles dans le système
// de minage (30 oct. 2026, Mombaluma) : platine 389,1 et iridium 390,0 mérites par million de crédits.
// Les ventes de minerai faites ailleurs ont rapporté 0 mérite.

export const MERITS_PER_MILLION = 390;

/** « 835 153 » → 835153 ; vide ou invalide → 0. */
export function parseNumber(v) {
  const n = Number(String(v ?? '').replace(/[\s  ]/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** @param rows [{ label, tons, price }] saisies telles quelles */
export function simulate(rows, { sameSystem = true } = {}) {
  const rate = sameSystem ? MERITS_PER_MILLION : 0;
  const lines = rows.map((r) => {
    const credits = parseNumber(r.tons) * parseNumber(r.price);
    return { ...r, credits, merits: Math.round((credits / 1e6) * rate) };
  });
  return {
    lines,
    tons: rows.reduce((sum, r) => sum + parseNumber(r.tons), 0),
    credits: lines.reduce((sum, l) => sum + l.credits, 0),
    merits: lines.reduce((sum, l) => sum + l.merits, 0),
  };
}

/** Quantité de matériaux gagnés par grade : index 0 pour G1, index 4 pour G5. */
export function gradeCounts(materials) {
  const counts = [0, 0, 0, 0, 0];
  for (const m of materials) {
    if (m.grade >= 1 && m.grade <= 5) counts[m.grade - 1] += m.count;
  }
  return counts;
}
