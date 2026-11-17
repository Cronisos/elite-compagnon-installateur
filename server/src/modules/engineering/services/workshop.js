// Où se fait une application (R8) et où l'atelier à distance est possible (R3, R3g).
//
// R8a (à vérifier, un cas : Muang, 5 nov.) : dans EngineerCraft, Engineer / EngineerID désigne l'AUTEUR de la
// modification en place sur le module, pas l'atelier où l'on est. L'hôte (la base où l'on est à quai) se trouve par le
// MarketID du dernier Docked, ou d'un Location à quai ; à défaut par le nom de la station et le SystemAddress (Cinder
// Dock, base de Chloe Sedesi, dont le MarketID n'est pas sûr), jamais pour un porte-vaisseaux (son nom change).

import { engineerKey } from '../../../core/reference/refdata.js';
import { normStation } from './engineerData.js';

const services = (ev) => {
  if (ev.services && typeof ev.services === 'object') return { engineer: !!ev.services.engineer, outfitting: !!ev.services.outfitting, shipyard: !!ev.services.shipyard };
  const list = Array.isArray(ev.StationServices) ? ev.StationServices : [];
  return { engineer: list.includes('engineer'), outfitting: list.includes('outfitting'), shipyard: list.includes('shipyard') };
};

/**
 * Amarrage décrit par un événement Docked, ou Location à quai (copie complète du journal ou copie réduite de placeOf) :
 * { marketId, station, stationType, system, systemAddress, taxi, multicrew, services, at } ; null sinon.
 */
export function dockOf(ev) {
  if (!ev || !(ev.event === 'Docked' || (ev.event === 'Location' && ev.Docked === true))) return null;
  return {
    marketId: Number.isSafeInteger(ev.MarketID) ? ev.MarketID : null,
    station: typeof ev.StationName === 'string' ? ev.StationName : null,
    stationType: typeof ev.StationType === 'string' ? ev.StationType : null,
    system: typeof ev.StarSystem === 'string' ? ev.StarSystem : null,
    systemAddress: Number.isSafeInteger(ev.SystemAddress) ? ev.SystemAddress : null,
    taxi: ev.Taxi === true,
    multicrew: ev.Multicrew === true,
    services: services(ev),
    at: typeof ev.timestamp === 'string' ? ev.timestamp : null,
  };
}

/** Base d'ingénieur où l'on est à quai : { id, name, by: 'marketId' | 'nom' }, ou null (R8b). */
export function hostOf(dock, idx) {
  if (!dock || !idx) return null;
  const byMarket = dock.marketId != null ? idx.byMarketId.get(dock.marketId) : null;
  if (byMarket) return { id: byMarket.id, name: byMarket.name, by: 'marketId' };
  if (dock.stationType === 'FleetCarrier' || !dock.station || dock.systemAddress == null) return null;
  const byName = idx.byStation.get(`${dock.systemAddress}|${normStation(dock.station)}`);
  return byName ? { id: byName.id, name: byName.name, by: 'nom' } : null;
}

/** Identifiant de l'auteur d'une application : EngineerID s'il est connu, sinon son nom. */
export function authorIdOf(ev, idx) {
  if (!idx) return null;
  if (Number.isInteger(ev?.EngineerID) && idx.byId.has(ev.EngineerID)) return ev.EngineerID;
  return idx.byName.get(engineerKey(ev?.Engineer))?.id ?? null;
}

/**
 * L'atelier à distance est-il possible ici (R3a, R3b, R3g) ? À quai dans son vaisseau (ni taxi, ni équipage), dans une
 * station qui a le service « engineer » ou un porte-vaisseaux, pas une installation au sol, pas la base d'un ingénieur
 * (jamais vu : on ne le promet pas). À pied : possible, mais il faut remonter à bord (onFoot le dit).
 * @returns {{ ok: boolean, why: null|'pas à quai'|'taxi'|'équipage'|'installation au sol'|'base d’ingénieur'|'pas de service', onFoot: boolean, station: string|null }}
 */
export function remoteWorkshopHere(dock, idx, { onFoot = false } = {}) {
  const out = (ok, why) => ({ ok, why, onFoot: !!onFoot && ok, station: dock?.station ?? null });
  if (!dock) return out(false, 'pas à quai');
  if (dock.taxi) return out(false, 'taxi');
  if (dock.multicrew) return out(false, 'équipage');
  if (dock.stationType === 'SurfaceStation') return out(false, 'installation au sol');
  if (hostOf(dock, idx)) return out(false, 'base d’ingénieur');
  if (!(dock.services?.engineer || dock.stationType === 'FleetCarrier')) return out(false, 'pas de service');
  return out(true, null);
}

/**
 * Lieu d'une application (R8b) : 'atelier' (chez son auteur), 'distance' (à quai ailleurs, sans effet), 'effet' (effet
 * expérimental posé dans une base reconnue), 'effet hors atelier' (effet hors d'une base reconnue : anomalie),
 * 'inconnu' (pas à quai, ou auteur inconnu).
 * @returns {{ kind: string, hostId: number|null, hostBy: string|null, authorId: number|null }}
 */
export function craftPlace(ev, dock, idx) {
  const authorId = authorIdOf(ev, idx);
  const host = dock ? hostOf(dock, idx) : null;
  const base = { hostId: host?.id ?? null, hostBy: host?.by ?? null, authorId };
  if (ev?.ApplyExperimentalEffect) return { kind: host ? 'effet' : 'effet hors atelier', ...base };
  if (!dock || authorId == null) return { kind: 'inconnu', ...base };
  return { kind: host?.id === authorId ? 'atelier' : 'distance', ...base };
}
