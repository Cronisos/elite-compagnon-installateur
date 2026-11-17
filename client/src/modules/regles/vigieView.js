// Vigie des règles, côté interface : phrases et mises en forme (fonctions pures, testées par vigieView.test.js).
// L'état vient de GET /api/vigie (server/src/core/vigie.js et server/src/regles/).

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 6 });

/** Valeur d'une fiche ou d'une mesure, courte et lisible. */
export function valeurCourte(v, unite = null) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'oui' : 'non';
  if (typeof v === 'number') return `${nf.format(v)}${unite && unite.length <= 6 ? ` ${unite}` : ''}`;
  if (typeof v === 'string') return v.length > 60 ? `${v.slice(0, 57)}…` : v;
  if (Array.isArray(v)) return v.length > 4 ? `${v.slice(0, 4).map((x) => valeurCourte(x)).join(', ')}… (${v.length})` : v.map((x) => valeurCourte(x)).join(', ');
  const t = JSON.stringify(v);
  return t.length > 60 ? `${t.slice(0, 57)}…` : t;
}

export const CONTROLES = { auto: 'mesurée en jeu', 'à remesurer': 'à remesurer', manuel: 'à la main' };
export const PILL_STATUT = { mesurée: 'pill-good', publiée: 'pill-info', déduite: 'pill-info', 'à vérifier': 'pill-warn', inconnue: 'pill-bad' };

/** Ligne de compteurs d'une règle : « 12 mesures · 2 écarts (1 expliqué) » ou « pas encore mesurée ». */
export function compteurs(c, controle) {
  if (!c || !c.total) return controle === 'auto' ? 'pas encore mesurée' : '—';
  const parts = [`${c.total} mesure${c.total > 1 ? 's' : ''}`];
  const ecarts = (c.ecarts || 0) + (c.expliques || 0);
  if (ecarts) parts.push(`${ecarts} écart${ecarts > 1 ? 's' : ''}${c.expliques ? ` (${c.expliques} expliqué${c.expliques > 1 ? 's' : ''})` : ''}`);
  else parts.push('conforme');
  return parts.join(' · ');
}

/** Phrase d'une alerte : ce que dit la fiche, ce que le jeu fait. */
export function alerteTexte(a) {
  return `${a.titre} : la fiche dit ${valeurCourte(a.valeur, a.unite)}, le jeu montre ${valeurCourte(a.valeurEstimee, a.unite)} (${a.ecarts} écarts inexpliqués de suite).`;
}

/** Fiches visibles selon les filtres (domaine, contrôle, alerte seulement, texte). */
export function fichesVisibles(domaines, etat, { domaine = '', controle = '', alertes = false, texte = '' } = {}) {
  const q = texte.trim().toLowerCase();
  return domaines
    .filter((d) => !domaine || d.nom === domaine)
    .map((d) => ({
      ...d,
      fiches: d.fiches.filter((f) => (!controle || f.controle === controle)
        && (!alertes || etat?.regles?.[f.id]?.alerte)
        && (!q || `${f.id} ${f.nom} ${f.titre} ${f.source}`.toLowerCase().includes(q))),
    }))
    .filter((d) => d.fiches.length);
}

/** Valeur saisie pour une proposition : nombre si c'en est un, oui/non, sinon le texte. */
export function lireValeur(texte) {
  const t = String(texte ?? '').trim();
  if (/^-?\d+([.,]\d+)?$/.test(t.replace(/\s/g, ''))) return Number(t.replace(/\s/g, '').replace(',', '.'));
  if (t === 'oui') return true;
  if (t === 'non') return false;
  return t;
}
