// Référentiel des règles du jeu : lecture du fichier de données (regles.json), contrôle de sa forme et filtres.
//
// Les règles sont des données, jamais du texte en dur dans l'interface : chaque règle a un identifiant stable
// (adresse /regles#identifiant), un statut, une date de vérification et ses sources. Ses valeurs chiffrées
// (values) sont les constantes qu'une future « vigie des règles » comparera à ce que le jeu fait réellement ;
// journal liste les événements et champs du journal qui permettent de le faire.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DATA_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'regles.json');

/** Statuts possibles d'une règle, dans l'ordre d'affichage. */
export const STATUSES = [
  { id: 'mesuree', label: "Mesurée par l'escadron", help: "Relevée dans les journaux de l'escadron, à la date indiquée." },
  { id: 'publiee', label: 'Publiée', help: "Écrite par Frontier ou un guide de joueurs (adresse donnée), pas encore mesurée par l'escadron." },
  { id: 'a-verifier', label: 'À vérifier', help: "Cause inconnue, une seule mesure ambiguë ou aucune source : ne pas s'y fier." },
];
const STATUS_IDS = new Set(STATUSES.map((s) => s.id));
const SOURCE_TYPES = new Set(['escadron', 'web']);

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_OR_DAY = /^\d{4}-\d{2}(?:-\d{2})?$/;
const URL_RE = /^https?:\/\/[^\s]+$/;
const JOURNAL_REF = /^[A-Za-z][A-Za-z0-9_.]*(?: [A-Za-z][A-Za-z0-9_.<>]*)?$/;

const text = (v) => typeof v === 'string' && v.trim() !== '';
const realDay = (v) => DAY.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);
const list = (v) => v === undefined || Array.isArray(v);

/** Erreurs d'une règle (liste vide si elle est bonne). sheetIds : identifiants des fiches connues. */
export function ruleErrors(rule, sheetIds) {
  const errs = [];
  const where = text(rule?.id) ? rule.id : '(sans identifiant)';
  const err = (m) => errs.push(`${where} : ${m}`);
  if (!rule || typeof rule !== 'object') return ['règle illisible'];
  if (!text(rule.id) || !ID.test(rule.id)) err('identifiant invalide (minuscules, chiffres et tirets)');
  if (!sheetIds.has(rule.sheet)) err(`fiche inconnue « ${rule.sheet} »`);
  if (sheetIds.has(rule.id)) err('identifiant déjà pris par une fiche');
  if (!text(rule.title)) err('titre manquant');
  if (!text(rule.statement)) err('énoncé manquant');
  if (!STATUS_IDS.has(rule.status)) err(`statut inconnu « ${rule.status} »`);
  if (rule.checkedAt != null && !realDay(rule.checkedAt)) err(`date de vérification invalide « ${rule.checkedAt} »`);
  if (rule.status !== 'a-verifier' && rule.checkedAt == null) err('date de vérification manquante');
  for (const k of ['terms', 'values', 'sources', 'evidence', 'caveats', 'related', 'journal']) {
    if (!list(rule[k])) err(`${k} doit être une liste`);
  }
  for (const t of rule.terms || []) {
    if (!text(t?.fr) || !text(t?.en)) err('terme incomplet (fr et en)');
  }
  const keys = new Set();
  for (const v of rule.values || []) {
    if (!text(v?.key) || !ID.test(v.key)) err(`clé de valeur invalide « ${v?.key} »`);
    else if (keys.has(v.key)) err(`clé de valeur en double « ${v.key} »`);
    keys.add(v?.key);
    if (typeof v?.value !== 'number' || !Number.isFinite(v.value)) err(`valeur non numérique pour « ${v?.key} »`);
    if (!text(v?.unit)) err(`unité manquante pour « ${v?.key} »`);
    if (!text(v?.label)) err(`libellé manquant pour « ${v?.key} »`);
  }
  for (const s of rule.sources || []) {
    if (!SOURCE_TYPES.has(s?.type)) err(`type de source inconnu « ${s?.type} »`);
    if (!text(s?.label)) err('source sans libellé');
    if (s?.type === 'web' && !URL_RE.test(String(s.url || ''))) err(`adresse de source invalide « ${s?.url} »`);
    if (s?.type === 'escadron' && s.url != null) err("une mesure de l'escadron n'a pas d'adresse");
    if (s?.date != null && !MONTH_OR_DAY.test(s.date)) err(`date de source invalide « ${s.date} »`);
  }
  const types = new Set((rule.sources || []).map((s) => s?.type));
  if (rule.status === 'mesuree' && !types.has('escadron')) err("une règle mesurée doit citer la mesure de l'escadron");
  if (rule.status === 'publiee' && !types.has('web')) err('une règle publiée doit citer une adresse');
  for (const x of [...(rule.evidence || []), ...(rule.caveats || [])]) if (!text(x)) err('preuve ou réserve vide');
  for (const j of rule.journal || []) if (!text(j) || !JOURNAL_REF.test(j)) err(`référence au journal invalide « ${j} »`);
  return errs;
}

/**
 * Contrôle tout le référentiel. Rend les fiches, les règles valables (les autres sont écartées) et les erreurs.
 * Une règle liée (related) à un identifiant inconnu garde sa place, le lien mort est retiré et signalé.
 */
export function checkReferential(data) {
  const errors = [];
  const sheets = [];
  const sheetIds = new Set();
  for (const s of Array.isArray(data?.sheets) ? data.sheets : []) {
    if (!text(s?.id) || !ID.test(s.id) || !text(s?.title)) {
      errors.push(`fiche invalide « ${s?.id} »`);
      continue;
    }
    if (sheetIds.has(s.id)) {
      errors.push(`fiche en double « ${s.id} »`);
      continue;
    }
    sheetIds.add(s.id);
    sheets.push({ id: s.id, title: s.title, summary: text(s.summary) ? s.summary : '' });
  }
  const byId = new Map();
  for (const r of Array.isArray(data?.rules) ? data.rules : []) {
    const errs = ruleErrors(r, sheetIds);
    if (!errs.length && byId.has(r.id)) errs.push(`${r.id} : identifiant en double`);
    if (errs.length) {
      errors.push(...errs);
      continue;
    }
    byId.set(r.id, r);
  }
  const rules = [...byId.values()].map((r) => {
    const related = (r.related || []).filter((id) => {
      const ok = byId.has(id) && id !== r.id;
      if (!ok) errors.push(`${r.id} : règle liée inconnue « ${id} »`);
      return ok;
    });
    return {
      id: r.id,
      sheet: r.sheet,
      title: r.title,
      statement: r.statement,
      terms: r.terms || [],
      values: r.values || [],
      status: r.status,
      checkedAt: r.checkedAt ?? null,
      sources: r.sources || [],
      evidence: r.evidence || [],
      caveats: r.caveats || [],
      related,
      journal: r.journal || [],
      link: `/regles#${r.id}`,
    };
  });
  return {
    version: Number.isInteger(data?.version) ? data.version : null,
    updatedAt: text(data?.updatedAt) ? data.updatedAt : null,
    statuses: STATUSES,
    sheets,
    rules,
    errors,
  };
}

/** Lit et contrôle le fichier de données. Fichier absent ou illisible : référentiel vide, avec l'erreur. */
export function loadReferential(file = DATA_FILE) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return { ...checkReferential({}), errors: [`fichier des règles illisible (${e.message})`] };
  }
  return checkReferential(data);
}

/** Valeurs de requête (?statut=mesuree,publiee) : seules les valeurs connues sont gardées. */
function pick(raw, known) {
  if (raw == null || raw === '') return null;
  const wanted = String(Array.isArray(raw) ? raw.join(',') : raw).split(',').map((s) => s.trim()).filter(Boolean);
  return new Set(wanted.filter((w) => known.has(w)));
}

/** Filtre les règles par statut, fiche ou identifiants (listes séparées par des virgules). */
export function filterRules(ref, { statut, fiche, ids } = {}) {
  const statuses = pick(statut, STATUS_IDS);
  const sheets = pick(fiche, new Set(ref.sheets.map((s) => s.id)));
  const wanted = pick(ids, new Set(ref.rules.map((r) => r.id)));
  return ref.rules.filter((r) => (!statuses || statuses.has(r.status)) && (!sheets || sheets.has(r.sheet)) && (!wanted || wanted.has(r.id)));
}
