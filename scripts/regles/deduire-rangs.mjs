// Déduction de la progression de rang des ingénieurs (table des règles, rankRules.js) depuis les vrais journaux.
//
//   node scripts/regles/deduire-rangs.mjs            relit les journaux, affiche la déduction et l'écart avec la table
//   node scripts/regles/deduire-rangs.mjs --ecrire   écrit aussi les séquences dans server/src/regles/ingenierie/rankSequences.json
//
// Dossier des journaux : CONTROLE_JOURNAUX_REELS, sinon Saved Games (lecture seule). Les séquences gardées ne portent
// que les ingénieurs (noms des PNJ), les rangs, les relevés, les dates et les grades appliqués (rien du commandant).
// Les hypothèses du modèle sont écrites en tête de server/src/regles/ingenierie/rankModel.js.
// Il recompte aussi, jour par jour, les relevés de progression (EngineerProgress complets et unitaires) et les
// applications : sur la période déclarée (JOURNAUX_PERIOD), ils doivent donner les comptes de PROGRESS_AT_LOAD_ONLY.
// Après --ecrire : recopier les chiffres affichés dans RANK_TABLE, CARRY_RATIO et PROGRESS_AT_LOAD_ONLY (rankRules.js),
// relire le diff, puis lancer les tests (ranks.test.js vérifie que la table est bien la sortie de la déduction et que
// les comptes sont ceux de la période).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dossierJournauxReels, journauxReels } from '../controle/anonymat/secrets.mjs';
import { buildRankLog, PLACE_EVENTS } from '../../server/src/modules/engineering/services/ranks.js';
import { FLEET_EVENTS } from '../../server/src/modules/engineering/services/fleet.js';
import { compactSequences, deduceRankModel, tableFromModel } from '../../server/src/regles/ingenierie/rankModel.js';
import { RANK_TABLE, CARRY_RATIO, RANK_RULES, JOURNAUX_PERIOD } from '../../server/src/regles/ingenierie/rankRules.js';
import { loadReference } from '../../server/src/core/reference/refdata.js';

const OUT = fileURLToPath(new URL('../../server/src/regles/ingenierie/rankSequences.json', import.meta.url));
const ecrire = process.argv.includes('--ecrire');
const dossier = dossierJournauxReels();
const fichiers = journauxReels(dossier);
if (!fichiers.length) {
  console.error(`Aucun journal dans ${dossier}.`);
  process.exit(1);
}
const ref = loadReference();
if (!ref) {
  console.error('Données de référence absentes (ateliers des ingénieurs) : lance l’app une fois pour les télécharger.');
  process.exit(1);
}
const keep = new Set([...FLEET_EVENTS, ...PLACE_EVENTS]);
const events = [];
for (const f of fichiers) {
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const ev = JSON.parse(line);
      if (keep.has(ev.event)) events.push(ev);
    } catch {
      // ligne coupée : ignorée
    }
  }
}
const log = buildRankLog(events, { workshopOf: (n) => Number(ref.engineerBases.get(n)?.marketId) || null });
const sequences = compactSequences(log.sequences);
const model = deduceRankModel(sequences);
console.log(`${fichiers.length} journaux, ${log.applications.length} applications, ${sequences.length} séquences sous le rang 5 (${model.used} utilisées${model.skipped.length ? `, ${model.skipped.length} écartées` : ''}).`);
for (const s of model.skipped) console.log(`  écartée : ${s.engineer}, rang ${s.rank} (${s.why})`);
if (!model.feasible) {
  console.log('Le modèle (rankModel.js, H1 à H6) ne s’accorde avec aucune valeur : à revoir.');
  process.exit(2);
}
const table = tableFromModel(model);
const declared = new Map(RANK_TABLE.map((r) => [`${r.rank}|${r.grade}`, r.climb]));
let ecarts = 0;
for (const row of table.gains) {
  const d = declared.get(`${row.rank}|${row.grade}`);
  const same = d && d.gainMin === row.gainMin && d.gainMax === row.gainMax;
  if (!same) ecarts++;
  console.log(`rang ${row.rank} G${row.grade} : ${row.gainMin} à ${row.gainMax ?? 'non bornée'} %${row.lowerUnbounded ? ' (borne basse non bornée : 0)' : ''}${same ? '' : `   ≠ table : ${d?.gainMin} à ${d?.gainMax}`}`);
}
for (const c of table.carry) {
  const same = CARRY_RATIO[c.from] === c.ratioMax;
  if (!same) ecarts++;
  console.log(`report rang ${c.from} → ${c.to} : au plus × ${c.ratioMax ?? 'non borné'}${same ? '' : `   ≠ table : ${CARRY_RATIO[c.from]}`}`);
}
// Relevés de progression et applications, jour par jour (dates UTC) : de quoi recompter les observations de la table
// sur la période déclarée (JOURNAUX_PERIOD). Rien que des dates et des nombres.
const journal = {};
for (const ev of events) {
  if (ev.event !== 'EngineerProgress' && ev.event !== 'EngineerCraft') continue;
  const d = String(ev.timestamp).slice(0, 10);
  const x = (journal[d] ||= { full: 0, single: 0, singleWithProgress: 0, crafts: 0 });
  if (ev.event === 'EngineerCraft') x.crafts++;
  else if (Array.isArray(ev.Engineers)) x.full++;
  else {
    x.single++;
    if (ev.RankProgress != null) x.singleWithProgress++;
  }
}
const inPeriod = Object.entries(journal).filter(([d]) => d >= JOURNAUX_PERIOD.first && d <= JOURNAUX_PERIOD.last).map(([, x]) => x);
const total = (k) => inPeriod.reduce((a, x) => a + x[k], 0);
const counts = RANK_RULES.PROGRESS_AT_LOAD_ONLY.counts;
const sameCounts = total('full') === counts.full && total('single') === counts.single && total('singleWithProgress') === 0 && total('crafts') === JOURNAUX_PERIOD.applications;
if (!sameCounts) ecarts++;
console.log(`du ${JOURNAUX_PERIOD.first} au ${JOURNAUX_PERIOD.last} : ${total('crafts')} applications, ${total('full')} relevés complets, ${total('single')} événements unitaires (${total('singleWithProgress')} avec RankProgress)${sameCounts ? '' : `   ≠ table : ${JOURNAUX_PERIOD.applications} applications, ${counts.full} relevés, ${counts.single} unitaires`}`);
console.log(ecarts ? `${ecarts} écart(s) avec la table déclarée.` : 'La table déclarée est la sortie de la déduction.');
if (ecrire) {
  const body = {
    note: 'Séquences de montée de rang lues dans les journaux de référence (scripts/regles/deduire-rangs.mjs) : ingénieurs, rangs, relevés et grades seulement. G3d : à distance ; G5x : effet expérimental ; G2? : lieu inconnu. journal : par jour (UTC), EngineerProgress complets (full) et unitaires (single, dont avec RankProgress), EngineerCraft (crafts).',
    sequences,
    journal: Object.fromEntries(Object.entries(journal).sort(([a], [b]) => a.localeCompare(b))),
  };
  fs.writeFileSync(OUT, `${JSON.stringify(body, null, 1)}\n`);
  console.log(`Écrit : ${path.relative(process.cwd(), OUT)}`);
}
