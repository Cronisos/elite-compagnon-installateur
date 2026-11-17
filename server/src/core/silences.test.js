// Silences des propositions (« Non », bascule annulée) gardés d'un démarrage à l'autre (core/silences.js), et leur
// relecture par ModeAdvisor (core/modeGuess.js) : constat du 9 nov., « Non » ne tenait plus après un redémarrage.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SilenceStore } from './silences.js';
import { DISMISS_MS, ModeAdvisor } from './modeGuess.js';

function dossier(t) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-silences-'));
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  return d;
}

const T0 = Date.parse('2026-11-08T10:00:00Z');

/** Une app qui démarre : son store et ses propositions, sur le fichier `file`, à l'heure `clock.t`. */
function demarrer(file, clock, warnings = []) {
  const store = new SilenceStore({ file, now: () => clock.t, warn: (m) => warnings.push(m) });
  const advisor = new ModeAdvisor({ mode: () => null, now: () => clock.t, timers: null, store });
  return { store, advisor, warnings };
}

test('« Non » tient après un redémarrage de l’app, jusqu’au bout de ses 30 min', (t) => {
  const file = path.join(dossier(t), 'mode-silences.json');
  const clock = { t: T0 };
  const a = demarrer(file, clock);
  a.advisor.propose({ mode: 'waypoints', reason: 'rôle principal de « Pioche » : …', source: 'role', shipId: 43 });
  a.advisor.dismiss();
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { version: 1, silences: { waypoints: '2026-11-08T10:30:00.000Z' } });
  // Cinq minutes plus tard, l'app redémarre : le silence est relu
  clock.t = T0 + 5 * 60_000;
  const b = demarrer(file, clock);
  assert.equal(b.advisor.silenced('waypoints'), true);
  assert.equal(b.advisor.propose({ mode: 'waypoints', reason: 'Rhino sorti' }), null, 'la proposition ne revient pas');
  assert.equal(b.advisor.silenced('combat'), false);
  // Au bout des 30 min, plus rien
  clock.t = T0 + DISMISS_MS + 1;
  assert.equal(b.advisor.silenced('waypoints'), false);
  const c = demarrer(file, clock);
  assert.equal(c.advisor.silenced('waypoints'), false, 'échéance passée : oubliée à la relecture');
  // Une bascule annulée se tait aussi (silence), et tient de même
  c.advisor.silence('combat');
  clock.t += 60_000;
  assert.equal(demarrer(file, clock).advisor.silenced('combat'), true);
  // Les échéances passées ne restent pas dans le fichier
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(file, 'utf8')).silences), ['combat']);
});

test('relecture stricte : modes connus seulement, jamais une clé de prototype, dates lisibles, 30 min au plus', (t) => {
  const file = path.join(dossier(t), 'mode-silences.json');
  fs.writeFileSync(file, `{"version":1,"silences":{
    "__proto__":"2026-11-08T10:20:00.000Z",
    "constructor":"2026-11-08T10:20:00.000Z",
    "inconnu":"2026-11-08T10:20:00.000Z",
    "combat":"2026-11-08T10:20:00.000Z",
    "rescue":"pas une date",
    "materials":12,
    "routes":"2027-01-01T00:00:00.000Z",
    "colonisation":"2026-11-08T09:00:00.000Z"
  }}`);
  const clock = { t: T0 };
  const { advisor, warnings } = demarrer(file, clock);
  assert.deepEqual([...advisor.dismissed.keys()].sort(), ['combat', 'routes']);
  assert.equal(advisor.dismissed.get('combat'), Date.parse('2026-11-08T10:20:00.000Z'));
  assert.equal(advisor.dismissed.get('routes'), T0 + DISMISS_MS, 'fichier retouché ou horloge reculée : jamais plus de 30 min');
  assert.equal(advisor.silenced('constructor'), false);
  assert.equal(Object.getPrototypeOf(advisor.dismissed), Map.prototype);
  assert.ok(warnings.some((w) => /Silences des propositions : 5 entrée\(s\) illisible\(s\) ignorée\(s\)/.test(w)), warnings.join(' | '));
});

test('fichier illisible : mis de côté, départ à vide, avertissement ; l’app repart et réécrit', (t) => {
  const d = dossier(t);
  const file = path.join(d, 'mode-silences.json');
  for (const contenu of ['{ cassé', '[]', JSON.stringify({ version: 2, silences: {} }), JSON.stringify({ version: 1, silences: [] })]) {
    fs.writeFileSync(file, contenu);
    const clock = { t: T0 };
    const { advisor, warnings } = demarrer(file, clock);
    assert.equal(advisor.dismissed.size, 0, contenu);
    assert.ok(warnings.some((w) => /Silences des propositions : fichier illisible, mis de côté/.test(w)), contenu);
    const aside = fs.readdirSync(d).find((f) => f.startsWith('mode-silences.json.illisible-'));
    assert.equal(fs.readFileSync(path.join(d, aside), 'utf8'), contenu, 'contenu gardé tel quel');
    fs.rmSync(path.join(d, aside));
    advisor.propose({ mode: 'combat', reason: 'prime gagnée' });
    advisor.dismiss();
    assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(file, 'utf8')).silences), ['combat']);
  }
});

test('fichier là mais pas relu (verrouillé) : rien n’est écrit par-dessus ; relu à l’écriture suivante, ses silences gardés', (t) => {
  const file = path.join(dossier(t), 'mode-silences.json');
  fs.writeFileSync(file, JSON.stringify({ version: 1, silences: { rescue: '2026-11-08T10:25:00.000Z' } }));
  const vrai = fs.readFileSync;
  let verrou = true;
  fs.readFileSync = (f, ...args) => {
    if (verrou && path.resolve(String(f)) === path.resolve(file)) throw Object.assign(new Error('EBUSY: simulé'), { code: 'EBUSY' });
    return vrai.call(fs, f, ...args);
  };
  t.after(() => {
    fs.readFileSync = vrai;
  });
  const clock = { t: T0 };
  const { advisor, warnings } = demarrer(file, clock);
  advisor.propose({ mode: 'combat', reason: 'prime gagnée' });
  advisor.dismiss();
  assert.equal(advisor.silenced('combat'), true, '« Non » est pris quand même');
  assert.deepEqual(JSON.parse(vrai.call(fs, file, 'utf8')).silences, { rescue: '2026-11-08T10:25:00.000Z' }, 'fichier intact');
  assert.ok(warnings.some((w) => /rien n'est écrit par-dessus/.test(w)), warnings.join(' | '));
  verrou = false;
  advisor.silence('materials');
  assert.deepEqual(JSON.parse(vrai.call(fs, file, 'utf8')).silences, {
    combat: '2026-11-08T10:30:00.000Z', materials: '2026-11-08T10:30:00.000Z', rescue: '2026-11-08T10:25:00.000Z',
  });
});

test('écriture impossible (disque plein…) : « Non » est pris quand même, avec un avertissement', (t) => {
  const d = dossier(t);
  const file = path.join(d, 'sous-dossier-fichier', 'mode-silences.json');
  fs.writeFileSync(path.join(d, 'sous-dossier-fichier'), 'un fichier, pas un dossier');
  const clock = { t: T0 };
  const { advisor, warnings } = demarrer(file, clock);
  advisor.propose({ mode: 'combat', reason: 'prime gagnée' });
  assert.doesNotThrow(() => advisor.dismiss());
  assert.equal(advisor.silenced('combat'), true);
  assert.equal(advisor.current(), null);
  assert.ok(warnings.some((w) => /Silences des propositions : non enregistrés/.test(w)), warnings.join(' | '));
});

test('sans store (tests, ancien appel) : en mémoire seulement, comme avant', () => {
  let t = 0;
  const a = new ModeAdvisor({ mode: () => null, now: () => t, timers: null });
  a.propose({ mode: 'combat', reason: 'prime gagnée' });
  a.dismiss();
  assert.equal(a.silenced('combat'), true);
  t = DISMISS_MS;
  assert.equal(a.silenced('combat'), false);
});
