// Textes à coller dans Discord (« Copier pour Discord », export des ventes…) : un nom venu d'ailleurs y reste un nom.
//
// Les noms de station, de système, de marchandise ou de build viennent souvent d'une source que n'importe qui peut
// remplir : Ardent Insight et Spansh reprennent les relevés d'EDDN (sans authentification), un lien EDSY partagé porte
// le nom que son auteur lui a donné. Collé tel quel, « @everyone [Spansh](https://site-piege/) <@&rôle> » mentionnerait
// tout le monde (avec les droits de celui qui colle) et afficherait un lien masqué qui mène ailleurs. discordName :
//   - retire les caractères de contrôle, invisibles et d'inversion du sens d'écriture (U+202A à U+202E, U+2066 à
//     U+2069…), et remplace les retours à la ligne par une espace : un nom tient sur sa ligne ;
//   - neutralise les mentions : « @ » et « < » sont suivis d'une espace sans chasse (U+200B), comme le fait Discord
//     lui-même pour citer une mention sans la déclencher ; « :// » aussi, pour qu'aucune adresse ne devienne un lien ;
//   - échappe la mise en forme (\ * _ ~ ` | [ ]), donc aucun lien masqué, et en début de nom les signes de titre, de
//     liste et de citation (#, -, +, >, « 1. ») ;
//   - coupe un nom trop long (100 caractères par défaut), pour que le message reste sous la limite de Discord.
// Seuls les textes venus d'ailleurs passent par ici : les notes du joueur restent telles qu'il les a écrites.
//
// Jumeau de server/src/core/discord.js (même code) ; discord.test.js vérifie qu'ils donnent le même
// résultat. Les caractères invisibles ne sont jamais écrits en clair dans ce fichier, seulement par leur code (\u{…}).

const ZWSP = '\u{200b}';
/** Retours à la ligne et tabulations : une espace. */
const BREAKS_RE = /[\t\n\v\f\r\u{85}\u{2028}\u{2029}]+/gu;
/** Contrôles, invisibles, sens d'écriture (LRM, RLM, ALM, LRE…RLO, LRI…PDI), remplissages, sélecteurs, tags Unicode. */
const INVISIBLE_RE = /[\u{0}-\u{1f}\u{7f}-\u{9f}\u{ad}\u{34f}\u{61c}\u{115f}\u{1160}\u{17b4}\u{17b5}\u{180b}-\u{180f}\u{200b}-\u{200f}\u{202a}-\u{202e}\u{2060}-\u{206f}\u{3164}\u{fe00}-\u{fe0f}\u{feff}\u{ffa0}\u{fff0}-\u{fffb}\u{e0000}-\u{e0fff}]/gu;
/** Mise en forme de Discord, partout dans le nom. */
const MARKDOWN_RE = /[\\*_~`|[\]]/g;
/** Titre, liste, citation, sous-texte : seulement en début de ligne. */
const LINE_START_RE = /^([#>+-])/;
const ORDERED_RE = /^(\d+)([.)])/;
export const DISCORD_NAME_MAX = 100;

/**
 * Nom venu d'ailleurs, prêt à être mis dans un message Discord : ni mention, ni lien, ni mise en forme.
 * @param value texte (null, undefined : chaîne vide)
 * @param max longueur maximale, en caractères (« … » au-delà)
 */
export function discordName(value, max = DISCORD_NAME_MAX) {
  let s = String(value ?? '').replace(BREAKS_RE, ' ').replace(INVISIBLE_RE, '').replace(/ {2,}/g, ' ').trim();
  const chars = Array.from(s);
  if (chars.length > max) s = `${chars.slice(0, Math.max(1, max - 1)).join('').trimEnd()}…`;
  return s
    .replace(MARKDOWN_RE, '\\$&')
    .replace(LINE_START_RE, '\\$1')
    .replace(ORDERED_RE, '$1\\$2')
    .replace(/[@<]/g, `$&${ZWSP}`)
    .replace(/:\/\//g, `:${ZWSP}//`);
}
