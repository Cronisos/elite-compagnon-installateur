// GIF fabriqué hors du fil principal (gifFond.js) : même fichier qu'encoderGif, erreurs rendues, repli sans fil.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { encoderGif } = require('./gif.js');
const { encoderGifEnFond, transferables } = require('./gifFond.js');

const images = (n, l, h) => Array.from({ length: n }, (_, k) => {
  const px = Buffer.alloc(l * h * 4);
  for (let i = 0; i < l * h; i++) px.set([(i * 7 + k * 40) % 256, (i * 3) % 256, (k * 90) % 256, 255], i * 4);
  return px;
});

test('GIF en fond : le même fichier que dans le fil principal', async () => {
  const opts = () => ({ largeur: 64, hauteur: 32, images: images(3, 64, 32), delai: 5, ordre: 'bgra' });
  const attendu = encoderGif(opts());
  const o = opts();
  const gif = await encoderGifEnFond(o);
  assert.ok(Buffer.isBuffer(gif));
  assert.ok(gif.equals(attendu));
  assert.equal(o.images[0].byteLength, 0, 'images transférées au fil d’encodage, pas copiées');
});

test('GIF en fond : erreur rendue en français ; sans fil possible, encodé comme avant', async () => {
  await assert.rejects(encoderGifEnFond({ largeur: 2, hauteur: 2, images: [] }), /Aucune image/);
  class SansFil {
    constructor() {
      throw new Error('worker indisponible');
    }
  }
  const o = { largeur: 8, hauteur: 8, images: images(2, 8, 8) };
  const gif = await encoderGifEnFond(o, { WorkerImpl: SansFil });
  assert.ok(gif.equals(encoderGif({ largeur: 8, hauteur: 8, images: images(2, 8, 8) })));
});

test('transferts : jamais une mémoire partagée avec d’autres données', () => {
  const seule = Buffer.alloc(10_000);
  const morceau = Buffer.from(new ArrayBuffer(100)).subarray(10, 20);
  assert.deepEqual(transferables([seule, morceau, seule]), [seule.buffer]);
});
