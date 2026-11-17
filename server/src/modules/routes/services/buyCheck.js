// Vérification d'un achat, au moment où il est fait : la marchandise est-elle
// rentable à la prochaine station de la route ? Sinon, alerte immédiate pour
// pouvoir la revendre sur place avant de partir.

export const BULK_RATIO = 0.25; // au-delà de 25 % de la soute, ce n'est plus un appoint
export const WEAK_RATIO = 0.5; // marge < 50 % de celle de la marchandise principale

const fmt = (n) => Math.round(n).toLocaleString('fr-FR');

/**
 * @param {object} p
 * @param {{commodity, name, count, price}} p.buy achat qui vient d'être fait
 * @param {{station, system}} p.dest prochaine station de la route
 * @param {{sellPrice, demand}|null} p.destItem dernier relevé Market.json à destination
 * @param {{price}|null} p.historySell dernière vente enregistrée à destination (repli)
 * @param {number|null} p.hereSell prix de revente immédiate à la station d'achat
 * @param {{commodity, name, margin}|null} p.main marchandise principale de cette étape
 * @param {number|null} p.cargoCapacity soute du vaisseau
 * @returns {{ level: 'danger'|'warning'|'ok', title, text, advice? }}
 */
export function evaluateBuy({ buy, dest, destItem, historySell, hereSell, main, cargoCapacity }) {
  const name = buy.name;
  const where = dest.station;
  const resaleLoss = hereSell != null ? Math.max(0, (buy.price - hereSell) * buy.count) : null;
  const advice = hereSell != null
    ? `Revente immédiate ici : ${fmt(hereSell)} cr/t, soit ${resaleLoss ? `une perte de ${fmt(resaleLoss)} cr` : 'sans perte'}.`
    : 'Revends-la ici avant de décoller.';
  const bulk = cargoCapacity ? buy.count >= BULK_RATIO * cargoCapacity : buy.count >= 100;

  // 1. Prix de vente à destination : relevé de marché, sinon historique de la route
  let sell = null;
  if (destItem) {
    if (!(destItem.demand > 1) || !(destItem.sellPrice > 0)) {
      return {
        level: 'danger',
        title: `Mauvais achat : ${name}`,
        text: `${where} n'achète pas de ${name.toLocaleLowerCase('fr-FR')} (aucune demande). ${fmt(buy.count)} t achetées à ${fmt(buy.price)} cr/t.`,
        advice,
      };
    }
    sell = destItem.sellPrice;
  } else if (historySell) {
    sell = historySell.price;
  }

  if (sell == null) {
    return {
      level: 'warning',
      title: `Vente non vérifiée : ${name}`,
      text: `Aucun prix connu pour ${name.toLocaleLowerCase('fr-FR')} à ${where}. Ouvre le marché de ${where} en jeu (ou vérifie sur Inara) avant de partir.`,
    };
  }

  const margin = sell - buy.price;
  if (margin <= 0) {
    return {
      level: 'danger',
      title: `Achat à perte : ${name}`,
      text: `Acheté ${fmt(buy.price)} cr/t, revendu ${fmt(sell)} cr/t à ${where} : perte de ${fmt(-margin)} cr/t, soit ${fmt(-margin * buy.count)} cr sur ${fmt(buy.count)} t.`,
      advice,
    };
  }

  // 2. Rentable, mais bien moins que la marchandise principale de l'étape ?
  if (main && main.commodity !== buy.commodity && main.margin > 0 && margin < WEAK_RATIO * main.margin) {
    const lost = (main.margin - margin) * buy.count;
    return {
      level: bulk ? 'danger' : 'warning',
      title: bulk ? `Mauvaise marchandise : ${name} au lieu de ${main.name.toLocaleLowerCase('fr-FR')}` : `Appoint peu rentable : ${name}`,
      text: `+${fmt(margin)} cr/t à ${where}, contre +${fmt(main.margin)} cr/t pour ${main.name.toLocaleLowerCase('fr-FR')} : manque à gagner ≈ ${fmt(lost)} cr sur ${fmt(buy.count)} t.`,
      advice: bulk ? advice : undefined,
    };
  }

  return {
    level: 'ok',
    title: `${name} : rentable`,
    text: `+${fmt(margin)} cr/t à ${where} (≈ ${fmt(margin * buy.count)} cr sur ${fmt(buy.count)} t).`,
  };
}

/**
 * Prochaine station de la route après la station d'achat.
 * @returns {{ station, system, legIndex } | null} null si la station est hors route
 */
export function nextStop(structure, system) {
  const order = [
    { station: structure.startStation, system: structure.startSystem },
    ...structure.stops.map((s) => ({ station: s.station, system: s.system })),
  ];
  const i = order.findIndex((s) => s.system === system);
  if (i < 0) return null;
  return { ...order[(i + 1) % order.length], legIndex: i };
}
