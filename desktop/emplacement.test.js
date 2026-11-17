// Emplacement du dossier de l'app : Program Files et OneDrive signalés, le reste sans souci (emplacement.js).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { avertissementEmplacement, emplacementRisque } = require('./emplacement.js');

const env = {
  ProgramFiles: 'C:\\Program Files',
  'ProgramFiles(x86)': 'C:\\Program Files (x86)',
  OneDrive: 'C:\\Users\\Testeur\\OneDrive',
  OneDriveCommercial: 'D:\\OneDrive - Société Test',
  LOCALAPPDATA: 'C:\\Users\\Testeur\\AppData\\Local',
};

test('emplacement : Program Files et OneDrive reconnus, quelle que soit la casse', () => {
  assert.equal(emplacementRisque('C:\\Program Files\\Elite Compagnon', env), 'programmes');
  assert.equal(emplacementRisque('c:\\program files (x86)\\EliteApp', env), 'programmes');
  assert.equal(emplacementRisque('C:\\Users\\Testeur\\OneDrive\\Documents\\EliteApp', env), 'onedrive');
  assert.equal(emplacementRisque('D:\\OneDrive - Société Test\\Jeux\\EliteApp', env), 'onedrive');
  for (const ok of ['C:\\Jeux\\Elite Compagnon', 'C:\\Users\\Testeur\\Documents\\EliteApp', 'C:\\Users\\Testeur\\OneDriveAutre\\EliteApp', 'C:\\Program Files Jeux\\EliteApp']) {
    assert.equal(emplacementRisque(ok, env), null, ok);
  }
  assert.equal(emplacementRisque('C:\\Program Files\\EliteApp', {}), null, 'variables absentes : rien à dire');
});

test('avertissement : en français, avec un autre emplacement proposé', () => {
  const a = avertissementEmplacement('C:\\Users\\Testeur\\OneDrive\\Documents\\EliteApp', env);
  assert.match(a.long, /OneDrive/);
  assert.match(a.long, /C:\\Jeux\\Elite Compagnon ou C:\\Users\\Testeur\\AppData\\Local\\Programs\\Elite Compagnon/);
  assert.ok(a.court.length <= 200, 'la bulle de Windows coupe les textes longs');
  const p = avertissementEmplacement('C:\\Program Files\\Elite Compagnon', env);
  assert.match(p.long, /administrateur/);
  assert.ok(p.court.length <= 200);
  assert.equal(avertissementEmplacement('C:\\Jeux\\Elite Compagnon', env), null);
});
