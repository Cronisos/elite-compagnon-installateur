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
  'cobra_mk_iii', 'cobra_mk_iv', 'cobra_mk_v', 'imperial_corsair', 'diamondback_explorer', 'diamondback', 'dolphin', 'eagle',
  'federal_assault_ship', 'federal_corvette', 'federal_dropship', 'federal_gunship', 'fer_de_lance', 'hauler', 'imperial_clipper',
  'imperial_courier', 'imperial_cutter', 'imperial_eagle', 'keelback', 'krait_mkii', 'krait_phantom', 'mamba', 'mandalay', 'orca',
  'panther_clipper', 'python', 'python_nx', 'sidewinder', 'type_10_defender', 'type_11_prospector', 'type_6_transporter',
  'type_7_transport', 'type_8_transport', 'type_9_heavy', 'viper', 'viper_mk_iv', 'vulture',
].map((k) => [k, `${k}.svg`]))));

/** Chemin du dessin d'un vaisseau (clé des données de référence), ou null s'il n'en a pas. */
export function dessinVaisseau(cle) {
  const f = typeof cle === 'string' ? DESSINS_VAISSEAUX[cle] : undefined;
  if (!f) return null;
  const p = path.join(DIR, f);
  return fs.existsSync(p) ? p : null;
}
