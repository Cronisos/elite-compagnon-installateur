// Écoute : ce que le joueur dit au micro, transcrit par Whisper (whisper.cpp, sur le processeur : aucune mémoire
// vidéo prise au jeu ni à l'IA). Installé à part dans %LOCALAPPDATA%\Programs\whisper-cpp (programme et modèle),
// chemins réglables. Rien ne sort du PC.

import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeFileAtomicSync } from '../../core/atomic.js';
import { programmesDir } from '../../core/paths.js';

export const MAX_SECONDES = 60;
export const MAX_AUDIO_OCTETS = 44 + 16000 * 2 * MAX_SECONDES; // WAV 16 kHz, 16 bits, mono
// Deux modèles (12 nov. 2026, i9-14900KF, 5 s de parole) : « rapide » (small, 190 Mo) 1,5 s ; « précis » (large-v3-turbo,
// 570 Mo) 5 s avec 24 fils. Mêmes mots compris sur une question posée en français.
export const MODELES = { rapide: 'ggml-small-q5_1.bin', precis: 'ggml-large-v3-turbo-q5_0.bin' };

/** Programme et modèle de Whisper : ceux des réglages, sinon l'installation par défaut (modèle rapide ou précis). */
export function cheminsWhisper(reglages = {}, env = process.env) {
  const base = path.join(programmesDir(env), 'whisper-cpp');
  return {
    exe: reglages.whisperExe || path.join(base, 'bin', 'Release', 'whisper-cli.exe'),
    modele: reglages.whisperModele || path.join(base, 'modeles', MODELES[reglages.modeleEcoute] || MODELES.rapide),
  };
}

/** Whisper est-il installé (programme et modèle présents) ? */
export function ecoutePrete(chemins, existe = fs.existsSync) {
  return Boolean(chemins.exe && chemins.modele && existe(chemins.exe) && existe(chemins.modele));
}

/** Un WAV PCM 16 bits mono à 16 kHz (ce que la fenêtre en jeu enregistre), de taille raisonnable ? */
export function estWavAttendu(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 46 || buf.length > MAX_AUDIO_OCTETS) return false;
  return buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE'
    && buf.readUInt16LE(20) === 1 && buf.readUInt16LE(22) === 1 && buf.readUInt32LE(24) === 16000 && buf.readUInt16LE(34) === 16;
}

/** Texte transcrit : lignes recollées, sans les marques de silence ou de bruit de Whisper ([BLANK_AUDIO], (musique)…). */
export function nettoyerTranscription(sortie) {
  return String(sortie || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/^\[[^\]]*-->[^\]]*\]\s*/, '').trim())
    .join(' ')
    .replace(/\[[^\]]*\]|\((?:musique|music|bruit|rires?|applaudissements|silence)[^)]*\)|\*[^*]*\*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Transcrit un enregistrement WAV : fichier temporaire, whisper-cli, texte. Rejette si Whisper échoue ou dépasse 60 s.
 * @returns {Promise<string>} le texte (vide si rien d'audible)
 */
export async function transcrire(wav, { exe, modele, langue = 'fr', fils = Math.max(2, Math.min(16, os.cpus().length - 4)), executer = execFile } = {}) {
  const fichier = path.join(os.tmpdir(), `elite-ecoute-${crypto.randomUUID()}.wav`);
  writeFileAtomicSync(fichier, wav);
  try {
    const sortie = await new Promise((resolve, reject) => {
      executer(exe, ['-m', modele, '-f', fichier, '-l', langue, '-t', String(fils), '-nt', '-np'], { timeout: 60_000, windowsHide: true, maxBuffer: 1024 * 1024 }, (err, stdout) => {
        if (err) reject(new Error(`Whisper n'a pas pu transcrire (${err.code ?? err.message})`));
        else resolve(stdout);
      });
    });
    return nettoyerTranscription(sortie);
  } finally {
    fs.rmSync(fichier, { force: true });
  }
}
