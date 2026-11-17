// Garde réseau préchargée (NODE_OPTIONS=--require) autour d'un outil lancé par le banc, et dans chacun de ses processus
// enfants Node (ils héritent de NODE_OPTIONS) : toute connexion ou résolution DNS vers autre chose que ce PC est refusée
// et notée, une ligne JSON par tentative, dans le fichier CONTROLE_RESEAU_JOURNAL. Rien ne sort du PC, même si l'outil
// ignore l'adresse qu'on lui donne (tests/depot.test.mjs : télémétrie de Prisma).
// Jamais chargée par l'app elle-même.

'use strict';

const dns = require('node:dns');
const fs = require('node:fs');
const net = require('node:net');

const journal = process.env.CONTROLE_RESEAU_JOURNAL || null;
const LOCAL = /^(localhost\.?|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|::1|::ffff:127\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i;
const estLocal = (h) => h == null || h === '' || LOCAL.test(String(h).replace(/^\[|\]$/g, ''));

function noter(cible) {
  if (!journal) return;
  try {
    fs.appendFileSync(journal, `${JSON.stringify({ pid: process.pid, cible: String(cible).slice(0, 300) })}\n`);
  } catch {
    // journal illisible : le refus reste
  }
}
const refus = (code, cible) => Object.assign(new Error(`connexion refusée par la garde réseau du banc : ${cible}`), { code });

const lookup = dns.lookup;
dns.lookup = function gardeLookup(host, ...rest) {
  if (estLocal(host)) return lookup.call(this, host, ...rest);
  noter(`dns ${host}`);
  const rappel = rest.find((a) => typeof a === 'function');
  const err = Object.assign(refus('ENOTFOUND', host), { hostname: host });
  if (rappel) {
    process.nextTick(rappel, err);
    return {};
  }
  throw err;
};
const lookupPromesse = dns.promises.lookup;
dns.promises.lookup = async function gardeLookupPromesse(host, ...rest) {
  if (estLocal(host)) return lookupPromesse.call(this, host, ...rest);
  noter(`dns ${host}`);
  throw Object.assign(refus('ENOTFOUND', host), { hostname: host });
};

const connecter = net.Socket.prototype.connect;
net.Socket.prototype.connect = function gardeConnect(...args) {
  let o = args[0];
  if (Array.isArray(o)) o = o[0]; // appel interne de net.connect : arguments déjà normalisés
  else if (typeof o !== 'object' || o === null) o = typeof o === 'string' && !/^\d+$/.test(o) ? { path: o } : { port: o, host: typeof args[1] === 'string' ? args[1] : undefined };
  if (o && !o.path && !estLocal(o.host ?? 'localhost')) {
    const cible = `${o.host}:${o.port}`;
    noter(`tcp ${cible}`);
    const err = refus('ECONNREFUSED', cible);
    process.nextTick(() => this.destroy(err));
    return this;
  }
  return connecter.apply(this, args);
};
