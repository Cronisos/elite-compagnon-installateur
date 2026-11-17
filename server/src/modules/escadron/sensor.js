// Capteur du Squadron Tracker : envoie les gains de mérites au Worker de l'escadron, à la place du plugin EDMC.
//
// - Opt-in : rien ne part tant que l'envoi n'est pas activé ET qu'un jeton valide n'est pas enregistré.
// - File d'attente : un envoi à la fois, dans l'ordre du journal, 100 par minute au plus ; nouvel essai après
//   1 min si le serveur ne répond pas ; un jeton refusé (401) met la file en attente d'un nouveau jeton ; un jeton
//   qui n'est pas celui du commandant (403) garde ses gains en file, sans autre envoi, jusqu'à un nouveau jeton.
// - Rattrapage : au démarrage, les gains des journaux restés sur le disque sont repris depuis la date choisie à
//   l'activation, sauf ceux déjà confirmés (même commandant, même heure, mêmes mérites, comme le Worker).
// - Un gain encore en file que le jeu annule à la ligne suivante (rules.js CANCELLED_BY_NEXT) ne part pas.
// - Un seul commandant : celui du jeton. Jamais les gains d'un autre commandant du même dossier de journaux (un
//   second compte, un proche) sans le choix du joueur : avec plusieurs commandants dans les journaux, rien ne part
//   avant qu'il ait choisi celui de son jeton (voir allowedCmdr).
// - Le jeton n'apparaît jamais dans un message, un journal ou une réponse de l'API (seulement masqué).
//
// Le réseau (fetch), l'heure et les minuteries sont injectés : les tests n'envoient jamais rien.

import { userHostError } from '../../core/net.js';
import { PREFIXE_ESCADRON, lireCodeEscadron } from './code.js';
import { MeritContext, isLiveGalaxy, keyTime, payloadKey as keyOf, validPayload } from './payload.js';
import {
  AGE_MARGIN_MS, MAX_QUEUE, POWERPLAY_WEEK_DAY_UTC, POWERPLAY_WEEK_HOUR_UTC, REQUEST_TIMEOUT_MS, RETRY_MS, SEND_GAP_MS,
  TOKEN_FORMAT, WORKER_CMDR_STATUSES, WORKER_DROP_STATUSES, WORKER_MAX_AGE_MS, WORKER_MAX_TEXT, WORKER_PATH,
  WORKER_PAUSE_STATUSES,
} from './rules.js';

const WEEK_MS = 7 * 24 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

/** Début de la semaine Powerplay qui contient l'instant t (jeudi 7 h UTC, voir rules.js). */
export function weekStart(t) {
  const d = new Date(t);
  const back = (d.getUTCDay() - POWERPLAY_WEEK_DAY_UTC + 7) % 7;
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back, POWERPLAY_WEEK_HOUR_UTC);
  return start > t ? start - WEEK_MS : start;
}

/** Point de départ du rattrapage choisi à l'activation. */
export const SINCE_CHOICES = new Map([
  ['now', 'à partir de maintenant'],
  ['week', 'depuis le début de la semaine Powerplay'],
  ['max', 'des 30 derniers jours (le plus vieux que le serveur accepte)'],
]);

export function sinceFor(choice, now) {
  if (choice === 'week') return weekStart(now);
  if (choice === 'max') return now - WORKER_MAX_AGE_MS + AGE_MARGIN_MS;
  return now;
}

/** Jeton masqué : seuls les 4 derniers caractères, pour reconnaître lequel est enregistré. */
export const maskToken = (token) => (token ? `••••••••${token.slice(-4)}` : null);

function publicError(status, message) {
  const err = new Error(message);
  err.status = status;
  err.publicMessage = message;
  return err;
}

/**
 * Adresse du Worker d'un escadron, propre : « https://nom.public » (origine seule, sans chemin, paramètre ni port autre
 * que 443). Vide ou null : aucun serveur (null). Sinon erreur 400 qui dit pourquoi.
 */
export function workerBase(raw) {
  if (raw == null || (typeof raw === 'string' && raw.trim() === '')) return null;
  if (typeof raw !== 'string' || raw.length > 300) throw publicError(400, 'Adresse du serveur : un texte, « https://… ».');
  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    throw publicError(400, 'Adresse du serveur illisible : colle-la telle que ton escadron la donne (« https://… »).');
  }
  if (url.protocol !== 'https:') throw publicError(400, 'Adresse du serveur : https seulement.');
  if (url.username || url.password) throw publicError(400, "Adresse du serveur : sans identifiant dedans.");
  if (url.port && url.port !== '443') throw publicError(400, 'Adresse du serveur : sans port.');
  if (url.search || url.hash) throw publicError(400, 'Adresse du serveur : sans « ? » ni « # ».');
  const chemin = url.pathname.replace(/\/+$/, '');
  if (chemin && chemin !== WORKER_PATH) throw publicError(400, `Adresse du serveur : seulement son début (« https://${url.hostname} »).`);
  const err = userHostError(url.hostname);
  if (err) throw publicError(400, err);
  return `https://${url.hostname.toLowerCase()}`;
}

export function tokenError() {
  const err = new Error("Jeton invalide : il fait 43 caractères (lettres, chiffres, « - » et « _ »), tel que l'escadron te l'a donné.");
  err.status = 400;
  err.publicMessage = err.message;
  return err;
}

const iso = (t) => (Number.isFinite(t) ? new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z') : null);
const parseTime = (v) => (typeof v === 'string' ? Date.parse(v) : NaN);
const minutes = (ms) => `${Math.max(1, Math.round(ms / 60000))} min`;

export class SquadronSensor {
  constructor({
    store, fetch, now = Date.now, url = null, gapMs = SEND_GAP_MS, retryMs = RETRY_MS,
    saveDelayMs = 2000, setTimer = setTimeout, clearTimer = clearTimeout, onChange = () => {}, allowHost = () => {},
  }) {
    this.store = store;
    this.fetch = fetch;
    this.now = now;
    // Aucun serveur par défaut : l'app est publique, chaque escadron a le sien (code de l'escadron, ou setWorker).
    // `url` ne sert qu'aux tests (un serveur déjà réglé).
    this.defaultUrl = url;
    this.url = url;
    this.allowHost = allowHost; // l'hôte réglé, ajouté à la liste blanche de la passerelle (core/net.js)
    this.gapMs = gapMs;
    this.retryMs = retryMs;
    this.saveDelayMs = saveDelayMs;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.onChange = onChange;

    this.context = new MeritContext();
    this.candidates = []; // gains vus dans le journal, avec la raison de ne pas les envoyer
    this.queue = []; // messages en attente, du plus ancien au plus récent
    this.queued = new Set(); // clés de la file
    this.running = false;
    this.paused = false; // jeton refusé : on attend un nouveau jeton
    this.refused = new Map(); // commandants refusés (403) pour le jeton actuel : nom en minuscules → nom
    this.cmdrs = new Map(); // commandants vus (gains des journaux, file, dernier chargé) : nom en minuscules → nom
    this.retryTimer = null;
    this.saveTimer = null;
    this.stopped = false;
    this.load();
  }

  // --- Disque ---

  load() {
    const s = this.store.readState() ?? {};
    this.enabled = s.enabled === true;
    let base = null;
    try {
      base = workerBase(s.workerUrl);
    } catch {
      base = null; // réglage abîmé à la main : plus aucun serveur (le jeton ne part nulle part : voir plus bas)
    }
    this.useWorker(base);
    const since = parseTime(s.since);
    this.since = Number.isFinite(since) ? since : null;
    const cmdrName = (v) => (typeof v === 'string' && v && v.length <= WORKER_MAX_TEXT ? v : null);
    this.tokenCmdr = cmdrName(s.tokenCmdr);
    this.chosenCmdr = cmdrName(s.chosenCmdr); // commandant du jeton choisi par le joueur (plusieurs dans les journaux)
    for (const name of Array.isArray(s.refusedCmdrs) ? s.refusedCmdrs : []) {
      if (typeof name === 'string' && name && name.length <= WORKER_MAX_TEXT) this.refused.set(name.toLowerCase(), name);
    }
    this.lastConfirmedAt = typeof s.lastConfirmedAt === 'string' ? s.lastConfirmedAt : null;
    this.lastOkAt = typeof s.lastOkAt === 'string' ? s.lastOkAt : null;
    this.status = s.status && typeof s.status.text === 'string'
      ? { code: String(s.status.code ?? ''), text: s.status.text, at: typeof s.status.at === 'string' ? s.status.at : null }
      : { code: 'off', text: 'Aucun envoi pour le moment.', at: null };
    const counts = s.counts && typeof s.counts === 'object' ? s.counts : {};
    this.counts = {
      sent: Number.isInteger(counts.sent) ? counts.sent : 0,
      dropped: Number.isInteger(counts.dropped) ? counts.dropped : 0,
      expired: Number.isInteger(counts.expired) ? counts.expired : 0,
    };
    this.done = new Set((Array.isArray(s.done) ? s.done : []).filter((k) => typeof k === 'string' && Number.isFinite(keyTime(k))));
    for (const p of Array.isArray(s.pending) ? s.pending : []) {
      const clean = validPayload(p);
      if (clean) this.enqueue(clean);
    }
    this.rebuildCmdrs();
    const token = this.store.readToken();
    this.token = token && TOKEN_FORMAT.test(token) ? token : null;
    // Jeton enregistré pour un autre serveur que celui réglé (réglage changé à la main) : il ne part pas
    if (typeof s.workerUrl === 'string' && s.workerUrl && base !== s.workerUrl) this.token = null;
  }

  /** Worker utilisé : celui de l'escadron du joueur (`base`) ; null : aucun, rien ne part. */
  useWorker(base) {
    this.workerBase = base;
    this.url = base ? `${base}${WORKER_PATH}` : this.defaultUrl;
    this.allowHost(base ? new URL(base).hostname : null);
  }

  snapshot() {
    return {
      version: 1,
      enabled: this.enabled,
      workerUrl: this.workerBase ?? null,
      since: iso(this.since),
      tokenCmdr: this.tokenCmdr,
      chosenCmdr: this.chosenCmdr,
      refusedCmdrs: [...this.refused.values()],
      lastConfirmedAt: this.lastConfirmedAt,
      lastOkAt: this.lastOkAt,
      status: this.status,
      counts: this.counts,
      done: [...this.done],
      pending: this.queue,
    };
  }

  save() {
    this.clearTimer(this.saveTimer);
    this.saveTimer = null;
    this.prune();
    try {
      this.store.writeState(this.snapshot());
    } catch (err) {
      console.error(`Escadron : état non enregistré (${err.code || err.name})`);
    }
  }

  saveSoon() {
    if (this.saveDelayMs <= 0) return this.save();
    this.saveTimer ??= this.setTimer(() => this.save(), this.saveDelayMs);
  }

  /** Oublie ce que le serveur refuserait de toute façon (plus de 30 jours). */
  prune() {
    const limit = this.now() - WORKER_MAX_AGE_MS - DAY_MS;
    for (const k of this.done) if (keyTime(k) < limit) this.done.delete(k);
    this.candidates = this.candidates.filter((c) => Date.parse(c.payload.at) >= limit);
  }

  // --- Journal ---

  /** Démarrage, ou changement de dossier des journaux : tout l'historique, puis le rattrapage. */
  ingestHistory(history) {
    this.context = new MeritContext();
    this.candidates = [];
    for (const ev of history) this.remember(this.context.apply(ev));
    this.prune();
    this.rebuildCmdrs();
    this.reconsider();
    this.changed();
    this.kick();
  }

  /** Un événement en direct. */
  live(ev) {
    const c = this.context.apply(ev);
    // Un commandant de plus dans les journaux (un autre compte chargé) alors que celui du jeton n'est ni confirmé ni
    // choisi : plus rien ne part avant le choix du joueur
    const grew = this.noteCmdr(this.context.cmdr); // un gain porte toujours le nom du commandant chargé
    if (grew && !this.tokenCmdr && !this.chosenCmdr) {
      this.reconsider();
      this.changed();
      this.kick();
    }
    if (!c) return;
    this.remember(c);
    if (c.cancels) this.unqueueCancelled(c.cancels);
    this.consider(c);
    this.changed();
    this.kick();
  }

  /** Clés des gains annulés par la ligne suivante, sauf si une autre ligne, créditée, porte la même clé. */
  cancelledKeys() {
    const credited = new Set(this.candidates.filter((c) => !c.skip).map((c) => c.key));
    return new Set(this.candidates.filter((c) => c.skip === 'annule' && !credited.has(c.key)).map((c) => c.key));
  }

  /** Gain annulé par la ligne suivante alors qu'il attendait encore dans la file : il ne part pas. */
  unqueueCancelled(c) {
    if (!this.queued.has(c.key) || !this.cancelledKeys().has(c.key)) return;
    const i = this.queue.findIndex((p) => keyOf(p) === c.key);
    if (i >= 0) this.queue.splice(i, 1);
    this.queued.delete(c.key);
    this.saveSoon();
  }

  remember(c) {
    if (!c?.payload) return;
    this.candidates.push(c);
    this.noteCmdr(c.payload.cmdr);
  }

  /** Le gain est-il à envoyer : envoi activé, dans la période choisie, pas encore confirmé ? */
  wanted(payload, key) {
    if (!this.enabled) return false;
    const t = Date.parse(payload.at);
    if (this.since !== null && t < this.since) return false;
    if (t < this.now() - WORKER_MAX_AGE_MS + AGE_MARGIN_MS) return false;
    if (this.done.has(key)) return false;
    return true;
  }

  // --- Commandant du jeton ---

  /** Ajoute un commandant vu ; vrai s'il est nouveau. */
  noteCmdr(name) {
    if (typeof name !== 'string' || !name) return false;
    const key = name.toLowerCase();
    if (this.cmdrs.has(key)) return false;
    this.cmdrs.set(key, name);
    return true;
  }

  /** Commandants vus : ceux des gains des journaux (30 derniers jours), de la file, et le dernier chargé. */
  rebuildCmdrs() {
    this.cmdrs = new Map();
    this.noteCmdr(this.context?.cmdr);
    for (const c of this.candidates) this.noteCmdr(c.payload?.cmdr);
    for (const p of this.queue) this.noteCmdr(p.cmdr);
  }

  /**
   * Commandant dont les gains peuvent partir, ou null : celui du jeton une fois confirmé (premier envoi accepté) ;
   * avant, celui que le joueur a choisi ; sans choix, le seul commandant des journaux. Plusieurs commandants et aucun
   * choix : null, rien ne part. Jamais un autre sans le choix du joueur : avant, le gain d'un autre commandant du même
   * dossier de journaux (un second compte, un proche) partait au Worker avec le jeton, nom, système et mérites compris,
   * avant d'être refusé (403), y compris quand cet autre commandant était simplement le dernier chargé.
   */
  allowedCmdr() {
    if (this.tokenCmdr) return this.tokenCmdr;
    if (this.chosenCmdr) return this.chosenCmdr;
    return this.cmdrs.size === 1 ? this.cmdrs.values().next().value : null;
  }

  /** Plusieurs commandants dans les journaux, et ni jeton confirmé ni choix : le joueur doit dire lequel est le sien. */
  needsChoice() {
    return !this.tokenCmdr && !this.chosenCmdr && this.cmdrs.size > 1;
  }

  /** Ce gain est-il celui du commandant qui peut envoyer ? Aucun commandant permis : non. */
  ownGain(payload) {
    const allowed = this.allowedCmdr();
    return Boolean(allowed) && typeof payload?.cmdr === 'string' && payload.cmdr.toLowerCase() === allowed.toLowerCase();
  }

  /**
   * Gain d'un autre commandant que celui permis : jamais mis en file. En attendant le choix du joueur (plusieurs
   * commandants), aucun n'est « l'autre » : tous attendent dans la file, sans partir (blocked).
   */
  otherCmdr(payload) {
    return Boolean(this.allowedCmdr()) && !this.ownGain(payload);
  }

  consider(c) {
    if (!c?.payload || c.skip || this.queued.has(c.key) || !this.wanted(c.payload, c.key)) return false;
    if (this.otherCmdr(c.payload)) return false; // gain d'un autre commandant : jamais envoyé
    return this.enqueue(c.payload);
  }

  enqueue(payload) {
    const key = keyOf(payload);
    if (this.queued.has(key) || this.done.has(key) || this.queue.length >= MAX_QUEUE) return false;
    this.queue.push(payload);
    this.queued.add(key);
    // Presque toujours en fin de file ; le rattrapage peut glisser un gain plus ancien
    if (this.queue.length > 1 && this.queue.at(-2).at > payload.at) this.queue.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
    return true;
  }

  /** Recalcule la file : période changée, activation, nouveau jeton, commandant choisi, ou historique relu. */
  reconsider() {
    const cancelled = this.cancelledKeys();
    const keep = this.queue.filter((p) => this.wanted(p, keyOf(p)) && !cancelled.has(keyOf(p)) && !this.otherCmdr(p));
    this.queue = [];
    this.queued.clear();
    if (!this.enabled) return this.saveSoon();
    for (const p of keep) this.enqueue(p);
    for (const c of this.candidates) this.consider(c);
    this.saveSoon();
  }

  // --- Envoi ---

  canSend() {
    return this.enabled && Boolean(this.url) && Boolean(this.token) && !this.paused && !this.stopped;
  }

  /**
   * Gain que le jeton actuel ne peut pas créditer, ou pas encore : commandant refusé (403), autre que celui du jeton,
   * ou commandant du jeton pas encore choisi.
   */
  blocked(p) {
    return this.refused.has(p.cmdr.toLowerCase()) || !this.ownGain(p);
  }

  /** Prochain gain à envoyer : le plus ancien que le jeton peut créditer. */
  next() {
    return this.queue.find((p) => !this.blocked(p)) ?? null;
  }

  /** Lance l'envoi si rien n'est en cours ni en attente d'un nouvel essai. */
  kick() {
    if (!this.canSend() || this.running || this.retryTimer || !this.next()) return;
    this.run().catch((err) => console.error(`Escadron : envoi interrompu (${err.name})`));
  }

  async run() {
    if (this.running || !this.canSend()) return;
    this.running = true;
    try {
      while (this.canSend()) {
        const item = this.next();
        if (!item) break;
        if (Date.parse(item.at) < this.now() - WORKER_MAX_AGE_MS + AGE_MARGIN_MS) {
          this.finish(item, 'expired');
          continue;
        }
        const token = this.token;
        const url = this.url;
        const result = await this.deliver(item, token);
        if (this.stopped || !this.enabled) break;
        // Serveur changé pendant l'envoi : la réponse valait pour l'ancien, rien n'est compté pour le nouveau
        if (url !== this.url) continue;
        // Jeton remplacé pendant l'envoi : la réponse valait pour l'ancien, on renvoie avec le nouveau
        if (result.outcome !== 'ok' && token !== this.token) continue;
        this.status = { code: result.code, text: result.text, at: iso(this.now()) };
        if (result.outcome === 'ok' || result.outcome === 'drop' || result.outcome === 'refuse') {
          if (result.outcome === 'refuse') {
            // 403 : ce jeton n'est pas celui de ce commandant. Ses gains restent en file sans autre envoi (un seul
            // refus, pas un par gain), jusqu'à un nouveau jeton ou au choix d'un autre commandant pour ce jeton.
            this.refused.set(item.cmdr.toLowerCase(), item.cmdr);
            this.saveSoon();
          } else this.finish(item, result.outcome, token);
          this.changed();
          if (this.next() && this.gapMs > 0) await new Promise((r) => setTimeout(r, this.gapMs));
          continue;
        }
        if (result.outcome === 'pause') {
          this.paused = true;
          break;
        }
        this.retryTimer = this.setTimer(() => {
          this.retryTimer = null;
          this.kick();
        }, this.retryMs);
        break;
      }
    } finally {
      this.running = false;
      this.saveSoon();
      this.changed();
    }
  }

  /**
   * Envoie un message ; renvoie 'ok', 'drop' (refus définitif), 'pause' (jeton refusé), 'refuse' (jeton d'un autre
   * commandant) ou 'retry'.
   */
  async deliver(item, token = this.token) {
    const later = `nouvel essai dans ${minutes(this.retryMs)}`;
    let res;
    try {
      res = await this.fetch(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(item),
        redirect: 'manual', // comme le plugin : le jeton ne suit jamais une redirection vers une autre adresse
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      return { outcome: 'retry', code: 'injoignable', text: `Serveur injoignable : ${later}.` };
    }
    res.body?.cancel?.().catch?.(() => {}); // la réponse ne sert pas : on libère la connexion
    const status = res.status;
    if (status === 200) return { outcome: 'ok', code: 'ok', text: 'Dernier envoi accepté par le serveur.' };
    if (WORKER_PAUSE_STATUSES.has(status)) {
      return { outcome: 'pause', code: 'jeton', text: `Jeton refusé (erreur ${status}) : vérifie-le ou demande-en un nouveau. Les gains attendent dans la file.` };
    }
    if (WORKER_CMDR_STATUSES.has(status)) {
      return {
        outcome: 'refuse',
        code: 'commandant',
        text: `Ce jeton n'est pas celui de ${item.cmdr} (erreur 403) : ses gains attendent dans la file. Colle le jeton de ce commandant, ou fais corriger le nom enregistré par l'escadron puis « Réessayer maintenant ».`,
      };
    }
    if (WORKER_DROP_STATUSES.has(status)) return { outcome: 'drop', code: 'refus', text: `Gain refusé par le serveur (erreur ${status}) : ignoré.` };
    if (status === 429) return { outcome: 'retry', code: 'limite', text: `Trop d'envois d'un coup (erreur 429) : ${later}.` };
    if (status >= 300 && status < 400) {
      return { outcome: 'retry', code: 'redirection', text: `Redirection refusée : le jeton ne part qu'à l'adresse prévue (erreur ${status}) ; ${later}.` };
    }
    return { outcome: 'retry', code: 'serveur', text: `Serveur indisponible (erreur ${status}) : ${later}.` };
  }

  /** `token` : le jeton de l'envoi ; remplacé entre-temps, l'acceptation ne dit rien du commandant du nouveau. */
  finish(item, outcome, token = this.token) {
    const key = keyOf(item);
    const i = this.queue.findIndex((p) => keyOf(p) === key);
    if (i >= 0) this.queue.splice(i, 1);
    this.queued.delete(key);
    this.done.add(key);
    if (outcome === 'ok') {
      this.counts.sent++;
      if (!this.lastConfirmedAt || item.at > this.lastConfirmedAt) this.lastConfirmedAt = item.at;
      this.lastOkAt = iso(this.now());
      if (token === this.token) {
        this.tokenCmdr = item.cmdr;
        this.refused.delete(item.cmdr.toLowerCase());
      }
    } else if (outcome === 'drop') this.counts.dropped++;
    else this.counts.expired++;
    this.saveSoon();
  }

  // --- Réglages ---

  /**
   * Nouveau jeton ; `cmdr` : le commandant de ce jeton, choisi par le joueur parmi ceux des journaux (sans lui, avec
   * plusieurs commandants, rien ne part avant son choix).
   */
  setToken(raw, cmdr) {
    // Un texte seulement : [jeton] ou { toString } ne deviennent jamais un jeton (String() les accepterait)
    if (typeof raw !== 'string') throw tokenError();
    const token = raw.trim();
    if (!TOKEN_FORMAT.test(token)) throw tokenError();
    if (!this.url) throw publicError(409, 'Règle d’abord le serveur de ton escadron (ou colle le code de l’escadron) : un jeton ne vaut que pour lui.');
    const chosen = cmdr === undefined || cmdr === null ? null : this.knownCmdr(cmdr); // vérifié avant tout changement
    this.store.writeToken(token);
    this.token = token;
    this.tokenCmdr = null; // un nouveau jeton peut être celui d'un autre commandant
    this.chosenCmdr = chosen;
    this.refused.clear(); // les gains refusés (403) avec l'ancien jeton repartent avec celui-ci
    this.paused = false;
    this.status = { code: 'jeton', text: 'Jeton enregistré.', at: iso(this.now()) };
    this.reconsider();
    this.changed();
    this.kick();
  }

  /**
   * Serveur de l'escadron (Worker) : « https://… », ou vide pour celui de l'app. Un autre serveur efface le jeton (il
   * n'a été donné que par l'ancien : il ne part jamais ailleurs) et oublie ce que l'ancien avait confirmé, pour que le
   * nouveau reçoive aussi le rattrapage.
   */
  setWorker(raw) {
    const base = workerBase(raw); // vérifié avant tout changement
    if (base === this.workerBase) return;
    this.useWorker(base);
    this.store.clearToken();
    this.token = null;
    this.tokenCmdr = null;
    this.chosenCmdr = null;
    this.refused.clear();
    this.paused = false;
    this.done.clear();
    this.lastConfirmedAt = null;
    this.lastOkAt = null;
    this.counts = { sent: 0, dropped: 0, expired: 0 };
    this.clearTimer(this.retryTimer);
    this.retryTimer = null;
    this.status = { code: 'serveur', text: 'Serveur changé : jeton effacé. Colle le jeton que ce serveur t’a donné.', at: iso(this.now()) };
    this.reconsider();
    this.changed();
  }

/**
   * Inscription avec le code de l'escadron (POST /v1/join du Worker), le même pour tous : « ESC1.… » (serveur et mot de
   * passe, code.js) ou le mot de passe seul pour le serveur déjà réglé. Le serveur renvoie un jeton pour ce commandant,
   * enregistré comme un jeton collé ; rejoindre à nouveau (autre PC, plugin en plus) en donne un autre. `cmdr` : le
   * commandant à inscrire, un de ceux des journaux ; sans lui, le seul des journaux. Le code part une fois, n'est jamais
   * gardé ni écrit.
   */
  /**
   * Ce que ferait « Rejoindre » avec ce code, sans rien envoyer : le serveur visé, et s'il remplace celui où l'on est
   * déjà inscrit (la page demande alors de confirmer, avec le nom de l'hôte). Refus clairs pour un code de gestion
   * collé ici par erreur, un code illisible, ou un mot de passe seul sans serveur choisi.
   */
  apercuCode(code) {
    const t = typeof code === 'string' ? code.trim() : '';
    if (/^[A-Z]{3}\d\./.test(t) && !t.startsWith(PREFIXE_ESCADRON)) {
      throw publicError(400, 'C’est un code de gestion, pas le code de l’escadron : ne le colle jamais ici ni sur Discord, il donne tous les droits sur le serveur.');
    }
    const lu = lireCodeEscadron(t);
    if (!lu) throw publicError(400, 'Code de l’escadron illisible : recopie-le en entier, tel que le chef l’a posté.');
    if (lu.motDePasse.length > 200) throw publicError(400, 'Code de l’escadron trop long.');
    // Mot de passe seul : seulement pour un serveur déjà choisi (il n'y a pas de serveur par défaut)
    if (!lu.serveur && !this.url) {
      throw publicError(400, 'Colle le code complet de l’escadron (il commence par « ESC1. ») : il dit à quel serveur t’inscrire.');
    }
    const base = lu.serveur ? workerBase(lu.serveur) : this.workerBase ?? null; // vérifiée ; null : le serveur déjà réglé
    const origine = base ?? new URL(this.url).origin;
    const change = (base ?? null) !== (this.workerBase ?? null);
    return { lu, base, hote: new URL(origine).hostname, change, confirmer: change && Boolean(this.token) };
  }

  async join(code, cmdr, { confirmerServeur } = {}) {
    const { lu, base, hote, change, confirmer } = this.apercuCode(code);
    const password = lu.motDePasse;
    let who;
    if (cmdr !== undefined && cmdr !== null) who = this.knownCmdr(cmdr);
    else if (this.cmdrs.size === 1) who = this.cmdrs.values().next().value;
    else if (this.cmdrs.size > 1) throw publicError(400, 'Plusieurs commandants dans tes journaux : choisis celui à inscrire.');
    else throw publicError(400, 'Aucun commandant dans tes journaux : lance le jeu une fois, puis recommence.');
    // Déjà inscrit ailleurs : changer de serveur se confirme, avec le nom de l'hôte (un faux code ne détourne rien)
    if (confirmer && confirmerServeur !== hote) {
      throw publicError(409, `Ce code mène à un autre serveur (${hote}) que celui où tu es inscrit. Confirme pour changer d’escadron.`);
    }
    // L'essai se fait sur le serveur visé SANS toucher à l'état : le jeton actuel ne part que si l'inscription réussit
    const ancienHote = this.workerBase ? new URL(this.workerBase).hostname : null;
    if (change) this.allowHost(base ? hote : null);
    const url = `${base ?? new URL(this.url).origin}/v1/join`;
    let res;
    try {
      res = await this.fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cmdr: who, password }),
        redirect: 'manual', // le mot de passe ne suit jamais une redirection
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      if (change) this.allowHost(ancienHote);
      throw publicError(502, 'Serveur de l’escadron injoignable : vérifie son adresse et ta connexion.');
    }
    const refus = {
      400: 'Nom de commandant refusé par le serveur (lettres, chiffres, espace et . _ \' - seulement).',
      401: 'Code de l’escadron refusé par le serveur : il a peut-être changé, redemande-le au chef.',
      403: 'Le chef a fermé les inscriptions : demande-lui de les rouvrir.',
      404: 'Ce serveur n’accepte pas d’inscription par code : demande au chef de l’activer, ou un jeton.',
      409: `CMDR ${who} ne peut pas s’inscrire ici : serveur d’une ancienne version, demande au chef un jeton.`,
      429: 'Trop d’essais, ou déjà 10 installations pour ce nom : attends une minute, ou demande au chef de couper tes anciennes installations.',
    };
    if (res.status !== 200 && change) this.allowHost(ancienHote);
    if (res.status !== 200) {
      res.body?.cancel?.().catch?.(() => {});
      if (refus[res.status]) throw publicError(400, refus[res.status]);
      throw publicError(502, `Serveur de l’escadron indisponible (erreur ${res.status}).`);
    }
    let body = null;
    try {
      body = await res.json();
    } catch {
      // réponse illisible : traitée plus bas
    }
    if (typeof body?.token !== 'string' || !TOKEN_FORMAT.test(body.token)) {
      if (change) this.allowHost(ancienHote);
      throw publicError(502, 'Réponse inattendue du serveur de l’escadron.');
    }
    // Réussi : le serveur et le jeton changent ensemble
    if (change) this.setWorker(base);
    this.setToken(body.token, who);
    this.status = { code: 'jeton', text: `Inscrit sur le serveur de l’escadron : CMDR ${who}. Active l’envoi pour commencer.`, at: iso(this.now()) };
    this.changed();
  }

  clearToken() {
    this.store.clearToken();
    this.token = null;
    this.tokenCmdr = null;
    this.chosenCmdr = null;
    this.refused.clear();
    this.paused = false;
    this.status = { code: 'off', text: 'Jeton effacé : rien ne part.', at: iso(this.now()) };
    this.saveSoon();
    this.changed();
  }

  /** Active ou coupe l'envoi ; `since` : 'now', 'week' ou 'max' (voir SINCE_CHOICES). */
  configure({ enabled, since } = {}) {
    if (since !== undefined && !SINCE_CHOICES.has(since)) {
      const err = new Error('Point de départ inconnu.');
      err.status = 400;
      err.publicMessage = err.message;
      throw err;
    }
    if (typeof enabled === 'boolean' && enabled !== this.enabled) {
      this.enabled = enabled;
      this.paused = false;
      this.clearTimer(this.retryTimer);
      this.retryTimer = null;
      if (enabled && since === undefined && this.since === null) this.since = sinceFor('week', this.now());
      this.status = enabled
        ? { code: 'on', text: this.token ? 'Envoi activé.' : 'Envoi activé : colle ton jeton pour commencer.', at: iso(this.now()) }
        : { code: 'off', text: 'Envoi désactivé : rien ne part.', at: iso(this.now()) };
    }
    if (since !== undefined) this.since = sinceFor(since, this.now());
    this.reconsider();
    this.changed();
    this.kick();
  }

  /** Commandant des journaux qui porte ce nom (casse libre), sinon erreur 400. */
  knownCmdr(name) {
    const ok = typeof name === 'string' && name.length <= WORKER_MAX_TEXT;
    const known = ok ? this.cmdrs.get(name.toLowerCase()) ?? this.cmdrs.get(name.trim().toLowerCase()) : undefined;
    if (!known) throw publicError(400, "Commandant inconnu : choisis l'un des commandants de tes journaux.");
    return known;
  }

  /**
   * Le joueur dit quel commandant est celui de son jeton (plusieurs commandants dans les journaux) ; null retire le
   * choix. Seulement un commandant des journaux, et jamais un autre que celui que le Worker a déjà accepté pour ce
   * jeton (409 : il faut le jeton de l'autre commandant).
   */
  chooseCmdr(name) {
    const chosen = name === null ? null : this.knownCmdr(name);
    if (chosen && this.tokenCmdr && this.tokenCmdr.toLowerCase() !== chosen.toLowerCase()) {
      throw publicError(409, `Ce jeton est déjà accepté pour CMDR ${this.tokenCmdr} : pour envoyer les gains de CMDR ${chosen}, colle son jeton à lui.`);
    }
    this.chosenCmdr = chosen;
    this.status = chosen
      ? { code: 'commandant', text: `Commandant du jeton : CMDR ${chosen}. Seuls ses gains partent.`, at: iso(this.now()) }
      : { code: 'commandant', text: 'Choix du commandant retiré.', at: iso(this.now()) };
    this.reconsider();
    this.changed();
    this.kick();
  }

  /** « Réessayer maintenant » : sans attendre la minute, et les commandants refusés (403) ont une nouvelle chance. */
  retryNow() {
    this.clearTimer(this.retryTimer);
    this.retryTimer = null;
    this.paused = false;
    if (this.refused.size) {
      this.refused.clear();
      this.saveSoon();
    }
    this.kick();
  }

  stop() {
    this.stopped = true;
    this.clearTimer(this.retryTimer);
    this.retryTimer = null;
    if (this.saveTimer) this.save();
  }

  changed() {
    this.onChange();
  }

  // --- Vue pour l'interface (jamais le jeton en clair) ---

  /** Gains vus dans la période choisie, rangés par sort. */
  tally() {
    const from = Math.max(this.since ?? -Infinity, this.now() - WORKER_MAX_AGE_MS + AGE_MARGIN_MS);
    const out = { seen: 0, doublon: 0, galaxie: 0, invalide: 0, annule: 0, annuleApresEnvoi: 0, autreCommandant: 0 };
    const cancelled = this.cancelledKeys();
    for (const c of this.candidates) {
      if (Date.parse(c.payload.at) < from) continue;
      out.seen++;
      // Annulé par la ligne suivante alors qu'il était déjà parti : compté par le Worker, qui n'accepte pas de retrait
      // (sauf si une ligne créditée a la même clé : c'est elle que le Worker a comptée)
      if (c.skip === 'annule' && this.done.has(c.key) && cancelled.has(c.key)) out.annuleApresEnvoi++;
      else if (c.skip) out[c.skip]++;
      else if (this.otherCmdr(c.payload)) out.autreCommandant++;
    }
    return out;
  }

  view() {
    const blocked = this.queue.filter((p) => this.blocked(p));
    return {
      enabled: this.enabled,
      destination: this.url,
      // Serveur de l'escadron du joueur, réglé par lui ; null : aucun (il n'y a pas de serveur par défaut)
      worker: this.workerBase ?? null,
      hasToken: Boolean(this.token),
      token: maskToken(this.token),
      tokenCmdr: this.tokenCmdr,
      chosenCmdr: this.chosenCmdr,
      // Commandant dont les gains partent (null : aucun, en attendant le choix du joueur), et ceux des journaux
      sendingFor: this.allowedCmdr(),
      needsChoice: this.needsChoice(),
      commanders: [...this.cmdrs.values()].sort((a, b) => a.localeCompare(b, 'fr')).slice(0, 20),
      since: iso(this.since),
      sinceChoices: [...SINCE_CHOICES].map(([id, label]) => ({ id, label })),
      queue: this.queue.length,
      // Gains en file que ce jeton ne peut pas créditer (403, autre commandant que celui du jeton, ou choix attendu)
      blocked: blocked.length,
      blockedCmdrs: [...new Map(blocked.map((p) => [p.cmdr.toLowerCase(), p.cmdr])).values()].slice(0, 5),
      oldestPending: this.queue[0]?.at ?? null,
      sending: this.running,
      waitingRetry: Boolean(this.retryTimer),
      paused: this.paused,
      lastConfirmedAt: this.lastConfirmedAt,
      lastOkAt: this.lastOkAt,
      status: this.status,
      counts: { ...this.counts },
      tally: this.tally(),
      commander: this.context.cmdr,
      system: this.context.system,
      gameVersion: this.context.gameVersion,
      liveGalaxy: isLiveGalaxy(this.context.gameVersion),
      // Le Worker ne compte qu'une fois un même gain (rules.js WORKER_DEDUP) : le plugin EDMC peut rester actif
      workerDeduplicates: true,
    };
  }
}

