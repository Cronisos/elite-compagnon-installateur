// Outils communs aux étapes du contrôle : lancer une commande sans shell, garder sa sortie dans un journal, résumer les
// tests de node --test, et signaler un échec avec un message clair en français.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** Échec d'une étape : `message` est affiché tel quel, `details` (dernières lignes d'une commande) en dessous. */
export class EchecEtape extends Error {
  constructor(message, { details = '', journal = null } = {}) {
    super(message);
    this.name = 'EchecEtape';
    this.details = details;
    this.journal = journal;
  }
}

/** Variables jamais transmises aux commandes des étapes (elles changeraient ce qui est contrôlé). */
const ECARTEES = [/^ELITE_/, /^NODE_OPTIONS$/, /^NODE_TEST_CONTEXT$/, /^GOLDEN_UPDATE$/, /^GOLDEN_REF_DIR$/];
export function envPropre(plus = {}) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !ECARTEES.some((re) => re.test(k))));
  return { ...env, NO_COLOR: '1', FORCE_COLOR: '0', CHECKPOINT_DISABLE: '1', ...plus };
}

/**
 * Lance `node <args>` (jamais de shell : aucun argument n'est interprété) et attend la fin.
 * La sortie complète va dans `journal` ; elle est aussi rendue. Code de sortie non nul : EchecEtape.
 * @returns {Promise<{ sortie: string, journal: string }>}
 */
export function node(args, { cwd, env = envPropre(), journal, titre, delaiMs = 15 * 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(journal), { recursive: true });
    const flux = fs.createWriteStream(journal);
    const morceaux = [];
    const enfant = spawn(process.execPath, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const garder = (d) => {
      morceaux.push(d);
      flux.write(d);
    };
    enfant.stdout.on('data', garder);
    enfant.stderr.on('data', garder);
    const minuterie = setTimeout(() => enfant.kill(), delaiMs);
    enfant.on('error', (err) => {
      clearTimeout(minuterie);
      flux.end();
      reject(new EchecEtape(`${titre} : impossible de lancer node (${err.message}).`, { journal }));
    });
    enfant.on('close', (code, signal) => {
      clearTimeout(minuterie);
      flux.end();
      const sortie = Buffer.concat(morceaux).toString('utf8');
      if (code === 0) return resolve({ sortie, journal });
      const raison = signal ? `arrêtée (${signal}${signal === 'SIGTERM' ? `, plus de ${Math.round(delaiMs / 60000)} min` : ''})` : `code de sortie ${code}`;
      reject(new EchecEtape(`${titre} : ${raison}.`, { details: dernieresLignes(sortie, 40), journal }));
    });
  });
}

export function dernieresLignes(texte, n) {
  return String(texte).replace(/\r/g, '').trimEnd().split('\n').slice(-n).join('\n');
}

/** Résumé de node --test : { tests, pass, fail, skipped, todo, cancelled } (nombres), ou null s'il manque. */
export function bilanTests(sortie) {
  const lire = (nom) => {
    const m = new RegExp(`^ℹ ${nom} (\\d+)$`, 'm').exec(String(sortie).replace(/\r/g, ''));
    return m ? Number(m[1]) : null;
  };
  const b = { tests: lire('tests'), pass: lire('pass'), fail: lire('fail'), skipped: lire('skipped'), todo: lire('todo'), cancelled: lire('cancelled') };
  return b.tests == null ? null : b;
}

/** Tests en échec cités par node --test (« ✖ nom »), sans doublon. */
export function testsEnEchec(sortie) {
  const noms = String(sortie).replace(/\r/g, '').split('\n').filter((l) => /^\s*✖ /.test(l)).map((l) => l.trim().replace(/\s*\(\d+(\.\d+)?ms\)$/, ''));
  return [...new Set(noms)].filter((n) => n !== '✖ failing tests:');
}

/** Lance une suite node --test et la résume ; échec si un test échoue, est annulé, ou si aucun test n'a tourné. */
export async function suiteNodeTest({ titre, cwd, motifs, env, journal }) {
  let r;
  try {
    r = await node(['--test', ...motifs], { cwd, env, journal, titre });
  } catch (err) {
    if (err instanceof EchecEtape) {
      const fichier = err.journal && fs.existsSync(err.journal) ? fs.readFileSync(err.journal, 'utf8') : '';
      const b = bilanTests(fichier);
      const noms = testsEnEchec(fichier).slice(0, 10);
      if (b) {
        err.message = `${titre} : ${b.fail} test(s) en échec${b.cancelled ? `, ${b.cancelled} annulé(s)` : ''} sur ${b.tests}.`;
        if (noms.length) err.details = `${noms.join('\n')}\n\n${err.details}`;
      }
    }
    throw err;
  }
  const b = bilanTests(r.sortie);
  if (!b) throw new EchecEtape(`${titre} : résumé de node --test introuvable.`, { details: dernieresLignes(r.sortie, 20), journal: r.journal });
  if (b.tests === 0) throw new EchecEtape(`${titre} : aucun test trouvé (${motifs.join(' ')}).`, { journal: r.journal });
  if (b.fail || b.cancelled) throw new EchecEtape(`${titre} : ${b.fail} en échec, ${b.cancelled} annulé(s).`, { journal: r.journal });
  return { bilan: b, resume: `${b.pass} réussis sur ${b.tests}${b.skipped ? `, ${b.skipped} sauté(s)` : ''}` };
}
