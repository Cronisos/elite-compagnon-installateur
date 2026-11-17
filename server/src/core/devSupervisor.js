// Surveillance du serveur en développement (server/dev.js, « npm run dev ») : relance quand le code change, et après un
// plantage. Avant, un plantage (erreur imprévue, écriture ratée dans une minuterie) laissait l'app morte en pleine
// séance jusqu'à une relance à la main ; seul un changement du code relançait.
//
// Plantage : relance au bout de `crashDelayMs`. Plus de `maxCrashes` plantages en `windowMs` : plus de relance, avec
// un message (un défaut qui revient à chaque démarrage ne se réglerait pas tout seul). Un changement du code relance
// toujours, et remet le compte à zéro.

/** Attente avant la relance d'un serveur planté (aussi annoncée par core/crashGuard.js dans son message). */
export const CRASH_DELAY_MS = 2000;

/**
 * @param {object} o
 * @param {() => import('node:child_process').ChildProcess} o.spawnChild lance le serveur
 * @param {(msg: string) => void} [o.log]
 * @returns {{ start(), restart(), child(), gaveUp() }}
 */
export function superviseServer({ spawnChild, log = console.error, crashDelayMs = CRASH_DELAY_MS, windowMs = 60_000, maxCrashes = 5, now = Date.now, setTimer = setTimeout }) {
  let child = null;
  let running = false; // le serveur actuel tourne encore
  let restarting = false; // arrêt voulu en cours (code modifié) : la relance suit sa fin
  let gaveUp = false;
  const crashes = [];

  /** Le serveur `mine` s'est arrêté (ou n'a jamais pu être lancé). */
  function ended(mine, why) {
    if (mine !== child) return; // un ancien serveur, déjà remplacé
    running = false;
    if (restarting) {
      start(); // arrêt voulu : relance tout de suite, ce n'est pas un plantage
      return;
    }
    const t = now();
    crashes.push(t);
    while (crashes.length && t - crashes[0] > windowMs) crashes.shift();
    if (crashes.length > maxCrashes) {
      gaveUp = true;
      log(`Le serveur s'est arrêté ${crashes.length} fois en une minute : plus de relance automatique. Lis l'erreur ci-dessus, puis relance l'app.`);
      return;
    }
    log(`Le serveur s'est arrêté (${why}) : relance dans ${Math.round(crashDelayMs / 1000)} s.`);
    setTimer(() => {
      if (mine === child && !running) start(); // entre-temps, le code a pu changer : déjà relancé
    }, crashDelayMs);
  }

  function start() {
    restarting = false;
    running = true;
    const mine = spawnChild();
    child = mine;
    let done = false;
    const end = (why) => {
      if (done) return;
      done = true;
      ended(mine, why);
    };
    mine.once('exit', (code, signal) => end(`code ${code ?? signal}`));
    // Lancement impossible (programme introuvable, trop de processus) : « exit » peut ne jamais venir. Sans écouteur,
    // l'erreur arrêterait dev.js lui-même (et l'interface avec lui, concurrently -k).
    mine.on('error', (err) => {
      if (mine.pid === undefined) return end(`lancement impossible : ${err.message}`);
      if (restarting && mine === child) {
        // Arrêt refusé (kill) : il tourne encore, aucune fin n'arrivera. Sans ceci, la relance restait « en cours » pour
        // toujours et plus aucun changement du code ne relançait le serveur.
        restarting = false;
        log(`Serveur : arrêt refusé (${err.message}), il tourne toujours ; le prochain changement du code réessaiera.`);
        return;
      }
      log(`Serveur : ${err.message}`);
    });
    return mine;
  }

  /** Code modifié : arrêt puis relance (pas un plantage). */
  function restart() {
    gaveUp = false;
    crashes.length = 0;
    if (restarting) return child; // déjà en cours d'arrêt (deux changements de suite) : une seule relance
    if (!child || !running) return start(); // déjà arrêté (plantage, abandon) : on relance
    restarting = true;
    child.kill();
    return child;
  }

  return { start, restart, child: () => child, gaveUp: () => gaveUp };
}
