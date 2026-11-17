// Micro de la fenêtre en jeu : enregistre ce que dit le joueur en son brut 16 kHz mono (ce qu'attend Whisper), puis le
// met en WAV. Un appui (bouton 🎤 ou Alt+Maj+V) pour commencer, un appui pour finir ; 60 s au plus.

export const FREQUENCE = 16000;
export const MAX_SECONDES = 60;

/** WAV PCM 16 bits mono à partir d'échantillons de -1 à 1. */
export function enWav(echantillons, frequence = FREQUENCE) {
  const n = echantillons.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const texte = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  texte(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  texte(8, 'WAVE');
  texte(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, frequence, true);
  v.setUint32(28, frequence * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  texte(36, 'data');
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, echantillons[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buf);
}

/** Recolle les morceaux enregistrés. */
export function recoller(morceaux) {
  const total = morceaux.reduce((s, m) => s + m.length, 0);
  const out = new Float32Array(total);
  let o = 0;
  for (const m of morceaux) {
    out.set(m, o);
    o += m.length;
  }
  return out;
}

/**
 * Enregistreur : demarrer() ouvre le micro, arreter() le ferme et rend le WAV (null si rien). S'arrête seul à 60 s.
 * @param onFin appelé avec le WAV quand l'enregistrement s'arrête seul
 */
export function enregistreur({ onFin } = {}) {
  let flux = null;
  let ctx = null;
  let noeud = null;
  let morceaux = [];
  let minuterie = null;
  async function demarrer() {
    flux = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    ctx = new AudioContext({ sampleRate: FREQUENCE });
    const source = ctx.createMediaStreamSource(flux);
    noeud = ctx.createScriptProcessor(4096, 1, 1);
    morceaux = [];
    noeud.onaudioprocess = (e) => morceaux.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    source.connect(noeud);
    noeud.connect(ctx.destination);
    minuterie = setTimeout(() => onFin?.(arreter()), MAX_SECONDES * 1000);
  }
  function arreter() {
    clearTimeout(minuterie);
    noeud?.disconnect();
    flux?.getTracks().forEach((t) => t.stop());
    ctx?.close();
    flux = ctx = noeud = null;
    const tout = recoller(morceaux);
    morceaux = [];
    return tout.length > FREQUENCE / 4 ? enWav(tout) : null; // moins d'un quart de seconde : rien
  }
  return { demarrer, arreter, actif: () => Boolean(flux) };
}
