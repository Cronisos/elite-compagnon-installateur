// Mesures du PC pour le moniteur : carte graphique (nvidia-smi), processeur et mémoire (Node), mémoire du jeu
// (tasklist), modèle d'IA chargé (Ollama, s'il tourne). Lecture seule ; chaque source absente donne null.

import { execFile } from 'node:child_process';
import os from 'node:os';
import { localFetch } from '../../core/net.js';

const run = (cmd, args, executer = execFile) => new Promise((resolve) => {
  try {
    executer(cmd, args, { timeout: 3000, windowsHide: true }, (err, stdout) => resolve(err ? null : String(stdout)));
  } catch {
    resolve(null);
  }
});
const nombre = (v) => {
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
};

export const GPU_REQUETE = '--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw';

/** Première carte de nvidia-smi : { nom, chargePct, vramUtiliseeMo, vramTotaleMo, tempC, watts } ou null. */
export function lireGpu(sortie) {
  const ligne = String(sortie || '').split(/\r?\n/).map((l) => l.trim()).find(Boolean);
  const champs = ligne?.split(',').map((x) => x.trim());
  if (!champs || champs.length < 6) return null;
  const [nom, charge, utilisee, totale, temp, watts] = champs;
  const g = { nom, chargePct: nombre(charge), vramUtiliseeMo: nombre(utilisee), vramTotaleMo: nombre(totale), tempC: nombre(temp), watts: nombre(watts) };
  return g.vramTotaleMo > 0 && g.vramUtiliseeMo != null ? g : null;
}

/** Mémoire (Mo) d'Elite dans la sortie CSV de tasklist (« 2 280 988 Ko », espaces insécables compris), ou null. */
export function lireTasklist(sortie) {
  const ligne = String(sortie || '').split(/\r?\n/).find((l) => /elitedangerous64\.exe/i.test(l));
  if (!ligne) return null;
  const champs = ligne.split('","').map((x) => x.replace(/^"|"$/g, ''));
  const ko = Number(String(champs[4] || '').replace(/\D/g, ''));
  return ko > 0 ? Math.round(ko / 1024) : null;
}

/** Charge du processeur (%) entre deux relevés de os.cpus(). */
export function chargeCpu(avant, apres) {
  let total = 0;
  let repos = 0;
  apres.forEach((c, i) => {
    const a = avant[i]?.times;
    if (!a) return;
    const t = c.times;
    const d = (k) => Math.max(0, t[k] - a[k]);
    const somme = d('user') + d('nice') + d('sys') + d('idle') + d('irq');
    total += somme;
    repos += d('idle');
  });
  return total > 0 ? Math.round(((total - repos) / total) * 1000) / 10 : null;
}

/**
 * Mémoire du jeu relue toutes les 20 s seulement : tasklist coûte environ 0,1 s de processeur à chaque lancement, et la
 * mémoire d'Elite bouge lentement. La carte graphique, elle, est relue à chaque relevé (2 s) : c'est ce que le moniteur
 * montre en direct. (nvidia-smi --loop-ms, lancé une fois, n'est pas utilisé : sous Windows, s'il survit au serveur
 * après un plantage, rien ne l'arrête.)
 */
export const ELITE_MO_MS = 20_000;

export function sources({ executer = execFile, fetchImpl /* vide : celui de localFetch */, cpus = os.cpus, memoire = () => ({ total: os.totalmem(), libre: os.freemem() }), now = Date.now } = {}) {
  let cpusAvant = cpus();
  let elite = null; // { at, promesse } : dernier tasklist lancé
  return {
    gpu: async () => lireGpu(await run('nvidia-smi', [GPU_REQUETE, '--format=csv,noheader,nounits'], executer)),
    eliteMo: () => {
      if (!elite || now() - elite.at >= ELITE_MO_MS) {
        elite = { at: now(), promesse: run('tasklist', ['/FI', 'IMAGENAME eq EliteDangerous64.exe', '/FO', 'CSV', '/NH'], executer).then(lireTasklist) };
      }
      return elite.promesse;
    },
    cpu: () => {
      const maintenant = cpus();
      const pct = chargeCpu(cpusAvant, maintenant);
      cpusAvant = maintenant;
      return pct;
    },
    ram: () => {
      const m = memoire();
      return { utiliseeMo: Math.round((m.total - m.libre) / 1024 ** 2), totaleMo: Math.round(m.total / 1024 ** 2) };
    },
    /** Modèles d'IA chargés dans Ollama : [{ nom, vramMo }], [] si aucun, null si Ollama ne tourne pas. */
    ia: async () => {
      try {
        const res = await localFetch('http://127.0.0.1:11434/api/ps', {}, { fetchImpl, timeoutMs: 1500 });
        const d = await res.json();
        return (d?.models || []).map((m) => ({ nom: m.name, vramMo: Math.round((m.size_vram || 0) / 1024 ** 2) }));
      } catch {
        return null;
      }
    },
  };
}

/** Un relevé complet ; `pic` : la plus forte mémoire vidéo utilisée vue jusqu'ici (Mo). */
export async function releve(src, pic = 0) {
  const [gpu, eliteMo, ia] = await Promise.all([src.gpu(), src.eliteMo(), src.ia()]);
  const iaMo = ia ? ia.reduce((s, m) => s + m.vramMo, 0) : 0;
  const vram = gpu ? {
    utiliseeMo: gpu.vramUtiliseeMo,
    totaleMo: gpu.vramTotaleMo,
    libreMo: gpu.vramTotaleMo - gpu.vramUtiliseeMo,
    iaMo,
    autresMo: Math.max(0, gpu.vramUtiliseeMo - iaMo), // le jeu, Windows et le reste (le pilote ne détaille pas par programme)
    picMo: Math.max(pic, gpu.vramUtiliseeMo),
  } : null;
  return {
    at: new Date().toISOString(),
    gpu: gpu && { nom: gpu.nom, chargePct: gpu.chargePct, tempC: gpu.tempC, watts: gpu.watts },
    vram,
    cpuPct: src.cpu(),
    ram: src.ram(),
    eliteMo,
    ia,
  };
}
