// Données publiques des 25 ingénieurs de vaisseau (data/engineers.json) : chargées et validées strictement, indexées,
// et croisées avec les offres de coriolis (grade maximal de chaque ingénieur pour chaque plan).
//
// Le fichier est une DONNÉE, séparée du code : il pourra être mis à jour (donnée signée), jamais exécuté. Il ne contient
// que des faits publics (identité, système, coordonnées, base, plateformes, région, conditions, permis, incertitudes,
// sources) : rien des journaux d'un joueur. La validation le vérifie à chaque lecture (clés et textes interdits).
// Fichier illisible ou refusé : avertissement au démarrage, le serveur continue ; la liste des ingénieurs, l'itinéraire
// et la fiche chez l'ingénieur répondent 503.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { engineerKey } from '../../../core/reference/refdata.js';
import { ROUTE_SETTINGS } from './itineraryRules.js';
import { distanceLy } from './position.js';

/**
 * Chemin du fichier de données (résolu à l'appel, jamais au chargement du module). C'est une donnée livrée avec le module
 * (son dossier data/, versionné), pas le dossier des données de l'app (core/paths.js) : rien n'y est jamais écrit.
 */
export const DATA_FILE = () => path.join(fileURLToPath(new URL('..', import.meta.url)), 'data', 'engineers.json');

// Clés qui viendraient des journaux d'un joueur, et clés dangereuses : refusées à toute profondeur
const FORBIDDEN_KEYS = new Set(['journal', 'derniereVisite', 'baseVisitee', 'padsJournal', 'stationNameJournal', 'systemAddressIdentique', 'deblocageObserve', 'contreVerification', 'coordsCheck', '__proto__', 'constructor', 'prototype']);
// Textes qui citeraient les journaux d’un joueur (« journaux de référence » : ceux des règles) ou un chemin de son PC ;
// un pseudo de joueur est refusé partout par core/textesVisibles.test.js
const FORBIDDEN_TEXTS = [/journa(l|ux) du joueur/i, /journaux de référence/i, /lecture seule/i, /[A-Za-z]:\\/, /Saved Games/i, /derni[eè]re visite/i];
export const ITEM_TYPES = Object.freeze(['marchandise', 'materiau', 'credits', 'primes', 'obligations']);
const REGIONS = ['Bulle', 'Colonia'];

const fail = (why) => {
  throw new Error(why);
};
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v, max = 4000) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

function scan(v, path = '') {
  if (typeof v === 'string') {
    for (const re of FORBIDDEN_TEXTS) if (re.test(v)) fail(`texte interdit en ${path || 'racine'} (${re})`);
    return;
  }
  if (Array.isArray(v)) {
    v.forEach((x, i) => scan(x, `${path}[${i}]`));
    return;
  }
  if (v && typeof v === 'object') {
    for (const k of Object.keys(v)) {
      if (FORBIDDEN_KEYS.has(k)) fail(`clé interdite « ${k} » en ${path || 'racine'}`);
      scan(v[k], path ? `${path}.${k}` : k);
    }
  }
}

function deepFreeze(v) {
  if (v && typeof v === 'object') {
    for (const k of Object.keys(v)) deepFreeze(v[k]);
    Object.freeze(v);
  }
  return v;
}

/** Région d'un point ([x, y, z] ou { x, y, z }) : « Colonia » à 1 000 al de Colonia ou moins, sinon « Bulle » à 1 000 al de Sol ou moins, sinon « autre ». */
export function regionOf(pos, regions) {
  if (!pos) return 'autre';
  for (const name of ['Colonia', 'Bulle']) {
    const r = regions?.[name];
    if (r && distanceLy(pos, r.centre) <= r.rayonAl) return name;
  }
  return 'autre';
}

const fmt = (n) => Math.round(n).toLocaleString('fr-FR');
const nameOfRegion = (r) => (r === 'Colonia' ? 'Colonia' : 'la Bulle');

/**
 * Région de référence d'un point de départ (R11) : sa région, ou, hors des deux, la plus proche, avec la phrase qui le
 * dit (« Tu es à … al de la Bulle et à … al de Colonia : je prends la Bulle comme base. »).
 */
export function referenceRegion(pos, regions) {
  const region = regionOf(pos, regions);
  if (region !== 'autre') return { region, note: null };
  const a = distanceLy(pos, regions.Bulle.centre);
  const b = distanceLy(pos, regions.Colonia.centre);
  const nearest = a <= b ? 'Bulle' : 'Colonia';
  return { region: nearest, note: `Tu es à ${fmt(a)} al de la Bulle et à ${fmt(b)} al de Colonia : je prends ${nameOfRegion(nearest)} comme base.` };
}

/**
 * Valide le contenu du fichier : rend une copie normalisée et figée, ou lève une Error dont le message dit la raison
 * (en français).
 */
export function validateEngineerData(json) {
  if (!isObj(json)) fail('le fichier n’est pas un objet JSON');
  scan(json);
  const meta = json.meta;
  if (!isObj(meta) || meta.version !== 1) fail('meta.version doit valoir 1');
  const regions = meta.regions;
  if (!isObj(regions)) fail('meta.regions manquant');
  for (const r of REGIONS) {
    const x = regions[r];
    if (!isObj(x) || !isObj(x.centre) || !['x', 'y', 'z'].every((k) => finite(x.centre[k])) || !finite(x.rayonAl) || x.rayonAl <= 0) fail(`meta.regions.${r} invalide`);
  }
  const list = json.engineers;
  if (!Array.isArray(list) || list.length !== 25) fail('il faut exactement 25 ingénieurs');
  const ids = new Set();
  const markets = new Set();
  for (const e of list) {
    const who = isObj(e) && typeof e.name === 'string' ? e.name : '?';
    if (!isObj(e)) fail('fiche d’ingénieur invalide');
    if (!Number.isInteger(e.id) || e.id < 300000 || e.id > 300399) fail(`${who} : id invalide`);
    if (ids.has(e.id)) fail(`${who} : id ${e.id} en double`);
    ids.add(e.id);
    if (!text(e.name, 60)) fail(`${e.id} : nom invalide`);
    if (!text(e.system, 80)) fail(`${who} : système invalide`);
    if (!isObj(e.coords) || !['x', 'y', 'z'].every((k) => finite(e.coords[k]))) fail(`${who} : coordonnées invalides`);
    if (!Number.isSafeInteger(e.systemAddress) || e.systemAddress <= 0) fail(`${who} : systemAddress invalide`);
    if (!Number.isSafeInteger(e.marketId) || e.marketId <= 0) fail(`${who} : marketId invalide`);
    if (markets.has(e.marketId)) fail(`${who} : marketId ${e.marketId} en double`);
    markets.add(e.marketId);
    if (!REGIONS.includes(e.region)) fail(`${who} : région « ${e.region} » inconnue`);
    if (regionOf(e.coords, regions) !== e.region) fail(`${who} : région « ${e.region} » fausse d’après ses coordonnées`);
    if (e.base != null && !text(e.base, 120)) fail(`${who} : base invalide`);
    if (e.body != null && !text(e.body, 120)) fail(`${who} : corps invalide`);
    if (e.distanceToArrivalLs != null && (!finite(e.distanceToArrivalLs) || e.distanceToArrivalLs < 0)) fail(`${who} : distance à l’arrivée invalide`);
    if (!isObj(e.referral) || !(e.referral.by === null || Number.isInteger(e.referral.by))) fail(`${who} : referral invalide`);
    if (!isObj(e.permit) || typeof e.permit.required !== 'boolean') fail(`${who} : permit.required doit être vrai ou faux`);
    if (!Array.isArray(e.uncertain) || !e.uncertain.every((u) => isObj(u) && typeof u.field === 'string' && typeof u.reason === 'string')) fail(`${who} : uncertain invalide`);
    if (!isObj(e.unlock) || !text(e.unlock.text) || !Array.isArray(e.unlock.items) || e.unlock.items.length < 1 || e.unlock.items.length > 4) fail(`${who} : unlock invalide`);
    for (const it of e.unlock.items) {
      if (!isObj(it) || !text(it.en, 120) || !(it.fr === null || text(it.fr, 120))) fail(`${who} : objet de déblocage invalide`);
      if (!ITEM_TYPES.includes(it.type)) fail(`${who} : type d’objet « ${it.type} » inconnu`);
      if (it.type === 'marchandise' || it.type === 'materiau') {
        if (typeof it.symbol !== 'string' || !/^[A-Za-z][A-Za-z0-9]{1,40}$/.test(it.symbol)) fail(`${who} : ${it.type} sans symbole valide`);
        if (!Number.isInteger(it.qty) || it.qty < 1) fail(`${who} : quantité invalide`);
        if (it.credits !== undefined) fail(`${who} : ${it.type} avec un montant`);
      } else {
        if (it.qty !== null) fail(`${who} : ${it.type} avec une quantité`);
        if (it.symbol !== undefined) fail(`${who} : ${it.type} avec un symbole`);
        if (!Array.isArray(it.credits) || it.credits.length < 1 || it.credits.length > 2 || !it.credits.every((c) => Number.isSafeInteger(c) && c > 0) || (it.credits.length === 2 && it.credits[1] <= it.credits[0])) fail(`${who} : montant invalide`);
      }
    }
  }
  for (const e of list) {
    if (e.referral.by !== null && !ids.has(e.referral.by)) fail(`${e.name} : parrain ${e.referral.by} inconnu`);
  }
  // Chaîne des parrains : sans boucle, profondeur au plus MAX_REFERRAL_DEPTH
  const byId = new Map(list.map((e) => [e.id, e]));
  for (const e of list) {
    const seen = new Set([e.id]);
    let p = e.referral.by;
    let depth = 0;
    while (p != null) {
      if (seen.has(p)) fail(`${e.name} : chaîne des parrains en boucle`);
      seen.add(p);
      depth += 1;
      if (depth > ROUTE_SETTINGS.MAX_REFERRAL_DEPTH) fail(`${e.name} : chaîne des parrains trop longue`);
      p = byId.get(p).referral.by;
    }
  }
  return deepFreeze(JSON.parse(JSON.stringify(json)));
}

/** Lit et valide le fichier. Ne lève jamais : { data, error } (error : raison en français). */
export function loadEngineerData(file = DATA_FILE()) {
  try {
    const raw = fs.readFileSync(file instanceof URL ? fileURLToPath(file) : file, 'utf8');
    return { data: validateEngineerData(JSON.parse(raw.replace(/^﻿/, ''))), error: null };
  } catch (err) {
    return { data: null, error: err instanceof SyntaxError ? `JSON illisible : ${err.message}` : err.message };
  }
}

/** Nom de station normalisé (minuscules, guillemets et espaces unifiés), pour reconnaître une base par son nom. */
export const normStation = (s) => engineerKey(s);

/** Libellé d'objet normalisé : accents retirés, minuscules, lettres et chiffres seulement. */
export const normItem = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Index : par id, par nom (engineerKey), par MarketID, par station (`${systemAddress}|${nom normalisé}`). */
export function indexEngineerData(data) {
  const list = data.engineers;
  return {
    data,
    list,
    regions: data.meta.regions,
    byId: new Map(list.map((e) => [e.id, e])),
    byName: new Map(list.map((e) => [engineerKey(e.name), e])),
    byMarketId: new Map(list.map((e) => [e.marketId, e])),
    byStation: new Map(list.filter((e) => e.base).map((e) => [`${e.systemAddress}|${normStation(e.base)}`, e])),
  };
}

/** Fiche d'un ingénieur d'après un nom (journal, coriolis : guillemets et coquilles réglés par engineerKey). */
export const engineerByName = (idx, name) => idx.byName.get(engineerKey(name)) || null;

/** Clé canonique d'un plan dans un groupe (blueprintIn, puis vérifiée par hasOwn), ou null. */
export function canonicalBlueprint(ref, grp, bp) {
  if (!grp || !bp || !Object.hasOwn(ref.modMods, grp)) return null;
  const own = ref.modMods[grp]?.blueprints;
  if (!own) return null;
  const k = ref.blueprintIn(grp, bp);
  return typeof k === 'string' && Object.hasOwn(own, k) ? k : null;
}

const OFFERS = new WeakMap(); // ref → WeakMap(idx → Map)

/** Offres : id → Map(`${grp}|${plan canonique}` → grade maximal), d'après coriolis (mis en cache par ref et index). */
export function offersIndex(ref, idx) {
  let byIdx = OFFERS.get(ref);
  if (!byIdx) {
    byIdx = new WeakMap();
    OFFERS.set(ref, byIdx);
  }
  if (byIdx.has(idx)) return byIdx.get(idx);
  const out = new Map(idx.list.map((e) => [e.id, new Map()]));
  for (const grp of Object.keys(ref.modMods)) {
    const bps = ref.modMods[grp]?.blueprints;
    if (!bps) continue;
    for (const bp of Object.keys(bps)) {
      for (const [g, entry] of Object.entries(bps[bp]?.grades || {})) {
        const grade = Number(g);
        if (!Number.isInteger(grade) || grade < 1 || grade > 5) continue;
        for (const raw of entry?.engineers || []) {
          const e = engineerByName(idx, ref.engineerName ? ref.engineerName(raw) : raw);
          if (!e) continue;
          const m = out.get(e.id);
          const k = `${grp}|${bp}`;
          m.set(k, Math.max(m.get(k) || 0, grade));
        }
      }
    }
  }
  byIdx.set(idx, out);
  return out;
}

/** Grade maximal qu'un ingénieur propose pour un plan dans un groupe (0 s'il ne le propose pas). */
export function maxGradeOf(ref, idx, id, grp, bp) {
  const k = canonicalBlueprint(ref, grp, bp);
  if (!k) return 0;
  return offersIndex(ref, idx).get(id)?.get(`${grp}|${k}`) || 0;
}

/** Ce qu'un ingénieur propose : [{ grp, blueprint, maxGrade }], par groupe puis par libellé. */
export function offersOf(ref, idx, id) {
  const m = offersIndex(ref, idx).get(id);
  if (!m) return [];
  return [...m].map(([k, maxGrade]) => {
    const [grp, blueprint] = k.split('|');
    return { grp, blueprint, maxGrade };
  }).sort((a, b) => a.grp.localeCompare(b.grp) || String(ref.blueprintLabel(a.blueprint)).localeCompare(String(ref.blueprintLabel(b.blueprint)), 'fr') || a.blueprint.localeCompare(b.blueprint));
}
