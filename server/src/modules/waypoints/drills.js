// Foreuses du Rhino (« mining rigs ») : le jeu n'écrit ni leur pose ni leur position dans le journal. Il écrit
// seulement ce que le SRV raffine, une ligne MiningRefined par tonne. Vider une foreuse donne une rafale de
// raffinages, sur place : l'heure et la position du SRV à ce moment (Status.json) disent où est la foreuse et quand
// elle a été vidée. L'app numérote les foreuses de 1 à 6, mesure leur cycle (d'une vidange à la suivante) et dit
// laquelle est prête. La pose peut aussi se marquer à la main (bouton du balayage, Alt+Maj+F dans l'overlay).

import { surfaceRoute, turn } from './geo.js';
import { project } from './sweep.js';

// ── Règles du jeu ──────────────────────────────────────────────────────────────────────────────────────────────
// Toutes ici, avec leur source et leur date : une « vigie des règles » les comparera à ce que le jeu fait vraiment.
// « mesurée » : vue dans tes journaux ; « publiée » : annoncée par Frontier ou reprise par un outil connu ;
// « à vérifier » : un seul témoignage, ou une déduction.

// Valeurs, sources et statuts : dépôt des règles, server/src/regles/foreuses.js (voir regles/LISEZMOI.md).
import { MAX_DRILLS, BURST_GAP_MS, VIDANGE_MIN_TONS, MERGE_MS, RIG_SPACING_M, DRILL_MATCH_M, DESTROY_RADIUS_UNVERIFIED_M, DRILL_RULES } from '../../regles/foreuses.js';

export { MAX_DRILLS, BURST_GAP_MS, VIDANGE_MIN_TONS, MERGE_MS, RIG_SPACING_M, DRILL_MATCH_M, DESTROY_RADIUS_UNVERIFIED_M, DRILL_RULES };

// ── Choix de l'app (pas des règles du jeu) ─────────────────────────────────────────────────────────────────────
const SEANCE_GAP_MS = 3 * 3600 * 1000; // 3 h sans pose ni vidange : les foreuses ont sans doute été ramassées
const ARRIVED_M = DRILL_MATCH_M; // « Tu y es » : à portée de la foreuse
const WARN_SHARE = 0.9; // rayon de destruction réglé : alerte à 90 % de ce rayon
const MAX_RADIUS_KM = 50; // rayon de destruction réglable : 0,1 à 50 km
const MAX_VIDANGES = 500; // par foreuse, dans une séance

function bad(message) {
  const err = new Error(message);
  err.status = 400;
  err.publicMessage = message;
  return err;
}

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const onSurface = (p) => p && finite(p.latitude) && finite(p.longitude) && p.body && finite(p.planetRadius) && p.planetRadius > 0;
const iso = (t) => (t == null ? null : new Date(t).toISOString());
const time = (v) => {
  const t = typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(t) ? t : null;
};

export function median(list) {
  if (!list.length) return null;
  const s = [...list].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/** Rayon de destruction saisi en km : vide ou 0 = aucun ; sinon de 0,1 à 50 km, rendu en mètres. */
export function cleanRadiusKm(v) {
  if (v == null || v === '' || v === 0 || v === '0') return null;
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0.1 || n > MAX_RADIUS_KM) throw bad(`Rayon de destruction : de 0,1 à ${MAX_RADIUS_KM} km, ou vide pour ne rien afficher.`);
  return Math.round(n * 1000);
}

/** Numéro de foreuse reçu : entier de 1 à 6, sinon rien. */
export function drillNumber(v) {
  const n = Number(v);
  return v != null && v !== '' && Number.isInteger(n) && n >= 1 && n <= MAX_DRILLS ? n : null;
}

export class DrillTracker {
  constructor() {
    this.clear();
    this.settings = { destroyRadius: null }; // m, réglé à la main ; rien par défaut
  }

  /** Oublie la séance : plus aucune foreuse. Le réglage du rayon reste. */
  clear() {
    this.seance = null; // { body, system, planetRadius, startedAt, lastAt, breaks: [t] } ; breaks : SRV rentré
    this.drills = []; // { n, latitude, longitude, placedAt, poses: [t], vidanges: [{ at, end, tons }] }
    this.burst = null; // rafale en cours : { start, last, tons, body, pos, n }
  }

  /** Séance sur la planète de `here` : une autre planète, ou 3 h sans rien, et l'on repart de zéro. */
  ensureSeance(here, t) {
    const s = this.seance;
    if (s && s.body === here.body && t - s.lastAt <= SEANCE_GAP_MS) {
      s.lastAt = Math.max(s.lastAt, t);
      return;
    }
    // La rafale en cours reste : c'est souvent elle qui ouvre la séance (première vidange du jour, autre planète).
    // Liée à une foreuse de l'ancienne séance, en revanche, elle n'a plus de sens.
    const b = this.burst;
    this.clear();
    this.burst = b && b.n == null ? b : null;
    this.seance ={ body: here.body, system: here.system || null, planetRadius: here.planetRadius, startedAt: t, lastAt: t, breaks: [] };
  }

  /**
   * Séance encore ouverte à `now` : des foreuses, et moins de 3 h depuis la dernière pose ou vidange. Close, elle
   * n'est plus montrée ni suivie par la boussole ; la prochaine pose ou vidange repart de zéro (ensureSeance).
   */
  isOpen(now) {
    return Boolean(this.seance && this.drills.length && now - this.seance.lastAt <= SEANCE_GAP_MS);
  }

  /** Foreuse connue la plus proche de `pos`, à moins de DRILL_MATCH_M, sur la planète de la séance. */
  nearest(pos) {
    const s = this.seance;
    if (!s || pos.body !== s.body) return null;
    let best = null;
    for (const d of this.drills) {
      const { distance } = surfaceRoute(pos, d, pos.planetRadius || s.planetRadius);
      if (distance <= DRILL_MATCH_M && (!best || distance < best.distance)) best = { d, distance };
    }
    return best?.d || null;
  }

  /** Nouvelle foreuse au premier numéro libre ; les 6 prises, elle remplace la plus ancienne (ramassée, sans doute). */
  addDrill(pos, t, placed) {
    const used = new Set(this.drills.map((d) => d.n));
    let n = [...Array(MAX_DRILLS).keys()].map((i) => i + 1).find((i) => !used.has(i));
    if (n == null) {
      const oldest = [...this.drills].sort((a, b) => lastAt(a) - lastAt(b))[0];
      n = oldest.n;
      this.drills = this.drills.filter((d) => d !== oldest);
    }
    const d = { n, latitude: pos.latitude, longitude: pos.longitude, placedAt: placed ? t : null, poses: placed ? [t] : [], vidanges: [] };
    this.drills.push(d);
    this.drills.sort((a, b) => a.n - b.n);
    return d;
  }

  /**
   * Une tonne raffinée à l'instant t, là où tu es. Seul le SRV vide les foreuses. Renvoie vrai si les foreuses ont
   * changé (vidange reconnue ou qui continue).
   */
  refined(t, here) {
    if (here?.vehicle !== 'srv' || !Number.isFinite(t)) {
      this.burst = null;
      return false;
    }
    const pos = onSurface(here) ? { latitude: here.latitude, longitude: here.longitude, body: here.body, planetRadius: here.planetRadius, system: here.system } : null;
    let b = this.burst;
    if (!b || t - b.last > BURST_GAP_MS || (pos && b.body && pos.body !== b.body)) {
      b = { start: t, last: t, tons: 0, body: pos?.body || null, pos: null, n: null };
      this.burst = b;
    }
    b.last = t;
    b.tons += 1;
    if (!b.pos && pos) {
      b.pos = pos;
      b.body = pos.body;
    }
    if (b.n != null) {
      const v = this.drills.find((d) => d.n === b.n)?.vidanges.at(-1);
      if (!v) return false;
      v.tons += 1;
      v.end = t;
      this.seance.lastAt = t;
      return true;
    }
    if (!b.pos) return false;
    // Rafale reprise à la même foreuse juste après : la même vidange, faite en deux fois
    const near = this.nearest(b.pos);
    const prev = near?.vidanges.at(-1);
    if (prev && b.start - prev.end <= MERGE_MS && b.start >= prev.end) {
      prev.tons += b.tons;
      prev.end = t;
      b.n = near.n;
      this.seance.lastAt = t;
      return true;
    }
    if (b.tons < VIDANGE_MIN_TONS) return false;
    this.ensureSeance(b.pos, b.start);
    const d = this.nearest(b.pos) || this.addDrill(b.pos, b.start, false);
    // La position du SRV à chaque vidange est gardée : elle affine celle d'une foreuse jamais marquée à la pose, et
    // dira en jeu à quelle distance d'elle on la vide (DRILL_MATCH_M, à vérifier)
    d.vidanges.push({ at: b.start, end: t, tons: b.tons, latitude: b.pos.latitude, longitude: b.pos.longitude });
    if (d.vidanges.length > MAX_VIDANGES) d.vidanges.shift();
    if (d.placedAt == null) Object.assign(d, meanPosition(d.vidanges));
    b.n = d.n;
    this.seance.lastAt = Math.max(this.seance.lastAt, t);
    return true;
  }

  /** SRV rentré dans le vaisseau : l'intervalle en cours ne mesure plus un cycle (tu n'étais pas là pour vider). */
  dockSrv(t) {
    this.burst = null;
    if (!this.seance || !Number.isFinite(t)) return false;
    this.seance.breaks.push(t);
    if (this.seance.breaks.length > 200) this.seance.breaks.shift();
    return true;
  }

  /** Foreuse posée ici (bouton ou raccourci) : nouvelle, ou celle qui était déjà là, reposée (son cycle repart). */
  place(here, t) {
    if (!onSurface(here)) throw bad('Position au sol inconnue : approche-toi de la planète.');
    if (here.vehicle !== 'srv') throw bad('Tu n’es pas en SRV : une foreuse se pose depuis le Rhino.');
    this.ensureSeance(here, t);
    const pos = { latitude: here.latitude, longitude: here.longitude, body: here.body, planetRadius: here.planetRadius };
    const old = this.nearest(pos);
    if (old) {
      Object.assign(old, { latitude: pos.latitude, longitude: pos.longitude, placedAt: t }); // la pose donne la position exacte
      old.poses.push(t);
      return old;
    }
    return this.addDrill(pos, t, true);
  }

  /** Foreuse ramassée : on ne la suit plus. */
  remove(n) {
    const before = this.drills.length;
    this.drills = this.drills.filter((d) => d.n !== n);
    if (this.burst?.n === n) this.burst = null;
    if (!this.drills.length) this.clear();
    return this.drills.length !== before;
  }

  setDestroyRadius(km) {
    this.settings.destroyRadius = cleanRadiusKm(km);
  }

  /** Durées de cycle mesurées d'une foreuse : de la fin d'une vidange au début de la suivante, sans retour au vaisseau ni pose entre les deux. */
  intervals(d) {
    const cuts = [...(this.seance?.breaks || []), ...d.poses];
    const out = [];
    for (let i = 1; i < d.vidanges.length; i++) {
      const a = d.vidanges[i - 1].end;
      const b = d.vidanges[i].at;
      if (b > a && !cuts.some((c) => c > a && c < b)) out.push(b - a);
    }
    return out;
  }

  /** Cycle de la séance : médiane de tous les cycles mesurés, toutes foreuses confondues. */
  seanceCycle() {
    return median(this.drills.flatMap((d) => this.intervals(d)));
  }

  /** État d'une foreuse à l'instant `now` : temps depuis la dernière vidange (ou la pose), cycle, prête ou non. */
  status(d, now, seanceCycle = this.seanceCycle()) {
    const own = this.intervals(d);
    const cycle = own.length ? median(own) : seanceCycle;
    const last = lastAt(d);
    const since = Math.max(0, now - last);
    const tons = d.vidanges.reduce((sum, v) => sum + v.tons, 0);
    const first = d.vidanges[0];
    const lastV = d.vidanges.at(-1);
    // Rendement : ce qu'elle a donné après sa première vidange, rapporté au temps écoulé depuis
    const span = d.vidanges.length > 1 ? lastV.end - first.end : 0;
    return {
      cycle,
      cycleFrom: own.length ? 'drill' : cycle != null ? 'seance' : null,
      cycles: own.length,
      last,
      lastKind: lastV && lastV.end >= (d.placedAt ?? -Infinity) ? 'vidange' : 'pose',
      since,
      ready: cycle == null ? null : since >= cycle,
      readyIn: cycle == null ? null : Math.max(0, cycle - since),
      tons,
      avgTons: d.vidanges.length ? Math.round((tons / d.vidanges.length) * 10) / 10 : null,
      perHour: span >= 60 * 1000 ? Math.round(((tons - first.tons) * 3600000) / span) : null,
    };
  }

  /** Prochaine foreuse à vider : la prête qui attend depuis le plus longtemps, sinon celle qui sera prête la première, sinon la plus anciennement vidée. */
  next(now) {
    if (!this.isOpen(now)) return null;
    const sc = this.seanceCycle();
    const list = this.drills.map((d) => ({ d, s: this.status(d, now, sc) }));
    const ready = list.filter((x) => x.s.ready).sort((a, b) => (b.s.since - b.s.cycle) - (a.s.since - a.s.cycle));
    if (ready.length) return ready[0].d.n;
    const soon = list.filter((x) => x.s.ready === false).sort((a, b) => a.s.readyIn - b.s.readyIn);
    if (soon.length) return soon[0].d.n;
    return [...list].sort((a, b) => a.s.last - b.s.last)[0].d.n;
  }

  /**
   * Ce que montrent la carte et la liste : chaque foreuse posée à plat (m, x vers l'est, y vers le nord) autour du
   * centre du balayage s'il est sur la même planète, sinon autour de la foreuse de plus petit numéro.
   */
  view(here, now = Date.now(), center = null) {
    const radius = this.settings.destroyRadius;
    const base = { active: false, max: MAX_DRILLS, destroyRadius: radius, drills: [] };
    const s = this.seance;
    if (!this.isOpen(now)) return base; // aucune séance, ou close (3 h sans rien) : rien à montrer
    const R = (onSurface(here) && here.body === s.body ? here.planetRadius : null) || s.planetRadius;
    const same = onSurface(here) && here.body === s.body;
    const onSweep = Boolean(center && center.body === s.body && finite(center.latitude) && finite(center.longitude));
    const origin = onSweep ? center : this.drills[0];
    const sc = this.seanceCycle();
    const next = this.next(now);
    const drills = this.drills.map((d) => {
      const st = this.status(d, now, sc);
      const p = project(origin, d, R);
      const route = same ? surfaceRoute(here, d, R) : null;
      return {
        n: d.n,
        latitude: d.latitude,
        longitude: d.longitude,
        x: p.x,
        y: p.y,
        placedAt: iso(d.placedAt),
        lastAt: iso(st.last),
        lastKind: st.lastKind,
        cycleMs: st.cycle,
        cycleFrom: st.cycleFrom,
        cycles: st.cycles,
        sinceMs: st.since,
        ready: st.ready,
        readyInMs: st.readyIn,
        vidanges: d.vidanges.length,
        tons: st.tons,
        avgTons: st.avgTons,
        perHour: st.perHour,
        spread: spreadOf(d, R), // m : jusqu'où du point de la foreuse le SRV s'est trouvé en la vidant
        distance: route ? route.distance : null,
        bearing: route ? Math.round(route.bearing) : null,
        // Rayon de destruction réglé à la main : tu t'en approches (90 %) ou tu l'as dépassé
        warn: route && radius ? route.distance >= radius * WARN_SHARE : false,
        next: d.n === next,
      };
    });
    const youP = same ? project(origin, here, R) : null;
    const live = this.burst?.n != null && now - this.burst.last <= BURST_GAP_MS
      ? { n: this.burst.n, tons: this.drills.find((d) => d.n === this.burst.n)?.vidanges.at(-1)?.tons ?? 0 }
      : null;
    return {
      ...base,
      active: true,
      body: s.body,
      system: s.system,
      startedAt: iso(s.startedAt),
      origin: onSweep ? 'sweep' : 'drill',
      cycleMs: sc,
      next,
      live,
      tons: drills.reduce((sum, d) => sum + d.tons, 0),
      vidangesTotal: drills.reduce((sum, d) => sum + d.vidanges, 0),
      onBody: same,
      you: youP && { x: youP.x, y: youP.y, heading: finite(here.heading) ? here.heading : null, vehicle: here.vehicle || null },
      drills,
    };
  }

  /** Guidage vers une foreuse (son numéro, ou « next » : la prochaine à vider), comme vers un repère. */
  guide(target, here, now = Date.now()) {
    const n = target === 'next' ? this.next(now) : drillNumber(target);
    const d = this.drills.find((x) => x.n === n);
    if (!d || !this.isOpen(now)) return { state: 'none', target };
    const st = this.status(d, now);
    const s = this.seance;
    const base = {
      target, n: d.n, label: `Foreuse ${d.n}`, system: s.system, body: s.body,
      lastAt: iso(st.last), cycleMs: st.cycle, ready: st.ready, readyInMs: st.readyIn,
    };
    if (here?.system && s.system && here.system !== s.system) return { ...base, state: 'other-system' };
    if (!onSurface(here) || here.body !== s.body) return { ...base, state: 'other-body' };
    const { distance, bearing } = surfaceRoute(here, d, here.planetRadius);
    return {
      ...base,
      state: 'guiding',
      distance,
      bearing: Math.round(bearing),
      heading: finite(here.heading) ? here.heading : null,
      turn: finite(here.heading) ? Math.round(turn(bearing, here.heading)) : null,
      arrived: distance < ARRIVED_M,
    };
  }

  toJSON() {
    const s = this.seance;
    return {
      version: 1,
      settings: this.settings,
      seance: s && { ...s, startedAt: iso(s.startedAt), lastAt: iso(s.lastAt), breaks: s.breaks.map(iso) },
      drills: this.drills.map((d) => ({
        n: d.n, latitude: d.latitude, longitude: d.longitude, placedAt: iso(d.placedAt), poses: d.poses.map(iso),
        vidanges: d.vidanges.map((v) => ({ at: iso(v.at), end: iso(v.end), tons: v.tons, latitude: v.latitude ?? null, longitude: v.longitude ?? null })),
      })),
    };
  }

  /** Relu depuis le fichier : tout ce qui est mal formé est écarté, sans erreur. */
  static fromJSON(data) {
    const t = new DrillTracker();
    if (!data || typeof data !== 'object') return t;
    const r = data.settings?.destroyRadius;
    if (finite(r) && r >= 100 && r <= MAX_RADIUS_KM * 1000) t.settings.destroyRadius = r;
    const s = data.seance;
    if (!s || typeof s.body !== 'string' || !finite(s.planetRadius) || s.planetRadius <= 0) return t;
    const started = time(s.startedAt);
    const last = time(s.lastAt);
    if (started == null || last == null) return t;
    t.seance = {
      body: s.body, system: typeof s.system === 'string' ? s.system : null, planetRadius: s.planetRadius,
      startedAt: started, lastAt: last, breaks: (Array.isArray(s.breaks) ? s.breaks : []).map(time).filter((x) => x != null),
    };
    const seen = new Set();
    for (const d of Array.isArray(data.drills) ? data.drills : []) {
      const n = drillNumber(d?.n);
      if (n == null || seen.has(n) || !finite(d.latitude) || !finite(d.longitude)) continue;
      const drill = {
        n, latitude: d.latitude, longitude: d.longitude, placedAt: time(d.placedAt),
        poses: (Array.isArray(d.poses) ? d.poses : []).map(time).filter((x) => x != null),
        vidanges: (Array.isArray(d.vidanges) ? d.vidanges : [])
          .map((v) => ({
            at: time(v?.at), end: time(v?.end), tons: Number.isInteger(v?.tons) && v.tons > 0 ? v.tons : null,
            latitude: finite(v?.latitude) ? v.latitude : null, longitude: finite(v?.longitude) ? v.longitude : null,
          }))
          .filter((v) => v.at != null && v.end != null && v.tons != null)
          .slice(-MAX_VIDANGES),
      };
      if (drill.placedAt == null && !drill.vidanges.length) continue; // ni posée ni vidée : rien à suivre
      seen.add(n);
      t.drills.push(drill);
    }
    t.drills.sort((a, b) => a.n - b.n);
    if (!t.drills.length) t.seance = null;
    return t;
  }
}

/** Dernier moment où la foreuse a été vidée, ou posée. */
function lastAt(d) {
  return Math.max(d.vidanges.at(-1)?.end ?? -Infinity, d.placedAt ?? -Infinity);
}

/** Position moyenne des vidanges (longitudes prises par l'écart à la première : pas de saut à ±180°). */
function meanPosition(list) {
  const pts = list.filter((v) => finite(v.latitude) && finite(v.longitude));
  if (!pts.length) return {};
  const lon0 = pts[0].longitude;
  const wrap = (x) => ((x + 540) % 360) - 180;
  const latitude = pts.reduce((s, v) => s + v.latitude, 0) / pts.length;
  const shift = pts.reduce((s, v) => s + wrap(v.longitude - lon0), 0) / pts.length;
  return { latitude, longitude: wrap(lon0 + shift) };
}

/** Écart le plus grand (m) entre la foreuse et l'endroit où le SRV l'a vidée. */
function spreadOf(d, radius) {
  let max = null;
  for (const v of d.vidanges) {
    if (!finite(v.latitude) || !finite(v.longitude)) continue;
    const { distance } = surfaceRoute(d, v, radius);
    max = Math.max(max ?? 0, distance);
  }
  return max == null ? null : Math.round(max);
}
