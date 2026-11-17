// Zones denses : autour de chaque système, les planètes d'une bulle de diamètre donné.
// Dans cette bulle, toutes les planètes sont à moins d'un diamètre les unes des autres.

const distance2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;

const SECONDS_PER_JUMP = 65;

/**
 * Résumé d'un favori : planètes possibles, et distance depuis la position actuelle.
 * @param position { x, y, z } ou null @param range saut maximal du vaisseau, en AL
 */
export function summarize(planets, system, position, range) {
  const powers = {};
  for (const p of planets) if (p.power) powers[p.power] = (powers[p.power] || 0) + 1;
  const centre = planets.find((p) => p.system === system) || planets[0];
  const fromHere = centre?.x != null && position ? Math.sqrt(distance2(centre, position)) : null;
  const jumps = fromHere != null && range > 0 ? Math.ceil(fromHere / range) : null;
  return {
    planetCount: planets.length,
    planetsWithSites: planets.filter((p) => p.sites > 0).length,
    sites: planets.reduce((n, p) => n + (p.sites || 0), 0),
    powers,
    fromHere,
    jumps,
    minutes: jumps != null ? Math.round((jumps * SECONDS_PER_JUMP) / 60) : null,
  };
}

/** @param sort 'planets' ou 'sites' */
export function findClusters(bodies, { diameter = 40, sort = 'planets', limit = 10 } = {}) {
  const radius = diameter / 2;
  const cell = (v) => Math.floor(v / radius);
  const grid = new Map();
  for (const b of bodies) {
    const key = `${cell(b.x)}|${cell(b.y)}|${cell(b.z)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(b);
  }

  const near = (c) => {
    const out = [];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
      for (const b of grid.get(`${cell(c.x) + i}|${cell(c.y) + j}|${cell(c.z) + k}`) || []) {
        if (distance2(b, c) <= radius ** 2) out.push(b);
      }
    }
    return out;
  };

  const centres = [...new Map(bodies.map((b) => [b.system, b])).values()];
  const ranked = centres.map((c) => {
    const planets = near(c);
    return { centre: c, planets, sites: planets.reduce((n, b) => n + b.sites, 0) };
  }).sort((a, b) => (sort === 'sites' ? b.sites - a.sites : b.planets.length - a.planets.length) || b.planets.length - a.planets.length);

  // Une zone par région : on écarte celles qui recoupent une zone mieux classée
  const kept = [];
  for (const r of ranked) {
    if (kept.length >= limit) break;
    if (kept.some((k) => distance2(k.centre, r.centre) < diameter ** 2)) continue;
    kept.push(r);
  }

  return kept.map(({ centre, planets, sites }) => {
    const powers = {};
    for (const b of planets) if (b.power) powers[b.power] = (powers[b.power] || 0) + 1;
    return {
      system: centre.system,
      sol: centre.sol,
      planetCount: planets.length,
      systemCount: new Set(planets.map((b) => b.system)).size,
      sites,
      powers,
      planets: [...planets].sort((a, b) => b.sites - a.sites || a.arrival - b.arrival),
    };
  });
}
