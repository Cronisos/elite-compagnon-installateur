// Recomptage des observations chiffrées de la table des règles de l'itinéraire (itineraryRules.js) dans les VRAIS
// journaux, en lecture seule. Rien n'est écrit ; rien du commandant n'est affiché (seulement des comptes et des noms
// d'ingénieurs, des PNJ).
//
//   node scripts/regles/verifier-itineraire.mjs
//
// Dossier des journaux : CONTROLE_JOURNAUX_REELS, sinon Saved Games. Période : celle de ITINERARY_PERIOD (du 23 oct.
// au 9 nov. 2026 à 10:47 UTC) ; les journaux plus récents sont ignorés, pour que les comptes restent comparables.
// Sort en erreur (code 1) si un compte diffère de celui que la table déclare. Pas dans `npm run controle` : il faut les
// vrais journaux.

import fs from 'node:fs';
import { dossierJournauxReels, journauxReels } from '../controle/anonymat/secrets.mjs';
import { loadReference } from '../../server/src/core/reference/refdata.js';
import { loadEngineerData, indexEngineerData, maxGradeOf, canonicalBlueprint } from '../../server/src/modules/engineering/services/engineerData.js';
import { dockOf, hostOf } from '../../server/src/modules/engineering/services/workshop.js';
import { RULES_BY_ID } from '../../server/src/modules/engineering/services/itineraryRules.js';

const END = '2026-11-09T10:48:00Z';
const dossier = dossierJournauxReels();
const fichiers = journauxReels(dossier).filter((f) => /Journal\.(\d{4}-\d{2}-\d{2})/.exec(f)?.[1] <= '2026-11-09');
if (!fichiers.length) {
  console.error(`Aucun journal dans ${dossier}.`);
  process.exit(1);
}
const ref = loadReference();
const eng = loadEngineerData();
if (!ref || eng.error) {
  console.error(!ref ? 'Données de référence absentes : lance l’app une fois.' : `data/engineers.json : ${eng.error}`);
  process.exit(1);
}
const idx = indexEngineerData(eng.data);
const lower = (s) => String(s ?? '').toLowerCase();

const c = { effects: 0, effectHostRank5Same: 0, effectHostOther: 0, effectOtherRank: [], r5a: 0, r5bAbove: 0, r6bSame: 0, r6bKept: 0, r6bOther: 0, r6cRemote: 0, r7b: 0, remote: 0, surfaceDocks: 0, surfaceEngineer: 0, sellBuy: 0, sellBuyReused: 0, acquainted: 0, r12b: 0, basesSeen: new Set(), basesShipyard: 0, files: 0 };
const rank = new Map(); // nom → rang
const mods = new Map(); // vaisseau|emplacement → { bp, level, eff, effHost, remoteBy }
let ship = null;
let dock = null;
const pendingSell = new Set();

for (const f of fichiers) {
  c.files += 1;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    if (String(ev.timestamp) >= END) continue;
    switch (ev.event) {
      case 'LoadGame':
        if (ev.ShipID != null) ship = ev.ShipID;
        dock = null;
        break;
      case 'ShipyardSwap':
        ship = ev.ShipID;
        break;
      case 'ShipyardBuy':
        if (ev.SellShipID != null) {
          c.sellBuy += 1;
          pendingSell.add(ev.SellShipID);
        }
        break;
      case 'ShipyardNew':
        if (pendingSell.has(ev.NewShipID)) c.sellBuyReused += 1;
        pendingSell.clear();
        break;
      case 'Loadout':
        ship = ev.ShipID;
        for (const m of ev.Modules || []) {
          const g = m.Engineering;
          const k = `${ship}|${lower(m.Slot)}`;
          const prev = mods.get(k);
          mods.set(k, g ? { bp: g.BlueprintName, level: g.Level, eff: g.ExperimentalEffect || null, effHost: prev && prev.bp === g.BlueprintName && prev.eff === (g.ExperimentalEffect || null) ? prev.effHost : null, remoteBy: prev?.bp === g.BlueprintName ? prev.remoteBy : null } : null);
        }
        break;
      case 'Docked':
      case 'Location': {
        const d = dockOf(ev);
        if (ev.event === 'Location' && !ev.Docked) {
          dock = null;
          break;
        }
        dock = d;
        if (d?.stationType === 'SurfaceStation') {
          c.surfaceDocks += 1;
          if (d.services.engineer) c.surfaceEngineer += 1;
        }
        const h = d ? hostOf(d, idx) : null;
        if (h && !c.basesSeen.has(h.id)) {
          c.basesSeen.add(h.id);
          if (d.services.shipyard) c.basesShipyard += 1;
        }
        break;
      }
      case 'Undocked':
        dock = null;
        break;
      case 'EngineerProgress':
        for (const x of Array.isArray(ev.Engineers) ? ev.Engineers : [ev]) {
          if (x?.Progress === 'Acquainted') c.acquainted += 1;
          if (x?.Engineer && Number.isInteger(x.Rank)) rank.set(x.Engineer, x.Rank);
        }
        break;
      case 'EngineerCraft': {
        const k = `${ship}|${lower(ev.Slot)}`;
        const before = mods.get(k);
        const host = dock ? hostOf(dock, idx) : null;
        const grp = ref.groupOf(ev.Module);
        const bp = canonicalBlueprint(ref, grp, ev.BlueprintName);
        if (ev.ApplyExperimentalEffect) {
          c.effects += 1;
          if (host && host.name === ev.Engineer && rank.get(host.name) === 5) c.effectHostRank5Same += 1;
          else if (host) {
            c.effectHostOther += 1;
            c.effectOtherRank.push(rank.get(host.name));
          }
          if (host && bp) {
            const max = maxGradeOf(ref, idx, host.id, grp, bp);
            if (max < 5 && ev.Level <= max) c.r5a += 1;
            if (ev.Level > max) c.r5bAbove += 1;
          }
          mods.set(k, { bp: ev.BlueprintName, level: ev.Level, eff: ev.ExperimentalEffect || ev.ApplyExperimentalEffect, effHost: host?.name ?? null, remoteBy: before?.remoteBy ?? null });
          break;
        }
        const remote = !!dock && host?.name !== ev.Engineer;
        if (remote) c.remote += 1;
        if (before?.eff && before.bp === ev.BlueprintName) {
          if (remote) c.r6cRemote += 1;
          else {
            c.r6bSame += 1;
            if ((ev.ExperimentalEffect || null) === before.eff) c.r6bKept += 1;
            if (before.effHost && host && before.effHost !== host.name) c.r6bOther += 1;
          }
        }
        if (before?.eff && before.bp !== ev.BlueprintName && !ev.ExperimentalEffect) c.r7b += 1;
        // R12b : à l'atelier d'un ingénieur, le même plan juste après des grades faits à distance chez un autre
        if (!remote && dock && before?.bp === ev.BlueprintName && before.remoteBy && before.remoteBy !== ev.Engineer) c.r12b += 1;
        mods.set(k, { bp: ev.BlueprintName, level: ev.Level, eff: ev.ExperimentalEffect || null, effHost: before?.bp === ev.BlueprintName ? before.effHost : null, remoteBy: remote ? ev.Engineer : null });
        break;
      }
      default:
        break;
    }
  }
}

const checks = [
  ['R4a : effets posés dans une base d’ingénieur', c.effectHostRank5Same + c.effectHostOther, RULES_BY_ID.get('R4a').observations],
  ['R4a : effets en tout', c.effects, 32],
  ['effets chez un hôte au rang 5 qui en est l’auteur', c.effectHostRank5Same, 31],
  ['effets chez un autre hôte (Muang, rang 3)', c.effectHostOther, 1],
  ['R5a : effet chez un ingénieur qui ne monte pas ce plan au G5', c.r5a, RULES_BY_ID.get('R5a').observations],
  ['R5b : effet au-dessus du grade max de l’hôte', c.r5bAbove, RULES_BY_ID.get('R5b').observations],
  ['R6b : même plan monté à un atelier sur un module à effet', c.r6bSame, RULES_BY_ID.get('R6b').observations],
  ['R6b : effet gardé', c.r6bKept, RULES_BY_ID.get('R6b').observations],
  ['R6b : chez un autre ingénieur que celui qui l’a posé', c.r6bOther, 61],
  ['R6c : montée à distance d’un module à effet', c.r6cRemote, RULES_BY_ID.get('R6c').observations],
  ['R7b : effets perdus par un changement de plan', c.r7b, RULES_BY_ID.get('R7b').observations],
  ['R3a : applications à distance', c.remote, RULES_BY_ID.get('R3a').observations],
  ['R3a : installations au sol avec le service « engineer »', c.surfaceEngineer, 0],
  ['R12b : reprise à l’atelier après des grades à distance d’un autre', c.r12b, RULES_BY_ID.get('R12b').observations],
  ['R13 : bases d’ingénieurs relevées', c.basesSeen.size, RULES_BY_ID.get('R13').observations],
  ['R13 : bases avec un chantier naval', c.basesShipyard, 0],
  ['R15 : états « Acquainted »', c.acquainted, RULES_BY_ID.get('R15').observations],
  ['R17 : vaisseaux vendus à l’achat d’un autre', c.sellBuy, RULES_BY_ID.get('R17').observations],
  ['R17 : numéro repris par le neuf', c.sellBuyReused, RULES_BY_ID.get('R17').observations],
];
let bad = 0;
console.log(`${c.files} journaux (jusqu’au 9 nov. 2026 10:47 UTC), installations au sol : ${c.surfaceDocks} amarrages.`);
for (const [what, got, want] of checks) {
  const ok = got === want;
  if (!ok) bad += 1;
  console.log(`${ok ? '✔' : '✖'} ${what} : ${got}${ok ? '' : ` (la table dit ${want})`}`);
}
if (bad) {
  console.log(`${bad} compte(s) différent(s) de la table : relis itineraryRules.js (la table ne change jamais d’elle-même).`);
  process.exit(1);
}
console.log('Tous les comptes de la table sont retrouvés.');
