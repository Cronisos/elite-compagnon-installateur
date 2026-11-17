// Anonymisation des journaux du jeu pour les séances de référence (fonctions pures, testées par
// scripts/controle/tests/anonymat.test.mjs). Rien n'est lu ni écrit ici : les secrets viennent de secrets.mjs.
//
// Ce qui part, dans chaque séance :
//   - le chat, entièrement : ReceiveText, SendText (et Friends, qui ne porte qu'un nom d'ami et son statut) ;
//   - le nom du commandant → « Testeur », son FID → « F0000000 » ;
//   - l'escadron (nom, identifiant) ; les amis, coéquipiers et autres joueurs croisés (ShipTargeted, interdictions,
//     PVP, équipage multijoueur, ailier) → « Joueur 1 », « Coéquipier 1 »… ;
//   - les porteurs du joueur (le sien et ceux où il s'est posé : nom, indicatif, MarketID / CarrierID) → « PORTEUR 1 »,
//     « TST-001 », partout ; ceux croisés (signaux, destinations) → « PORTEUR AUT-001 », dans leur champ ;
//   - les noms et identifiants donnés aux vaisseaux → « Vaisseau 1 », « TS-01 » ; les noms de tenues → « Tenue 1 », dans
//     leur champ seulement (souvent un mot courant, comme « Exobiologie »).
// Chaque remplacement est le même partout (champ prévu, et toute autre chaîne où le texte réapparaît), pour que les
// modules relient les événements comme avec le vrai journal. Une vérification finale refuse la séance si un secret
// reste, sous quelque forme que ce soit (casse comprise).

export const DROPPED_EVENTS = new Set(['ReceiveText', 'SendText', 'Friends']);
export const CMDR = 'Testeur';
export const FID = 'F0000000';
export const SQUADRON = 'Escadron Test';
/**
 * Indicatif de porteur en fin de valeur JSON (« ABC-123" » ou « NOM ABC-123" ») : c'est là que le jeu le met. Les
 * mégavaisseaux (PNJ) ont un code de la même forme, mais en tête de leur nom (« ABC-123 Hercules-class … ») : ignorés.
 */
export const CALLSIGN = /\b[A-Z0-9]{3}-[A-Z0-9]{3}(?=")/g;

/** Indicatifs restés dans un texte JSON qui ne sont pas ceux de test (TST-001, AUT-001). */
export function strayCallsigns(text) {
  return [...String(text).matchAll(CALLSIGN)].map((m) => m[0]).filter((c) => !/^(TST-\d{3}|AUT-[0-9A-Z]{3})$/.test(c));
}

// Bords de mot (lettres et chiffres de toutes les langues) : « MARS » ne touche pas « Marseille »
const EDGE_BEFORE = '(?<![\\p{L}\\p{N}_])';
const EDGE_AFTER = '(?![\\p{L}\\p{N}_])';
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const isObj = (v) => v !== null && typeof v === 'object';
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

const CALLSIGN_ONLY = /^[A-Z0-9]{3}-[A-Z0-9]{3}$/;
const NAMED_CALLSIGN = /^(.*?)\s*\b([A-Z0-9]{3}-[A-Z0-9]{3})$/;

/**
 * Porteur nommé dans un signal (FSSSignalDiscovered d'un porteur) ou une destination (SupercruiseDestinationDrop) :
 * { field, name, callsign }, ou null.
 */
export function carrierSignal(ev) {
  if (!isObj(ev)) return null;
  let field = null;
  if (ev.event === 'FSSSignalDiscovered' && (ev.SignalType === 'FleetCarrier' || (ev.IsStation && NAMED_CALLSIGN.test(String(ev.SignalName || '').trim())))) field = 'SignalName';
  else if (ev.event === 'SupercruiseDestinationDrop' && NAMED_CALLSIGN.test(String(ev.Type || '').trim())) field = 'Type';
  if (!field) return null;
  const m = NAMED_CALLSIGN.exec(String(ev[field] || '').trim());
  return m ? { field, name: m[1].trim() || null, callsign: m[2] } : null;
}

/** Nom d'un joueur dans un champ du jeu : « $cmdr_decorate:#name=X; », « CMDR X », « Cmdr X ». */
export function playerName(raw) {
  const s = str(raw);
  if (!s) return null;
  const deco = /^\$cmdr_decorate:#name=(.+);$/i.exec(s);
  if (deco) return deco[1].trim() || null;
  const cmdr = /^cmdr\s+(.+)$/i.exec(s);
  if (cmdr) return cmdr[1].trim() || null;
  return null;
}

/** Ensemble des secrets, à remplir par collect() sur tous les journaux réels, puis à geler par finish(). */
export class Secrets {
  constructor() {
    this.cmdrs = new Set();
    this.fids = new Set();
    this.squadrons = new Set();
    this.squadronIds = new Set(); // numéro de l'escadron du joueur (SquadronStartup…), remplacé par 1 dans les séances
    this.squadronTags = new Set();
    this.carrierNames = new Set();
    this.callsigns = new Set();
    this.carrierIds = new Set();
    this.shipNames = new Set();
    this.shipIdents = new Set();
    this.suitNames = new Set();
    this.friends = new Set(); // amis, coéquipiers, ailiers
    this.players = new Set(); // autres joueurs croisés
    this.signals = []; // { name, callsign } des porteurs vus dans un signal ou une destination
  }

  /** Relève les secrets d'un événement (n'importe lequel). */
  collect(ev) {
    if (!isObj(ev)) return;
    const add = (set, v) => { const s = str(v); if (s) set.add(s); };
    switch (ev.event) {
      case 'Commander': add(this.cmdrs, ev.Name); add(this.fids, ev.FID); break;
      case 'LoadGame': add(this.cmdrs, ev.Commander); add(this.fids, ev.FID); break;
      case 'SquadronStartup': case 'JoinedSquadron': case 'SquadronCreated': case 'LeftSquadron': case 'KickedFromSquadron':
      case 'DisbandedSquadron': case 'AppliedToSquadron': case 'InvitedToSquadron': case 'SquadronDemotion': case 'SquadronPromotion':
      case 'SharedBookmarkToSquadron': case 'WonATrophyForSquadron':
        add(this.squadrons, ev.SquadronName);
        if (Number.isInteger(ev.SquadronID)) this.squadronIds.add(ev.SquadronID);
        break;
      case 'CarrierStats': case 'CarrierBuy': case 'CarrierNameChange':
        add(this.carrierNames, ev.Name); add(this.callsigns, ev.Callsign);
        if (Number.isInteger(ev.CarrierID)) this.carrierIds.add(ev.CarrierID);
        break;
      case 'Friends': add(this.friends, ev.Name); break;
      case 'WingAdd': case 'WingInvite': add(this.friends, ev.Name); break;
      case 'WingJoin': for (const n of ev.Others || []) add(this.friends, isObj(n) ? n.Name : n); break;
      case 'CrewMemberJoins': case 'CrewMemberQuits': case 'CrewMemberRoleChange': case 'KickCrewMember': case 'CrewLaunchFighter':
        add(this.friends, ev.Crew);
        break;
      case 'JoinACrew': case 'QuitACrew': add(this.friends, ev.Captain); break;
      case 'SetUserShipName': add(this.shipNames, ev.UserShipName); add(this.shipIdents, ev.UserShipId); break;
      case 'SuitLoadout': case 'CreateSuitLoadout': case 'SwitchSuitLoadout': case 'RenameSuitLoadout': case 'DeleteSuitLoadout':
      case 'LoadoutEquipModule': case 'LoadoutRemoveModule':
        add(this.suitNames, ev.LoadoutName);
        break;
      default:
        break;
    }
    if (ev.event === 'Loadout' || ev.event === 'LoadGame') { add(this.shipNames, ev.ShipName); add(this.shipIdents, ev.ShipIdent); }
    if (ev.event === 'StoredShips') for (const s of [...(ev.ShipsHere || []), ...(ev.ShipsRemote || [])]) add(this.shipNames, s?.Name);
    // Autres joueurs
    for (const k of ['PilotName', 'PilotName_Localised', 'KillerName', 'KillerName_Localised', 'Victim', 'Offender']) add(this.players, playerName(ev[k]));
    if (['Interdicted', 'EscapeInterdiction', 'Interdiction'].includes(ev.event) && ev.IsPlayer) add(this.players, ev.Interdictor ?? ev.Interdicted);
    if (ev.event === 'PVPKill') add(this.players, ev.Victim);
    // Victime ou auteur d'un délit : joueur ou PNJ, on ne sait pas ; traité comme un joueur
    if (ev.event === 'CommitCrime') add(this.players, ev.Victim);
    if (ev.event === 'CrimeVictim') add(this.players, ev.Offender);
    for (const k of ev.Killers || []) add(this.players, playerName(k?.Name));
    if (ev.event === 'ShipTargeted' && str(ev.SquadronID)) this.squadronTags.add(ev.SquadronID.trim());
    // Porteurs du joueur : le sien, et ceux où il s'est posé (escadron, amis) ; remplacés partout
    if (ev.StationType === 'FleetCarrier' || ev.event === 'CarrierJump') {
      const name = str(ev.StationName);
      if (name && CALLSIGN_ONLY.test(name)) this.callsigns.add(name);
      if (Number.isInteger(ev.MarketID)) this.carrierIds.add(ev.MarketID);
    }
    if (Number.isInteger(ev.CarrierID)) this.carrierIds.add(ev.CarrierID);
    // Porteurs croisés (signaux, destinations) : remplacés dans leur champ seulement (carrierSignal)
    const signal = carrierSignal(ev);
    if (signal) this.signals.push(signal);
  }

  /**
   * Gèle les remplacements : chaîne réelle → chaîne de test, nombre réel → nombre de test. Les noms très courts
   * (moins de 3 caractères) ne sont remplacés que dans leur champ, jamais ailleurs dans le texte.
   */
  finish() {
    // Nom d'un porteur du joueur, d'après les signaux qui portent son indicatif
    for (const { name, callsign } of this.signals) if (name && this.callsigns.has(callsign)) this.carrierNames.add(name);
    const strings = new Map();
    const put = (set, make) => [...set].sort().forEach((s, i) => { if (!strings.has(s)) strings.set(s, make(i + 1)); });
    put(this.cmdrs, () => CMDR);
    put(this.fids, () => FID);
    put(this.squadrons, () => SQUADRON);
    put(this.callsigns, (i) => `TST-${String(i).padStart(3, '0')}`);
    put(this.carrierNames, (i) => `PORTEUR ${i}`);
    put(this.shipNames, (i) => `Vaisseau ${i}`);
    put(this.shipIdents, (i) => `TS-${String(i).padStart(2, '0')}`);
    put(this.friends, (i) => `Coéquipier ${i}`);
    put(this.players, (i) => `Joueur ${i}`);
    const numbers = new Map([...this.carrierIds].sort((a, b) => a - b).map((n, i) => [n, 3700000001 + i]));
    // Remplacement dans le texte libre : mots entiers, du plus long au plus court, insensible à la casse
    const inText = [...strings].filter(([s]) => s.length >= 3).sort((a, b) => b[0].length - a[0].length);
    const pattern = inText.length ? new RegExp(`${EDGE_BEFORE}(?:${inText.map(([s]) => escape(s)).join('|')})${EDGE_AFTER}`, 'giu') : null;
    const lower = new Map(inText.map(([s, r]) => [s.toLowerCase(), r]));
    // Remplacés dans leur champ seulement : indicatifs et noms des autres porteurs, étiquettes d'escadron croisées
    const fieldOnly = new Map();
    const others = [...new Set(this.signals.map((s) => s.callsign))].filter((c) => !strings.has(c)).sort();
    // Toujours trois caractères après le tiret, comme un vrai indicatif (base 36 : jusqu'à 46 655 porteurs)
    others.forEach((c, i) => fieldOnly.set(c, `AUT-${(i + 1).toString(36).toUpperCase().padStart(3, '0')}`));
    [...this.squadronTags].sort().forEach((t, i) => fieldOnly.set(t, `TS${String(i + 1).padStart(2, '0')}`));
    // Noms de tenues : souvent un mot courant (« Exobiologie ») qu'on ne peut pas chercher dans tout le texte
    [...this.suitNames].sort().forEach((t, i) => fieldOnly.set(t, `Tenue ${i + 1}`));
    // Sorte de chaque secret (texte en minuscules), pour les rapports : jamais la valeur, seulement sa sorte. Une
    // valeur de plusieurs sortes (le commandant est aussi dans la liste d'amis d'un autre) garde la première.
    const kinds = new Map();
    const kind = (set, label) => { for (const v of set) if (!kinds.has(String(v).toLowerCase())) kinds.set(String(v).toLowerCase(), label); };
    kind(this.cmdrs, 'nom du commandant');
    kind(this.fids, 'FID');
    kind(this.squadrons, 'nom de l’escadron');
    kind(this.squadronIds, 'numéro de l’escadron');
    kind(this.carrierNames, 'nom de porteur');
    kind(this.callsigns, 'indicatif de porteur');
    kind(this.carrierIds, 'identifiant de porteur');
    kind(this.shipNames, 'nom de vaisseau');
    kind(this.shipIdents, 'identifiant de vaisseau');
    kind(this.friends, 'ami ou coéquipier');
    kind(this.players, 'autre joueur');
    return {
      strings,
      numbers,
      fieldOnly,
      kinds,
      /** Tout ce qui ne doit plus apparaître dans une séance, en mots entiers (texte en minuscules). */
      forbidden: [...strings.keys()].filter((s) => s.length >= 3).map((s) => s.toLowerCase()).concat([...numbers.keys()].map(String)),
      /**
       * Numéros de l'escadron du joueur : remplacés par 1 dans leurs événements seulement (ailleurs, le même nombre peut
       * être un prix) ; interdits dans le reste du dépôt (anonymat/depot.mjs).
       */
      squadronIds: [...this.squadronIds].map(String),
      /** Noms des commandants (minuscules), à part du FID. */
      commanders: [...this.cmdrs].map((s) => s.toLowerCase()),
      /** Nom du commandant et FID : interdits partout, même au milieu d'un mot. */
      strict: [...this.cmdrs, ...this.fids].map((s) => s.toLowerCase()),
      replaceText: (s) => {
        if (strings.has(s)) return strings.get(s);
        return pattern ? s.replace(pattern, (m) => lower.get(m.toLowerCase()) ?? m) : s;
      },
    };
  }
}

/** Remplacements gelés appliqués à une valeur quelconque (copie profonde). */
function deep(value, frozen) {
  if (typeof value === 'string') return frozen.replaceText(value);
  if (typeof value === 'number') return frozen.numbers.has(value) ? frozen.numbers.get(value) : value;
  if (Array.isArray(value)) return value.map((v) => deep(v, frozen));
  if (isObj(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, deep(v, frozen)]));
  return value;
}

/** Un événement anonymisé, ou null s'il doit disparaître (chat). */
export function anonymizeEvent(ev, frozen) {
  if (!isObj(ev) || DROPPED_EVENTS.has(ev.event)) return null;
  const out = deep(ev, frozen);
  // Champs propres à un joueur, même quand le texte est trop court pour être cherché ailleurs
  if (out.event === 'Commander') { out.Name = CMDR; if ('FID' in out) out.FID = FID; }
  if (out.event === 'LoadGame') { out.Commander = CMDR; if ('FID' in out) out.FID = FID; }
  for (const k of ['ShipName', 'ShipIdent', 'UserShipName', 'UserShipId', 'SquadronName']) {
    if (typeof ev[k] === 'string' && frozen.strings.has(ev[k].trim())) out[k] = frozen.strings.get(ev[k].trim());
  }
  if (typeof ev.LoadoutName === 'string' && ev.LoadoutName.trim()) out.LoadoutName = frozen.fieldOnly.get(ev.LoadoutName.trim()) ?? 'Tenue';
  if (out.event === 'ShipTargeted' && typeof ev.SquadronID === 'string') out.SquadronID = frozen.fieldOnly.get(ev.SquadronID.trim()) ?? 'TS00';
  // Numéro de l'escadron du joueur (SquadronStartup…) : 1. Seulement dans ces événements : ailleurs, un nombre égal
  // peut être un prix ou une quantité.
  if (typeof ev.SquadronName === 'string' && Number.isInteger(ev.SquadronID)) out.SquadronID = 1;
  // Porteur croisé : « NOM INDICATIF » → « PORTEUR AUT-001 » (le sien : déjà remplacé partout plus haut)
  const signal = carrierSignal(ev);
  if (signal) {
    const callsign = frozen.strings.get(signal.callsign) ?? frozen.fieldOnly.get(signal.callsign) ?? 'AUT-000';
    const named = `${frozen.strings.get(signal.name) ?? 'PORTEUR'} ${callsign}`;
    out[signal.field] = named;
    if (`${signal.field}_Localised` in out) out[`${signal.field}_Localised`] = named;
  }
  return out;
}

/** Texte d'un journal (une ligne JSON par événement) anonymisé ; les lignes illisibles sont retirées. */
export function anonymizeJournal(text, frozen) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    const a = anonymizeEvent(ev, frozen);
    if (a) out.push(JSON.stringify(a));
  }
  return out.length ? `${out.join('\r\n')}\r\n` : '';
}

/**
 * Secrets encore présents dans un texte (`forbidden` : chaînes en minuscules). words : mots entiers seulement (les
 * noms de porteur ou de vaisseau peuvent être des mots courants) ; sinon toute occurrence, même au milieu d'un mot.
 * Les appelants ne recopient jamais les valeurs trouvées dans un rapport : seulement leur nombre et le fichier.
 */
export function leaks(text, forbidden, { words = false } = {}) {
  const low = String(text).toLowerCase();
  if (!words) return forbidden.filter((s) => low.includes(s));
  return forbidden.filter((s) => low.includes(s) && new RegExp(`${EDGE_BEFORE}${escape(s)}${EDGE_AFTER}`, 'iu').test(low));
}
