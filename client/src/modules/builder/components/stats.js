// Indicateurs affichés pour un build, dans l'éditeur et dans la comparaison.
// better : 'up' si une valeur plus haute est meilleure, 'down' si plus basse.

import { dec1, dec2, int } from '../../../core/format.js';

const res = (r) => (r ? `${int(r.kin)} / ${int(r.thm)} / ${int(r.exp)} %` : '—');

export const STAT_ROWS = [
  { key: 'jumpMax', label: 'Saut maximal', unit: 'al', get: (s) => s.jump.max, fmt: dec2, better: 'up' },
  { key: 'jumpUnladen', label: 'Saut à vide, plein fait', unit: 'al', get: (s) => s.jump.unladen, fmt: dec2, better: 'up' },
  { key: 'jumpLaden', label: 'Saut soute pleine', unit: 'al', get: (s) => s.jump.laden, fmt: dec2, better: 'up' },
  { key: 'shields', label: 'Boucliers', unit: 'MJ', get: (s) => s.shields, fmt: int, better: 'up' },
  { key: 'shieldRes', label: 'Résist. boucliers (cin./therm./expl.)', get: (s) => s.shieldRes, fmt: res, text: true },
  { key: 'armour', label: 'Coque', unit: 'pts', get: (s) => s.armour, fmt: int, better: 'up' },
  { key: 'armourRes', label: 'Résist. coque (cin./therm./expl.)', get: (s) => s.armourRes, fmt: res, text: true },
  { key: 'shieldsCells', label: 'Boucliers + cellules', unit: 'MJ', get: (s) => s.shield?.withCells ?? 0, fmt: int, better: 'up' },
  { key: 'shieldFull', label: 'Boucliers de 0 à 100 %', unit: 's', get: (s) => s.shield?.full ?? null, fmt: int, better: 'down' },
  { key: 'dps', label: 'DPS soutenu', get: (s) => s.dps, fmt: dec1, better: 'up' },
  { key: 'dpsBurst', label: 'DPS en rafale', get: (s) => s.armament?.burst, fmt: dec1, better: 'up' },
  { key: 'jumpRange', label: "Portée totale d'un plein", unit: 'al', get: (s) => s.jump.range, fmt: dec1, better: 'up' },
  { key: 'speed', label: 'Vitesse', unit: 'm/s', get: (s) => s.speed, fmt: int, better: 'up' },
  { key: 'boost', label: 'Boost', unit: 'm/s', get: (s) => s.boost, fmt: int, better: 'up' },
  { key: 'cargo', label: 'Soute', unit: 't', get: (s) => s.cargo, fmt: int, better: 'up' },
  { key: 'fuel', label: 'Carburant', unit: 't', get: (s) => s.fuel, fmt: int, better: 'up' },
  { key: 'mass', label: 'Masse à vide', unit: 't', get: (s) => s.mass.unladen, fmt: dec1, better: 'down' },
  { key: 'powerDeployed', label: 'Énergie, armes sorties', unit: 'MW', get: (s) => s.power.deployed, fmt: dec2, better: 'down' },
  { key: 'powerCap', label: 'Énergie disponible', unit: 'MW', get: (s) => s.power.capacity, fmt: dec2, better: 'up' },
  { key: 'heatPP', label: 'Chaleur du générateur', unit: '/s', get: (s) => s.heat.powerPlant, fmt: dec1, better: 'down' },
  { key: 'heatWeapons', label: 'Chaleur des armes en tir', unit: '/s', get: (s) => s.heat.weapons, fmt: dec1, better: 'down' },
  { key: 'cost', label: 'Prix', unit: 'cr', get: (s) => s.cost?.total, fmt: int, better: 'down' },
  { key: 'rebuy', label: 'Rachat', unit: 'cr', get: (s) => s.cost?.rebuy, fmt: int, better: 'down' },
];

/** 'good' | 'bad' | '' : B comparé à A. */
export function compareTone(row, a, b) {
  if (row.text || a == null || b == null) return '';
  if (Math.abs(b - a) < 1e-6 * Math.max(1, Math.abs(a))) return '';
  const up = b > a;
  return (row.better === 'up') === up ? 'good' : 'bad';
}
