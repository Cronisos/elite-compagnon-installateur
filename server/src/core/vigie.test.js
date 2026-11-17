// Vigie des règles (core/vigie.js) : décisions de l’auteur du 9 nov. 2026 (alerte au 3e écart inexpliqué, « Compris »,
// proposition seulement notée), journal et état relu après un redémarrage. Dossier temporaire, fiches factices.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import express from 'express';
import { Vigie, SEUIL, monterReglageVigie, propositionInvalide } from './vigie.js';
import { localGuard, jsonBody } from './localGuard.js';

const FICHES = [{ id: 'essai.sco.refroidissement', domaine: 'essai', titre: 'Refroidissement', valeur: 9000, unite: 'ms' }];
const fiche = (id) => FICHES.find((f) => f.id === id) || null;

function banc(t) {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-vigie-'));
  t.after(() => fs.rmSync(dossier, { recursive: true, force: true }));
  let ms = Date.parse('2026-11-09T20:00:00Z');
  const alertes = [];
  const avert = [];
  const cree = (o = {}) => new Vigie({ fiche, fiches: FICHES, dossier, actifParDefaut: true, now: () => (ms += 1000), onAlertes: (a) => alertes.push(a.length), warn: (m) => avert.push(m), ...o });
  return { dossier, cree, alertes, avert };
}

const ecart = (observe, explication = null) => ({ regle: 'essai.sco.refroidissement', attendu: 9000, observe, ecart: true, explication });

test('alerte au 3e écart inexpliqué seulement ; les écarts expliqués et les mesures conformes ne comptent pas', (t) => {
  const b = banc(t);
  const v = b.cree();
  v.observe({ regle: 'essai.sco.refroidissement', attendu: 9000, observe: 9100, ecart: false });
  v.observe(ecart(7000, 'vaisseau inconnu'));
  v.observe(ecart(7100));
  v.observe(ecart(7200));
  assert.equal(v.alertes().length, 0, `${SEUIL - 1} écarts inexpliqués : pas encore`);
  assert.equal(v.fenetreOuverte(), false);
  v.observe(ecart(7050));
  const [a] = v.alertes();
  assert.deepEqual([a.regle, a.ecarts, a.valeurEstimee], ['essai.sco.refroidissement', 3, 7100], 'valeur estimée : médiane des écarts');
  assert.equal(v.fenetreOuverte(), true);
  assert.deepEqual(b.alertes, [1], 'fenêtre de l’overlay ouverte une fois');
  const r = v.vue().regles['essai.sco.refroidissement'];
  assert.deepEqual([r.total, r.conformes, r.expliques, r.ecarts], [5, 1, 1, 3]);
});

test('« Compris » ferme l’alerte et remet le compte à zéro ; ✕ ferme la fenêtre jusqu’à la prochaine alerte', (t) => {
  const b = banc(t);
  const v = b.cree();
  for (const x of [7000, 7100, 7200]) v.observe(ecart(x));
  v.fermerFenetre();
  assert.equal(v.fenetreOuverte(), false);
  assert.equal(v.alertes().length, 1, 'l’alerte reste dans la page');
  v.compris('essai.sco.refroidissement');
  assert.equal(v.alertes().length, 0);
  for (const x of [7000, 7100]) v.observe(ecart(x));
  assert.equal(v.alertes().length, 0, 'compte reparti de zéro');
  v.observe(ecart(7000));
  assert.equal(v.fenetreOuverte(), true, 'nouvelle alerte : la fenêtre se rouvre');
  assert.equal(v.compris('inconnue.x'), null);
});

test('proposition notée seulement (jamais appliquée), règle inconnue ignorée, état et journal relus après redémarrage', (t) => {
  const b = banc(t);
  const v = b.cree();
  v.proposer('essai.sco.refroidissement', { valeur: 7000, note: 'mesuré 3 fois' });
  assert.equal(fiche('essai.sco.refroidissement').valeur, 9000, 'la fiche ne change pas');
  assert.equal(v.observe({ regle: '__proto__', attendu: 1, observe: 2, ecart: true }), null);
  assert.match(b.avert[0], /règle inconnue/);
  for (const x of [7000, 7100, 7200]) v.observe(ecart(x));
  const w = b.cree();
  assert.equal(w.alertes().length, 1, 'alerte relue');
  assert.deepEqual(w.vue().propositions.map((p) => [p.valeur, p.appliquee]), [[7000, false]]);
  assert.equal(w.observations({ limite: 2 }).length, 2);
  assert.equal(w.observations({ regle: 'essai.sco.refroidissement' })[0].observe, 7200, 'la plus récente d’abord');
  assert.match(w.resume('2026-11-09'), /Refroidissement \(essai\.sco\.refroidissement\) : 3 observation\(s\), 3 écart\(s\) inexpliqué\(s\) — ALERTE en cours/);
  assert.match(w.resume('2026-01-01'), /aucune observation/);
});

test('outil de développement : coupée par défaut, jamais de fenêtre en jeu ; le réglage l’allume et reste après redémarrage', (t) => {
  const b = banc(t);
  const v = b.cree({ actifParDefaut: false });
  assert.deepEqual(v.reglage(), { actif: false, parDefaut: false });
  for (const x of [7000, 7100, 7200]) v.observe(ecart(x));
  assert.equal(v.alertes().length, 1, 'les observations sont encore notées');
  assert.equal(v.fenetreOuverte(), false, 'coupée : pas de fenêtre dans l’overlay');
  assert.equal(v.vue().actif, false);
  assert.deepEqual(v.regler(true), { actif: true, parDefaut: false });
  assert.equal(v.fenetreOuverte(), true, 'allumée : l’alerte en attente s’ouvre');
  assert.equal(b.cree({ actifParDefaut: false }).actif(), true, 'choix relu après redémarrage');
  v.regler(false);
  assert.equal(v.fenetreOuverte(), false);
  assert.equal(b.cree({ actifParDefaut: true }).actif(), false, 'le choix enregistré passe avant ELITE_VIGIE');
});

test('observations lues par la fin : plusieurs morceaux, lignes coupées ou accentuées, limite et filtre', (t) => {
  const b = banc(t);
  const v = b.cree();
  const lignes = [];
  for (let i = 0; i < 3000; i++) lignes.push(JSON.stringify({ at: `t${i}`, regle: i % 3 ? 'autre' : 'essai.sco.refroidissement', observe: i, details: 'é'.repeat(40) }));
  fs.writeFileSync(path.join(b.dossier, 'vigie.jsonl'), `${lignes.join('\n')}\n{"coupee`);
  const toutes = v.observations({ limite: 5000 });
  assert.equal(toutes.length, 3000, 'toutes, la ligne coupée ignorée');
  assert.deepEqual([toutes[0].observe, toutes.at(-1).observe], [2999, 0], 'la plus récente d’abord, jusqu’à la première ligne');
  assert.deepEqual(v.observations({ limite: 3 }).map((o) => o.observe), [2999, 2998, 2997]);
  assert.deepEqual(v.observations({ regle: 'essai.sco.refroidissement', limite: 2 }).map((o) => o.observe), [2997, 2994]);
  assert.ok(toutes.every((o) => o.details === 'é'.repeat(40)), 'caractères accentués intacts entre deux morceaux');
  fs.rmSync(path.join(b.dossier, 'vigie.jsonl'));
  assert.deepEqual(v.observations(), []);
});

test('valeurs bornées dans le journal ; demande de proposition vérifiée', (t) => {
  const b = banc(t);
  const v = b.cree();
  const o = v.observe({ regle: 'essai.sco.refroidissement', attendu: 'x'.repeat(5000), observe: { a: { b: { c: { d: 1 } } } }, ecart: false });
  assert.equal(o.attendu.length, 500);
  assert.deepEqual(o.observe, { a: { b: { c: null } } });
  assert.equal(propositionInvalide({ valeur: 1, note: 'ok' }), null);
  assert.match(propositionInvalide({ note: 'sans valeur' }), /valeur/);
  assert.match(propositionInvalide({ valeur: 'x'.repeat(3000) }), /trop longue/);
  assert.match(propositionInvalide({ valeur: 1, note: 3 }), /Note invalide/);
});

test('route du réglage (PUT /api/vigie/reglage) : en-tête exigé, corps vérifié, choix enregistré', async (t) => {
  const b = banc(t);
  const fenetre = [];
  const v = b.cree({ actifParDefaut: false, onAlertes: (a) => fenetre.push(a.length) });
  // Même montage que server/src/index.js : garde de l'API locale, lecteur JSON, puis les routes
  const app = express();
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const { port } = server.address();
  app.use('/api', localGuard({ port }));
  app.use(jsonBody());
  monterReglageVigie(app, v);
  const url = `http://127.0.0.1:${port}/api/vigie/reglage`;
  const put = (body, entete = true) => fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(entete ? { 'X-Elite-Compagnon': '1' } : {}) },
    body: JSON.stringify(body),
  });

  assert.deepEqual(await (await fetch(url)).json(), { actif: false, parDefaut: false });
  const sansEntete = await put({ actif: true }, false);
  assert.equal(sansEntete.status, 403, 'écriture refusée sans X-Elite-Compagnon');
  assert.equal(v.actif(), false, 'rien n’a changé');
  for (const corps of [{}, { actif: 'oui' }, { actif: 1 }, [true]]) {
    const r = await put(corps);
    assert.equal(r.status, 400, JSON.stringify(corps));
    assert.match((await r.json()).error, /Réglage invalide/);
  }
  assert.equal(v.actif(), false);
  const r = await put({ actif: true });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { actif: true, parDefaut: false });
  assert.equal(b.cree({ actifParDefaut: false }).actif(), true, 'choix enregistré');
  assert.ok(fenetre.length >= 1, 'la fenêtre en jeu est remise à jour');
});
