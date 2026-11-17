// Commandant courant : plusieurs comptes peuvent jouer sur le même PC, avec le même dossier de journaux. Le ShipID du jeu
// n'est unique que pour un commandant (compte principal : vaisseau n° 1 = Anaconda ; second compte : n° 1 = Cobra) : tout
// ce qui est rangé par vaisseau l'est donc par (commandant, ShipID).
//
// Identifiant d'un commandant : son FID (identifiant Frontier, champ FID de LoadGame et de Commander), sinon son nom
// préfixé « nom: » (journal d'un autre outil, ancien format sans FID). Un événement est rattaché au commandant chargé
// à ce moment-là : le lecteur des journaux (core/journalService.js) le note sur chaque événement (clé COMMANDER, un
// symbole : invisible pour JSON.stringify et Object.keys, rien n'est écrit ailleurs par mégarde). Un module qui reçoit
// des événements sans cette note (tests, autre source) suit les LoadGame et Commander lui-même (CommanderTracker).
//
// L'identifiant reste sur le PC : jamais dans l'état diffusé à l'interface ni dans ce qui part sur le réseau.

/** Clé de l'identifiant du commandant sur un événement du journal. */
export const COMMANDER = Symbol.for('elite-compagnon.commandant');

const FID = /^[A-Za-z0-9]{1,40}$/;
const NAME_PREFIX = 'nom:';
const MAX_NAME = 60;

/** Identifiant valable (FID, ou « nom:… ») ? Sert à relire un fichier ou une base. */
export function isCommanderId(v) {
  if (typeof v !== 'string') return false;
  if (FID.test(v)) return true;
  return v.startsWith(NAME_PREFIX) && v.length > NAME_PREFIX.length && v.length <= NAME_PREFIX.length + MAX_NAME && !/[\u0000-\u001f\u007f]/.test(v);
}

/**
 * Identifiant du commandant d'un LoadGame ou d'un Commander : le FID, sinon « nom:<nom> » ; null pour un autre
 * événement, ou s'il n'y a ni FID ni nom lisibles.
 */
export function commanderIdOf(ev) {
  if (!ev || (ev.event !== 'LoadGame' && ev.event !== 'Commander')) return null;
  if (typeof ev.FID === 'string' && FID.test(ev.FID.trim())) return ev.FID.trim();
  const raw = ev.event === 'LoadGame' ? ev.Commander : ev.Name;
  const name = typeof raw === 'string' ? raw.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_NAME) : '';
  return name ? `${NAME_PREFIX}${name}` : null;
}

/** Commandant noté sur l'événement par le lecteur des journaux, ou null. */
export function commanderOf(ev) {
  const c = ev && typeof ev === 'object' ? ev[COMMANDER] : null;
  return typeof c === 'string' ? c : null;
}

/** Copie la note du commandant d'un événement sur une copie réduite de lui (rend la copie). */
export function keepCommander(from, to) {
  const c = commanderOf(from);
  if (c) to[COMMANDER] = c;
  return to;
}

/**
 * Commandant le plus vu : le plus de lancements (LoadGame) ; à égalité, le dernier lancé. null si aucun.
 * @param {Map<string, { loads: number, last: number }>} counts
 */
export function mostSeen(counts) {
  let best = null;
  for (const [id, c] of counts) {
    if (!best || c.loads > best.loads || (c.loads === best.loads && c.last > best.last)) best = { id, ...c };
  }
  return best ? best.id : null;
}

/**
 * Suit le commandant au fil des événements (historique puis direct). see(ev) rend le commandant de l'événement : la
 * note du lecteur des journaux, sinon celui du LoadGame ou du Commander qui l'ouvre, sinon le dernier connu.
 */
export class CommanderTracker {
  constructor() {
    this.reset();
  }

  reset() {
    this.current = null;
    this.counts = new Map(); // commandant → { loads, last } (last : numéro d'ordre du dernier lancement)
    this.order = 0;
  }

  /** Commandant de l'événement (et le retient comme courant). */
  see(ev) {
    const own = commanderIdOf(ev);
    const id = commanderOf(ev) ?? own;
    if (id) {
      this.current = id;
      if (!this.counts.has(id)) this.counts.set(id, { loads: 0, last: -1 });
      if (ev?.event === 'LoadGame') {
        const c = this.counts.get(id);
        c.loads += 1;
        c.last = this.order++;
      }
    }
    return this.current;
  }

  /** Commandants vus (lancés ou nommés). */
  known() {
    return [...this.counts.keys()];
  }

  /** Un seul commandant vu (ou aucun) : une donnée d'avant, sans commandant, est la sienne. */
  single() {
    return this.counts.size <= 1;
  }

  mostSeen() {
    return mostSeen(this.counts);
  }
}

/**
 * Une ligne rangée avec le commandant `owner` (null : ligne d'avant, sans commandant) vaut-elle pour le commandant
 * `current` ? La sienne, oui ; une ligne sans commandant, seulement tant qu'un seul commandant est connu (single) :
 * elle est alors la sienne. Avec deux commandants, elle n'est à personne tant qu'elle n'est pas rattachée.
 */
export function belongsTo(owner, current, single) {
  if (owner == null) return Boolean(single) || current == null;
  return owner === current;
}

/** Clé d'un vaisseau d'un commandant, pour une Map : « F0000001#3 », « #3 » sans commandant connu. */
export const shipKey = (commander, shipId) => `${commander ?? ''}#${shipId}`;
