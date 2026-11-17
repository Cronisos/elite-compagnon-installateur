// Pont de l'overlay simulé : dans le vrai overlay, chaque fenêtre /hud/<page> reçoit window.eliteOverlay de
// overlay/preload.js (Electron). Le contrôle des pages ouvre ces fenêtres dans Chrome sans fenêtre, avec ce pont-ci à
// la place : mêmes fonctions, qui ne font rien, et des réponses d'overlay ordinaires (fenêtre montrée, tiroir à gauche,
// pas de mode souris). Ainsi les fenêtres suivent le même chemin de code que dans le jeu.
//
// Les fonctions viennent de overlay/preload.js lui-même : une fonction ajoutée là sans réponse prévue ici arrête le
// contrôle (une fenêtre qui l'utiliserait ne serait pas vraiment contrôlée).

import fs from 'node:fs';
import path from 'node:path';
import { RACINE } from '../banc/chemins.mjs';

export const PRELOAD = path.join(RACINE, 'overlay', 'preload.js');
export const MAIN = path.join(RACINE, 'overlay', 'main.js');

/**
 * Réponses des canaux « invoke » (promesses) ; `page` : nom de la fenêtre (/hud/<page>).
 * window-shown : les fenêtres ouvertes cachées (liste des repères, guidage, balayage, capture) sont montrées, pour que
 * leur contenu soit contrôlé ; dock-side : tiroir à gauche (côté par défaut de overlay/main.js) ; capture : pas de
 * photo (rien à photographier) ; step : pas de redimensionnement de overlay/main.js (STEPS) ; mouse-mode : coupé.
 */
export const REPONSES = {
  'window-shown': () => 'true',
  'dock-side': () => "'left'",
  capture: () => 'null',
  step: (_page, steps) => `(${JSON.stringify(steps)}[page] ?? null)`,
  'mouse-mode': () => 'false',
  // Cadre de la jauge de bouclier (vision) : aucun repère noté, rien d'enregistré ; mode disposition des fenêtres : coupé
  'bouclier-etat': () => 'null',
  'bouclier-noter': () => 'null',
  disposition: () => 'false',
};

/** Fonctions exposées par le preload : [{ nom, genre: 'invoke'|'send'|'on', canal }]. */
export function fonctionsDuPreload(source) {
  const bloc = /exposeInMainWorld\(\s*'eliteOverlay'\s*,\s*\{([\s\S]*?)\n\}\s*\)/.exec(source);
  if (!bloc) throw new Error("overlay/preload.js : exposeInMainWorld('eliteOverlay', { … }) introuvable.");
  const lignes = bloc[1].split('\n').filter((l) => /^\s{2}\w+\s*:/.test(l));
  const out = [];
  for (const l of lignes) {
    // ipcRenderer.invoke/send/on('canal', …), ou ecouter('canal', …) : un « on » qui rend de quoi se désabonner
    const m = /^\s{2}(\w+)\s*:\s*\([^)]*\)\s*=>\s*(?:ipcRenderer\.(invoke|send|on)|(ecouter))\(\s*'([\w-]+)'/.exec(l);
    if (!m) throw new Error(`overlay/preload.js : fonction de forme inattendue, le pont simulé ne sait pas la reproduire :\n${l.trim()}`);
    out.push({ nom: m[1], genre: m[2] ?? 'on', canal: m[4] });
  }
  if (!out.length) throw new Error('overlay/preload.js : aucune fonction exposée trouvée.');
  return out;
}

/** Pas de redimensionnement par fenêtre (const STEPS = { capture: 10 } de overlay/main.js). */
export function pasDuMain(source) {
  const m = /const STEPS = \{([^}]*)\}/.exec(source);
  if (!m) throw new Error('overlay/main.js : const STEPS = { … } introuvable (réponse du canal « step »).');
  const steps = {};
  for (const p of m[1].split(',').map((s) => s.trim()).filter(Boolean)) {
    const kv = /^'?([\w-]+)'?\s*:\s*(\d+)$/.exec(p);
    if (!kv) throw new Error(`overlay/main.js : STEPS de forme inattendue (${p}).`);
    steps[kv[1]] = Number(kv[2]);
  }
  return steps;
}

/** Script à lancer avant la page : window.eliteOverlay simulé, figé (la page ne peut pas le remplacer). */
export function scriptPont({ preload = fs.readFileSync(PRELOAD, 'utf8'), main = fs.readFileSync(MAIN, 'utf8') } = {}) {
  const fonctions = fonctionsDuPreload(preload);
  const steps = pasDuMain(main);
  const corps = fonctions.map(({ nom, genre, canal }) => {
    if (genre === 'invoke') {
      if (!Object.hasOwn(REPONSES, canal)) throw new Error(`overlay/preload.js : nouveau canal « ${canal} » (${nom}) sans réponse dans scripts/controle/pages/pont.mjs (REPONSES).`);
      return `    ${nom}: async () => ${REPONSES[canal](null, steps)},`;
    }
    // send : rien à faire ; on : l'overlay n'envoie rien, et le désabonnement rendu (ecouter) ne fait rien non plus
    return genre === 'on' ? `    ${nom}: () => () => {},` : `    ${nom}: () => {},`;
  });
  return `(() => {
  const page = decodeURIComponent(location.pathname).replace(/^\\/hud\\//, '');
  Object.defineProperty(window, 'eliteOverlay', { value: Object.freeze({
${corps.join('\n')}
  }), enumerable: true });
})();`;
}
