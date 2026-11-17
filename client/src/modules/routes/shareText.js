// Partage Discord d'une route commerciale : message Markdown (sans tableau) décrivant la route, comme une recherche de
// route Inara. Aucune donnée personnelle par défaut. Sans React : testé seul (shareText.test.js).
//
// Les noms (route, stations, systèmes, marchandises, commandant) passent par discordName (core/discord.js) : une
// station de colonie ou un porteur nommé par un joueur ne mentionne personne et ne met rien en forme.

import { dateTime, dec1, int, compact } from '../../core/format.js';
import { discordName } from '../../core/discord.js';

const lower = (s) => String(s || '').toLocaleLowerCase('fr-FR');
const n = (s) => discordName(s);

/** Prix actuels de chaque marchandise principale, avec repli sur la structure détectée. */
export function currentPrices(view) {
  const map = new Map();
  for (const t of view.stats.trends) map.set(t.commodity, { buy: t.lastBuy, sell: t.lastSell, name: t.name });
  return map;
}

function goodsLine(verb, list, prices, side) {
  if (!list?.length) return null;
  const parts = list.map((g) => {
    const p = prices.get(g.commodity)?.[side] ?? g.price;
    return `**${n(g.name)}** à ${int(p)} cr/t`;
  });
  return `> ${verb} : ${parts.join(', ')}`;
}

function legLine(label, leg) {
  const jumps = leg.jumps.map((j) => `${n(j.system)} (${dec1(j.dist)} al)`).join(' → ');
  return `**${label}** : ${leg.jumps.length} saut${leg.jumps.length > 1 ? 's' : ''}, ${dec1(leg.distance)} al${jumps ? ` — ${jumps}` : ''}`;
}

function padLabel(pad) {
  return pad ? `plateforme ${n(pad)}` : 'plateforme ?';
}

export function buildDiscordMessage(view, { cargo, commander }) {
  const s = view.structure;
  const prices = currentPrices(view);
  const lastLoop = view.loops[0];
  const pricedAt = lastLoop?.endAt || view.route.createdAt;
  const pads = new Map(s.stations.map((st) => [st.station, st.pad]));

  const lines = [];
  lines.push(`## Route commerciale : ${n(view.route.name)}`);
  lines.push(`*Prix relevés le ${dateTime(pricedAt)} (heure de Paris) — les prix et les stocks évoluent : vérifie avant de partir.*`);
  lines.push('');
  lines.push(`**1. ${n(s.startStation)}** — ${n(s.startSystem)} · ${padLabel(pads.get(s.startStation))}`);
  lines.push(goodsLine('Achat', s.start.buys.slice(0, 1), prices, 'buy'));
  s.stops.forEach((stop, k) => {
    lines.push(legLine(k === 0 ? 'Aller' : `Étape ${k + 1}`, s.legs[k]));
    lines.push(`**${k + 2}. ${n(stop.station)}** — ${n(stop.system)} · ${padLabel(stop.pad)}`);
    const main = s.legCommodities[k];
    lines.push(goodsLine('Vente', stop.sells.filter((g) => g.commodity === main?.commodity), prices, 'sell'));
    lines.push(goodsLine('Achat', stop.buys.slice(0, 1), prices, 'buy'));
  });
  lines.push(legLine('Retour', s.legs[s.legs.length - 1]));
  lines.push(`**↺ ${n(s.startStation)}**`);
  const lastMain = s.legCommodities[s.legCommodities.length - 1];
  lines.push(goodsLine('Vente', s.arrival.sells.filter((g) => g.commodity === lastMain?.commodity), prices, 'sell'));
  lines.push('');

  // Bénéfices
  const legsMargin = view.stats.trends
    .filter((t) => t.lastSell != null && t.lastBuy != null)
    .map((t) => ({ name: t.name, margin: t.lastSell - t.lastBuy }));
  const perTon = legsMargin.reduce((a, l) => a + l.margin, 0);
  const perLoop = perTon * cargo;
  const minutes = view.stats.avgMinutes;
  lines.push('**Bénéfice**');
  lines.push(`• Par tonne : ${int(perTon)} cr (${legsMargin.map((l) => `${n(lower(l.name))} ${int(l.margin)}`).join(' + ')})`);
  lines.push(`• Par boucle (soute de ${int(cargo)} t) : ${compact(perLoop)} cr`);
  if (minutes) lines.push(`• Par heure (≈ ${dec1(minutes)} min par boucle) : ${compact((perLoop * 60) / minutes)} cr/h`);
  lines.push(`• ${s.jumpsPerLoop} sauts par boucle, plus long saut ${dec1(s.longestJump)} al`);

  // Marchandises d'appoint
  const topups = view.market.filter((m) => m.topups.length);
  if (topups.length) {
    lines.push('');
    lines.push("**Marchandises d'appoint conseillées**");
    for (const m of topups) {
      const list = m.topups.slice(0, 3).map((t) => `${n(t.name)} (+${int(t.margin)} cr/t, stock ${int(t.stock)} t)`).join(', ');
      lines.push(`• ${n(m.from.station)} → ${n(m.to.station)} : ${list}`);
    }
  }
  if (commander && view.commander) {
    lines.push('');
    lines.push(`*Partagé par CMDR ${n(view.commander)}*`);
  }
  return lines.filter((l) => l !== null).join('\n');
}
