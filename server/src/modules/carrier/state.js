// Sauts du vaisseau porteur, d'après le journal : saut programmé (destination, heure de départ donnée par
// le jeu), annulation, arrivée, et l'état du porteur (nom, indicatif, tritium).

export const CARRIER_EVENTS = ['CarrierStats', 'CarrierJumpRequest', 'CarrierJumpCancelled', 'CarrierJump', 'CarrierLocation'];

// Après l'heure de départ, le saut dure environ une minute : la fenêtre reste ouverte jusque-là
export const AFTER_DEPARTURE_MS = 2 * 60_000;

export class CarrierState {
  constructor() {
    this.carriers = new Map(); // CarrierID → { name, callsign, fuel }
    this.jump = null; // saut programmé : { carrierId, system, body, departure, requestedAt }
  }

  apply(ev) {
    switch (ev.event) {
      case 'CarrierStats':
        this.carriers.set(ev.CarrierID, { name: ev.Name || null, callsign: ev.Callsign || null, fuel: ev.FuelLevel ?? null });
        break;
      case 'CarrierJumpRequest':
        this.jump = {
          carrierId: ev.CarrierID,
          system: ev.SystemName,
          body: ev.Body && ev.Body !== ev.SystemName ? ev.Body : null,
          // Anciens journaux sans heure de départ : 15 min après la demande
          departure: ev.DepartureTime || new Date(Date.parse(ev.timestamp) + 15 * 60_000).toISOString(),
          requestedAt: ev.timestamp,
        };
        break;
      case 'CarrierJumpCancelled':
        if (this.jump && (!ev.CarrierID || ev.CarrierID === this.jump.carrierId)) this.jump = null;
        break;
      case 'CarrierJump': // à bord pendant le saut
      case 'CarrierLocation': {
        // Le porteur est arrivé : le saut est terminé
        const id = ev.CarrierID ?? ev.MarketID;
        const system = ev.StarSystem;
        if (this.jump && id === this.jump.carrierId && system === this.jump.system && Date.parse(ev.timestamp) >= Date.parse(this.jump.departure) - 60_000) this.jump = null;
        break;
      }
      default:
        return false;
    }
    return true;
  }

  /** Saut encore à venir ou en cours à l'heure donnée, sinon null. */
  pending(now = Date.now()) {
    if (!this.jump) return null;
    return now <= Date.parse(this.jump.departure) + AFTER_DEPARTURE_MS ? this.jump : null;
  }

  summary(now = Date.now()) {
    const jump = this.pending(now);
    return {
      jump: jump && { ...jump, carrier: this.carriers.get(jump.carrierId) || null },
    };
  }
}

export function buildCarrier(events) {
  const c = new CarrierState();
  for (const ev of events) c.apply(ev);
  return c;
}
