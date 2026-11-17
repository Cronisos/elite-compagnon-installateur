-- CreateTable
CREATE TABLE "Build" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "shipId" INTEGER NOT NULL,
    "shipType" TEXT NOT NULL,
    "gameShipId" INTEGER,
    "slots" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "EngineeringPlan" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shipId" INTEGER,
    "shipType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "selected" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PlanModule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "planId" INTEGER NOT NULL,
    "slot" TEXT NOT NULL,
    "module" TEXT,
    "blueprint" TEXT,
    "grade" INTEGER NOT NULL DEFAULT 0,
    "experimental" TEXT,
    "currentModule" TEXT,
    "currentBlueprint" TEXT,
    "currentGrade" INTEGER NOT NULL DEFAULT 0,
    "currentQuality" REAL NOT NULL DEFAULT 0,
    "currentExperimental" TEXT,
    CONSTRAINT "PlanModule_planId_fkey" FOREIGN KEY ("planId") REFERENCES "EngineeringPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MaterialInventory" (
    "name" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "grade" INTEGER NOT NULL,
    "count" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ReferenceData" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "version" TEXT NOT NULL,
    "downloadedAt" DATETIME NOT NULL,
    "files" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "ExpansionProject" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "steps" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GlanceValue" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" REAL NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GlanceGoal" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "label" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "target" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ExternalLink" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "theme" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "kind" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "verified" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Route" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "startSystem" TEXT NOT NULL,
    "startStation" TEXT NOT NULL,
    "startMarketId" REAL NOT NULL,
    "startCommodity" TEXT NOT NULL,
    "structure" TEXT NOT NULL,
    "stations" TEXT NOT NULL,
    "systems" TEXT NOT NULL,
    "commodities" TEXT NOT NULL,
    "goal" REAL NOT NULL DEFAULT 0,
    "overrides" TEXT NOT NULL DEFAULT '{}',
    "trackFrom" DATETIME NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Loop" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "routeId" INTEGER NOT NULL,
    "startAt" DATETIME NOT NULL,
    "endAt" DATETIME NOT NULL,
    "durationSec" INTEGER NOT NULL,
    "activeSec" INTEGER NOT NULL DEFAULT 0,
    "netGain" REAL NOT NULL,
    "sales" REAL NOT NULL,
    "purchases" REAL NOT NULL,
    "fuel" REAL NOT NULL,
    "repairs" REAL NOT NULL,
    "wages" REAL NOT NULL,
    "ammo" REAL NOT NULL,
    "rebuy" REAL NOT NULL,
    "merits" INTEGER NOT NULL,
    "cargo" INTEGER NOT NULL,
    "cargoDetail" TEXT NOT NULL,
    "legTimes" TEXT NOT NULL,
    "tags" TEXT NOT NULL,
    "destroyed" BOOLEAN NOT NULL DEFAULT false,
    "pause" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Loop_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "loopId" INTEGER NOT NULL,
    "at" DATETIME NOT NULL,
    "station" TEXT NOT NULL,
    "system" TEXT NOT NULL,
    "marketId" REAL NOT NULL,
    "commodity" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "total" REAL NOT NULL,
    "side" TEXT NOT NULL,
    CONSTRAINT "Trade_loopId_fkey" FOREIGN KEY ("loopId") REFERENCES "Loop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MarketSnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "marketId" REAL NOT NULL,
    "station" TEXT NOT NULL,
    "system" TEXT NOT NULL,
    "commodity" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "buyPrice" INTEGER NOT NULL,
    "sellPrice" INTEGER NOT NULL,
    "stock" INTEGER NOT NULL,
    "demand" INTEGER NOT NULL,
    "at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "journalPath" TEXT NOT NULL,
    "hoursPerEvening" REAL NOT NULL DEFAULT 3
);

-- CreateTable
CREATE TABLE "ShipNickname" (
    "shipId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nickname" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ImportantSystem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "system" TEXT NOT NULL,
    "tag" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "sol" REAL,
    "planets" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Waypoint" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'autre',
    "notes" TEXT NOT NULL DEFAULT '',
    "siteNumber" INTEGER,
    "drills" INTEGER,
    "unprofitable" BOOLEAN NOT NULL DEFAULT false,
    "depletedAt" DATETIME,
    "system" TEXT,
    "systemAddress" TEXT,
    "body" TEXT,
    "station" TEXT,
    "latitude" REAL,
    "longitude" REAL,
    "altitude" REAL,
    "heading" INTEGER,
    "planetRadius" REAL,
    "vehicle" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MiningSession" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "waypointId" INTEGER,
    "label" TEXT NOT NULL,
    "siteNumber" INTEGER,
    "body" TEXT,
    "system" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "segments" TEXT NOT NULL DEFAULT '[]',
    "summary" TEXT NOT NULL DEFAULT ''
);

-- CreateTable
CREATE TABLE "MiningSite" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "system" TEXT NOT NULL,
    "systemAddress" TEXT,
    "body" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "bad" BOOLEAN NOT NULL DEFAULT false,
    "rating" INTEGER,
    "deposits" TEXT NOT NULL DEFAULT '[]',
    "notes" TEXT NOT NULL DEFAULT '',
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MiningBody" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "system" TEXT NOT NULL,
    "systemAddress" TEXT,
    "body" TEXT NOT NULL,
    "out" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT NOT NULL DEFAULT '',
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanModule_planId_slot_key" ON "PlanModule"("planId", "slot");

-- CreateIndex
CREATE INDEX "Loop_startAt_idx" ON "Loop"("startAt");

-- CreateIndex
CREATE UNIQUE INDEX "Loop_routeId_startAt_key" ON "Loop"("routeId", "startAt");

-- CreateIndex
CREATE INDEX "MarketSnapshot_marketId_commodity_at_idx" ON "MarketSnapshot"("marketId", "commodity", "at");

-- CreateIndex
CREATE INDEX "MarketSnapshot_system_marketId_at_idx" ON "MarketSnapshot"("system", "marketId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "MarketSnapshot_marketId_commodity_at_key" ON "MarketSnapshot"("marketId", "commodity", "at");

-- CreateIndex
CREATE UNIQUE INDEX "MiningSite_body_number_key" ON "MiningSite"("body", "number");

-- CreateIndex
CREATE UNIQUE INDEX "MiningBody_body_key" ON "MiningBody"("body");
