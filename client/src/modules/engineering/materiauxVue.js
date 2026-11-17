// Matériaux rangés comme dans les échangeurs de matériaux du jeu : par type, puis par catégorie (dans l'ordre des
// colonnes de l'échangeur), et dans chaque catégorie du grade 1 au grade 5. Les catégories viennent des données
// FDevIDs (material.csv : « Chemical », « Wake Scans », « 1 »… pour les matières premières). Les matériaux sans
// catégorie (gardiens, thargoïdes, débris) ne s'échangent pas : ils sont rangés à part.

export const TYPES = [
  ['Raw', 'Matières premières'],
  ['Manufactured', 'Manufacturés'],
  ['Encoded', 'Données'],
];

/** Catégories par type, dans l'ordre de l'échangeur : [clé FDevIDs, libellé]. */
export const CATEGORIES = {
  Raw: [1, 2, 3, 4, 5, 6, 7].map((n) => [String(n), `Catégorie ${n}`]),
  Manufactured: [
    ['Chemical', 'Chimique'],
    ['Thermic', 'Thermique'],
    ['Heat', 'Chaleur'],
    ['Conductive', 'Conducteurs'],
    ['Mechanical Components', 'Composants mécaniques'],
    ['Capacitors', 'Condensateurs'],
    ['Shielding', 'Boucliers'],
    ['Composite', 'Composites'],
    ['Crystals', 'Cristaux'],
    ['Alloys', 'Alliages'],
  ],
  Encoded: [
    ['Emission Data', "Données d'émission"],
    ['Wake Scans', 'Scans de sillage'],
    ['Shield Data', 'Données de bouclier'],
    ['Encryption Files', 'Fichiers de chiffrement'],
    ['Data Archives', 'Archives de données'],
    ['Encoded Firmware', 'Micrologiciels'],
  ],
};

const HORS = [
  ['gardiens', 'Gardiens (hors échangeur)', (m) => /guardian/i.test(m.english || m.key || '')],
  ['thargoides', 'Thargoïdes (hors échangeur)', (m) => /thargoid/i.test(m.english || m.key || '')],
  ['autres', 'Autres (hors échangeur)', () => true],
];

const parGrade = (a, b) => (a.grade ?? 9) - (b.grade ?? 9) || String(a.label).localeCompare(String(b.label), 'fr');

/** Filtre par grades : un ensemble vide (ou absent) garde tout ; sinon seulement les grades choisis. */
export const filtrerGrades = (items, grades) => (!grades?.size ? items : items.filter((m) => grades.has(m.grade)));

/** Bascule un grade dans le filtre (nouvel ensemble, l'ancien n'est pas modifié). */
export function basculerGrade(grades, g) {
  const n = new Set(grades);
  if (n.has(g)) n.delete(g);
  else n.add(g);
  return n;
}

/** Classe d'un grade pour le code couleur (g1 → g5), vide sans grade. */
export const classeGrade = (g) => (g >= 1 && g <= 5 ? `g${g}` : '');

/**
 * Matériaux d'un type en sous-catégories : [{ cle, titre, items }], dans l'ordre de l'échangeur, puis les groupes
 * hors échangeur. Les catégories vides ne sont pas rendues.
 */
export function grouperMateriaux(items, type) {
  const liste = (items || []).filter((m) => m.type === type);
  const connues = CATEGORIES[type] || [];
  const cles = new Set(connues.map(([c]) => c));
  const out = connues.map(([cle, titre]) => ({ cle, titre, items: liste.filter((m) => String(m.category) === cle).sort(parGrade) }));
  const reste = liste.filter((m) => !cles.has(String(m.category)));
  const pris = new Set();
  for (const [cle, titre, test] of HORS) {
    const it = reste.filter((m) => !pris.has(m.key) && test(m));
    it.forEach((m) => pris.add(m.key));
    out.push({ cle, titre, items: it.sort(parGrade) });
  }
  return out.filter((g) => g.items.length);
}

/** Libellé court de la catégorie d'un matériau (« Manufacturé · Chimique »), pour les tableaux. */
export function libelleCategorie(m) {
  const type = TYPES.find(([t]) => t === m.type)?.[1];
  const cat = (CATEGORIES[m.type] || []).find(([c]) => c === String(m.category))?.[1];
  return [type, cat].filter(Boolean).join(' · ') || '—';
}

/** Rang de tri d'un matériau dans l'ordre de l'échangeur (type, catégorie, grade). */
export function rangEchangeur(m) {
  const t = TYPES.findIndex(([x]) => x === m.type);
  const c = (CATEGORIES[m.type] || []).findIndex(([x]) => x === String(m.category));
  return (t < 0 ? 9 : t) * 10000 + (c < 0 ? 99 : c) * 10 + (m.grade ?? 9);
}
