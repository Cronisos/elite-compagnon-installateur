// Bibliothèque des EEP balayés : chaque balayage est gardé, jamais écrasé par le suivant, avec sa planète, son système,
// son numéro d'EEP quand le jeu l'a donné (cible ou « destination la plus proche » au posé / décollage : mining.js),
// son centre, son rayon et ce que le scanner a couvert. C'est une petite carte de l'EEP, qu'on peut revoir et partager.
//
// Le jeu ne donne ni la position ni la taille d'un EEP : c'est le centre et le bord marqués qui le situent. Au sol,
// l'app retrouve seule l'EEP dont le disque te contient (follow) : sa carte s'affiche ; hors de tout disque balayé de la
// planète, plus d'EEP actif (« nouvel EEP : marque le centre »). En vol (pas au sol), l'EEP actif ne change pas.

import { randomUUID } from 'node:crypto';
import { MIN_RADIUS, Sweep, coveredBits, isoDate, project } from './sweep.js';

export const VERSION_EXPORT = 1;
const MARGE = 500; // m au-delà du bord : encore dans l'EEP (bord marqué à la main, SRV qui déborde)
const RAYON_CENTRE_SEUL = 1500; // m : centre marqué sans bord encore, l'EEP s'étend au moins jusque-là
const MAX_SANS_BORD = 30000; // m : centre marqué sans bord, l'EEP actif le reste jusque-là (route vers le bord, parfois bien plus de 4 km)
const MAX_EEPS = 500;
const MAX_NOM = 80;

const auSol = (h) => h && Number.isFinite(h.latitude) && Number.isFinite(h.longitude) && h.body;
// Posé pour de vrai (SRV, à pied, vaisseau posé : `grounded` de here()) : en survol bas, Status.json donne aussi la
// position et la planète, mais l'EEP actif ne doit pas changer en passant au-dessus d'un autre
const pose = (h) => auSol(h) && (h.grounded === true || h.vehicle === 'srv' || h.vehicle === 'onfoot');
/** Numéro d'EEP du jeu : entier de 0 à 9999, sinon rien (un 1e300 ferait échouer la base). */
const numeroPropre = (v) => (Number.isInteger(v) && v >= 0 && v <= 9999 ? v : null);
const nomPropre = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_NOM) || null;

function bad(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  err.publicMessage = message;
  return err;
}

export class EepLibrary {
  constructor() {
    this.eeps = []; // { id, nom, numero, createdAt, updatedAt, sweep }
    this.actifId = null;
  }

  get actif() {
    return this.eeps.find((e) => e.id === this.actifId) || null;
  }

  /** Balayage de l'EEP actif, ou un balayage vide (« marque le centre »). */
  get sweep() {
    return this.actif?.sweep || (this.vide ??= new Sweep());
  }

  /** Distance de ta position au centre d'un EEP (m), ou null si tu n'es pas sur sa planète. */
  static distance(e, here) {
    const c = e.sweep.center;
    if (!c || !auSol(here) || here.body !== c.body) return null;
    return project(c, here, c.planetRadius).d;
  }

  /** L'EEP dont le disque te contient (le plus proche de son centre s'il y en a plusieurs), ou null. */
  locate(here) {
    let best = null;
    for (const e of this.eeps) {
      const d = EepLibrary.distance(e, here);
      if (d == null) continue;
      const limite = (e.sweep.radius ?? RAYON_CENTRE_SEUL) + MARGE;
      if (d <= limite && (!best || d < best.d)) best = { e, d };
    }
    return best?.e || null;
  }

  /**
   * Suit ta position : au sol (SRV, à pied, vaisseau posé), l'EEP qui te contient devient l'EEP actif (aucun : plus
   * d'EEP actif). En vol, même bas au-dessus d'un autre EEP, rien ne change. Le numéro d'EEP donné par le jeu (`site` : { body, number }) complète l'EEP actif qui n'en a pas encore.
   * Renvoie vrai si l'EEP actif a changé.
   */
  follow(here, site = null) {
    if (!pose(here)) return false;
    let e = this.locate(here);
    // Centre marqué, bord pas encore : tu roules vers le bord, qui peut être bien au-delà de RAYON_CENTRE_SEUL. L'EEP
    // reste actif sur sa planète jusqu'à MAX_SANS_BORD, même en traversant le disque d'un autre EEP.
    const courant = this.actif;
    if (courant?.sweep.center && courant.sweep.radius == null) {
      const d = EepLibrary.distance(courant, here);
      if (d != null && d <= MAX_SANS_BORD) e = courant;
    }
    const avant = this.actifId;
    this.actifId = e?.id ?? null;
    if (e && e.numero == null && site?.body === here.body && Number.isInteger(site.number)) {
      e.numero = site.number;
      e.updatedAt = new Date().toISOString();
    }
    return avant !== this.actifId;
  }

  /**
   * Centre marqué : dans le disque d'un EEP déjà balayé, son balayage repart de là (même EEP, même nom) ; sinon un
   * nouvel EEP est créé. `site` : numéro d'EEP connu du jeu pour cette planète.
   */
  marquerCentre(here, site = null) {
    const sweep = new Sweep();
    sweep.setCenter(here); // vérifie la position (au sol, planète connue)
    const dedans = this.eeps.find((e) => {
      const d = EepLibrary.distance(e, here);
      return d != null && e.sweep.radius != null && d <= e.sweep.radius;
    });
    const now = new Date().toISOString();
    const numero = site?.body === here.body && Number.isInteger(site.number) ? site.number : null;
    if (dedans) {
      dedans.sweep = sweep;
      dedans.numero ??= numero;
      dedans.updatedAt = now;
      this.actifId = dedans.id;
      return dedans;
    }
    if (this.eeps.length >= MAX_EEPS) throw bad(`Bibliothèque pleine (${MAX_EEPS} EEP) : efface d’anciens EEP.`, 409);
    const e = { id: randomUUID(), nom: null, numero, createdAt: now, updatedAt: now, sweep };
    this.eeps.push(e);
    this.actifId = e.id;
    return e;
  }

  get(id) {
    const e = this.eeps.find((x) => x.id === id);
    if (!e) throw bad('EEP introuvable.', 404);
    return e;
  }

  renommer(id, nom) {
    const e = this.get(id);
    e.nom = nomPropre(nom);
    e.updatedAt = new Date().toISOString();
    return e;
  }

  effacer(id) {
    this.get(id);
    this.eeps = this.eeps.filter((e) => e.id !== id);
    if (this.actifId === id) this.actifId = null;
  }

  /** Résumé d'un EEP pour la liste ; `marks` : repères de sa planète (pour compter les minerais de son disque). */
  resume(e, marks = []) {
    const s = e.sweep;
    const v = s.state === 'ready' ? s.view(null, marks) : null;
    const minerais = {};
    for (const m of v?.marks || []) if (m.ore && !m.auto && m.d <= s.radius) minerais[m.ore] = (minerais[m.ore] || 0) + 1;
    return {
      id: e.id,
      nom: e.nom,
      numero: e.numero,
      system: s.center?.system || null,
      body: s.center?.body || null,
      center: s.center && { latitude: s.center.latitude, longitude: s.center.longitude },
      radius: s.radius,
      state: s.state,
      covered: v ? v.covered : 0,
      done: Boolean(v?.done),
      minerais: Object.entries(minerais).sort((a, b) => b[1] - a[1]).map(([ore, n]) => ({ ore, n })),
      reperes: (v?.marks || []).filter((m) => !m.auto && m.d <= s.radius).length,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      actif: e.id === this.actifId,
    };
  }

  toJSON() {
    return { version: 1, actif: this.actifId, eeps: this.eeps.map((e) => ({ id: e.id, nom: e.nom, numero: e.numero, createdAt: e.createdAt, updatedAt: e.updatedAt, ...e.sweep.toJSON() })) };
  }

  /** Relu sans confiance ; `ancien` : l'unique balayage d'avant la bibliothèque (sweep.json), repris s'il y en avait un. */
  static fromJSON(data, ancien = null) {
    const lib = new EepLibrary();
    const liste = Array.isArray(data?.eeps) ? data.eeps : [];
    for (const x of liste.slice(0, MAX_EEPS)) {
      if (!x || typeof x !== 'object' || typeof x.id !== 'string' || !x.center) continue;
      let sweep;
      try {
        sweep = Sweep.fromJSON(x);
      } catch {
        continue;
      }
      if (!sweep.center) continue;
      lib.eeps.push({
        id: x.id.slice(0, 64),
        nom: nomPropre(x.nom),
        numero: numeroPropre(x.numero),
        createdAt: isoDate(x.createdAt) ?? sweep.startedAt,
        updatedAt: isoDate(x.updatedAt) ?? sweep.startedAt,
        sweep,
      });
    }
    if (!liste.length && ancien?.center) {
      try {
        const sweep = Sweep.fromJSON(ancien);
        if (sweep.center) lib.eeps.push({ id: randomUUID(), nom: null, numero: null, createdAt: sweep.startedAt, updatedAt: sweep.startedAt, sweep });
      } catch {
        // ancien balayage illisible : on repart d'une bibliothèque vide
      }
    }
    lib.actifId = lib.eeps.some((e) => e.id === data?.actif) ? data.actif : null;
    return lib;
  }

  /**
   * Carte à partager : l'EEP (planète, système, numéro, nom, centre, rayon, couverture) et les repères de minerais de
   * son disque (position, minerai, foreuses, tari). Rien du joueur : ni nom de commandant, ni notes.
   */
  exporter(e, marks = []) {
    const s = e.sweep;
    if (s.state !== 'ready') throw bad('Cet EEP n’a pas encore de bord marqué : rien à partager.', 409);
    const v = s.view(null, marks);
    const parId = new Map(marks.map((m) => [m.id, m]));
    return {
      format: 'elite-compagnon-eep',
      version: VERSION_EXPORT,
      exporteLe: new Date().toISOString(),
      nom: e.nom,
      numero: e.numero,
      ...s.toJSON(),
      trail: [],
      reperes: v.marks.filter((m) => !m.auto && m.d <= s.radius * 1.2).map((m) => {
        const w = parId.get(m.id);
        return { latitude: w.latitude, longitude: w.longitude, ore: m.ore, category: w.category || 'mining', drills: m.drills ?? null, depleted: m.depleted, unprofitable: m.unprofitable };
      }),
    };
  }

  /**
   * Carte reçue : relue sans confiance (position, rayons, couverture, minerai, nombres). Rien n'est ajouté ici : l'EEP
   * rendu entre dans la bibliothèque par `ajouter`, une fois ses repères créés dans la base par l'appelant (pas d'import
   * fait à moitié si la base refuse).
   */
  importer(data) {
    if (!data || data.format !== 'elite-compagnon-eep' || data.version !== VERSION_EXPORT) throw bad('Ce fichier n’est pas une carte d’EEP d’Elite Compagnon.');
    const c = data.center;
    const ok = (v, max) => Number.isFinite(v) && Math.abs(v) <= max;
    if (!c || !ok(c.latitude, 90) || !ok(c.longitude, 180) || typeof c.body !== 'string' || !c.body) throw bad('Carte illisible : centre de l’EEP manquant.');
    if (!(Number.isFinite(c.planetRadius) && c.planetRadius >= 1 && c.planetRadius <= 1e8)) throw bad('Carte illisible : rayon de la planète impossible.');
    if (!(Number.isFinite(data.radius) && data.radius >= MIN_RADIUS && data.radius <= 50_000)) throw bad('Carte illisible : rayon de l’EEP impossible.');
    if (data.covered != null && !coveredBits(data.covered, data.radius)) throw bad('Carte illisible : la zone balayée est abîmée.');
    const sweep = Sweep.fromJSON({ ...data, trail: [], center: { latitude: c.latitude, longitude: c.longitude, body: c.body.slice(0, 120), system: typeof c.system === 'string' ? c.system.slice(0, 120) : null, planetRadius: c.planetRadius } });
    if (this.eeps.length >= MAX_EEPS) throw bad(`Bibliothèque pleine (${MAX_EEPS} EEP) : efface d’anciens EEP.`, 409);
    const now = new Date().toISOString();
    const e = { id: randomUUID(), nom: nomPropre(`${nomPropre(data.nom) || 'EEP'} (reçu)`), numero: numeroPropre(data.numero), createdAt: now, updatedAt: now, sweep };
    const reperes = (Array.isArray(data.reperes) ? data.reperes : []).slice(0, 500)
      .filter((r) => r && ok(r.latitude, 90) && ok(r.longitude, 180))
      .map((r) => ({
        latitude: r.latitude,
        longitude: r.longitude,
        ore: typeof r.ore === 'string' ? r.ore.slice(0, 40) : null,
        drills: Number.isInteger(r.drills) && r.drills >= 0 && r.drills <= 20 ? r.drills : null,
        depleted: r.depleted === true,
        unprofitable: r.unprofitable === true,
      }));
    return { eep: e, reperes };
  }

  /** EEP reçu (rendu par `importer`) ajouté à la bibliothèque. */
  ajouter(e) {
    if (this.eeps.length >= MAX_EEPS) throw bad(`Bibliothèque pleine (${MAX_EEPS} EEP) : efface d’anciens EEP.`, 409);
    this.eeps.push(e);
    return e;
  }

  /**
   * EEP reçu ajouté avec ses repères, tout ou rien : la place est prise tout de suite (deux imports en même temps ne
   * passent pas tous les deux le contrôle de la bibliothèque pleine), puis `creer` crée les repères dans la base. Si
   * la base refuse, l'EEP est retiré : ni EEP sans repères, ni repères sans EEP (à `creer` d'écrire d'un bloc).
   */
  async ajouterAvec(e, creer) {
    this.ajouter(e);
    try {
      return await creer();
    } catch (err) {
      this.eeps = this.eeps.filter((x) => x !== e);
      if (this.actifId === e.id) this.actifId = null;
      throw err;
    }
  }
}
