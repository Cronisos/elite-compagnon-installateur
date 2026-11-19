// Projet de colonisation de l'escadron, vu d'ici : calculs purs, sans état ni réseau.
//
// Le module Escadron fournit, par son API locale (jamais son code), le projet publié par le chef (systèmes, chantiers
// dans l'ordre de priorité) et le relevé le plus récent du dépôt de chaque chantier de ces systèmes, envoyé par l'app
// d'un membre. Ce module y ajoute ses propres chantiers. Pour chaque chantier, la lecture la plus récente l'emporte :
// la tienne, ou celle de l'escadron. Tes livraisons faites après le relevé de l'escadron y sont ajoutées à titre
// provisoire, comme sur une lecture du dépôt faite ici (state.js), jusqu'au relevé suivant.

import { parseStationName } from './events.js';
import { ratioOf } from './state.js';

const ms = (v) => {
  const t = typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : null;
};
const remainingOf = (r) => ({ ...r, remaining: Math.max(0, r.required - r.provided) });

/** Heure d'un chantier suivi ici : sa dernière lecture du dépôt, ou sa fin si elle est plus récente. */
function localTime(site) {
  const t = [ms(site.updatedAt), site.complete ? ms(site.completedAt) : null].filter((x) => x != null);
  return t.length ? Math.max(...t) : null;
}

/** Chantier connu seulement par l'escadron (aucun amarrage ici) : de quoi faire sa liste de courses. */
export function siteFromReleve(r) {
  const p = parseStationName(r.station);
  const resources = r.resources.map((x) => remainingOf({ symbol: x.symbol, name: x.name || x.symbol, required: x.required, provided: x.provided, payment: null }));
  return {
    marketId: r.marketId,
    station: r.station ?? null,
    stationLabel: p.label,
    kind: p.kind,
    system: r.system ?? null,
    systemAddress: null,
    body: null,
    progress: r.progress ?? ratioOf(resources),
    complete: r.complete === true,
    failed: r.failed === true,
    completedAt: null,
    completedBy: null,
    successorMarketId: null,
    failedAt: null,
    resources,
    provisional: false,
    readings: 1,
    firstSeen: r.at,
    lastSeen: r.at,
    updatedAt: r.at,
    lastDockedAt: null,
    contributions: [],
    user: { name: null, deadline: null, notes: null, loopMinutes: null, pinned: false },
    local: false,
  };
}

/**
 * Le chantier le plus à jour : { site, releve } avec releve = { by, at } quand la lecture vient de l'escadron, null
 * quand c'est la tienne. Ton chantier garde ses réglages et tes livraisons ; seuls ses besoins et son avancement
 * viennent du relevé plus récent. null si le chantier n'est connu ni ici ni par l'escadron.
 */
export function freshest(local, releve) {
  if (!releve) return local ? { site: local, releve: null } : null;
  const theirs = siteFromReleve(releve);
  const by = { by: releve.cmdr ?? null, at: releve.at };
  if (!local) return { site: theirs, releve: by };
  const mine = localTime(local);
  if (mine != null && !(ms(releve.at) > mine)) return { site: local, releve: null };
  const site = {
    ...local,
    station: local.station ?? theirs.station,
    stationLabel: local.stationLabel ?? theirs.stationLabel,
    kind: local.kind ?? theirs.kind,
    system: local.system ?? theirs.system,
    resources: theirs.resources,
    progress: theirs.progress,
    complete: local.complete || theirs.complete,
    failed: !local.complete && theirs.failed,
    updatedAt: releve.at,
    provisional: false,
    local: true,
  };
  // Tes livraisons d'après ce relevé : ajoutées en attendant le suivant (le dépôt compte celles de tous les CMDR)
  for (const c of local.contributions || []) {
    if (!(ms(c.at) > ms(releve.at))) continue;
    for (const i of c.items || []) {
      const r = site.resources.find((x) => x.symbol === i.symbol);
      if (!r || !Number.isFinite(i.amount)) continue;
      Object.assign(r, remainingOf({ ...r, provided: Math.min(r.required, r.provided + i.amount) }));
      site.provisional = true;
    }
  }
  if (site.provisional) site.progress = ratioOf(site.resources) ?? site.progress;
  return { site, releve: by };
}

/** Relevés de l'escadron par MarketID (ceux des systèmes du projet : le serveur ne rend que ceux-là). */
export function relevesById(squad) {
  return new Map((squad?.projet ? squad.releves || [] : []).map((r) => [r.marketId, r]));
}

const open = (s) => !s.complete && !s.failed;

/**
 * Le projet vu d'ici, ou null s'il n'y en a pas :
 *   sites  : les chantiers classés par le chef, dans son ordre : [{ priority, marketId, system, name, site, releve }]
 *            (site null tant que personne ne l'a relevé ni suivi ici)
 *   others : les autres chantiers connus dans les systèmes du projet (relevés par l'escadron ou suivis ici), en cours
 *            d'abord : [{ site, releve }]
 *   empty  : les systèmes du projet où aucun chantier n'est encore connu
 */
export function projectView(squad, localSites) {
  const projet = squad?.projet;
  if (!projet?.systems?.length) return null;
  const inProject = new Set(projet.systems.map((s) => s.toLowerCase()));
  const releves = relevesById(squad);
  const local = (id) => localSites.get(id) ?? null;
  const ranked = new Set();
  const sites = (projet.sites || []).map((p, i) => {
    ranked.add(p.marketId);
    const f = freshest(local(p.marketId), releves.get(p.marketId) ?? null);
    return { priority: i + 1, marketId: p.marketId, system: p.system, name: p.name ?? null, site: f?.site ?? null, releve: f?.releve ?? null };
  });
  const ids = new Set([...releves.keys()]);
  for (const s of localSites.values()) if (s.system && inProject.has(s.system.toLowerCase())) ids.add(s.marketId);
  const others = [...ids].filter((id) => !ranked.has(id))
    .map((id) => freshest(local(id), releves.get(id) ?? null))
    .filter(Boolean)
    .sort((a, b) => open(b.site) - open(a.site) || String(a.site.system).localeCompare(String(b.site.system), 'fr') || (ms(b.site.updatedAt) ?? 0) - (ms(a.site.updatedAt) ?? 0));
  const known = new Set([...sites.filter((s) => s.site), ...others].map((s) => String(s.site.system ?? '').toLowerCase()));
  const empty = projet.systems.filter((s) => !known.has(s.toLowerCase()));
  return { systems: projet.systems, sites, others, empty };
}

/** Premier chantier du projet encore en cours, dans l'ordre du chef : celui que l'escadron veut voir avancer. */
export function firstOpen(view) {
  return view?.sites.find((s) => s.site && open(s.site)) ?? null;
}
