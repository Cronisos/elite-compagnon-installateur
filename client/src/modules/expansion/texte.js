// Petits textes du module Projet extension.

// Élision devant une voyelle, sans le « y » : « de Yuri Grom », mais « d’Aisling Duval », « d’Edmund Mahon ».
const VOYELLE = /^[aeiouàâéèêëîïôûü]/i;

/** « de Felicia Winters », « d’Arissa Lavigny-Duval » ; « de ta puissance » si elle est inconnue. */
export function dePuissance(power) {
  const nom = typeof power === 'string' ? power.trim() : '';
  if (!nom) return 'de ta puissance';
  return `${VOYELLE.test(nom) ? 'd’' : 'de '}${nom}`;
}
