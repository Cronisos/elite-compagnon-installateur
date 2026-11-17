// Valeur estimée des données d'exploration (règles du jeu depuis la version 3.3).
//
// Formule reprise de EDDiscovery, EliteDangerousCore/FrontierData/Enumerations/EstimatedValues.cs
// (Apache 2.0), elle-même tirée du fil Frontier « Exploration value formulae ».
// Les bonus de système complet (FSS) ne sont pas comptés : l'estimation est donc prudente.

const Q = 0.56591828;
const FIRST_DISCOVERY = 2.6;
const EFFICIENT = 1.25;

/** Bonus Odyssey sur les valeurs de cartographie. */
const ody = (v) => v + Math.max(v * 0.3, 555);

function starK(starType) {
  const t = String(starType || '');
  if (/^D/.test(t)) return 14057; // naines blanches
  if (t === 'N' || t === 'H') return 22628; // étoiles à neutrons, trous noirs
  if (/SupermassiveBlackHole/i.test(t)) return 33.5678;
  return 1200;
}

function planetK(planetClass, terraformable) {
  switch (planetClass) {
    case 'Metal rich body':
      return 21790 + (terraformable ? 65631 : 0);
    case 'Ammonia world':
      return 96932;
    case 'Sudarsky class I gas giant':
      return 1656;
    case 'Sudarsky class II gas giant':
    case 'High metal content body':
      return 9654 + (terraformable ? 100677 : 0);
    case 'Water world':
      return 64831 + (terraformable ? 116295 : 0);
    case 'Earthlike body':
      return 64831 + 116295;
    default:
      return 300 + (terraformable ? 93328 : 0);
  }
}

/**
 * @param {object} scan événement Scan
 * @param {object|null} mapping SAAScanComplete du même corps (ou null)
 * @returns {number} valeur estimée en crédits
 */
export function scanValue(scan, mapping = null) {
  if (scan.StarType) {
    const k = starK(scan.StarType);
    const base = k + ((scan.StellarMass ?? 1) * k) / 66.25;
    return Math.round(scan.WasDiscovered === false ? base * FIRST_DISCOVERY : base);
  }
  if (!scan.PlanetClass) return 0; // ceinture d'astéroïdes
  const k = planetK(scan.PlanetClass, scan.TerraformState === 'Terraformable');
  const base = Math.max(k + k * (scan.MassEM ?? 1) ** 0.2 * Q, 500);
  const firstDisc = scan.WasDiscovered === false;
  if (!mapping) return Math.round(firstDisc ? base * FIRST_DISCOVERY : base);
  const eff = mapping.ProbesUsed != null && mapping.EfficiencyTarget != null && mapping.ProbesUsed <= mapping.EfficiencyTarget ? EFFICIENT : 1;
  let v;
  if (firstDisc && scan.WasMapped === false) v = ody(base * 3.699622554) * FIRST_DISCOVERY;
  else if (scan.WasMapped === false) v = ody(base * 8.0956);
  else v = ody(base * 3.3333333);
  return Math.round(v * eff);
}
