// « À acheter ici » (fenêtre en jeu colonisation-station) : à quai, le marché de la station, que le jeu écrit dans
// Market.json quand tu ouvres le marché des marchandises, comparé à ce qu'il reste à acheter pour le chantier actif
// (reste − soute). Calculs purs, sans état ni réseau : aucune recherche en ligne, seulement ce que le jeu a écrit.

import { symbolOf } from './events.js';

const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const count = (n) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

/**
 * Marché lu dans Market.json, réduit à ce qui s'achète (stock et prix d'achat) : { marketId, station, system, at,
 * items: Map symbole → { name, stock, price } }, ou null s'il est illisible.
 */
export function readMarket(m) {
  if (!m || typeof m !== 'object' || !Number.isSafeInteger(m.MarketID) || m.MarketID <= 0) return null;
  const items = new Map();
  for (const i of Array.isArray(m.Items) ? m.Items : []) {
    const symbol = symbolOf(i?.Name);
    const stock = count(i?.Stock);
    const price = count(i?.BuyPrice);
    if (!symbol || !stock || !price || items.has(symbol)) continue;
    items.set(symbol, { name: text(i.Name_Localised) ?? symbol, stock, price });
  }
  return { marketId: m.MarketID, station: text(m.StationName), system: text(m.StarSystem), at: text(m.timestamp), items };
}

/**
 * Ce qu'il faut acheter ici pour le chantier : chaque marchandise encore à acheter que la station vend, dans l'ordre de
 * la liste de courses (le plus gros reste d'abord). « À prendre » : le moins entre ce qu'il faut, le stock de la station
 * et la place libre en soute (partagée dans cet ordre ; soute inconnue : sans limite). Rend { items, total, free }.
 */
export function buyHere(planItems = [], market, { capacity = null, cargoCount = 0 } = {}) {
  const cap = Number.isFinite(capacity) && capacity > 0 ? capacity : null;
  const free = cap == null ? null : Math.max(0, cap - count(cargoCount));
  let left = free;
  const items = [];
  for (const i of planItems) {
    const toBuy = count(i?.toBuy);
    const m = toBuy ? market?.items.get(i.symbol) : null;
    if (!m) continue;
    const want = Math.min(toBuy, m.stock);
    const take = left == null ? want : Math.min(want, left);
    if (left != null) left -= take;
    items.push({ symbol: i.symbol, name: i.name || m.name, toBuy, stock: m.stock, price: m.price, take, cost: take * m.price, enough: m.stock >= toBuy });
  }
  return {
    items,
    total: { tonnes: items.reduce((a, i) => a + i.take, 0), cost: items.reduce((a, i) => a + i.cost, 0) },
    free,
  };
}
