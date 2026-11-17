// Silences des propositions de mode (« Non », bascule annulée : 30 min, core/modeGuess.js), gardés dans le dossier des
// données (core/paths.js, fichier mode-silences.json) : un redémarrage de l'app ne les oublie pas. Sans cela, « Non »
// dit cinq minutes avant de relancer l'app laissait revenir la même proposition (ou la bascule) dès le démarrage.
//
// Fichier, écrit d'un coup (core/jsonFile.js) :
//   { "version": 1, "silences": { "combat": "2026-11-08T10:30:00.000Z" } }   (mode → fin du silence)
// Le fichier ne dit que des échéances : les règles de temps (30 min au plus, échéances passées oubliées) sont celles de
// ModeAdvisor, qui le relit au démarrage. Illisible : mis de côté, départ à vide, avertissement. Là mais pas relu
// (verrouillé, droits) : rien n'est écrit par-dessus ; chaque écriture le relit d'abord.

import { readJsonOrSetAside, writeJsonAtomic } from './jsonFile.js';
import { isMode } from './modes.js';

export const SILENCES_FILE_VERSION = 1;

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const LABEL = 'Silences des propositions';

export class SilenceStore {
  /** @param {{ file: string, warn?: (msg: string) => void, now?: () => number }} o */
  constructor({ file, warn = console.warn, now = () => Date.now() }) {
    this.file = file;
    this.warn = warn;
    this.now = now;
    this.unread = false; // fichier là mais pas relu : jamais écrit par-dessus
  }

  /**
   * Échéances lues : Map mode → fin du silence (ms). Seuls les modes connus (core/modes.js, jamais une clé de prototype)
   * et les dates lisibles ; le reste est écarté, avec un avertissement. Ne lève jamais d'erreur.
   */
  load() {
    this.unread = false;
    try {
      const r = readJsonOrSetAside(this.file, {
        label: LABEL,
        accept: (d) => isPlainObject(d) && d.version === SILENCES_FILE_VERSION && isPlainObject(d.silences),
        warn: this.warn,
        now: this.now(),
      });
      this.unread = r.status === 'erreur' || (r.status === 'illisible' && !r.aside);
      const out = new Map();
      if (!r.data) return out;
      let ignored = 0;
      for (const key of Object.keys(r.data.silences)) {
        const v = r.data.silences[key];
        const until = typeof v === 'string' && v.length <= 40 ? Date.parse(v) : NaN;
        if (isMode(key) && Number.isFinite(until)) out.set(key, until);
        else ignored += 1;
      }
      if (ignored) this.warn(`${LABEL} : ${ignored} entrée(s) illisible(s) ignorée(s) dans ${this.file}.`);
      return out;
    } catch (err) {
      this.unread = true;
      this.warn(`${LABEL} : ${this.file} pas relu (${String(err?.message ?? 'erreur inconnue').slice(0, 200)}) ; les silences repartent de zéro.`);
      return new Map();
    }
  }

  /**
   * Écrit les silences encore en cours (`silences` : Map mode → fin, ms). Fichier pas relu jusque-là : relu d'abord, et
   * ses silences encore en cours gardés (le plus long des deux) ; toujours pas lisible : rien n'est écrit. Ne lève
   * jamais d'erreur (un « Non » doit toujours être pris) : l'échec est écrit dans les avertissements.
   * @returns {boolean} écrit
   */
  save(silences) {
    const now = this.now();
    const out = new Map();
    if (this.unread) {
      const before = this.load();
      if (this.unread) {
        this.warn(`${LABEL} : ${this.file} pas relu, rien n'est écrit par-dessus ; ce silence ne tiendra pas après un redémarrage de l'app.`);
        return false;
      }
      for (const [mode, until] of before) if (until > now) out.set(mode, until);
    }
    for (const [mode, until] of silences) {
      if (isMode(mode) && Number.isFinite(until) && until > now) out.set(mode, Math.max(until, out.get(mode) ?? 0));
    }
    const data = { version: SILENCES_FILE_VERSION, silences: {} };
    for (const [mode, until] of [...out].sort((a, b) => a[0].localeCompare(b[0]))) data.silences[mode] = new Date(until).toISOString();
    try {
      writeJsonAtomic(this.file, data);
      return true;
    } catch (err) {
      this.warn(`${LABEL} : non enregistrés (${err.message}) ; ce silence ne tiendra pas après un redémarrage de l'app.`);
      return false;
    }
  }
}
