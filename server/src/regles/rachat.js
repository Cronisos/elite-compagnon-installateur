// Règles du rachat (assurance), de la mort et de la résurrection. Voir LISEZMOI.md pour changer une règle.

import { domaine } from './fiche.js';

const JOURNAUX = 'journaux de référence, 23 oct.–7 nov. 2026';

const D = domaine('rachat', 'Rachat et résurrection', [
  {
    id: 'rachat.taux', nom: 'REBUY_RATE', titre: 'Rachat : part de la valeur du vaisseau (coque et modules, sans la soute), au plus',
    valeur: 0.05, unite: 'part de la valeur', statut: 'mesurée', date: '2026-11-07',
    source: `publiée : « 5% of the value of your ship (including all upgrades, but not the cargo) », https://forums.frontier.co.uk/threads/ship-insurance.390091 ; mesurée comme plafond sur 232 Loadout (${JOURNAUX}) : Rebuy ÷ (HullValue + ModulesValue) au plus 0,050000, parfois bien moins (0,027 sur une Anaconda à 742 M de modules). Ne sert que si Loadout.Rebuy manque`, controle: 'auto',
  },
  {
    id: 'rachat.cout-paye', nom: 'REBUY_COST_IS_LOADOUT_REBUY', titre: 'Coût payé à la résurrection = dernier Loadout.Rebuy avant la destruction',
    valeur: true, unite: 'oui/non', statut: 'mesurée', date: '2026-10-29',
    source: `${JOURNAUX} : 3 rachats sur 3 (26 oct. 2026 ×2 : 16 459 989 cr ; 29 oct. : 20 559 981 cr)`, controle: 'auto',
  },
  {
    id: 'rachat.options', nom: 'RESURRECT_OPTIONS', titre: 'Options de l’écran de rachat (Resurrect.Option) et sûreté de leur sens',
    valeur: [['rebuy', 'mesurée'], ['rejoin', 'mesurée'], ['free', 'à vérifier'], ['recover', 'à vérifier'], ['handin', 'à vérifier'], ['escape', 'à vérifier']],
    unite: 'option → statut', statut: 'mesurée', date: '2026-10-29',
    source: `liste d’EDDiscovery (JournalDiedResurrect.cs), lue le 7 nov. 2026 ; rebuy mesurée (26 et 29 oct.), rejoin mesurée (29 oct., mort à pied : coût 0, retour au vaisseau)`, controle: 'à remesurer',
  },
  {
    id: 'rachat.faillite', nom: 'BANKRUPT_LOSES_SHIP', titre: 'Faillite : le vaisseau et ses modules sont perdus, Sidewinder gratuit',
    valeur: true, unite: 'oui/non', statut: 'à vérifier', date: '2019-11',
    source: 'témoignages de joueurs, Steam (https://steamcommunity.com/app/359320/discussions/0/1639801448917278263, nov. 2019)', controle: 'manuel',
  },
  {
    id: 'rachat.modes-de-jeu', nom: 'GAME_MODE_NAMES', titre: 'Modes de jeu de LoadGame.GameMode',
    valeur: ['Open', 'Solo', 'Group'], unite: 'LoadGame.GameMode', statut: 'mesurée', date: '2026-11-07',
    source: `${JOURNAUX} (Open, Solo, Group avec le nom du groupe privé)`, controle: 'à remesurer',
  },
  {
    id: 'rachat.pas-ton-vaisseau', nom: 'NO_REBUY_UNDOCK_FLAGS', titre: 'Drapeaux d’Undocked qui disent que le vaisseau n’est pas le tien (taxi, équipage)',
    valeur: ['Taxi', 'Multicrew'], unite: 'champs d’Undocked', statut: 'à vérifier', date: '2026-11-07',
    source: `doc du journal ; aucun Undocked avec Taxi ou Multicrew dans les ${JOURNAUX}`, controle: 'à remesurer',
  },
  {
    id: 'rachat.vaisseau-garde', nom: 'SHIP_KEPT_OPTIONS', titre: 'Résurrections après une mort hors du vaisseau : vaisseau et soute gardés',
    valeur: ['rejoin'], unite: 'Resurrect.Option', statut: 'mesurée', date: '2026-10-29',
    source: '29 oct. 2026, option rejoin : 30 t de drones avant la mort, 30 t au Cargo qui suit ; données d’exploration gardées : à vérifier', controle: 'à remesurer',
  },
  {
    id: 'rachat.prix-soute', nom: 'PRICE_EVENTS', titre: 'Événements qui donnent le prix d’une marchandise (soute chiffrée)',
    valeur: [['MarketSell', 'SellPrice', 'vente'], ['MarketBuy', 'BuyPrice', 'achat'], ['SellDrones', 'SellPrice', 'vente'], ['BuyDrones', 'BuyPrice', 'achat']],
    unite: 'événement, champ, sens', statut: 'mesurée', date: '2026-11-05',
    source: `${JOURNAUX} : BuyDrones à 101 cr (3 et 5 nov.), SellDrones à 100 cr (26 et 29 oct.) ; jamais de MarketBuy ni MarketSell de drones`, controle: 'à remesurer',
  },
]);

export const RACHAT = D;
export const FICHES = D.fiches;
export const REBUY_RATE = D.v('REBUY_RATE');
export const REBUY_COST_IS_LOADOUT_REBUY = D.v('REBUY_COST_IS_LOADOUT_REBUY');
export const RESURRECT_OPTIONS = new Map(D.v('RESURRECT_OPTIONS'));
export const BANKRUPT_LOSES_SHIP = D.v('BANKRUPT_LOSES_SHIP');
export const GAME_MODE_NAMES = D.v('GAME_MODE_NAMES');
export const NO_REBUY_UNDOCK_FLAGS = D.v('NO_REBUY_UNDOCK_FLAGS');
export const SHIP_KEPT_OPTIONS = new Set(D.v('SHIP_KEPT_OPTIONS'));
export const PRICE_EVENTS = new Map(D.v('PRICE_EVENTS').map(([ev, field, source]) => [ev, { field, source }]));
