// Module « Bilans de session » : chaque session de jeu (chargement → fermeture), reconstruite depuis le journal, pour
// comparer ses soirées ; et une fenêtre en jeu qui donne le bilan à la fermeture du jeu, ou celui du mode qu'on quitte
// au changement de mode. Les changements de mode (que le journal n'écrit pas) sont gardés dans bilan-modes.json.

import { dataPath } from '../../core/paths.js';
import { readJsonFile, writeJsonAtomicSync } from '../../core/atomic.js';
import { currentReference } from '../../core/reference/refdata.js';
import { BILAN_EVENTS, Bilans, abandonnee, bilan, comparaison } from './state.js';

const FICHIER_MODES = dataPath('bilan-modes.json');
const MAX_REPERES = 2000;
export const BILAN_PAGE = 'bilan';
const DUREE_FIN_MS = 3 * 60_000; // bilan de la session, à la fermeture du jeu
const DUREE_MODE_MS = 90_000; // bilan du mode qu'on quitte
const COMPTEURS = ['merites', 'materiauxTotal', 'morts', 'sauts', 'distance', 'primes', 'obligations'];

function lireReperes() {
  const r = readJsonFile(FICHIER_MODES, { fallback: null });
  return Array.isArray(r)
    ? r.filter((x) => x && typeof x.at === 'string' && (x.mode === null || typeof x.mode === 'string') && (x.vu == null || typeof x.vu === 'string')).slice(-MAX_REPERES)
    : [];
}

export default {
  id: 'bilan',
  name: 'Bilans de session',

  async register({ router, journal, game, broadcast, overlay }) {
    const gradeOf = (key) => currentReference()?.materials.get(key)?.grade || null; // cache commun, suit les mises à jour
    let bilans = new Bilans(gradeOf);
    let reperes = lireReperes();
    let fenetre = null; // bilan montré dans la fenêtre en jeu
    let minuterie = null;
    let depart = null; // compteurs de la session au dernier changement de mode (bilan du mode qu'on quitte)
    let precedent = overlay?.mode?.() ?? null; // mode actif avant le changement

    const montrer = (contenu, dureeMs) => {
      fenetre = contenu;
      broadcast('bilan:fenetre', fenetre);
      overlay?.setExtra?.(BILAN_PAGE, true);
      clearTimeout(minuterie);
      minuterie = setTimeout(fermer, dureeMs);
      minuterie.unref?.();
    };
    const fermer = () => {
      clearTimeout(minuterie);
      minuterie = null;
      overlay?.setExtra?.(BILAN_PAGE, false);
      return fenetre;
    };
    const vue = () => {
      // Session plantée (sans Shutdown) et abandonnée : « interrompue », plus « en cours », et comptée dans les médianes
      const enCours = (s) => s === bilans.courante && !abandonnee(s, Date.now());
      const liste = bilans.sessions.map((s) => bilan(s, { enCours: enCours(s) })).reverse();
      return { sessions: liste.slice(0, 100), comparaison: comparaison(liste.filter((b) => !b.enCours)) };
    };

    journal.addInterest(BILAN_EVENTS);
    journal.on('ready', ({ history }) => {
      bilans = new Bilans(gradeOf);
      for (const ev of history) bilans.apply(ev);
      bilans.placerModes(reperes);
      bilans.solde(game?.snapshot?.()?.balance); // solde actuel : le gain de la session en cours sans attendre un changement
      // Session en cours au démarrage du serveur : le bilan du mode actuel partira d'ici
      const s = bilans.courante;
      depart = s && !s.termine && !abandonnee(s, Date.now()) ? { at: new Date().toISOString(), ...Object.fromEntries(COMPTEURS.map((k) => [k, s[k]])) } : null;
    });
    journal.on('event', (ev) => {
      // Tout événement en direct (minage, combat, scans…) avance la fin de la session (state.js, apply)
      if (!bilans.apply(ev)) return;
      broadcast('bilan:update', { at: ev.timestamp });
      if (ev.event === 'Shutdown') {
        const s = bilans.sessions.at(-1);
        if (s) montrer({ genre: 'session', bilan: bilan(s), comparaison: vue().comparaison }, DUREE_FIN_MS);
      }
    });
    journal.on('status', (st) => bilans.signe(st?.timestamp)); // Status.json réécrit : le jeu tourne (signe de vie)
    game?.on?.('change', (snap) => bilans.solde(snap?.balance));

    // Changement de mode de jeu : repère enregistré, et bilan du mode qu'on quitte (compteurs depuis le changement d'avant)
    overlay?.onMode?.((mode) => {
      const at = new Date().toISOString();
      const s = bilans.courante;
      const quitte = s?.modes.at(-1)?.mode ?? precedent;
      precedent = mode ?? null;
      // Session de la veille restée ouverte (jeu planté sans Shutdown, puis relancé ou rien depuis longtemps) : ce mode
      // n'est pas à elle
      const ouverte = Boolean(s) && !s.termine && !abandonnee(s, Date.parse(at));
      // Le repère garde le dernier signe de vie : au redémarrage, l'historique relu ne contient que les événements que
      // les modules demandent, et jamais Status.json. Session fermée ou abandonnée : pas de départ (pas de bilan du mode
      // calculé avec les compteurs d'une autre session)
      const vu = ouverte ? bilans.dernierSigne() : null;
      reperes = [...reperes, { at, mode: mode ?? null, ...(vu ? { vu } : {}) }].slice(-MAX_REPERES);
      try {
        writeJsonAtomicSync(FICHIER_MODES, reperes);
      } catch {
        // disque plein ou dossier en lecture seule : le repère tient jusqu'au redémarrage
      }
      if (!ouverte) {
        depart = null;
        return;
      }
      if (quitte && depart) {
        const delta = Object.fromEntries(COMPTEURS.map((k) => [k, Math.round((s[k] - (depart[k] ?? 0)) * 10) / 10]));
        const duree = Date.parse(at) - Date.parse(depart.at);
        if (duree >= 60_000) montrer({ genre: 'mode', mode: quitte, debut: depart.at, fin: at, duree, ...delta }, DUREE_MODE_MS);
      }
      s.modes.push({ mode: mode ?? null, at });
      depart = { at, ...Object.fromEntries(COMPTEURS.map((k) => [k, s[k]])) };
    });

    router.get('/sessions', (req, res) => res.json(vue()));
    router.get('/fenetre', (req, res) => res.json(fenetre));
    router.post('/fenetre/fermer', (req, res) => res.json(fermer()));
  },
};
