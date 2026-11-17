// Recherche d'équipement d'Inara : l'adresse de la recherche porte les numéros Inara des modules (pa3[]) et le
// système de départ (ps1). Inara bloque la lecture automatique de sa page : la liste nom → numéro vient de la page
// enregistrée une fois par l'utilisateur (Ctrl+S), puis gardée dans data/inara-modules.json.

const SEARCH = 'https://inara.cz/elite/nearest-outfitting/';
const MOUNTS = { F: 'Fixe', G: 'Gimbal', T: 'Tourelle' }; // tel qu'Inara les écrit en français

// Noms EDSY écrits autrement par Inara
const RENAMED = {
  'Anti-Corrosion Cargo Rack': 'Corrosion Resistant Cargo Rack',
  'Meta Alloy Hull Reinforcement Package': 'Meta Alloy Hull Reinforcement',
  'Guardian Frame Shift Drive Booster': 'Guardian FSD Booster',
  'Guardian Hull Reinforcement Package': 'Guardian Hull Reinforcement',
  'Guardian Module Reinforcement Package': 'Guardian Module Reinforcement',
  'Guardian Shield Reinforcement Package': 'Guardian Shield Reinforcement',
  'Guardian Hybrid Power Plant': 'Guardian Power Plant',
  'Mining Multi-Limpet Controller': 'Mining Multi Limpet Controller',
  'Mk II Mining Multi-Limpet Controller': 'Mk II Mining Multi Limpet Controller',
  'Universal Multi-Limpet Controller': 'Universal Multi Limpet Controller',
  'Standard Docking Computer': 'Docking Computer',
  'Mk II Plasma Shock Accelerator': 'Mk II Shock Plasma Accelerator',
  'Mk II Supercharge Optimised FSD (SCO)': 'Mk II Supercharge Optimised Frame Shift Drive (SCO)',
  'Pulse Disruptor Laser': 'Pulse Disruptor',
  'Thargoid Pulse Neutraliser': 'TG Pulse Neutraliser',
};
const SHIPS = { Sidewinder: 'Sidewinder Mk I', Eagle: 'Eagle Mk II' }; // noms EDSY → noms Inara (blindages)
const NO_MOUNT =new Set(['Point Defence']); // tourelle pour EDSY, sans monture chez Inara

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'" };
const decode = (s) => s.replace(/&(amp|lt|gt|quot|#39|apos);/g, (_, e) => ENTITIES[e]);
// Inara écrit tantôt « MkII », tantôt « Mk II »
const key = (s) => s.toLowerCase().replace(/\s+/g, ' ').replace(/\bmkii\b/g, 'mk ii').trim();

/** Liste de la page Inara enregistrée : { nom en minuscules: numéro } pour les modules, { 'ship:nom': 'xship…' } pour les vaisseaux. */
export function parseInaraPage(html) {
  // Répétitions bornées : une page mal formée (« <option value="1" » sans « > », des Mo de texte) se lit en temps
  // linéaire. Avant, chaque essai relisait toute la suite de la page : plusieurs minutes de serveur bloqué pour 4 Mo.
  // Objet sans prototype : un nom de module « __proto__ » venu de la page reste une simple clé.
  const out = Object.create(null);
  for (const m of String(html).matchAll(/<option value="(xship\d{1,6}|\d{1,9})"[^>]{0,200}>([^<]{1,200})<\/option>/g)) {
    const name = key(decode(m[2]));
    if (m[1].startsWith('xship')) out[`ship:${name}`] = m[1];
    else out[name] = Number(m[1]);
  }
  return Object.fromEntries(Object.entries(out)); // objet ordinaire, chaque clé propre (jamais le prototype)
}

/**
 * Nom d'un module dans la liste d'Inara, à partir du module EDSY : « 6E Cargo Rack », « 3C Beam Laser [Gimbal] ».
 * Le blindage n'a ni classe ni note mais le nom du vaisseau : « Lightweight Alloy - Python ».
 */
export function inaraName(m, { armour = false, ship = '' } = {}) {
  let name = String(m.name).replace(/\s*\(Cap: \d+\)/, ''); // capacité ajoutée par EDSY aux soutes
  name = RENAMED[name] || name;
  if (armour) return `${name} - ${SHIPS[ship] || ship}`;
  const mount = m.mount && !NO_MOUNT.has(name) ? ` [${MOUNTS[m.mount] || m.mount}]` : '';
  return `${m.class ?? ''}${m.rating ?? ''} ${name}${mount}`.trim();
}

/**
 * Adresse de la recherche Inara pour un vaisseau (nom EDSY, en tête) et ses modules : numéros trouvés (sans doublon,
 * 50 au plus comme le formulaire), noms absents de la liste à part.
 */
export function inaraSearch(names, ids, system, ship = null) {
  const found = [];
  const missing = [];
  // Clé propre seulement : « constructor » ou « toString » ne sont pas des numéros de module
  const idOf = (k) => (ids && Object.hasOwn(ids, k) ? ids[k] : null);
  if (ship) {
    const id = idOf(`ship:${key(SHIPS[ship] || ship)}`);
    if (id != null) found.push(id);
    else missing.push(ship);
  }
  for (const n of new Set(names)) {
    const id = idOf(key(n));
    if (id != null) found.push(id);
    else missing.push(n);
  }
  const q = new URLSearchParams({ formbrief: '1' });
  for (const id of [...new Set(found)].slice(0, 50)) q.append('pa3[]', String(id));
  if (system) q.set('ps1', system);
  for (const p of ['pi18', 'pi19', 'pi17', 'pi14']) q.set(p, '0'); // filtres du formulaire, laissés à leur valeur par défaut
  return { url: `${SEARCH}?${q}`, found: found.length, missing };
}
