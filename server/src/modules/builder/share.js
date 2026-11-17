// Texte « Copier pour Discord » d'un build : nom, vaisseau, chiffres clés et lien EDSY.
//
// Le nom d'un build vient souvent d'ailleurs : lien EDSY partagé, export JSON importé. Il passe par discordName
// (core/discord.js) : « @everyone [EDSY](https://site-piege/) » ne mentionne personne et n'affiche aucun lien masqué.
// Seul le lien EDSY, fabriqué par l'app (encodeEdsy), reste un lien.

import { discordName } from '../../core/discord.js';

const n = (v, d = 0) => v.toLocaleString('fr-FR', { maximumFractionDigits: d });

/**
 * @param build { name } ; ship : nom du vaisseau (données EDSY) ; stats : computeStats ; edsy : lien EDSY de l'app
 */
export function shareText(build, ship, stats, edsy) {
  const parts = [`${n(stats.shields)} MJ de boucliers`];
  if (stats.dps > 0) parts.push(`${n(stats.dps, 1)} DPS`);
  parts.push(`${n(stats.jump.unladen, 2)} al de saut`);
  const name = discordName(build.name) || discordName(ship);
  return `**${name}**\n${discordName(ship)} · ${parts.join(' · ')}\n[EDSY](${edsy})`;
}
