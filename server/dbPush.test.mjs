// Mise à jour de la base au lancement (dbPush.mjs) : rien de lancé si le schéma n'a pas changé, copie de la base avant
// un changement, base d'avant remise en place si la mise à jour échoue.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MIGRATIONS, aTableMigrations, baseAJour, clientAJour, empreinteSchema, marqueurBase, migrations, nomMigrationSuivante, prismaCli, restaurerBase, sauvegarderBase, sqlNonVide } from './dbPush.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'elite-dbpush-'));

test('empreinte du schéma : contenu, configuration et version de Prisma ; jamais une date', () => {
  const t = temp();
  const dossier = path.join(t, 'schema');
  fs.mkdirSync(dossier);
  fs.writeFileSync(path.join(dossier, 'a.prisma'), 'model A { id Int @id }');
  fs.writeFileSync(path.join(dossier, 'notes.txt'), 'ignoré');
  const e1 = empreinteSchema({ dossier, config: null, version: '7.10.1' });
  fs.utimesSync(path.join(dossier, 'a.prisma'), new Date(0), new Date(0));
  fs.writeFileSync(path.join(dossier, 'notes.txt'), 'changé');
  assert.equal(empreinteSchema({ dossier, config: null, version: '7.10.1' }), e1, 'date ou autre fichier : même empreinte');
  assert.notEqual(empreinteSchema({ dossier, config: null, version: '7.11.0' }), e1, 'autre Prisma');
  fs.writeFileSync(path.join(dossier, 'b.prisma'), 'model B { id Int @id }');
  assert.notEqual(empreinteSchema({ dossier, config: null, version: '7.10.1' }), e1, 'fichier de schéma ajouté');
  assert.match(empreinteSchema(), /^[0-9a-f]{64}$/, 'le vrai schéma du serveur');
  fs.rmSync(t, { recursive: true, force: true });
});

test('base à jour : seulement si elle existe et porte ce schéma ; client généré pareil', () => {
  const t = temp();
  const db = path.join(t, 'elite.db');
  assert.equal(baseAJour(db, 'abc'), false, 'pas de base (effacée) : db push');
  fs.writeFileSync(db, 'base');
  assert.equal(baseAJour(db, 'abc'), false, 'base sans empreinte (version d’avant) : db push');
  fs.writeFileSync(marqueurBase(db), 'abc\n');
  assert.equal(baseAJour(db, 'abc'), true);
  assert.equal(baseAJour(db, 'def'), false, 'schéma changé');
  const client = path.join(t, 'client');
  fs.mkdirSync(client);
  assert.equal(clientAJour(client, 'abc'), false);
  fs.writeFileSync(path.join(client, 'index.js'), '');
  fs.writeFileSync(path.join(client, '.empreinte-elite'), 'abc');
  assert.equal(clientAJour(client, 'abc'), true);
  assert.equal(clientAJour(client, 'def'), false);
  assert.equal(clientAJour(null, 'abc'), false);
  fs.rmSync(t, { recursive: true, force: true });
});

test('copie avant un changement de schéma, les 3 dernières gardées ; échec : base d’avant remise, journaux compris', () => {
  const t = temp();
  const db = path.join(t, 'elite.db');
  fs.writeFileSync(db, 'v1');
  fs.writeFileSync(`${db}-wal`, 'wal v1');
  const copies = [];
  for (let i = 0; i < 5; i++) copies.push(sauvegarderBase(db, { now: new Date(Date.UTC(2026, 10, 10 + i, 20, 0, 0)) }));
  assert.match(path.basename(copies[0]), /^elite\.db\.avant-schema-20261110-200000$/);
  const restes = fs.readdirSync(t).filter((n) => n.includes('.avant-schema-')).sort();
  assert.deepEqual(restes, copies.slice(2).flatMap((c) => [path.basename(c), `${path.basename(c)}-wal`]).sort());
  // db push a échoué après avoir touché la base : tout revient comme avant
  fs.writeFileSync(db, 'à moitié changée');
  fs.writeFileSync(`${db}-wal`, 'wal d’une autre version');
  fs.writeFileSync(`${db}-journal`, 'journal en trop');
  restaurerBase(db, copies.at(-1));
  assert.equal(fs.readFileSync(db, 'utf8'), 'v1');
  assert.equal(fs.readFileSync(`${db}-wal`, 'utf8'), 'wal v1');
  assert.equal(fs.existsSync(`${db}-journal`), false, 'jamais un journal d’une autre version à côté de la base remise');
  fs.rmSync(t, { recursive: true, force: true });
});

test('au lancement : migrations appliquées la première fois, puis plus rien tant que le schéma ne change pas', { timeout: 120_000 }, () => {
  const t = temp();
  const env = { ...process.env, ELITE_DATA_DIR: t, CHECKPOINT_DISABLE: '1', NO_COLOR: '1' };
  const lancer = () => spawnSync(process.execPath, [path.join(ICI, 'dbPush.mjs'), '--sans-generate'], { cwd: ICI, env, encoding: 'utf8', timeout: 110_000 });
  const r1 = lancer();
  assert.equal(r1.status, 0, r1.stdout + r1.stderr);
  assert.ok(fs.existsSync(path.join(t, 'elite.db')), 'base créée');
  assert.equal(fs.readFileSync(path.join(t, 'elite.db.schema'), 'utf8').trim(), empreinteSchema());
  assert.ok(!fs.readdirSync(t).some((n) => n.includes('.avant-schema-')), 'base neuve : rien à copier');
  const r2 = lancer();
  assert.equal(r2.status, 0, r2.stdout + r2.stderr);
  assert.match(r2.stdout, /rien à faire/);
  // Schéma changé (empreinte d'une autre version) : copie, puis migrations (rien en attente)
  fs.writeFileSync(path.join(t, 'elite.db.schema'), 'version-d-avant\n');
  const r3 = lancer();
  assert.equal(r3.status, 0, r3.stdout + r3.stderr);
  assert.match(r3.stdout, /base copiée avant la mise à jour/);
  assert.equal(fs.readdirSync(t).filter((n) => /\.avant-schema-\d{8}-\d{6}$/.test(n)).length, 1);
  fs.rmSync(t, { recursive: true, force: true });
});

test('migrations : dans l’ordre, nom de la suivante, SQL vide reconnu, et l’empreinte suit les migrations', () => {
  assert.deepEqual(migrations().slice(0, 1), ['0001_initial']);
  assert.equal(nomMigrationSuivante(['0001_initial', '0002_x'], 'Colonne « rôle » ajoutée'), '0003_colonne_role_ajoutee');
  assert.equal(nomMigrationSuivante([], 'premier'), '0001_premier');
  assert.throws(() => nomMigrationSuivante([], ' !! '), /Nom de migration manquant/);
  assert.equal(sqlNonVide('-- This is an empty migration.\n'), false);
  assert.equal(sqlNonVide('-- AlterTable\nALTER TABLE "Build" ADD COLUMN "x" TEXT;'), true);
  const t = temp();
  const dossier = path.join(t, 'schema');
  fs.mkdirSync(dossier);
  fs.writeFileSync(path.join(dossier, 'a.prisma'), 'model A { id Int @id }');
  const mig = path.join(t, 'migrations');
  fs.mkdirSync(path.join(mig, '0001_initial'), { recursive: true });
  fs.writeFileSync(path.join(mig, '0001_initial', 'migration.sql'), 'CREATE TABLE "A" ("id" INTEGER);');
  const e1 = empreinteSchema({ dossier, config: null, version: '7.10.1', dossierMigrations: mig });
  fs.mkdirSync(path.join(mig, '0002_x'));
  fs.writeFileSync(path.join(mig, '0002_x', 'migration.sql'), 'ALTER TABLE "A" ADD COLUMN "x" TEXT;');
  assert.notEqual(empreinteSchema({ dossier, config: null, version: '7.10.1', dossierMigrations: mig }), e1, 'migration ajoutée');
  fs.rmSync(t, { recursive: true, force: true });
});

test('migrations : elles mènent exactement au schéma (un changement du schéma sans sa migration est vu)', { timeout: 120_000 }, () => {
  const r = spawnSync(process.execPath, [prismaCli(), 'migrate', 'diff', '--from-migrations', MIGRATIONS, '--to-schema', path.join(ICI, 'prisma', 'schema'), '--exit-code'], {
    cwd: ICI, env: { ...process.env, CHECKPOINT_DISABLE: '1', NO_COLOR: '1' }, encoding: 'utf8', timeout: 110_000,
  });
  assert.equal(r.status, 0, `Le schéma a changé sans migration : node dbPush.mjs --nouvelle-migration <nom>\n${r.stdout}${r.stderr}`);
});

test('base d’avant les migrations (db push) : reprise sans rien perdre, marquée appliquée, puis plus rien', { timeout: 180_000 }, async () => {
  const t = temp();
  const env = { ...process.env, ELITE_DATA_DIR: t, CHECKPOINT_DISABLE: '1', NO_COLOR: '1' };
  // Base de la version d'avant les migrations : celle que db push créait, exactement le schéma de 0001_initial (un db
  // push du schéma d'aujourd'hui aurait déjà les colonnes des migrations suivantes), avec des lignes
  const db = path.join(t, 'elite.db');
  const { default: Database } = await import('better-sqlite3');
  let base = new Database(db);
  base.exec(fs.readFileSync(path.join(MIGRATIONS, '0001_initial', 'migration.sql'), 'utf8'));
  const now = new Date().toISOString();
  base.prepare('INSERT INTO "Build" (name, shipId, shipType, gameShipId, slots, updatedAt) VALUES (?, ?, ?, ?, ?, ?)').run('Build Test', 1, 'sidewinder', 3, '{}', now);
  base.prepare('INSERT INTO "ShipNickname" (shipId, nickname, updatedAt) VALUES (?, ?, ?)').run(3, 'Vaisseau Test', now);
  base.prepare('INSERT INTO "ShipNickname" (shipId, nickname, updatedAt) VALUES (?, ?, ?)').run(1, 'Autre Test', now);
  base.prepare('INSERT INTO "EngineeringPlan" (shipId, shipType, name, updatedAt) VALUES (?, ?, ?, ?)').run(3, 'anaconda', 'Plan Test', now);
  base.close();
  assert.equal(await aTableMigrations(db), false);
  const r = spawnSync(process.execPath, [path.join(ICI, 'dbPush.mjs'), '--sans-generate'], { cwd: ICI, env, encoding: 'utf8', timeout: 110_000 });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /0001_initial marquée appliquée/);
  assert.equal(await aTableMigrations(db), true);
  base = new Database(db, { readonly: true });
  assert.equal(base.prepare('SELECT name FROM "Build"').get().name, 'Build Test', 'données gardées');
  assert.equal(base.prepare('SELECT COUNT(*) AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL').get().n, migrations().length, 'toutes les migrations appliquées');
  // 0002 (commandant des vaisseaux) : chaque ligne reste, commanderId NULL (« commandant d'avant », rattaché par l'app)
  assert.deepEqual(base.prepare('SELECT shipId, nickname, commanderId FROM "ShipNickname" ORDER BY shipId').all(), [
    { shipId: 1, nickname: 'Autre Test', commanderId: null },
    { shipId: 3, nickname: 'Vaisseau Test', commanderId: null },
  ]);
  assert.deepEqual(base.prepare('SELECT shipId, name, commanderId FROM "EngineeringPlan"').all(), [{ shipId: 3, name: 'Plan Test', commanderId: null }]);
  assert.deepEqual(base.prepare('SELECT gameShipId, commanderId FROM "Build"').all(), [{ gameShipId: 3, commanderId: null }]);
  base.close();
  fs.rmSync(t, { recursive: true, force: true });
});

test('migration 0002 : un même ShipID a un nom par commandant, jamais deux pour le même commandant', { timeout: 180_000 }, async () => {
  const t = temp();
  const env = { ...process.env, ELITE_DATA_DIR: t, CHECKPOINT_DISABLE: '1', NO_COLOR: '1' };
  const r = spawnSync(process.execPath, [path.join(ICI, 'dbPush.mjs'), '--sans-generate'], { cwd: ICI, env, encoding: 'utf8', timeout: 110_000 });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const { default: Database } = await import('better-sqlite3');
  const base = new Database(path.join(t, 'elite.db'));
  const now = new Date().toISOString();
  const add = base.prepare('INSERT INTO "ShipNickname" (commanderId, shipId, nickname, updatedAt) VALUES (?, ?, ?, ?)');
  add.run('F0000001', 1, 'Anaconda Test', now);
  add.run('F0000002', 1, 'Cobra Test', now);
  assert.throws(() => add.run('F0000001', 1, 'Doublon', now), /UNIQUE/);
  assert.equal(base.prepare('SELECT COUNT(*) AS n FROM "ShipNickname" WHERE shipId = 1').get().n, 2);
  base.close();
  fs.rmSync(t, { recursive: true, force: true });
});
