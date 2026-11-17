// Client d'Ollama, le programme qui fait tourner les modèles sur ce PC (http://127.0.0.1:11434). Rien ne sort du PC.

import { localFetch } from '../../core/net.js';

export const OLLAMA_URL = 'http://127.0.0.1:11434';

export function clientOllama({ url = OLLAMA_URL, fetchImpl } = {}) { // fetchImpl vide : celui de localFetch
  const couches = new Map(); // modèle → nombre de couches (il ne change pas)
  async function appel(chemin, { body, timeoutMs = 10_000 } = {}) {
    const res = await localFetch(`${url}${chemin}`, body
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : {}, { fetchImpl, timeoutMs, maxBytes: 8 * 1024 * 1024 });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || `Ollama : erreur ${res.status}`);
    return data;
  }
  return {
    /** Modèles installés : [{ nom, taille (octets) }]. */
    async installes() {
      const d = await appel('/api/tags', { timeoutMs: 4000 });
      return (d?.models || []).map((m) => ({ nom: m.name, taille: m.size || 0 }));
    },
    /** Modèles chargés en mémoire : [{ nom, vram (octets) }]. */
    async charges() {
      const d = await appel('/api/ps', { timeoutMs: 4000 });
      return (d?.models || []).map((m) => ({ nom: m.name, vram: m.size_vram || 0 }));
    },
    /** Nombre de couches d'un modèle (pour le répartir entre la carte et le processeur), ou null. */
    async couches(modele) {
      if (couches.has(modele)) return couches.get(modele);
      const d = await appel('/api/show', { body: { model: modele }, timeoutMs: 8000 });
      const n = Number(Object.entries(d?.model_info || {}).find(([k]) => k.endsWith('.block_count'))?.[1]);
      const v = Number.isInteger(n) && n > 0 ? n : null;
      couches.set(modele, v);
      return v;
    },
    /**
     * Un tour de conversation (outils compris) ; le modèle reste chargé `garderSec` secondes après. `numGpu` : couches
     * sur la carte, imposées (Ollama ne voit pas la mémoire prise par le jeu).
     */
    chat({ modele, messages, tools, garderSec, numGpu }) {
      const options = { num_ctx: 16384, temperature: 0.3, ...(Number.isInteger(numGpu) ? { num_gpu: numGpu } : {}) };
      return appel('/api/chat', {
        body: { model: modele, messages, tools, stream: false, think: false, keep_alive: `${garderSec}s`, options },
        timeoutMs: 180_000, // premier chargement du grand modèle : une dizaine de secondes ; une longue réponse : plus
      });
    },
    /** Décharge un modèle tout de suite (rend sa mémoire vidéo). */
    decharger(modele) {
      return appel('/api/generate', { body: { model: modele, keep_alive: 0 }, timeoutMs: 10_000 });
    },
  };
}
