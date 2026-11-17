// Images reçues : reconnues à leur contenu (texte, SVG ou JPEG annoncé PNG refusés), base64 exact, dimensions bornées.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_SIDE_PX, decodeBase64Image, decodeImageDataUrl, imageSize, imageType } from './imageCheck.js';

const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x02, 0x00, 0x03, 0x01, 0x01, 0x11, 0x00, 0xff, 0xd9]);
const png = (w, h) => {
  const b = Buffer.from(PNG_1PX, 'base64');
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
};

test('format reconnu aux premiers octets, dimensions lues dans l’en-tête', () => {
  assert.equal(imageType(Buffer.from(PNG_1PX, 'base64')), 'png');
  assert.equal(imageType(JPEG), 'jpeg');
  assert.equal(imageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script></script></svg>')), null);
  assert.equal(imageType(Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00', 'latin1')), 'gif');
  assert.equal(imageType(Buffer.from('court')), null);
  assert.deepEqual(imageSize(Buffer.from(PNG_1PX, 'base64'), 'png'), { width: 1, height: 1 });
  assert.deepEqual(imageSize(JPEG, 'jpeg'), { width: 3, height: 2 });
});

test('data URL : format annoncé = format réel, base64 exact, taille bornée', () => {
  const ok = decodeImageDataUrl(`data:image/png;base64,${PNG_1PX}`);
  assert.equal(ok.type, 'png');
  assert.equal(ok.ext, 'png');
  assert.equal(decodeImageDataUrl(`data:image/jpeg;base64,${JPEG.toString('base64')}`).ext, 'jpg');
  for (const [url, raison] of [
    [`data:image/jpeg;base64,${PNG_1PX}`, /en réalité une image PNG/],
    [`data:image/png;base64,${JPEG.toString('base64')}`, /en réalité une image JPEG/],
    [`data:image/svg+xml;base64,${PNG_1PX}`, /format « svg\+xml » refusé/],
    [`data:image/png;base64,${Buffer.from('pas une image').toString('base64')}`, /ce n’est pas une image/],
    ['data:image/png;base64,!!!!', /base64 illisible/],
    [`data:image/png;base64,${PNG_1PX} `, /base64 illisible/],
    ['data:image/png;base64,', /base64 illisible/],
    [`data:image/png;base64,${png(MAX_SIDE_PX + 1, 1).toString('base64')}`, /px de côté au plus/],
    ['data:text/html;base64,PGI+', /data:image/],
    [null, /aucune image/],
    [[`data:image/png;base64,${PNG_1PX}`], /aucune image/],
  ]) {
    const r = decodeImageDataUrl(url);
    assert.ok(r.error, String(url).slice(0, 40));
    assert.match(r.error, /^Image invalide : /);
    assert.match(r.error, raison, String(url).slice(0, 40));
  }
});

test('base64 seul : formats permis et surface maximale', () => {
  assert.equal(decodeBase64Image(PNG_1PX, ['png']).type, 'png');
  assert.match(decodeBase64Image(JPEG.toString('base64'), ['png']).error, /format JPEG refusé/);
  assert.match(decodeBase64Image(png(4000, 4000).toString('base64'), ['png'], { maxPixels: 12e6 }).error, /trop grande/);
  assert.equal(decodeBase64Image(png(3000, 3000).toString('base64'), ['png'], { maxPixels: 12e6 }).width, 3000);
});
