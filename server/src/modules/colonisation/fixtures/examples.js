// Lignes d'exemple pour les tests du module Colonisation.
//
// ATTENTION : ce sont des EXEMPLES DOCUMENTÉS (schémas, code d'autres outils), pas un vrai journal de référence, qui ne
// colonise pas encore. Source indiquée sur chaque ligne. Les séquences des tests sont construites à partir d'eux
// (même MarketID pour relier un Docked et un dépôt, horodatages ajoutés là où la source n'en a pas).

// Exemple de ColonisationConstructionDepot (EDDI, Events/ColonisationConstructionDepotEvent.cs, échantillon réel du
// 8 avr. 2025) : 19 marchandises d'un vaisseau de colonisation, 720 t d'acier livrées, 720 / 21 803 = 0,033023.
export const DEPOT = {
  timestamp: '2025-04-08T23:47:39Z', event: 'ColonisationConstructionDepot', MarketID: 3951663874,
  ConstructionProgress: 0.033023, ConstructionComplete: false, ConstructionFailed: false,
  ResourcesRequired: [
    { Name: '$aluminium_name;', Name_Localised: 'Aluminium', RequiredAmount: 480, ProvidedAmount: 0, Payment: 3239 },
    { Name: '$ceramiccomposites_name;', Name_Localised: 'Ceramic Composites', RequiredAmount: 498, ProvidedAmount: 0, Payment: 724 },
    { Name: '$cmmcomposite_name;', Name_Localised: 'CMM Composite', RequiredAmount: 4518, ProvidedAmount: 0, Payment: 6788 },
    { Name: '$computercomponents_name;', Name_Localised: 'Computer Components', RequiredAmount: 61, ProvidedAmount: 0, Payment: 1112 },
    { Name: '$copper_name;', Name_Localised: 'Copper', RequiredAmount: 240, ProvidedAmount: 0, Payment: 1050 },
    { Name: '$foodcartridges_name;', Name_Localised: 'Food Cartridges', RequiredAmount: 91, ProvidedAmount: 0, Payment: 673 },
    { Name: '$fruitandvegetables_name;', Name_Localised: 'Fruit and Vegetables', RequiredAmount: 51, ProvidedAmount: 0, Payment: 865 },
    { Name: '$insulatingmembrane_name;', Name_Localised: 'Insulating Membrane', RequiredAmount: 341, ProvidedAmount: 0, Payment: 11788 },
    { Name: '$liquidoxygen_name;', Name_Localised: 'Liquid oxygen', RequiredAmount: 1865, ProvidedAmount: 0, Payment: 2260 },
    { Name: '$medicaldiagnosticequipment_name;', Name_Localised: 'Medical Diagnostic Equipment', RequiredAmount: 13, ProvidedAmount: 0, Payment: 3609 },
    { Name: '$nonlethalweapons_name;', Name_Localised: 'Non-Lethal Weapons', RequiredAmount: 13, ProvidedAmount: 0, Payment: 2503 },
    { Name: '$polymers_name;', Name_Localised: 'Polymers', RequiredAmount: 521, ProvidedAmount: 0, Payment: 682 },
    { Name: '$powergenerators_name;', Name_Localised: 'Power Generators', RequiredAmount: 19, ProvidedAmount: 0, Payment: 3072 },
    { Name: '$semiconductors_name;', Name_Localised: 'Semiconductors', RequiredAmount: 69, ProvidedAmount: 0, Payment: 1526 },
    { Name: '$steel_name;', Name_Localised: 'Steel', RequiredAmount: 6680, ProvidedAmount: 720, Payment: 5057 },
    { Name: '$superconductors_name;', Name_Localised: 'Superconductors', RequiredAmount: 116, ProvidedAmount: 0, Payment: 7657 },
    { Name: '$titanium_name;', Name_Localised: 'Titanium', RequiredAmount: 5471, ProvidedAmount: 0, Payment: 5360 },
    { Name: '$water_name;', Name_Localised: 'Water', RequiredAmount: 717, ProvidedAmount: 0, Payment: 662 },
    { Name: '$waterpurifiers_name;', Name_Localised: 'Water Purifiers', RequiredAmount: 39, ProvidedAmount: 0, Payment: 849 },
  ],
};

// ColonisationContribution (EDDI, Events/ColonisationContributionEvent.cs ; BGS-Tally) : noms en PascalCase.
export const CONTRIBUTION = {
  timestamp: '2025-04-11T08:30:20Z', event: 'ColonisationContribution', MarketID: 3950995714,
  Contributions: [
    { Name: '$CeramicComposites_name;', Name_Localised: 'Ceramic Composites', Amount: 513 },
    { Name: '$InsulatingMembrane_name;', Name_Localised: 'Insulating Membrane', Amount: 263 },
    { Name: '$LiquidOxygen_name;', Name_Localised: 'Liquid oxygen', Amount: 8 },
  ],
};

// ColonisationSystemClaim (SrvSurvey, JournalEntry.cs) : StarSystem est le système REVENDIQUÉ.
export const CLAIM = { timestamp: '2025-10-05T07:03:11Z', event: 'ColonisationSystemClaim', StarSystem: 'North America Sector PI-T c3-4', SystemAddress: 1180210008826 };
// ColonisationBeaconDeployed (SrvSurvey) : aucun champ, environ 6 min après la revendication.
export const BEACON = { timestamp: '2025-10-05T07:08:58Z', event: 'ColonisationBeaconDeployed' };
// ColonisationSystemClaimRelease (schéma edomh, EDDI).
export const RELEASE = { timestamp: '2025-04-09T12:33:19Z', event: 'ColonisationSystemClaimRelease', StarSystem: 'Col 285 Sector HM-I b11-2', SystemAddress: 5070075078009 };
// CompleteConstruction (schéma edomh/jixxed, valeurs génériques : aucune ligne réelle trouvée).
export const COMPLETE_CONSTRUCTION = { timestamp: '2022-09-11T22:00:45Z', event: 'CompleteConstruction' };

// Docked sur un vaisseau de colonisation (fixture BGS-Tally, colonisation_build_events.json ; horodatage retiré
// dans la source, ajouté ici).
export const DOCKED_SHIP = {
  timestamp: '2025-04-08T23:40:00Z', event: 'Docked', StationName: '$EXT_PANEL_ColonisationShip; Judson Depot', StationType: 'SurfaceStation',
  Taxi: false, Multicrew: false, StarSystem: 'Bleae Thua ED-D c12-5', SystemAddress: 1458040738922, MarketID: 3963439106,
  StationFaction: { Name: 'Brewer Corporation' }, StationGovernment: '$government_Megaconstruction;', StationGovernment_Localised: 'Megaconstruction',
  StationServices: ['dock', 'autodock', 'commodities', 'contacts', 'missions', 'rearm', 'refuel', 'repair', 'engineer', 'facilitator', 'flightcontroller', 'stationoperations', 'searchrescue', 'stationMenu', 'colonisationcontribution'],
  StationEconomy: '$economy_Colony;', StationEconomy_Localised: 'Colony', StationEconomies: [{ Name: '$economy_Colony;', Name_Localised: 'Colony', Proportion: 1 }],
  DistFromStarLS: 1701.358246, LandingPads: { Small: 8, Medium: 8, Large: 16 },
};

// Seule ligne VRAIE de l’auteur utilisée ici (journal du 1er nov. 2026, abrégée) : un établissement terminé qui garde le
// service « colonisationcontribution ». Il ne doit pas devenir un chantier.
export const SETTLEMENT_WITH_SERVICE = {
  timestamp: '2026-11-01T10:52:06Z', event: 'ApproachSettlement', Name: 'Gibbs Hydroponics Site', MarketID: 4230411011,
  StationServices: ['dock', 'autodock', 'commodities', 'contacts', 'missions', 'stationMenu', 'colonisationcontribution'],
  StationEconomy: '$economy_Agri;', SystemAddress: 633943823090, BodyID: 29, BodyName: 'Synuefe OU-E c28-2 11 a',
};

/** Dépôt d'exemple sur un autre MarketID et à une autre heure, avec des quantités livrées modifiées. */
export function depotAt(marketId, timestamp, provided = {}, extra = {}) {
  const ResourcesRequired = DEPOT.ResourcesRequired.map((r) => {
    const symbol = r.Name.slice(1, -'_name;'.length);
    return Object.hasOwn(provided, symbol) ? { ...r, ProvidedAmount: provided[symbol] } : { ...r };
  });
  const req = ResourcesRequired.reduce((a, r) => a + r.RequiredAmount, 0);
  const got = ResourcesRequired.reduce((a, r) => a + r.ProvidedAmount, 0);
  return { ...DEPOT, timestamp, MarketID: marketId, ResourcesRequired, ConstructionProgress: Number((got / req).toFixed(6)), ...extra };
}

/** Docked d'exemple (vaisseau de colonisation) sur un autre MarketID et à une autre heure. */
export const dockedAt = (marketId, timestamp, extra = {}) => ({ ...DOCKED_SHIP, timestamp, MarketID: marketId, ...extra });

/** Livraison d'exemple : { steel: 500 } → ColonisationContribution en PascalCase. */
export function contributionAt(marketId, timestamp, amounts) {
  const pascal = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  return {
    timestamp, event: 'ColonisationContribution', MarketID: marketId,
    Contributions: Object.entries(amounts).map(([s, Amount]) => ({ Name: `$${pascal(s)}_name;`, Name_Localised: pascal(s), Amount })),
  };
}
