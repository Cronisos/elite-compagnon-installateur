// Bilans de session, reconstruits depuis le journal : une session va d'un chargement de partie (LoadGame) à la
// fermeture du jeu (Shutdown), ou au chargement suivant si le jeu s'est arrêté sans le dire. Pour chacune : durée,
// crédits (solde au chargement → au chargement suivant, ou le solde en direct), mérites Powerplay, matériaux ramassés
// par grade, morts, sauts et distance, primes et obligations encaissées, vaisseaux pilotés, et les modes de jeu
// choisis pendant la session (repères enregistrés au fil de l'eau : le journal ne les écrit pas). Fonctions pures.

import { MeritCounter } from '../../core/merits.js';

// Fileheader : un nouveau lancement du jeu (part 1) sans Shutdown avant clôt la session d'avant (jeu planté)
export const BILAN_EVENTS = ['Fileheader', 'LoadGame', 'Shutdown', 'Died', 'MaterialCollected', 'PowerplayMerits', 'Powerplay', 'FSDJump', 'RedeemVoucher', 'ShipyardSwap'];
const MAX_SESSIONS = 300;

const nombre = (v) => (Number.isFinite(v) ? v : null);
const ms = (iso) => (typeof iso === 'string' ? Date.parse(iso) : NaN);

/**
 * Session restée ouverte sans Shutdown (jeu planté, PC éteint) et sans relance du jeu : passé ce délai sans aucun signe
 * de vie, elle est finie. Signes de vie : tout événement reçu (apply avance s.fin pour chacun, compté ou non : en direct,
 * tout le journal ; au redémarrage, seulement les événements que les modules relisent), chaque Status.json (signe), les
 * changements de mode et le signe noté avec eux. Le délai est long (bien plus qu'une pause de 10 min, core/activity.js) :
 * une longue séance de minage garde ses modes, même après un redémarrage du serveur ; le lendemain, un mode choisi avant
 * de lancer le jeu n'étire plus la session de la veille.
 */
export const ABANDON_MS = 2 * 3_600_000;

/**
 * Dernier signe de vie d'une session : son dernier événement reçu (s.fin), le dernier Status.json (s.vu), son dernier
 * changement de mode, ou `vu` (signe de vie noté avec un repère de mode, bilan-modes.json), le plus tard des quatre.
 */
function derniereActivite(s, vu) {
  const debut = ms(s.debut);
  const temps = [ms(s.fin), ms(s.vu), ms(s.modes.at(-1)?.at), ms(vu)].filter((t) => Number.isFinite(t) && t >= debut);
  return temps.length ? Math.max(...temps) : NaN;
}

/**
 * La session non terminée est-elle abandonnée à l'heure t (ms) ? Oui si le jeu a été relancé avant t (interrompue), ou
 * après ABANDON_MS sans signe de vie. Une session terminée par un Shutdown ne l'est jamais.
 * @param {string} [vu] signe de vie connu en plus (ISO), celui d'un repère de mode
 */
export function abandonnee(s, t, vu) {
  if (!s || s.termine) return false;
  if (s.interrompue && !(t < ms(s.interrompue))) return true;
  return Number.isFinite(t) && t - derniereActivite(s, vu) > ABANDON_MS;
}

function nouvelle(ev) {
  return {
    debut: ev.timestamp,
    fin: ev.timestamp,
    vu: null, // dernier signe de vie lu en direct hors du journal (Status.json), s'il est après fin
    termine: false,
    interrompue: null, // heure du Fileheader d'une relance du jeu sans Shutdown avant : la session s'est arrêtée sans le dire
    creditsDebut: nombre(ev.Credits),
    creditsFin: null,
    merites: 0,
    materiaux: [0, 0, 0, 0, 0],
    materiauxTotal: 0,
    morts: 0,
    sauts: 0,
    distance: 0,
    primes: 0,
    obligations: 0,
    vaisseaux: [],
    modes: [],
  };
}

export class Bilans {
  /** @param gradeOf nom interne d'un matériau → grade (1 à 5) ou null */
  constructor(gradeOf = () => null) {
    this.gradeOf = gradeOf;
    this.sessions = [];
    this.courante = null;
    this.merites = new MeritCounter();
  }

  /** Vaisseau piloté, ajouté une fois à la session. */
  vaisseau(nom) {
    if (this.courante && typeof nom === 'string' && nom && !this.courante.vaisseaux.includes(nom)) this.courante.vaisseaux.push(nom);
  }

  apply(ev) {
    if (!ev || typeof ev.timestamp !== 'string') return false;
    if (ev.event === 'LoadGame') {
      const avant = this.courante;
      if (avant && avant.creditsFin == null) avant.creditsFin = nombre(ev.Credits);
      this.courante = nouvelle(ev);
      this.sessions.push(this.courante);
      if (this.sessions.length > MAX_SESSIONS) this.sessions.shift();
      this.vaisseau(ev.Ship_Localised || ev.Ship);
      return true;
    }
    const s = this.courante;
    if (ev.event === 'Fileheader') {
      // part 1 : le jeu vient d'être lancé. La session encore ouverte (pas de Shutdown) s'est arrêtée avec l'ancien
      // lancement ; sa fin reste son dernier événement. part 2, 3… : le même lancement continue dans un nouveau journal.
      if (!s || s.termine || s.interrompue || Number(ev.part) > 1) return false;
      s.interrompue = ev.timestamp;
      return true;
    }
    if (!s || s.termine || s.interrompue) return false;
    s.fin = ev.timestamp;
    switch (ev.event) {
      case 'Shutdown':
        s.termine = true;
        break;
      case 'Died':
        s.morts++;
        break;
      case 'MaterialCollected': {
        const n = Number.isInteger(ev.Count) && ev.Count > 0 ? ev.Count : 0;
        const g = this.gradeOf(String(ev.Name || '').toLowerCase());
        s.materiauxTotal += n;
        if (g >= 1 && g <= 5) s.materiaux[g - 1] += n;
        break;
      }
      case 'Powerplay':
        this.merites.setTotal(ev.Merits);
        break;
      case 'PowerplayMerits':
        s.merites += this.merites.gain(ev); // négatif quand le jeu retire un doublon (core/merits.js)
        break;
      case 'FSDJump':
        s.sauts++;
        s.distance += nombre(ev.JumpDist) ?? 0;
        break;
      case 'RedeemVoucher': {
        const a = nombre(ev.Amount) ?? 0;
        if (/^bounty$/i.test(ev.Type)) s.primes += a;
        else if (/^combatbond$/i.test(ev.Type)) s.obligations += a;
        break;
      }
      case 'ShipyardSwap':
        // Nom en clair seulement (« Panther Clipper Mk II ») ; le nom interne (« panthermkii ») ne veut rien dire ici
        if (ev.ShipType_Localised) this.vaisseau(ev.ShipType_Localised);
        break;
      default:
        return false;
    }
    return true;
  }

  /** Solde en direct (Status.json) : fin des crédits de la session en cours. */
  solde(balance) {
    if (this.courante && !this.courante.termine && !this.courante.interrompue && Number.isFinite(balance)) this.courante.creditsFin = balance;
  }

  /**
   * Signe de vie lu en direct hors du journal (Status.json, réécrit par le jeu tant qu'on joue) : rien n'est compté ni
   * la fin déplacée (même journal, même bilan), mais la session en cours n'est pas abandonnée tant que le jeu écrit.
   */
  signe(iso) {
    const s = this.courante;
    const t = ms(iso);
    if (!s || s.termine || s.interrompue || !Number.isFinite(t)) return;
    if (t > Math.max(ms(s.fin), Number.isFinite(ms(s.vu)) ? ms(s.vu) : -Infinity)) s.vu = iso;
  }

  /** Dernier signe de vie de la session en cours (ISO), à noter avec un repère de mode ; null sans session ouverte. */
  dernierSigne() {
    const s = this.courante;
    if (!s || s.termine || s.interrompue) return null;
    return Number.isFinite(ms(s.vu)) && ms(s.vu) > ms(s.fin) ? s.vu : s.fin;
  }

  /**
   * Repères de mode de jeu ({ at, mode, vu? }, triés) rangés dans les sessions dont ils tombent dans l'intervalle.
   * `vu` : dernier signe de vie de la session quand le mode a été choisi (les événements non comptés ne sont pas dans
   * l'historique relu au démarrage : sans lui, une longue séance de minage perdrait ses modes au redémarrage).
   */
  placerModes(reperes) {
    for (const s of this.sessions) s.modes = [];
    for (const r of reperes || []) {
      const t = ms(r.at);
      // Une session sans Shutdown (la session en cours, ou une session plantée puis suivie d'une relance du jeu) n'a pas
      // de fin connue : un repère après son début est à elle, sauf si elle est abandonnée à ce moment-là (jeu relancé
      // avant, ou aucun signe de vie depuis ABANDON_MS : ce repère vient d'une autre soirée)
      const ouverte = (x) => !x.termine && (x === this.courante || x.interrompue) && !abandonnee(x, t, r.vu);
      const s = this.sessions.findLast((x) => ms(x.debut) <= t && (t <= ms(x.fin) + 60_000 || ouverte(x)));
      if (s) s.modes.push({ mode: r.mode ?? null, at: r.at });
    }
  }
}

/**
 * Bilan lisible d'une session : durée, gain, taux par heure, et les modes avec leur durée.
 * @param s session (Bilans.sessions) ; enCours : c'est la session en cours et elle n'est pas abandonnée (index.js)
 * La fin est le dernier événement du journal (ou le dernier changement de mode s'il est plus tard), jamais l'heure de
 * l'ordinateur : même journal, même bilan (le rejeu du banc le vérifie). En jeu, le journal écrit sans cesse.
 */
export function bilan(s, { enCours = false } = {}) {
  const dernierMode = s.modes.at(-1)?.at;
  const fin = !s.termine && dernierMode && ms(dernierMode) > ms(s.fin) ? dernierMode : s.fin;
  const duree = Math.max(0, ms(fin) - ms(s.debut));
  const heures = duree / 3_600_000;
  const gain = s.creditsDebut != null && s.creditsFin != null ? s.creditsFin - s.creditsDebut : null;
  const parHeure = (v) => (v != null && heures >= 0.05 ? Math.round(v / heures) : null);
  const modes = s.modes.map((m, i) => {
    const jusqua = s.modes[i + 1]?.at ?? fin;
    return { mode: m.mode, debut: m.at, duree: Math.max(0, ms(jusqua) - ms(m.at)) };
  }).filter((m) => m.mode);
  return {
    debut: s.debut,
    fin,
    enCours: !s.termine && !s.interrompue && enCours,
    termine: s.termine,
    duree,
    gain,
    gainHeure: parHeure(gain),
    merites: s.merites,
    meritesHeure: parHeure(s.merites),
    materiaux: s.materiaux,
    materiauxTotal: s.materiauxTotal,
    morts: s.morts,
    sauts: s.sauts,
    distance: Math.round(s.distance * 10) / 10,
    primes: s.primes,
    obligations: s.obligations,
    vaisseaux: s.vaisseaux,
    modes,
  };
}

/**
 * Repères des sessions passées (au moins 10 min), pour comparer : gain/h et mérites/h « habituels », et les records.
 * La médiane, pas la moyenne : un vaisseau acheté pendant une courte session ferait plonger une moyenne de centaines
 * de millions (vu sur les sessions du joueur : −130 M/h de moyenne, pour une médiane positive).
 */
export function comparaison(bilans) {
  const utiles = bilans.filter((b) => b.duree >= 10 * 60_000);
  const moyenne = (k) => {
    const v = utiles.map((b) => b[k]).filter((x) => x != null).sort((a, b) => a - b);
    if (!v.length) return null;
    const i = Math.floor(v.length / 2);
    return Math.round(v.length % 2 ? v[i] : (v[i - 1] + v[i]) / 2);
  };
  const record = (k) => utiles.reduce((m, b) => (b[k] != null && (m == null || b[k] > m[k]) ? b : m), null);
  return {
    sessions: utiles.length,
    gainHeure: moyenne('gainHeure'),
    meritesHeure: moyenne('meritesHeure'),
    recordGainHeure: record('gainHeure')?.gainHeure ?? null,
    recordMeritesHeure: record('meritesHeure')?.meritesHeure ?? null,
  };
}
