// Chrome sans fenêtre pour le banc de contrôle : profil temporaire, port de débogage choisi par Chrome lui-même (lu
// dans le fichier DevToolsActivePort du profil : toujours libre, sans course entre deux programmes), pilotage par le
// protocole DevTools sur le WebSocket intégré à Node (aucune dépendance).
//
// Le navigateur ne sort pas de ce PC : tout ce qui ne va pas vers 127.0.0.1 ou localhost passe par un proxy mort (la
// requête échoue, et l'étape la signale), sans services Google en arrière-plan. Ce n'est jamais le Chrome du joueur :
// profil à part, effacé à la fin.
//
//   const chrome = await lancerChrome();
//   const onglet = await chrome.onglet({ largeur: 1400, hauteur: 1000, scripts: [scriptHorloge(maintenant)] });
//   const page = await onglet.ouvrir('http://127.0.0.1:4321/routes');
//   const { manque, lu } = await page.attendre((lu) => (lu.texte.includes('Dashboard') ? [] : ['Dashboard']));
//   await page.capturer('C:\\…\\routes.png');
//   const bilan = await page.quitter(); // { exceptions, consoles, journaux, requetes, dialogues, plantage }
//   await chrome.fermer();              // toujours (finally) : Chrome arrêté, profil effacé

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { portLibre } from './serveur.mjs';

const DEMARRAGE_MS = 30_000;
const COMMANDE_MS = 30_000;
const ARRET_MS = 10_000;
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

/** Chrome de ce PC : CONTROLE_CHROME s'il est réglé (et doit alors exister), sinon les emplacements habituels. */
export function trouverChrome(env = process.env) {
  if (env.CONTROLE_CHROME) return fs.existsSync(env.CONTROLE_CHROME) ? env.CONTROLE_CHROME : null;
  const candidats = [
    path.join(env.ProgramFiles || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe') : null,
  ].filter(Boolean);
  return candidats.find((c) => fs.existsSync(c)) || null;
}

/**
 * Script lancé avant celui de chaque page : horloge partant de `maintenant` (heure figée du serveur isolé) et qui
 * avance au rythme réel depuis le chargement de la page (les comptes à rebours bougent, un « depuis » reste juste),
 * Math.random à graine fixe. Les minuteries gardent l'horloge réelle.
 */
export function scriptHorloge(maintenant, graine = 'controle') {
  const fixe = Date.parse(maintenant);
  if (!Number.isFinite(fixe)) throw new Error(`Heure figée illisible : « ${maintenant} ».`);
  return `(() => {
  const fixe = ${fixe};
  const t0 = performance.now();
  const RealDate = Date;
  const now = () => fixe + Math.floor(performance.now() - t0);
  globalThis.Date = new Proxy(RealDate, {
    apply: () => new RealDate(now()).toString(),
    construct: (target, args, newTarget) => Reflect.construct(target, args.length ? args : [now()], newTarget),
    get: (target, prop, receiver) => (prop === 'now' ? now : Reflect.get(target, prop, receiver)),
  });
  let h = 2166136261;
  for (const c of ${JSON.stringify(String(graine))}) h = Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0;
  let a = h;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();`;
}

/** Client minimal du protocole DevTools : commandes numérotées, événements diffusés aux abonnés. */
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.n = 0;
    this.attente = new Map();
    this.abonnes = new Set();
    this.ferme = false;
    ws.addEventListener('message', (e) => {
      let msg;
      try {
        msg = JSON.parse(typeof e.data === 'string' ? e.data : Buffer.from(e.data).toString('utf8'));
      } catch {
        return;
      }
      if (msg.id !== undefined) {
        const a = this.attente.get(msg.id);
        if (!a) return;
        this.attente.delete(msg.id);
        clearTimeout(a.minuterie);
        if (msg.error) a.reject(new Error(`${a.methode} : ${msg.error.message}${msg.error.data ? ` (${msg.error.data})` : ''}`));
        else a.resolve(msg.result);
        return;
      }
      for (const f of this.abonnes) f(msg);
    });
    ws.addEventListener('close', () => {
      this.ferme = true;
      for (const a of this.attente.values()) {
        clearTimeout(a.minuterie);
        a.reject(new Error(`${a.methode} : connexion à Chrome fermée.`));
      }
      this.attente.clear();
    });
  }

  envoyer(methode, params = {}, sessionId = undefined, delaiMs = COMMANDE_MS) {
    if (this.ferme) return Promise.reject(new Error(`${methode} : connexion à Chrome fermée.`));
    const id = ++this.n;
    return new Promise((resolve, reject) => {
      const minuterie = setTimeout(() => {
        this.attente.delete(id);
        reject(new Error(`${methode} : pas de réponse de Chrome en ${Math.round(delaiMs / 1000)} s.`));
      }, delaiMs);
      this.attente.set(id, { resolve, reject, minuterie, methode });
      this.ws.send(JSON.stringify({ id, method: methode, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
}

/** Texte d'un argument de console (chaîne, nombre, objet décrit par Chrome). */
function texteArgument(a) {
  if (!a) return '';
  if (a.value !== undefined) return typeof a.value === 'string' ? a.value : JSON.stringify(a.value);
  return a.unserializableValue ?? a.description ?? a.type ?? '';
}

function tuerArbre(pid) {
  try {
    if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    else process.kill(pid, 'SIGKILL');
  } catch { /* déjà arrêté */ }
}

function effacer(dossier) {
  try {
    fs.rmSync(dossier, { recursive: true, force: true, maxRetries: 15, retryDelay: 200 });
    return true;
  } catch {
    return false;
  }
}

/** Port et chemin du WebSocket du navigateur, écrits par Chrome dans son profil (--remote-debugging-port=0). */
function lirePortActif(profil) {
  try {
    const [port, chemin] = fs.readFileSync(path.join(profil, 'DevToolsActivePort'), 'utf8').split(/\r?\n/);
    if (/^\d+$/.test(port) && /^\/devtools\/browser\/[\w-]+$/.test(chemin || '')) return { port: Number(port), chemin };
  } catch { /* pas encore écrit */ }
  return null;
}

/**
 * Lance Chrome sans fenêtre. Rend { version, pid, profil, onglet(o), fermer() }.
 * `fermer()` est à appeler dans un finally : il arrête Chrome (de force s'il ne répond plus) et efface le profil.
 */
export async function lancerChrome({ executable = trouverChrome(), sortie } = {}) {
  if (!executable) throw new Error('Chrome introuvable sur ce PC (ni CONTROLE_CHROME, ni Program Files, ni AppData).');
  const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'elite-controle-chrome-'));
  const proxyMort = await portLibre(); // libéré aussitôt : personne n'y écoute, les requêtes vers l'extérieur échouent
  const args = [
    '--headless=new',
    `--user-data-dir=${profil}`,
    '--remote-debugging-port=0',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-component-extensions-with-background-pages',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-sync',
    '--disable-domain-reliability',
    '--disable-client-side-phishing-detection',
    '--disable-features=BackForwardCache,Translate,OptimizationHints,MediaRouter,DialMediaRouteProvider,AutofillServerCommunication,CertificateTransparencyComponentUpdater',
    '--no-pings',
    '--metrics-recording-only',
    '--password-store=basic',
    '--mute-audio',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-color-profile=srgb',
    '--lang=fr-FR',
    '--accept-lang=fr-FR',
    `--proxy-server=http://127.0.0.1:${proxyMort}`, // 127.0.0.1 et localhost ne passent jamais par le proxy
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1',
    'about:blank',
  ];
  const lignes = [];
  const proc = spawn(executable, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  for (const flux of [proc.stdout, proc.stderr]) {
    flux.setEncoding('utf8');
    flux.on('data', (d) => {
      for (const l of d.split(/\r?\n/).filter(Boolean)) {
        lignes.push(l);
        if (lignes.length > 500) lignes.shift();
        sortie?.(l);
      }
    });
  }
  const fin = new Promise((resolve) => proc.once('exit', (code, signal) => resolve({ code, signal })));
  proc.once('error', () => {});
  const surSortie = () => tuerArbre(proc.pid); // le banc s'arrête net : Chrome ne lui survit pas
  process.once('exit', surSortie);

  let cdp = null;
  const fermer = async () => {
    process.removeListener('exit', surSortie);
    if (proc.exitCode === null && proc.signalCode === null) {
      if (cdp && !cdp.ferme) await cdp.envoyer('Browser.close', {}, undefined, 5000).catch(() => {});
      if (!(await Promise.race([fin, attendre(ARRET_MS).then(() => null)]))) {
        tuerArbre(proc.pid);
        await Promise.race([fin, attendre(ARRET_MS)]);
      }
    }
    try { cdp?.ws.close(); } catch { /* déjà fermé */ }
    return { efface: effacer(profil), profil };
  };

  try {
    let actif = null;
    const limite = Date.now() + DEMARRAGE_MS;
    while (!actif) {
      if (proc.exitCode !== null || proc.signalCode !== null) throw new Error(`Chrome s'est arrêté au démarrage (code ${proc.exitCode ?? proc.signalCode}).\n${lignes.slice(-20).join('\n')}`);
      if (Date.now() > limite) throw new Error(`Chrome ne donne pas son port de débogage après ${DEMARRAGE_MS / 1000} s.\n${lignes.slice(-20).join('\n')}`);
      await attendre(100);
      actif = lirePortActif(profil);
    }
    const ws = new WebSocket(`ws://127.0.0.1:${actif.port}${actif.chemin}`);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', () => reject(new Error(`Connexion au port de débogage de Chrome (${actif.port}) impossible.`)), { once: true });
    });
    cdp = new Cdp(ws);
    const { product } = await cdp.envoyer('Browser.getVersion');
    return {
      version: product,
      pid: proc.pid,
      profil,
      port: actif.port,
      lignes: () => lignes.slice(),
      /** Onglet du contexte par défaut. */
      onglet: (o) => nouvelOnglet(cdp, o),
      /**
       * Contexte à part (comme un profil neuf) : ses onglets partagent entre eux, et seulement entre eux, cookies,
       * stockage, cache et connexions (6 au plus par adresse en HTTP/1.1, comme les fenêtres d'une même session Electron).
       */
      contexte: async () => {
        const { browserContextId } = await cdp.envoyer('Target.createBrowserContext', { disposeOnDetach: true });
        return {
          id: browserContextId,
          onglet: (o) => nouvelOnglet(cdp, { ...o, browserContextId }),
          fermer: () => cdp.envoyer('Target.disposeBrowserContext', { browserContextId }).catch(() => {}),
        };
      },
      fermer,
    };
  } catch (err) {
    await fermer();
    throw err;
  }
}

/**
 * Nouvel onglet : taille de la fenêtre, fuseau Europe/Paris, langue fr-FR, cache coupé, scripts lancés avant ceux de
 * chaque page, couleur de fond (fenêtres HUD transparentes : fond sombre comme le jeu, pour la capture).
 */
async function nouvelOnglet(cdp, { largeur = 1400, hauteur = 1000, scripts = [], fond = null, browserContextId } = {}) {
  // Chaque onglet dans sa propre fenêtre : un onglet caché derrière un autre ne dessine plus, et sa capture attendrait
  const { targetId } = await cdp.envoyer('Target.createTarget', { url: 'about:blank', newWindow: true, ...(browserContextId ? { browserContextId } : {}) });
  const { sessionId } = await cdp.envoyer('Target.attachToTarget', { targetId, flatten: true });
  const envoyer = (methode, params = {}, delaiMs) => cdp.envoyer(methode, params, sessionId, delaiMs);
  let courant = null; // relevé de la page ouverte
  let charge = false;

  const ecoute = (msg) => {
    if (msg.sessionId !== sessionId) return;
    const p = msg.params || {};
    if (msg.method === 'Page.loadEventFired') charge = true;
    if (msg.method === 'Page.javascriptDialogOpening') {
      courant?.dialogues.push(`${p.type} : ${p.message}`);
      envoyer('Page.handleJavaScriptDialog', { accept: false }).catch(() => {});
    }
    if (msg.method === 'Inspector.targetCrashed' && courant) courant.plantage = true;
    if (!courant) return;
    const r = courant.requetes;
    switch (msg.method) {
      case 'Runtime.exceptionThrown': {
        const d = p.exceptionDetails || {};
        courant.exceptions.push({ texte: d.exception?.description || d.exception?.value || d.text || 'exception', url: d.url || '', ligne: d.lineNumber });
        break;
      }
      case 'Runtime.consoleAPICalled':
        if (['error', 'assert'].includes(p.type)) courant.consoles.push({ type: p.type, texte: (p.args || []).map(texteArgument).join(' ') });
        else if (p.type === 'warning') courant.avertissements.push((p.args || []).map(texteArgument).join(' '));
        break;
      case 'Log.entryAdded':
        if (p.entry?.level === 'error') courant.journaux.push({ source: p.entry.source, texte: p.entry.text, url: p.entry.url || '' });
        break;
      case 'Network.requestWillBeSent': {
        const avant = r.get(p.requestId);
        r.set(p.requestId, {
          id: p.requestId,
          url: p.request.url,
          methode: p.request.method,
          type: p.type || avant?.type || '',
          loaderId: p.loaderId,
          statut: null,
          echec: null,
          annule: false,
          fini: false,
          redirections: (avant?.redirections || 0) + (p.redirectResponse ? 1 : 0),
        });
        courant.activite = Date.now();
        break;
      }
      case 'Network.responseReceived':
        if (r.has(p.requestId)) Object.assign(r.get(p.requestId), { statut: p.response.status, type: p.type || r.get(p.requestId).type });
        courant.activite = Date.now();
        break;
      case 'Network.loadingFinished':
        if (r.has(p.requestId)) r.get(p.requestId).fini = true;
        courant.activite = Date.now();
        break;
      case 'Network.loadingFailed':
        if (r.has(p.requestId)) Object.assign(r.get(p.requestId), { fini: true, echec: p.errorText || 'échec', annule: Boolean(p.canceled), bloque: p.blockedReason || null });
        courant.activite = Date.now();
        break;
      default:
    }
  };
  cdp.abonnes.add(ecoute);

  await Promise.all([
    envoyer('Page.enable'),
    envoyer('Runtime.enable'),
    envoyer('Network.enable'),
    envoyer('Log.enable'),
    envoyer('Inspector.enable').catch(() => {}),
  ]);
  await envoyer('Network.setCacheDisabled', { cacheDisabled: true });
  await envoyer('Emulation.setDeviceMetricsOverride', { width: largeur, height: hauteur, deviceScaleFactor: 1, mobile: false });
  await envoyer('Emulation.setTimezoneOverride', { timezoneId: 'Europe/Paris' });
  await envoyer('Emulation.setLocaleOverride', { locale: 'fr-FR' });
  if (fond) await envoyer('Emulation.setDefaultBackgroundColorOverride', { color: fond });
  for (const source of scripts) await envoyer('Page.addScriptToEvaluateOnNewDocument', { source });

  /**
   * Relevé de la page. styles : [{ selecteur, propriete }] : la valeur calculée de cette propriété CSS pour chaque
   * élément trouvé (getComputedStyle), rendue dans lu.styles ([{ selecteur, propriete, valeurs }]).
   */
  const lire = async (styles = []) => {
    const sondes = JSON.stringify(styles.map(({ selecteur, propriete }) => ({ selecteur: String(selecteur), propriete: String(propriete) })));
    const { result, exceptionDetails } = await envoyer('Runtime.evaluate', {
      expression: `(() => ({
        styles: (${sondes}).map(({ selecteur, propriete }) => ({ selecteur, propriete, valeurs: [...document.querySelectorAll(selecteur)].map((e) => getComputedStyle(e).getPropertyValue(propriete)) })),
        texte: document.body ? document.body.innerText : '',
        titres: [...document.querySelectorAll('h1')].map((h) => h.innerText.trim()),
        actifs: [...document.querySelectorAll('[aria-current="page"]')].map((e) => e.innerText.trim()),
        infobulles: [...new Set([...document.querySelectorAll('[title]')].map((e) => e.title))].slice(0, 300),
        noeuds: document.getElementById('root') ? document.getElementById('root').querySelectorAll('*').length : 0,
        url: location.href,
      }))()`,
      returnByValue: true,
    });
    if (exceptionDetails) throw new Error(`lecture de la page : ${exceptionDetails.text}`);
    return result.value;
  };

  // Requêtes de la page ouverte (même chargement), sans le flux temps réel qui reste ouvert
  const enCours = () => [...courant.requetes.values()].filter((q) => q.loaderId === courant.loaderId && !q.fini && q.type !== 'EventSource');

  async function aller(url, delaiMs = 20_000) {
    charge = false;
    const nav = await envoyer('Page.navigate', { url });
    if (nav.errorText) throw new Error(`navigation vers ${url} : ${nav.errorText}`);
    const limite = Date.now() + delaiMs;
    while (!charge) {
      if (Date.now() > limite) throw new Error(`${url} : pas chargée en ${Math.round(delaiMs / 1000)} s.`);
      await attendre(50);
    }
    return nav.loaderId;
  }

  return {
    sessionId,
    /** Ouvre une adresse (chargement complet, comme une fenêtre de l'overlay) et commence le relevé. */
    async ouvrir(url, { delaiMs = 20_000 } = {}) {
      courant = { requetes: new Map(), exceptions: [], consoles: [], avertissements: [], journaux: [], dialogues: [], plantage: false, loaderId: null, activite: Date.now() };
      courant.loaderId = await aller(url, delaiMs);
      const releve = courant;
      return {
        /**
         * Attend que `verifier(lu)` ne rende plus rien à signaler ([]), avec le réseau calme depuis `calmeMs`.
         * `avant` : appelé à chaque tour, avant la lecture (un geste à retenter tant qu'il n'a pas pris) ; `styles` :
         * styles calculés à relever ([{ selecteur, propriete }], voir lire).
         * Rend { manque (dernier relevé non vide, ou []), lu, ms }.
         */
        async attendre(verifier, { delaiMs: d = 15_000, calmeMs = 600, avant = null, styles = [] } = {}) {
          const debut = Date.now();
          const limite = debut + d;
          let lu = null;
          let manque = ['page pas encore lue'];
          for (;;) {
            if (avant) await avant(); // geste à retenter tant qu'il n'a pas pris (bouton pas encore là, désactivé…)
            lu = await lire(styles);
            manque = verifier(lu);
            const calme = enCours().length === 0 && Date.now() - releve.activite >= calmeMs;
            if (!manque.length && calme) return { manque, lu, ms: Date.now() - debut };
            if (releve.plantage) return { manque: ['onglet planté'], lu, ms: Date.now() - debut };
            if (Date.now() > limite) {
              const reste = enCours().map((q) => `${q.methode} ${q.url}`);
              return { manque: [...manque, ...(reste.length ? [`requêtes encore en cours : ${reste.slice(0, 5).join(', ')}`] : [])], lu, ms: Date.now() - debut };
            }
            await attendre(150);
          }
        },
        /**
         * Clique le premier bouton, lien ou onglet dont le texte vaut `texte` (sans tenir compte des majuscules, des
         * sortes d'espaces ni des apostrophes) ; à défaut, le premier qui le contient. Rend 'ok', 'absent' ou 'désactivé'.
         */
        async cliquer(texte) {
          const { result } = await envoyer('Runtime.evaluate', {
            expression: `((t) => {
              const n = (s) => String(s || '').replace(/[\\u2018\\u2019\\u02bc]/g, "'").replace(/[\\s\\u00a0\\u202f\\u2007\\u2009]+/g, ' ').trim().toLocaleLowerCase('fr-FR');
              const cible = n(t);
              const tous = [...document.querySelectorAll('button, a, [role="tab"], [role="button"]')];
              const el = tous.find((e) => n(e.innerText) === cible) || tous.find((e) => n(e.innerText).includes(cible));
              if (!el) return 'absent';
              if (el.disabled || el.getAttribute('aria-disabled') === 'true') return 'désactivé';
              el.click();
              return 'ok';
            })(${JSON.stringify(texte)})`,
            returnByValue: true,
          });
          releve.activite = Date.now();
          return result.value;
        },
        /**
         * Tape `texte` au clavier dans le premier champ dont l'indication (placeholder), l'étiquette (aria-label) ou le
         * libellé (<label>) commence par `champ`, comme un joueur : focus, puis frappe (la page voit de vrais événements).
         * Rend 'ok', 'absent' ou 'désactivé'.
         */
        async saisir(champ, texte) {
          const { result } = await envoyer('Runtime.evaluate', {
            expression: `((t) => {
              const n = (s) => String(s || '').replace(/[\\u2018\\u2019\\u02bc]/g, "'").replace(/[\\s\\u00a0\\u202f\\u2007\\u2009]+/g, ' ').trim().toLocaleLowerCase('fr-FR');
              const cible = n(t);
              const nom = (e) => [e.placeholder, e.getAttribute('aria-label'), ...[...(e.labels || [])].map((l) => l.innerText)].map(n);
              const el = [...document.querySelectorAll('input, textarea')].find((e) => nom(e).some((x) => x && x.startsWith(cible)));
              if (!el) return 'absent';
              if (el.disabled || el.readOnly) return 'désactivé';
              el.focus();
              el.select?.();
              return 'ok';
            })(${JSON.stringify(champ)})`,
            returnByValue: true,
          });
          if (result.value !== 'ok') return result.value;
          await envoyer('Input.insertText', { text: String(texte) });
          releve.activite = Date.now();
          return 'ok';
        },
        /** Évalue une expression dans la page (promesse attendue) ; rend sa valeur, ou lance son exception. */
        async evaluer(expression, { delaiMs: d = 15_000 } = {}) {
          const { result, exceptionDetails } = await envoyer('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout: d }, d + 5000);
          if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
          return result.value;
        },
        /** Capture PNG : toute la page (bornée à 12 000 px de haut), ou seulement la fenêtre. */
        async capturer(fichier, { pleinePage = true } = {}) {
          let params = { format: 'png' };
          if (pleinePage) {
            const m = await envoyer('Page.getLayoutMetrics');
            const vue = m.cssLayoutViewport || m.layoutViewport;
            const taille = m.cssContentSize || m.contentSize;
            params = { ...params, captureBeyondViewport: true, clip: { x: 0, y: 0, width: Math.ceil(vue.clientWidth), height: Math.min(12_000, Math.max(Math.ceil(taille.height), vue.clientHeight)), scale: 1 } };
          }
          const { data } = await envoyer('Page.captureScreenshot', params, 20_000);
          fs.mkdirSync(path.dirname(fichier), { recursive: true });
          fs.writeFileSync(fichier, Buffer.from(data, 'base64'));
          return fichier;
        },
        /**
         * Quitte la page (about:blank : ce qu'elle fait en se fermant compte aussi) et rend le relevé :
         * { exceptions, consoles, avertissements, journaux, dialogues, plantage, requetes } ; les réponses en erreur
         * (statut ≥ 400) portent le début de leur corps.
         */
        async quitter() {
          const requetes = [...releve.requetes.values()].filter((q) => q.loaderId === releve.loaderId);
          for (const q of requetes.filter((x) => x.statut >= 400)) {
            try {
              const b = await envoyer('Network.getResponseBody', { requestId: q.id }, 5000);
              q.corps = (b.base64Encoded ? Buffer.from(b.body, 'base64').toString('utf8') : b.body).slice(0, 2000);
            } catch {
              q.corps = null;
            }
          }
          await aller('about:blank', 10_000).catch(() => {});
          await attendre(100);
          courant = null;
          return { ...releve, requetes };
        },
      };
    },
    async fermer() {
      cdp.abonnes.delete(ecoute);
      await cdp.envoyer('Target.closeTarget', { targetId }).catch(() => {});
    },
  };
}
