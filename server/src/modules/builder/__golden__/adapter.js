// Adaptateur du golden : l'API photographiée, branchée sur le code réécrit (lecture d'eddb.js sans exécution,
// formules réimplémentées). La réécriture a d'abord redonné au bit près la photo de l'ancien code (étiquette git
// web-final) ; golden.json a ensuite été repris avec les corrections vérifiées contre edsy.org (voir golden.test.js).

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { REF_DIR } from '../../../core/reference/download.js';
import { loadReference } from '../../../core/reference/refdata.js';
import {
  GROUPS, HASH_VERSION, SHIP_HATCH_ID, MIN_VERSION,
  hashEncode, hashDecode, hashEncodeT, hashDecodeT, loadEddb, extractHash, decodeEdsy, edsyToTargets, findLoadout,
} from '../../../core/reference/edsy.js';
import {
  moduleOf, stockBuild, maxCoreBuild, decodedToBuild, safeName, encodeEdsy, buildToDecoded, shipIdOf, loadoutToBuild,
  moduleAllowed,
} from '../../../core/reference/edsyBuild.js';
import { computeStats, massCurve, effectiveResistance } from '../stats.js';
import { fitModule, firingProfile } from '../attributes.js';

export const api = {
  REF_DIR,

  /**
   * Données de référence : eddb (identifiants et attributs des modules) et ref (coriolis, pour l'ingénierie), avec
   * l'empreinte du fichier eddb.js : la photo n'est comparable qu'avec exactement les mêmes données.
   */
  loadData(refDir = REF_DIR) {
    const file = path.join(refDir, 'edsy', 'eddb.js');
    if (!fs.existsSync(file)) return null;
    const eddb = loadEddb(refDir);
    let ref = null;
    try {
      ref = loadReference(refDir);
    } catch {
      // coriolis-data absent : edsyToTargets non photographié
    }
    const sha256 = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    return { eddb, ref, version: { eddb: eddb.version, eddbModified: eddb.edsy_lastmodified_db, eddbSha256: sha256 } };
  },

  // core/reference/edsy.js
  GROUPS, HASH_VERSION, SHIP_HATCH_ID, MIN_VERSION,
  hashEncode, hashDecode, hashEncodeT, hashDecodeT, extractHash, decodeEdsy, edsyToTargets, findLoadout,
  // core/reference/edsyBuild.js
  moduleOf, stockBuild, maxCoreBuild, decodedToBuild, safeName, encodeEdsy, buildToDecoded, shipIdOf, loadoutToBuild,
  moduleAllowed,
  // modules/builder/stats.js
  computeStats, massCurve, effectiveResistance,

  /** Valeur effective d'un attribut d'un module installé (modification au grade, effet expérimental). */
  moduleValue(eddb, ship, entry, attr) {
    return fitModule(eddb, ship, entry).value(attr);
  },

  /** Cadences et DPS d'une arme : soutenus (rechargements compris) et en rafale. */
  weaponRates(eddb, ship, entry) {
    const p = firingProfile(fitModule(eddb, ship, entry));
    return { srof: p.sustainedRate, sdps: p.sustainedDps, brof: p.burstRate, bdps: p.burstDps };
  },
};
