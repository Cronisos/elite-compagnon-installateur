// Objectifs communautaires (OC) du « Coup d'œil » : pour chaque OC rejoint, temps restant, ta contribution, ta
// tranche et le palier atteint ; alerte « contribution nulle, fin dans 24 h » ; récompense à réclamer, avec la station.
//
// Le journal ne parle que des OC rejoints :
//   - CommunityGoal : état de tous les OC auxquels tu es inscrit (CurrentGoals), écrit « quand le jeu interroge le
//     serveur et que les données ont changé » (schéma http://schemas.edomh.nl/CommunityGoal.html, lu le 7 nov. 2026) ;
//   - CommunityGoalJoin, CommunityGoalDiscard, CommunityGoalReward : inscription, abandon, récompense touchée.
// Pas d'estimation de la tranche ni du palier suivant : leurs seuils ne sont pas publiés.
//
// Champs vérifiés sur les journaux de référence (24 oct. – 7 nov. 2026, OC 863 « Opération minière » et 864
// « Opération commerciale » de Faulcon DeLacy) : CGID, Title (parfois suivi d'espaces), SystemName, MarketName,
// Expiry, IsComplete, CurrentTotal, PlayerContribution, NumContributors, TopTier { Name, Bonus }, TopRankSize,
// PlayerInTopRank, PlayerPercentileBand ; TierReached et Bonus absents tant que le premier palier n'est pas atteint.
// Ces textes ne sont pas des champs *_Localised : ils passent ici par cleanText (core/text.js), comme les autres.

import { cleanText } from '../../core/text.js';

// ── Règles du jeu : dépôt des règles, server/src/regles/objectifs.js (voir regles/LISEZMOI.md) ─────────────────
import { NO_CONTRIBUTION_BAND, MIN_CONTRIBUTION_FOR_REWARD, TIER_REACHED_FIELD, TIER_NUMBER, CLAIM_AT_GOAL_STATION } from '../../regles/objectifs.js';

export { NO_CONTRIBUTION_BAND, MIN_CONTRIBUTION_FOR_REWARD, TIER_REACHED_FIELD, TIER_NUMBER, CLAIM_AT_GOAL_STATION };

// ── Choix de l'app (pas des règles du jeu) ──────────────────────────────────────────────────────────────────────

/** Alerte « contribution nulle » quand il reste au plus ce nombre d'heures (demandé par l'idée 5, 7 nov. 2026). */
export const ZERO_CONTRIBUTION_ALERT_HOURS = 24;

export const COMMUNITY_GOAL_EVENTS = ['CommunityGoal', 'CommunityGoalJoin', 'CommunityGoalDiscard', 'CommunityGoalReward'];

const clean = (s) => (typeof s === 'string' ? cleanText(s) : ''); // entités HTML, espaces (Title « … » suivi d'espaces)
const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const iso = (s) => (typeof s === 'string' && Number.isFinite(Date.parse(s)) ? s : null);

/** « Niveau 3 » → 3 ; nom inconnu ou absent → null. */
export function tierNumber(name) {
  const m = TIER_NUMBER.exec(clean(name));
  return m ? Number(m[1]) : null;
}

/** Durée restante lisible : « 40 min », « 18 h », « 3 j ». */
export function leftText(hours) {
  if (hours == null) return '—';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${Math.round(hours / 24)} j`;
}

const credits = (n) =>
  n >= 1e6 ? `${(n / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M cr` : `${Math.round(n).toLocaleString('fr-FR')} cr`;

export class CommunityGoals {
  constructor() {
    this.goals = new Map(); // CGID → OC rejoint
    this.at = null; // dernier relevé CommunityGoal
  }

  record(id) {
    if (!this.goals.has(id)) {
      this.goals.set(id, {
        id, title: '', system: '', station: '', expiry: null, complete: false, contribution: null, contributors: null,
        total: null, band: null, tierName: null, tier: null, topTier: null, topRankSize: null, inTopRank: false,
        bonus: null, listed: false, at: null, joinedAt: null, discardedAt: null, rewardedAt: null, reward: null,
      });
    }
    return this.goals.get(id);
  }

  /** Applique un événement du journal ; false s'il ne concerne pas les OC. */
  apply(ev) {
    switch (ev?.event) {
      case 'CommunityGoal': {
        // Relevé complet des OC rejoints : ceux qui n'y sont plus ne sont plus suivis par le jeu
        const listed = new Set();
        for (const g of Array.isArray(ev.CurrentGoals) ? ev.CurrentGoals : []) {
          const id = num(g?.CGID);
          if (id == null) continue;
          listed.add(id);
          const goal = this.record(id);
          const tierName = clean(g[TIER_REACHED_FIELD]) || null;
          Object.assign(goal, {
            title: clean(g.Title) || goal.title,
            system: clean(g.SystemName) || goal.system,
            station: clean(g.MarketName) || goal.station,
            expiry: iso(g.Expiry) || goal.expiry,
            complete: g.IsComplete === true,
            total: num(g.CurrentTotal),
            contribution: num(g.PlayerContribution),
            contributors: num(g.NumContributors),
            band: num(g.PlayerPercentileBand),
            tierName,
            tier: tierNumber(tierName),
            topTier: tierNumber(g.TopTier?.Name),
            topRankSize: num(g.TopRankSize),
            inTopRank: g.PlayerInTopRank === true,
            bonus: tierName ? num(g.Bonus) : null,
            listed: true,
            at: ev.timestamp || null,
          });
        }
        for (const [id, goal] of this.goals) if (!listed.has(id)) goal.listed = false;
        this.at = ev.timestamp || null;
        return true;
      }
      case 'CommunityGoalJoin': {
        const id = num(ev.CGID);
        if (id == null) return false;
        const goal = this.record(id);
        goal.title = clean(ev.Name) || goal.title;
        goal.system = clean(ev.System) || goal.system;
        goal.joinedAt = ev.timestamp || null;
        goal.discardedAt = null;
        goal.listed = true; // visible avant le prochain relevé CommunityGoal
        return true;
      }
      case 'CommunityGoalDiscard': {
        const id = num(ev.CGID);
        if (id == null) return false;
        this.record(id).discardedAt = ev.timestamp || 'inconnu';
        return true;
      }
      case 'CommunityGoalReward': {
        const id = num(ev.CGID);
        if (id == null) return false;
        const goal = this.record(id);
        goal.title = goal.title || clean(ev.Name);
        goal.system = goal.system || clean(ev.System);
        goal.rewardedAt = ev.timestamp || 'inconnu';
        goal.reward = num(ev.Reward);
        return true;
      }
      default:
        return false;
    }
  }

  /**
   * OC à afficher : en cours (ou terminés, résultats en attente) et récompenses à réclamer.
   * Un OC abandonné, déjà payé, terminé sans rien à réclamer, ou terminé sans contribution (même avant les résultats)
   * n'apparaît plus.
   */
  summary(now = Date.now()) {
    const active = [];
    const toClaim = [];
    for (const g of this.goals.values()) {
      if (!g.listed || g.discardedAt || g.rewardedAt) continue;
      const end = g.expiry ? Date.parse(g.expiry) : null;
      const hoursLeft = end != null ? (end - now) / 3600e3 : null;
      const ended = g.complete || (hoursLeft != null && hoursLeft <= 0);
      const contributed = g.contribution != null && g.contribution >= MIN_CONTRIBUTION_FOR_REWARD;
      // Contribution nulle : 0 au journal, ou champ absent avec la tranche des non-contributeurs
      const none = g.contribution === 0 || (g.contribution == null && g.band === NO_CONTRIBUTION_BAND);
      const view = {
        id: g.id,
        title: g.title,
        system: g.system,
        station: g.station,
        expiry: g.expiry,
        hoursLeft: ended ? 0 : hoursLeft,
        status: !ended ? 'active' : g.complete ? 'done' : 'pending',
        contribution: g.contribution,
        contributors: g.contributors,
        total: g.total,
        // Sans contribution, le jeu donne la tranche NO_CONTRIBUTION_BAND : elle ne veut rien dire
        band: contributed ? g.band : null,
        inTopRank: g.inTopRank,
        topRankSize: g.topRankSize,
        tier: g.tier,
        tierName: g.tierName,
        topTier: g.topTier,
        reward: contributed ? g.bonus : null,
        noContribution: none,
        zeroAlert: !ended && none && hoursLeft != null && hoursLeft <= ZERO_CONTRIBUTION_ALERT_HOURS,
        at: g.at,
      };
      // Terminé sans contribution : rien à attendre des résultats (MIN_CONTRIBUTION_FOR_REWARD), l'OC disparaît
      if (!ended || (view.status === 'pending' && !none)) active.push(view);
      else if (contributed && g.tierName) {
        toClaim.push({ ...view, status: 'claim', claimAt: CLAIM_AT_GOAL_STATION ? { station: g.station, system: g.system } : null });
      }
    }
    const byEnd = (a, b) => (a.expiry || '9').localeCompare(b.expiry || '9');
    return { at: this.at, alertHours: ZERO_CONTRIBUTION_ALERT_HOURS, active: active.sort(byEnd), toClaim: toClaim.sort(byEnd) };
  }

  /** Rappels du Coup d'œil : contribution nulle près de la fin, récompense à réclamer. */
  reminders(now = Date.now()) {
    const { active, toClaim } = this.summary(now);
    const where = (g) => (g.station ? ` à ${g.station}${g.system ? ` (${g.system})` : ''}` : g.system ? ` (${g.system})` : '');
    const out = [];
    for (const g of active) {
      if (g.zeroAlert) out.push({ level: 'warning', text: `Objectif communautaire « ${g.title} »${where(g)} : contribution nulle, fin dans ${leftText(g.hoursLeft)}.` });
    }
    for (const g of toClaim) {
      out.push({ level: 'warning', text: `Récompense d'objectif communautaire à réclamer${where(g)} : « ${g.title} »${g.reward ? `, ${credits(g.reward)}` : ''}.` });
    }
    return out;
  }
}
