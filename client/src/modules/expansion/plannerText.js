// Texte « Copier pour Discord » du Calculateur de routes (sans React : testé seul, plannerText.test.js).
//
// Les noms de station, de système et de marchandise viennent d'Ardent Insight, qui reprend les relevés d'EDDN (que
// n'importe qui peut envoyer) : chacun passe par discordName (core/discord.js), jamais une mention ni un lien masqué.

import { compact, dec1, int } from '../../core/format.js';
import { discordName } from '../../core/discord.js';

const place = (end) => `${discordName(end?.station)} (${discordName(end?.system)})`;

/** Texte à coller dans Discord pour une route (aller simple, ou boucle avec son retour). */
export function plannerDiscordText(r, loop) {
  const lines = [`**${place(r.from)} ${loop ? '⇄' : '→'} ${place(r.to)}**`];
  lines.push(`Aller : ${discordName(r.out?.name)}, +${int(r.out?.margin)} cr/t`);
  if (loop) lines.push(`Retour : ${discordName(r.back?.name)}, +${int(r.back?.margin)} cr/t`);
  lines.push(`≈ ${compact(r.profit)} cr par ${loop ? 'boucle' : 'trajet'}, ${r.jumps} saut${r.jumps > 1 ? 's' : ''}, ${dec1(r.distance)} al`);
  return lines.join('\n');
}
