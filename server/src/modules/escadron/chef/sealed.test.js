// Sealed box de GitHub : vecteur calculé par tweetnacl (bibliothèque de référence) avec un nonce BLAKE2b calculé par
// Python (hashlib), et BLAKE2b-512 comparé à celui de Node.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { blake2b, clePublique, sceller } from './sealed.js';

test('sealed box : identique à tweetnacl (clés fixes)', () => {
  const destPk = 'E75P6uryBMf9M1j8nAByGIHRdCeBKCJ+xnTzf3/pe20='; // clé publique de la clé secrète 07…07
  assert.equal(clePublique(Buffer.alloc(32, 7)).toString('base64'), destPk);
  assert.equal(
    sceller('jeton du suivi', destPk, Buffer.alloc(32, 9)),
    'V9tLNZ8jrl4Ubk4lEgVnBHIlBjSMFQwUdT0Mkz0E1CHdQgTEal+aTfcUJkXt40P9SfSHVJu/WuU42bY2BIA=',
  );
});

test('BLAKE2b : 24 octets comme Python, 64 comme Node, sur plusieurs longueurs', () => {
  const entree = Buffer.from('57db4b359f23ae5e146e4e2512056704722506348c150c14753d0c933d04d42113be4feaeaf204c7fd3358fc9c00721881d174278128227ec674f37f7fe97b6d', 'hex');
  // hashlib.blake2b(entree, digest_size=24)
  assert.equal(blake2b(entree, 24).toString('hex'), 'fa221b37ff5e33a2c302a1ec297dfdfc4ab11bb0bffc9e2b');
  for (const n of [0, 1, 127, 128, 129, 300]) {
    const d = crypto.randomBytes(n);
    assert.equal(blake2b(d).toString('hex'), crypto.createHash('blake2b512').update(d).digest('hex'), `${n} octets`);
  }
});

test('sealed box : une clé éphémère neuve à chaque fois, clé publique illisible refusée', () => {
  const pk = 'E75P6uryBMf9M1j8nAByGIHRdCeBKCJ+xnTzf3/pe20=';
  assert.notEqual(sceller('x', pk), sceller('x', pk));
  assert.equal(Buffer.from(sceller('abc', pk), 'base64').length, 32 + 16 + 3);
  assert.throws(() => sceller('x', 'court'));
});
