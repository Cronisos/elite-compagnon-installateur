import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MARGE_SUIVI, coveredBits, isoDate, planSweep, project, routeLength, Sweep, SECTORS, SCAN } from './sweep.js';

// Les tests de géométrie posent une marge de conduite nulle (new Sweep(3000, 0)) ; la vraie marge a son propre test.

const RP = 1_000_000; // rayon de la planète (m)
const BODY = 'Synuefe OU-E c28-2 4';
// Position à (x, y) mètres du centre (0, 0), x vers l'est, y vers le nord
const at = (x, y, vehicle = 'srv', heading = 0) => ({
  body: BODY, system: 'Synuefe OU-E c28-2', planetRadius: RP, vehicle, heading,
  latitude: (y / RP) * (180 / Math.PI),
  longitude: (x / RP) * (180 / Math.PI),
});
const polar = (r, deg, vehicle) => at(r * Math.sin((deg * Math.PI) / 180), r * Math.cos((deg * Math.PI) / 180), vehicle);
const drive = (s, r, from, to, step = 2) => {
  for (let a = from; from <= to ? a <= to : a >= to; a += from <= to ? step : -step) s.move(polar(r, a));
};

test('plan : cercles au bord − portée, tous les deux portées, puis le centre s’il reste un petit disque', () => {
  assert.deepEqual(planSweep(10000, 3000, 0).map((s) => [s.kind, s.radius]), [['ring', 7000], ['ring', 1000]]);
  assert.deepEqual(planSweep(8000, 3000, 0).map((s) => [s.kind, s.radius, s.outer]), [['ring', 5000, 8000], ['center', 0, 2000]]);
  assert.deepEqual(planSweep(2500, 3000, 0).map((s) => s.kind), ['center']);
  assert.equal(Math.round(routeLength(10000, planSweep(10000, 3000, 0))), Math.round(2 * Math.PI * 8000 + 9000));
});

test('projection à plat : distance et cap depuis le centre', () => {
  const p = project(at(0, 0), at(3000, 0), RP);
  assert.ok(Math.abs(p.d - 3000) < 1);
  assert.ok(Math.abs(p.theta - 90) < 0.01);
  assert.ok(Math.abs(p.x - 3000) < 1 && Math.abs(p.y) < 1);
});

test('centre puis bord : le rayon, le plan, et le trajet du centre au bord déjà balayé', () => {
  const s = new Sweep(3000, 0);
  assert.throws(() => s.setEdge(at(9000, 0)), /centre/);
  s.setCenter(at(0, 0));
  assert.equal(s.state, 'center');
  for (let y = 0; y <= 9000; y += 200) s.move(at(0, y));
  assert.throws(() => s.setEdge(at(0, 100)), /bord/);
  s.setEdge(at(0, 9000));
  const v = s.view(at(0, 9000));
  assert.equal(v.state, 'ready');
  assert.ok(Math.abs(v.radius - 9000) < 1);
  assert.deepEqual(v.steps.map((x) => x.kind), ['ring', 'center']);
  assert.ok(v.covered > 0.05, 'la bande nord est déjà vue');
  assert.ok(v.steps[0].sectors[0] === 1 && v.steps[0].sectors[18] === 0);
});

test('le tour : quart, moitié, tour complet, puis le centre ; seul le SRV balaie', () => {
  const s = new Sweep(3000, 0);
  s.setCenter(at(0, 0));
  s.setEdge(at(0, 9000));
  const ring = () => s.view(polar(6000, 0)).steps[0];
  drive(s, 6000, 0, 90, 2);
  assert.ok(Math.abs(ring().progress - 0.25) < 0.06, `quart : ${ring().progress}`);
  drive(s, 6000, 90, 180, 2);
  assert.ok(Math.abs(ring().progress - 0.5) < 0.06);
  for (let a = 180; a <= 360; a += 2) s.move(polar(6000, a, 'ship'));
  assert.ok(ring().progress < 0.6, 'en vaisseau, rien ne compte');
  drive(s, 6000, 180, 360, 2);
  assert.equal(ring().done, true);
  let v = s.view(polar(6000, 0));
  assert.equal(v.current, 1);
  assert.equal(v.guide.kind, 'center');
  for (let r = 6000; r >= 0; r -= 200) s.move(polar(r, 0));
  v = s.view(at(0, 0));
  assert.equal(v.done, true);
  assert.ok(v.covered > 0.97);
});

test('guidage : écart avec le cercle et sens du tour', () => {
  const s = new Sweep(3000, 0);
  s.setCenter(at(0, 0));
  s.setEdge(at(0, 10000));
  let g = s.view(polar(6500, 0)).guide;
  // 500 m trop au centre
  assert.ok(Math.abs(g.offset + 500) < 1 && !g.onRing);
  assert.ok(g.bearing > 0 && g.bearing < 90, 'devant et vers l’extérieur, sens horaire par défaut');
  drive(s, 7000, 40, 10, 2); // tour à l'envers
  g = s.view(polar(7000, 10)).guide;
  assert.equal(s.direction, -1);
  assert.ok(Math.abs(g.offset) < 1, 'sur le cercle');
  assert.ok(g.bearing > 270, 'vers l’ouest');
});

test('sauvegarde : couverture, sens et trajet retrouvés', () => {
  const s = new Sweep(3000, 0);
  s.setCenter(at(0, 0));
  s.setEdge(at(0, 9000));
  drive(s, 6000, 0, 120, 2);
  const back = Sweep.fromJSON(JSON.parse(JSON.stringify(s)), 3000, 0);
  const a = s.view(polar(6000, 120));
  const b = back.view(polar(6000, 120));
  assert.deepEqual(b.steps.map((x) => x.sectors), a.steps.map((x) => x.sectors));
  assert.equal(b.covered, a.covered);
  assert.equal(b.steps[0].sectors.length, SECTORS);
  const half = new Sweep(3000, 0);
  half.setCenter(at(0, 0));
  half.move(at(0, 500));
  assert.deepEqual(Sweep.fromJSON(JSON.parse(JSON.stringify(half)), 3000, 0).trail.length, 1);
});

test('dernier cercle avec marge : tout rayon qui voit le bord et le centre convient', () => {
  // EEP de 4,46 km : un cercle entre 1,46 km et 3 km voit tout le disque
  const [ring] = planSweep(4460, 3000, 0);
  assert.ok(Math.abs(ring.min - 1460) < 1 && ring.max === 3000);
  assert.deepEqual(planSweep(10000, 3000, 0).map((x) => [x.min, x.max]), [[7000, 7000], [1000, 3000]]);
  const s = new Sweep(3000, 0);
  s.setCenter(at(0, 0));
  s.setEdge(at(0, 4460));
  let g = s.view(polar(2600, 0)).guide;
  assert.ok(g.onRing && g.inBand, 'à 2,6 km : tout est vu, c’est bon');
  assert.ok(Math.abs(g.radius - 1460) < 1 && Math.abs(g.offset - 1140) < 1, 'le cercle le plus court reste affiché');
  g = s.view(polar(3800, 0)).guide;
  assert.ok(!g.onRing && Math.abs(g.offset - 2340) < 1, 'à 3,8 km : trop loin, retour vers le cercle');
  g = s.view(polar(1000, 0)).guide;
  assert.ok(!g.onRing && Math.abs(g.offset + 460) < 1, 'à 1 km : 460 m trop près');
  // Un tour à 2,6 km balaie tout
  drive(s, 2600, 0, 360, 2);
  assert.equal(s.view(polar(2600, 0)).done, true);
});

test('portée mesurée de 1,5 km et marge de conduite de 300 m : un cercle tous les 2,4 km', () => {
  assert.equal(SCAN, 1500);
  assert.equal(MARGE_SUIVI, 300);
  // Sans marge, un tour à 1,5 km suffisait pour 3 km ; avec, le tour à 1,8 km laisse 600 m au centre
  assert.deepEqual(planSweep(3000).map((x) => [x.kind, x.radius]), [['ring', 1800], ['center', 0]]);
  // 2,5 km : il ne reste que 100 m au centre, dans la marge : pas de passage au centre
  assert.deepEqual(planSweep(2500).map((x) => [x.kind, x.radius]), [['ring', 1300]]);
  // EEP de 4,46 km : 3,26 km (voit de 2,06 à 4,46 km même à 300 m du pointillé), puis un dernier cercle de 860 m à 1,2 km
  assert.deepEqual(planSweep(4460).map((x) => [x.kind, x.min, x.max]), [['ring', 3260, 3260], ['ring', 860, 1200]]);
  assert.deepEqual(planSweep(6000).map((x) => [x.kind, x.radius]), [['ring', 4800], ['ring', 2400], ['center', 0]]);
  // Un balayage gardé à 3 km reprend la portée actuelle
  const old = new Sweep(3000, 0);
  old.setCenter(at(0, 0));
  old.setEdge(at(0, 4460));
  assert.equal(Sweep.fromJSON(JSON.parse(JSON.stringify(old))).scan, 1500);
});

test('repères sur la carte : ceux de la planète, dans le disque ou juste au bord', () => {
  const s = new Sweep();
  s.setCenter(at(0, 0));
  s.setEdge(at(0, 4000));
  const marks = [
    { id: 1, label: 'Bon spot', category: 'mining', ore: 'Iridium', drills: 3, ...at(1000, 0) },
    { id: 2, label: 'Fin du dernier minage', auto: true, depletedAt: null, ...at(0, -4500) },
    { id: 3, label: 'Trop loin', ...at(0, 6000) },
    { id: 4, label: 'Autre planète', ...at(100, 0), body: 'Ailleurs 1' },
    { id: 5, label: 'Sans position', body: BODY, latitude: null, longitude: null },
  ];
  const v = s.view(at(0, 0), marks);
  assert.deepEqual(v.marks.map((m) => m.id), [1, 2]);
  assert.ok(Math.abs(v.marks[0].x - 1000) < 1 && Math.abs(v.marks[0].y) < 1);
  assert.equal(v.marks[1].auto, true);
  assert.equal(v.marks[0].ore, 'Iridium');
  assert.equal(v.marks[0].drills, 3);
  assert.equal(v.marks[1].drills, null);
});

test('marge de conduite : à 250 m du pointillé, d’un côté ou de l’autre, les tranches s’allument quand même', () => {
  for (const ecart of [-250, 250]) {
    const s = new Sweep();
    s.setCenter(at(0, 0));
    s.setEdge(at(0, 4631));
    const [ring] = s.view(at(0, 4631)).steps;
    assert.ok(s.view(polar(ring.radius + ecart, 0)).guide.near, 'sur la route (« Sur le cercle ✓ »)');
    drive(s, ring.radius + ecart, 0, 360, 2);
    const v = s.view(polar(ring.radius + ecart, 0));
    assert.equal(v.steps[0].done, true, `à ${ecart} m du cercle`);
    assert.equal(v.marge, 300);
  }
  // Hors de la route : la tranche reste à faire
  const s = new Sweep();
  s.setCenter(at(0, 0));
  s.setEdge(at(0, 4631));
  const [ring] = s.view(at(0, 4631)).steps;
  drive(s, ring.radius - 700, 0, 360, 2);
  assert.equal(s.view(polar(ring.radius - 700, 0)).steps[0].done, false);
});

test('relecture sans confiance : zone balayée de la taille exacte de la grille, ou rien ; date ISO ou rien', () => {
  const s = new Sweep(3000, 0);
  s.setCenter(at(0, 0));
  s.setEdge(at(0, 4000));
  drive(s, 2000, 0, 90, 2);
  const data = JSON.parse(JSON.stringify(s));
  assert.ok(coveredBits(data.covered, data.radius) instanceof Uint8Array);
  // Champ piégé (un objet { length: 4e9 } faisait remplir à Node un tampon de 4 Go) : ignoré, sans rien allouer
  for (const covered of [{ length: 4e9 }, [1, 2], 42, 'AAAA', `${data.covered.slice(0, -4)}!!!!`, data.covered + 'AAAA']) {
    const debut = performance.now();
    assert.equal(coveredBits(covered, data.radius), null);
    const relu = Sweep.fromJSON({ ...data, covered }, 3000, 0);
    assert.equal(relu.view(null).covered, 0, 'le balayage repart de zéro');
    assert.ok(performance.now() - debut < 50);
  }
  assert.ok(Sweep.fromJSON(data, 3000, 0).view(null).covered > 0, 'la vraie zone balayée est reprise');
  assert.equal(isoDate('2026-11-15T10:00:00.000Z'), '2026-11-15T10:00:00.000Z');
  for (const v of [{}, 'hier', 12, '2026-13-45T99:00:00Z', 'x'.repeat(100)]) assert.equal(isoDate(v), null);
  const trace = Sweep.fromJSON({ center: data.center, trail: [{ x: 1, y: 2 }, { x: 'a' }, null] }).trail;
  assert.deepEqual(trace, [{ x: 1, y: 2 }]);
});
