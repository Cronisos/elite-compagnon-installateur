// Fiche d'un ingénieur, côté interface : les phrases communes à une escale de l'itinéraire et à la page de l'ingénieur
// (base, plateformes, état chez toi, conditions de déblocage et ce que tu as déjà, ce qu'il propose, points incertains).
// Fonctions pures, testées sans navigateur (engineerView.test.js). Les faits viennent de data/engineers.json (sources
// publiques) ; l'état (débloqué, rang, épingle) vient de tes journaux.

import { date } from '../../core/format.js';

const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const ok = (n) => n != null && Number.isFinite(Number(n));
const alNum = (d) => (!ok(d) ? '—' : Math.abs(d) < 1000 ? nf1.format(d) : nf0.format(Math.round(d)));
const dayMonth = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : '—');

/**
 * États d'un ingénieur (EngineerProgress du jeu, comme PROGRESS_STATES du serveur) ; « absent » : pas dans un relevé
 * complet ; « unknown » : aucun relevé.
 */
export const PROGRESS_TEXT = Object.freeze({
  Unlocked: 'débloqué',
  Invited: 'invité ✓ : il reste à le débloquer',
  Known: 'connu : pas encore invité',
  Acquainted: 'état « Acquainted » du jeu : sens à vérifier (avant ou après l’invitation)',
  Barred: 'banni',
  absent: 'pas encore découvert',
  unknown: 'état inconnu : lance le jeu pour le relever',
});

/** État retenu : celui d'aujourd'hui s'il est connu, sinon celui du calcul (qui distingue « absent » et « inconnu »). */
export function progressOf(live, computed) {
  if (live && Object.hasOwn(PROGRESS_TEXT, live)) return live;
  if (computed && Object.hasOwn(PROGRESS_TEXT, computed)) return computed;
  return 'unknown';
}

/** État d'une ligne de GET /engineers : sans état, « absent » si un relevé complet a été lu, sinon « inconnu ». */
export const progressOfRow = (e) => progressOf(e?.state?.progress ?? null, e?.state?.surveyed ? 'absent' : 'unknown');

/** « Bulle », « Colonia ». */
export const regionWord = (r) => (r === 'Colonia' ? 'Colonia' : r === 'Bulle' ? 'Bulle' : null);

const BASE_TYPES = Object.freeze({ 'Planetary Outpost': 'avant-poste planétaire', 'Planetary Port': 'port planétaire' });
/** Type de base en français (« avant-poste planétaire », « port planétaire »). */
export const baseTypeText = (t) => (t && Object.hasOwn(BASE_TYPES, t) ? BASE_TYPES[t] : t || 'base');

/** « plateformes L 3 · M 3 · S 2 ». */
export function padsText(pads) {
  if (!pads) return 'plateformes inconnues';
  return `plateformes L ${pads.L ?? 0} · M ${pads.M ?? 0} · S ${pads.S ?? 0}`;
}

/** Montant d'un objet de déblocage : « 500 000 Cr », « 100 000 ou 1 000 000 Cr (les sources ne s'accordent pas) ». */
export function amountText(credits = []) {
  if (credits.length === 2) return `${nf0.format(credits[0])} ou ${nf0.format(credits[1])} Cr (les sources ne s’accordent pas)`;
  return `${nf0.format(credits[0] ?? 0)} Cr`;
}

/**
 * Un objet de déblocage et ce que tu en as (itemCheck du serveur) : marchandise en soute, matériau, crédits ; jamais
 * « ✓ » pour des primes ou des obligations de combat, que l'app ne voit pas.
 * @param {object} it objet (en, fr, label, type, qty, credits)
 * @param {{ state: 'ok'|'manque'|'inconnu', count, need, note }|null} check
 * @returns {{ text: string, tone: 'good'|'bad'|'warn' }}
 */
export function unlockItemText(it, check) {
  const label = it.label ?? it.fr ?? it.en;
  const state = check?.state ?? 'inconnu';
  const tone = state === 'ok' ? 'good' : state === 'manque' ? 'bad' : 'warn';
  if (it.type === 'marchandise') {
    const have = state === 'inconnu' ? 'soute pas encore relue' : `en soute : ${nf0.format(check.count ?? 0)} / ${nf0.format(it.qty)}${state === 'ok' ? ' ✓' : ''}`;
    const note = state !== 'inconnu' && check?.note ? ` (${check.note})` : '';
    return { text: `${label} ×${nf0.format(it.qty)} → ${have}${note}`, tone };
  }
  if (it.type === 'materiau') {
    const have = state === 'inconnu' ? 'matériaux pas encore relus' : `${nf0.format(check.count ?? 0)} / ${nf0.format(it.qty)}${state === 'ok' ? ' ✓' : ''}`;
    return { text: `${label} ×${nf0.format(it.qty)} → ${have}`, tone };
  }
  if (it.type === 'credits') {
    const need = it.credits?.[0] ?? check?.need ?? 0;
    const have = state === 'ok' ? 'ton solde suffit ✓' : state === 'manque' ? `il te manque ${nf0.format(Math.max(0, need - (check.count ?? 0)))} Cr` : 'solde inconnu';
    return { text: `${amountText(it.credits || [need])} → ${have}`, tone };
  }
  if (it.type === 'primes') {
    return { text: `primes (« ${it.en || 'Bounty Vouchers'} ») pour ${amountText(it.credits || [])} → l’app ne voit pas tes primes en attente : vérifie-les dans le jeu`, tone: 'warn' };
  }
  if (it.type === 'obligations') {
    return { text: `obligations de combat (« ${it.en || 'Combat Bonds'} ») pour ${amountText(it.credits || [])} → l’app ne voit pas tes obligations en attente : vérifie-les dans le jeu`, tone: 'warn' };
  }
  return { text: label, tone: 'warn' };
}

/**
 * Permis de la base : « permis : aucun », ou « permis : Founders World (condition) : vu | à obtenir ».
 * seen : vrai si l'ingénieur est débloqué ou si tes journaux montrent son système.
 */
export function permitText(permit) {
  if (!permit?.required) return 'permis : aucun';
  const cond = permit.condition ? ` (${permit.condition})` : '';
  return `permis : ${permit.name || 'système sous permis'}${cond} : ${permit.seen ? 'vu' : 'à obtenir'}`;
}

/**
 * Points incertains d'une fiche qui comptent pour cette escale : la base (MarketID, corps, coordonnées), toujours ; et,
 * s'il faut le débloquer, ses conditions (découverte, invitation, déblocage, réputation, permis).
 */
export function uncertainFor(eng, { unlock = false } = {}) {
  const always = ['marketId', 'market_id', 'base', 'body', 'coords'];
  const forUnlock = ['unlock', 'invitation', 'discovery', 'reputationNotes', 'permit'];
  const prefixes = unlock ? [...always, ...forUnlock] : always;
  return (eng?.uncertain || []).filter((u) => prefixes.some((p) => String(u.field).startsWith(p))).map((u) => `⚠ À vérifier : ${u.reason}`);
}

/** Libellé d'une épingle (« Efficace (Laser à faisceau) »), par les libellés de GET /engineers. */
export function pinLabel(pin, labels) {
  if (!pin) return null;
  const bp = pin.label ?? labels?.blueprints?.[pin.blueprint] ?? pin.blueprint;
  const grp = pin.groupLabel ?? labels?.groups?.[pin.grp] ?? pin.grp;
  return `${bp} (${grp})`;
}

/** « déduite le 05/11 », « saisie le 08/11 ». */
export const pinSourceShort = (pin) => (pin?.source === 'saisie' ? `saisie le ${dayMonth(pin.at)}` : `déduite le ${dayMonth(pin?.at)}`);

/**
 * Fiche d'un ingénieur à une escale (toujours visible) : base, ce qu'il propose pour chaque tâche, l'épingle retenue
 * au calcul, et les points incertains qui touchent cette escale.
 * @param {object} eng ligne de GET /engineers
 * @param {{ stop: object, labels: object }} o stop : escale du résultat ; labels : libellés de GET /engineers
 */
export function factsText(eng, { stop = null, labels = null } = {}) {
  const lines = [];
  if (eng) lines.push(`${eng.body || 'corps inconnu'} · ${baseTypeText(eng.baseType)} · ${padsText(eng.pads)}`);
  const seen = new Set();
  for (const t of stop?.tasks || []) {
    if (t.kind !== 'grades' && t.kind !== 'effet') continue;
    const key = `${t.grp}|${t.blueprint}|${t.labels?.moduleLabel ?? t.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(`${t.labels?.moduleLabel ?? t.label} : il propose « ${t.labels?.blueprintLabel ?? t.blueprint} » jusqu’au G${t.maxGrade}`);
  }
  if (stop) lines.push(stop.pin ? `Épingle retenue au calcul : ${pinLabel(stop.pin, labels)} (${pinSourceShort(stop.pin)})` : 'Épingle : aucune connue');
  return { lines, uncertain: uncertainFor(eng, { unlock: !!stop?.unlock }) };
}

/** En-tête de la page d'un ingénieur : « Broo Tarquin — Bulle · à 0,0 al de toi ». */
export function headerText(e) {
  const where = ok(e.distanceAl) ? ` · à ${alNum(e.distanceAl)} al de toi` : '';
  return `${e.name} — ${regionWord(e.region) ?? e.region}${where}`;
}

/** « Broo's Legacy · Muang 5 a · avant-poste planétaire · 176 sl de l'arrivée ». */
export function baseText(e) {
  return [e.base, e.body, baseTypeText(e.baseType), ok(e.arrivalLs) ? `${nf0.format(e.arrivalLs)} sl de l’arrivée` : null].filter(Boolean).join(' · ');
}

/** « Plateformes : L 3 · M 3 · S 2 · permis : aucun ». */
export function padsPermitText(e) {
  return `${padsText(e.pads).replace(/^plateformes/, 'Plateformes :')} · ${permitText(e.permit)}`;
}

/** Progression du rang : « (≈ 24 %) », « (rang maximal) ». */
function rankProgressText(rank, p) {
  if (rank >= 5) return ' (rang maximal)';
  if (!p) return '';
  if (p.known === 'relevé') return ` (${nf0.format(p.min)} % au dernier relevé)`;
  const lo = Math.floor(p.min);
  const hi = Math.floor(p.max);
  return ` (≈ ${lo === hi ? lo : `${lo} à ${hi}`} %)`;
}

/**
 * « Chez toi : débloqué · rang 3 (≈ 24 %) », « invité ✓ : il reste à le débloquer », « pas encore découvert »…
 * @param {object} e GET /engineers/:id (state)
 */
export function homeStateText(e) {
  const p = progressOfRow(e);
  if (p === 'Unlocked') return `Chez toi : débloqué · ${e.state?.rank != null ? `rang ${e.state.rank}${rankProgressText(e.state.rank, e.state.rankProgress)}` : 'rang inconnu'}`;
  return `Chez toi : ${PROGRESS_TEXT[p]}`;
}

/**
 * « Le connaître : Référence de Hera Tani (…). » suivi, s'il y a un parrain, de son état : « (référence de Hera Tani :
 * débloqué, rang 5 — suffisant ✓) » ou « … — il faut le monter au rang 3 et à la moitié de la barre ».
 */
export function discoveryText(e) {
  const base = `Le connaître : ${e.discovery}`;
  const r = e.referral;
  if (!r?.by) return base;
  const st = r.state === 'Unlocked' ? `débloqué, rang ${r.rank ?? 'inconnu'}` : r.state ? PROGRESS_TEXT[progressOf(r.state, null)] : 'état inconnu';
  const verdict = r.ok ? 'suffisant ✓' : 'il faut le monter au rang 3 et à la moitié de la barre';
  return `${base} (référence de ${r.name} : ${st} — ${verdict})`;
}

/**
 * Conditions d'un ingénieur (GET /engineers/:id), une ligne chacune : découverte (avec son parrain), invitation,
 * déblocage (avec ce que tu as de chaque objet), réputation, permis, note.
 * @returns {{ text: string, items?: { text, tone }[], tone?: string }[]}
 */
export function conditionsLines(e) {
  const out = [
    { text: discoveryText(e) },
    { text: `Invitation : ${e.invitation}` },
    { text: `Déblocage : ${e.unlock?.text ?? '—'}`, items: (e.unlock?.items || []).map((it) => unlockItemText(it, it.have)) },
  ];
  if (e.reputationNotes) out.push({ text: `Réputation : ${e.reputationNotes}` });
  out.push({ text: permitText(e.permit).replace(/^permis/, 'Permis') });
  if (e.note) out.push({ text: e.note, tone: 'muted' });
  return out;
}

/** Lien vers la page d'un ingénieur : « Fiche de Broo Tarquin → ». */
export const factLink = (eng) => `Fiche de ${eng.name} →`;

/** Une ligne « Ici, pour tes plans validés » : « Krait — Réacteur FSD · 5A Réacteur FSD : Portée augmentée jusqu'au G5 ; effet possible ici ». */
export function planModuleText(plan, m) {
  return `${plan.name} — ${m.label} : ${m.blueprintLabel ?? m.blueprint} jusqu’au G${m.maxGrade}${m.effectHere ? ' ; effet possible ici' : ''}`;
}

/** Titre du bloc « Ce que tu vas faire là-bas », ou « Rien de prévu chez … dans le dernier itinéraire. » */
export function routeHereText(e) {
  const r = e.route;
  if (!r || (!(r.tasks || []).length && !(r.remote || []).length)) return { title: `Rien de prévu chez ${e.name} dans le dernier itinéraire.`, empty: true };
  const stop = r.stop != null ? ` (escale ${r.stop})` : '';
  return { title: `Ce que tu vas faire là-bas (itinéraire du ${date(r.computedAt)})${stop} :`, empty: false };
}

/** Ce qu'il propose, par type de module : [{ group: 'Laser à faisceau', text: 'Allégé G5 · Efficace G5 · …' }]. */
export function offersByGroup(offers = []) {
  const groups = new Map();
  for (const o of offers) {
    if (!groups.has(o.grp)) groups.set(o.grp, { group: o.groupLabel ?? o.grp, items: [] });
    groups.get(o.grp).items.push(`${o.label ?? o.blueprint} G${o.maxGrade}`);
  }
  return [...groups.values()].sort((a, b) => a.group.localeCompare(b.group, 'fr')).map((g) => ({ group: g.group, text: g.items.join(' · ') }));
}

export const OFFERS_NOTE = 'Un effet expérimental se pose sur tout plan qu’il propose, quel que soit son grade max';

/** État court dans le tableau des ingénieurs : « débloqué · rang 5 », « invité », « connu », « pas encore découvert ». */
export function stateShort(e) {
  const p = progressOfRow(e);
  if (p === 'Unlocked') return `débloqué · rang ${e.state.rank ?? 'inconnu'}`;
  if (p === 'Invited') return 'invité';
  if (p === 'Known') return 'connu';
  if (p === 'Acquainted') return '« Acquainted » (sens à vérifier)';
  if (p === 'Barred') return 'banni';
  if (p === 'absent') return 'pas encore découvert';
  return 'état inconnu';
}

// --- Onglet « Ingénieurs » (liste des 25) ---

/** Titre de la liste : « Ingénieurs · 25 ingénieurs de vaisseau · position : Muang » (ou « inconnue »). */
export const listTitle = (n, position) => `Ingénieurs · ${nf0.format(n)} ingénieurs de vaisseau · position : ${position?.system ?? 'inconnue'}`;

/** Types de module proposés par au moins un ingénieur (filtre « Qui fait »), triés par libellé. */
export function moduleFilterOptions(rows = [], labels = {}) {
  const grps = new Set(rows.flatMap((e) => (e.offers || []).map((o) => o[0])));
  return [...grps].map((g) => ({ grp: g, label: labels.groups?.[g] ?? g })).sort((a, b) => a.label.localeCompare(b.label, 'fr'));
}

/** Plans proposés pour un type de module (filtre « Qui fait »), triés par libellé. */
export function planFilterOptions(rows = [], labels = {}, grp = '') {
  if (!grp) return [];
  const bps = new Set(rows.flatMap((e) => (e.offers || []).filter((o) => o[0] === grp).map((o) => o[1])));
  return [...bps].map((b) => ({ blueprint: b, label: labels.blueprints?.[b] ?? b })).sort((a, b) => a.label.localeCompare(b.label, 'fr'));
}

/**
 * Lignes de la liste après les filtres (région, débloqués seulement, « Qui fait » un plan) ; avec un plan choisi,
 * chaque ligne porte son grade max (maxGrade) et seuls restent ceux qui le proposent. L'ordre (distance) est gardé.
 */
export function filterRows(rows = [], { region = '', unlocked = false, grp = '', blueprint = '' } = {}) {
  const out = [];
  for (const e of rows) {
    if (region && e.region !== region) continue;
    if (unlocked && e.state?.progress !== 'Unlocked') continue;
    let maxGrade = null;
    if (grp && blueprint) {
      maxGrade = (e.offers || []).find((o) => o[0] === grp && o[1] === blueprint)?.[2] ?? 0;
      if (maxGrade < 1) continue;
    } else if (grp && !(e.offers || []).some((o) => o[0] === grp)) continue;
    out.push({ ...e, maxGrade });
  }
  return out;
}

/** Cellules d'une ligne : « Muang (Bulle) », « 98,0 al » ou « — ». */
export const systemCell = (e) => `${e.system} (${regionWord(e.region) ?? e.region})`;
export const distanceCell = (e) => (ok(e.distanceAl) ? `${alNum(e.distanceAl)} al` : '—');
