// État du vaisseau pour l'alerte du HUD de combat : coque, boucliers et modules sous un seuil réglable.
//
// Ce que le jeu écrit (vérifié sur 58 journaux, 23 oct. → 11 nov. 2026) :
//   - coque : en direct (HullDamage), mais par paliers d'environ 20 % (80, 60, 40, 20 %), jamais entre deux ;
//   - modules : leur état n'est que dans le récapitulatif du vaisseau (Loadout), écrit au lancement du jeu, à quai
//     (achat, rangement, changement de vaisseau), au retour à bord (SRV, à pied) et au réarmement du SRV ; jamais en
//     plein combat. On montre donc « au dernier relevé », avec son heure. Une réparation à quai (RepairAll, Repair)
//     ou par l'AFMU (AfmuRepairs) les remet à jour sans attendre le relevé suivant ;
//   - boucliers : tombés ou remontés (ShieldState), sans pourcentage.

export const VAISSEAU_EVENTS = ['Loadout', 'HullDamage', 'ShieldState', 'RepairAll', 'Repair', 'AfmuRepairs'];
export const SEUIL_DEFAUT = 40; // % (choisi par l’auteur le 11 nov. 2026)
export const SEUIL_MIN = 5;
export const SEUIL_MAX = 95;

/** Seuil valide (entier de 5 à 95 %), ou null. */
export function seuilValide(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= SEUIL_MIN && n <= SEUIL_MAX ? n : null;
}

// Modules sans intérêt pour l'alerte : apparence (peinture, décalcomanies, voix…) et blindage (c'est la coque)
const COSMETIQUE = /^(paintjob|decal|voicepack|nameplate|bobble|string_lights|weaponcustomisation|enginecustomisation|.*_shipkit)/;
const SLOTS_IGNORES = new Set(['Armour', 'PaintJob', 'VesselVoice', 'ShipName0', 'ShipName1', 'ShipID0', 'ShipID1']);

const SLOTS = {
  PowerPlant: 'Générateur',
  MainEngines: 'Propulseurs',
  FrameShiftDrive: 'FSD',
  LifeSupport: 'Support vital',
  PowerDistributor: 'Distributeur',
  Radar: 'Capteurs',
  FuelTank: 'Réservoir',
  ShipCockpit: 'Verrière',
  CargoHatch: 'Écoutille de soute',
  PlanetaryApproachSuite: 'Approche planétaire',
};
// Famille du module (nom interne sans hpt_/int_, taille ni classe) → nom affiché ; le premier préfixe qui colle gagne
const FAMILLES = [
  ['shieldgenerator', 'Générateur de boucliers'], ['shieldcellbank', 'Cellules de bouclier'], ['repairer', 'AFMU'],
  ['fighterbay', 'Hangar de chasseurs'], ['buggybay', 'Hangar SRV'], ['mkiilargebuggybay', 'Hangar SRV'],
  ['fuelscoop', 'Récupérateur de carburant'], ['cargorack', 'Soute'], ['largecargorack', 'Soute'], ['modulereinforcement', 'Renfort de modules'],
  ['hullreinforcement', 'Renfort de coque'], ['dockingcomputer', 'Ordinateur d’appontage'],
  ['supercruiseassist', 'Assistant de supercroisière'], ['multidronecontrol', 'Contrôleur de drones'],
  ['dronecontrol', 'Contrôleur de drones'], ['refinery', 'Raffinerie'], ['detailedsurfacescanner', 'Scanner de surface'],
  ['passengercabin', 'Cabine'], ['mkii_passengercabin', 'Cabine'], ['multicannon', 'Multicanon'], ['beamlaser', 'Laser à rayon'],
  ['pulselaser', 'Laser à impulsion'], ['burstlaser', 'Laser à rafale'], ['railgun', 'Canon électrique'],
  ['plasmaaccelerator', 'Accélérateur plasma'], ['slugshot', 'Canon à fragmentation'], ['cannon', 'Canon'],
  ['dumbfiremissilerack', 'Missiles'], ['basicmissilerack', 'Missiles'], ['minelauncher', 'Mines'],
  ['shieldbooster', 'Survolteur de bouclier'], ['chafflauncher', 'Paillettes'], ['heatsinklauncher', 'Dissipateur'],
  ['plasmapointdefence', 'Défense ponctuelle'], ['crimescanner', 'Scanner de primes'], ['cargoscanner', 'Scanner de soute'],
  ['cloudscanner', 'Analyseur de sillage'], ['mrascanner', 'Scanner de pulsions'], ['mining', 'Outil de minage'],
  ['guardian', 'Module guardian'], ['flakmortar', 'Mortier'],
];
const TAILLES = { Huge: 'énorme', Large: 'grand', Medium: 'moyen', Small: 'petit', Tiny: 'utilitaire' };

const cleItem = (item) => String(item || '').toLowerCase().replace(/^\$/, '').replace(/_name;$/, '');

/** Nom lisible d'un module : son emplacement pour les modules principaux, sa famille sinon, avec l'arme repérée par son point d'emport. */
export function nomModule(slot, item) {
  if (SLOTS[slot]) return SLOTS[slot];
  const famille = cleItem(item).replace(/^(hpt|int)_/, '');
  const nom = FAMILLES.find(([p]) => famille.startsWith(p))?.[1] || null;
  const emport = /^(Huge|Large|Medium|Small|Tiny)(?:Mining)?Hardpoint(\d+)$/.exec(slot || '');
  if (emport) return `${nom || 'Arme'} · ${TAILLES[emport[1]]} ${emport[2]}`;
  return nom || slot || 'Module';
}

export class EtatVaisseau {
  constructor() {
    this.nom = null;
    this.coque = null; // 0..1
    this.coqueAt = null;
    this.coqueDirect = false; // dernière valeur venue d'un HullDamage (en direct) plutôt que du relevé
    this.boucliers = null; // true / false / null (inconnu)
    this.bouclierAt = null;
    this.modules = []; // { slot, item, nom, sante }
    this.releveAt = null;
  }

  apply(ev) {
    switch (ev.event) {
      case 'Loadout':
        this.nom = (typeof ev.ShipName === 'string' && ev.ShipName.trim()) || null; // nom donné au vaisseau (vide s'il n'en a pas)
        this.coque = Number.isFinite(ev.HullHealth) ? ev.HullHealth : null;
        this.coqueAt = ev.timestamp;
        this.coqueDirect = false;
        this.modules = (Array.isArray(ev.Modules) ? ev.Modules.filter((m) => m && typeof m === 'object') : []) // une ligne abîmée (Modules qui n'est pas un tableau) ne fait pas tomber le module
          .filter((m) => Number.isFinite(m.Health) && !SLOTS_IGNORES.has(m.Slot) && !/^Decal/.test(m.Slot) && !COSMETIQUE.test(cleItem(m.Item)))
          .map((m) => ({ slot: m.Slot, item: cleItem(m.Item), nom: nomModule(m.Slot, m.Item), sante: m.Health }));
        this.releveAt = ev.timestamp;
        return true;
      case 'HullDamage':
        if (ev.PlayerPilot === false || ev.Fighter === true || !Number.isFinite(ev.Health)) return false; // chasseur, pas ton vaisseau
        this.coque = ev.Health;
        this.coqueAt = ev.timestamp;
        this.coqueDirect = true;
        return true;
      case 'ShieldState':
        this.boucliers = Boolean(ev.ShieldsUp);
        this.bouclierAt = ev.timestamp;
        return true;
      case 'RepairAll':
        this.toutReparer(ev.timestamp);
        return true;
      case 'Repair': {
        const items = (Array.isArray(ev.Items) ? ev.Items : [ev.Item]).map(cleItem).filter(Boolean);
        if (items.some((i) => i === 'all' || i === 'wear')) this.toutReparer(ev.timestamp);
        else {
          if (items.includes('hull')) this.reparerCoque(ev.timestamp);
          for (const m of this.modules) if (items.includes(m.item)) m.sante = 1;
        }
        return items.length > 0;
      }
      case 'AfmuRepairs': {
        const m = this.modules.find((x) => x.item === cleItem(ev.Module));
        if (!m || !Number.isFinite(ev.Health)) return false;
        m.sante = ev.Health;
        return true;
      }
      default:
        return false;
    }
  }

  reparerCoque(at) {
    this.coque = 1;
    this.coqueAt = at;
    this.coqueDirect = false;
  }

  toutReparer(at) {
    this.reparerCoque(at);
    for (const m of this.modules) m.sante = 1;
  }

  /** Ce que montrent le HUD et la page, pour un seuil en % : la coque et les modules sous le seuil, du plus abîmé au moins. */
  vue(seuil = SEUIL_DEFAUT) {
    const s = seuil / 100;
    const pct = (x) => Math.floor(x * 100);
    const modules = this.modules.map((m) => ({ nom: m.nom, sante: pct(m.sante) })).sort((a, b) => a.sante - b.sante || a.nom.localeCompare(b.nom));
    const sousSeuil = this.modules.filter((m) => m.sante < s).map((m) => ({ nom: m.nom, sante: pct(m.sante) })).sort((a, b) => a.sante - b.sante);
    const coqueBasse = this.coque != null && this.coque < s;
    return {
      seuil,
      nom: this.nom,
      coque: this.coque == null ? null : pct(this.coque),
      coqueAt: this.coqueAt,
      coqueDirect: this.coqueDirect,
      boucliers: this.boucliers,
      bouclierAt: this.bouclierAt,
      releveAt: this.releveAt,
      modules,
      sousSeuil,
      coqueBasse,
      alerte: coqueBasse || sousSeuil.length > 0,
    };
  }
}
