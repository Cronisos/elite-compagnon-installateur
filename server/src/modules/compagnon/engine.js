// Moteur du compagnon : choisit s'il parle et quoi dire. Aucun réseau, aucune IA : des phrases écrites à l'avance.
//
// - Chaque catégorie a plusieurs variantes, tirées dans un sac mélangé : toutes passent avant qu'une revienne, et
//   jamais deux fois de suite la même, même quand le cas change (bonjour du soir puis du matin).
// - Délai minimal par catégorie, et délai global entre deux phrases, selon le bavardage (discret, normal, bavard).
// - Pendant un combat, seules les alertes parlent.
// - Gabarits {cmdr} {profit} {station}… : les nombres au format français ; une phrase dont une variable manque
//   (station inconnue…) est sautée au profit d'une autre.
//
// Pur et testable : l'heure et le hasard sont fournis par l'appelant.

import { CATEGORY_MAP } from './categories.js';

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * gap : délai global entre deux phrases ordinaires ; cooldown : multiplicateur des délais par catégorie ;
 * chance : multiplicateur de la probabilité de parler (catégories tirées au sort).
 */
export const LEVELS = {
  discret: { label: 'Discret', gap: 240_000, cooldown: 2.5, chance: 0.5 },
  normal: { label: 'Normal', gap: 60_000, cooldown: 1, chance: 1 },
  bavard: { label: 'Bavard', gap: 20_000, cooldown: 0.4, chance: 1.6 },
};
/** Délai entre deux alertes : une alerte plus grave passe quand même (destruction juste après « coque en danger »). */
export const ALERT_GAP = 5_000;
const PRIORITY = { normal: 0, important: 1, alerte: 1, critique: 2 };

// Espace insécable entre le nombre et son unité : la bulle ne coupe pas « 46 827 372 » de « cr »
const NBSP = '\u00a0';
const credits = (n) => `${nf.format(Math.round(n))}${NBSP}cr`;
const FORMATS = {
  profit: credits,
  perte: credits,
  cout: credits,
  distance: (n) => `${nf1.format(n)}${NBSP}al`,
  carburant: (n) => `${nf.format(Math.round(n))}${NBSP}%`,
  coque: (n) => `${nf.format(Math.round(n))}${NBSP}%`,
};

/** Valeur affichée d'une variable : nombre au format français (1 234 567), crédits, pourcentages, années-lumière. */
export function formatValue(key, value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Object.hasOwn(FORMATS, key) ? FORMATS[key](value) : nf.format(Math.round(value));
  }
  return String(value);
}

// « de » ou « que » juste avant une variable (mot entier) : élidés devant une voyelle (« 1 232 t d’Indium »)
const PLACEHOLDER = /((?<!\p{L})(?:de|De|que|Que) )?\{([a-zA-Z]+)\}/gu;
const VOWEL = /^[aeiouyàâäéèêëîïôöùûüœæ]/iu;

/** Texte avec ses variables remplies, ou null s'il en manque une. */
export function render(text, ctx = {}) {
  let missing = false;
  const out = text.replace(PLACEHOLDER, (all, before, key) => {
    const v = Object.hasOwn(ctx, key) ? ctx[key] : null;
    if (v == null || v === '' || (typeof v === 'number' && !Number.isFinite(v))) {
      missing = true;
      return all;
    }
    const value = formatValue(key, v);
    if (!before) return value;
    return VOWEL.test(value) ? `${before.slice(0, -2)}’${value}` : before + value;
  });
  return missing ? null : out;
}

/** La catégorie est-elle activée dans les réglages ? (activée par défaut) */
export const categoryOn = (settings, id) => !(settings?.categories && Object.hasOwn(settings.categories, id) && settings.categories[id] === false);

export class Speaker {
  /**
   * @param phrases { catégorie: [{ texte, humeur, cas? }] } déjà validées
   * @param random hasard entre 0 et 1 (tests : suite fixée)
   */
  constructor({ phrases = {}, random = Math.random } = {}) {
    this.random = random;
    this.lastAt = -Infinity; // dernière phrase dite
    this.lastPriority = 0;
    this.categoryAt = new Map(); // catégorie → heure de sa dernière phrase
    this.setPhrases(phrases);
  }

  /** Nouvelles phrases (changement de pack) : les sacs repartent de zéro, les délais restent. */
  setPhrases(phrases) {
    this.phrases = new Map();
    for (const id of CATEGORY_MAP.keys()) this.phrases.set(id, Object.hasOwn(phrases, id) ? phrases[id] : []);
    this.bags = new Map(); // catégorie|cas → indices restant à tirer
    this.lastPick = new Map(); // catégorie → dernier indice tiré, quel que soit le cas
  }

  /** Indices des variantes utilisables pour ce cas : celles du cas, et celles sans cas. */
  eligible(id, cas) {
    const list = this.phrases.get(id) || [];
    return list.map((_, i) => i).filter((i) => !list[i].cas || list[i].cas === cas);
  }

  /** Sac mélangé (Fisher-Yates) ; le premier tiré n'est jamais le dernier dit. */
  fill(indices, last) {
    const bag = [...indices];
    for (let i = bag.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    // On tire par la fin (pop)
    if (bag.length > 1 && bag[bag.length - 1] === last) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
    return bag;
  }

  /** Variante suivante du sac, remplie ; null si aucune ne peut être remplie avec ce contexte. */
  pick(id, cas, ctx) {
    const list = this.phrases.get(id) || [];
    const indices = this.eligible(id, cas);
    if (!indices.length) return null;
    const key = `${id}|${cas || ''}`;
    for (let tries = 0; tries < indices.length * 2; tries += 1) {
      let bag = this.bags.get(key);
      if (!bag || !bag.length) {
        bag = this.fill(indices, this.lastPick.get(id));
        this.bags.set(key, bag);
      }
      const i = bag.pop();
      const text = render(list[i].texte, ctx);
      if (text) {
        this.lastPick.set(id, i);
        // Une phrase sans cas est dans le sac de chaque cas : dite, elle sort aussi des sacs des autres cas
        for (const [k, other] of this.bags) {
          if (k !== key && k.startsWith(`${id}|`)) {
            const at = other.indexOf(i);
            if (at >= 0) other.splice(at, 1);
          }
        }
        return { text, mood: list[i].humeur };
      }
    }
    return null;
  }

  /**
   * Phrase pour ce déclencheur, ou null si le compagnon se tait (réglages, combat, délais, hasard).
   * @param trigger { category, ctx, cas }
   * @param opts { at: heure (ms), settings, combat: combat en cours, cmdr }
   */
  say(trigger, { at, settings, combat = false, cmdr = null }) {
    const def = CATEGORY_MAP.get(trigger?.category);
    if (!def || !settings?.enabled || !categoryOn(settings, def.id)) return null;
    const level = Object.hasOwn(LEVELS, settings.level) ? LEVELS[settings.level] : LEVELS.normal;
    const ordinary = def.kind === 'normal';
    const priority = PRIORITY[def.kind] ?? 0;
    if (combat && def.kind !== 'alerte' && def.kind !== 'critique') return null; // silence pendant le combat
    const since = at - this.lastAt;
    if (ordinary && since < level.gap) return null;
    if (since < ALERT_GAP && priority <= this.lastPriority) return null; // on ne coupe pas la parole
    const cooldown = def.cooldown * 1000 * (ordinary ? level.cooldown : 1);
    const prev = this.categoryAt.get(def.id);
    if (prev != null && at - prev < cooldown) return null;
    const chance = ordinary ? Math.min(1, (def.chance ?? 1) * level.chance) : 1;
    if (chance < 1 && this.random() >= chance) return null;

    const picked = this.pick(def.id, trigger.cas, this.context(trigger.ctx, settings, cmdr));
    if (!picked) return null;
    this.lastAt = at;
    this.lastPriority = priority;
    this.categoryAt.set(def.id, at);
    return { category: def.id, text: picked.text, mood: picked.mood, alert: priority > 0 && def.kind !== 'important' };
  }

  context(ctx, settings, cmdr) {
    return { cmdr, ...(ctx || {}), nom: settings?.name || 'Copilote' };
  }

  /**
   * Aperçu (bouton « Essayer ») : une variante au hasard, sans toucher aux sacs ni aux délais.
   * Les variables manquantes sont prises dans l'exemple de la catégorie.
   */
  sample(id, { settings, cmdr = null, ctx = {} } = {}) {
    const def = CATEGORY_MAP.get(id);
    const list = this.phrases.get(id) || [];
    if (!def || !list.length) return null;
    const full = this.context({ ...def.sample, ...ctx }, settings, cmdr || 'Commandant');
    const order = list.map((_, i) => i);
    const start = Math.floor(this.random() * order.length);
    for (let k = 0; k < order.length; k += 1) {
      const v = list[(start + k) % order.length];
      const text = render(v.texte, full);
      if (text) return { category: id, text, mood: v.humeur, alert: def.kind === 'alerte' || def.kind === 'critique' };
    }
    return null;
  }
}
