// Tests de l'état des chantiers : séquences construites à partir des exemples documentés (fixtures/examples.js),
// pas d'un vrai journal de colonisation de l’auteur.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildState, ColonisationState, loadArchive, parseArchive, saveArchive } from './state.js';
import { BEACON, CLAIM, COMPLETE_CONSTRUCTION, contributionAt, DEPOT, depotAt, dockedAt, DOCKED_SHIP, RELEASE, SETTLEMENT_WITH_SERVICE } from './fixtures/examples.js';

const SHIP = DOCKED_SHIP.MarketID; // 3963439106
const OTHER = 4230000001;

/** Séquence d'un chantier : amarrage, lecture, 500 t d'acier livrées, lecture mise à jour (comme la fixture BGS-Tally). */
const sequence = () => [
  dockedAt(SHIP, '2026-11-01T20:00:00Z'),
  depotAt(SHIP, '2026-11-01T20:00:05Z'),
  contributionAt(SHIP, '2026-11-01T20:01:00Z', { steel: 500 }),
  depotAt(SHIP, '2026-11-01T20:01:00Z', { steel: 1220 }),
];

test('amarrage, lecture du dépôt, livraison : chantier suivi par MarketID', () => {
  const s = new ColonisationState();
  const [dock, depot, contribution, after] = sequence();
  assert.equal(s.apply(dock), true); // chantier reconnu dès l'amarrage
  const site = s.sites.get(SHIP);
  assert.equal(site.stationLabel, 'Vaisseau de colonisation · Judson Depot');
  assert.equal(site.system, 'Bleae Thua ED-D c12-5');
  assert.equal(site.resources.length, 0);
  assert.equal(s.apply(depot), true);
  assert.equal(site.progress, 0.033023);
  assert.equal(site.resources.find((r) => r.symbol === 'steel').remaining, 5960);
  assert.equal(site.resources.length, 19);
  // Ta livraison : gardée avec sa date, ajoutée provisoirement au dernier instantané
  assert.equal(s.apply(contribution), true);
  assert.equal(site.provisional, true);
  assert.equal(site.resources.find((r) => r.symbol === 'steel').provided, 1220);
  assert.deepEqual(site.contributions.map((c) => [c.at, c.total, c.visit]), [['2026-11-01T20:01:00Z', 500, '2026-11-01T20:00:00Z']]);
  // La lecture suivante remplace (valeur absolue, livraisons de tous les CMDR), sans rien ajouter deux fois
  assert.equal(s.apply(after), true);
  assert.equal(site.provisional, false);
  assert.equal(site.resources.find((r) => r.symbol === 'steel').provided, 1220);
  assert.equal(site.updatedAt, '2026-11-01T20:01:00Z');
  // Lecture identique (toutes les 15 s à quai selon les schémas) : rien ne change
  assert.equal(s.apply({ ...after, timestamp: '2026-11-01T20:01:15Z' }), false);
  assert.equal(site.readings, 3);
  // Aucun écart aux observations sur une séquence cohérente
  assert.deepEqual(s.diagnostics().checks, []);
});

test('plusieurs chantiers à la fois ; actif = à quai, sinon épinglé, sinon le plus récent', () => {
  const s = buildState([
    ...sequence(),
    { event: 'Undocked', timestamp: '2026-11-01T20:05:00Z', MarketID: SHIP },
    depotAt(OTHER, '2026-11-02T10:00:00Z'), // dépôt sans Docked connu (vu après un Touchdown, EDDiscovery)
  ]);
  assert.equal(s.sites.size, 2);
  assert.equal(s.sites.get(OTHER).system, null);
  assert.deepEqual(s.list().map((x) => x.marketId), [OTHER, SHIP]);
  assert.equal(s.active().site.marketId, OTHER);
  assert.equal(s.active().reason, 'recent');
  s.sites.get(SHIP).user.pinned = true;
  assert.equal(s.active().reason, 'pinned');
  assert.equal(s.active().site.marketId, SHIP);
  // Amarrage plus tard au second chantier : son nom et son système arrivent
  s.apply(dockedAt(OTHER, '2026-11-02T11:00:00Z', { StationName: 'Orbital Construction Site: Smith Ring', StarSystem: 'Col 285 Sector DB-E c12-24', SystemAddress: 1 }));
  assert.equal(s.sites.get(OTHER).kind, 'orbital');
  assert.equal(s.sites.get(OTHER).system, 'Col 285 Sector DB-E c12-24');
  assert.deepEqual(s.active(), { site: s.sites.get(OTHER), reason: 'docked' });
  assert.equal(s.active(null).reason, 'pinned'); // l'état du jeu dit « pas à quai »
});

test('dépôt lu sans amarrage : nom et système repris de l’approche, écrite dans le système où tu es', () => {
  const s = new ColonisationState();
  s.apply({ event: 'FSDJump', timestamp: '2026-11-03T10:00:00Z', StarSystem: 'Bleae Thua ED-D c12-5', SystemAddress: 1458040738922 });
  // Sortie de supercroisière sur le vaisseau de colonisation (forme de la fixture BGS-Tally) : ni nom ni adresse du système
  s.apply({ event: 'SupercruiseDestinationDrop', timestamp: '2026-11-03T10:02:00Z', Type: '$EXT_PANEL_ColonisationShip; Judson Depot', Threat: 0, MarketID: SHIP });
  assert.equal(s.sites.size, 0); // retenu, pas encore un chantier
  s.apply(depotAt(SHIP, '2026-11-03T10:05:00Z'));
  const site = s.sites.get(SHIP);
  assert.equal(site.kind, 'ship');
  assert.equal(site.system, 'Bleae Thua ED-D c12-5');
  assert.equal(site.systemAddress, 1458040738922);
  // Autorisation d'amarrage (sans système non plus) dans un autre système, puis lecture du dépôt
  s.apply({ event: 'FSDJump', timestamp: '2026-11-03T11:00:00Z', StarSystem: 'Col 285 Sector DB-E c12-24', SystemAddress: 7 });
  s.apply({ event: 'DockingGranted', timestamp: '2026-11-03T11:05:00Z', StationName: 'Orbital Construction Site: Smith Ring', StationType: 'SpaceConstructionDepot', MarketID: OTHER, LandingPad: 3 });
  s.apply(depotAt(OTHER, '2026-11-03T11:06:00Z'));
  assert.equal(s.sites.get(OTHER).system, 'Col 285 Sector DB-E c12-24');
  assert.equal(s.sites.get(OTHER).stationLabel, 'Chantier orbital · Smith Ring');
  assert.equal(s.sites.get(SHIP).system, 'Bleae Thua ED-D c12-5'); // l'autre chantier ne bouge pas
});

test('chantier terminé : gardé et marqué, plus jamais actif ; échec marqué aussi', () => {
  const full = Object.fromEntries(DEPOT.ResourcesRequired.map((r) => [r.Name.slice(1, -6), r.RequiredAmount]));
  const s = buildState([...sequence(), depotAt(SHIP, '2026-11-20T18:00:00Z', full, { ConstructionComplete: true })]);
  const site = s.sites.get(SHIP);
  assert.equal(site.complete, true);
  assert.equal(site.progress, 1);
  assert.equal(site.completedAt, '2026-11-20T18:00:00Z');
  assert.ok(site.resources.every((r) => r.remaining === 0));
  assert.equal(s.active(null), null);
  s.apply(depotAt(OTHER, '2026-11-21T10:00:00Z', {}, { ConstructionFailed: true }));
  assert.equal(s.sites.get(OTHER).failed, true);
  assert.equal(s.sites.get(OTHER).failedAt, '2026-11-21T10:00:00Z');
  assert.equal(s.active(null), null);
  assert.equal(s.list().length, 2);
  assert.deepEqual(s.diagnostics().checks, []);
});

test('revendication : le système revendiqué n’est pas la position ; la balise prend le système où tu es', () => {
  const s = new ColonisationState();
  s.apply({ event: 'Location', timestamp: '2025-10-05T07:00:00Z', StarSystem: 'Sol', SystemAddress: 10477373803 });
  s.apply(CLAIM);
  assert.equal(s.position.system, 'Sol');
  s.apply({ event: 'FSDJump', timestamp: '2025-10-05T07:05:00Z', StarSystem: CLAIM.StarSystem, SystemAddress: CLAIM.SystemAddress });
  s.apply(BEACON);
  s.apply(RELEASE);
  const claims = s.claimList();
  assert.equal(claims.length, 2);
  const claim = claims.find((c) => c.systemAddress === CLAIM.SystemAddress);
  assert.deepEqual(claim, { system: CLAIM.StarSystem, systemAddress: CLAIM.SystemAddress, claimedAt: CLAIM.timestamp, releasedAt: null, beaconAt: BEACON.timestamp });
  assert.equal(claims.find((c) => c.systemAddress === RELEASE.SystemAddress).releasedAt, RELEASE.timestamp);
});

test('établissement terminé avec le service de livraison : pas un chantier (vraie ligne de l’auteur)', () => {
  const s = new ColonisationState();
  assert.equal(s.apply(SETTLEMENT_WITH_SERVICE), false);
  assert.equal(s.apply(dockedAt(4230411011, '2026-11-01T10:55:00Z', { StationName: 'Gibbs Hydroponics Site' })), false);
  assert.equal(s.sites.size, 0);
});

test('écarts aux observations notés au diagnostic, jamais corrigés en silence', () => {
  const s = new ColonisationState();
  s.apply(depotAt(SHIP, '2026-11-01T20:00:00Z'));
  s.apply(contributionAt(SHIP, '2026-11-01T20:01:00Z', { steel: 500, gold: 10 }));
  // Le dépôt n'augmente que de 100 t, l'acier « baisse » sur l'autre lecture, l'avancement ne suit plus la formule
  s.apply(depotAt(SHIP, '2026-11-01T20:02:00Z', { steel: 820 }, { ConstructionProgress: 0.5 }));
  s.apply(depotAt(SHIP, '2026-11-01T20:03:00Z', { steel: 800 }));
  // Paiement différent pour la même marchandise sur un autre chantier, nom pas en minuscules
  const other = depotAt(OTHER, '2026-11-01T21:00:00Z');
  other.ResourcesRequired = other.ResourcesRequired.map((r) => (r.Name === '$titanium_name;' ? { ...r, Name: '$Titanium_name;', Payment: 6000 } : r));
  s.apply(other);
  const rules = s.diagnostics().checks.map((c) => `${c.rule}:${c.symbol ?? ''}`).sort();
  assert.deepEqual(rules, [
    'contribution-counted:steel', 'contribution-known:gold', 'name-case-depot:titanium', 'payment-constant:titanium',
    'progress-formula:', 'provided-monotonic:steel',
  ]);
  // Une même règle sur le même chantier : regroupée
  s.apply(depotAt(SHIP, '2026-11-01T20:04:00Z', { steel: 800 }, { ConstructionProgress: 0.6 }));
  assert.equal(s.diagnostics().checks.find((c) => c.rule === 'progress-formula').count, 2);
  // Livraison en minuscules (attendu PascalCase)
  s.apply({ event: 'ColonisationContribution', timestamp: '2026-11-01T20:05:00Z', MarketID: SHIP, Contributions: [{ Name: '$steel_name;', Amount: 1 }] });
  assert.ok(s.diagnostics().checks.some((c) => c.rule === 'name-case-contribution'));
});

test('diagnostic : champs inattendus et derniers événements Colonisation* bruts seulement', () => {
  const s = new ColonisationState();
  for (const ev of sequence()) s.apply(ev);
  s.apply({ ...depotAt(SHIP, '2026-11-01T20:10:00Z'), NouveauChamp: 1 });
  s.apply(COMPLETE_CONSTRUCTION);
  s.apply({ event: 'Undocked', timestamp: '2026-11-01T20:11:00Z' });
  const d = s.diagnostics();
  assert.ok(d.raw.every((r) => r.event.startsWith('Colonisation') || r.event === 'CompleteConstruction'));
  assert.equal(d.raw[0].event, 'CompleteConstruction'); // le plus récent d'abord
  assert.equal(d.counts.ColonisationConstructionDepot, 3);
  assert.ok(d.issues.some((i) => i.kind === 'unexpected' && i.path === 'NouveauChamp'));
  assert.ok(d.checks.some((c) => c.rule === 'complete-event'));
  for (let i = 0; i < 40; i++) s.apply({ ...BEACON, timestamp: `2026-11-02T10:${String(i).padStart(2, '0')}:00Z` });
  assert.equal(s.diagnostics().raw.length, 30);
});

test('persistance : écriture atomique, relue, complétée par le journal ; fichier piégé ou abîmé ignoré', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-colonisation-'));
  try {
    const file = path.join(dir, 'colonisation.json');
    const s = buildState(sequence());
    s.sites.get(SHIP).user = { name: 'Port de Judson', deadline: '2026-11-28T20:00:00.000Z', notes: 'escadron', loopMinutes: 12, pinned: true };
    s.apply(CLAIM);
    saveArchive(file, s);
    assert.deepEqual(fs.readdirSync(dir), ['colonisation.json']); // pas de fichier temporaire laissé
    const archive = loadArchive(file);
    assert.equal(archive.sites.get(SHIP).user.name, 'Port de Judson');
    // Journaux supprimés depuis : le chantier vient de l'archive, avec ta livraison
    const fromArchive = buildState([], archive);
    assert.equal(fromArchive.sites.get(SHIP).contributions.length, 1);
    assert.equal(fromArchive.sites.get(SHIP).resources.find((r) => r.symbol === 'steel').remaining, 5460);
    assert.equal(fromArchive.claimList().length, 1);
    // Journal relu au démarrage : l'état est reconstruit, les réglages du joueur gardés, rien en double
    const rebuilt = buildState([...sequence(), depotAt(SHIP, '2026-11-02T20:00:00Z', { steel: 2000 })], archive);
    const site = rebuilt.sites.get(SHIP);
    assert.equal(site.user.loopMinutes, 12);
    assert.equal(site.contributions.length, 1);
    assert.equal(site.resources.find((r) => r.symbol === 'steel').provided, 2000);
    // Fichier abîmé ou piégé : vide, sans exception ni pollution (l'abîmé est mis de côté, test plus bas)
    fs.writeFileSync(file, '{pas du json');
    assert.equal(loadArchive(file, { warn: () => {} }).sites.size, 0);
    const trapped = parseArchive(JSON.parse('{"sites":[{"marketId":"constructor"},{"marketId":5,"__proto__":{"polluted":true},"resources":[{"symbol":"__proto__","required":1}],"user":{"name":{"x":1},"loopMinutes":99999}}],"forgotten":[{"marketId":-1,"at":"x"}]}'));
    assert.equal(({}).polluted, undefined);
    assert.deepEqual([...trapped.sites.keys()], [5]);
    assert.deepEqual(trapped.sites.get(5).resources, []);
    assert.equal(trapped.sites.get(5).user.name, null);
    assert.equal(trapped.sites.get(5).user.loopMinutes, null);
    assert.deepEqual(trapped.forgotten, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('oublier : les événements passés ne recréent pas le chantier, un nouvel amarrage si', () => {
  const s = buildState(sequence());
  assert.equal(s.forget(SHIP, Date.parse('2026-11-05T00:00:00Z')), true);
  assert.equal(s.forget(SHIP), false);
  const archive = parseArchive(JSON.parse(JSON.stringify(s.toJSON())));
  const replay = buildState(sequence(), archive);
  assert.equal(replay.sites.has(SHIP), false);
  replay.apply(dockedAt(SHIP, '2026-11-06T20:00:00Z'));
  assert.equal(replay.sites.has(SHIP), true);
  assert.equal(replay.sites.get(SHIP).contributions.length, 0);
});

test('chantier fini par d’autres CMDR : terminé à l’amarrage à la station finie, même MarketID', () => {
  // Dernière lecture à toi : 1 220 t d'acier livrées ; l'escadron livre le reste sans que tu rouvres le dépôt
  const finished = (at, extra = {}) => dockedAt(SHIP, at, { StationName: 'Judson Depot', StationServices: ['dock', 'commodities', 'refuel'], ...extra });
  const s = buildState([...sequence(), { event: 'Undocked', timestamp: '2026-11-01T20:05:00Z', MarketID: SHIP }]);
  assert.equal(s.active(null).site.marketId, SHIP);
  assert.equal(s.apply(finished('2026-11-10T19:00:00Z')), true);
  const site = s.sites.get(SHIP);
  assert.equal(site.complete, true);
  assert.equal(site.completedBy, 'amarrage');
  assert.equal(site.completedAt, '2026-11-10T19:00:00Z');
  assert.equal(site.progress, 1);
  assert.equal(site.stationLabel, 'Vaisseau de colonisation · Judson Depot'); // nom du chantier gardé
  assert.equal(s.active(null), null); // plus « Dernier en cours »
  assert.equal(s.active(SHIP).reason, 'docked');
  assert.ok(s.diagnostics().checks.some((c) => c.rule === 'complete-read' && c.marketId === SHIP));
  // Déjà terminé : un autre amarrage ne change rien
  assert.equal(s.apply(finished('2026-11-11T19:00:00Z')), true);
  assert.equal(site.completedAt, '2026-11-10T19:00:00Z');
  // Gardé par l'archive si le journal de cet amarrage disparaît
  const archive = parseArchive(JSON.parse(JSON.stringify(s.toJSON())));
  const rebuilt = buildState(sequence(), archive);
  assert.equal(rebuilt.sites.get(SHIP).complete, true);
  assert.equal(rebuilt.sites.get(SHIP).completedBy, 'amarrage');
  // Une lecture plus récente du dépôt qui dit « en cours » l'emporte : la déduction était fausse
  s.apply(depotAt(SHIP, '2026-11-12T10:00:00Z', { steel: 3000 }));
  assert.equal(site.complete, false);
  assert.equal(site.completedAt, null);
  assert.equal(site.completedBy, null);
  // Nom de chantier gardé mais plus de service de livraison : plus un chantier non plus
  const t = new ColonisationState();
  t.apply(dockedAt(SHIP, '2026-11-01T20:00:00Z'));
  t.apply(dockedAt(SHIP, '2026-11-09T20:00:00Z', { StationServices: ['dock', 'commodities'] }));
  assert.equal(t.sites.get(SHIP).complete, true);
  // Amarrage au chantier encore en cours : rien de terminé
  const u = buildState(sequence());
  u.apply(dockedAt(SHIP, '2026-11-02T20:00:00Z'));
  assert.equal(u.sites.get(SHIP).complete, false);
});

test('chantier fini : la station terminée a un nouveau MarketID, même système et même nom', () => {
  const NEW = 4351826691; // port primaire terminé (README : 3963439106 → 4351826691)
  const s = buildState([...sequence(), { event: 'Undocked', timestamp: '2026-11-01T20:05:00Z', MarketID: SHIP }]);
  const plain = { StationName: 'Judson Depot', StationType: 'Coriolis', StationServices: ['dock', 'commodities', 'refuel'] };
  // Même nom dans un autre système, ou autre nom dans le même système : pas ce chantier
  assert.equal(s.apply(dockedAt(NEW, '2026-11-09T10:00:00Z', { ...plain, StarSystem: 'Sol', SystemAddress: 10477373803 })), false);
  assert.equal(s.apply(dockedAt(NEW + 1, '2026-11-09T11:00:00Z', { ...plain, StationName: 'Smith Ring' })), false);
  assert.equal(s.sites.get(SHIP).complete, false);
  assert.equal(s.apply(dockedAt(NEW, '2026-11-10T19:00:00Z', plain)), true);
  const site = s.sites.get(SHIP);
  assert.equal(site.complete, true);
  assert.equal(site.successorMarketId, NEW);
  assert.equal(s.sites.has(NEW), false); // la station terminée n'est pas un chantier
  assert.equal(s.active(null), null);
  assert.ok(s.diagnostics().checks.some((c) => c.rule === 'complete-read' && /nouveau MarketID 4351826691/.test(c.detail)));
});

test('oublier tient jusqu’au prochain amarrage : une lecture du dépôt ou une livraison ne le fait pas revenir', () => {
  const s = buildState(sequence()); // à quai au chantier depuis 20:00
  s.sites.get(SHIP).user.name = 'Port de Judson';
  assert.equal(s.forget(SHIP, Date.parse('2026-11-01T20:01:30Z')), true);
  // Le jeu réécrit le dépôt 15 s plus tard, tu livres encore : toujours oublié
  assert.equal(s.apply(depotAt(SHIP, '2026-11-01T20:01:45Z', { steel: 1220 })), false);
  assert.equal(s.apply(contributionAt(SHIP, '2026-11-01T20:02:00Z', { steel: 100 })), false);
  assert.equal(s.sites.has(SHIP), false);
  assert.equal(s.active(), null);
  // Archive écrite pendant l'oubli, journal relu au démarrage : toujours oublié
  const waiting = parseArchive(JSON.parse(JSON.stringify(s.toJSON())));
  const history = [...sequence(), depotAt(SHIP, '2026-11-01T20:01:45Z', { steel: 1220 }), contributionAt(SHIP, '2026-11-01T20:02:00Z', { steel: 100 })];
  assert.equal(buildState(history, waiting).sites.has(SHIP), false);
  // Nouvel amarrage : le chantier revient, sans rien d'avant cet amarrage (ni livraisons, ni nom personnalisé)
  s.apply({ event: 'Undocked', timestamp: '2026-11-01T20:05:00Z', MarketID: SHIP });
  const redock = dockedAt(SHIP, '2026-11-01T20:30:00Z');
  assert.equal(s.apply(redock), true);
  assert.equal(s.apply(depotAt(SHIP, '2026-11-01T20:30:05Z', { steel: 1320 })), true);
  const back = s.sites.get(SHIP);
  assert.equal(back.contributions.length, 0);
  assert.equal(back.user.name, null);
  assert.equal(back.resources.find((r) => r.symbol === 'steel').provided, 1320);
  // Redémarrage : même résultat, depuis l'archive d'avant ou d'après le nouvel amarrage
  const full = [...history, { event: 'Undocked', timestamp: '2026-11-01T20:05:00Z', MarketID: SHIP }, redock, depotAt(SHIP, '2026-11-01T20:30:05Z', { steel: 1320 })];
  for (const archive of [waiting, parseArchive(JSON.parse(JSON.stringify(s.toJSON())))]) {
    const rebuilt = buildState(full, archive);
    assert.equal(rebuilt.sites.get(SHIP).contributions.length, 0);
    assert.equal(rebuilt.sites.get(SHIP).resources.find((r) => r.symbol === 'steel').provided, 1320);
  }
});

test('archive illisible : mise de côté avec un avertissement, jamais écrasée en silence', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-colonisation-illisible-'));
  try {
    const file = path.join(dir, 'colonisation.json');
    const warnings = [];
    const warn = (m) => warnings.push(m);
    // Absente : rien à dire
    assert.equal(loadArchive(file, { warn }).sites.size, 0);
    assert.deepEqual(warnings, []);
    for (const bad of ['{"version":1,"sites":[{"marketId":5', '', '[]', 'null']) {
      fs.writeFileSync(file, bad);
      assert.equal(loadArchive(file, { warn, now: Date.parse('2026-11-08T03:04:05.678Z') }).sites.size, 0);
      assert.equal(fs.existsSync(file), false, JSON.stringify(bad));
      const kept = path.join(dir, 'colonisation.json.illisible-2026-11-08T03-04-05-678Z');
      assert.equal(fs.readFileSync(kept, 'utf8'), bad); // contenu intact
      fs.rmSync(kept);
    }
    assert.equal(warnings.length, 4);
    assert.ok(warnings.every((w) => /illisible/.test(w)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
