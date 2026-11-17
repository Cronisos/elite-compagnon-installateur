// Tests des paramètres : dossier des journaux réseau ou de périphérique refusé, dossier local accepté.
// Base simulée en mémoire : aucune donnée du joueur n'est touchée.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isNetworkOrDevicePath, updateSettings, NETWORK_PATH_ERROR } from './settings.js';

function fakePrisma(initial = { id: 1, journalPath: 'C:\\Jeu\\Journaux', hoursPerEvening: 3 }) {
  let row = { ...initial };
  const updates = [];
  return {
    updates,
    get row() {
      return row;
    },
    settings: {
      findUnique: async () => row,
      create: async ({ data }) => (row = { ...data }),
      update: async ({ data }) => {
        updates.push(data);
        return (row = { ...row, ...data });
      },
    },
  };
}

const REFUSED = [
  '\\\\serveur\\partage\\Elite Dangerous',
  '//serveur/partage',
  '\\\\?\\C:\\Users\\Moi\\Saved Games',
  '\\\\.\\PhysicalDrive0',
  '\\\\?\\UNC\\serveur\\partage',
  '\\/serveur/partage',
  '/\\serveur\\partage',
  '  \\\\serveur\\partage',
  '\\??\\C:\\Jeu',
];

const ACCEPTED = [
  'C:\\Users\\Moi\\Saved Games\\Frontier Developments\\Elite Dangerous',
  'D:/Jeux/Elite Dangerous',
  '\\Jeux\\Elite',
  'C:\\Dossier\\\\double',
];

test('chemins réseau et de périphérique reconnus', () => {
  for (const p of REFUSED) assert.equal(isNetworkOrDevicePath(p), true, p);
  for (const p of ACCEPTED) assert.equal(isNetworkOrDevicePath(p), false, p);
});

test('updateSettings refuse un dossier réseau avec une erreur claire (400), sans rien enregistrer', async () => {
  for (const journalPath of REFUSED) {
    const prisma = fakePrisma();
    await assert.rejects(updateSettings(prisma, { journalPath, hoursPerEvening: 5 }), (err) => {
      assert.equal(err.status, 400);
      assert.equal(err.publicMessage, NETWORK_PATH_ERROR);
      assert.match(err.publicMessage, /chemins réseau/);
      return true;
    });
    assert.equal(prisma.updates.length, 0, journalPath);
    assert.equal(prisma.row.journalPath, 'C:\\Jeu\\Journaux');
  }
});

test('updateSettings accepte un dossier local (espaces retirés)', async () => {
  const prisma = fakePrisma();
  const s = await updateSettings(prisma, { journalPath: '  D:\\Jeux\\Elite Dangerous  ', hoursPerEvening: '4' });
  assert.equal(s.journalPath, 'D:\\Jeux\\Elite Dangerous');
  assert.equal(s.hoursPerEvening, 4);
});

test('updateSettings sans dossier : seules les heures changent', async () => {
  const prisma = fakePrisma();
  const s = await updateSettings(prisma, { hoursPerEvening: 2 });
  assert.equal(s.journalPath, 'C:\\Jeu\\Journaux');
  assert.equal(s.hoursPerEvening, 2);
});
