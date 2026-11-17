// Captures du cadre de l'overlay sur le disque : les images (<id>.png) et leur liste (index.json) restent d'accord.
//
// Une image pouvait rester sur le disque sans être dans la liste : écrite avant l'index, puis la suite échouait (base
// verrouillée, disque plein) ou le serveur s'arrêtait pendant la lecture du texte. Jamais montrée, jamais effacée par la
// limite de 30 : la place prise n'était plus bornée. Désormais l'image n'est écrite qu'une fois tout le reste prêt, juste
// avant la liste ; et au démarrage comme après chaque capture, le dossier est rapproché de la liste (reconcile) : une
// image sans entrée y revient (sans texte lu), une entrée sans image en sort, et la limite vaut pour toutes.

/** Id d'une capture tel que le serveur le crée : String(Date.now()), 13 chiffres (jusqu'en 2286). */
export const isCaptureId = (id) => typeof id === 'string' && /^[0-9]{13}$/.test(id);

const IMAGE_RE = /^([0-9]{13})\.png$/;
// Reste d'une écriture coupée (core/atomic.js) : <nom>.<pid>.<n>.<aléa>.tmp
const TEMP_RE = /\.tmp$/;

export const RECOVERED_ERROR = "Capture retrouvée sans son texte lu (enregistrement interrompu).";

/** Entrée d'une image retrouvée sans sa ligne dans la liste. */
export function recoveredCapture(id) {
  const t = Number(id);
  return { id, at: new Date(Number.isFinite(t) ? t : 0).toISOString(), system: null, body: null, site: null, width: null, height: null, lines: [], error: RECOVERED_ERROR, ores: [] };
}

/**
 * Rapproche la liste des fichiers du dossier.
 * @param {object[]} list   entrées de index.json (les plus récentes d'abord)
 * @param {string[]} names  noms des fichiers du dossier
 * @param {number} max      nombre de captures gardées
 * @returns {{ list: object[], remove: string[], changed: boolean }} liste à garder, fichiers à effacer
 */
export function reconcile(list, names, max) {
  const images = new Set(names.map((n) => IMAGE_RE.exec(n)?.[1]).filter(Boolean));
  const seen = new Set();
  const kept = [];
  for (const c of Array.isArray(list) ? list : []) {
    if (!c || typeof c !== 'object' || !isCaptureId(c.id) || seen.has(c.id) || !images.has(c.id)) continue; // sans image : retirée
    seen.add(c.id);
    kept.push(c);
  }
  for (const id of images) if (!seen.has(id)) kept.push(recoveredCapture(id)); // image sans entrée : elle revient
  kept.sort((a, b) => Number(b.id) - Number(a.id));
  const extra = kept.splice(max);
  const remove = [...extra.map((c) => `${c.id}.png`), ...names.filter((n) => TEMP_RE.test(n))];
  const before = (Array.isArray(list) ? list : []).map((c) => c?.id).join(',');
  return { list: kept, remove, changed: before !== kept.map((c) => c.id).join(',') || remove.length > 0 };
}
