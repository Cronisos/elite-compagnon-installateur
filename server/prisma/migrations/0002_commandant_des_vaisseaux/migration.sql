-- Plusieurs commandants sur le même PC (audit du 15 nov. 2026, M7) : le ShipID du jeu n'est unique que pour un
-- commandant. Les noms donnés aux vaisseaux, les plans d'ingénierie et les builds liés à un vaisseau réel sont désormais
-- rangés par (commandant, ShipID) : colonne commanderId (FID du commandant, sinon « nom:<nom> », server/src/core/commander.js).
--
-- Données existantes : TOUTES les lignes restent, avec commanderId NULL (« commandant d'avant »). L'app les rattache au
-- commandant le plus vu dans les journaux au premier démarrage, une fois l'historique relu (core/shipNicknames.js
-- adopt, modules/engineering/services/service.js adoptPlans, modules/builder/index.js). Sans commandant dans les
-- journaux, elles restent NULL et valent pour le commandant courant tant qu'il n'y en a qu'un (core/commander.js
-- belongsTo). Aucune donnée n'est déduite ici : SQL ne lit pas les journaux.

-- Builds : commandant du vaisseau réel visé (gameShipId) ; NULL pour un build qui n'en vise aucun
ALTER TABLE "Build" ADD COLUMN "commanderId" TEXT;

-- Plans d'ingénierie : commandant du vaisseau (shipId) ; NULL pour un plan vierge
ALTER TABLE "EngineeringPlan" ADD COLUMN "commanderId" TEXT;

-- Noms des vaisseaux : la clé passe de shipId seul à (commanderId, shipId). SQLite ne change pas une clé primaire en
-- place : table refaite, chaque nom recopié tel quel (shipId, nickname, updatedAt), commanderId NULL, un id neuf par
-- ligne dans l'ordre des ShipID.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ShipNickname" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "commanderId" TEXT,
    "shipId" INTEGER NOT NULL,
    "nickname" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ShipNickname" ("commanderId", "nickname", "shipId", "updatedAt") SELECT NULL, "nickname", "shipId", "updatedAt" FROM "ShipNickname" ORDER BY "shipId";
DROP TABLE "ShipNickname";
ALTER TABLE "new_ShipNickname" RENAME TO "ShipNickname";
CREATE UNIQUE INDEX "ShipNickname_commanderId_shipId_key" ON "ShipNickname"("commanderId", "shipId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
