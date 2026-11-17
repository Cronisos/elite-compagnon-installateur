import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blocs, commandeInstallation, libelleMemoire, libelleModele } from './iaVue.js';

test('mémoire vidéo et modèles : libellés', () => {
  assert.equal(libelleMemoire({ libreMo: 20582, totalMo: 23028 }).replace(/ | /g, ' '), '20,1 Go libres sur 22,5');
  assert.match(libelleMemoire(null), /inconnue/);
  assert.equal(libelleModele({ nom: 'qwen3.5:9b', installe: true, charge: false, besoinMo: 7461 }), 'qwen3.5:9b (installé · 7,3 Go)');
  assert.equal(libelleModele({ nom: 'qwen3.8:27b', installe: true, charge: true, besoinMo: null }), 'qwen3.8:27b (chargé)');
  assert.equal(libelleModele({ nom: 'x:1b', installe: false }), 'x:1b (pas installé)');
  assert.equal(commandeInstallation('qwen3.5:9b'), 'ollama pull qwen3.5:9b');
});

test('réponse : paragraphes, listes et gras', () => {
  assert.deepEqual(blocs('Tu as **11 vaisseaux** :\n\n1. Anaconda\n- **Panther**'), [
    { liste: false, morceaux: [{ gras: false, texte: 'Tu as ' }, { gras: true, texte: '11 vaisseaux' }, { gras: false, texte: ' :' }] },
    { liste: true, morceaux: [{ gras: false, texte: 'Anaconda' }] },
    { liste: true, morceaux: [{ gras: true, texte: 'Panther' }] },
  ]);
  assert.deepEqual(blocs(''), []);
  assert.deepEqual(blocs('2 * 3 = 6'), [{ liste: false, morceaux: [{ gras: false, texte: '2 * 3 = 6' }] }]);
});
