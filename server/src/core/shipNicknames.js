// Noms donnés par le joueur à ses vaisseaux, dans l'app (table ShipNickname) : par (commandant, ShipID). Deux Cutter
// restent distincts, et le vaisseau n° 1 d'un second compte sur le même PC n'hérite pas du nom du n° 1 du compte
// principal (core/commander.js).
//
// Lignes d'avant les commandants (commanderId null, migration 0002) : rattachées au commandant le plus vu dans les
// journaux dès que l'historique est relu (adopt). Tant qu'aucun commandant n'est connu, ou qu'un seul l'est, elles
// valent pour lui ; avec deux commandants, une ligne pas encore rattachée ne vaut pour personne (belongsTo).
//
// Une copie en mémoire sert à l'avis de bascule (core/roleSwitch.js, nom affiché du vaisseau) sans lire la base.

import { belongsTo, isCommanderId } from './commander.js';

const MAX_NICKNAME = 60;

export class ShipNicknames {
  /**
   * @param {{ prisma: object, single?: () => boolean, warn?: (msg: string) => void }} o single : un seul commandant
   *   (ou aucun) dans les journaux (core/journalService.js singleCommander)
   */
  constructor({ prisma, single = () => true, warn = console.warn }) {
    this.prisma = prisma;
    this.single = single;
    this.warn = warn;
    this.rows = []; // { commanderId, shipId, nickname }
  }

  /** Relit la table (au démarrage, après un changement). */
  async load() {
    const rows = await this.prisma.shipNickname.findMany();
    this.rows = rows.map((r) => ({ commanderId: r.commanderId ?? null, shipId: r.shipId, nickname: r.nickname }));
    return this;
  }

  /** Ligne propre au commandant (jamais une ligne sans commandant, sauf pour un commandant inconnu). */
  own(commander, shipId) {
    return this.rows.find((r) => r.shipId === shipId && r.commanderId === (commander ?? null)) || null;
  }

  /** Nom du vaisseau `shipId` du commandant `commander` (null : inconnu), ou null. */
  get(shipId, commander = null) {
    const own = this.own(commander, shipId);
    if (own) return own.nickname;
    const single = this.single();
    return this.rows.find((r) => r.shipId === shipId && r.commanderId === null && belongsTo(null, commander, single))?.nickname ?? null;
  }

  /** Noms des vaisseaux d'un commandant, pour l'API : { "3": "Pioche" }. */
  view(commander = null) {
    const single = this.single();
    const out = {};
    // Les siens passent avant une ligne d'avant les commandants au même numéro
    for (const r of this.rows) if (r.commanderId === null && belongsTo(null, commander, single)) out[r.shipId] = r.nickname;
    for (const r of this.rows) if (commander !== null && r.commanderId === commander) out[r.shipId] = r.nickname;
    return out;
  }

  /**
   * Donne (ou efface, nom vide) le nom du vaisseau `shipId` du commandant `commander`. Commandant seul connu et ligne
   * d'avant les commandants à ce numéro : c'est la sienne, elle lui est rattachée (et effacée avec un nom vide).
   * @returns {Promise<string>} le nom enregistré ('' : effacé)
   */
  async set(commander, shipId, raw) {
    if (commander !== null && !isCommanderId(commander)) throw new Error('Commandant invalide.');
    const nickname = String(raw ?? '').trim().slice(0, MAX_NICKNAME);
    const db = this.prisma.shipNickname;
    const legacy = commander !== null && belongsTo(null, commander, this.single()) ? await db.findFirst({ where: { commanderId: null, shipId } }) : null;
    const own = await db.findFirst({ where: { commanderId: commander, shipId } });
    if (nickname) {
      if (own) await db.update({ where: { id: own.id }, data: { nickname } });
      else if (legacy) await db.update({ where: { id: legacy.id }, data: { commanderId: commander, nickname } });
      else await db.create({ data: { commanderId: commander, shipId, nickname } });
      if (own && legacy) await db.deleteMany({ where: { id: legacy.id } });
    } else {
      await db.deleteMany({ where: { commanderId: commander, shipId } });
      if (legacy) await db.deleteMany({ where: { id: legacy.id } });
    }
    await this.load();
    return nickname;
  }

  /**
   * Rattache les noms d'avant les commandants (commanderId null) au commandant `commander` : le plus vu dans les
   * journaux. Un nom que ce commandant a déjà donné à ce numéro passe avant (la ligne sans commandant est effacée).
   * @returns {Promise<number>} lignes rattachées
   */
  async adopt(commander) {
    if (!isCommanderId(commander) || !this.rows.some((r) => r.commanderId === null)) return 0;
    const db = this.prisma.shipNickname;
    const taken = this.rows.filter((r) => r.commanderId === commander).map((r) => r.shipId);
    if (taken.length) await db.deleteMany({ where: { commanderId: null, shipId: { in: taken } } });
    const { count } = await db.updateMany({ where: { commanderId: null }, data: { commanderId: commander } });
    await this.load();
    return count;
  }
}
