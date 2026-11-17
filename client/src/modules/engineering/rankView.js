// Mise en forme des rangs d'ingénieur (plan, liste des ingénieurs, « Ce que tes journaux montrent ») : fonctions
// pures, testées sans navigateur. Vocabulaire : « rang » pour l'ingénieur, « grade » pour la modification,
// « application » pour un jet.

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const n0 = (x) => nf.format(Math.round(x));
/**
 * Pourcentage de rang : une décimale sous 10 % (2,0 à 2,5 %), entier au-dessus. Une borne de la table est arrondie
 * vers l'extérieur (basse vers le bas, haute vers le haut) : la fourchette affichée n'est jamais plus serrée que la
 * table.
 */
const roundOut = (x, up) => {
  const k = x < 10 ? 10 : 1;
  const v = x * k;
  return (up ? Math.ceil(v - 1e-9) : Math.floor(v + 1e-9)) / k;
};
const pcLow = (x) => (x < 10 ? nf1.format(roundOut(x, false)) : n0(roundOut(x, false)));
const pcHigh = (x) => (x < 10 ? nf1.format(roundOut(x, true)) : n0(roundOut(x, true)));
const pcSpan = (a, b) => (pcLow(a) === pcHigh(b) ? pcLow(a) : `${pcLow(a)} à ${pcHigh(b)}`);
/** Rapport, une décimale, arrondi vers l'extérieur comme les bornes de la table. */
const ratioLow = (x) => nf1.format(Math.floor(x * 10 + 1e-9) / 10);
const ratioHigh = (x) => nf1.format(Math.ceil(x * 10 - 1e-9) / 10);

/** « 2026-11-01… » → « 1er nov. » (sans fuseau : la date du journal, en UTC). */
export function shortDay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return '—';
  const d = Number(m[3]);
  return `${d === 1 ? '1er' : d} ${MONTHS[Number(m[2]) - 1] || ''}`.trim();
}

const plural = (n, one, many) => (n === 1 ? one : many);
/** « 4 », ou « 3 à 4 » quand le scénario favorable donne moins. */
export function span(low, high) {
  if (low == null || low === high) return n0(high);
  return `${n0(Math.min(low, high))} à ${n0(Math.max(low, high))}`;
}

/** « mesurée 2 fois… » → « Mesurée 2 fois…. » ; plusieurs motifs : une phrase chacun. */
const sentences = (why) => [why].flat().filter(Boolean).map((w) => `${w.charAt(0).toUpperCase()}${w.slice(1)}.`).join(' ');

/**
 * Badge du statut d'une règle (même vocabulaire que les règles de l'escadron). La table des règles est mesurée dans
 * les journaux de référence (source déclarée, GET /ranks/rules) : « tes journaux » ne sert qu'aux mesures en direct.
 * why : le motif du statut tel que la table (ou le calcul, statusWhy) le donne. « à vérifier » a deux motifs
 * possibles : déduite avec une hypothèse (le texte par défaut), ou mesurée trop peu de fois, sans hypothèse ; sans ce
 * motif, l'infobulle dirait une hypothèse qui n'existe pas.
 * « publiée » (table de l'itinéraire) : écrite par une source publique (wiki, données coriolis), pas encore vue dans les
 * journaux de référence.
 * @param {string} status mesurée, publiée, à vérifier, inconnue
 * @param {string|null} source source déclarée de la règle
 * @param {string|string[]|null} why motif(s) du statut
 */
export function statusBadge(status, source = null, why = null) {
  const reasons = sentences(why);
  const from = source ? ` Source : ${source}.` : '';
  if (status === 'mesurée') return { label: 'mesurée', className: 'pill pill-good', help: source ? `Mesurée : ${source}.` : 'Mesurée dans les journaux de référence (ceux qui ont servi à faire la table des règles).' };
  if (status === 'publiée') return { label: 'publiée', className: 'pill pill-info', help: `Publiée : ${source || 'source publique'}. Pas encore vue dans les journaux de référence.` };
  if (status === 'inconnue') return { label: 'inconnue', className: 'pill pill-bad', help: reasons ? `Inconnue. ${reasons} Le calcul prend le cas prudent.` : 'Rien ne permet de la chiffrer : le calcul prend le cas prudent.' };
  return { label: 'à vérifier', className: 'pill pill-warn', help: reasons ? `À vérifier. ${reasons}${from} À confirmer en jeu.` : 'Déduite des mesures avec une hypothèse : à confirmer en jeu.' };
}

/**
 * Progression du rang : relevée au chargement de la partie, ou estimée depuis sa base (ce relevé, le déblocage, ou la
 * dernière montée : le surplus reporté n'est alors pas connu, compté 0 en prudent).
 */
export function progressText(p, rank) {
  if (rank == null) return 'rang inconnu';
  if (rank >= 5) return 'rang maximal';
  if (!p || p.known === 'inconnu') return 'progression inconnue (comptée 0 % en prudent)';
  if (p.known === 'relevé') return `progression ${n0(p.min)} %`;
  const lo = Math.floor(p.min);
  const hi = Math.floor(p.max);
  const b = p.basis;
  const since = b?.kind === 'montée' ? `depuis la montée au rang ${b.rank}, report du surplus non compté en prudent`
    : b?.kind === 'déblocage' ? 'depuis le déblocage'
      : b?.kind === 'relevé' ? 'depuis le dernier chargement de la partie' : 'sans relevé';
  // La table prévoyait déjà la montée, qui n'est pas écrite : l'estimation ne tient plus (écart signalé)
  if (p.known === 'contredit') {
    return `progression inconnue : d’après la table, la montée aurait déjà dû venir (au moins ${n0(Math.floor(p.expectedMin ?? 100))} % estimés ${since}), elle n’est pas écrite dans le journal ; comptée ${n0(lo)} % en prudent, recharge la partie pour la relever`;
  }
  if (p.due) return `la table prévoit la montée à la dernière application (progression estimée ${since})`;
  return `progression ≈ ${lo === hi ? lo : `${lo} à ${hi}`} % (estimée ${since})`;
}

/**
 * Pastille d'une séquence de « Ce que tes journaux montrent » : « écart » quand elle contredit la table ; « en cours »
 * (neutre) tant qu'aucune montée ni aucun relevé ne la ferme ; « conforme » sinon.
 */
export function sequenceBadge(s) {
  if (!s?.ok) return { label: 'écart', className: 'pill pill-bad' };
  if (s.end?.kind === 'en cours') return { label: 'en cours', className: 'pill pill-info' };
  return { label: 'conforme', className: 'pill pill-good' };
}

/** « Liz Ryder (rang 3) », « Juri Ishmaak (rang inconnu) », « Ram Tah (pas encore débloqué) ». */
export function engineerTitle(e) {
  if (e?.locked) return `${e.name} (pas encore débloqué)`;
  return `${e.name} (${e.rank == null ? 'rang inconnu' : `rang ${e.rank}`})`;
}

/**
 * Ingénieur d'une étape du plan (« Ingénieurs par module »), avec le ton de la ligne :
 *   - choisi : « Juri Ishmaak (rang 3) », « Juri Ishmaak (rang inconnu) » quand le journal n'a pas donné son rang ;
 *   - compté chez un ingénieur pas encore débloqué alors qu'un autre, débloqué, propose ce grade (le calcul ne le
 *     retient que s'il coûte strictement moins de matériaux en tout, montée de rang comprise) : on le dit, sans écrire
 *     « aucun ingénieur débloqué » ;
 *   - sinon : « Aucun ingénieur débloqué (Ram Tah : non débloqué) », et chez qui le grade est compté après déblocage.
 * @returns {{ tone: 'good'|'warn'|'bad', text: string }}
 */
export function stepEngineerText(status) {
  if (status?.best) return { tone: 'good', text: engineerTitle(status.best) };
  const list = status?.list || [];
  const later = status?.afterUnlock;
  const start = later ? `après son déblocage (rang ${later.rank ?? 1}, 0 %)` : '';
  const open = list.filter((e) => e.unlocked);
  if (later && open.length) {
    return { tone: 'warn', text: `${later.name} (pas encore débloqué) : compté ${start}, retenu pour le coût total en matériaux, montée de rang comprise, plutôt que ${open.map(engineerTitle).join(', ')}` };
  }
  const who = list.length ? ` (${list.map((e) => `${e.name}${e.unlocked ? ` rang ${e.rank ?? 'inconnu'}` : ' : non débloqué'}`).join(', ')})` : '';
  return { tone: 'bad', text: `Aucun ingénieur débloqué${who}${later ? ` · compté chez ${later.name} ${start}` : ''}` };
}

/** Progression d'un ingénieur du calcul ; pas encore débloqué : son départ après déblocage (rang 1 mesuré, 0 % à vérifier). */
export function engineerProgressText(e) {
  if (e?.locked) return `compté comme après son déblocage : rang ${e.startRank ?? 1}, 0 %`;
  return progressText(e?.progress, e?.rank);
}

/** « 3 G1, 4 G2 et 1 G3 » */
export function gradesText(grades = []) {
  const bits = grades.map((g) => `${g.count} G${g.grade}`);
  return bits.length > 1 ? `${bits.slice(0, -1).join(', ')} et ${bits.at(-1)}` : bits.join('');
}

/**
 * Applications en plus pour une montée : « 8 applications en plus sur un autre module de ce type, neuf (3 G1, 4 G2 et
 * 1 G3), pour passer au rang 4 ». Le module de montée repris au rang suivant : « sur ce même module de montée ».
 * @param {boolean} again le module de montée a déjà servi à une montée précédente
 */
export function extraText(x, again = false) {
  const n = `${n0(x.count)} ${plural(x.count, 'application', 'applications')} en plus`;
  const where = x.kind === 'grade refait' ? `en refaisant le G${x.rank}`
    : again ? `sur ce même module de montée (${gradesText(x.grades)})` : `sur un autre module de ce type, neuf (${gradesText(x.grades)})`;
  return `${n} ${where}, pour passer au rang ${x.rank + 1}`;
}

/** Applications en plus d'un ingénieur, dans l'ordre : chaque montée, en disant si le module de montée est repris. */
export function extraTexts(extras = []) {
  const seen = new Set();
  return extras.map((x) => {
    const again = x.spare != null && seen.has(x.spare);
    if (x.spare != null) seen.add(x.spare);
    return extraText(x, again);
  });
}

/**
 * Fourchette des applications en plus d'un ingénieur : « 3 à 10 applications en plus pour monter son rang ». reroll :
 * le bas de la fourchette suppose de refaire un grade déjà fini (inconnu).
 */
export function extraRange(e) {
  if (!e?.extraCount) return null;
  return {
    text: `${span(e.extraCountFavorable, e.extraCount)} ${plural(e.extraCount, 'application', 'applications')} en plus pour monter son rang`,
    reroll: !!e.extraFavorableReroll && e.extraCountFavorable < e.extraCount,
  };
}

/**
 * À quel rang faire les applications d'un grade (scénario prudent, byRank du calcul) : le nombre d'applications d'un
 * grade n'est juste qu'à ces rangs. Rien quand tout se fait au rang de départ ; « (au rang 4) » ; « (3 au rang 3, puis
 * 2 au rang 4) » quand le grade monte le rang lui-même ; et quand le grade attend une montée faite ailleurs (un autre
 * module du plan, ou les applications en plus), on le dit : « (1 au rang 3, puis 3 au rang 5, à reprendre après la
 * montée au rang 5 faite avec « Lance-missiles n°1 ») ». Le compte n'est juste qu'à ces rangs : un grade compté « (au
 * rang 4) » mais fait en entier au rang 3 demanderait une application de plus ; ce G3 repris au rang 5 (1 + 3), fini
 * au rang 4, en demanderait 1 + 4. Une montée d'un seul rang au milieu d'un grade, elle, ne change pas son nombre
 * d'applications (k au rang r, puis n − k au rang suivant : 3 + 2, 2 + 3, 1 + 4 pour un G3 commencé au rang 3, mesuré) :
 * seul un grade commencé plus haut, ou repris deux rangs plus haut, en demande moins.
 * @param {object} s étape du calcul (grade, byRank, rolls, rollsFavorable)
 * @param {object} ctx
 * @param {number} ctx.startRank rang de départ de l'ingénieur dans le calcul prudent
 * @param {object[]} [ctx.ups] montées du calcul prudent chez cet ingénieur ({ from, to, slot, grade, extra })
 * @param {string} [ctx.slot] module de l'étape
 * @param {Map<string, string>} [ctx.names] noms des modules (comme l'ordre conseillé)
 * @param {Set<number>} [ctx.ownExtras] rangs atteints par des applications en plus déjà écrites dans cette ligne
 */
export function stepRanksNote(s, { startRank, ups = [], slot = null, names = new Map(), ownExtras = new Set() } = {}) {
  const parts = s.byRank || [];
  if (!parts.length || startRank == null) return '';
  const by = (u) => (u.extra ? 'les applications en plus' : `« ${names.get(u.slot) ?? u.label ?? u.slot} »`);
  // Dernière montée jusqu'au rang « to » (depuis le rang « from ») faite ailleurs que sur ce module : un autre module
  // du plan, ou les applications en plus (celles de cette ligne sont déjà dites avant ce grade)
  const elsewhere = (from, to, skipOwnExtras) => ups
    .filter((u) => u.from >= from && u.to === to && (u.extra ? !(skipOwnExtras && ownExtras.has(u.to)) : u.slot !== slot))
    .at(-1);
  const prefix = s.rollsFavorable != null && s.rollsFavorable !== s.rolls ? 'en prudent : ' : '';
  if (parts.length === 1) {
    const r = parts[0].rank;
    if (r === startRank) return '';
    const other = elsewhere(startRank, r, true);
    return ` (${prefix}au rang ${r}${other ? `, après la montée faite avec ${by(other)}` : ''})`;
  }
  const bits = parts.map((p, i) => {
    const text = `${p.rolls} au rang ${p.rank}`;
    if (!i) {
      const other = p.rank !== startRank ? elsewhere(startRank, p.rank, true) : null;
      return other ? `${text}, après la montée faite avec ${by(other)}` : text;
    }
    const other = elsewhere(parts[i - 1].rank, p.rank, false);
    return other ? `${text}, à reprendre après la montée au rang ${p.rank} faite avec ${by(other)}` : text;
  });
  return ` (${prefix}${bits.join(', puis ')})`;
}

/**
 * Phrase du détail d'un module chez un ingénieur, dans l'ordre où le faire :
 * « Chez Liz Ryder (rang 3) : il faut d'abord 8 applications en plus sur un autre module de ce type, neuf (3 G1, 4 G2
 * et 1 G3), pour passer au rang 4, puis G4 en 5 applications au lieu de 4 (4 au rang 4, puis 1 au rang 5) ».
 * Une montée en plus vient avant les grades au-dessus de son rang (elle les rend possibles), après ceux en dessous.
 * Chaque grade dit à quels rangs le faire (stepRanksNote) : le nombre d'applications n'est juste qu'à ces rangs.
 * @param {object} m module du calcul (steps, extras, engineerRanks)
 * @param {object[]} engineers récapitulatif des ingénieurs du calcul (montées, applications en plus, fourchette)
 * @returns {{ name, rank, locked, status, text, range: { text, reroll }|null }[]}
 */
export function moduleRankLines(m, engineers = []) {
  const nameOf = (s) => s.status?.best?.name ?? s.status?.afterUnlock?.name ?? null;
  const names = [...new Set(m.steps.filter((s) => !s.experimental && nameOf(s)).map(nameOf))];
  return names.map((name) => {
    const info = m.engineerRanks?.find((e) => e.name === name) || {};
    const eng = engineers.find((e) => e.name === name) || {};
    const locked = !!(info.locked ?? eng.locked);
    const rank = locked ? null : info.rank ?? eng.rank ?? null;
    const head = locked
      ? `Chez ${name} (pas encore débloqué : compté au rang ${eng.startRank ?? 1}, comme après un déblocage)`
      : `Chez ${name} (${rank == null ? 'rang inconnu' : `rang ${rank}`})`;
    // Rang de départ du calcul prudent : après déblocage, rang 1 ; rang inconnu, rang 1 aussi
    const startRank = locked ? eng.startRank ?? 1 : rank ?? 1;
    const ctx = {
      startRank,
      ups: eng.ups || [],
      slot: m.slot,
      names: orderNames(eng.order || []),
      ownExtras: new Set((m.extras || []).filter((x) => x.engineer === name).map((x) => x.rank + 1)),
    };
    const items = [];
    for (const s of m.steps) {
      if (s.experimental || nameOf(s) !== name) continue;
      if (s.rolls === s.rollsBase && s.rollsFavorable === s.rollsBase) continue;
      const during = stepRanksNote(s, ctx);
      const started = s.startQuality > 0 ? ' pour le finir' : '';
      items.push({ at: s.grade, extra: false, text: `G${s.grade} en ${span(s.rollsFavorable, s.rolls)} ${plural(s.rolls, 'application', 'applications')}${started} au lieu de ${s.rollsBase}${during}` });
    }
    const all = eng.extras || [];
    const mine = (m.extras || []).filter((x) => x.engineer === name);
    for (const x of mine) {
      const again = x.spare != null && all.some((y) => y.spare === x.spare && y.rank < x.rank);
      items.push({ at: x.rank + 0.5, extra: true, text: extraText(x, again) });
    }
    items.sort((p, q) => p.at - q.at);
    let text = '';
    items.forEach((it, i) => {
      if (!i) text = it.extra ? `il faut d'abord ${it.text}` : it.text;
      else text += it.extra || items[i - 1].extra ? `, puis ${it.text}` : `, ${it.text}`;
    });
    // Module visé sous le rang, fait à ce rang avant la montée parce qu'il compte pour elle (early du calcul prudent)
    const early = m.steps.find((s) => !s.experimental && nameOf(s) === name && s.early != null)?.early;
    if (text && early != null) {
      const later = eng.rankAfter > early ? ` pour le rang ${eng.rankAfter}` : '';
      text += `, à faire au rang ${early}, avant la montée : elles comptent pour elle, et coûtent moins de matériaux en tout que de garder ce module${later} et de monter avec un module neuf`;
    }
    if (!text) {
      if (rank != null && rank >= 5) text = 'aucune application en plus';
      else if (eng.rankAfter > (rank ?? 0)) {
        // Qui fait la montée : d'autres modules du plan, ou les applications en plus (rattachées à un autre module)
        const makers = [...new Set((eng.ups || []).map((u) => (u.extra ? 'les applications en plus' : u.slot === m.slot ? null : `« ${ctx.names.get(u.slot) ?? u.label ?? u.slot} »`)).filter(Boolean))];
        const by = makers.length ? ` (faite avec ${makers.length > 1 ? `${makers.slice(0, -1).join(', ')} et ${makers.at(-1)}` : makers[0]})` : ' (les autres modules du plan chez cet ingénieur la font)';
        text = `aucune application en plus, à faire après sa montée au rang ${eng.rankAfter}${by}`;
      } else text = 'aucune application en plus (ces grades ne dépendent pas du rang)';
    }
    return {
      name,
      rank,
      locked,
      status: info.status || (rank >= 5 ? 'mesurée' : 'à vérifier'),
      why: info.statusWhy ?? eng.statusWhy ?? null,
      text: `${head} : ${text}`,
      range: mine.length ? extraRange(eng) : null,
    };
  });
}

/** Noms des modules dans l'ordre conseillé : deux modules du même nom sont numérotés (n°1, n°2). */
function orderNames(order) {
  const bySlot = new Map();
  for (const o of order) {
    const slot = o.slot ?? o.extra?.slot;
    if (slot != null && !bySlot.has(slot)) bySlot.set(slot, o.label ?? o.extra?.label ?? slot);
  }
  const count = new Map();
  for (const l of bySlot.values()) count.set(l, (count.get(l) || 0) + 1);
  const seen = new Map();
  const out = new Map();
  for (const [slot, l] of bySlot) {
    if (count.get(l) < 2) out.set(slot, l);
    else {
      const k = (seen.get(l) || 0) + 1;
      seen.set(l, k);
      out.set(slot, `${l} n°${k}`);
    }
  }
  return out;
}

/** Ordre conseillé chez un ingénieur : « FSD : G1 ×3, G2 ×4, G3 ×3 → rang 4 → G3 ×2, G4 ×4 → rang 5 → … ». */
export function orderText(order = []) {
  const names = orderNames(order);
  const out = [];
  let last = null;
  let afterUp = false;
  const spares = new Set();
  for (const o of order) {
    if (o.up) {
      if (out.length) out[out.length - 1] += ` → rang ${o.up.to}`;
      else out.push(`→ rang ${o.up.to}`);
      afterUp = true;
    } else if (o.extra) {
      const x = o.extra;
      const on = names.get(x.slot);
      const what = x.grades?.length ? gradesText(x.grades) : `${x.count} G${x.rank}`;
      const again = x.spare != null && spares.has(x.spare);
      if (x.spare != null) spares.add(x.spare);
      const where = x.kind === 'grade refait' ? `, en refaisant le G${x.rank}` : again ? ', sur le même module de montée' : ', sur un autre module de ce type, neuf';
      out.push(`${what} en plus pour la montée${where}${on ? ` (modification de « ${on} »)` : ''}`);
      last = null;
      afterUp = false;
    } else {
      const piece = `G${o.grade} ×${o.count}`;
      if (last === o.slot) out[out.length - 1] += afterUp ? ` → ${piece}` : `, ${piece}`;
      else out.push(`${names.get(o.slot) || o.slot} : ${piece}`);
      last = o.slot;
      afterUp = false;
    }
  }
  return out.join(' ; ');
}

/** Ingénieurs du calcul dont le rang coûte quelque chose (rang < 5 ou inconnu, ou pas encore débloqués). */
export function rankedEngineers(calc) {
  return (calc?.engineers || []).filter((e) => e.locked || e.rank == null || e.rank < 5);
}

/**
 * Une ligne du tableau « Matériaux en plus dus aux rangs ». « En plus » : le prudent, et la fourchette jusqu'au cas
 * favorable quand il en demande moins. Par matériau, le favorable peut en demander PLUS que le prudent (il refait le
 * grade du rang au lieu d'un module neuf : plus de niobium, moins de débris) : alors pas de fourchette qui cacherait
 * quel chiffre est compté, mais le prudent (compté dans « Nécessaire » et « Manquant ») et, à part, ce que le cas
 * favorable demande, et ce qu'il te manquerait par ce chemin.
 * @param {object} m ligne de rankExtra.materials (extra, extraFavorable, favorableMore, missing, missingFavorable)
 * @returns {{ extra: string, favorable: string|null, missingFavorable: string|null }}
 */
export function extraMaterialCells(m) {
  const more = (m?.favorableMore ?? Math.max(0, (m?.extraFavorable ?? 0) - (m?.extra ?? 0))) > 0;
  if (!more) return { extra: span(m.extraFavorable, m.extra), favorable: null, missingFavorable: null };
  return {
    extra: n0(m.extra),
    favorable: `cas favorable : ${n0(m.extraFavorable)}`,
    missingFavorable: m.missingFavorable > (m.missing || 0) ? `${n0(m.missingFavorable)} par le cas favorable` : null,
  };
}

/**
 * Note du tableau « Matériaux en plus dus aux rangs » : ce qui est compté, et quand le favorable demande plus.
 * @param {object[]} rows rankExtra.materials
 * @param {boolean} reroll le cas favorable refait un grade déjà fini (extraFavorableReroll d'un ingénieur)
 */
export function extraMaterialsNote(rows = [], reroll = false) {
  const base = 'Déjà comptés dans « Matériaux nécessaires ». Calcul prudent ; la fourchette va jusqu’au cas favorable.';
  const more = rows.filter((m) => extraMaterialCells(m).favorable);
  if (!more.length) return base;
  const why = reroll ? 'il refait un grade déjà fini, ce qui reste à vérifier en jeu' : 'sa montée ne prend pas les mêmes grades';
  return `${base} Le cas favorable (${why}) demande plus de ${more.length > 1 ? 'certains matériaux' : 'ce matériau'} que le prudent : c’est écrit à part (« cas favorable »), et ni « Nécessaire » ni « Manquant » ne le comptent. Si tu prends ce chemin, prévois-le.`;
}

/** Résumé des applications en plus dues aux rangs : « 7 applications en plus (6 à 7) ». */
export function extraSummary(rankExtra) {
  if (!rankExtra || !rankExtra.rolls) return null;
  return `${span(rankExtra.rollsFavorable, rankExtra.rolls)} ${plural(rankExtra.rolls, 'application', 'applications')} et ${span(rankExtra.unitsFavorable, rankExtra.units)} ${plural(rankExtra.units, 'matériau', 'matériaux')} en plus dus aux rangs`;
}

/** Sous-titre de la tuile « Applications restantes » : « dont 3 à 4 dues aux rangs des ingénieurs », « dont 1 due… ». */
export function rankRollsSub(rankExtra) {
  if (!rankExtra?.rolls) return 'rangs des ingénieurs compris';
  return `dont ${span(rankExtra.rollsFavorable, rankExtra.rolls)} ${plural(rankExtra.rolls, 'due', 'dues')} aux rangs des ingénieurs`;
}

/**
 * Infobulle du nombre d'applications d'un module du plan : ingénieur pas encore débloqué, « 3 à 4 applications
 * (2 au rang 5) », estimation.
 */
export function moduleRollsTitle(m) {
  if (!m) return '';
  const bits = [];
  const unlock = (m.steps || []).find((s) => s.status?.afterUnlock)?.status.afterUnlock;
  if (unlock) bits.push(`Ingénieur pas encore débloqué : compté comme après son déblocage (rang ${unlock.rank ?? 1}, 0 %)`);
  if (m.rolls !== m.rollsBase || m.rollsFavorable !== m.rolls) bits.push(`${span(m.rollsFavorable, m.rolls)} ${plural(m.rolls, 'application', 'applications')} (${m.rollsBase} au rang 5)`);
  if (m.estimate) bits.push('≈ : selon une règle à vérifier ou inconnue (voir « Rangs des ingénieurs »)');
  return bits.join(' · ');
}

/**
 * Ce que le plan et le Dashboard disent d'un ingénieur dont le rang coûte, pour que les deux pages montrent la même
 * chose : titre (rang, rang inconnu, pas encore débloqué), statut de ses règles (badge), progression, rang après le
 * plan, une ligne par montée (avec la modification qu'elle prend) et la fourchette des applications en plus.
 * why : motifs du statut (statusWhy du calcul), au survol du badge.
 * @returns {{ title, status, why: string[]|null, progress, after: string|null, extras: { text, label }[], range: { text, reroll }|null }}
 */
export function engineerRankSummary(e) {
  const from = e?.locked ? e?.startRank ?? 1 : e?.rank ?? 0;
  return {
    title: engineerTitle(e),
    status: e?.status || (e?.rank == null ? 'inconnue' : 'à vérifier'),
    why: e?.statusWhy ?? null,
    progress: engineerProgressText(e),
    after: e?.rankAfter > from ? `après le plan : rang ${e.rankAfter}` : null,
    extras: extraTexts(e?.extras).map((text, i) => ({ text, label: e.extras[i].label ?? null })),
    range: extraRange(e),
  };
}

/**
 * « 808 applications lues (du 24 oct. au 5 nov.) », « 1 application lue (le 9 nov.) » ; aucune : null. Applications
 * illisibles (valeurs que le jeu n'écrit pas) : « dont 1 illisible, sans mesure ».
 */
export function applicationsReadText(report) {
  const n = report?.applications || 0;
  const bad = report?.unreadable || 0;
  if (!n && !bad) return null;
  const first = shortDay(report.period?.first);
  const last = shortDay(report.period?.last);
  const read = n ? `${nf.format(n)} ${plural(n, 'application lue', 'applications lues')} (${first === last ? `le ${first}` : `du ${first} au ${last}`})` : 'aucune application lisible';
  return bad ? `${read} · ${nf.format(bad)} ${plural(bad, 'application illisible', 'applications illisibles')} (valeur que le jeu n’écrit pas), sans mesure` : read;
}

/** « depuis le déblocage », « depuis la montée au rang 2 », « depuis un relevé à 24 % ». */
const sinceText = (start, rank) => (start?.kind === 'déblocage' ? 'depuis le déblocage'
  : start?.kind === 'relevé' ? `depuis un relevé à ${start.progress ?? '?'} %` : `depuis la montée au rang ${rank}`);

/**
 * Une montée lue dans tes journaux (climbs de GET /ranks : séquences fermées par une montée, regroupées) :
 * « 3 G1 depuis le déblocage, 1 fois » ; « 2 G1 et 3 G2 depuis la montée au rang 2, 1 fois » ; les applications à
 * distance, au lieu inconnu ou en effet expérimental sont dites (elles ne font pas monter, ou on ne sait pas).
 */
export function climbText(c) {
  const grades = (c.grades || []).map((g) => ({ grade: g.grade, count: g.atelier + g.distance + g.inconnu + g.experimental }));
  const sum = (k) => (c.grades || []).reduce((a, g) => a + (g[k] || 0), 0);
  const bits = [];
  if (sum('distance')) bits.push(`${sum('distance')} à distance`);
  if (sum('inconnu')) bits.push(`${sum('inconnu')} au lieu inconnu`);
  if (sum('experimental')) bits.push(`${sum('experimental')} en effet expérimental`);
  if (c.unreadable) bits.push(`${c.unreadable} ${plural(c.unreadable, 'illisible', 'illisibles')}`);
  const what = grades.length ? gradesText(grades) : 'aucune application';
  return `${what}${bits.length ? ` (dont ${bits.join(', ')})` : ''} ${sinceText(c.start, c.rank)}, ${n0(c.count)} fois${c.ok ? '' : ' · écart avec la table'}`;
}

/**
 * Lignes du tableau « Ce que tes journaux montrent » : chaque couple rang × grade de la table, avec ce que les
 * journaux mesurent. Les colonnes de la table (finir le grade, passer au rang suivant) disent sur combien
 * d'observations elles reposent ; les montées lues dans tes journaux sont données par rang (climbs : une cellule pour
 * toutes les lignes du rang, rankSpan), en direct.
 */
export function measureRows(report) {
  const measured = new Map((report?.measures || []).map((m) => [`${m.rank}|${m.grade}`, m]));
  const table = report?.rules?.table || [];
  const climbs = report?.climbs || [];
  const seen = new Set();
  return table.map((row) => {
    const m = measured.get(`${row.rank}|${row.grade}`) || null;
    // Un écart (pas différent de la table, ou grade fini d'un coup plus vite qu'elle) suffit à contredire la table
    const agrees = m?.contradictions ? false : m?.rolls == null ? null : m.rolls === row.finish.value;
    const faster = m?.faster ? ` · ${m.faster} ${plural(m.faster, 'grade fini', 'grades finis')} plus vite que la table` : '';
    const rerolled = m?.rerolls ? ` · ${m.rerolls} ${plural(m.rerolls, 'grade refait', 'grades refaits')} déjà à 100 %` : '';
    const c = row.climb;
    // Première ligne du rang : elle porte la cellule des montées de ce rang (sur toutes ses lignes)
    const rankFirst = !seen.has(row.rank);
    seen.add(row.rank);
    const n = c?.sequences ?? 0;
    return {
      key: `${row.rank}|${row.grade}`,
      rank: row.rank,
      grade: row.grade,
      maxGrade: row.grade === row.rank,
      finish: row.finish,
      finishObservations: row.finish?.observations ? `${n0(row.finish.observations)} ${plural(row.finish.observations, 'mesure', 'mesures')}` : null,
      climb: c,
      // Gain par application sans borne basse (0) : nombre d'applications « au moins … », sans maximum, jamais une
      // fourchette inventée ; ce qui n'est pas chiffré, c'est le gain le plus bas (donc le maximum d'applications)
      climbText: !c ? '—' : c.max == null
        ? `au moins ${n0(c.min)} ${plural(c.min, 'application', 'applications')}, sans maximum connu : chacune fait au plus ${pcHigh(c.gainMax)} % du rang, et rien ne dit combien au moins (le calcul prudent prend le pire cas que permettent les montées lues dans les journaux de référence)`
        : `${span(c.min, c.max)} ${plural(c.max, 'application', 'applications')} (${pcSpan(c.gainMin, c.gainMax)} % du rang chacune)`,
      // Sur combien de séquences des journaux de référence la fourchette repose (séquences où ce grade a servi à ce rang)
      climbObservations: c ? `déduit de ${n0(n)} ${plural(n, 'séquence', 'séquences')} des journaux de référence où ce grade a servi` : null,
      // Motif du badge : celui de la table (inconnue), sinon la déduction et le nombre de séquences
      climbWhy: !c ? null : c.why || `déduite de ${n0(n)} ${plural(n, 'séquence', 'séquences')} des journaux de référence où ce grade a servi à ce rang, avec des hypothèses (rankModel.js)`,
      measured: m,
      measuredText: (m?.rolls ? `${m.rolls} (${m.informative} ${plural(m.informative, 'mesure', 'mesures')})` : m ? `aucune mesure nette (${m.applications} ${plural(m.applications, 'application', 'applications')})` : 'pas encore vu') + faster + rerolled,
      agrees,
      rankFirst,
      rankSpan: table.filter((x) => x.rank === row.rank).length,
      // Montées de ce rang lues dans tes journaux (rang 5 : aucune, c'est le rang max)
      rankClimbs: row.rank >= 5 ? null : climbs.filter((x) => x.rank === row.rank).map((x) => ({ text: climbText(x), ok: x.ok })),
    };
  });
}

/**
 * Note « Refaire un grade déjà à 100 % » : la table dit « inconnue » (0 cas dans les journaux de référence). Un cas vu dans
 * tes journaux (rerolls de GET /ranks) est la mesure qui tranchera la règle : il est dit ici, à relire (la table ne
 * change pas d'elle-même).
 * @returns {{ seen: number, text: string }}
 */
export function rerollNote(report) {
  const list = report?.rerolls || [];
  if (!list.length) return { seen: 0, text: 'jamais vu dans les journaux de référence' };
  const where = (x) => (x.place === 'distance' ? ', à distance' : x.place === 'inconnu' ? ', lieu inconnu' : ', à l’atelier');
  const shown = list.slice(0, 3).map((x) => `${shortDay(x.at)}, ${x.engineer}${x.rank != null ? ` au rang ${x.rank}` : ''}, G${x.grade}${where(x)}`);
  const more = list.length > shown.length ? `, et ${list.length - shown.length} de plus` : '';
  return { seen: list.length, text: `jamais vu dans les journaux de référence qui ont fait la table, mais vu ${n0(list.length)} fois dans tes journaux (${shown.join(' ; ')}${more}) : la table dit encore « inconnue », à relire` };
}

const STATUS_ORDER = ['inconnue', 'à vérifier', 'mesurée'];
/** Le statut le plus faible (inconnue < à vérifier < mesurée), comme weakest de la table des règles. */
const weakestStatus = (list) => STATUS_ORDER[Math.min(...list.map((s) => Math.max(0, STATUS_ORDER.indexOf(s))))];
const ranksText = (ranks) => (ranks.length > 1 ? `aux rangs ${ranks.slice(0, -1).join(', ')} et ${ranks.at(-1)}` : `au rang ${ranks[0]}`);

/**
 * Note « les grades sous le grade max comptent aussi », en morceaux qui portent chacun le statut de ce qu'ils
 * affirment : qu'elles comptent (règle générale, mesurée) ; combien, aux rangs où la table borne tous les grades
 * (rapport d'un grade à celui d'en dessous, tiré des fourchettes de la table : déduit, à vérifier) ; les rangs où la
 * table ne le chiffre pas (inconnue). Les chiffres viennent de la table : ils suivent ses corrections.
 * @param {object} rules GET /ranks/rules : { table, general }
 * @returns {{ counts: { text, status, source }, ratio: { text, status }|null, unbounded: { text, status, help }|null }}
 */
export function lowerGradesNote(rules) {
  const table = rules?.table || [];
  const climb = (r, g) => table.find((x) => x.rank === r && x.grade === g)?.climb || null;
  const general = rules?.general?.LOWER_GRADES_COUNT || {};
  const bounded = [];
  const unbounded = [];
  for (let r = 2; r <= 4; r++) {
    const rows = Array.from({ length: r }, (_, i) => climb(r, i + 1));
    if (rows.some((c) => !c)) continue;
    if (rows.every((c) => c.gainMin > 0 && c.gainMax > 0)) bounded.push(r);
    else unbounded.push(r);
  }
  let lo = Infinity;
  let hi = 0;
  const statuses = [];
  for (const r of bounded) {
    for (let g = 1; g < r; g++) {
      const below = climb(r, g);
      const above = climb(r, g + 1);
      lo = Math.min(lo, above.gainMin / below.gainMax);
      hi = Math.max(hi, above.gainMax / below.gainMin);
      statuses.push(below.status, above.status);
    }
  }
  const lowRows = unbounded.flatMap((r) => Array.from({ length: r - 1 }, (_, i) => climb(r, i + 1)));
  return {
    counts: { text: 'Les applications sous le grade maximal du rang comptent aussi', status: general.status || 'à vérifier', source: general.source || null },
    ratio: bounded.length
      ? { text: `Combien : ${ranksText(bounded)}, de ${ratioLow(lo)} à ${ratioHigh(hi)} fois moins par grade en dessous, d'après les fourchettes de la table`, status: weakestStatus(statuses) }
      : null,
    unbounded: unbounded.length
      ? { text: `${ranksText(unbounded)}, la part des grades en dessous n'est pas chiffrée (le calcul prudent prend le pire cas que permettent les montées lues dans les journaux de référence)`, status: weakestStatus(lowRows.map((c) => c.status)), help: lowRows.find((c) => c.why)?.why || null }
      : null,
  };
}

/**
 * Note du report du surplus (CARRY_OVER de la table, value : rang de départ → rapport le plus haut, déduit) : tout le
 * surplus passe au rang suivant, en points (H3), mais ce rang en demande plus ; ce que 10 % de surplus y valent au
 * plus. « 10 % de surplus au rang 1 valent au plus 2,6 % du rang 2 ; au rang 2, au plus 3,2 % du rang 3 ». Arrondi
 * vers le haut (au plus) : jamais plus serré que la table. Rien à dire : null.
 */
export function carryNote(ratios) {
  const list = Object.entries(ratios || {}).map(([from, x]) => ({ from: Number(from), x })).filter((r) => Number.isInteger(r.from) && r.x > 0).sort((a, b) => a.from - b.from);
  if (!list.length) return null;
  const worth = (r) => `${ratioHigh(r.x * 10)} % du rang ${r.from + 1}`;
  const [first, ...rest] = list;
  return [`10 % de surplus au rang ${first.from} valent au plus ${worth(first)}`, ...rest.map((r) => `au rang ${r.from}, au plus ${worth(r)}`)].join(' ; ');
}

/** Une séquence de montée lue dans le journal : « 12 applications de G1 à l'atelier ». */
export function sequenceText(s) {
  const parts = s.grades.map((g) => {
    const bits = [];
    if (g.atelier) bits.push(`${g.atelier} à l'atelier`);
    if (g.distance) bits.push(`${g.distance} à distance`);
    if (g.inconnu) bits.push(`${g.inconnu} lieu inconnu`);
    if (g.experimental) bits.push(`${g.experimental} effet expérimental`);
    const n = g.atelier + g.distance + g.inconnu + g.experimental;
    return `${n} × G${g.grade}${s.rank === g.grade ? ' (grade max)' : ''}${bits.length > 1 || !g.atelier ? ` : ${bits.join(', ')}` : ''}`;
  });
  return parts.join(', ') || 'aucune application';
}

/**
 * Détail d'une séquence, application par application : « G1 +20 % · G1 +20 % · G3 +20 % (à distance) » ; un grade
 * refait alors qu'il était déjà à 100 % : « G3 refait (déjà à 100 %) ».
 */
export function orderDetail(s) {
  return (s.order || []).map((o) => {
    const what = o.experimental ? `G${o.grade} effet expérimental` : o.reroll ? `G${o.grade} refait (déjà à 100 %)` : `G${o.grade}${o.step != null ? ` +${Math.round(o.step * 100)} %` : ''}`;
    return `${what}${o.place === 'distance' ? ' (à distance)' : o.place === 'inconnu' ? ' (lieu inconnu)' : ''}`;
  }).join(' · ');
}

/** Début et fin d'une séquence : « rang 2 → 3 », « rang 3, relevé 24 % → relevé 4 % ». */
export function sequenceTitle(s) {
  const start = s.start.kind === 'déblocage' ? 'déblocage' : s.start.kind === 'relevé' ? `relevé ${s.start.progress ?? '?'} %` : 'montée';
  const end = s.end.kind === 'montée' ? `rang ${s.end.toRank}` : s.end.kind === 'relevé' ? (s.end.rank ? `relevé au rang ${s.end.rank}` : `relevé ${s.end.progress ?? '?'} %`) : 'en cours';
  return `${s.engineer}, rang ${s.rank} : ${start} → ${end}`;
}
