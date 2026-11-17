// Formules physiques du constructeur de builds : saut, courbe de masse (boucliers, propulseurs), résistances.
// Code écrit pour l'app ; le saut suit la formule publiée par Frontier, la courbe de masse et les résistances suivent
// les règles d'EDSY (© taleden, CC BY-NC 4.0), rappelées sur chaque fonction ; les résultats
// sont vérifiés contre ceux d'EDSY par la photographie de __golden__ et contre le journal du jeu (builder.test.js).

/**
 * Portée d'un saut, en années-lumière. Formule du réacteur FSD communiquée par Frontier (reprise par le wiki
 * Elite Dangerous, page « Frame Shift Drive ») :
 *   portée = masse optimale / masse totale × (carburant du saut / coefficient linéaire) ^ (1 / exposant)
 * La masse totale compte le carburant présent dans le réservoir ; le carburant d'un saut est plafonné par la
 * consommation maximale du réacteur. Un booster de FSD guardian ajoute une distance fixe.
 * @param {{ optmass: number, maxfuel: number, fuelmul: number, fuelpower: number }} fsd réacteur, après ingénierie
 * @param {number} mass masse sans le carburant (t), cargaison comprise si elle est à bord
 * @param {number} fuel carburant dans le réservoir (t)
 * @param {number} boost distance ajoutée (al)
 */
export function jumpLength(fsd, mass, fuel, boost) {
  const burned = Math.min(fuel, fsd.maxfuel);
  return Math.pow(burned / fsd.fuelmul, 1 / fsd.fuelpower) * fsd.optmass / (mass + fuel) + boost;
}

/**
 * Distance parcourue avec un plein, saut après saut, sans refaire le plein : chaque saut consomme le maximum
 * permis (ou ce qui reste), et le vaisseau s'allège d'autant. 1000 sauts au plus.
 */
export function rangeOnFullTank(fsd, dryMass, tank, boost) {
  if (!fsd || !tank) return 0;
  let total = 0;
  let fuel = tank;
  for (let jumps = 0; fuel > 1e-6 && jumps < 1000; jumps++) {
    total += jumpLength(fsd, dryMass, fuel, boost);
    fuel -= Math.min(fsd.maxfuel, fuel);
  }
  return total;
}

/**
 * Courbe de masse d'un générateur de bouclier ou de propulseurs, en % : le multiplicateur vaut `maxMul` à la masse
 * mini (ou en dessous), `optMul` à la masse optimale et `minMul` à la masse maxi. Entre les deux, une puissance de la
 * position relative x = (masse maxi − masse) / (masse maxi − masse mini), dont l'exposant k est choisi pour que la
 * courbe passe par l'optimum : x_opt^k = (optMul − minMul) / (maxMul − minMul).
 *   multiplicateur = minMul + x^k × (maxMul − minMul)
 * (Courbe décrite publiquement par la communauté d'après les valeurs du jeu.) Au-delà de la masse maxi, x est
 * négatif et le résultat n'est pas un nombre (NaN) : le module est trop faible pour le vaisseau.
 */
export function massCurve(mass, minMass, optMass, maxMass, minMul, optMul, maxMul) {
  const span = maxMass - minMass;
  const x = Math.min(1, (maxMass - mass) / span);
  const xOpt = (maxMass - optMass) / span;
  const reached = (optMul - minMul) / (maxMul - minMul); // part du gain atteinte à la masse optimale
  // Masse optimale = masse mini : x_opt = 1, le logarithme serait nul ; le dénominateur est alors pris égal à 1
  const k = Math.log(reached) / (optMass === minMass ? 1 : Math.log(xOpt));
  return minMul + Math.pow(x, k) * (maxMul - minMul);
}

/**
 * Résistance effective, en %, avec les rendements décroissants du jeu (règle relevée par la communauté depuis
 * l'arrivée des ingénieurs, qui permettent de cumuler les résistances) :
 *   - la résistance « attendue » cumule la base et les ajouts : les parts de dégâts qui passent se multiplient,
 *     1 − (1 − base)(1 − ajouts) ;
 *   - au-delà d'un seuil (30 %, ou la base si elle est plus haute, ou le meilleur renfort), l'intervalle
 *     [seuil, 100 %] est ramené linéairement sur [seuil, 65 %] ;
 *   - une résistance « exemptée » (celle du générateur de bouclier) s'applique ensuite, sans réduction.
 * @param {number} baseres résistance de base (blindage) ; 0 pour un bouclier
 * @param {number} extrares résistance ajoutée (boosters, renforts), déjà cumulée
 * @param {number} exemptres résistance appliquée hors rendements décroissants
 * @param {number} bestres meilleure résistance d'un seul renfort
 */
export function effectiveResistance(baseres = 0, extrares = 0, exemptres = 0, bestres = 0) {
  const expected = (1 - (1 - baseres / 100) * (1 - extrares / 100)) * 100;
  const threshold = Math.max(30, baseres, bestres || 0);
  const CEILING = 65;
  const damped = threshold + ((expected - threshold) / (100 - threshold)) * (CEILING - threshold);
  const kept = damped >= 30 ? damped : expected;
  return (1 - (1 - exemptres / 100) * (1 - kept / 100)) * 100;
}
