// Aperçu de tous les vaisseaux du jeu (Builds → Tous les vaisseaux) : de quoi choisir un vaisseau avant d'en faire
// un build, sans l'avoir. Tout vient des données EDSY (eddb.js) et du calcul des statistiques du constructeur :
//   - taille (pad), prix, vitesse, maniabilité, bouclier et coque de base, équipage, masse ;
//   - points d'emport par taille, utilitaires, classe du réacteur FSD, compartiments internes et militaires ;
//   - soute maximale : la plus grande soute permise dans chaque compartiment interne (Mk II comprise là où le jeu
//     l'accepte) ;
//   - saut d'origine : le vaisseau tel que vendu, plein fait, soute vide ;
//   - saut max : configuration d'exploration, la même pour tous pour qu'ils se comparent. Le meilleur réacteur FSD
//     (normal ou SCO) en Increased Range G5 avec Mass Manager, le plus gros booster gardien, les autres modules de
//     base en D de la taille de l'emplacement, le blindage et le réservoir d'origine, sans armes ni internes. Pas
//     d'ingénierie de poids sur les autres modules : les explorateurs gagnent encore quelques AL au-delà.
// Calculé une fois par version des données de référence (index.js le garde en mémoire).
//
// Rapidité (le calcul bloque le serveur le temps qu'il dure) : pendant un calcul, la fiche de chaque module sur chaque
// coque et la liste des modules permis à chaque emplacement ne sont faites qu'une fois (contexte()), et les modules
// d'un type que l'emplacement n'admet pas, ou trop grands, sont écartés avant moduleAllowed (mêmes tests, plus tôt).
// Le contexte est jeté après le calcul : rien de plus en mémoire. Avant : environ 0,6 s ; après : environ 0,15 s.

import { moduleAllowed, moduleOf, stockBuild } from '../../core/reference/edsyBuild.js';
import { computeStats } from './stats.js';
import { frenchName } from './names.js';

const FSD = 3;
const GARDES = new Set([0, 7]); // blindage et réservoir : ceux d'origine
const r2 = (n) => Math.round(n * 100) / 100;

/** Caches d'un calcul : par coque, ses modules candidats et leurs fiches ; modules permis par emplacement. */
function contexte(eddb) {
  return { eddb, communs: Object.keys(eddb.module).map(Number), coques: new Map(), permis: new Map() };
}

/**
 * Modules candidats d'une coque (communs puis propres à la coque, dans cet ordre, sans doublon) avec leur fiche
 * (moduleOf), faits une fois par calcul. Les fiches sont lues seulement, jamais modifiées.
 */
function coque(c, shipId) {
  let k = c.coques.get(shipId);
  if (k) return k;
  const ship = c.eddb.ship[shipId];
  const fiches = new Map();
  for (const id of [...c.communs, ...Object.keys(ship.module || {}).map(Number)]) {
    if (!fiches.has(id)) fiches.set(id, moduleOf(c.eddb, ship, id));
  }
  k = { fiches, liste: [...fiches].map(([id, m]) => ({ id, m })) };
  c.coques.set(shipId, k);
  return k;
}

const fiche = (c, shipId, id) => coque(c, shipId).fiches.get(id) ?? moduleOf(c.eddb, c.eddb.ship[shipId], id);

/** Modules permis à un emplacement (identifiants), comme moduleAllowed, calculés une fois par calcul. */
function permis(c, shipId, group, index) {
  const cle = `${shipId}|${group}|${index}`;
  let liste = c.permis.get(cle);
  if (liste) return liste;
  const { eddb } = c;
  const ship = eddb.ship[shipId];
  // Premiers tests de moduleAllowed, sur la fiche déjà faite : type admis par l'emplacement, taille
  const admis = group === 'component' ? eddb.group.component[index]?.mtypes : eddb.group[group]?.mtypes;
  const taille = ship.slots[group]?.[index];
  liste = [];
  if (admis) {
    for (const { id, m } of coque(c, shipId).liste) {
      if (m && admis[m.mtype] && !(m.class > taille) && moduleAllowed(eddb, shipId, group, index, id)) liste.push(id);
    }
  }
  c.permis.set(cle, liste);
  return liste;
}

/** Module de base « D » de la taille de l'emplacement (le plus léger à défaut). */
function baseLegere(c, shipId, index) {
  const ship = c.eddb.ship[shipId];
  const size = ship.slots.component[index];
  const cands = permis(c, shipId, 'component', index).map((id) => ({ id, m: fiche(c, shipId, id) })).filter((x) => x.m);
  const exacts = cands.filter((x) => x.m.class === size);
  const d = exacts.filter((x) => x.m.rating === 'D').sort((a, b) => a.m.mass - b.m.mass || a.id - b.id)[0];
  if (d) return d.id;
  return cands.sort((a, b) => a.m.mass - b.m.mass || a.id - b.id)[0]?.id ?? null;
}

const vide = (build) => ({
  ...build,
  slots: Object.fromEntries(Object.entries(build.slots).map(([g, row]) => [g, row.map(() => null)])),
});

/** Saut max, configuration d'exploration (voir l'en-tête). */
function sautMax(c, shipId) {
  const { eddb } = c;
  const ship = eddb.ship[shipId];
  const origine = stockBuild(eddb, shipId);
  const b = vide(origine);
  for (let i = 0; i < ship.slots.component.length; i++) {
    if (i === FSD) continue;
    if (GARDES.has(i)) b.slots.component[i] = origine.slots.component[i];
    else {
      const id = baseLegere(c, shipId, i);
      b.slots.component[i] = id ? { modid: id, bpid: null, grade: 0, expid: null } : origine.slots.component[i];
    }
  }
  // Le plus gros booster gardien, dans le plus petit compartiment qui l'accepte
  let booster = null;
  ship.slots.internal.forEach((_, i) => {
    for (const id of permis(c, shipId, 'internal', i)) {
      const m = fiche(c, shipId, id);
      if (!m?.jumpbst) continue;
      const mieux = !booster || m.jumpbst > booster.m.jumpbst || (m.jumpbst === booster.m.jumpbst && ship.slots.internal[i] < ship.slots.internal[booster.i]);
      if (mieux) booster = { id, m, i };
    }
  });
  if (booster) b.slots.internal[booster.i] = { modid: booster.id, bpid: null, grade: 0, expid: null };
  // Le meilleur réacteur FSD permis, ingénié
  let best = null;
  for (const id of permis(c, shipId, 'component', FSD)) {
    const m = fiche(c, shipId, id);
    const famille = eddb.mtype[m?.mtype] || {};
    const bp = (famille.blueprints || []).includes('cfsd_ir') ? 'cfsd_ir' : null;
    const exp = (famille.expeffects || []).includes('cfsdx_mm') ? 'cfsdx_mm' : null;
    b.slots.component[FSD] = { modid: id, bpid: bp, grade: bp ? 5 : 0, expid: exp };
    let saut = 0;
    try {
      saut = computeStats(eddb, b).jump.unladen || 0;
    } catch {
      saut = 0;
    }
    if (!best || saut > best.saut) best = { saut, id };
  }
  return best ? r2(best.saut) : null;
}

/** Soute maximale : la plus grande soute permise dans chaque compartiment interne et militaire. */
function souteMax(c, shipId) {
  const ship = c.eddb.ship[shipId];
  let total = 0;
  for (const g of ['internal', 'military']) {
    (ship.slots[g] || []).forEach((_, i) => {
      let cap = 0;
      for (const id of permis(c, shipId, g, i)) {
        const m = fiche(c, shipId, id);
        if (m?.mtype === 'icr' && (m.cargocap || 0) > cap) cap = m.cargocap;
      }
      total += cap;
    });
  }
  return total;
}

/**
 * Ce que le vaisseau peut embarquer, d'après les modules que le jeu accepte dans ses compartiments : SRV et Rhino
 * (hangar « Large », le seul qui le porte), chasseurs, soute Mk II, contrôleur multi-drones de minage Mk II,
 * passagers et cabines de luxe, hangars Mk II ; et ses modules exclusifs (réservés à ce seul vaisseau ou à quelques-uns).
 * Les clés de `capacites` sont celles des cases à cocher de la page (ApercuVaisseaux.jsx).
 */
function capacitesDe(c, shipId) {
  const ship = c.eddb.ship[shipId];
  const mods = new Map();
  for (const g of ['hardpoint', 'utility', 'component', 'military', 'internal']) {
    (ship.slots[g] || []).forEach((_, i) => {
      for (const id of permis(c, shipId, g, i)) if (!mods.has(id)) mods.set(id, fiche(c, shipId, id));
    });
  }
  const liste = [...mods.values()].filter(Boolean);
  const a = (mtype, nom = null) => liste.filter((m) => m.mtype === mtype && (!nom || nom.test(m.name || '')));
  const vehicules = (l) => Math.max(0, ...l.map((m) => m.vslots || 0));
  const srv = a('ipvh');
  const rhino = a('ipvh', /Large/);
  const capacites = {
    srv: srv.length > 0,
    rhino: rhino.length > 0,
    vehiculesMk2: a('ipvh', /Mk II/).length > 0,
    chasseurs: a('ifh').length > 0,
    chasseursMk2: a('ifh', /Mk II/).length > 0,
    souteMk2: a('icr', /Mk II/).length > 0,
    droneMinageMk2: a('imlc', /Mk II/).length > 0,
    passagers: a('ipc').length > 0,
    luxe: a('ipc', /Luxury/).length > 0,
    militaires: (ship.slots.military || []).length > 0,
  };
  // Modules réservés à ce vaisseau (ou à quelques-uns), hors blindage : noms en français, sans classe
  const exclusifs = [...new Set(liste.filter((m) => m.reserved?.[shipId] && m.mtype !== 'cbh' && Object.keys(m.reserved).length <= 4)
    .map((m) => frenchName(m)))].sort((x, y) => x.localeCompare(y, 'fr'));
  return { capacites, srvMax: vehicules(srv), rhinoMax: vehicules(rhino), exclusifs };
}

/** Fiche d'aperçu d'un vaisseau ; `c` : caches du calcul en cours (apercuVaisseaux), sinon les siens. */
export function apercuVaisseau(eddb, shipId, c = contexte(eddb)) {
  const ship = eddb.ship[shipId];
  if (!ship) return null;
  const emport = { 4: 0, 3: 0, 2: 0, 1: 0 };
  for (const s of ship.slots.hardpoint || []) if (emport[s] != null) emport[s]++;
  let sautOrigine = null;
  try {
    sautOrigine = r2(computeStats(eddb, stockBuild(eddb, shipId)).jump.unladen || 0);
  } catch {
    sautOrigine = null;
  }
  return {
    id: Number(shipId),
    name: ship.name,
    pad: ship.class, // 1 petit, 2 moyen, 3 grand
    prix: ship.retail || ship.cost || null,
    vitesse: ship.topspd ?? null,
    boost: ship.bstspd ?? null,
    maniabilite: ship.mnv ?? null, // 1 à 5 dans EDSY
    bouclier: ship.shields ?? null,
    coque: ship.armour ?? null,
    masse: ship.mass ?? null,
    equipage: ship.crew ?? null,
    emport,
    utilitaires: (ship.slots.utility || []).length,
    fsd: ship.slots.component?.[FSD] ?? null,
    generateur: ship.slots.component?.[1] ?? null,
    internes: [...(ship.slots.internal || [])].sort((a, b) => b - a),
    militaires: [...(ship.slots.military || [])].sort((a, b) => b - a),
    souteMax: souteMax(c, shipId),
    sautOrigine,
    sautMax: sautMax(c, shipId),
    ...capacitesDe(c, shipId),
  };
}

/** Tous les vaisseaux, par nom. */
export function apercuVaisseaux(eddb) {
  const c = contexte(eddb);
  return Object.keys(eddb.ship)
    .map((id) => apercuVaisseau(eddb, Number(id), c))
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}
