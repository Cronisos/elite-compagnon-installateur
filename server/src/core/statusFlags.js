// Status.json décodé en clair : le jeu le réécrit à chaque changement (boucliers, chaleur, train, énergie…), plusieurs
// fois par seconde en vol. Ses indicateurs (Flags, Flags2) sont des bits ; leur sens vient de la documentation des
// journaux de Frontier (« Status File », Elite Dangerous Player Journal). Rien n'est deviné : un bit inconnu est ignoré.

/** Flags : bit n → nom (dans l'ordre des bits). */
export const FLAGS = [
  'aQuai', 'pose', 'trainSorti', 'bouclierLeve', 'supercroisiere', 'assistanceVolCoupee', 'armesDeployees', 'enEscadrille',
  'phares', 'ecopeCargaison', 'silencieux', 'ecopeCarburant', 'srvFreinAMain', 'srvVueTourelle', 'srvTourelleRentree',
  'srvAideConduite', 'masseBloquee', 'fsdCharge', 'fsdRefroidit', 'carburantBas', 'surchauffe', 'aLatLong', 'enDanger',
  'interdiction', 'dansVaisseau', 'dansChasseur', 'dansSrv', 'modeAnalyse', 'visionNocturne', 'altitudeRayonMoyen',
  'sautFsd', 'srvPleinsPhares',
];

/** Flags2 (Odyssey) : bit n → nom. */
export const FLAGS2 = [
  'aPied', 'enTaxi', 'equipageMulti', 'aPiedStation', 'aPiedPlanete', 'visee', 'oxygeneBas', 'santeBasse', 'froid', 'chaud',
  'tresFroid', 'tresChaud', 'volPlane', 'aPiedHangar', 'aPiedEspaceSocial', 'aPiedExterieur', 'airRespirable',
  'telepresence', 'equipagePhysique', 'fsdHyperCharge',
];

/** GuiFocus : écran ou panneau ouvert. */
export const ECRANS = [
  null, 'panneau de droite (interne)', 'panneau de gauche (cible et navigation)', 'communications', 'panneau de rôle',
  'services de la station', 'carte de la galaxie', 'carte du système', 'orrery', 'scanner FSS', 'sonde de surface (SAA)', 'codex',
];

/** Indicateurs allumés d'un champ de bits : { nom: true } pour chaque bit présent. */
export function bits(valeur, noms) {
  const v = Number(valeur) || 0;
  const out = {};
  noms.forEach((nom, i) => {
    if (v & (2 ** i)) out[nom] = true; // 2 ** 31 : `1 << 31` serait négatif
  });
  return out;
}

const num = (x) => (Number.isFinite(x) ? x : null);
const arrondi = (x, n = 2) => (Number.isFinite(x) ? Math.round(x * 10 ** n) / 10 ** n : null);

/** Où est le joueur : 'vaisseau', 'chasseur', 'srv', 'a pied', 'taxi', ou null (menu, jeu fermé). */
export function vehicule(f, f2) {
  if (f2.enTaxi) return 'taxi';
  if (f2.aPied) return 'a pied';
  if (f.dansSrv) return 'srv';
  if (f.dansChasseur) return 'chasseur';
  if (f.dansVaisseau) return 'vaisseau';
  return null;
}

/**
 * Status.json en clair, sans rien d'autre que ce que le jeu y a mis.
 * Le carburant est celui du véhicule où tu es : dans le SRV, c'est le réservoir du SRV (le vaisseau n'y est pas).
 * @returns {object|null} null si ce n'est pas un Status lisible
 */
export function lireStatus(st) {
  if (!st || typeof st !== 'object' || st.event !== 'Status') return null;
  const f = bits(st.Flags, FLAGS);
  const f2 = bits(st.Flags2, FLAGS2);
  const out = {
    at: typeof st.timestamp === 'string' ? st.timestamp : null,
    enJeu: Boolean(st.Flags || st.Flags2), // 0 et 0 : menu principal ou jeu fermé
    vehicule: vehicule(f, f2),
    indicateurs: { ...f, ...f2 },
  };
  if (Array.isArray(st.Pips) && st.Pips.length === 3) out.pips = { sys: st.Pips[0] / 2, mot: st.Pips[1] / 2, arm: st.Pips[2] / 2 };
  if (Number.isInteger(st.FireGroup)) out.groupeTir = st.FireGroup + 1;
  if (Number.isInteger(st.GuiFocus) && st.GuiFocus > 0) out.ecran = ECRANS[st.GuiFocus] || `écran ${st.GuiFocus}`;
  if (st.Fuel && typeof st.Fuel === 'object') out.carburant = { principal: arrondi(st.Fuel.FuelMain), reservoir: arrondi(st.Fuel.FuelReservoir, 3) };
  if (num(st.Cargo) != null) out.soute = Math.round(st.Cargo);
  if (typeof st.LegalState === 'string') out.statutLegal = st.LegalState;
  if (num(st.Balance) != null) out.credits = st.Balance;
  if (num(st.Latitude) != null && num(st.Longitude) != null) out.coordonnees = { lat: arrondi(st.Latitude, 4), long: arrondi(st.Longitude, 4) };
  if (num(st.Heading) != null) out.cap = Math.round(st.Heading);
  if (num(st.Altitude) != null) out.altitude = Math.round(st.Altitude);
  if (typeof st.BodyName === 'string') out.corps = st.BodyName;
  if (num(st.PlanetRadius) != null) out.rayonPlanete = Math.round(st.PlanetRadius);
  if (num(st.Gravity) != null) out.gravite = arrondi(st.Gravity);
  if (st.Destination && typeof st.Destination === 'object') {
    out.destination = { systeme: st.Destination.System ?? null, corps: st.Destination.Body ?? null, nom: st.Destination.Name_Localised || st.Destination.Name || null };
  }
  // À pied (Odyssey) : oxygène et santé de 0 à 1, température en kelvins
  if (num(st.Oxygen) != null) out.oxygene = Math.round(st.Oxygen * 100);
  if (num(st.Health) != null) out.sante = Math.round(st.Health * 100);
  if (num(st.Temperature) != null) out.temperature = Math.round(st.Temperature);
  if (typeof st.SelectedWeapon === 'string') out.arme = st.SelectedWeapon_Localised || st.SelectedWeapon;
  return out;
}
