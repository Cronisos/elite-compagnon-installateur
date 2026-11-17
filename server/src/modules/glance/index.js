// Module « Coup d'œil » : synthèse de tout ce que le commandant possède et peut encaisser.

import { GlanceState, GLANCE_EVENTS, LOCKER_HISTORY, reminders } from './state.js';
import { systemChange } from './powerplay.js';
import { RebuyState, REBUY_EVENTS, UNDOCK_ALERT_MS, deathLoss, rebuyReminders } from './rebuy.js';
import { idError, requireRowId } from '../../core/ids.js';
import { loadReference } from '../../core/reference/refdata.js';
import { REBUY_RATE } from '../../regles/rachat.js';

const SET = new Set(GLANCE_EVENTS);
const REBUY_SET = new Set(REBUY_EVENTS);
const CURRENCIES = { credits: 'Crédits', merits: 'Mérites Powerplay', merc: 'Points de mercenaire' };
// Clé venue d'une requête ou de la base : propre seulement (« __proto__ », « constructor » ne sont pas des monnaies)
const isCurrency = (c) => typeof c === 'string' && Object.hasOwn(CURRENCIES, c);
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

function bad(message) {
  const err = new Error(message);
  err.status = 400;
  err.publicMessage = message;
  return err;
}

/**
 * Nom lisible d'un type de vaisseau du journal (« lakonminer » → « Type-11 Prospector ») : celui des données de
 * référence (core/reference/refdata.js, comme Mon ingénierie), lues la première fois qu'il en faut un. null tant
 * qu'elles ne sont pas téléchargées (ou si elles sont abîmées), et pour un type qu'elles ne connaissent pas.
 */
export function referenceShipNames(load = loadReference) {
  let ref = null;
  return (type) => {
    try {
      ref ??= load();
    } catch {
      return null;
    }
    if (!ref || typeof type !== 'string' || !type) return null;
    const key = ref.shipKey(type);
    return key || ref.journalShip.has(type.toLowerCase()) ? ref.shipName(key, type) : null;
  };
}

export default {
  id: 'glance',
  name: "Coup d'œil",

  /** shipTypeName : nom d'un type de vaisseau (tests) ; par défaut, celui des données de référence. */
  async register({ router, prisma, journal, game, broadcast, overlay, vigie }, { shipTypeName = referenceShipNames() } = {}) {
    const newRebuy = () => new RebuyState({ typeName: shipTypeName });
    let state = new GlanceState();
    let rebuy = newRebuy(); // rachat couvert, mode de jeu, dernière destruction : voir rebuy.js
    let timer = null;
    let alertTimer = null;
    const notify = () => {
      clearTimeout(timer);
      timer = setTimeout(() => broadcast('glance:update', {}), 400);
    };

    // Rachat : avant que l'état ne l'efface (Died), on relève ce que la destruction fait perdre
    const applyRebuy = (ev, now = null) => REBUY_SET.has(ev.event) && rebuy.apply(ev, { now, loss: ev.event === 'Died' ? deathLoss(state, rebuy.cargoTons) : null });
    journal.addInterest(GLANCE_EVENTS.filter((n) => n !== 'ShipLocker'));
    journal.addInterest(['ShipLocker'], { history: LOCKER_HISTORY }); // le dernier inventaire complet seulement
    journal.addInterest(REBUY_EVENTS);
    journal.on('ready', ({ history }) => {
      state = new GlanceState();
      rebuy = newRebuy();
      for (const ev of history) {
        applyRebuy(ev);
        if (SET.has(ev.event)) state.apply(ev);
      }
      notify();
    });
    // Vigie des règles (en direct seulement) : taux du rachat de chaque nouvel équipement face au plafond de la fiche
    // rachat.taux, et coût payé à une résurrection face au rachat attendu (rachat.cout-paye)
    const vigieRachat = (ev) => {
      if (!vigie) return;
      if (ev.event === 'Loadout') {
        const valeur = (Number(ev.HullValue) || 0) + (Number(ev.ModulesValue) || 0);
        const prix = Number(ev.Rebuy);
        if (valeur > 0 && Number.isFinite(prix) && ev.Rebuy != null) {
          const taux = prix / valeur;
          vigie.observe({ regle: 'rachat.taux', attendu: REBUY_RATE, observe: Math.round(taux * 1e6) / 1e6, ecart: taux > REBUY_RATE + 1e-6, details: { vaisseau: String(ev.Ship || '').toLowerCase().slice(0, 40) } });
        }
      } else if (ev.event === 'Resurrect') {
        const r = rebuy.resurrect;
        if (r?.option === 'rebuy' && r.expectedCost != null) {
          const ecart = r.cost !== r.expectedCost;
          vigie.observe({ regle: 'rachat.cout-paye', attendu: r.expectedCost, observe: r.cost, ecart, explication: ecart && r.bankrupt ? 'faillite' : null });
        }
      }
    };
    journal.on('event', (ev) => {
      const changed = applyRebuy(ev, Date.now());
      vigieRachat(ev);
      if ((SET.has(ev.event) && state.apply(ev)) || changed) notify();
      // Décollage sans rachat couvert : la fenêtre Coup d'œil s'ouvre d'elle-même le temps de l'alerte (en plus des
      // fenêtres choisies : si elle était déjà ouverte, rien ne change). Elle se referme au bout de l'alerte, à quai ou à la mort.
      if (ev.event === 'Undocked' && rebuyView().alert) {
        overlay?.setExtra('glance', true);
        clearTimeout(alertTimer);
        alertTimer = setTimeout(endAlert, UNDOCK_ALERT_MS);
        alertTimer.unref?.();
      } else if (alertTimer && (ev.event === 'Docked' || ev.event === 'Died')) {
        endAlert();
      }
    });
    function endAlert() {
      clearTimeout(alertTimer);
      alertTimer = null;
      overlay?.setExtra('glance', false);
      notify(); // la fin de l'alerte se voit sans attendre le prochain événement
    }
    game.on('change', notify); // solde, soute

    function toCashTotal() {
      const e = state.exploration().value;
      return state.bounties + state.bonds + e + state.exobiology().value;
    }
    function rebuyView() {
      const g = game.snapshot();
      return rebuy.view({ balance: g.balance, toCash: toCashTotal(), cargo: g.cargo || [], docked: g.docked });
    }

    async function manualValues() {
      const rows = await prisma.glanceValue.findMany();
      return Object.fromEntries(rows.map((r) => [r.key, { value: r.value, updatedAt: r.updatedAt }]));
    }

    router.get('/summary', wrap(async (req, res) => {
      const g = game.snapshot();
      const manual = await manualValues();
      const exploration = state.exploration();
      const exobiology = state.exobiology();
      const rebuyNow = rebuyView();
      // Soute : marchandises de mission et marchandises Powerplay
      const cargo = g.cargo || [];
      const powerplayCargo = cargo
        .filter((c) => state.powerplayTypes.has(c.name))
        .map((c) => ({ name: c.name, label: state.powerplayTypes.get(c.name), count: c.count }));
      const missions = [...state.missions.values()];
      const missionCargo = 0; // Cargo.json ne précise pas l'origine sans MissionID : compté via les missions
      const locker = state.locker;
      const sum = (list) => (list || []).reduce((a, x) => a + (x.Count || 0), 0);

      const owned = {
        credits: g.balance,
        merits: state.powerplay.merits,
        merc: manual.merc?.value ?? null,
      };
      // Un objectif d'une monnaie inconnue (ligne d'une ancienne version) est ignoré : il ne bloque pas la page
      const goals = (await prisma.glanceGoal.findMany({ orderBy: { id: 'asc' } })).filter((x) => isCurrency(x.currency)).map((x) => ({
        ...x,
        currencyLabel: CURRENCIES[x.currency],
        owned: owned[x.currency],
        missing: owned[x.currency] == null ? null : Math.max(0, x.target - owned[x.currency]),
      }));

      res.json({
        commander: g.commander,
        credits: { balance: g.balance, at: g.balanceAt },
        powerplay: state.powerplay,
        system: state.system && { ...state.system, change: systemChange(state.system, state.powerplay.power) },
        merc: { value: owned.merc, updatedAt: manual.merc?.updatedAt || null, source: 'saisie manuelle (absent du journal)' },
        toCash: {
          bounties: state.bounties,
          bonds: state.bonds,
          exploration,
          exobiology,
          lostAt: state.lostAt,
        },
        cargo: { count: g.cargoCount, items: cargo, powerplay: powerplayCargo },
        missions,
        locker: locker
          ? { items: sum(locker.Items), components: sum(locker.Components), consumables: sum(locker.Consumables), data: sum(locker.Data), at: locker.timestamp }
          : null,
        goals,
        rebuy: rebuyNow,
        communityGoals: state.communityGoals.summary(),
        reminders: [...rebuyReminders(rebuyNow), ...reminders({ exploration, exobiology, bounties: state.bounties, bonds: state.bonds, missions, powerplayCargo, missionCargo }), ...state.communityGoals.reminders()],
      });
    }));

    /** Valeur saisie à la main (ex. points de mercenaire). */
    router.put('/manual/:key', wrap(async (req, res) => {
      const key = req.params.key;
      if (!['merc'].includes(key)) throw bad('Valeur inconnue.');
      const v = Number(req.body?.value);
      if (!Number.isFinite(v) || v < 0) throw bad('Nombre invalide.');
      await prisma.glanceValue.upsert({ where: { key }, create: { key, value: v }, update: { value: v } });
      notify();
      res.json({ ok: true });
    }));

    router.post('/goals', wrap(async (req, res) => {
      const { label, currency, target } = req.body || {};
      if (!isCurrency(currency)) throw bad('Monnaie inconnue.');
      const t = Number(target);
      if (!Number.isFinite(t) || t <= 0) throw bad('Objectif invalide.');
      const goal = await prisma.glanceGoal.create({ data: { label: String(label || CURRENCIES[currency]).slice(0, 80), currency, target: t } });
      notify();
      res.status(201).json(goal);
    }));

    router.delete('/goals/:id', wrap(async (req, res) => {
      const { count } = await prisma.glanceGoal.deleteMany({ where: { id: requireRowId(req.params.id, 'Objectif introuvable.') } });
      if (!count) throw idError(404, 'Objectif introuvable.');
      notify();
      res.json({ ok: true });
    }));
  },
};
