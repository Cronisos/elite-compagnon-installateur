// Configuration de la CLI Prisma 7 (migrate deploy, migrate diff, generate) : le schéma (dossier prisma/schema, un fichier par module) et
// l'adresse de la base, la même que celle de l'app (core/paths.js : server/data/elite.db, ou ELITE_DATA_DIR). Aucune
// variable d'environnement chargée depuis un fichier .env : seulement celles du processus.

import { defineConfig } from 'prisma/config';
import { databaseFileUrl } from './src/core/paths.js';

export default defineConfig({
  schema: 'prisma/schema',
  // Migrations versionnées (prisma/migrations) : appliquées dans l'ordre au lancement (dbPush.mjs, migrate deploy)
  migrations: { path: 'prisma/migrations' },
  datasource: { url: databaseFileUrl() },
});
