// Alertes de passage : en arrivant dans un système, ce qui y sert à tes plans du tableau de bord. Un ingénieur dont la
// base est ici et qui peut faire un grade encore à faire (« Etienne Dorn est ici : Support vital G1 → G5 »), et un
// échangeur connu ici dont le type couvre un échange proposé pour ce qui manque. Fonction pure, testée par
// passage.test.js ; le service l'appelle à chaque arrivée en direct et ouvre la fenêtre en jeu s'il y a quelque chose.

/**
 * @param o.systemAddress système où tu arrives
 * @param o.plans [{ name, modules: calc.modules du plan }] (étapes : { grade, engineers, status })
 * @param o.bases Map nom d'ingénieur → { systemAddress } (base de son atelier)
 * @param o.echangeurs [{ station, type, exact }] échangeurs connus dans ce système
 * @param o.propositions propositions de l'échangeur (echanges.js) ; o.types Map clé de matériau → type
 * @returns [{ genre: 'ingenieur' | 'echangeur', titre, lignes: [texte] }]
 */
export function alertesPassage({ systemAddress, plans = [], bases = new Map(), echangeurs = [], propositions = [], types = new Map() }) {
  if (systemAddress == null) return [];
  const ici = String(systemAddress);
  const parIngenieur = new Map();
  for (const p of plans) {
    for (const m of p.modules || []) {
      if (m.done) continue;
      for (const step of m.steps || []) {
        for (const nom of step.engineers || []) {
          if (String(bases.get(nom)?.systemAddress ?? '') !== ici) continue;
          if (!parIngenieur.has(nom)) parIngenieur.set(nom, { debloque: false, modules: new Map() });
          const e = parIngenieur.get(nom);
          if (step.status?.list?.some((x) => x.name === nom && x.unlocked)) e.debloque = true;
          const cle = `${p.name}|${m.label}`;
          if (!e.modules.has(cle)) e.modules.set(cle, { plan: p.name, module: m.label, grades: [] });
          e.modules.get(cle).grades.push(step.grade);
        }
      }
    }
  }
  const out = [...parIngenieur].map(([nom, e]) => ({
    genre: 'ingenieur',
    titre: `${nom} est ici${e.debloque ? '' : ' (pas encore débloqué)'}`,
    lignes: [...e.modules.values()].map((x) => {
      const g = [...new Set(x.grades)].sort((a, b) => a - b);
      return `${x.module} G${g[0]}${g.length > 1 ? ` → G${g.at(-1)}` : ''} · ${x.plan}`;
    }),
  }));
  for (const s of echangeurs) {
    const utiles = propositions.filter((p) => p.echanges.length && types.get(p.key) === s.type);
    if (!utiles.length) continue;
    out.push({
      genre: 'echangeur',
      titre: `Échangeur ici : ${s.station}${s.exact ? '' : ' (type supposé)'}`,
      lignes: utiles.flatMap((p) => p.echanges.map((e) => `${e.donne} ${e.label} → ${e.recoit} ${p.label}${e.perdu ? ` (dont ${e.perdu} perdus au plafond)` : ''}`)),
    });
  }
  return out;
}

export const PASSAGE_PAGE = 'engineering-passage';
const ARRIVEES = new Set(['FSDJump', 'CarrierJump', 'Location']);
const DUREE_MS = 2 * 60_000; // la fenêtre en jeu se ferme seule au bout de 2 min, ou au saut suivant

/**
 * Alertes de passage en direct (jamais à la relecture du journal) : à chaque arrivée dans un système, calcule ce qui y
 * sert aux plans du tableau de bord ; s'il y a quelque chose, ouvre la fenêtre en jeu (overlay) et la ferme après
 * DUREE_MS, au saut suivant, ou à ✕.
 */
export class Passage {
  constructor(svc, { overlay = null, broadcast = () => {}, dureeMs = DUREE_MS } = {}) {
    this.svc = svc;
    this.overlay = overlay;
    this.broadcast = broadcast;
    this.dureeMs = dureeMs;
    this.etat = { system: null, at: null, alertes: [] };
    this.minuterie = null;
    this.calcul = 0;
  }

  onEvent(ev) {
    if (!ARRIVEES.has(ev?.event) || !Number.isSafeInteger(ev.SystemAddress)) return;
    const n = ++this.calcul; // un saut plus récent l'emporte sur un calcul en cours
    this.fermer();
    this.calculer(ev).then((alertes) => {
      if (n !== this.calcul) return;
      this.etat = { system: typeof ev.StarSystem === 'string' ? ev.StarSystem : null, at: ev.timestamp ?? null, alertes };
      this.broadcast('engineering:passage', this.etat);
      if (!alertes.length) return;
      this.overlay?.setExtra?.(PASSAGE_PAGE, true);
      this.minuterie = setTimeout(() => this.fermer(), this.dureeMs);
      this.minuterie.unref?.();
    }).catch(() => {});
  }

  async calculer(ev) {
    const svc = this.svc;
    if (!svc.ref) return [];
    const { result, items } = await svc.dashboardData();
    const echangeurs = [...svc.traders.stations.values()].filter((s) => s.systemAddress === ev.SystemAddress);
    return alertesPassage({
      systemAddress: ev.SystemAddress,
      plans: items.map((it) => ({ name: it.name, modules: it.view.calc.modules })),
      bases: svc.ref.engineerBases,
      echangeurs,
      propositions: result.echanges.propositions,
      types: new Map(result.global.materials.map((m) => [m.key, m.type])),
    });
  }

  state() {
    return this.etat;
  }

  fermer() {
    clearTimeout(this.minuterie);
    this.minuterie = null;
    this.overlay?.setExtra?.(PASSAGE_PAGE, false);
  }

  /** ✕ dans la fenêtre : fermée jusqu'à la prochaine arrivée. */
  close() {
    this.fermer();
    return this.etat;
  }
}
