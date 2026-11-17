// Lecture des événements de colonisation du journal. Chaque ligne devient une forme normalisée, sans jamais
// lever d'exception : un champ absent ou d'un type inattendu donne null. Les écarts avec la spécification
// (champ inconnu, champ attendu absent, type inattendu) sont rendus dans `issues`, pour le diagnostic : le
// module est écrit sans vrai journal de colonisation de l’auteur, à affiner le jour où il y en aura un.
//
// Spécification : schémas jixxed/ed-journal-schemas et edomh, exemples réels d'EDDI, SrvSurvey et BGS-Tally
// (liste des sources et des incertitudes dans le README, section « Module Colonisation »).

import { decodeEntities, localised } from '../../core/text.js';

/** Événements propres à la colonisation (seuls ceux-là vont dans les événements bruts du diagnostic). */
export const COLONISATION_EVENTS = [
  'ColonisationConstructionDepot',
  'ColonisationContribution',
  'ColonisationSystemClaim',
  'ColonisationSystemClaimRelease',
  'ColonisationBeaconDeployed',
  'CompleteConstruction',
];

/**
 * Événements de contexte : le dépôt ne porte que son MarketID, le système et le nom du chantier viennent de
 * l'amarrage (Docked, Location à quai) ou de l'approche (DockingGranted, SupercruiseDestinationDrop,
 * ApproachSettlement). Les sauts donnent le système de la balise (ColonisationBeaconDeployed, sans champ).
 */
export const CONTEXT_EVENTS = [
  'Docked', 'Location', 'Undocked', 'DockingRequested', 'DockingGranted',
  'SupercruiseDestinationDrop', 'ApproachSettlement', 'FSDJump', 'CarrierJump', 'SupercruiseExit',
];

// Champs connus de chaque événement. Une table Map : le nom de l'événement vient du journal, jamais un accès
// à un objet ordinaire (« constructor » trouverait la fonction d'Object).
const COMMON = ['timestamp', 'event'];
const SCHEMAS = new Map([
  ['ColonisationConstructionDepot', {
    fields: ['MarketID', 'ConstructionProgress', 'ConstructionComplete', 'ConstructionFailed', 'ResourcesRequired'],
    lists: new Map([['ResourcesRequired', { fields: ['Name', 'RequiredAmount', 'ProvidedAmount', 'Payment'], optional: ['Name_Localised'] }]]),
  }],
  ['ColonisationContribution', {
    fields: ['MarketID', 'Contributions'],
    // Name_Localised est présent dans tous les exemples réels, mais rien ne le garantit
    lists: new Map([['Contributions', { fields: ['Name', 'Amount'], optional: ['Name_Localised'] }]]),
  }],
  ['ColonisationSystemClaim', { fields: ['StarSystem', 'SystemAddress'] }],
  ['ColonisationSystemClaimRelease', { fields: ['StarSystem', 'SystemAddress'] }],
  ['ColonisationBeaconDeployed', { fields: [] }],
  ['CompleteConstruction', { fields: [] }],
]);

// Pièges connus des noms de marchandises (EDCT, CommodityNameMatcher) : le journal donne d'ordinaire le symbole
// interne, ces alias ne servent que si une variante courte apparaît.
const ALIASES = new Map([
  ['hesuits', 'hazardousenvironmentsuits'],
  ['landenrichmentsystems', 'terrainenrichmentsystems'],
  ['muonimager', 'mutomimager'],
  ['microbialfurnaces', 'heliostaticfurnaces'],
]);

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v : null);
/**
 * Nom de station venu du jeu : entités HTML décodées et espaces retirées (core/text.js), mais la clé brute gardée
 * telle quelle : « $EXT_PANEL_ColonisationShip:#index=1; » doit rester reconnaissable (parseStationName). cleanText
 * l'aurait changée en mots lisibles.
 */
const stationText = (v) => (typeof v === 'string' ? decodeEntities(v).trim() : null);
/** Nom d'une marchandise : Name_Localised nettoyé, sinon le nom interne rendu lisible (core/text.js), sinon le symbole. */
const goodsName = (row, rawName, symbol) => localised(str(own(row, 'Name_Localised')), rawName) || symbol;
const bool = (v) => (typeof v === 'boolean' ? v : null);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const int = (v) => (Number.isSafeInteger(v) ? v : null);
/** MarketID : entier positif (environ 3,7e9 à 4,4e9, tient dans un Number). */
export const marketIdOf = (v) => (Number.isSafeInteger(v) && v > 0 ? v : null);
/** Horodatage ISO lisible, sinon null. */
const at = (v) => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null);

/**
 * Symbole d'une marchandise : « $CMMComposite_name; » (livraison), « $cmmcomposite_name; » (dépôt) et
 * « cmmcomposite » (Cargo.json) donnent tous « cmmcomposite », le symbole d'EDDN et d'Ardent Insight.
 */
export function symbolOf(name) {
  if (typeof name !== 'string') return null;
  let s = name.trim().toLowerCase();
  if (s.startsWith('$')) s = s.slice(1);
  if (s.endsWith('_name;')) s = s.slice(0, -'_name;'.length);
  s = s.replace(/[^a-z0-9]/g, '');
  if (!s || s.length > 60) return null;
  return ALIASES.get(s) ?? s;
}

/** Partie du nom entre « $ » et « _name; » (pour vérifier la casse), ou null. */
export function innerName(name) {
  const m = /^\$(.+)_name;$/i.exec(typeof name === 'string' ? name.trim() : '');
  return m ? m[1] : null;
}

// Noms des chantiers. Vaisseau de colonisation (port primaire) : « $EXT_PANEL_ColonisationShip; Judson Depot » ou
// « $EXT_PANEL_ColonisationShip:#index=1; » (regex d'EDMC) ; la variante « $EXT_PNL_… » n'est vue que dans un test
// (non confirmée). Autres chantiers : « Orbital Construction Site: X », « Planetary Construction Site: X » (préfixe
// confirmé par un FSSSignalDiscovered du journal de référence, 2 nov. 2026).
const SHIP_RE = /^\$EXT_(?:PANEL|PNL)_ColonisationShip(?::#index=(\d+))?;\s*(.*)$/i;
const SITE_RE = /^(Orbital|Planetary) Construction Site:\s*(.*)$/i;
const KIND_LABELS = { ship: 'Vaisseau de colonisation', orbital: 'Chantier orbital', planetary: 'Chantier planétaire' };

/**
 * Type de chantier d'après le nom de station : { kind: 'ship' | 'orbital' | 'planetary' | null, name, label }.
 * name : la partie libre du nom (« Judson Depot »), label : le nom affiché en français.
 */
export function parseStationName(station) {
  const s = typeof station === 'string' ? station.trim() : '';
  let m = SHIP_RE.exec(s);
  if (m) {
    const name = m[2].trim() || (m[1] ? `n° ${m[1]}` : '');
    return { kind: 'ship', name: name || null, label: name ? `${KIND_LABELS.ship} · ${name}` : KIND_LABELS.ship };
  }
  m = SITE_RE.exec(s);
  if (m) {
    const kind = m[1].toLowerCase() === 'orbital' ? 'orbital' : 'planetary';
    const name = m[2].trim();
    return { kind, name: name || null, label: name ? `${KIND_LABELS[kind]} · ${name}` : KIND_LABELS[kind] };
  }
  return { kind: null, name: s || null, label: s || null };
}

/**
 * Station où l'on peut livrer pour un chantier : nom de chantier ET, si le jeu donne les services, le service
 * « colonisationcontribution » (critère de SrvSurvey). Le service seul ne suffit pas : le journal de référence
 * (1er nov. 2026) le montre sur un établissement terminé, « Gibbs Hydroponics Site ».
 */
export function isConstructionStation({ station, services }) {
  if (!parseStationName(station).kind) return false;
  return services == null || services.includes('colonisationcontribution');
}

/** Ajoute à issues les champs inconnus, absents ou mal typés d'une ligne. */
function inspect(ev, schema, issues) {
  const known = new Set([...COMMON, ...schema.fields]);
  for (const k of Object.keys(ev)) if (!known.has(k)) issues.push({ kind: 'unexpected', path: k });
  for (const k of schema.fields) if (!Object.hasOwn(ev, k)) issues.push({ kind: 'missing', path: k });
  for (const [list, sub] of schema.lists || []) {
    const rows = Object.hasOwn(ev, list) ? ev[list] : undefined;
    if (rows === undefined) continue;
    if (!Array.isArray(rows)) {
      issues.push({ kind: 'type', path: list, detail: 'liste attendue' });
      continue;
    }
    const subKnown = new Set([...sub.fields, ...(sub.optional || [])]);
    rows.forEach((row) => {
      if (!isObject(row)) return issues.push({ kind: 'type', path: `${list}[]`, detail: 'objet attendu' });
      for (const k of Object.keys(row)) if (!subKnown.has(k)) issues.push({ kind: 'unexpected', path: `${list}[].${k}` });
      for (const k of sub.fields) if (!Object.hasOwn(row, k)) issues.push({ kind: 'missing', path: `${list}[].${k}` });
    });
  }
}

/** Champ lu seulement s'il est propre à l'objet (jamais hérité d'Object). */
const own = (o, k) => (isObject(o) && Object.hasOwn(o, k) ? o[k] : undefined);

/** Valeur numérique attendue : null et une note si elle est d'un autre type. */
function typed(o, k, read, issues, path = k) {
  const v = own(o, k);
  if (v === undefined) return null;
  const r = read(v);
  if (r === null && v !== null) issues.push({ kind: 'type', path, detail: typeof v });
  return r;
}

function readDepot(ev, issues) {
  const rows = Array.isArray(own(ev, 'ResourcesRequired')) ? ev.ResourcesRequired : [];
  const resources = [];
  const seen = new Set();
  for (const row of rows) {
    if (!isObject(row)) continue;
    const rawName = str(own(row, 'Name'));
    const symbol = symbolOf(rawName);
    if (!symbol) {
      issues.push({ kind: 'type', path: 'ResourcesRequired[].Name', detail: 'nom de marchandise illisible' });
      continue;
    }
    if (seen.has(symbol)) {
      issues.push({ kind: 'duplicate', path: 'ResourcesRequired[].Name', detail: symbol });
      continue;
    }
    seen.add(symbol);
    resources.push({
      symbol,
      rawName,
      name: goodsName(row, rawName, symbol),
      required: typed(row, 'RequiredAmount', int, issues, 'ResourcesRequired[].RequiredAmount'),
      provided: typed(row, 'ProvidedAmount', int, issues, 'ResourcesRequired[].ProvidedAmount'),
      payment: typed(row, 'Payment', num, issues, 'ResourcesRequired[].Payment'),
    });
  }
  const progress = typed(ev, 'ConstructionProgress', num, issues);
  return {
    type: 'depot',
    marketId: typed(ev, 'MarketID', marketIdOf, issues),
    progress: progress === null ? null : Math.min(1, Math.max(0, progress)),
    complete: typed(ev, 'ConstructionComplete', bool, issues),
    failed: typed(ev, 'ConstructionFailed', bool, issues),
    resources,
  };
}

function readContribution(ev, issues) {
  const rows = Array.isArray(own(ev, 'Contributions')) ? ev.Contributions : [];
  const items = [];
  for (const row of rows) {
    if (!isObject(row)) continue;
    const rawName = str(own(row, 'Name'));
    const symbol = symbolOf(rawName);
    const amount = typed(row, 'Amount', int, issues, 'Contributions[].Amount');
    if (!symbol || amount === null || amount <= 0) {
      issues.push({ kind: 'type', path: 'Contributions[]', detail: 'ligne illisible (nom ou quantité)' });
      continue;
    }
    // Une même marchandise deux fois dans la ligne : on additionne
    const same = items.find((i) => i.symbol === symbol);
    if (same) same.amount += amount;
    else items.push({ symbol, rawName, name: goodsName(row, rawName, symbol), amount });
  }
  return { type: 'contribution', marketId: typed(ev, 'MarketID', marketIdOf, issues), items };
}

function readSystem(type, ev, issues) {
  return { type, system: typed(ev, 'StarSystem', str, issues), systemAddress: typed(ev, 'SystemAddress', int, issues) };
}

/**
 * Événement de colonisation normalisé, ou null si la ligne n'en est pas un.
 * Formes : depot { marketId, progress, complete, failed, resources }, contribution { marketId, items },
 * claim / release { system, systemAddress }, beacon {}, complete {} ; toujours avec at (horodatage) et issues.
 */
export function readEvent(ev) {
  try {
    if (!isObject(ev) || typeof ev.event !== 'string' || !SCHEMAS.has(ev.event)) return null;
    const issues = [];
    inspect(ev, SCHEMAS.get(ev.event), issues);
    const time = at(own(ev, 'timestamp'));
    if (!time) issues.push({ kind: 'type', path: 'timestamp', detail: 'horodatage illisible' });
    let out;
    switch (ev.event) {
      case 'ColonisationConstructionDepot': out = readDepot(ev, issues); break;
      case 'ColonisationContribution': out = readContribution(ev, issues); break;
      case 'ColonisationSystemClaim': out = readSystem('claim', ev, issues); break;
      case 'ColonisationSystemClaimRelease': out = readSystem('release', ev, issues); break;
      case 'ColonisationBeaconDeployed': out = { type: 'beacon' }; break;
      default: out = { type: 'complete' }; // CompleteConstruction : vu « brièvement » (EDDiscovery), on ne s'y fie pas
    }
    return { ...out, event: ev.event, at: time, issues };
  } catch (err) {
    return { type: 'invalid', event: String(ev?.event), at: null, issues: [{ kind: 'type', path: '*', detail: err.message }] };
  }
}

/**
 * Événement de contexte normalisé, ou null : { type, at, marketId, station, stationType, system, systemAddress,
 * body, services, docked }. type : dock (Docked, Location à quai), location (Location en vol), undock, docking
 * (demande ou autorisation), drop (sortie de supercroisière sur une cible), approach (établissement), jump.
 */
export function readContext(ev) {
  try {
    if (!isObject(ev) || typeof ev.event !== 'string') return null;
    const services = Array.isArray(own(ev, 'StationServices'))
      ? ev.StationServices.filter((s) => typeof s === 'string').map((s) => s.toLowerCase())
      : null;
    const base = {
      at: at(own(ev, 'timestamp')),
      marketId: marketIdOf(own(ev, 'MarketID')),
      station: stationText(own(ev, 'StationName')),
      stationType: str(own(ev, 'StationType')),
      system: str(own(ev, 'StarSystem')),
      systemAddress: int(own(ev, 'SystemAddress')),
      body: str(own(ev, 'Body')) || str(own(ev, 'BodyName')),
      services,
    };
    switch (ev.event) {
      case 'Docked':
        return { ...base, type: 'dock', docked: true };
      case 'Location':
        return own(ev, 'Docked') === true ? { ...base, type: 'dock', docked: true } : { ...base, type: 'location', docked: false, marketId: null, station: null };
      case 'Undocked':
        return { ...base, type: 'undock', docked: false };
      case 'DockingRequested':
      case 'DockingGranted':
        return { ...base, type: 'docking' };
      case 'SupercruiseDestinationDrop':
        return { ...base, type: 'drop', station: stationText(own(ev, 'Type')) };
      case 'ApproachSettlement':
        return { ...base, type: 'approach', station: stationText(own(ev, 'Name')) };
      case 'FSDJump':
      case 'CarrierJump':
      case 'SupercruiseExit':
        return { ...base, type: 'jump', leftStation: ev.event === 'FSDJump' };
      default:
        return null;
    }
  } catch {
    return null;
  }
}
