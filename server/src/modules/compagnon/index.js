// Module « Compagnon » : un petit personnage qui réagit à ce que fait le joueur, avec des phrases écrites à
// l'avance (plusieurs variantes par situation), un avatar à plusieurs humeurs et une bulle. Aucune IA, aucun réseau.
//
// - triggers.js : événements du journal et Status.json → catégorie + contexte ;
// - engine.js   : choix de la phrase (sac mélangé, délais, bavardage, silence en combat) ;
// - packs.js    : avatars (pack par défaut livré, packs du joueur dans server/data/compagnon/avatars) ;
// - settings.js : réglages (server/data/compagnon.json) ;
// - externe.js  : phrase venue d'un autre module (POST /dire : le copilote IA répond dans la bulle).
//
// La fenêtre par-dessus le jeu (/hud/compagnon) s'ouvre quand le jeu tourne, si le réglage est actif, et se ferme
// peu après la fermeture du jeu, ou après 20 min sans nouvelles du jeu (plantage, arrêt sans « Shutdown »).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataDir } from '../../core/paths.js';
import { overlayToujours } from '../../core/overlay.js';
import { CATEGORIES, GLOBAL_VARS, MOOD_LABELS } from './categories.js';
import { LEVELS, Speaker, categoryOn } from './engine.js';
import { cleanPhrases, mergePhrases } from './phrases.js';
import { DEFAULT_PACK, SLOTS, checkImage, imageFor, listPacks, packInfo, validPackId } from './packs.js';
import { cleanSettings, loadSettings, saveSettings } from './settings.js';
import { phraseExterne } from './externe.js';
import { HISTORY_EVENTS, Triggers } from './triggers.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = dataDir(); // core/paths.js
const SETTINGS_FILE = path.join(DATA, 'compagnon.json');
export const PACKS_DIR = path.join(DATA, 'compagnon', 'avatars');
const BUILTIN_DIR = path.join(HERE, 'avatars', DEFAULT_PACK);
const PAGE = 'compagnon'; // page /hud/compagnon de l'overlay
const IMAGE_BASE = '/api/modules/compagnon/avatars';
// Comme les images du module Ingénierie (un module n'importe pas le code d'un autre) : ouvertes seules dans un onglet,
// aucun script ne s'exécute (sandbox) et le navigateur ne devine pas un autre type de contenu (nosniff)
const IMAGE_HEADERS = { 'Content-Security-Policy': 'sandbox', 'X-Content-Type-Options': 'nosniff' };
const SLOT_SET = new Set(SLOTS);
const TICK_MS = 5_000;
const CLOSE_AFTER_SHUTDOWN_MS = 15_000; // le temps de dire au revoir
const PLACE_MS = 5 * 60_000; // fenêtre ouverte pour la placer alors que le jeu ne tourne pas : refermée après 5 min

function bad(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  err.publicMessage = message;
  return err;
}

function loadDefaultPhrases() {
  const raw = JSON.parse(fs.readFileSync(path.join(HERE, 'phrases.json'), 'utf8'));
  const { phrases, errors } = cleanPhrases(raw);
  for (const e of errors) console.warn(`Compagnon, phrases par défaut : ${e}`);
  return phrases;
}

export default {
  id: 'compagnon',
  name: 'Compagnon',

  async register({ router, journal, game, broadcast, overlay }) {
    const defaults = loadDefaultPhrases();
    let settings = loadSettings(SETTINGS_FILE);
    let packs = listPacks({ dir: PACKS_DIR, builtinDir: BUILTIN_DIR });
    const usable = (id) => (packs.has(id) && packs.get(id).ok ? packs.get(id) : null);
    const activePack = () => usable(settings.pack) || packs.get(DEFAULT_PACK);
    const phrasesOf = (pack) => mergePhrases(defaults, pack.phrases, pack.replacePhrases);
    const startPhrases = phrasesOf(activePack());
    const speaker = new Speaker({ phrases: startPhrases });
    let phrasesKey = JSON.stringify(startPhrases);
    /** Phrases du pack choisi relues (pack.json modifié, autre pack) : les sacs repartent seulement si elles changent. */
    function refreshPhrases() {
      const next = phrasesOf(activePack());
      const key = JSON.stringify(next);
      if (key === phrasesKey) return;
      phrasesKey = key;
      speaker.setPhrases(next);
    }
    let triggers = new Triggers(settings);
    let last = null; // dernière phrase dite (une fenêtre qui s'ouvre juste après la montre encore)
    let seq = 0;
    let mood = 'neutre'; // humeur de fond : endormi après une longue inactivité
    let closeTimer = null;
    let placedAt = null; // fenêtre ouverte depuis les réglages, jeu fermé

    const publicState = () => ({ settings, pack: packInfo(activePack(), IMAGE_BASE), baseMood: mood, last });

    function syncMood() {
      const next = triggers.sleeping ? 'endormi' : 'neutre';
      if (next === mood) return;
      mood = next;
      broadcast('compagnon:mood', { mood });
    }

    function speak(trigger) {
      const at = Date.now();
      const line = speaker.say(trigger, { at, settings, combat: triggers.inCombat(at), cmdr: triggers.commander });
      if (!line) return;
      last = { ...line, id: ++seq, at: new Date(at).toISOString(), pack: activePack().id, name: settings.name };
      broadcast('compagnon:say', last);
    }

    function handle(list) {
      for (const t of list) {
        if (t.delay) setTimeout(() => speak(t), t.delay);
        else speak(t);
      }
      syncMood();
    }

    // --- Fenêtre par-dessus le jeu ---
    // App de bureau (overlay toujours actif) : le copilote a TOUJOURS sa propre fenêtre, déplaçable (✥), comme les
    // modules ; il n'est plus dans la fenêtre principale. Elle reste ouverte jeu fermé (le ◆ la cache avec le reste).
    // Navigateur : réglage « fenêtre par-dessus le jeu », ouverte quand le jeu tourne.
    const bureau = overlayToujours();
    const veutFenetre = (s) => s.enabled && (s.overlay || bureau);
    const setWindow = (on) => overlay?.setExtra?.(PAGE, on);
    const fermerFenetre = () => !bureau && setWindow(false);
    /** Le jeu tourne : la fenêtre s'ouvre si le réglage le demande. */
    function gameActive() {
      clearTimeout(closeTimer);
      closeTimer = null;
      placedAt = null;
      if (veutFenetre(settings)) setWindow(true);
    }

    journal.addInterest(HISTORY_EVENTS);
    journal.on('ready', ({ history }) => {
      triggers = new Triggers(settings);
      triggers.prime(history);
      if (journal.stateData?.status) triggers.status(journal.stateData.status, Date.now(), { initial: true });
      syncMood();
      // Serveur relancé : la fenêtre que le serveur d'avant avait ouverte (le jeu tournait) reste ouverte, sans attendre
      // le prochain événement du jeu ; sinon elle se fermerait quelques secondes après le démarrage (core/overlay.js)
      if ((bureau || overlay?.shown?.(PAGE)) && veutFenetre(settings)) setWindow(true);
    });
    journal.on('event', (ev) => {
      const out = triggers.event(ev, Date.now());
      if (ev.event === 'Shutdown') {
        clearTimeout(closeTimer);
        closeTimer = setTimeout(fermerFenetre, CLOSE_AFTER_SHUTDOWN_MS);
      } else gameActive();
      handle(out);
    });
    journal.on('status', (st, { initial } = {}) => {
      if (initial) {
        triggers.status(st, Date.now(), { initial: true });
        return;
      }
      const out = triggers.status(st, Date.now());
      if (triggers.gameOn) gameActive();
      handle(out);
    });
    setInterval(() => {
      const at = Date.now();
      const wasOn = triggers.gameOn;
      handle(triggers.tick(at));
      // Jeu disparu sans « Shutdown » (plantage, arrêt forcé) : la fenêtre ne reste pas sur le bureau
      if (wasOn && !triggers.gameOn) fermerFenetre();
      else if (placedAt != null && !triggers.gameOn && at - placedAt >= PLACE_MS) {
        placedAt = null;
        fermerFenetre();
      }
    }, TICK_MS).unref();

    // --- API ---
    router.get('/state', (req, res) => res.json(publicState()));

    router.put('/settings', (req, res, next) => {
      try {
        const body = req.body || {};
        // Packs relus à chaque enregistrement : un pack.json modifié depuis compte tout de suite
        packs = listPacks({ dir: PACKS_DIR, builtinDir: BUILTIN_DIR });
        if (Object.hasOwn(body, 'pack') && !usable(body.pack)) throw bad('Pack d’avatar introuvable ou inutilisable.');
        const before = settings;
        const after = cleanSettings(body, settings);
        if (after.bigProfit < after.minProfit) throw bad('La très grosse vente doit valoir au moins le bon bénéfice.');
        saveSettings(SETTINGS_FILE, after);
        settings = after;
        refreshPhrases();
        triggers.configure(after);
        // Fenêtre : ouverte tout de suite quand on l'active (pour la placer : 5 min si le jeu ne tourne pas), fermée
        // quand on la coupe
        if (veutFenetre(after)) {
          if (!veutFenetre(before)) {
            setWindow(true);
            if (!triggers.gameOn) placedAt = Date.now();
          }
        } else {
          placedAt = null;
          setWindow(false);
        }
        const state = publicState();
        broadcast('compagnon:settings', state);
        res.json(state);
      } catch (err) {
        next(err);
      }
    });

    /** Catégories, avec leurs phrases pour un pack (celui choisi par défaut). */
    router.get('/categories', (req, res) => {
      const pack = (typeof req.query.pack === 'string' && usable(req.query.pack)) || activePack();
      const phrases = phrasesOf(pack);
      res.json({
        moods: MOOD_LABELS,
        levels: Object.fromEntries(Object.entries(LEVELS).map(([id, l]) => [id, l.label])),
        categories: CATEGORIES.map((c) => ({
          id: c.id,
          label: c.label,
          when: c.when,
          kind: c.kind,
          vars: [...GLOBAL_VARS, ...c.vars],
          cases: c.cases || [],
          enabled: categoryOn(settings, c.id),
          phrases: phrases[c.id],
        })),
      });
    });

    router.get('/packs', (req, res) => {
      packs = listPacks({ dir: PACKS_DIR, builtinDir: BUILTIN_DIR });
      refreshPhrases(); // « ↻ Recharger la liste » : les phrases du pack choisi aussi
      res.json({ dir: PACKS_DIR, packs: [...packs.values()].map((p) => packInfo(p, IMAGE_BASE)) });
    });

    router.get('/packs/:id', (req, res) => {
      const pack = validPackId(req.params.id) ? packs.get(req.params.id) : null;
      if (!pack) return res.status(404).json({ error: 'Pack introuvable.' });
      return res.json(packInfo(pack, IMAGE_BASE));
    });

    router.get('/avatars/:pack/:slot', (req, res) => {
      const { pack: id, slot } = req.params;
      if (!validPackId(id) || !SLOT_SET.has(slot)) return res.status(404).end();
      const pack = packs.get(id);
      const img = pack && imageFor(pack, slot);
      if (!img) return res.status(404).end();
      // Vérifiée de nouveau : le fichier a pu changer depuis la lecture du pack
      const check = checkImage(path.dirname(img.file), path.basename(img.file), { allowSvg: pack.builtin });
      if (check.error) return res.status(404).end();
      return res.set({ ...IMAGE_HEADERS, 'Content-Type': check.type, 'Cache-Control': 'no-cache' }).sendFile(check.file);
    });

    /**
     * Phrase venue d'un autre module (le copilote IA…) : dite avec l'avatar et la bulle, plus longtemps qu'une
     * réplique. Coupé dans ses réglages, le compagnon ne dit rien.
     */
    router.post('/dire', (req, res, next) => {
      try {
        const p = phraseExterne(req.body);
        if (p.error) throw bad(p.error);
        if (!settings.enabled) return res.json({ dit: false });
        // Fenêtre fermée par « Aucun » : dans l'app de bureau, rien d'autre ne la rouvrirait (elle n'est jamais fermée par
        // son module) ; une réponse à une question que le joueur vient de poser est son occasion de revenir
        if (veutFenetre(settings) && !overlay?.shown?.(PAGE)) {
          setWindow(false);
          setWindow(true);
        }
        last = { category: 'externe', text: p.text, mood: p.mood, alert: false, ms: p.ms, source: p.source, ...(p.parler ? { parler: true, voix: p.voix, vitesse: p.vitesse, hauteur: p.hauteur, volume: p.volume, audio: p.audio } : {}), id: ++seq, at: new Date().toISOString(), pack: activePack().id, name: settings.name };
        broadcast('compagnon:say', last);
        return res.json({ dit: true, ...last });
      } catch (err) {
        return next(err);
      }
    });

    /**
     * Bouton « Essayer » : une phrase de la catégorie, avec le nom et le pack en cours de réglage, sans rien
     * enregistrer (ni réglage, ni sac de phrases, ni délai). Montrée aussi dans la fenêtre en jeu.
     */
    router.post('/try', (req, res, next) => {
      try {
        const { category, name, pack: packId } = req.body || {};
        if (!CATEGORIES.some((c) => c.id === category)) throw bad('Catégorie inconnue.');
        const pack = (typeof packId === 'string' && usable(packId)) || activePack();
        const draft = cleanSettings(typeof name === 'string' ? { name } : {}, settings);
        const sampler = pack.id === activePack().id ? speaker : new Speaker({ phrases: phrasesOf(pack) });
        const line = sampler.sample(category, { settings: draft, cmdr: triggers.commander || game?.snapshot?.().commander });
        if (!line) throw bad('Aucune phrase pour cette catégorie.', 404);
        const payload = { ...line, id: ++seq, at: new Date().toISOString(), pack: pack.id, name: draft.name, preview: true };
        broadcast('compagnon:say', payload);
        res.json(payload);
      } catch (err) {
        next(err);
      }
    });
  },
};
