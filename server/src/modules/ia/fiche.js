// Fiche de la partie du joueur, donnée d'office au modèle à chaque question : quelques lignes claires, avec leurs
// unités. Les petits modèles décident mal quand aller lire les outils (12 nov. 2026 : « je n'ai pas les détails de ton
// minage », « blindage 85 % ») ; avec les données sous les yeux, ils répondent juste. Les outils restent pour le détail.
//
// Chaque partie est lue à part : une partie de l'app absente ou en panne ne fait que manquer à la fiche.

const nb = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('fr-FR').replace(/\s/g, ' ') : '?');
const heure = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '?' : d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};
const pct = (x) => `${Math.round(x)} %`;

const t1 = (x) => (Number.isFinite(x) ? x.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : '?');
/** Rang de pilote (0 à 8, puis Élite I à V) en clair. */
const rang = (r) => (r == null ? '?' : r > 8 ? `Élite ${['I', 'II', 'III', 'IV', 'V'][r - 9] ?? ''}`.trim() : r === 8 ? 'Élite' : `${r}/8`);
const VEHICULES = { vaisseau: 'dans son vaisseau', srv: 'dans le SRV', chasseur: 'dans le chasseur', 'a pied': 'à pied', taxi: 'en taxi' };
// Indicateurs de Status.json dits au modèle (les autres ne servent pas à répondre)
const INDICATEURS = {
  aQuai: 'à quai', pose: 'posé', trainSorti: 'train sorti', supercroisiere: 'en supercroisière', armesDeployees: 'armes déployées',
  silencieux: 'course silencieuse', ecopeCarburant: 'écope de carburant en cours', masseBloquee: 'FSD bloqué par la masse',
  fsdCharge: 'FSD en charge', fsdRefroidit: 'FSD en refroidissement', carburantBas: 'carburant bas (moins de 25 %)',
  surchauffe: 'SURCHAUFFE (plus de 100 %)', enDanger: 'EN DANGER', interdiction: 'INTERDICTION EN COURS', assistanceVolCoupee: 'assistance de vol coupée',
  ecopeCargaison: 'écope de cargaison sortie', enEscadrille: 'en escadrille', oxygeneBas: 'oxygène bas', santeBasse: 'santé basse',
};

/** Lignes de la synthèse de l'état du jeu (GET /api/etat-jeu). */
export function lignesSynthese(v) {
  if (!v) return [];
  const l = [];
  const d = v.enDirect;
  if (d?.enJeu) {
    const t = [`En direct (${heure(d.at)}) : ${VEHICULES[d.vehicule] || 'lieu inconnu'}`];
    const ind = d.indicateurs.map((k) => INDICATEURS[k]).filter(Boolean);
    if (ind.length) t.push(ind.join(', '));
    if (d.pips) t.push(`énergie SYS ${t1(d.pips.sys)} / MOT ${t1(d.pips.mot)} / ARM ${t1(d.pips.arm)}`);
    if (d.ecran) t.push(`écran ouvert : ${d.ecran}`);
    if (d.corps && d.altitude != null) t.push(`à ${nb(d.altitude)} m au-dessus de ${d.corps}`);
    if (d.oxygene != null) t.push(`oxygène ${pct(d.oxygene)}, santé ${pct(d.sante)}`);
    l.push(`${t.join(', ')}.`);
  } else if (d) l.push('Le jeu est au menu ou fermé (Status.json vide).');
  const vs = v.vaisseau;
  if (vs) {
    const t = [`Vaisseau : coque ${vs.coque == null ? 'inconnue' : pct(vs.coque)}`];
    if (vs.bouclierLu && vs.boucliers !== false) t.push(`boucliers à environ ${vs.bouclierLu.pct} % (lus sur l'écran)`);
    else t.push(vs.boucliers === true ? 'boucliers en place' : vs.boucliers === false ? 'boucliers tombés' : 'boucliers inconnus');
    if (vs.carburant && vs.reservoir?.principal) t.push(`carburant ${t1(vs.carburant.principal)} / ${t1(vs.reservoir.principal)} t`);
    if (vs.rachat) t.push(`rachat ${nb(vs.rachat)} cr`);
    l.push(`${t.join(', ')}.`);
  }
  if (v.srv) {
    const t = [`SRV${v.srv.type ? ` ${v.srv.type}` : ''} déployé`];
    if (v.srv.carburant) t.push(`carburant du SRV ${t1(v.srv.carburant.principal)} t`);
    if (v.srv.soute?.length) t.push(`soute du SRV : ${v.srv.soute.map((x) => `${x.nom} ${x.quantite}`).join(', ')}`);
    l.push(`${t.join(', ')}.`);
  }
  const p = v.position;
  if (p?.systeme) {
    const t = [`Lieu : ${p.systeme}`];
    if (p.securite) t.push(p.securite.toLowerCase());
    if (p.factionControle) t.push(`contrôlé par ${p.factionControle}`);
    if (p.corps) t.push(`près de ${p.corps}`);
    l.push(`${t.join(', ')}.`);
  }
  if (v.route?.prochainSysteme || v.route?.fin) l.push(`Route : prochain saut ${v.route.prochainSysteme ?? '?'}${v.route.fin ? `, destination ${v.route.fin}` : ''}${v.route.sautsRestants != null ? `, ${v.route.sautsRestants} sauts restants` : ''}.`);
  const c = v.combat;
  if (c?.derniereAttaque || c?.interdiction) {
    const t = [];
    if (c.derniereAttaque) t.push(`dernière attaque subie le ${heure(c.derniereAttaque)}`);
    if (c.interdiction) t.push(`dernière interdiction le ${heure(c.interdiction.at)}${c.interdiction.parUnJoueur ? ' (par un joueur)' : ''}`);
    l.push(`Combat : ${t.join(', ')}.`);
  }
  const r = v.rangs;
  if (r) l.push(`Rangs : combat ${rang(r.combat?.rang)} (${r.combat?.progression ?? '?'} %), commerce ${rang(r.commerce?.rang)}, exploration ${rang(r.exploration?.rang)}, mercenaire ${rang(r.mercenaire?.rang)}, exobiologie ${rang(r.exobiologie?.rang)}.`);
  if (v.missions?.length) l.push(`Missions en cours : ${v.missions.length} (${v.missions.slice(0, 4).map((m) => m.nom).join(' ; ')}${v.missions.length > 4 ? ' ; …' : ''}).`);
  else if (Array.isArray(v.missions)) l.push('Missions en cours : aucune.');
  if (v.porteVaisseaux) l.push(`Porte-vaisseaux : ${nb(v.porteVaisseaux.carburant)} t de tritium, ${nb(v.porteVaisseaux.espaceLibre)} t d'espace libre (relevé du ${heure(v.porteVaisseaux.at)}).`);
  if (v.evenements?.length) l.push(`Derniers événements : ${v.evenements.slice(0, 5).map((e) => `${heure(e.at)} ${e.quoi}`).join(' ; ')}.`);
  return l;
}

/** Lignes de chaque partie : (données) => string[] ; une partie absente renvoie []. */
const PARTIES = [
  { chemin: '/api/etat-jeu', lignes: lignesSynthese },
  {
    chemin: '/api/modules/glance/summary',
    lignes: (g) => {
      const l = [];
      if (g.commander) l.push(`Commandant : ${g.commander}.`);
      if (g.credits?.balance != null) l.push(`Crédits : ${nb(g.credits.balance)} cr.`);
      const p = g.powerplay;
      if (p?.power) l.push(`Powerplay : au service de ${p.power}, rang ${p.rank ?? '?'}, ${nb(p.merits)} mérites au total.`);
      const s = g.system;
      if (s?.name) {
        let t = `Système actuel : ${s.name}`;
        if (s.label) t += `, ${s.label}${s.power ? ` (${s.power})` : ''}`;
        if (s.tier) t += `, ${nb(s.points)} / ${nb(s.tier)} points de contrôle vers ${s.next}`;
        if (s.reinforcement != null) t += `, cette semaine +${nb(s.reinforcement)} de renfort et −${nb(s.undermining)} de sape`;
        if (s.erosion > 0) t += `, érosion prévue au passage de jeudi : −${nb(s.erosion)} points`;
        l.push(`${t}.`);
      }
      for (const r of g.reminders || []) l.push(`Rappel : ${r.text}`);
      return l;
    },
  },
  {
    chemin: '/api/state',
    lignes: ({ game: g } = {}) => {
      if (!g) return [];
      const l = [];
      l.push(g.docked && g.station ? `Position : à quai à ${g.station} (${g.system}).` : `Position : dans le système ${g.system ?? '?'}, pas à quai.`);
      const lo = g.loadout || {};
      const cap = lo.cargoCapacity;
      const pris = g.cargoCount ?? 0;
      const v = [`Vaisseau actuel : ${g.ship ?? '?'}`];
      if (cap != null) v.push(`soute ${nb(pris)} t utilisées sur ${nb(cap)} t (${nb(cap - pris)} t libres)`);
      if (lo.maxJumpRange != null) v.push(`saut maximal ${lo.maxJumpRange.toFixed(1).replace('.', ',')} al`);
      l.push(`${v.join(', ')}.`);
      if (g.cargo?.length) l.push(`Soute du vaisseau : ${g.cargo.map((c) => `${c.label} ${nb(c.count)} t`).join(', ')}.`);
      return l;
    },
  },
  {
    chemin: '/api/modules/combat/session',
    lignes: (c) => {
      const l = [];
      const v = c.vaisseau;
      // Coque et boucliers : dans la partie « en direct » (synthèse) ; ici, le détail des modules
      if (v?.modules?.length) {
        const quand = `relevé du ${heure(v.releveAt || v.coqueAt)}`;
        l.push(v.sousSeuil?.length
          ? `Modules abîmés : ${v.sousSeuil.map((m) => `${m.nom} ${pct(m.sante)}`).join(', ')} (${quand}).`
          : `Modules : tous à ${pct(Math.min(...v.modules.map((m) => m.sante)))} ou plus (${quand}).`);
      }
      if (c.startedAt) l.push(`Session de combat depuis le ${heure(c.startedAt)} : ${nb(c.kills)} ennemis abattus, ${nb(c.credits)} cr de primes et obligations, ${nb(c.merits?.combat)} mérites de combat.`);
      return l;
    },
  },
  {
    chemin: '/api/modules/waypoints/session',
    lignes: (w) => {
      if (!w?.startedAt) return [];
      const ores = (w.ores || []).map((o) => `${o.label} ${nb(o.refined)} t`).join(', ') || `${w.label ?? '?'} ${nb(w.refined)} t`;
      return [`Dernière session de minage au SRV Rhino : commencée le ${heure(w.startedAt)} sur ${w.body ?? w.system ?? '?'}, ${ores} raffinées, ${nb(w.perHour)} t/h, ${nb(w.sold)} t vendues, ${nb(w.unsold)} t pas encore vendues.`];
    },
  },
  {
    chemin: '/api/modules/shipmining/session',
    lignes: (s) => {
      if (!s?.startedAt) return [];
      const refined = (s.refined || []).map((r) => `${r.name} ${nb(r.tons)} t`).join(', ');
      return [`Session de minage en vaisseau depuis le ${heure(s.startedAt)} : ${refined || 'rien raffiné'}${s.perHour ? `, ${nb(s.perHour)} t/h` : ''}.`];
    },
  },
  {
    chemin: '/api/modules/builder/fleet',
    lignes: (f) => (Array.isArray(f) && f.length ? [`Flotte : ${f.length} vaisseaux (${f.map((s) => s.ship).join(', ')}).`] : []),
  },
];

/** Ce que l'app ne sait pas : dit d'avance, pour que le modèle ne le devine pas. */
export const INCONNU = 'Inconnu de l’app : le pourcentage exact des boucliers (seulement « en place » ou « tombés », sauf jauge lue sur l’écran) ; le carburant du SRV quand le joueur n’est pas dedans ; l’état du chasseur ; le marché des stations où il n’a pas ouvert le marché.';

/**
 * Fiche du joueur, à donner au modèle : lignes « Fiche … » ; chaque partie est lue à part (absente : rien).
 * @param lire GET sur l'API locale (JSON ou null)
 */
export async function ficheJoueur(lire, { now = new Date() } = {}) {
  const parties = await Promise.all(PARTIES.map(async (p) => {
    try {
      const d = await lire(p.chemin);
      return d ? p.lignes(d) : [];
    } catch {
      return [];
    }
  }));
  const lignes = parties.flat();
  if (!lignes.length) return null;
  return [`Fiche de la partie du joueur, lue dans l'app à ${heure(now.toISOString())} (ce sont des faits sûrs) :`, ...lignes.map((l) => `- ${l}`), `- ${INCONNU}`].join('\n');
}
