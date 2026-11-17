// Module « Garde des commandes » : quand une manette manque, le jeu ignore en silence le profil de commandes et
// repasse aux commandes par défaut ; réassigner à ce moment écrase le profil. Le module lit le rapport du jeu
// (BindingLoadingErrors.log) au démarrage, à chaque lancement du jeu et quand le dossier change, et prévient :
// bandeau dans l'app, petite fenêtre fermable par-dessus le jeu.
//
// Lecture seule : rien n'est jamais écrit dans le dossier des commandes du jeu. Aucun envoi réseau.

import path from 'node:path';
import { dataPath, gameOptionsDisplay, gameOptionsPath } from '../../core/paths.js';
import { BINDINGS_SUBDIR } from './rules.js';
import { BindingsGuard, LAUNCH_EVENTS, lastWriteMs } from './guard.js';
import { decodeText } from './parse.js';
import { lireAssignations, vueAssignations } from './assignations.js';
import { INTENTIONS } from './catalogue.js';

const POLL_MS = 3000; // sondage du dossier (dates et tailles seulement) : un rapport réécrit est vu en 3 s
const DATA_FILE = dataPath('bindings-guard.json');

/**
 * Dossier des profils de commandes : %LOCALAPPDATA%\Frontier Developments\Elite Dangerous\Options\Bindings, ou
 * ELITE_GAME_OPTIONS_DIR\Bindings (core/paths.js). Le dernier élément de BINDINGS_SUBDIR (rules.js) est le sous-dossier.
 */
export function defaultBindingsDir(env = process.env) {
  const sub = BINDINGS_SUBDIR.at(-1);
  return { dir: gameOptionsPath(sub, env), displayDir: gameOptionsDisplay(sub, env) };
}

/**
 * Dernier signe de vie du jeu vu par le service des journaux (ms) : écriture du journal actif ou de Status.json, ou
 * dernier événement lu en direct. null si rien n'est connu.
 */
export function journalSignOfLife(journal) {
  const files = [journal.file, journal.dir ? path.join(journal.dir, 'Status.json') : null];
  const written = lastWriteMs(files);
  const read = journal.lastEventAt instanceof Date ? journal.lastEventAt.getTime() : null;
  if (written == null) return read;
  return read == null ? written : Math.max(written, read);
}

/**
 * Module, avec ses chemins (les tests passent des dossiers temporaires).
 * @param dir      dossier des commandes du jeu (lecture seule)
 * @param dataFile fichier JSON du module (alertes fermées)
 * @param pollMs   sondage du dossier, 0 pour aucun
 * @param now      horloge (les tests la fixent)
 */
export function createBindingsModule({ dir, displayDir, dataFile = DATA_FILE, pollMs = POLL_MS, now = Date.now } = {}) {
  return {
    id: 'bindings',
    name: 'Garde des commandes',

    async register({ router, journal, broadcast, overlay }) {
      const where = dir ? { dir, displayDir: displayDir || dir } : defaultBindingsDir();
      const guard = new BindingsGuard({ ...where, dataFile, overlay, broadcast, now, lastSignOfLife: () => journalSignOfLife(journal) });
      const launchEvents = new Set(LAUNCH_EVENTS);
      let started = false;

      journal.addInterest(LAUNCH_EVENTS);
      journal.on('ready', ({ history }) => {
        started = true;
        guard.setHistory(history.filter((ev) => launchEvents.has(ev.event)));
      });
      journal.on('event', (ev) => {
        if (launchEvents.has(ev.event)) guard.event(ev);
      });
      if (pollMs > 0) {
        const timer = setInterval(() => started && guard.poll(), pollMs);
        timer.unref?.();
      }

      router.get('/status', (req, res) => res.json(guard.refresh()));

      /**
       * Mes commandes : les assignations du profil personnel choisi au démarrage (StartPreset), en LECTURE SEULE, avec
       * le catalogue (nom français, intention, section approximative du menu). Une catégorie du jeu (Vaisseau, VRS, À
       * pied…) qui utilise un profil fourni avec le jeu est signalée : ses commandes ne sont pas celles de ce fichier.
       */
      router.get('/assignations', (req, res) => {
        const status = guard.refresh();
        const categories = status.startPresets?.categories || [];
        const perso = categories.filter((c) => c.file);
        const compte = new Map();
        for (const c of perso) compte.set(c.file, (compte.get(c.file) || 0) + 1);
        const plusRecent = [...status.profiles].sort((a, b) => String(b.modifiedAt).localeCompare(String(a.modifiedAt)))[0]?.file || null;
        const fichier = [...compte.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || plusRecent;
        const profil = status.profiles.find((p) => p.file === fichier) || null;
        const buf = fichier ? guard.readFile(fichier) : null;
        res.json({
          dossierTrouve: status.dirFound,
          profil: profil && { fichier: profil.file, nom: profil.preset, modifie: profil.modifiedAt },
          // Catégories du jeu servies par un autre profil que celui-ci (fourni avec le jeu, ou un autre fichier)
          autres: categories.filter((c) => c.file !== fichier).map((c) => ({ categorie: c.label, profil: c.preset, fourni: Boolean(c.builtin) })),
          intentions: INTENTIONS,
          approximatif: true,
          entrees: buf ? vueAssignations(lireAssignations(decodeText(buf))) : [],
        });
      });
      // Fermer l'alerte : { where: 'overlay' | 'banner', id } (id : l'alerte affichée, pour ne pas fermer une nouvelle)
      router.post('/dismiss', (req, res) => {
        const { where, id } = req.body || {};
        if (id != null && (typeof id !== 'string' || !/^[0-9a-f]{12}$/.test(id))) return res.status(400).json({ error: 'Alerte inconnue.' });
        const status = guard.dismiss(where, id);
        if (!status) return res.status(400).json({ error: "Indique où fermer l'alerte : overlay ou banner." });
        res.json(status);
      });

      return guard; // pour les tests
    },
  };
}

export default createBindingsModule();
