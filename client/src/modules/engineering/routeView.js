// Itinéraire d'ingénierie, côté interface : toutes les phrases de la page Itinéraire, du bloc « Valider ce plan » et de
// « Pourquoi lui ? ». Fonctions pures, testées sans navigateur (routeView.test.js) : aucune phrase n'est composée dans
// un JSX. Le calcul vient du serveur (GET /route, POST /route) ; ici, on ne fait que le dire.
//
// Vocabulaire : « al » (années-lumière, à vol d'oiseau), « al-éq. » (distance équivalente du coût, qui compte aussi
// escales, supercroisière, applications en plus et secondes visites), « sl » (secondes-lumière jusqu'à la base).
// « Tes journaux » ne sert qu'à ce que l'app relit chez le joueur (épingles déduites, position, états) ; une phrase
// tirée des observations de la table des règles parle des « journaux de référence ».

import { date, time } from '../../core/format.js';
import { orderText as rankOrderText, statusBadge } from './rankView.js';
import { PROGRESS_TEXT, progressOf, unlockItemText, regionWord } from './engineerView.js';

const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const ok = (n) => n != null && Number.isFinite(Number(n));

/** Pluriel français : 0 et 1 au singulier. */
export const plural = (n, one, many) => (Math.abs(n) < 2 ? one : many);
/** « 3 escales », « 1 escale », « 0 escale ». */
export const count = (n, one, many) => `${nf0.format(n)} ${plural(n, one, many)}`;

/** Distance : une décimale sous 1 000 (« 98,0 »), entière au-delà (« 22 059 »), sans unité. */
export const alNum = (d) => (!ok(d) ? '—' : Math.abs(d) < 1000 ? nf1.format(d) : nf0.format(Math.round(d)));
/** « 98,0 al », « 22 059 al ». */
export const al = (d) => `${alNum(d)} al`;
/** « +98,0 », « −71,2 » (signe toujours écrit). */
export const signed = (d) => (!ok(d) ? '—' : `${d < 0 ? '−' : '+'}${alNum(Math.abs(d))}`);
const signedInt = (n) => `${n < 0 ? '−' : '+'}${nf0.format(Math.abs(n))}`;
/** « 05/11 » (jour et mois, heure locale). */
export const dayMonth = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : '—');

/** « la Bulle », « Colonia ». */
export const regionName = (r) => (r === 'Colonia' ? 'Colonia' : 'la Bulle');
/** « dans la Bulle », « à Colonia ». */
export const inRegion = (r) => (r === 'Colonia' ? 'à Colonia' : 'dans la Bulle');
const otherRegion = (r) => (r === 'Colonia' ? 'Bulle' : 'Colonia');
const VOWEL = /^[AEIOUYÉÈÊÀÂÎÔÛaeiouyéèêàâîôû]/;
/** « de Palin », « d’Elvira ». */
const de = (name) => (VOWEL.test(name) ? `d’${name}` : `de ${name}`);
/** « A », « A et B », « A, B et C ». */
export const andList = (list) => (list.length > 1 ? `${list.slice(0, -1).join(', ')} et ${list.at(-1)}` : list.join(''));
/** « G5 », « G1→G5 ». */
export const gradesSpan = (grades = []) => (grades.length > 1 ? `G${grades[0]}→G${grades.at(-1)}` : grades.length ? `G${grades[0]}` : '');
/** « les G1 à G3 », « le G4 » (après « à distance », « ici »). */
const gradesWords = (from, to) => (from === to ? `le G${from}` : `les G${from} à G${to}`);

/** Nom d'un ingénieur par son numéro (liste des ingénieurs), sinon le numéro. */
const nameOf = (names, id) => names?.get?.(id) ?? `ingénieur ${id}`;
/** Plans du résultat : numéro → { name, model }. */
export const plansOf = (result) => new Map((result?.plans || []).map((p) => [p.id, p]));
const planName = (result, id) => plansOf(result).get(id)?.name ?? `plan ${id}`;

// --- Badges des règles ---

/**
 * Badge d'une règle de la table de l'itinéraire (GET /route/rules) : « R5b · à vérifier », avec au survol le texte de
 * la règle, « Signalé par un joueur le 8 nov. 2026. » si c'est lui qui l'a dite, et l'explication du statut. Rien pour une
 * règle mesurée (le badge ne sert qu'à signaler ce qui reste à vérifier), ni pour une règle de l'app (sans statut).
 * @param {string} id
 * @param {Map<string, object>} rules règles par numéro
 */
export function ruleBadge(id, rules) {
  const r = rules?.get?.(id);
  if (!r || !r.status || r.status === 'mesurée') return null;
  const b = statusBadge(r.status, r.source, r.why);
  const signale = r.also ? ' Signalé par un joueur le 8 nov. 2026.' : '';
  return { id, label: `${id} · ${b.label}`, className: b.className, help: `${id} : ${r.text}${signale} ${b.help}` };
}

/** Badges d'une liste de règles (sans doublon, dans l'ordre), règles mesurées omises. */
export const ruleBadges = (ids = [], rules) => [...new Set(ids)].map((id) => ruleBadge(id, rules)).filter(Boolean);

// --- Avant le calcul ---

export const TITLE = 'Itinéraire d’ingénierie';
export const NO_PLAN = 'Aucun plan validé : ouvre un plan et clique sur « Valider ce plan ».';
export const NO_RECOMPUTE = 'Le calcul ne se refait que quand tu cliques (ou quand tu valides un plan) : tes sauts ne le changent pas.';
export const UNKNOWN_POSITION = 'Position inconnue : tes journaux n’ont ni saut ni arrivée. Choisis un point de départ, ou fais un saut.';

/** Région d'une position, en mots courts (« Bulle », « Colonia », « hors des deux régions »). */
export const regionShort = (r) => (r === 'Colonia' ? 'Colonia' : r === 'Bulle' ? 'Bulle' : 'hors de la Bulle et de Colonia');

/**
 * Ligne d'un plan validé à cocher : « Krait · validé le 9 nov. · 3 modules à faire » ; modifié depuis : grisé, avec
 * « modifié depuis sa validation : revalide-le ».
 * @param {{ name, at, stale, todo }} p plan validé (GET /route, validated)
 */
export function planCheckText(p) {
  const todo = ok(p.todo) ? ` · ${count(p.todo, 'module', 'modules')} à faire` : '';
  return { text: `${p.name} · validé le ${date(p.at)}${todo}`, note: p.stale ? 'modifié depuis sa validation : revalide-le' : null, disabled: !!p.stale };
}

/** Libellé d'un point de départ (« ma position : Muang (Bulle, lue le 5 nov. à 13:28) », « Sol »…). */
export function startLabel(kind, position = null) {
  if (kind === 'position') {
    if (!position) return 'ma position';
    return `ma position : ${position.system} (${regionShort(position.region)}, lue le ${date(position.at)} à ${time(position.at)})`;
  }
  if (kind === 'sol') return 'Sol';
  if (kind === 'colonia') return 'Colonia';
  return 'le système d’un ingénieur';
}

/** Un ingénieur dans la liste des départs : « Professor Palin (Arque) ». */
export const engineerOptionText = (e) => `${e.name} (${e.system})`;

/** Libellé du bouton de calcul : « Calculer l'itinéraire », puis « Recalculer » (mis en avant s'il y a du nouveau). */
export function computeButton(view) {
  const has = !!view?.result;
  return { label: has ? 'Recalculer' : 'Calculer l’itinéraire', primary: !has || (view?.changes || []).length > 0 };
}

/** « Écartés : » suivi des noms (le bouton « remettre » est à côté de chacun) ; aucun : null. */
export function excludedItems(exclude = [], names) {
  if (!exclude.length) return null;
  return { label: 'Écartés :', items: exclude.map((id) => ({ id, name: nameOf(names, id), action: 'remettre' })) };
}

/** Corps de POST /route qui reprend le départ d'un résultat (Recalculer, Ne pas y passer, remettre). */
export function fromOfResult(result) {
  const f = result?.from;
  if (!f) return 'position';
  if (f.kind === 'engineer') return { engineer: f.engineerId };
  return f.kind;
}

// --- Bandeau du résultat ---

const hypot = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Point de départ choisi, en mots : « Sol », « Colonia », « le système de Palin ». */
function chosenStart(from, names) {
  if (from.kind === 'sol') return 'Sol';
  if (from.kind === 'colonia') return 'Colonia';
  return `le système ${de(from.engineerId != null ? nameOf(names, from.engineerId) : from.system)}`;
}

/** Une raison de « Depuis le calcul : ». */
function changeText(c, view, names) {
  const result = view.result;
  const pName = (id) => planName(result, id) !== `plan ${id}` ? planName(result, id) : view.validated?.find((p) => p.id === id)?.name ?? `plan ${id}`;
  if (c.kind === 'engineer') return c.what === 'debloque' ? `${nameOf(names, c.engineer)} a été débloqué` : `rang ${de(nameOf(names, c.engineer))} : ${c.from} → ${c.to}`;
  if (c.kind === 'pin') return `ton épingle chez ${nameOf(names, c.engineer)} a changé`;
  if (c.kind === 'plan-nouveau') return `le plan « ${pName(c.planId)} » a été validé (il n’est pas dans ce calcul)`;
  if (c.kind === 'plan') {
    if (c.what === 'modifie') return `le plan « ${pName(c.planId)} » a changé (revalide-le)`;
    if (c.what === 'validation-annulee') return `la validation de « ${pName(c.planId)} » a été annulée`;
    if (c.what === 'supprime') return `le plan « ${pName(c.planId)} » a été supprimé`;
    if (c.what === 'revalide') return `le plan « ${pName(c.planId)} » a été revalidé`;
  }
  return null;
}

/**
 * Bandeau d'un itinéraire calculé.
 *   computed : « Calculé depuis Muang (ta position) le 5 nov. à 13:41. », ou « Calculé depuis Sol (point choisi)… » ;
 *   here : où tu es maintenant (départ « ma position » : « ✓ Tu es toujours à … » ou « ⚠ Tu es maintenant à …, à N al
 *     de … » avec [Recalculer] ; départ choisi : « Tu es à …, à N al de … », sans ⚠ : tu n'y as jamais été) ;
 *   changes : « Depuis le calcul : … · … » ; note : l'ordre et les choix datent du calcul.
 * @param {object} view GET /route (result, position, changes, validated)
 * @param {Map<number, string>} names noms des ingénieurs
 */
export function bannerText(view, names) {
  const r = view?.result;
  if (!r) return null;
  const f = r.from;
  const when = `le ${date(r.computedAt)} à ${time(r.computedAt)}`;
  const pos = view.position;
  let computed;
  let here = null;
  if (f.kind === 'position') {
    computed = `Calculé depuis ${f.system} (ta position) ${when}.`;
    const moved = (view.changes || []).find((c) => c.kind === 'position');
    if (moved) here = { text: `⚠ Tu es maintenant à ${moved.to}, à ${al(moved.distanceAl)} de ${moved.from}.`, tone: 'warn', recompute: true };
    else if (pos) here = { text: `✓ Tu es toujours à ${pos.system}.`, tone: 'good', recompute: false };
  } else {
    const start = chosenStart(f, names);
    computed = `Calculé depuis ${start} (point choisi) ${when}.`;
    if (pos && Array.isArray(pos.starPos) && Array.isArray(f.starPos)) here = { text: `Tu es à ${pos.system}, à ${al(hypot(pos.starPos, f.starPos))} de ${start}.`, tone: null, recompute: false };
  }
  const reasons = (view.changes || []).filter((c) => c.kind !== 'position').map((c) => changeText(c, view, names)).filter(Boolean);
  return {
    computed,
    here,
    changes: reasons.length ? `Depuis le calcul : ${reasons.join(' · ')}.` : null,
    note: 'L’ordre et les choix datent du calcul ; les cases faites et les manques sont à jour.',
  };
}

/** Escales de toutes les parties, dans l'ordre. */
export const allStops = (result) => (result?.parts || []).flatMap((p) => p.stops);

/** Pastilles du résumé : escales, distance, applications à distance, déblocages. */
export function summaryPills(result) {
  const stops = allStops(result);
  const remote = (result?.remote || []).reduce((a, t) => a + (t.rolls || 0), 0);
  const unlocks = stops.filter((s) => s.unlock).length;
  return [
    count(stops.length, 'escale', 'escales'),
    `${al(result?.totalAl ?? 0)} à vol d’oiseau`,
    `${count(remote, 'application', 'applications')} à distance`,
    count(unlocks, 'déblocage', 'déblocages'),
  ];
}

/** Comment l'ordre a été trouvé (exact ou approché), et ce que valent les distances. */
export function orderText(result, names) {
  const n = allStops(result).length;
  const f = result?.from;
  const start = !f ? '' : f.kind === 'position' ? f.system : chosenStart(f, names);
  const lines = [];
  if (n && result.exact) {
    lines.push(n === 1 ? `Ordre : une seule escale, depuis ${start} (calcul exact).` : `Ordre : le plus court parmi tous les ordres possibles de ces ${n} escales, depuis ${start}, sans retour (calcul exact).`);
  } else if (n) {
    lines.push(`Ordre approché : trop de choix pour tout comparer (${count(result.effort?.candidates ?? n, 'ingénieur possible', 'ingénieurs possibles')}). Escales prises de proche en proche, puis morceaux du trajet retournés ou déplacés tant que ça raccourcit (2-opt, Or-opt).`);
  }
  lines.push('Distances à vol d’oiseau : en sauts, le trajet réel est plus long ; le total est arrondi à part.');
  return lines;
}

/** Notes du serveur, séparées : celles de la traversée (affichées avec elle) et les autres (en tête). */
export function splitNotes(notes = []) {
  const crossing = /N[’']y va que si tu le veux|Cette traversée est nécessaire|Puisque tu iras/;
  return { crossing: notes.filter((n) => crossing.test(n)), other: notes.filter((n) => !crossing.test(n)) };
}

// --- À distance ---

export const REMOTE_TITLE = 'À distance, quand tu veux';
export const REMOTE_SUBTITLE = 'Depuis n’importe quelle station qui propose l’atelier à distance, ou un porte-vaisseaux ; pas depuis une installation au sol d’Odyssey, ni en taxi ou en équipage. À distance, le rang ne monte pas et aucun effet ne se pose.';

/** Case d'une tâche d'après l'état en direct : ☐ à faire, ▸ en cours, ✓ fait. */
export function markOf(state) {
  if (state === 'fait') return { mark: '✓', state: 'fait' };
  if (state === 'en-cours') return { mark: '▸', state: 'en cours' };
  return { mark: '☐', state: null };
}

/** « déduite, dernier constat le 05/11 », « saisie le 08/11 ». */
const pinSourceText = (pin) => (pin?.source === 'saisie' ? `saisie le ${dayMonth(pin.at)}` : `déduite, dernier constat le ${dayMonth(pin?.at)}`);

/**
 * Une tâche à distance : « ☐ Krait — 5A Réacteur FSD : Portée augmentée G1→G5 · 15 applications · épingle de
 * Felicity Farseer (déduite, dernier constat le 05/11) », avec la réserve d'une épingle déduite, quand la faire, et ses
 * règles à vérifier.
 * @param {object} t tâche de result.remote
 * @param {{ result, live, names }} ctx
 */
export function remoteLine(t, { result, live, names }) {
  const eng = t.labels?.engineerName ?? nameOf(names, t.engineer);
  const m = markOf(live?.done?.[t.id]);
  const text = `${planName(result, t.planId)} — ${t.labels?.moduleLabel ?? t.label} : ${t.labels?.blueprintLabel ?? t.blueprint} ${gradesSpan(t.grades)} · ${count(t.rolls, 'application', 'applications')} · épingle ${de(eng)} (${pinSourceText(t.pin)})`;
  const caveat = t.pin?.source === 'journal' ? `si ton épingle chez ${eng} est toujours « ${t.labels?.blueprintLabel ?? t.blueprint} » (vue le ${dayMonth(t.pin.at)})` : null;
  let when = 'quand tu veux';
  let check = null;
  if (t.split && t.continuesAt != null) {
    const host = allStops(result).find((s) => s.n === t.continuesAt);
    when = `à faire avant l’escale ${t.continuesAt} : ${host ? nameOf(names, host.engineer) : 'l’ingénieur de l’escale'} reprendra au G${t.upTo + 1}`;
    check = `À son atelier, vérifie que le jeu te propose bien le G${t.upTo + 1} avant de payer.`;
  } else if (t.before != null) {
    when = `à faire avant l’escale ${t.before} : l’effet se pose ensuite sur ce module`;
  }
  return { id: t.id, ...m, text, caveat, when, check, rules: t.rules || [] };
}

/** Atelier à distance là où tu es : « ✓ Faisable ici… », « Pas d'ici : tu es en taxi… », ou rien. */
export function remoteHereText(rh) {
  if (!rh) return null;
  if (rh.ok) {
    return rh.onFoot
      ? { tone: 'good', text: `✓ Faisable ici, depuis ton vaisseau : tu es à quai à ${rh.station} (remonte à bord).` }
      : { tone: 'good', text: `✓ Faisable ici : tu es à quai à ${rh.station}.` };
  }
  if (rh.why === 'taxi') return { tone: 'warn', text: 'Pas d’ici : tu es en taxi, sans ton vaisseau.' };
  if (rh.why === 'équipage') return { tone: 'warn', text: 'Pas d’ici : tu es dans l’équipage d’un autre joueur.' };
  return null;
}

// --- Parties et escales ---

/** Filleuls d'une partie (tâches « référence ») : « Mel Brandon », « A et B ». */
const godchildren = (part, names) => andList([...new Set(part.stops.flatMap((s) => s.tasks.filter((t) => t.kind === 'reference').map((t) => nameOf(names, t.for))))]);

/**
 * Titre d'une partie de l'itinéraire, et sa ligne de détail (escales, distance).
 * part.region : la région de ses escales (pour la traversée : l'autre région).
 */
export function partTitle(part, names) {
  const n = part.stops.length;
  const detail = `${count(n, 'escale', 'escales')} · ${al(part.totalAl)}`;
  if (part.kind === 'region') return { title: `Dans ${regionName(part.region)} — ${detail}`, detail: null };
  if (part.kind === 'a-preparer') return { title: `Dans ${regionName(part.region)}, à préparer — ingénieurs à faire inviter d’abord`, detail };
  if (part.kind === 'traversee') {
    const to = `Traversée vers ${regionName(part.region)} (signalée)`;
    return { title: part.required ? `${to} — nécessaire pour connaître ${godchildren(part, names) || 'un ingénieur de ta région'}` : `${to} — seulement pour ce que personne ne fait dans ta région`, detail };
  }
  return { title: `De retour ${inRegion(part.region)}, à préparer — ingénieurs connus grâce à la traversée`, detail };
}

/**
 * En-tête d'une escale : « 1. Professor Palin · Arque · +98,0 al (cumul 98,0 al) · Abel Laboratory, 2 372 sl de
 * l'arrivée ».
 * @param {object} stop escale du résultat
 * @param {object|null} eng ligne de GET /engineers (système, base)
 */
export function stopHeader(stop, eng, names) {
  const who = eng?.name ?? nameOf(names, stop.engineer);
  const where = eng ? ` · ${eng.system}` : '';
  const base = eng?.base ? ` · ${eng.base}, ${nf0.format(stop.arrivalLs ?? eng.arrivalLs ?? 0)} sl de l’arrivée` : '';
  return `${stop.n}. ${who}${where} · +${al(stop.legAl)} (cumul ${al(stop.cumulAl)})${base}`;
}

/** Permis : « permis : aucun », « permis de Sirius : vu », « permis de Founders World : à obtenir ». */
export function permitShort(permit) {
  if (!permit?.required) return 'permis : aucun';
  return `permis de ${permit.name || 'système'} : ${permit.seen ? 'vu' : 'à obtenir'}`;
}

/**
 * État d'un ingénieur à une escale : « Bulle · débloqué, rang 5 · permis : aucun · à 98,0 al de toi ».
 * L'état est celui d'aujourd'hui (GET /engineers) ; « pas encore découvert » ou « état inconnu » viennent du calcul
 * (le relevé ne dit pas un ingénieur absent).
 */
export function stopStateText(stop, eng, result) {
  const progress = progressOf(eng?.state?.progress ?? null, result?.inputs?.engineers?.[String(stop.engineer)]?.progress ?? null);
  const rank = eng?.state?.rank ?? result?.inputs?.engineers?.[String(stop.engineer)]?.rank ?? null;
  const state = progress === 'Unlocked' ? `débloqué, rang ${rank ?? 'inconnu'}` : progress === 'Invited' ? 'invité : à débloquer' : PROGRESS_TEXT[progress] ?? PROGRESS_TEXT.unknown;
  const parts = [regionWord(eng?.region), state, permitShort(eng?.permit)];
  if (ok(eng?.distanceAl)) parts.push(`à ${al(eng.distanceAl)} de toi`);
  return parts.filter(Boolean).join(' · ');
}

/**
 * Une tâche d'escale : grades, effet, ou montée de référence, avec sa case en direct.
 * « ☐ Krait — 5A Propulseurs : Sale G1→G5 (15 appl.) » ; « ☐ Krait — 5A Réacteur FSD : effet « Gestionnaire de masse » » ;
 * « ☐ Monter Selene Jean au rang 3 et à la moitié de la barre vers le rang 4, pour connaître Didi Vatermann : … ».
 */
export function taskLine(t, stop, { result, live, names }) {
  const m = markOf(live?.done?.[t.id]);
  if (t.kind === 'reference') {
    const host = nameOf(names, stop.engineer);
    const c = t.climb;
    const how = c
      ? `environ ${count(c.rolls, 'application', 'applications')} de « ${c.blueprintLabel} » (${c.groupLabel}) sur un module de ce type acheté exprès (pas un module d’un plan : la première application effacerait ses grades)`
      : 'des applications à son atelier, sur un module acheté exprès (pas un module d’un plan : la première application effacerait ses grades)';
    return { id: t.id, ...m, text: `Monter ${host} au rang 3 et à la moitié de la barre vers le rang 4, pour connaître ${nameOf(names, t.for)} : ${how}`, rules: t.rules || [] };
  }
  const head = `${planName(result, t.planId)} — ${t.labels?.moduleLabel ?? t.label}`;
  if (t.kind === 'effet') return { id: t.id, ...m, text: `${head} : effet « ${t.labels?.experimentalLabel ?? t.experimental} »`, rules: t.rules || [] };
  return { id: t.id, ...m, text: `${head} : ${t.labels?.blueprintLabel ?? t.blueprint} ${gradesSpan(t.grades)} (${t.rolls} appl.)`, rules: t.rules || [] };
}

/** Repli d'un effet qui dépend de R5b : « Si Palin ne te propose pas l'effet sur ce module G5 (règle à vérifier), Felicity le fera : +128,1 al. » */
export function fallbackText(t, stop, names) {
  if (!t.fallback) return null;
  return `Si ${nameOf(names, stop.engineer)} ne te propose pas l’effet sur ce module G${t.gradeAtEffect} (règle à vérifier), ${nameOf(names, t.fallback.engineer)} le fera : +${al(t.fallback.extraAl)}.`;
}

export const VARIANT_TEXT = 'Autre ordre possible : l’effet d’abord sur un G1 ici, puis les grades à distance. Il dépend d’une autre règle à vérifier : l’effet gardé en montant à distance (signalé par un joueur).';

/**
 * Avertissements des modules d'une escale (ou d'une tâche à distance), sans doublon par module :
 *   R7 : le module porte une autre modification, qui sera effacée ;
 *   R7c : un autre effet sur le même plan remplacera le premier (à vérifier) ;
 *   newModule : le module visé n'est pas encore monté ;
 *   R3f : une épingle d'un autre type de module n'est pas comptée.
 */
export function warningLines(tasks = [], { result, names } = {}) {
  const out = [];
  const seen = new Set();
  for (const t of tasks) {
    for (const w of t.warnings || []) {
      const key = `${t.planId}/${t.slot}|${w.rule}|${w.engineer ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const mod = `${t.labels?.moduleLabel ?? t.label} (${planName(result, t.planId)})`;
      const target = t.labels?.blueprintLabel ?? t.blueprint;
      if (w.rule === 'R7') {
        const c = w.current || {};
        const effect = c.experimentalLabel ? ` et l’effet « ${c.experimentalLabel} »` : '';
        const author = c.engineerName ? ` (${c.engineerName})` : '';
        out.push({ rule: 'R7', tone: 'bad', text: `⚠ ${mod} : ce module porte « ${c.blueprintLabel ?? c.blueprint} » G${c.grade}${effect}${author} : la première application de « ${target} » efface ${c.experimentalLabel || c.experimental ? 'ses grades et son effet' : 'ses grades'}, sans retour.` });
      } else if (w.rule === 'R7c') {
        out.push({ rule: 'R7c', tone: 'warn', text: `${mod} : « ${w.fromLabel ?? w.from} » sera remplacé par « ${w.toLabel ?? w.to} » (à vérifier).` });
      } else if (w.rule === 'newModule') {
        out.push({ rule: 'newModule', tone: 'warn', text: `Il te faut d’abord ce module : ${w.moduleLabel ?? w.module} (pas encore monté, plan « ${planName(result, t.planId)} »).` });
      } else if (w.rule === 'R3f') {
        out.push({ rule: 'R3f', tone: 'warn', text: `Ton épingle chez ${nameOf(names, w.engineer)} (${w.pinGroupLabel ?? w.pinGrp}) ne compte pas pour ${mod} : pour un autre type de module, ce n’est pas vérifié.` });
      }
    }
  }
  return out;
}

const REVISIT_WHY = { 'trop petit': 'emplacement trop petit', réservé: 'compartiment réservé', masse: 'trop lourd pour lui' };
export const NO_SHIPYARD = 'Pas de chantier naval dans les bases d’ingénieurs (aucune des 10 bases relevées dans les journaux de référence n’en a) ; l’équipement, oui : tu ne pourras pas y changer de vaisseau.';

/**
 * Vaisseau à amener à une escale (R13, R16) : un seul plan, ou plusieurs vaisseaux (modules montés sur celui qui vient,
 * seconde visite pour ceux qui n'y rentrent pas).
 */
export function vehicleLines(stop, { result } = {}) {
  const plans = plansOf(result);
  const bring = stop.bring || [];
  if (!bring.length) return [];
  const modOf = (planId, slot) => {
    const t = (stop.tasks || []).find((x) => x.planId === planId && x.slot === slot);
    return t?.labels?.moduleLabel ?? slot;
  };
  const planWords = (id) => {
    const p = plans.get(id);
    return { model: p?.model ?? 'vaisseau', name: p?.name ?? `plan ${id}` };
  };
  if (bring.length === 1) {
    const p = planWords(bring[0].planId);
    return [{ tone: null, text: `À amener : ton ${p.model} (plan « ${p.name} »).` }];
  }
  const v = planWords(stop.vehicle?.planId ?? bring[0].planId);
  const out = [{ tone: null, text: `À amener : ton ${v.model} (plan « ${v.name} »).` }];
  for (const tr of stop.transfers || []) {
    const b = planWords(tr.planId);
    out.push({ tone: null, text: `Avec ${modOf(tr.planId, tr.slot)} du ${b.model} (plan « ${b.name} ») monté dessus à la place du sien (${tr.toLabel ?? tr.to}) : il y rentre. Pour le déplacer, entrepose-le depuis le ${b.model} dans une station avec équipement, puis récupère-le sur le ${v.model} (ou fais-le transférer : le jeu donne le prix et le délai).` });
  }
  for (const r of stop.revisits || []) {
    const b = planWords(r.planId);
    const mods = andList((r.slots || []).map((s) => modOf(r.planId, s)));
    const verb = (r.slots || []).length > 1 ? 'ne rentrent pas' : 'ne rentre pas';
    out.push({ tone: 'warn', text: `⚠ ${mods} du ${b.model} ${verb} sur le ${v.model} (${REVISIT_WHY[r.why] ?? r.why}) : il faudra revenir ici avec le ${b.model} (seconde visite comptée : +${alNum(r.extraW)} al-éq.).` });
  }
  out.push({ tone: 'muted', text: NO_SHIPYARD });
  return out;
}

/** Rang à une escale : « Rang 3 → 5 : 10 applications en plus. » ; rien quand le rang ne coûte rien. */
export function rankLine(stop) {
  const r = stop.rank;
  if (!r) return null;
  const extra = r.extraRolls ?? 0;
  if (!(extra > 0) && !(r.to > r.from)) return null;
  const head = r.to > r.from ? `Rang ${r.from} → ${r.to}` : `Rang ${r.from}`;
  return `${head} : ${count(extra, 'application', 'applications')} en plus.`;
}

/**
 * Ordre conseillé chez l'ingénieur de l'escale, dans la forme de rankView.orderText (les tâches du calcul de
 * l'itinéraire sont nommées par leur module).
 */
export function stopOrder(stop) {
  const labelOf = new Map((stop.tasks || []).map((t) => [t.id, t.labels?.moduleLabel ?? t.label]));
  return (stop.rank?.order || []).map((o) => {
    if (o.up) return o;
    if (o.extra) return { extra: { ...o.extra, slot: o.extra.task ?? undefined, label: o.extra.task ? labelOf.get(o.extra.task) : undefined } };
    return { slot: o.task, label: labelOf.get(o.task) ?? o.task, grade: o.grade, count: o.count };
  });
}

/** « Ordre conseillé : 5A Propulseurs : G1 ×3 → rang 4 → … » quand le rang compte (sous le rang 5, ou applications en plus) ; sinon rien. */
export function stopOrderText(stop) {
  const r = stop.rank;
  if (!r || !(r.from < 5 || r.extraRolls > 0) || !(r.order || []).length) return null;
  return `Ordre conseillé : ${rankOrderText(stopOrder(stop))}`;
}

export const UNLOCK_TITLE = 'D’abord, le débloquer :';

/** Où est le parrain d'une découverte : « dans ta région », « dans la Bulle », « à Colonia ». */
const whereFrom = (region, home) => (region === home ? 'dans ta région' : inRegion(region));

/**
 * Étapes de déblocage d'un ingénieur à une escale, numérotées : découverte (référence de…), invitation, déblocage à sa
 * base (chaque objet avec ce que tu as : jamais « ✓ » pour des primes ou des obligations, que l'app ne voit pas),
 * permis. → [{ kind, text, note, items?: [{ text, tone }] }]
 */
export function unlockLines(unlock, { names, home } = {}) {
  if (!unlock?.steps?.length) return [];
  return unlock.steps.map((s) => {
    if (s.kind === 'decouverte') {
      const p = s.parent;
      if (!p) return { kind: s.kind, text: `Le connaître : ${s.text}`, note: s.check?.note ?? null };
      const state = progressOf(p.progress, null) === 'Unlocked' ? `débloqué, rang ${p.rank ?? 'inconnu'}` : PROGRESS_TEXT[progressOf(p.progress, null)] ?? PROGRESS_TEXT.unknown;
      const stop = p.stop != null ? ` — c’est l’escale ${p.stop}` : '';
      return { kind: s.kind, text: `Le connaître : référence ${de(p.name ?? nameOf(names, p.id))} (${state} ; ${whereFrom(p.region, home)})${stop}`, note: s.check?.note ?? null };
    }
    if (s.kind === 'invitation') {
      return { kind: s.kind, text: `Être invité : ${s.text} (l’app ne le voit pas)${s.acquainted ? '. Si tu es déjà invité, va directement le débloquer.' : ''}`, note: null };
    }
    if (s.kind === 'deblocage') {
      return { kind: s.kind, text: 'Le débloquer à sa base :', note: null, items: (s.items || []).map((it) => unlockItemText(it, it.check)) };
    }
    if (s.kind === 'permis') return { kind: s.kind, text: `Obtenir le permis ${s.name ? `de ${s.name}` : 'du système'}${s.condition ? ` : ${s.condition}` : ''}`, note: null };
    return { kind: s.kind, text: s.text || s.kind, note: null };
  });
}

/**
 * Matériaux d'une escale, à jour (live.missing) : « Matériaux ici : tout est là ✓ » ou « Il te manquera 3 matériaux :
 * Arsenic −2, … » (4 au plus, puis « et N autres »). Escale sans matériaux (effet seul, déblocage) : rien.
 */
export function materialsLine(stop, live) {
  const labels = new Map((stop.materials || []).map((m) => [m.key, m.label]));
  if (!stop.materials?.length) return null;
  const missing = live?.missing?.[stop.n] ?? stop.materials.filter((m) => m.missing > 0).map((m) => ({ key: m.key, missing: m.missing }));
  if (!missing.length) return { tone: 'good', text: 'Matériaux ici : tout est là ✓' };
  const shown = missing.slice(0, 4).map((m) => `${labels.get(m.key) ?? m.key} −${nf0.format(m.missing)}`);
  const rest = missing.length - shown.length;
  return { tone: 'bad', text: `Il te manquera ${count(missing.length, 'matériau', 'matériaux')} : ${shown.join(', ')}${rest > 0 ? ` et ${count(rest, 'autre', 'autres')}` : ''}` };
}

/** « En débloquant Lei Cheung, l'itinéraire serait plus court de 120,5 al-éq. (2 étapes de déblocage). » */
export function ifUnlockedText(ifUnlocked, names) {
  if (!ifUnlocked?.engineers?.length) return null;
  return `En débloquant ${andList(ifUnlocked.engineers.map((id) => nameOf(names, id)))}, l’itinéraire serait plus court de ${alNum(ifUnlocked.gainW)} al-éq. (${count(ifUnlocked.steps ?? 0, 'étape', 'étapes')} de déblocage).`;
}

/** Un travail que personne ne peut faire : « Krait — 5A Réacteur FSD : {raison du serveur} ». */
export function impossibleLine(it, result) {
  return `${planName(result, it.planId)} — ${it.labels?.moduleLabel ?? it.label} : ${it.text}`;
}

export const LEGEND = 'al-éq. : distance équivalente qui compte aussi chaque escale (100 al-éq.), la supercroisière jusqu’à la base (2 × √sl), chaque application en plus due aux rangs (25 al-éq.) et une seconde visite avec un autre vaisseau (100 al-éq. de plus) : réglages de l’app, à ajuster.';

/** Fichier de l'itinéraire mis de côté, non relu ou d'une version plus récente (warnings de GET /route). */
export function storeWarningText(w) {
  if (w.kind === 'mis de côté') {
    const pins = w.file === 'des épingles' ? ' Tes saisies sont à refaire ; les épingles déduites de tes journaux restent.' : '';
    return `Ton fichier ${w.file} était illisible : il a été mis de côté (${w.aside}).${pins}`;
  }
  if (w.kind === 'non lu') return `Le fichier ${w.file} n’a pas pu être relu (${w.code}) : rien n’y est enregistré pour l’instant, pour ne pas l’écraser. Ferme ce qui le bloque (OneDrive, antivirus…).`;
  return `Le fichier ${w.file} vient d’une version plus récente de l’app : il n’est ni lu ni écrasé.`;
}

// --- Pourquoi lui ? ---

const COST_VERDICTS = new Set(['plus-loin', 'deja-escale', 'verrouille', 'rang', 'permis']);

/** Une option écartée, en une phrase (verdict du serveur). */
export function optionText(o, { names, engs } = {}) {
  const X = nameOf(names, o.engineer);
  const e = engs?.get?.(o.engineer);
  switch (o.verdict) {
    case 'plus-loin': return `${X}${e?.system ? ` (${e.system})` : ''} : environ ${signed(o.addedW)} al-éq.`;
    case 'deja-escale': return `${X} est déjà une escale.`;
    case 'verrouille': return `${X} : pas encore débloqué (il te reste ${count(o.steps ?? 0, 'étape', 'étapes')}${o.crossing ? ', dont une traversée pour sa référence' : ''}).`;
    case 'grade-max': return `${X} ne monte ce plan qu’au G${o.maxGrade}.`;
    case 'rang': return `${X} : rang ${o.rank}, la montée coûterait ${count(o.extraRolls, 'application', 'applications')} de plus.`;
    case 'autre-region': return `${X} : écarté, il est ${inRegion(o.region)} (${al(o.fromYouAl)}) : jamais pour un travail possible ici.`;
    case 'ecarte': return `${X} : tu l’as écarté.`;
    case 'banni': return `${X} : banni.`;
    case 'permis': return `${X} : permis de ${e?.permit?.name ?? 'son système'} à obtenir.`;
    default: return `${X}.`;
  }
}

/**
 * « Pourquoi lui ? » d'une escale, en phrases :
 *   title ; units : par travail fait ici, la phrase d'ouverture, puis les autres options (au plus 4, « … et N autres
 *   options ») ; locked : « Il n'est pas encore débloqué : je te propose de le débloquer… » quand l'autre région a quelqu'un
 *   de débloqué ; without : ce que coûterait de s'en passer ; cost : ce que ce choix coûte.
 * @param {object} stop escale du résultat (why, tasks, rank, unlock, legAl)
 * @param {{ result, names, engs: Map<number, object> }} ctx
 */
export function whyText(stop, { result, names, engs } = {}) {
  const why = stop.why;
  if (!why) return null;
  const name = nameOf(names, stop.engineer);
  const H = result?.from?.region ?? 'Bulle';
  const tasks = new Map((stop.tasks || []).map((t) => [t.id, t]));
  const hasGrades = (stop.tasks || []).some((t) => t.kind === 'grades');
  const units = [];
  let locked = null;
  for (const u of why.units || []) {
    const t = tasks.get(u.id);
    if (!t) continue;
    const bp = t.labels?.blueprintLabel ?? t.blueprint;
    const mod = t.labels?.moduleLabel ?? t.label;
    const lines = [];
    if (u.kind === 'grades') {
      const g = t.grades.at(-1);
      const rivals = (u.others || []).filter((o) => COST_VERDICTS.has(o.verdict) && o.addedW != null).sort((a, b) => a.addedW - b.addedW);
      if (!rivals.length) lines.push(`Dans ${regionName(H)}, seul ${name} monte « ${bp} » (${mod}) au G${g}.`);
      else {
        const best = rivals[0];
        const more = best.addedAl > 0.05 ? `${nameOf(names, best.engineer)} est à ${al(best.addedAl)} de plus` : `${nameOf(names, best.engineer)} coûterait environ ${signed(best.addedW)} al-éq.`;
        lines.push(`Dans ${regionName(H)}, ${name} et ${andList(rivals.map((o) => nameOf(names, o.engineer)))} montent « ${bp} » au G${g} ; ${more}.`);
      }
      if (t.afterRemote) {
        const rt = (result?.remote || []).find((x) => x.id === t.id);
        const first = rt?.grades?.[0] ?? 1;
        const upTo = t.afterRemote.upTo;
        const remote = first === upTo ? `Le G${first} se fait` : `Les G${first} à G${upTo} se font`;
        const rest = upTo + 1 === g ? `le G${g}` : `G${upTo + 1} à G${g}`;
        lines.push(`${remote} à distance chez ${nameOf(names, t.afterRemote.engineer)}, grâce à ton épingle : ici, il ne reste que ${rest}.`);
      }
      if (u.pinSkipped) {
        const p = u.pinSkipped;
        lines.push(`Ton épingle chez ${nameOf(names, p.engineer)} permettrait ${gradesWords(p.from, p.upTo)} à distance, mais ici ${p.from === p.upTo ? 'il sert' : 'ils servent'} à la montée ${de(name)} : ${p.from === p.upTo ? 'le faire' : 'les faire'} à distance coûterait ${count(p.extraRolls, 'application', 'applications')} de plus.`);
      }
      const other = (u.others || []).find((o) => o.verdict === 'autre-region');
      if (stop.unlock && other && !locked) {
        locked = `Il n’est pas encore débloqué : je te propose de le débloquer. ${nameOf(names, other.engineer)} fait aussi ce plan au G${g}, mais ${inRegion(other.region)} (${al(other.fromYouAl)}) : je ne t’envoie pas ${inRegion(other.region)} pour ce qu’un ingénieur de ${regionName(H)} peut faire.`;
      }
    } else if (u.kind === 'effet') {
      const exp = t.labels?.experimentalLabel ?? t.experimental;
      const also = hasGrades ? 'aussi ' : '';
      lines.push((t.rules || []).includes('R5b')
        ? `Il peut ${also}poser « ${exp} » sur ton ${mod} : il propose « ${bp} » jusqu’au G${t.maxGrade}, et pour un effet le grade ne compte pas (à vérifier : signalé par un joueur le 8 nov.).`
        : `Il pose ${also}« ${exp} » sur ton ${mod} : il propose « ${bp} » jusqu’au G${t.maxGrade}.`);
    }
    const options = (u.others || []).map((o) => optionText(o, { names, engs }));
    if (u.more > 0) options.push(`… et ${count(u.more, 'autre option', 'autres options')}.`);
    units.push({ id: u.id, lines, options });
  }
  for (const t of (stop.tasks || []).filter((x) => x.kind === 'reference')) {
    units.push({ id: t.id, lines: [`${name} est là pour la référence : au rang 3 et à la moitié de la barre vers le rang 4, il te fait connaître ${nameOf(names, t.for)}.`], options: [] });
  }
  const w = why.without;
  let without = null;
  if (w?.feasible) {
    const by = w.replacedBy?.length ? andList(w.replacedBy.map((id) => nameOf(names, id))) : 'les autres escales';
    const unlocks = w.dUnlocks > 0 ? `, et ${count(w.dUnlocks, 'déblocage', 'déblocages')} de plus` : '';
    const crossing = w.crossing ? ', avec une traversée pour une référence' : '';
    without = `Sans ${name} : ${by}, ${signed(w.dW)} al-éq. (trajet ${signed(w.dPathAl)} al, supercroisière ${signed(w.dSupercruiseAl)}, ${signedInt(w.dStops)} ${plural(w.dStops, 'escale', 'escales')}, ${signedInt(w.dRolls)} ${plural(w.dRolls, 'application', 'applications')})${unlocks}${crossing}.`;
  } else if (w?.crossing) {
    without = `Sans ${name}, il faudrait traverser jusqu’à ${regionName(otherRegion(H))}.`;
  } else if (w) {
    without = `Sans ${name}, personne ne le fait.`;
  }
  const extra = stop.rank?.extraRolls ?? 0;
  const tail = [];
  if (stop.unlock) tail.push(`son déblocage (${count(stop.unlock.totalSteps ?? 0, 'étape', 'étapes')})`);
  if (extra > 0) tail.push(`${count(extra, 'application', 'applications')} en plus pour son rang`);
  const dist = (stop.legAl ?? 0) < 0.05 ? '0 al de plus (escale déjà prévue)' : `+${al(stop.legAl)}`;
  const cost = `Ce choix coûte : ${dist}${tail.length ? `, et ${andList(tail)}` : ', ni déblocage, ni montée de rang'}.`;
  return { title: `Pourquoi ${name} ?`, units, locked, without, cost };
}

// --- Bloc « Valider ce plan » (page du plan) ---

/** Une cible d'un plan, en mots : « Portée augmentée G5 + effet Gestionnaire de masse », « (rien) ». */
function targetWords(x) {
  if (!x) return '(rien)';
  const bp = x.blueprintLabel ?? x.blueprint;
  return `${bp} G${x.grade}${x.experimental ? ` + effet ${x.experimentalLabel ?? x.experimental}` : ''}`;
}

/**
 * Un changement depuis la validation : « Réacteur FSD : G5 → G4 », « Réacteur FSD : Portée augmentée → Démarrage
 * rapide », « Réacteur FSD : effet Gestionnaire de masse → Refroidi », « Propulseurs : (rien) → Sale G5 ».
 */
export function changeLine(c) {
  const a = c.from;
  const b = c.to;
  let what;
  if (!a || !b) what = `${targetWords(a)} → ${targetWords(b)}`;
  else {
    const bits = [];
    if (a.module !== b.module) bits.push(`${a.moduleLabel ?? a.module ?? '(vide)'} → ${b.moduleLabel ?? b.module ?? '(vide)'}`);
    if (a.blueprint !== b.blueprint) bits.push(`${a.blueprintLabel ?? a.blueprint} → ${b.blueprintLabel ?? b.blueprint}`);
    if (a.grade !== b.grade) bits.push(`G${a.grade} → G${b.grade}`);
    if ((a.experimental ?? null) !== (b.experimental ?? null)) bits.push(`effet ${a.experimental ? a.experimentalLabel ?? a.experimental : 'aucun'} → ${b.experimental ? b.experimentalLabel ?? b.experimental : 'aucun'}`);
    what = bits.join(', ') || 'modifié';
  }
  return `${c.label} : ${what}`;
}

/**
 * Textes du bloc « Valider ce plan » de la page du plan.
 * @param {object|null} validation GET /plans/:id → validation (null : pas validé)
 * @param {{ calc?: { modulesDone, modulesTotal }, route?: object|null }} [o] route : réponse du dernier clic de
 *   validation (calcul fait, position inconnue, erreur)
 * @returns {{ state: 'aucune'|'valide'|'modifie', lines: { text, tone }[], buttons: string[], changes: string[], link: boolean }}
 */
export function validationText(validation, { calc = null, route = null } = {}) {
  const lines = [];
  const notes = [];
  if (validation?.bound === false) notes.push({ text: 'Ce plan n’est rattaché à aucun de tes vaisseaux : la fiche chez l’ingénieur te demandera quel vaisseau porte ses modules.', tone: 'muted' });
  if (validation?.ship === 'remplace') notes.push({ text: 'Le vaisseau de ce plan a été vendu : son numéro sert maintenant à un autre vaisseau. L’état de ses modules n’est plus connu.', tone: 'warn' });
  if (!validation) {
    return {
      state: 'aucune',
      lines: [
        { text: 'Itinéraire : ce plan n’est pas validé.', tone: null },
        { text: 'Valide-le quand il est prêt : je calcule alors l’itinéraire depuis ta position, et la fiche chez l’ingénieur suivra ce plan.', tone: 'muted' },
      ],
      buttons: ['Valider ce plan'],
      changes: [],
      notes: [],
      link: false,
    };
  }
  if (route) {
    if (route.computed) lines.push({ text: `✓ Validé · itinéraire calculé depuis ${route.system ?? 'ta position'} : ${count(route.stops ?? 0, 'escale', 'escales')}, ${al(route.totalAl ?? 0)}.`, tone: 'good' });
    else if (route.reason === 'position inconnue') lines.push({ text: '✓ Validé. Ta position n’est pas connue (aucun saut ni arrivée dans tes journaux) : choisis un point de départ dans l’onglet Itinéraire.', tone: 'good' });
    else lines.push({ text: `✓ Validé. L’itinéraire n’a pas pu être calculé : ${route.message || 'erreur inconnue'}`, tone: 'warn' });
  }
  if (validation.stale) {
    return {
      state: 'modifie',
      lines: [...lines, { text: `⚠ Modifié depuis la validation du ${date(validation.at)} à ${time(validation.at)} :`, tone: 'warn' }],
      changes: (validation.changes || []).map(changeLine),
      after: 'L’itinéraire et la fiche chez l’ingénieur ne prennent plus ce plan en compte tant que tu ne l’as pas revalidé.',
      notes,
      buttons: ['Revalider avec ces changements', 'Annuler la validation'],
      link: false,
    };
  }
  if (!route) {
    const total = calc?.modulesTotal ?? null;
    const done = calc?.modulesDone ?? null;
    const progress = ok(total) && ok(done) ? ` · ${count(total - done, 'module', 'modules')} à faire, ${count(done, 'fait', 'faits')}` : '';
    lines.push({ text: `✓ Validé le ${date(validation.at)} à ${time(validation.at)}${progress}`, tone: 'good' });
  }
  return { state: 'valide', lines, changes: [], notes, buttons: ['Annuler la validation'], link: true };
}

/** Pastille d'un plan dans le Dashboard et Mes vaisseaux : « validé », « validé · modifié depuis », ou rien. */
export function validationPill(v) {
  if (!v) return null;
  return v.stale ? { label: 'validé · modifié depuis', className: 'pill pill-warn' } : { label: 'validé', className: 'pill pill-good' };
}
