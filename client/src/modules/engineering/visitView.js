// Fiche « Chez l'ingénieur » côté interface : toutes les phrases de la fenêtre en jeu et de la page (fonctions pures,
// testées par visitView.test.js). L'état vient de GET /api/modules/engineering/visit (server/.../services/visit.js).

const nf = new Intl.NumberFormat('fr-FR');
const n = (v) => nf.format(v);

/** Titre : « 🔧 Chez Broo Tarquin » (ou « Chez l'ingénieur » sans hôte). */
export const visitTitle = (s) => (s?.host ? `🔧 Chez ${s.host.name}` : '🔧 Chez l’ingénieur');

/** Pourquoi rien n'est affiché (fenêtre fermée ou page). */
export function emptyText(s) {
  if (!s) return 'Chargement…';
  switch (s.reason) {
    case 'pas à quai': return 'Tu n’es amarré nulle part.';
    case 'pas une base d’ingénieur': return 'Cette station n’est pas la base d’un ingénieur.';
    case 'aucun itinéraire calculé': return `Rien de prévu ici : calcule l’itinéraire de tes plans validés (onglet Itinéraire).`;
    case 'sans tâche': return `Rien de prévu chez ${s.host?.name || 'cet ingénieur'} pour tes plans validés.`;
    default: return null;
  }
}

/** Ligne d'en-tête du plan affiché : « Plan « Krait chasse » · 1/2 fait » (+ « choisi à la main »). */
export function planLine(s) {
  if (!s?.planName) return '';
  const done = s.done ? ` · ${s.done.done}/${s.done.total} fait${s.done.done > 1 ? 's' : ''}` : '';
  return `Plan « ${s.planName} »${done}${s.manual ? ' · choisi à la main' : ''}`;
}

/** Libellé d'un plan dans le choix : « Krait chasse (2 à faire) ». */
export const planOption = (p) => `${p.name} (${p.left ? `${p.left} à faire` : 'fait'})`;

/** Où est le module : vaisseau du plan, vaisseau piloté (modules montés dessus), ou ailleurs. */
export function aboardText(m) {
  if (m.aboard === 'pilote') return 'sur le vaisseau que tu pilotes';
  if (m.aboard === 'ailleurs') return 'le vaisseau du plan n’est pas celui que tu pilotes : amène-le, ou monte ce module';
  return null;
}

/** Ligne d'une tâche de grades : « Efficace : G1 ✓ · ▸G2 · G3 » ; d'un effet : « Effet « Désossage » : à poser ». */
export function taskLine(m) {
  if (m.kind === 'grades') {
    const marks = m.grades.map((g) => (g.state === 'fait' ? `G${g.grade} ✓` : g.state === 'en-cours' ? `▸G${g.grade}` : `G${g.grade}`));
    return `${m.blueprintLabel} : ${marks.join(' · ')}`;
  }
  const st = m.state === 'fait' ? '✓ posé' : m.state === 'verrouille' ? `🔒 après le G1 de ${m.blueprintLabel} (sinon effacé)` : 'à poser';
  return `Effet « ${m.experimentalLabel} » : ${st}`;
}

/** Avertissement AVANT (R7) : ce que la 1re application efface, sans retour. */
export function replacesText(m) {
  const r = m.replaces;
  if (!r) return null;
  const what = `${m.currentLabel || r.blueprint} G${r.grade}${r.experimental ? ` + effet « ${r.experimentalLabel || r.experimental} »` : ''}`;
  return `⚠ Il porte ${what}${r.engineer ? ` (${r.engineer})` : ''} : le 1er G1 de ${m.blueprintLabel} les efface, sans retour.`;
}

/** Coût : « Carbone 5 (tu en as 2, il en manque 3) ». */
export function costLine(x) {
  return x.missing > 0 ? `${x.label} ${n(x.need)} (tu en as ${n(x.owned)}, il en manque ${n(x.missing)})` : `${x.label} ${n(x.need)} ✓`;
}

/** Bilan : tout est fait, ou combien de matériaux manquent. */
export function footText(s) {
  if (!s?.done) return '';
  if (s.done.all) return '✓ Tout est fait ici pour ce plan.';
  const miss = s.cost?.missingCount || 0;
  return miss ? `${miss} matériau${miss > 1 ? 'x' : ''} à compléter avant de tout faire` : 'Matériaux réunis';
}
