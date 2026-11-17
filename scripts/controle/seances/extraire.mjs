// Fabrique les séances de référence du banc à partir des VRAIS journaux de Cro (lecture seule), anonymisées.
//
//   node scripts/controle/seances/extraire.mjs            toutes les séances
//   node scripts/controle/seances/extraire.mjs <id> …     seulement celles-là
//
// Dossier des vrais journaux : CONTROLE_JOURNAUX_REELS, sinon Saved Games (voir anonymat/secrets.mjs). Les secrets
// (nom du commandant, FID, escadron, porteurs, amis, vaisseaux…) sont relevés dans TOUS les journaux, gardés en mémoire,
// remplacés (anonymat/anonymiser.mjs), puis chaque fichier écrit est revérifié : s'il en reste un, rien n'est écrit.
// Une séance peut être un extrait : l'en-tête du journal (jusqu'à Missions, ou une minute après LoadGame) est gardé,
// puis seulement les lignes entre « de » et « a ».
//
// Après une extraction, relire les séances changées (git diff), puis regénérer les résultats attendus du rejeu
// (CONTROLE_UPDATE=1 npm run controle -- --etape=rejeu) et les relire aussi avant de les valider.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { anonymizeJournal, leaks, strayCallsigns, CMDR, FID } from '../anonymat/anonymiser.mjs';
import { dossierJournauxReels, lireSecrets } from '../anonymat/secrets.mjs';
import { SEANCES, SERVEUR } from '../banc/chemins.mjs';

/** Séances de référence : d'où elles viennent et pourquoi. */
export const DEFINITIONS = [
  {
    id: 'minage-rhino-2026-11-07',
    titre: 'Minage en SRV (Rhino) à Synuefe OU-E c28-2 : iridium raffiné, vendu à Rivers Depot et Flinders City avec mérites, recherche et sauvetage',
    fichiers: [{ source: 'Journal.2026-11-07T091533.01.log' }],
  },
  {
    id: 'ventes-powerplay-2026-10-31',
    titre: 'Ventes Powerplay : rhodplumsite à HIP 8060, palladium, puis 1 184 t d\'iridium miné à Synuefe GA-I b57-6 vendues sur place pour 0 mérite',
    fichiers: [{ source: 'Journal.2026-10-31T155928.01.log', de: '2026-10-31T17:00:00Z' }],
  },
  {
    id: 'ventes-powerplay-2026-11-06',
    titre: 'Ventes Powerplay du 6 nov. : iridium miné en SRV, 268 t vendues trois fois à Flinders City (environ 20 000 mérites chaque fois)',
    fichiers: [{ source: 'Journal.2026-11-06T095700.01.log' }],
  },
  {
    id: 'boucle-commerce-2026-10-27',
    titre: 'Boucle de commerce bauxite / indium entre Port Draught et Meech Dock (route de référence du cahier des charges, 27-28 oct.)',
    fichiers: [{ source: 'Journal.2026-10-27T181355.01.log', de: '2026-10-27T22:20:00Z', a: '2026-10-28T00:02:30Z' }],
  },
  {
    id: 'mort-srv-2026-10-29',
    titre: 'Deux SRV détruits à 16 Librae (retour gratuit), puis le vaisseau détruit et racheté (20,6 M cr)',
    fichiers: [
      { source: 'Journal.2026-10-29T111437.01.log', de: '2026-10-29T12:26:00Z' },
      { source: 'Journal.2026-10-29T150723.01.log', a: '2026-10-29T14:45:00Z' },
    ],
  },
  {
    id: 'objectif-communautaire-2026-10-26',
    titre: 'Objectifs communautaires : suivi de l\'objectif commercial d\'AD Leonis, puis inscription à l\'opération minière de Reorte',
    fichiers: [{ source: 'Journal.2026-10-26T103715.01.log', de: '2026-10-26T19:30:00Z' }],
  },
  {
    id: 'ingenieur-2026-11-02',
    titre: 'Contribution à un ingénieur : thé de Fujin livré à Broo Tarquin en trois fois, avec un amarrage refusé (trop loin) à Futen Spaceport',
    fichiers: [{ source: 'Journal.2026-11-02T184317.01.log', de: '2026-11-02T18:15:00Z', a: '2026-11-02T19:45:00Z' }],
  },
  {
    id: 'rangs-ingenieurs-2026-11-05',
    titre: 'Rangs d\'ingénieur : Lei Cheung débloqué et monté du rang 1 au rang 5 (1er nov.), The Dweller (rang 3, 40 %) et Selene Jean (rang 4) montés au rang 5 ; Broo Tarquin (rang 3, 24 %) : 5 applications de G3 à distance sans montée, puis rang 5 à son atelier (5 nov.)',
    fichiers: [
      { source: 'Journal.2026-11-01T150447.01.log', de: '2026-11-01T22:30:00Z', a: '2026-11-01T23:58:00Z' },
      { source: 'Journal.2026-11-05T131516.01.log', a: '2026-11-05T12:37:00Z' },
    ],
  },
  {
    id: 'saut-porteur-2026-11-01',
    titre: 'Saut de porteur et amarrage refusé : départ de Synuefe GA-I b57-6, vaisseaux échangés sur un porteur, reliques vendues avec mérites',
    fichiers: [{ source: 'Journal.2026-11-01T103230.01.log' }],
  },
];

const EN_TETE_FIN = 'Missions';
const EN_TETE_MS = 60_000;

/** Lignes gardées d'un journal : l'en-tête, puis celles de la fenêtre [de, a]. */
export function extrait(texte, { de, a } = {}) {
  const lignes = texte.split(/\r?\n/).filter((l) => l.trim());
  if (!de && !a) return lignes;
  const debut = de ? Date.parse(de) : -Infinity;
  const fin = a ? Date.parse(a) : Infinity;
  const out = [];
  let enTete = true;
  let loadGame = null;
  for (const l of lignes) {
    let ev;
    try { ev = JSON.parse(l); } catch { continue; }
    const t = Date.parse(ev.timestamp);
    if (enTete) {
      if (ev.event === 'LoadGame') loadGame = t;
      const finie = loadGame != null && t > loadGame + EN_TETE_MS;
      if (!finie) {
        out.push(l);
        if (ev.event === EN_TETE_FIN) enTete = false;
        continue;
      }
      enTete = false;
    }
    if (t >= debut && t <= fin) out.push(l);
  }
  return out;
}

/** Vérifie qu'un texte de séance ne contient plus aucun secret ; renvoie la liste des problèmes (sans les valeurs). */
export function verifier(texte, gele) {
  const p = [];
  const strict = leaks(texte, gele.strict);
  if (strict.length) p.push(`${strict.length} occurrence(s) du nom du commandant ou du FID`);
  const autres = leaks(texte, gele.forbidden, { words: true }).filter((s) => !gele.strict.includes(s));
  if (autres.length) p.push(`${autres.length} secret(s) (escadron, porteur, ami, vaisseau…)`);
  const indicatifs = strayCallsigns(texte);
  if (indicatifs.length) p.push(`${indicatifs.length} indicatif(s) de porteur non remplacé(s)`);
  if (/"event"\s*:\s*"(ReceiveText|SendText)"/.test(texte)) p.push('message de chat');
  return p;
}

const ecrire = (fichier, texte) => {
  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  const tmp = `${fichier}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, texte);
  fs.renameSync(tmp, fichier);
};
const derniere = (lignes) => {
  for (let i = lignes.length - 1; i >= 0; i -= 1) {
    const m = /"timestamp"\s*:\s*"([^"]+)"/.exec(lignes[i]);
    if (m) return Date.parse(m[1]);
  }
  return null;
};
const plus5min = (t) => new Date(t + 5 * 60_000).toISOString().replace('.000Z', 'Z');

/** Séance tirée des vrais journaux. */
function extraireSeance(def, dossierReel, gele) {
  const dossier = path.join(SEANCES, def.id);
  const sorties = [];
  let fin = null;
  for (const f of def.fichiers) {
    const source = path.join(dossierReel, f.source);
    if (!fs.existsSync(source)) throw new Error(`${def.id} : journal introuvable (${f.source}).`);
    const lignes = extrait(fs.readFileSync(source, 'utf8'), f);
    const texte = anonymizeJournal(lignes.join('\n'), gele);
    const problemes = verifier(texte, gele);
    if (problemes.length) throw new Error(`${def.id} / ${f.source} : ${problemes.join(', ')}. Rien n'est écrit.`);
    sorties.push({ nom: f.source, texte, lignes: texte.split('\r\n').filter(Boolean).length, source: f });
    fin = Math.max(fin ?? 0, derniere(texte.trimEnd().split('\r\n')) ?? 0);
  }
  return ecrireSeance(dossier, def, sorties, fin, gele);
}

function ecrireSeance(dossier, def, sorties, fin, gele) {
  const meta = {
    titre: def.titre,
    origine: def.origine || 'journaux réels de Cro, anonymisés (scripts/controle/seances/extraire.mjs)',
    maintenant: def.maintenant || plus5min(fin),
    fichiers: sorties.map((s) => ({ nom: s.nom, lignes: s.lignes, ...(s.source.de ? { de: s.source.de } : {}), ...(s.source.a ? { a: s.source.a } : {}) })),
    ...(def.datesOptions ? { datesOptions: def.datesOptions } : {}),
  };
  const metaTexte = `${JSON.stringify(meta, null, 2)}\n`;
  if (gele && verifier(metaTexte, gele).length) throw new Error(`${def.id} : la description contient un secret. Rien n'est écrit.`);
  fs.rmSync(dossier, { recursive: true, force: true });
  for (const s of sorties) ecrire(path.join(dossier, s.nom), s.texte);
  ecrire(path.join(dossier, 'seance.json'), metaTexte);
  return { id: def.id, fichiers: sorties.length, lignes: sorties.reduce((n, s) => n + s.lignes, 0), octets: sorties.reduce((n, s) => n + Buffer.byteLength(s.texte), 0) };
}

/** Séance construite à partir des exemples documentés de colonisation (aucun vrai journal : Cro ne colonise pas encore). */
export async function seanceColonisation() {
  const ex = await import(pathToFileURL(path.join(SERVEUR, 'src', 'modules', 'colonisation', 'fixtures', 'examples.js')).href);
  const SHIP = ex.DOCKED_SHIP.MarketID;
  const at = (hms) => `2026-11-01T${hms}Z`;
  const evs = [
    { timestamp: at('19:55:00'), event: 'Fileheader', part: 1, language: 'French/FR', Odyssey: true, gameversion: '4.3.0.1', build: 'r000000/r0 ' },
    { timestamp: at('19:55:20'), event: 'Commander', FID, Name: CMDR },
    { timestamp: at('19:55:21'), event: 'LoadGame', FID, Commander: CMDR, Horizons: true, Odyssey: true, Ship: 'type9', Ship_Localised: 'Type-9 Heavy', ShipID: 1, ShipName: 'Vaisseau 1', ShipIdent: 'TS-01', FuelLevel: 32, FuelCapacity: 32, GameMode: 'Solo', Credits: 250000000, Loan: 0, language: 'French/FR', gameversion: '4.3.0.1', build: 'r000000/r0 ' },
    { timestamp: at('19:55:30'), event: 'Location', Docked: false, StarSystem: ex.DOCKED_SHIP.StarSystem, SystemAddress: ex.DOCKED_SHIP.SystemAddress, StarPos: [0, 0, 0], Body: ex.DOCKED_SHIP.StarSystem, BodyType: 'Star' },
    { ...ex.dockedAt(SHIP, at('20:00:00')) },
    ex.depotAt(SHIP, at('20:00:05')),
    ex.contributionAt(SHIP, at('20:01:00'), { steel: 500 }),
    ex.depotAt(SHIP, at('20:01:00'), { steel: 1220 }),
    { timestamp: at('20:05:00'), event: 'Undocked', StationName: ex.DOCKED_SHIP.StationName, StationType: ex.DOCKED_SHIP.StationType, MarketID: SHIP, Taxi: false, Multicrew: false },
    { ...ex.SETTLEMENT_WITH_SERVICE, timestamp: at('20:20:00') },
    { ...ex.CLAIM, timestamp: at('20:30:00') },
    { ...ex.BEACON, timestamp: at('20:36:00') },
    { ...ex.RELEASE, timestamp: at('21:00:00') },
    { timestamp: at('21:05:00'), event: 'Shutdown' },
  ];
  const texte = `${evs.map((e) => JSON.stringify(e)).join('\r\n')}\r\n`;
  return { texte, fin: Date.parse(at('21:05:00')) };
}

// --- Ligne de commande ---
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync.native(process.argv[1])).href) {
  const voulues = new Set(process.argv.slice(2));
  const dossierReel = dossierJournauxReels();
  const secrets = lireSecrets(dossierReel);
  if (!secrets) {
    console.error(`Aucun vrai journal dans ${dossierReel} : impossible d'extraire (et d'anonymiser) les séances.`);
    process.exit(1);
  }
  console.log(`Secrets relevés dans ${secrets.fichiers} journaux (lecture seule) : ${secrets.commandants} commandant, ${secrets.fids} FID, ${secrets.gele.strings.size} remplacements.`);
  try {
    for (const def of DEFINITIONS) {
      if (voulues.size && !voulues.has(def.id)) continue;
      const r = extraireSeance(def, dossierReel, secrets.gele);
      console.log(`  ${r.id} : ${r.fichiers} journal(aux), ${r.lignes} lignes, ${Math.round(r.octets / 1024)} Ko`);
    }
    if (!voulues.size || voulues.has('colonisation-exemples')) {
      const { texte, fin } = await seanceColonisation();
      const problemes = verifier(texte, secrets.gele);
      if (problemes.length) throw new Error(`colonisation-exemples : ${problemes.join(', ')}`);
      const r = ecrireSeance(path.join(SEANCES, 'colonisation-exemples'), {
        id: 'colonisation-exemples',
        titre: 'Colonisation : exemples documentés du module (dépôt, livraison, revendication, balise, abandon), sur un journal construit',
        origine: 'exemples documentés de server/src/modules/colonisation/fixtures/examples.js (EDDI, BGS-Tally, SrvSurvey, schéma edomh), journal construit',
      }, [{ nom: 'Journal.2026-11-01T195500.01.log', texte, lignes: texte.split('\r\n').filter(Boolean).length, source: {} }], fin, secrets.gele);
      console.log(`  ${r.id} : ${r.lignes} lignes (exemples documentés)`);
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
