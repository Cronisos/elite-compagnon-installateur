// Mérites prévus avant la vente, et « 0 mérite » expliqué : branchement du suivi des ventes sur le journal, l'API du
// module et la fenêtre en jeu (/hud/expansion-sale), ouverte d'elle-même à quai quand la soute a quelque chose à vendre
// (pas pour une marchandise tout juste achetée à cette escale, ni pour un objet que la station n'achète pas). Elle ne
// s'ouvre qu'une fois le jeu vu en marche (une ligne de journal ou un fichier d'état écrit depuis le lancement de
// l'app) : après un plantage du jeu, le dernier « à quai » du journal n'ouvre rien par-dessus le bureau.
//
// API (sous /api/modules/expansion) :
//   GET /sale            prévision pour la soute, ici et maintenant
//   GET /sales?zero=1    ventes mesurées (ou seulement celles à 0), ratios mesurés, règles appliquées, réglages
//   GET /sales/text      les mêmes ventes en texte, à coller dans Discord
//   PUT /sale/settings   { autoWindow } : fenêtre en jeu à quai, oui ou non

import { dataPath } from '../../core/paths.js';
import { normType } from './cargoLots.js';
import { casesText, originText, saleForecast } from './saleForecast.js';
import { SALE_RULES, MERITS_WINDOW_MS } from './saleRules.js';
import { loadSaleState, saveSaleState, seedFrom } from './saleStore.js';
import { SaleWatch, SALE_EVENTS } from './saleWatch.js';

const DATA_FILE = dataPath('expansion-sales.json');
export const SALE_PAGE = 'expansion-sale';
const PUBLISH_MS = 250;
const SAVE_MS = 5000;
const MAX_LISTED = 500;

// Minuteries détachées : elles ne retiennent pas le serveur (ni les tests) à l'arrêt
const later = (fn, ms) => setTimeout(fn, ms).unref();

function bad(message) {
  const err = new Error(message);
  err.status = 400;
  err.publicMessage = message;
  return err;
}

/**
 * Soute du vaisseau d'après Cargo.json, hors cargaison de mission, une ligne par marchandise. Sans Cargo.json, la soute
 * de l'état du jeu, dont les lignes de mission portent missionId (core/gameState.js) : écartées de même.
 */
export function inventoryOf(cargoFile, fallback = []) {
  const items = cargoFile && (!cargoFile.Vessel || cargoFile.Vessel === 'Ship') && Array.isArray(cargoFile.Inventory)
    ? cargoFile.Inventory.filter((i) => i.MissionID == null).map((i) => ({ type: normType(i.Name), label: i.Name_Localised || null, count: Number(i.Count) || 0 }))
    : fallback.filter((c) => c?.missionId == null).map((c) => ({ type: normType(c.name), label: c.label || null, count: Number(c.count) || 0 }));
  const by = new Map();
  for (const i of items) {
    const cur = by.get(i.type);
    if (cur) cur.count += i.count;
    else by.set(i.type, { ...i });
  }
  return [...by.values()];
}

/**
 * Règle du dépôt (server/src/regles/powerplay.js) qu'une cause de 0 met en jeu : une vente qui la contredit (des mérites
 * alors que toutes les tonnes étaient prévues à 0) est un écart pour la vigie des règles ; un 0 qu'elle annonçait, une
 * mesure conforme.
 */
export const CAUSE_REGLE = new Map([
  ['empty', 'powerplay.vente.ennemi-ou-vide'],
  ['enemy', 'powerplay.vente.ennemi-ou-vide'],
  ['acq-mined-unsupported', 'powerplay.vente.acquisition-source'],
  ['acq-bought-unsupported', 'powerplay.vente.acquisition-source'],
  ['acq-out-of-range', 'powerplay.prise.portee-consolide'],
  ['acq-low-margin', 'powerplay.vente.acquisition-marge'],
  ['reinf-mined-elsewhere', 'powerplay.vente.renforcement-meme-systeme'],
  ['rare-same-system', 'powerplay.vente.rares-autre-systeme'],
  ['tiny', 'powerplay.vente.petite-vente'],
]);

/** Ce qu'une vente close apprend à la vigie : null, ou { regle, attendu, observe, ecart }. */
export function venteVigie(sale) {
  if (sale.cause === 'rule-contradicted') {
    const lot = (sale.lots || []).filter((l) => l.ok === false && l.cause).sort((a, b) => (b.count || 0) - (a.count || 0))[0];
    const regle = lot && CAUSE_REGLE.get(lot.cause);
    return regle ? { regle, attendu: 0, observe: sale.merits, ecart: true, details: { cause: lot.cause, tonnes: sale.count ?? null } } : null;
  }
  if (sale.merits === 0 && CAUSE_REGLE.has(sale.cause)) {
    return { regle: CAUSE_REGLE.get(sale.cause), attendu: 0, observe: 0, ecart: false, details: { cause: sale.cause, tonnes: sale.count ?? null } };
  }
  return null;
}

export function registerSale({ router, journal, game, broadcast, overlay, vigie = null, file = DATA_FILE }) {
  /** Ventes closes en direct : chacune signalée à la vigie des règles si elle met une règle à l'épreuve. */
  const signaler = (closed) => {
    if (!vigie) return;
    for (const sale of closed) {
      const o = venteVigie(sale);
      if (o) vigie.observe(o);
    }
  };
  const interesting = new Set(SALE_EVENTS);
  journal.addInterest(SALE_EVENTS);
  let settings = loadSaleState(file).settings;
  let watch = new SaleWatch();
  let publishTimer = null;
  let saveTimer = null;
  let flushTimer = null;
  let live = false; // le jeu a écrit quelque chose depuis le lancement de l'app

  const forecast = () => saleForecast(watch, inventoryOf(journal.stateData.cargo, game?.snapshot().cargo), Date.now());

  function publish() {
    clearTimeout(publishTimer);
    publishTimer = null;
    const f = forecast();
    broadcast('expansion:sale', f);
    const open = live && settings.autoWindow && f.docked && Boolean(f.power) && (f.lines.some((l) => l.relevant) || Boolean(f.lastSale) || f.waiting > 0);
    overlay?.setExtra?.(SALE_PAGE, open);
  }
  /** Le jeu vient d'écrire : il tourne, la fenêtre peut s'ouvrir. */
  function wake() {
    if (live) return;
    live = true;
    schedulePublish();
  }
  const schedulePublish = () => {
    if (!publishTimer) publishTimer = later(publish, PUBLISH_MS);
  };

  function save() {
    clearTimeout(saveTimer);
    saveTimer = null;
    try {
      saveSaleState(file, { ...watch.snapshot(), settings });
    } catch (err) {
      console.error(`Ventes Powerplay : état non enregistré (${err.message})`);
    }
  }
  const scheduleSave = () => {
    if (!saveTimer) saveTimer = later(save, SAVE_MS);
  };

  // Une vente sans autre événement derrière : sa minute d'attente se termine quand même
  function scheduleFlush() {
    clearTimeout(flushTimer);
    flushTimer = later(() => {
      const closed = watch.flush(Date.now());
      signaler(closed);
      if (closed.length) {
        scheduleSave();
        schedulePublish();
      }
    }, MERITS_WINDOW_MS + 1000);
  }

  journal.on('ready', ({ history }) => {
    const events = history.filter((ev) => interesting.has(ev.event));
    watch = new SaleWatch(seedFrom(loadSaleState(file), events[0]?.timestamp ?? null));
    const market = journal.stateData.market;
    // Rares connus avant de relire les achats ; la demande du marché actuel ne vaut pas pour les ventes passées
    if (market) watch.cargo.learnMarket(market);
    for (const ev of events) watch.apply(ev);
    watch.flush(Date.now());
    if (market) watch.setMarket(market);
    watch.setCargoFile(journal.stateData.cargo); // le détail de la soute actuelle, s'il suit la dernière ligne Cargo
    save();
    publish();
  });

  journal.on('event', (ev) => {
    wake();
    if (!interesting.has(ev.event)) return;
    const wasDocked = watch.cargo.docked;
    const closed = watch.apply(ev);
    signaler(closed);
    if (ev.event === 'MarketSell') scheduleFlush();
    scheduleSave();
    if (closed.length || watch.cargo.docked || wasDocked) schedulePublish();
  });
  journal.on('market', (market, { initial } = {}) => {
    if (!initial) wake();
    watch.setMarket(market);
    if (watch.cargo.docked) schedulePublish();
  });
  journal.on('cargo', (cargo, { initial } = {}) => {
    if (!initial) wake();
    if (watch.setCargoFile(cargo)) scheduleSave();
    if (watch.cargo.docked) schedulePublish();
  });

  router.get('/sale', (req, res) => res.json(forecast()));

  router.get('/sales', (req, res) => {
    const zero = req.query.zero === '1';
    const list = watch.cases.filter((c) => !zero || c.merits === 0);
    res.json({
      cases: list.slice(-MAX_LISTED).reverse().map((c) => ({ ...c, origin: originText(c) })),
      total: list.length,
      ratios: watch.ratioTable(),
      rules: SALE_RULES,
      settings,
    });
  });

  router.get('/sales/text', (req, res) => res.json({ text: casesText(watch.cases.slice(-MAX_LISTED), { zeroOnly: req.query.zero === '1' }) }));

  router.put('/sale/settings', (req, res) => {
    const autoWindow = req.body?.autoWindow;
    if (typeof autoWindow !== 'boolean') throw bad('Réglage invalide.');
    settings = { ...settings, autoWindow };
    save();
    publish();
    res.json(settings);
  });
}
