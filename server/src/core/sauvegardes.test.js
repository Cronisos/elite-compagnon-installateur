// Sauvegardes : ce qui est copié, ce qui ne l'est pas, le nom daté, la liste, et une copie coupée en route.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FICHE, NOM_DOSSIER, NOM_SAUVEGARDE, creerSauvegarde, dossierSauvegardes, fichiersASauvegarder, listerSauvegardes, nomSauvegarde } from './sauvegardes.js';

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'elite-sauvegardes-'));
const ecrire = (dossier, rel, contenu = 'x') => {
  const f = path.join(dossier, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, contenu);
};
function donnees() {
  const d = temp();
  ecrire(d, 'elite.db', 'base');
  ecrire(d, 'elite.db-wal', 'tmp');
  ecrire(d, 'elite.db.avant-schema-20261115', 'vieille base');
  ecrire(d, 'escadron.json', '{}');
  ecrire(d, 'compagnon/avatars/a.png', 'image');
  ecrire(d, 'reference/gros.json', 'référence');
  ecrire(d, 'fsd-status.log', 'journal');
  ecrire(d, 'eeps.json.tmp-123', 'tmp');
  return d;
}

test('le dossier des sauvegardes est dans Documents, jamais dans celui de l’app', () => {
  assert.equal(dossierSauvegardes({ USERPROFILE: 'C:\\Users\\Testeur' }), path.join('C:\\Users\\Testeur', 'Documents', NOM_DOSSIER));
  assert.ok(!dossierSauvegardes({ USERPROFILE: 'C:\\Users\\Testeur', APPDATA: 'C:\\Users\\Testeur\\AppData\\Roaming' }).includes('AppData'));
});

test('ELITE_SAUVEGARDES_DIR remplace Documents (banc de contrôle) ; vide, ignoré ; relatif ou réseau, refusé', () => {
  assert.equal(dossierSauvegardes({ USERPROFILE: 'C:\\Users\\Testeur', ELITE_SAUVEGARDES_DIR: 'C:\\Banc\\sauvegardes' }), path.resolve('C:\\Banc\\sauvegardes'));
  assert.equal(dossierSauvegardes({ USERPROFILE: 'C:\\Users\\Testeur', ELITE_SAUVEGARDES_DIR: '  ' }), path.join('C:\\Users\\Testeur', 'Documents', NOM_DOSSIER));
  for (const bad of ['sauvegardes', '\\\\serveur\\partage']) assert.throws(() => dossierSauvegardes({ ELITE_SAUVEGARDES_DIR: bad }), /ELITE_SAUVEGARDES_DIR refusé/, bad);
});

test('nom daté à l’heure du PC, lisible et triable', () => {
  const nom = nomSauvegarde(new Date(2026, 10, 7, 9, 5, 3));
  assert.equal(nom, '2026-11-07 09h05m03');
  assert.match(nom, NOM_SAUVEGARDE);
});

test('ce qui est sauvegardé : tout ce qui est au joueur, pas ce qui se refait', () => {
  assert.deepEqual(fichiersASauvegarder(donnees()), ['compagnon/avatars/a.png', 'elite.db', 'escadron.json']);
});

test('une sauvegarde : copie complète, fiche, base copiée par la fonction donnée ; puis la liste', async () => {
  const source = donnees();
  const dossier = path.join(temp(), 'sauvegardes');
  const appels = [];
  const copierBase = async (vers) => { appels.push(vers); fs.writeFileSync(vers, 'base cohérente'); };
  const s = await creerSauvegarde({ source, dossier, now: new Date(2026, 10, 17, 14, 32, 5), copierBase });
  assert.equal(s.nom, '2026-11-17 14h32m05');
  assert.equal(s.fichiers, 3);
  assert.equal(s.base, 'copie cohérente');
  assert.equal(appels.length, 1);
  assert.equal(fs.readFileSync(path.join(s.chemin, 'elite.db'), 'utf8'), 'base cohérente');
  assert.equal(fs.readFileSync(path.join(s.chemin, 'compagnon', 'avatars', 'a.png'), 'utf8'), 'image');
  assert.ok(!fs.existsSync(path.join(s.chemin, 'reference')));
  assert.equal(JSON.parse(fs.readFileSync(path.join(s.chemin, FICHE), 'utf8')).app, 'Elite Compagnon');
  assert.equal(fs.readFileSync(path.join(source, 'elite.db'), 'utf8'), 'base', 'la source n’est jamais touchée');
  const autre = await creerSauvegarde({ source, dossier, now: new Date(2026, 10, 18, 8, 0, 0) });
  assert.equal(autre.base, 'copie simple');
  assert.deepEqual(listerSauvegardes(dossier).map((x) => x.nom), ['2026-11-18 08h00m00', '2026-11-17 14h32m05']);
  await assert.rejects(creerSauvegarde({ source, dossier, now: new Date(2026, 10, 18, 8, 0, 0) }), (e) => e.status === 409);
});

test('copie cohérente en échec : la base est copiée telle quelle, la sauvegarde aboutit', async () => {
  const source = donnees();
  const s = await creerSauvegarde({ source, dossier: temp(), copierBase: async () => { throw new Error('VACUUM refusé'); } });
  assert.equal(s.base, 'copie simple');
  assert.equal(fs.readFileSync(path.join(s.chemin, 'elite.db'), 'utf8'), 'base');
});

test('liste : seulement les vraies sauvegardes (nom daté et fiche de l’app)', () => {
  const dossier = temp();
  ecrire(dossier, '2026-11-17 14h32m05/sauvegarde.json', JSON.stringify({ app: 'Elite Compagnon', le: '2026-11-17T13:32:05.000Z', fichiers: 3, octets: 10 }));
  ecrire(dossier, '2026-11-16 10h00m00/elite.db', 'sans fiche');
  ecrire(dossier, '2026-11-15 10h00m00/sauvegarde.json', JSON.stringify({ app: 'Autre' }));
  ecrire(dossier, 'photos de vacances/sauvegarde.json', JSON.stringify({ app: 'Elite Compagnon' }));
  ecrire(dossier, '2026-11-17 15h00m00.tmp-123/sauvegarde.json', JSON.stringify({ app: 'Elite Compagnon' }));
  assert.deepEqual(listerSauvegardes(dossier), [{ nom: '2026-11-17 14h32m05', le: '2026-11-17T13:32:05.000Z', fichiers: 3, octets: 10 }]);
  assert.deepEqual(listerSauvegardes(path.join(dossier, 'absent')), []);
});
