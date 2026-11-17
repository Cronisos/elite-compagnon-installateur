// Écriture atomique (copie CommonJS de server/src/core/atomic.js : l'overlay n'importe pas le code du serveur) :
// fichier temporaire unique à côté, écriture, fsync, puis renommage. Un overlay arrêté net (Alt+Maj+Q pendant un
// déplacement, plantage, coupure) laisse l'ancienne position entière, jamais un fichier coupé.

const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const RETRY_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);
const RETRIES = 5;
const RETRY_MS = 60;
let counter = 0;

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function writeFileAtomicSync(file, data, { fsImpl = fs } = {}) {
  fsImpl.mkdirSync(path.dirname(file), { recursive: true });
  counter = (counter + 1) % 1e9;
  const tmp = `${file}.${process.pid}.${counter}.${randomBytes(4).toString('hex')}.tmp`;
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
  try {
    const fd = fsImpl.openSync(tmp, 'wx');
    try {
      let done = 0;
      while (done < buf.length) done += fsImpl.writeSync(fd, buf, done, buf.length - done);
      fsImpl.fsyncSync(fd);
    } finally {
      fsImpl.closeSync(fd);
    }
    for (let attempt = 0; ; attempt++) {
      try {
        fsImpl.renameSync(tmp, file);
        return;
      } catch (err) {
        if (!RETRY_CODES.has(err.code) || attempt >= RETRIES) throw err;
        sleepSync(RETRY_MS);
      }
    }
  } catch (err) {
    try {
      fsImpl.rmSync(tmp, { force: true });
    } catch {
      // déjà parti
    }
    throw err;
  }
}

const writeJsonAtomicSync = (file, value, options) => writeFileAtomicSync(file, JSON.stringify(value), options);

module.exports = { writeFileAtomicSync, writeJsonAtomicSync };
