// Fenêtres en jeu (overlay, transparentes au-dessus d'Elite) : pas d'animation CSS sans fin (B76). Une animation
// « infinite » fait redessiner la fenêtre en continu pendant toute la partie ; elles font quelques cycles, puis restent
// fixes. Le compagnon garde ses animations sans fin dans l'app, et les limite dans sa fenêtre en jeu (.cp-window).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const lire = (relatif) => fs.readFileSync(new URL(relatif, import.meta.url), 'utf8');

test('cadre des fenêtres en jeu et jauge du FSD : aucune animation sans fin', () => {
  for (const f of ['./hud.jsx', '../modules/fsdcool/index.jsx']) {
    const lignes = lire(f).split('\n').filter((l) => /animation[^;]*\binfinite\b/.test(l));
    assert.deepEqual(lignes, [], `${f} : animation sans fin au-dessus du jeu`);
  }
});

test('compagnon : dans sa fenêtre en jeu, chaque animation d’attente a un nombre de cycles', () => {
  const css = lire('../modules/compagnon/CompanionView.jsx');
  for (const sel of ['.cp-window .cp-sway', '.cp-window .cp-breathe', '.cp-window .cp-blink.is-blinking']) {
    assert.match(css, new RegExp(`${sel.replace(/[.]/g, '\\.')} \\{ animation-iteration-count: \\d+; \\}`), sel);
  }
});
