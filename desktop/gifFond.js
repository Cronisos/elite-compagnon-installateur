// GIF du rapport de la semaine fabriqué hors du fil principal de l'app (worker_threads) : pendant l'encodage (environ
// 1,5 s), les fenêtres de l'app (MAR, pages détachées, fenêtre principale) continuent de répondre. Les images passent
// au fil d'encodage sans copie quand c'est possible (transfert de leur mémoire). Si un fil ne peut pas être créé,
// l'encodage se fait comme avant, dans le fil principal.

const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const { encoderGif } = require('./gif.js');

/** Mémoires transférables sans toucher à d'autres données : une image qui occupe seule sa mémoire. */
function transferables(images) {
  const vus = new Set();
  for (const im of images) {
    const ab = im?.buffer;
    if (ab instanceof ArrayBuffer && im.byteOffset === 0 && im.byteLength === ab.byteLength && !vus.has(ab)) vus.add(ab);
  }
  return [...vus];
}

if (!isMainThread && workerData?.gifFond) {
  try {
    const gif = encoderGif(workerData.options);
    // Un petit GIF peut partager la réserve de mémoire de Node : copié plutôt que transféré
    parentPort.postMessage({ gif }, transferables([gif]).length ? [gif.buffer] : []);
  } catch (err) {
    parentPort.postMessage({ erreur: err.message });
  }
}

/** Comme encoderGif (gif.js), dans un fil à part : rend une promesse du Buffer du GIF. */
function encoderGifEnFond(options, { WorkerImpl = Worker } = {}) {
  return new Promise((resolve, reject) => {
    let w;
    try {
      w = new WorkerImpl(__filename, { workerData: { gifFond: true, options }, transferList: transferables(options?.images || []) });
    } catch {
      try {
        resolve(encoderGif(options));
      } catch (err) {
        reject(err);
      }
      return;
    }
    let fini = false;
    w.once('message', (m) => {
      fini = true;
      if (m?.erreur) reject(new Error(m.erreur));
      else resolve(Buffer.from(m.gif.buffer, m.gif.byteOffset, m.gif.byteLength));
      w.terminate();
    });
    w.once('error', (err) => {
      fini = true;
      reject(err);
    });
    w.once('exit', (code) => {
      if (!fini) reject(new Error(`Encodage du GIF interrompu (code ${code}).`));
    });
  });
}

module.exports = { encoderGifEnFond, transferables };
