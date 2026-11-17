// Lecture du texte des captures (noms des minerais du panneau de cible d'un EEP).
// Moteur par défaut : Tesseract (tesseract.js, Apache-2.0), qui tourne dans un thread du serveur avec les données
// de langue française livrées avec l'app (server/assets/tessdata, empreinte SHA-256 vérifiée au chargement) :
// aucun téléchargement, aucun programme lancé. Les images sont redressées et agrandies avant lecture (ocrImage.js).
// L'ancien moteur, l'OCR de Windows appelé par PowerShell (ocr.ps1), n'est plus appelé que si la variable
// d'environnement ELITE_OCR vaut « windows » au démarrage du serveur (réglage interne, en attendant de le retirer).
// Chaque image donne ses lignes, avec leur position dans l'image.

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  decodePng, linesFromBlocks, MAX_PIXELS, mergeReadings, pngSize, renderForOcr, shearCandidates, strokePoints,
} from './ocrImage.js';

const SCRIPT = fileURLToPath(new URL('./ocr.ps1', import.meta.url));

/** Moteur choisi au démarrage : 'tesseract' (défaut) ou 'windows' (ELITE_OCR=windows : ancien OCR par PowerShell). */
export const OCR_ENGINE = String(process.env.ELITE_OCR || '').trim().toLowerCase() === 'windows' ? 'windows' : 'tesseract';

// Données de langue : fra.traineddata de tesseract-ocr/tessdata_fast (dépôt officiel, Apache-2.0),
// commit 87416418657359cb625c412a48b6e1d6d41c29bd. Version « fast » : la version « best » (modèle en virgule
// flottante) fait planter le cœur WebAssembly de tesseract.js 7 (fonction DotProductSSE absente).
export const TESSDATA_DIR = fileURLToPath(new URL('../../assets/tessdata/', import.meta.url));
const LANG = 'fra';
export const LANG_SHA256 = 'ced037562e8c80c13122dece28dd477d399af80911a28791a66a63ac1e3445ca';
const LANGUAGE = 'fr-FR';

const START_TIMEOUT_MS = 30000;
const READ_TIMEOUT_MS = 30000; // par version lue
const IDLE_MS = 5 * 60 * 1000; // thread de lecture arrêté après 5 min sans capture : sa mémoire est rendue
const RETRY_MS = 60 * 1000; // après un démarrage raté, pas de nouvel essai avant une minute

/** Nombre de caractères lus (hors espaces) : sert à garder la meilleure de plusieurs versions d'une image. */
export const readChars = (result) => (result?.lines || []).reduce((n, l) => n + l.text.replace(/\s/g, '').length, 0);

// ---------------------------------------------------------------------------------------------------------------
// Ancien moteur : OCR de Windows par PowerShell (seulement avec ELITE_OCR=windows)

async function readImagesWindows(buffers) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'elite-ocr-'));
  try {
    const files = await Promise.all(buffers.map(async (b, i) => {
      const file = path.join(dir, `${i}.png`);
      await fs.writeFile(file, b);
      return file;
    }));
    const out = await new Promise((resolve, reject) => {
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, ...files],
        { timeout: 30000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
        (err, stdout, stderr) => {
          if (/NO_OCR_LANGUAGE/.test(stderr)) return reject(new Error('Aucune langue d\'OCR installée dans Windows (Paramètres › Langue).'));
          if (err) return reject(new Error(`OCR impossible : ${(stderr || err.message).trim().split('\n')[0]}`));
          resolve(stdout);
        });
    });
    const list = JSON.parse(out.trim() || '[]');
    return (Array.isArray(list) ? list : [list]).map((r) => ({ language: r.language, lines: Array.isArray(r.lines) ? r.lines : [] }));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Moteur intégré : un seul worker Tesseract, réutilisé d'une capture à l'autre, une lecture à la fois

let current = null; // { promise, worker } du worker en service
let failure = null; // { at, error } : dernier démarrage raté
let idleTimer = null;
let queue = Promise.resolve();

function withTimeout(promise, ms, message) {
  let timer;
  const late = new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

/** Vérifie l'empreinte SHA-256 des données de langue avant de les confier à Tesseract (fichier altéré : refusé). */
export async function verifyLanguageData(file = path.join(TESSDATA_DIR, `${LANG}.traineddata`), expected = LANG_SHA256) {
  let data;
  try {
    data = await fs.readFile(file);
  } catch {
    throw new Error(`Données de langue de l'OCR introuvables (${path.basename(file)}).`);
  }
  if (createHash('sha256').update(data).digest('hex') !== expected) {
    throw new Error(`Données de langue de l'OCR altérées (${path.basename(file)}) : empreinte SHA-256 inattendue.`);
  }
}

async function startWorker() {
  await verifyLanguageData();
  const { default: Tesseract } = await import('tesseract.js');
  const creating = Tesseract.createWorker(LANG, Tesseract.OEM.LSTM_ONLY, {
    langPath: TESSDATA_DIR, // dossier local : lu sur le disque, jamais téléchargé (pas de CDN)
    gzip: false, // fichier tel que publié par tesseract-ocr, non compressé
    cacheMethod: 'none', // aucune copie écrite ailleurs
    // Les erreurs arrivent par la promesse de chaque tâche ; sans ce rappel, tesseract.js les relance en plus
    // hors de toute promesse, ce qui arrêterait le serveur
    errorHandler: () => {},
  });
  // Démarrage trop long : le worker qui finirait par démarrer est arrêté, au lieu de rester orphelin
  const worker = await withTimeout(creating, START_TIMEOUT_MS, 'Démarrage du lecteur de texte trop long.').catch((e) => {
    creating.then((w) => w.terminate(), () => {});
    throw e;
  });
  // Thread arrêté (fin d'inactivité, erreur) : un autre sera lancé à la prochaine capture
  worker.worker?.on?.('error', (e) => console.error('OCR :', e?.message || e));
  worker.worker?.on?.('exit', () => {
    if (current?.worker === worker) current = null;
  });
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT, // texte épars : lignes courtes éparpillées dans l'image
      user_defined_dpi: '300', // pas d'estimation de la résolution (ni de message à ce sujet)
      debug_file: '/dev/null', // messages internes de Tesseract (« Line cannot be recognized »…) tus
    });
  } catch (e) {
    await worker.terminate();
    throw e;
  }
  return worker;
}

function getWorker() {
  if (current) return current.promise;
  if (failure && Date.now() - failure.at < RETRY_MS) return Promise.reject(failure.error);
  const entry = { worker: null };
  entry.promise = startWorker().then(
    (worker) => {
      entry.worker = worker;
      failure = null;
      return worker;
    },
    (error) => {
      if (current === entry) current = null;
      failure = { at: Date.now(), error };
      throw error;
    },
  );
  current = entry;
  return entry.promise;
}

/** Arrête le thread de lecture (inactivité, erreur de lecture, fin des tests) ; il repartira à la prochaine lecture. */
export async function closeOcr() {
  clearTimeout(idleTimer);
  const entry = current;
  current = null;
  if (!entry) return;
  const worker = await entry.promise.catch(() => null);
  await worker?.terminate();
}

/** Une lecture à la fois sur le worker partagé. */
function exclusive(task) {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

/**
 * Versions à lire d'une image : une par pente candidate (rendue au moment de la lire, pour ne pas bloquer le
 * serveur d'un coup). PNG seulement (l'overlay n'envoie que ça) : un autre format échapperait à la limite de taille.
 */
function prepare(buffer) {
  const size = pngSize(buffer);
  if (size && size.width * size.height > MAX_PIXELS) throw new Error('OCR impossible : image trop grande.');
  const img = decodePng(buffer);
  if (!img) throw new Error('OCR impossible : image non prise en charge (PNG attendu).');
  return shearCandidates(img, strokePoints(img)).map((k) => () => renderForOcr(img, { k }));
}

async function readImagesTesseract(buffers) {
  const prepared = buffers.map((b) => prepare(Buffer.isBuffer(b) ? b : Buffer.from(b)));
  return exclusive(async () => {
    clearTimeout(idleTimer);
    let worker = null;
    try {
      worker = await getWorker();
      worker.worker?.ref?.(); // lecture en cours : le processus attend sa réponse
      const results = [];
      for (const versions of prepared) {
        const readings = [];
        for (const render of versions) {
          const { image, view } = render();
          const { data } = await withTimeout(worker.recognize(image, {}, { blocks: true, text: false }),
            READ_TIMEOUT_MS, 'lecture trop longue.');
          readings.push(linesFromBlocks(data.blocks, view));
        }
        results.push({ language: LANGUAGE, lines: mergeReadings(readings) });
      }
      return results;
    } catch (e) {
      await closeOcr().catch(() => {}); // worker peut-être abîmé (lecture interrompue) : on repartira d'un neuf
      throw new Error(`OCR impossible : ${String(e?.message || e).split('\n')[0]}`);
    } finally {
      // Au repos, le thread ne retient pas le processus (un script ou un test peut se terminer sans closeOcr)
      worker?.worker?.unref?.();
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => { closeOcr().catch(() => {}); }, IDLE_MS);
      idleTimer.unref?.();
    }
  });
}

// ---------------------------------------------------------------------------------------------------------------

/**
 * Lit le texte de plusieurs images (tampons PNG).
 * @param engine 'tesseract' ou 'windows' ; par défaut celui du réglage (OCR_ENGINE)
 * @returns [{ language, lines: [{ text, x, y, w, h }] }], dans l'ordre des images
 */
export async function readImages(buffers, { engine = OCR_ENGINE } = {}) {
  return engine === 'windows' ? readImagesWindows(buffers) : readImagesTesseract(buffers);
}

/**
 * Une seule version par image pour le moteur intégré : de celles qui ont les mêmes proportions (à 2 % près),
 * la plus petite. Il prépare lui-même l'image (gris, redressement, agrandissement) : la version agrandie et
 * contrastée qu'envoie l'overlay n'apporterait rien et coûterait une lecture de plus, bien plus longue.
 */
export function distinctVersions(buffers) {
  const kept = [];
  for (const buffer of buffers) {
    const size = pngSize(buffer);
    const ratio = size && size.width / size.height;
    const same = size ? kept.findIndex((o) => o.size && Math.abs(o.size.width / o.size.height - ratio) <= 0.02 * ratio) : -1;
    if (same < 0) kept.push({ buffer, size });
    else if (size.width * size.height < kept[same].size.width * kept[same].size.height) kept[same] = { buffer, size };
  }
  return kept.map((k) => k.buffer);
}

/** Lit plusieurs versions d'une même image (brute, contrastée…) et garde celle où l'OCR lit le plus. */
export async function readBest(buffers, { engine = OCR_ENGINE } = {}) {
  const results = await readImages(engine === 'windows' ? buffers : distinctVersions(buffers), { engine });
  return results.reduce((best, r) => (readChars(r) > readChars(best) ? r : best), results[0]);
}
