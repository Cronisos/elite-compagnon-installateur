// Voix naturelle d'Alicia : Supertonic 3 (modèle de synthèse vocale, licence OpenRAIL-M) lancé par sherpa-onnx
// (sherpa-onnx-offline-tts.exe, Apache-2.0), sur le processeur : aucune mémoire vidéo prise au jeu ni à l'IA. Installé
// à part dans %LOCALAPPDATA%\Programs\sherpa-onnx (programme, et modèle dans modeles\). Rien ne sort du PC.
// Dix voix (0 à 4 : femmes, 5 à 9 : hommes) ; ~2 s de calcul pour 10 s de parole, 8 étapes (essais du 12 nov. 2026).
// Sans le programme ou le modèle, la voix de Windows prend le relais.

import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { programmesDir } from '../../core/paths.js';

export const VOIX_NATURELLES = 10;
export const PAS = 8; // étapes de calcul : 16 doublent le temps sans gain net à l'écoute
export const MAX_TEXTE = 700;

/** Numéro de voix naturelle d'un nom de voix (« naturelle:4 » → 4), sinon null (voix de Windows). */
export function voixNaturelle(nom) {
  const m = /^naturelle:(\d)$/.exec(String(nom || ''));
  return m && Number(m[1]) < VOIX_NATURELLES ? Number(m[1]) : null;
}

/** Dernier dossier (par ordre alphabétique) de `dossier` dont le nom suit `motif`. */
function dernier(dossier, motif, lister) {
  try {
    return lister(dossier).filter((n) => motif.test(n)).sort().at(-1) || null;
  } catch {
    return null;
  }
}

/** Programme et modèle : installation par défaut dans %LOCALAPPDATA%\Programs\sherpa-onnx (version la plus récente). */
export function cheminsParole(env = process.env, lister = fs.readdirSync) {
  const base = path.join(programmesDir(env), 'sherpa-onnx');
  const prog = dernier(base, /^sherpa-onnx-v[\d.]+-win-x64/, lister);
  const modele = dernier(path.join(base, 'modeles'), /^sherpa-onnx-supertonic-/, lister);
  return {
    exe: prog ? path.join(base, prog, 'bin', 'sherpa-onnx-offline-tts.exe') : null,
    modele: modele ? path.join(base, 'modeles', modele) : null,
  };
}

const FICHIERS = ['duration_predictor.int8.onnx', 'text_encoder.int8.onnx', 'vector_estimator.int8.onnx', 'vocoder.int8.onnx', 'tts.json', 'unicode_indexer.bin', 'voice.bin'];

/** Programme et modèle présents ? */
export function parolePrete(chemins, existe = fs.existsSync) {
  return Boolean(chemins?.exe && chemins.modele && existe(chemins.exe) && FICHIERS.every((f) => existe(path.join(chemins.modele, f))));
}

// --- Nombres en toutes lettres (le modèle lit mal les chiffres) ---

const UNITES = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize',
  'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
const DIZAINES = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];

function moinsDeCent(n, final) {
  if (n < 20) return UNITES[n];
  const d = Math.floor(n / 10);
  const u = n % 10;
  if (d === 7) return `soixante${u === 1 ? ' et ' : '-'}${UNITES[10 + u]}`;
  if (d === 9) return `quatre-vingt-${UNITES[10 + u]}`;
  if (d === 8) return u ? `quatre-vingt-${UNITES[u]}` : `quatre-vingt${final ? 's' : ''}`;
  if (!u) return DIZAINES[d];
  return u === 1 ? `${DIZAINES[d]} et un` : `${DIZAINES[d]}-${UNITES[u]}`;
}

// `final` : rien ne suit (« deux cents », « quatre-vingts ») ; devant « mille », pas de s
function moinsDeMille(n, final) {
  const c = Math.floor(n / 100);
  const r = n % 100;
  const cents = !c ? '' : c === 1 ? 'cent' : `${UNITES[c]} cent${!r && final ? 's' : ''}`;
  return [cents, r ? moinsDeCent(r, final) : ''].filter(Boolean).join(' ');
}

/** Entier positif en lettres (« deux cent mille », « quatre-vingt-onze »), jusqu'à 999 milliards. */
export function nombreEnLettres(n) {
  if (!Number.isSafeInteger(n) || n < 0 || n >= 1e12) return String(n);
  if (n === 0) return 'zéro';
  const parts = [];
  let r = n;
  for (const [v, nom] of [[1e9, 'milliard'], [1e6, 'million']]) {
    const q = Math.floor(r / v);
    if (q) parts.push(`${moinsDeMille(q, true)} ${nom}${q > 1 ? 's' : ''}`);
    r %= v;
  }
  const k = Math.floor(r / 1000);
  if (k) parts.push(k === 1 ? 'mille' : `${moinsDeMille(k, false)} mille`);
  if (r % 1000) parts.push(moinsDeMille(r % 1000, true));
  return parts.join(' ');
}

const UNITES_MESURE = {
  '%': ['pour cent', 'pour cent'],
  t: ['tonne', 'tonnes'],
  Cr: ['crédit', 'crédits'],
  cr: ['crédit', 'crédits'],
  CR: ['crédit', 'crédits'],
  al: ['année-lumière', 'années-lumière'],
  AL: ['année-lumière', 'années-lumière'],
  Ly: ['année-lumière', 'années-lumière'],
  ly: ['année-lumière', 'années-lumière'],
  ls: ['seconde-lumière', 'secondes-lumière'],
  'km/s': ['kilomètre par seconde', 'kilomètres par seconde'],
  'm/s': ['mètre par seconde', 'mètres par seconde'],
  km: ['kilomètre', 'kilomètres'],
  Mm: ['mégamètre', 'mégamètres'],
  K: ['kelvin', 'kelvins'],
  g: ['g', 'g'],
};

/** Nombre écrit (« 1 234 », « 12,5 », « 0.05 ») → { valeur, lettres }. */
function lireNombre(entier, decimales) {
  const n = Number(entier.replace(/[\s  ]/g, ''));
  let lettres = nombreEnLettres(n);
  if (decimales) {
    const d = decimales.replace(/0+$/, '');
    if (d) lettres += ` virgule ${/^0/.test(d) || d.length > 3 ? [...d].map((c) => UNITES[c]).join(' ') : nombreEnLettres(Number(d))}`;
  }
  return { valeur: Number(`${n}.${decimales || 0}`), lettres };
}

const NOMBRE = String.raw`(\d{1,3}(?:[   ]\d{3})+|\d+)(?:[.,](\d+))?`;

/** Texte avec les nombres, les pourcentages et les unités du jeu en toutes lettres. */
export function chiffresEnLettres(texte) {
  return String(texte)
    // 1,2 M Cr, 200k Cr, 3 Md Cr
    .replace(new RegExp(`(?<![\\d.,])${NOMBRE}\\s?(k|M|Md)(?:\\s?(Cr|cr|CR))?\\b`, 'g'), (tout, e, d, mult, cr) => {
      const { valeur, lettres } = lireNombre(e, d);
      // 200k : deux cent mille (sans s devant mille)
      if (mult === 'k' && Number.isSafeInteger(valeur * 1000)) return `${nombreEnLettres(valeur * 1000)}${cr ? ' crédits' : ''}`;
      const nom = mult === 'k' ? 'mille' : `${mult === 'M' ? 'million' : 'milliard'}${valeur >= 2 ? 's' : ''}${cr ? ' de' : ''}`;
      return `${lettres} ${nom}${cr ? ' crédits' : ''}`;
    })
    .replace(new RegExp(`(?<![\\d.,])${NOMBRE}(?:\\s?(%|km/s|m/s|km|Mm|Cr|cr|CR|al|AL|Ly|ly|ls|t|K|g)(?![\\p{L}\\d]))?`, 'gu'), (tout, e, d, unite) => {
      const { valeur, lettres } = lireNombre(e, d);
      if (!unite) return lettres;
      const [un, plusieurs] = UNITES_MESURE[unite];
      const feminin = /^(tonne|année|seconde)/.test(un) && !d; // une tonne, vingt et une années-lumière
      return `${feminin ? lettres.replace(/\bun$/, 'une') : lettres} ${valeur >= 2 ? plusieurs : un}`;
    });
}

/** Texte à prononcer : sans mise en forme, émojis ni signes que la voix lirait mal ; nombres en lettres. */
export function aPrononcer(texte) {
  const t = String(texte || '')
    .replace(/\s*\(la suite dans la fenêtre principale\)\s*$/, '')
    .replace(/\*\*|__|`|#+\s/g, '')
    .replace(/\bCMDR\b/gi, 'commandant')
    .replace(/(\d)\s?[x×]\s?(\d)/g, '$1 fois $2')
    .replace(/[→⇒]/g, ', ')
    .replace(/\s+[-–—]\s+/g, ', ');
  return chiffresEnLettres(t)
    .replace(/[^\p{L}\p{N}\p{P}\p{Zs}\n]/gu, ' ') // émojis, symboles
    .replace(/[^\u0000-ɏ‘-‟…\n]/g, ' ') // alphabets que le modèle ne lit pas en français
    .replace(/\s+/g, ' ')
    .replace(/\s+,/g, ',')
    .trim()
    .slice(0, MAX_TEXTE);
}

/**
 * Argument pour le programme : il lit sa ligne de commande dans la page de code de Windows (1252 en France), pas en
 * UTF-8. On lui passe donc les octets UTF-8 du texte écrits en 1252 : il retrouve exactement l'UTF-8 attendu.
 */
export const argumentTexte = (texte) => new TextDecoder('windows-1252').decode(Buffer.from(texte, 'utf8'));

/**
 * Dit un texte : fichier WAV temporaire, programme, octets du WAV (44,1 kHz). Rejette si le programme échoue,
 * dépasse 60 s, ou n'a pas reçu un texte UTF-8 valide (page de code de Windows autre que 1252).
 * @returns {Promise<Buffer>}
 */
export async function synthetiser(texte, { exe, modele, sid = 4, vitesse = 1, pas = PAS, fils = 4, executer = execFile } = {}) {
  const dit = aPrononcer(texte);
  if (!dit) throw new Error('Rien à dire.');
  const fichier = path.join(os.tmpdir(), `elite-voix-${crypto.randomUUID()}.wav`);
  const f = (nom) => `${path.join(modele, nom)}`;
  const args = [
    `--supertonic-duration-predictor=${f('duration_predictor.int8.onnx')}`,
    `--supertonic-text-encoder=${f('text_encoder.int8.onnx')}`,
    `--supertonic-vector-estimator=${f('vector_estimator.int8.onnx')}`,
    `--supertonic-vocoder=${f('vocoder.int8.onnx')}`,
    `--supertonic-tts-json=${f('tts.json')}`,
    `--supertonic-unicode-indexer=${f('unicode_indexer.bin')}`,
    `--supertonic-voice-style=${f('voice.bin')}`,
    '--lang=fr', `--sid=${sid}`, `--num-steps=${pas}`, `--speed=${vitesse}`, `--num-threads=${fils}`,
    `--output-filename=${fichier}`, argumentTexte(dit),
  ];
  try {
    await new Promise((resolve, reject) => {
      executer(exe, args, { timeout: 60_000, windowsHide: true, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) reject(new Error(`La voix naturelle n'a pas pu parler (${err.code ?? err.message})`));
        else if (/Non UTF8/i.test(String(stderr))) reject(new Error('La voix naturelle a reçu un texte mal encodé (page de code de Windows).'));
        else resolve();
      });
    });
    const wav = fs.readFileSync(fichier);
    if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF') throw new Error('La voix naturelle n’a rien produit.');
    return wav;
  } finally {
    fs.rmSync(fichier, { force: true });
  }
}

/** Derniers sons produits, servis par l'API le temps que la fenêtre en jeu les joue (5 au plus, 5 min). */
export class SonsRecents {
  constructor({ max = 5, dureeMs = 5 * 60_000, maintenant = Date.now } = {}) {
    Object.assign(this, { max, dureeMs, maintenant, sons: new Map(), seq: 0 });
  }

  garder(wav) {
    const id = `s${++this.seq}`;
    this.sons.set(id, { wav, at: this.maintenant() });
    for (const [k, v] of this.sons) if (this.sons.size > this.max || this.maintenant() - v.at > this.dureeMs) this.sons.delete(k);
    return id;
  }

  lire(id) {
    const s = this.sons.get(id);
    return s && this.maintenant() - s.at <= this.dureeMs ? s.wav : null;
  }
}
