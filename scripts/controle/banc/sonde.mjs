// Sonde du serveur isolé : préchargée (node --import) quand une étape la demande, demarrerServeur({ sonde: true }).
// Jamais chargée par l'app elle-même. Elle relève, et REFUSE, tout ce qu'un serveur isolé n'a pas à faire :
//
//   - réseau : connexion TCP, TLS ou UDP vers autre chose que ce PC (127.0.0.1, ::1, localhost), résolution DNS d'un
//     autre nom, écoute sur une autre adresse que ce PC, tube nommé ;
//   - programme lancé (child_process), quel qu'il soit ;
//   - disque : lecture hors du dossier du banc, de la worktree, des node_modules qu'elle utilise et de Node ; écriture
//     hors du dossier du banc ; chemin réseau ou de périphérique (\\serveur\partage, \\.\…) dans tous les cas.
//
// Un accès refusé échoue comme un fichier interdit (EACCES) ou un hôte injoignable : même attaqué, le serveur isolé ne
// touche à rien d'autre que son dossier temporaire. Le banc lit les relevés par le canal IPC ({ type: 'sonde' }), avec
// l'état des prototypes d'objets ({ type: 'sonde:repere' } en prend la photo de départ) : une clé « __proto__ » qui
// aurait pollué Object.prototype s'y voit.
//
// Dans un thread (Worker : le lecteur de texte des captures), la sonde se charge aussi (execArgv hérité) et envoie ses
// relevés au thread principal par un BroadcastChannel.
//
// CONTROLE_SONDE : JSON { "lire": [dossiers], "ecrire": [dossiers], "interdits": [dossiers] }, posé par banc/serveur.mjs
// (permisSonde) ; un dossier interdit l'est même en lecture, même s'il est sous un dossier permis.
//
// Elle relève aussi, sans rien refuser (ELITE_NO_NETWORK s'en charge), chaque tentative d'appel sortant que la passerelle
// du serveur annonce (server/src/core/net.js, canal de diagnostic « elite-compagnon:net ») : l'adresse exacte que le
// serveur AURAIT demandée (« sorties »). Le banc vérifie ainsi, réseau coupé, qu'aucune recherche en ligne ne part sans
// le choix du joueur et qu'aucune adresse piégée n'est construite.

import childProcess from 'node:child_process';
import dgram from 'node:dgram';
import diagnostics from 'node:diagnostics_channel';
import dns from 'node:dns';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainThread } from 'node:worker_threads';

const reglage = (() => {
  try {
    return JSON.parse(process.env.CONTROLE_SONDE || 'null');
  } catch {
    return null;
  }
})();

if (reglage) installer(reglage);

function installer({ lire = [], ecrire = [], interdits = [] }) {
  const norm = (d) => path.resolve(d).toLowerCase().replace(/[\\/]+$/, '');
  const racinesEcriture = ecrire.map(norm);
  const racinesLecture = [...lire, ...ecrire].map(norm);
  const racinesInterdites = interdits.map(norm);
  const MAX = 500;
  const releves = { reseau: [], programmes: [], disque: [], ecoutes: [] };
  let perdus = 0;
  const canal = typeof BroadcastChannel === 'function' ? new BroadcastChannel('elite-controle-sonde') : null;
  canal?.unref?.();

  const noter = (genre, info) => {
    if (!isMainThread) {
      try { canal?.postMessage({ genre, info: { ...info, thread: 'worker' } }); } catch { /* canal fermé */ }
      return;
    }
    if (releves[genre].length >= MAX) perdus += 1;
    else releves[genre].push(info);
  };
  if (isMainThread && canal) canal.onmessage = (e) => e.data?.genre && Object.hasOwn(releves, e.data.genre) && noter(e.data.genre, e.data.info);

  // --- Tentatives annoncées par la passerelle réseau du serveur (relevées, jamais refusées ici) ---
  const MAX_SORTIES = 2000;
  const sorties = [];
  let sortiesPerdues = 0;
  if (isMainThread) {
    diagnostics.subscribe('elite-compagnon:net', (m) => {
      if (sorties.length >= MAX_SORTIES) sortiesPerdues += 1;
      else sorties.push({ url: String(m?.url ?? '').slice(0, 500), refus: typeof m?.refused === 'string' ? m.refused : null });
    });
  }

  // --- Disque ---
  const texte = (p) => {
    if (typeof p === 'string') return p;
    if (Buffer.isBuffer(p)) return p.toString('utf8');
    if (p instanceof URL) {
      try { return fileURLToPath(p); } catch { return p.href; }
    }
    return null; // descripteur, FileHandle : déjà ouvert, donc déjà vérifié
  };
  /** Raison du refus d'un chemin, ou null. */
  const refusChemin = (brut, ecriture) => {
    let p = brut;
    if (/^[\\/]{2}/.test(p)) {
      const long = /^[\\/]{2}\?[\\/]([a-zA-Z]:[\\/].*)$/.exec(p); // \\?\C:\… : chemin long d'un disque local
      if (!long) return 'chemin réseau ou de périphérique';
      p = long[1];
    }
    if (p.includes('\0')) return null; // Node le refuse lui-même (ERR_INVALID_ARG_VALUE)
    const abs = norm(p);
    const dans = (racines) => racines.some((r) => abs === r || abs.startsWith(`${r}${path.sep}`));
    if (dans(racinesInterdites)) return 'données de l’app (server/data), jamais touchées par le serveur isolé';
    if (ecriture) return dans(racinesEcriture) ? null : 'écriture hors du dossier du banc';
    return dans(racinesLecture) ? null : 'lecture hors des dossiers permis';
  };
  const ouvertureEcrit = (flags) => {
    if (flags == null) return false;
    if (typeof flags === 'number') return (flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_APPEND)) !== 0;
    return !['r', 'rs', 'sr'].includes(String(flags));
  };
  const erreurDisque = (op, p) => Object.assign(new Error(`EACCES: accès refusé par la sonde du banc de contrôle, ${op} '${p}'`), { code: 'EACCES', errno: -4092, syscall: op, path: p });

  // Opérations : [nom, index des chemins lus, index des chemins écrits]
  const UN_LU = ['access', 'exists', 'lstat', 'stat', 'statfs', 'readdir', 'readFile', 'readlink', 'realpath', 'opendir', 'createReadStream', 'watch', 'watchFile', 'glob'];
  const UN_ECRIT = ['appendFile', 'chmod', 'chown', 'lchmod', 'lchown', 'lutimes', 'mkdir', 'mkdtemp', 'rm', 'rmdir', 'truncate', 'unlink', 'utimes', 'writeFile', 'createWriteStream'];
  const OPS = new Map([
    ...UN_LU.map((n) => [n, { lus: [0], ecrits: [] }]),
    ...UN_ECRIT.map((n) => [n, { lus: [], ecrits: [0] }]),
    ['open', { ouvrir: true }],
    ['copyFile', { lus: [0], ecrits: [1] }],
    ['cp', { lus: [0], ecrits: [1] }],
    ['link', { lus: [0], ecrits: [1] }],
    ['rename', { lus: [], ecrits: [0, 1] }],
    ['symlink', { lus: [], ecrits: [1] }],
  ]);

  const verifier = (op, args) => {
    const regle = OPS.get(op.replace(/Sync$/, ''));
    if (!regle) return null;
    const controles = regle.ouvrir ? [[0, ouvertureEcrit(args[1])]] : [...regle.lus.map((i) => [i, false]), ...regle.ecrits.map((i) => [i, true])];
    for (const [i, ecriture] of controles) {
      const p = texte(args[i]);
      if (p == null) continue;
      const raison = refusChemin(p, ecriture);
      if (raison) {
        noter('disque', { op, chemin: p, raison });
        return erreurDisque(op, p);
      }
    }
    return null;
  };

  const garderProprietes = (de, vers) => {
    for (const cle of Reflect.ownKeys(de)) {
      if (['length', 'name', 'prototype', 'arguments', 'caller'].includes(cle)) continue;
      try { Object.defineProperty(vers, cle, Object.getOwnPropertyDescriptor(de, cle)); } catch { /* propriété figée */ }
    }
  };
  const envelopper = (objet, nom, genre) => {
    const vrai = objet?.[nom];
    if (typeof vrai !== 'function' || vrai.__sonde) return;
    const enveloppe = function sonde(...args) {
      const err = verifier(nom, args);
      if (!err) return vrai.apply(this, args);
      if (genre === 'promesse') return Promise.reject(err);
      if (genre === 'rappel') {
        const rappel = [...args].reverse().find((a) => typeof a === 'function');
        if (nom === 'exists') {
          if (rappel) process.nextTick(rappel, false);
          return undefined;
        }
        if (rappel) {
          process.nextTick(rappel, err);
          return undefined;
        }
      }
      if (nom === 'existsSync') return false;
      throw err;
    };
    garderProprietes(vrai, enveloppe);
    Object.defineProperty(enveloppe, '__sonde', { value: true });
    objet[nom] = enveloppe;
  };
  const noms = [...OPS.keys()];
  for (const n of noms) {
    envelopper(fs, n, ['createReadStream', 'createWriteStream', 'watch', 'watchFile'].includes(n) ? 'direct' : 'rappel');
    envelopper(fs, `${n}Sync`, 'direct');
    envelopper(fs.promises, n, 'promesse');
  }
  for (const [objet, genre] of [[fs.realpath, 'rappel'], [fs.realpathSync, 'direct']]) {
    if (typeof objet?.native === 'function') {
      const vrai = objet.native;
      const nom = genre === 'direct' ? 'realpathSync' : 'realpath';
      objet.native = function sondeNative(...args) {
        const err = verifier(nom, args);
        if (!err) return vrai.apply(this, args);
        const rappel = args.find((a) => typeof a === 'function');
        if (genre === 'rappel' && rappel) return process.nextTick(rappel, err);
        throw err;
      };
    }
  }

  // --- Réseau ---
  const LOCAL = new Set(['localhost', '127.0.0.1', '::1', '::ffff:127.0.0.1', '[::1]']);
  const estLocal = (h) => h == null || h === '' || LOCAL.has(String(h).toLowerCase()) || /^127\.\d+\.\d+\.\d+$/.test(String(h)) || /^localhost\.?$/i.test(String(h));
  const erreurReseau = (cible) => Object.assign(new Error(`connexion refusée par la sonde du banc de contrôle : ${cible}`), { code: 'ECONNREFUSED' });

  const connecter = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function sondeConnect(...args) {
    let o = args[0];
    if (Array.isArray(o)) o = o[0]; // appel interne de net.connect : arguments déjà normalisés
    else if (typeof o !== 'object' || o === null) o = typeof o === 'string' && !/^\d+$/.test(o) ? { path: o } : { port: o, host: typeof args[1] === 'string' ? args[1] : undefined };
    const tube = o?.path != null;
    if (tube || !estLocal(o?.host)) {
      const cible = tube ? `tube ${o.path}` : `${o.host}:${o.port}`;
      noter('reseau', { op: tube ? 'tube' : 'tcp', cible });
      const err = erreurReseau(cible);
      process.nextTick(() => this.destroy(err));
      return this;
    }
    return connecter.apply(this, args);
  };

  const ecouter = net.Server.prototype.listen;
  net.Server.prototype.listen = function sondeListen(...args) {
    const o = typeof args[0] === 'object' && args[0] !== null ? args[0] : { port: args[0], host: typeof args[1] === 'string' ? args[1] : undefined };
    if (o.path == null && o.handle == null && o.fd == null && (o.host == null || !estLocal(o.host) || o.host === '')) {
      noter('ecoutes', { op: 'écoute', cible: `${o.host ?? 'toutes les adresses'}:${o.port}` });
    }
    return ecouter.apply(this, args);
  };

  for (const proto of [dgram.Socket.prototype]) {
    for (const nom of ['send', 'connect']) {
      const vrai = proto[nom];
      proto[nom] = function sondeUdp(...args) {
        const hote = nom === 'connect' ? args[1] : args.find((a, i) => i > 0 && typeof a === 'string');
        if (!estLocal(hote)) {
          noter('reseau', { op: `udp ${nom}`, cible: String(hote) });
          const rappel = args.find((a) => typeof a === 'function');
          if (rappel) process.nextTick(rappel, erreurReseau(hote));
          return undefined;
        }
        return vrai.apply(this, args);
      };
    }
  }

  const DNS = ['lookup', 'lookupService', 'resolve', 'resolve4', 'resolve6', 'resolveAny', 'resolveCaa', 'resolveCname', 'resolveMx', 'resolveNaptr', 'resolveNs', 'resolvePtr', 'resolveSoa', 'resolveSrv', 'resolveTxt', 'reverse'];
  const erreurDns = (nom) => Object.assign(new Error(`résolution DNS refusée par la sonde du banc de contrôle : ${nom}`), { code: 'ENOTFOUND', hostname: nom });
  const envelopperDns = (objet, nom, promesse) => {
    const vrai = objet?.[nom];
    if (typeof vrai !== 'function') return;
    objet[nom] = function sondeDns(...args) {
      const cible = args[0];
      if (estLocal(cible)) return vrai.apply(this, args);
      noter('reseau', { op: `dns ${nom}`, cible: String(cible) });
      const err = erreurDns(cible);
      if (promesse) return Promise.reject(err);
      const rappel = args.find((a) => typeof a === 'function');
      if (rappel) return process.nextTick(rappel, err);
      throw err;
    };
  };
  for (const n of DNS) {
    envelopperDns(dns, n, false);
    envelopperDns(dns.promises, n, true);
    envelopperDns(dns.Resolver?.prototype, n, false);
    envelopperDns(dns.promises.Resolver?.prototype, n, true);
  }

  // --- Programmes ---
  for (const nom of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) {
    const vrai = childProcess[nom];
    if (typeof vrai !== 'function') continue;
    childProcess[nom] = function sondeProgramme(commande) {
      noter('programmes', { op: nom, cible: String(commande).slice(0, 300) });
      throw Object.assign(new Error(`programme refusé par la sonde du banc de contrôle : ${commande}`), { code: 'EACCES' });
    };
  }

  syncBuiltinESMExports(); // import { readFileSync } from 'node:fs' voit aussi les versions surveillées

  if (!isMainThread || !process.send) return;

  // --- Prototypes : photo de départ, puis différences (pollution par « __proto__ », « constructor »…) ---
  const SURVEILLES = { Object, 'Object.prototype': Object.prototype, 'Array.prototype': Array.prototype, 'Function.prototype': Function.prototype, 'String.prototype': String.prototype, 'Number.prototype': Number.prototype, 'Boolean.prototype': Boolean.prototype, 'RegExp.prototype': RegExp.prototype, 'Date.prototype': Date.prototype, 'Error.prototype': Error.prototype, 'Promise.prototype': Promise.prototype, 'Map.prototype': Map.prototype, 'Set.prototype': Set.prototype };
  const photo = () => Object.fromEntries(Object.entries(SURVEILLES).map(([nom, o]) => [nom, new Map(Reflect.ownKeys(o).map((k) => {
    const d = Object.getOwnPropertyDescriptor(o, k);
    return [k, [d.value, d.get, d.set]];
  }))]));
  let repere = photo();
  const ecarts = () => {
    const out = [];
    const maintenant = photo();
    for (const [nom, cles] of Object.entries(maintenant)) {
      const avant = repere[nom];
      for (const [k, v] of cles) {
        const a = avant.get(k);
        if (!a) out.push(`${nom}.${String(k)} ajouté`);
        else if (a[0] !== v[0] || a[1] !== v[1] || a[2] !== v[2]) out.push(`${nom}.${String(k)} remplacé`);
      }
      for (const k of avant.keys()) if (!cles.has(k)) out.push(`${nom}.${String(k)} supprimé`);
    }
    return out;
  };

  process.on('message', (m) => {
    if (m?.type === 'sonde:repere') {
      repere = photo();
      process.send({ type: 'sonde:repere', id: m.id });
    } else if (m?.type === 'sonde') {
      process.send({ type: 'sonde', id: m.id, ...structuredClone(releves), perdus, prototypes: ecarts(), sorties: structuredClone(sorties), sortiesPerdues });
    }
  });
}
