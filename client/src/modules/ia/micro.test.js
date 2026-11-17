import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enWav, recoller } from './micro.js';

test('micro : WAV 16 kHz mono 16 bits, ce qu’attend Whisper', () => {
  const wav = enWav(new Float32Array([0, 1, -1, 0.5]));
  const v = new DataView(wav.buffer);
  const txt = (o, n) => String.fromCharCode(...wav.slice(o, o + n));
  assert.equal(wav.length, 44 + 8);
  assert.equal(txt(0, 4), 'RIFF');
  assert.equal(txt(8, 4), 'WAVE');
  assert.deepEqual([v.getUint16(20, true), v.getUint16(22, true), v.getUint32(24, true), v.getUint16(34, true)], [1, 1, 16000, 16]);
  assert.deepEqual([v.getInt16(44, true), v.getInt16(46, true), v.getInt16(48, true)], [0, 32767, -32768]);
  assert.deepEqual([...recoller([new Float32Array([1, 2]), new Float32Array([3])])], [1, 2, 3]);
});
