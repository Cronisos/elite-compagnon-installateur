// Module « Refroidissement FSD » : fenêtre par-dessus le jeu pendant le refroidissement du FSD hors saut (après une
// surcharge du supercruise, par exemple), ouverte et fermée d'elle-même.
//
// Le jeu n'indique ni ce qui a déclenché le refroidissement ni sa durée : chaque changement des indicateurs FSD de
// Status.json est noté dans data/fsd-status.log, pour vérifier son comportement. Les durées mesurées y sont aussi.
// Au-delà de 1 Mo, il devient fsd-status.1.log (une seule copie gardée) : il ne grandit jamais sans limite.
//
// La même fenêtre montre le compte à rebours de l'overdrive (SCO) après sa coupure, puis « SCO prêt » : voir sco.js.

import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from '../../core/paths.js';
import { isPlainObject, readJsonFile, writeJsonAtomicSync } from '../../core/atomic.js';
import { FLAG, FsdCooldown } from './state.js';
import { ScoCooldown, scoNote, shipKey, learnShipName, SHIP_NAME_EVENTS, scoGeneration, SCO_COOLDOWN_MS } from './sco.js';

// Marge de lecture de Status.json (relu toutes les 500 ms) : une réactivation à moins de ça près n'est pas un écart
const SCO_TOLERANCE_MS = 600;
import { loadSamples, saveSamples } from './scoStore.js';

const PAGE = 'fsdcool'; // page /hud/fsdcool de l'overlay
const DATA = dataDir(); // core/paths.js
const LOG = path.join(DATA, 'fsd-status.log');
const SAVED = path.join(DATA, 'fsd-cooldown.json'); // durées mesurées, gardées d'une session à l'autre
const SCO_SAVED = path.join(DATA, 'sco-cooldown.json'); // écarts mesurés entre coupure et réactivation du SCO
const WATCHED = FLAG.supercruise | FLAG.charging | FLAG.cooldown;

/** Au-delà de cette taille, fsd-status.log devient fsd-status.1.log (une seule copie gardée, comme bureau.log). */
export const LOG_MAX = 1024 * 1024;

/**
 * Relevé en ajout qui ne grandit jamais sans limite : une ligne horodatée par appel, écrite en arrière-plan dans
 * l'ordre ; passé `max` octets, le fichier devient <nom>.1.log et un nouveau commence. La taille est lue une fois, puis
 * suivie en mémoire. Rend note(ligne), et note.attendre() (promesse de la dernière écriture, pour les tests).
 */
export function releve(fichier, { max = LOG_MAX, now = () => new Date() } = {}) {
  const copie = fichier.replace(/\.log$/, '.1.log');
  let taille = null;
  let chaine = Promise.resolve();
  const note = (line) => {
    const texte = `${now().toISOString()} ${line}\n`;
    chaine = chaine.then(async () => {
      try {
        if (taille === null) taille = await fs.promises.stat(fichier).then((s) => s.size, () => 0);
        if (taille > max) {
          await fs.promises.rename(fichier, copie).catch(() => {});
          taille = 0;
        }
        await fs.promises.appendFile(fichier, texte);
        taille += Buffer.byteLength(texte);
      } catch {
        // un relevé qui ne s'écrit pas n'arrête jamais le module
      }
    });
  };
  note.attendre = () => chaine;
  return note;
}

const note = releve(LOG);

export default {
  id: 'fsdcool',
  name: 'Refroidissement FSD',

  async register({ router, journal, game, broadcast, overlay, vigie }) {
    const state = new FsdCooldown();
    // Aucune mesure encore, ou fichier illisible (mis de côté) : liste vide
    const saved = readJsonFile(SAVED, { fallback: {}, accept: isPlainObject, label: 'Refroidissement FSD' });
    state.durations = Array.isArray(saved.durations) ? saved.durations.filter((d) => Number.isFinite(d)) : [];
    let lastWatched = null;
    let lastFlags2 = null;
    const sco = new ScoCooldown(loadSamples(SCO_SAVED));
    const summary = () => ({ ...state.summary(), sco: sco.summary(Date.now()) });
    // Fenêtre ouverte pendant le refroidissement du FSD, ou pendant le compte à rebours du SCO puis son signal « prêt »
    let closeTimer = null;
    const show = () => {
      const now = Date.now();
      overlay.setExtra(PAGE, Boolean(state.active) || sco.shown(now));
      broadcast('fsdcool:update', summary());
      clearTimeout(closeTimer);
      const until = sco.shownUntil(now);
      closeTimer = until !== null ? setTimeout(show, until - now + 100) : null;
    };

    // Nom affiché de chaque type de vaisseau (Loadout ne le donne pas) : voir SHIP_NAME_EVENTS dans sco.js
    const shipNames = new Map();
    const shipName = () => shipNames.get(shipKey(game.snapshot().loadout?.ship)) ?? null;

    journal.addInterest(['StartJump', 'FSDJump', ...Object.keys(SHIP_NAME_EVENTS)]);
    journal.on('ready', ({ history }) => {
      for (const ev of history) learnShipName(shipNames, ev);
    });
    journal.on('event', (ev) => {
      learnShipName(shipNames, ev);
      if (ev.event === 'LoadGame') sco.interrupted('rechargement du jeu');
      if (ev.event === 'StartJump' && ev.JumpType !== 'Hyperspace') return;
      if (ev.event === 'StartJump' || ev.event === 'FSDJump') {
        state.jumped(Date.now());
        sco.interrupted('saut hyperespace');
      }
    });

    journal.on('status', (st, { initial } = {}) => {
      const flags = Number(st.Flags) || 0;
      const flags2 = Number(st.Flags2) || 0;
      // Relevé : chaque changement des indicateurs FSD (et de Flags2), pour vérifier ce que fait le jeu
      if (!initial && ((flags & WATCHED) !== lastWatched || flags2 !== lastFlags2)) {
        note(`supercruise=${+!!(flags & FLAG.supercruise)} charge=${+!!(flags & FLAG.charging)} refroidissement=${+!!(flags & FLAG.cooldown)} Flags=${flags} Flags2=${flags2}`);
      }
      lastWatched = flags & WATCHED;
      lastFlags2 = flags2;

      const now = Date.now();
      const change = state.status(flags, now);
      const scoChange = sco.status(flags, flags2, now, () => game.snapshot().loadout?.ship, shipName);
      if (initial || (!change && !scoChange)) return;
      if (change === 'end') {
        note(`durée mesurée : ${(state.durations.at(-1) / 1000).toFixed(1)} s`);
        try {
          writeJsonAtomicSync(SAVED, { durations: state.durations }); // jamais un fichier coupé (core/atomic.js)
        } catch (err) {
          console.error(`FSD : durée non enregistrée (${err.message})`);
        }
      }
      const line = scoNote(scoChange);
      if (line) note(line);
      // Vigie des règles : chaque réactivation du SCO face au refroidissement de la fiche (supercroisiere.sco.refroidissement).
      // Réactivé plus tôt que la fiche ne le permet : écart ; mesure écartée (vaisseau inconnu, trop court ou trop long) :
      // écart expliqué, jamais compté pour une alerte.
      const m = scoChange?.measure;
      if (m && vigie) {
        const generation = scoGeneration(m.ship);
        const attendu = SCO_COOLDOWN_MS[generation];
        const tot = m.ms < attendu - SCO_TOLERANCE_MS;
        vigie.observe({ regle: 'supercroisiere.sco.refroidissement', attendu, observe: m.ms, ecart: tot, explication: tot && !m.kept ? m.why : null, details: { generation, vaisseau: m.ship } });
      }
      if (scoChange?.measure?.kept) {
        try {
          saveSamples(SCO_SAVED, sco.samples);
        } catch (err) {
          console.error(`SCO : mesure non enregistrée (${err.message})`);
        }
      }
      show();
    });

    router.get('/session', (req, res) => res.json(summary()));
    router.get('/sco', (req, res) => res.json(sco.report(game.snapshot().loadout?.ship)));
  },
};
