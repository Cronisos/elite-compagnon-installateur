// Format commun d'une règle du jeu (une « fiche ») et d'un domaine de règles. Voir LISEZMOI.md.

/** Statuts d'une règle, du plus sûr au moins sûr. */
export const STATUTS = Object.freeze(['mesurée', 'publiée', 'déduite', 'à vérifier', 'inconnue']);

/**
 * Contrôle par la vigie des règles :
 *   - « auto » : l'app mesure la règle d'elle-même en jeu (observations, écarts, alertes) ;
 *   - « à remesurer » : vérifiable dans les journaux ou en jeu, mais pas encore automatisé : rappel dans la page ;
 *   - « manuel » : ne se vérifie qu'à la main (à l'écran, sur une source externe).
 */
export const CONTROLES = Object.freeze(['auto', 'à remesurer', 'manuel']);

const DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/;
const ID = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const NOM = /^[A-Z][A-Z0-9_]*$/;

/** Problèmes d'une fiche (liste vide : fiche valide). */
export function problemesFiche(f, domaine) {
  const p = [];
  const nom = f?.id || '(sans identifiant)';
  if (!f || typeof f !== 'object') return ['fiche qui n’est pas un objet'];
  if (!ID.test(String(f.id || ''))) p.push(`${nom} : identifiant « domaine.sujet.detail » attendu (minuscules, chiffres, tirets)`);
  else if (!f.id.startsWith(`${domaine}.`)) p.push(`${nom} : l'identifiant doit commencer par « ${domaine}. »`);
  if (!NOM.test(String(f.nom || ''))) p.push(`${nom} : nom de constante (MAJUSCULES_SOULIGNÉES) attendu`);
  if (typeof f.titre !== 'string' || f.titre.trim().length < 5) p.push(`${nom} : titre en français attendu`);
  if (!Object.hasOwn(f, 'valeur') || f.valeur === undefined) p.push(`${nom} : valeur attendue`);
  if (!STATUTS.includes(f.statut)) p.push(`${nom} : statut parmi ${STATUTS.join(', ')}`);
  if (!DATE.test(String(f.date || ''))) p.push(`${nom} : date AAAA-MM-JJ attendue`);
  if (typeof f.source !== 'string' || !f.source.trim()) p.push(`${nom} : source attendue`);
  if (!CONTROLES.includes(f.controle)) p.push(`${nom} : contrôle parmi ${CONTROLES.join(', ')}`);
  return p;
}

/**
 * Domaine de règles : ses fiches, figées, et `v(NOM)` pour lire la valeur d'une fiche par le nom de sa constante.
 * Une fiche invalide, un identifiant ou un nom en double : erreur au chargement (le serveur ne démarre pas, et les
 * tests le disent), jamais une valeur fausse en silence.
 */
export function domaine(nom, titre, fiches) {
  const parNom = new Map();
  const ids = new Set();
  const figees = fiches.map((f) => Object.freeze({ ...f, domaine: nom }));
  for (const f of figees) {
    const p = problemesFiche(f, nom);
    if (p.length) throw new Error(`Règles « ${nom} » : ${p.join(' ; ')}`);
    if (ids.has(f.id)) throw new Error(`Règles « ${nom} » : identifiant en double ${f.id}`);
    if (parNom.has(f.nom)) throw new Error(`Règles « ${nom} » : nom en double ${f.nom}`);
    ids.add(f.id);
    parNom.set(f.nom, f);
  }
  const v = (n) => {
    if (!parNom.has(n)) throw new Error(`Règles « ${nom} » : aucune fiche ${n}`);
    return parNom.get(n).valeur;
  };
  return Object.freeze({ nom, titre, fiches: Object.freeze(figees), v });
}

/**
 * Ancienne forme des tables de règles des modules ({ id: NOM, value, unit, status, date, source }), encore servie par
 * leurs API (vente, « Où agir ») : faite à partir des fiches, jamais recopiée.
 */
export const tableModule = (fiches) => fiches.map((f) => ({ id: f.nom, value: f.valeur, ...(f.unite ? { unit: f.unite } : {}), status: f.statut, date: f.date, source: f.source }));
