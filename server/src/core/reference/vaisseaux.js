// Dessins des vaisseaux livrés avec l'app : « Vector Ships » de CMDR Qohen Leth (2025), licence Creative Commons
// Attribution - Pas d'utilisation commerciale - Partage dans les mêmes conditions 4.0 (CC BY-NC-SA 4.0), voir CREDITS.md.
// Un SVG par clé de vaisseau des données de référence (coriolis) ; vérifiés par vaisseaux.test.js (rien d'actif).
// Ils passent avant les dessins téléchargés (EliteUIAssets, vaisseaux d'avant 2024) ; une image envoyée par le joueur
// passe avant les deux.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'vaisseaux');

// Sans prototype : DESSINS_VAISSEAUX['constructor'] ou ['__proto__'] ne renvoient rien
export const DESSINS_VAISSEAUX = Object.freeze(Object.assign(Object.create(null), Object.fromEntries([
  'adder', 'alliance_challenger', 'alliance_chieftain', 'alliance_crusader', 'anaconda', 'asp', 'asp_scout', 'beluga',
  'cobra_mk_iii', 'cobra_mk_iv', 'cobramkv', 'imperial_corsair', 'diamondback_explorer', 'diamondback', 'dolphin', 'eagle',
  'federal_assault_ship', 'federal_corvette', 'federal_dropship', 'federal_gunship', 'fer_de_lance', 'hauler', 'imperial_clipper',
  'imperial_courier', 'imperial_cutter', 'imperial_eagle', 'keelback', 'krait_mkii', 'krait_phantom', 'mamba', 'mandalay', 'orca',
  'panthermkii', 'python', 'python_nx', 'sidewinder', 'type_10_defender', 'type_11_prospector', 'type_6_transporter',
  'type_7_transport', 'type_8_transport', 'type_9_heavy', 'viper', 'viper_mk_iv', 'vulture',
].map((k) => [k, `${k}.svg`]))));

// Vaisseaux sans dessin dans le pack (trop récents) : une image détourée, dessinée par l'auteur de l'app (voir
// CREDITS.md). La clé est celle des données de référence, ou le nom du journal quand le vaisseau en est absent
// (Lynx Highliner : « mediumtransport01 », Anaconda Mk II : « anacondamkii »).
export const IMAGES_VAISSEAUX = Object.freeze(Object.assign(Object.create(null), {
  anacondamkii: 'anacondamkii.webp', // Anaconda Mk II
  explorer_nx: 'explorer_nx.webp', // Caspian Explorer
  kestrel: 'kestrel.webp', // Kestrel Mk II
  mediumtransport01: 'mediumtransport01.webp', // Lynx Highliner
}));

// Place réelle du vaisseau dans chaque dessin du pack : [x, y, largeur, hauteur] dans son cadre de 1500 × 1500, mesurée
// une fois pour toutes (marge de 12). Les dessins laissent de larges bandes vides : affichés tels quels, les vaisseaux
// paraissent petits. Les fichiers restent ceux du pack, sans modification ; seul le cadre envoyé à la page change.
// Les deux façons dont le pack écrit sa balise d'ouverture (deux logiciels de dessin)
const ENTETES = ['width="1500" height="1500" viewBox="0 0 1500 1500"', 'width="100%" height="100%" viewBox="0 0 1500 1500"'];
const CADRES = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(DIR, 'cadres.json'), 'utf8'));
  } catch {
    return {}; // table absente ou abîmée : les dessins s'affichent dans leur cadre d'origine
  }
})();
const recadres = new Map(); // chemin → SVG recadré (les dessins ne changent pas en cours de route)

/**
 * Dessin du pack recadré sur le vaisseau (texte SVG), ou null si le fichier n'est pas un dessin du pack, n'a pas de
 * cadre mesuré ou n'a pas l'en-tête attendu : il est alors servi tel quel.
 */
export function dessinRecadre(chemin) {
  if (typeof chemin !== 'string' || path.dirname(chemin) !== DIR || !chemin.endsWith('.svg')) return null;
  if (recadres.has(chemin)) return recadres.get(chemin);
  const c = CADRES[path.basename(chemin, '.svg')];
  let svg = null;
  if (Array.isArray(c) && c.length === 4 && c.every((n) => Number.isInteger(n) && n >= 0 && n <= 1500) && c[2] > 0 && c[3] > 0) {
    const texte = fs.readFileSync(chemin, 'utf8');
    for (const entete of ENTETES) {
      const i = texte.indexOf(entete);
      // Seulement dans la balise d'ouverture (après un éventuel prologue XML), et une seule fois
      if (i > 0 && i < 300 && texte.indexOf(entete, i + 1) === -1) {
        svg = `${texte.slice(0, i)}width="${c[2]}" height="${c[3]}" viewBox="${c.join(' ')}"${texte.slice(i + entete.length)}`;
        break;
      }
    }
  }
  recadres.set(chemin, svg);
  return svg;
}

/** Chemin du dessin d'un vaisseau (clé des données de référence), à défaut de son image, ou null s'il n'a rien. */
export function dessinVaisseau(cle) {
  const f = typeof cle === 'string' ? (DESSINS_VAISSEAUX[cle] ?? IMAGES_VAISSEAUX[cle]) : undefined;
  if (!f) return null;
  const p = path.join(DIR, f);
  return fs.existsSync(p) ? p : null;
}
