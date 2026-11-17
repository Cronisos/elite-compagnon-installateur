// Module « Couleurs du HUD » : choisir la couleur de l'interface du jeu, avec un aperçu, puis l'appliquer.
//
// Seule exception à la règle « l'app ne modifie jamais les fichiers du jeu », voulue par le joueur : le fichier
// d'options GraphicsConfigurationOverride.xml (dossier Options\Graphics du jeu), et lui seul, avec sauvegarde
// et confirmation (store.js). Le jeu lit ce fichier à son démarrage : il faut le relancer pour voir le changement.

import fs from 'node:fs';
import path from 'node:path';
import { GameRun, RUN_EVENTS } from './gameRun.js';
import { defaultOptionsDir, HudColourFile } from './store.js';
import { LIMIT } from './xml.js';
import { teinteApp } from './teinte.js';
import { dataPath } from '../../core/paths.js';
import { readJsonFile, writeJsonAtomicSync } from '../../core/atomic.js';

// Réglage « l'app prend la couleur de mon HUD » (oui par défaut)
const FICHIER_TEINTE = dataPath('teinte-app.json');
const lireSuivre = () => readJsonFile(FICHIER_TEINTE, { fallback: null })?.suivre !== false;

const SET = new Set(RUN_EVENTS);
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

export default {
  id: 'hudcolours',
  name: 'Couleurs du HUD',

  /** hudColoursDir : dossier injecté par les tests (jamais celui du jeu pendant les tests). */
  async register({ router, journal, broadcast, hudColoursDir, teinteFile }) {
    const store = new HudColourFile({ dir: hudColoursDir || defaultOptionsDir() });
    let run = new GameRun();

    journal.addInterest(RUN_EVENTS);
    journal.on('ready', ({ history }) => {
      run = new GameRun();
      for (const ev of history) if (SET.has(ev.event)) run.apply(ev);
    });
    journal.on('event', (ev) => {
      if (SET.has(ev.event)) run.apply(ev);
    });

    /** Dernière écriture du journal actif ou de Status.json (ms), ou dernier événement reçu. */
    function lastWrite() {
      let t = journal.lastEventAt ? new Date(journal.lastEventAt).getTime() : null;
      // Status.json change plus souvent que le journal (train, cible, carburant…) : moins de « état inconnu »
      for (const file of [journal.file, journal.dir && path.join(journal.dir, 'Status.json')]) {
        if (!file) continue;
        try {
          t = Math.max(t ?? 0, fs.statSync(file).mtimeMs);
        } catch {
          // journal effacé, Status.json absent ou dossier changé
        }
      }
      return t;
    }

    const state = async () => ({ ...(await store.state()), game: run.status({ lastWrite: lastWrite() }), limit: LIMIT });
    async function done(res, result) {
      const s = await state();
      if (result.changed) broadcast('hudcolours:update', { version: s.version });
      res.json({ result, state: s });
    }

    router.get('/state', wrap(async (req, res) => res.json(await state())));

    /**
     * Teinte de l'app : les oranges de l'app vus à travers la matrice du HUD (fichier des options du jeu, appliquée au
     * prochain lancement du jeu). suivre : faux, l'app garde ses couleurs d'origine.
     */
    const fichierTeinte = teinteFile || FICHIER_TEINTE;
    const suivre = () => (teinteFile ? readJsonFile(teinteFile, { fallback: null })?.suivre !== false : lireSuivre());
    router.get('/teinte', wrap(async (req, res) => {
      const s = await store.state();
      const t = teinteApp(suivre() ? s.matrix : null);
      res.json({ suivre: suivre(), ...t });
    }));
    router.put('/teinte', (req, res) => {
      const v = req.body?.suivre;
      if (typeof v !== 'boolean') return res.status(400).json({ error: 'Indique suivre : true ou false.' });
      try {
        writeJsonAtomicSync(fichierTeinte, { suivre: v });
      } catch {
        return res.status(500).json({ error: 'Réglage non enregistré.' });
      }
      broadcast('hudcolours:update', { teinte: true });
      res.json({ suivre: v });
    });

    // Écritures : confirmation (confirm: true) et version du fichier affichée (version) exigées
    router.post('/apply', wrap(async (req, res) => {
      const b = req.body || {};
      await done(res, await store.apply(b.matrix, { version: b.version, confirm: b.confirm }));
    }));
    router.post('/reset', wrap(async (req, res) => {
      const b = req.body || {};
      await done(res, await store.reset({ version: b.version, confirm: b.confirm }));
    }));
    router.post('/restore', wrap(async (req, res) => {
      const b = req.body || {};
      await done(res, await store.restore(b.name, { version: b.version, confirm: b.confirm }));
    }));
  },
};
