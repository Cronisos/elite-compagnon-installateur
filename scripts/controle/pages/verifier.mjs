// Vérifications de l'étape « pages et fenêtres » (etapes/75-pages.mjs), sans navigateur : ce qu'une page doit montrer,
// ce que son relevé (exceptions, console, réseau) a d'anormal, et si toutes les pages des modules ont leurs attendus.
// Fonctions pures, testées par tests/pages.test.mjs.

import fs from 'node:fs';
import path from 'node:path';

/**
 * Texte comparable : espaces de toutes sortes (insécable, fine insécable des nombres en français…) réduits à un seul,
 * apostrophe typographique ramenée à la droite, minuscules (l'affichage met certains titres en capitales par le CSS).
 */
export function normaliser(texte) {
  return String(texte ?? '')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[\s    ]+/g, ' ')
    .trim()
    .toLocaleLowerCase('fr-FR');
}

/** Ce qu'aucune page ne doit jamais afficher : valeur non calculée, objet brut, date illisible, erreur du serveur. */
export const INTERDITS = [
  { motif: /\bNaN\b/, raison: 'NaN affiché' },
  { motif: /\bundefined\b/, raison: '« undefined » affiché' },
  { motif: /\[object Object\]/, raison: '[object Object] affiché' },
  { motif: /Invalid Date/, raison: 'date illisible (Invalid Date)' },
  { motif: /Erreur interne du serveur/, raison: '« Erreur interne du serveur » affiché' },
];

/**
 * Ce qui manque à une vue (liste vide : tout y est).
 * `lu` : { texte, titres, actifs, infobulles, noeuds, url, styles } (banc/chrome.mjs) ; `attendu` : { titre, onglet,
 * textes, absents, infobulles, rien (rien affiché), libre (ni page blanche ni contenu exigés), url (expression régulière
 * sur le chemin, après un clic qui change de page), styles ([{ selecteur, propriete, valeurs }] : au moins un élément
 * visé, et chacun avec une des valeurs calculées permises) }.
 */
export function manquesVue(lu, attendu) {
  const manque = [];
  const texte = normaliser(lu.texte);
  if (attendu.libre) {
    // fenêtre ouverte hors de l'overlay : seulement ce qu'elle ne doit jamais faire (erreurs, textes interdits)
  } else if (attendu.rien) {
    if (lu.noeuds > 0) manque.push(`fenêtre vide attendue (rien à montrer), mais ${lu.noeuds} élément(s) affiché(s)`);
  } else if (!lu.noeuds) {
    manque.push('page blanche (rien dans #root)');
  }
  if (attendu.titre && !lu.titres.some((t) => normaliser(t) === normaliser(attendu.titre))) {
    manque.push(`titre « ${attendu.titre} » (titres vus : ${lu.titres.length ? lu.titres.map((t) => `« ${t} »`).join(', ') : 'aucun'})`);
  }
  for (const b of attendu.infobulles || []) if (!(lu.infobulles || []).some((t) => normaliser(t) === normaliser(b))) manque.push(`infobulle « ${b} »`);
  if (attendu.onglet && !(lu.actifs || []).some((t) => normaliser(t) === normaliser(attendu.onglet))) {
    manque.push(`onglet actif « ${attendu.onglet} » (actifs : ${(lu.actifs || []).map((t) => `« ${t} »`).join(', ') || 'aucun'})`);
  }
  for (const t of attendu.textes || []) if (!texte.includes(normaliser(t))) manque.push(`texte « ${t} »`);
  for (const t of attendu.absents || []) if (texte.includes(normaliser(t))) manque.push(`texte qui ne devrait pas être là : « ${t} »`);
  for (const i of INTERDITS) if (i.motif.test(lu.texte || '')) manque.push(i.raison);
  for (const s of attendu.styles || []) {
    const vu = (lu.styles || []).find((x) => x.selecteur === s.selecteur && x.propriete === s.propriete);
    if (!vu || !vu.valeurs.length) {
      manque.push(`style : aucun élément « ${s.selecteur} » (${s.propriete} attendu : ${s.valeurs.join(' ou ')})`);
      continue;
    }
    const faux = [...new Set(vu.valeurs.filter((v) => !s.valeurs.includes(v)))];
    if (faux.length) manque.push(`style « ${s.selecteur} » : ${s.propriete} vaut ${faux.join(', ')} (attendu : ${s.valeurs.join(' ou ')})`);
  }
  if (attendu.url) {
    const chemin = (() => {
      try { return decodeURIComponent(new URL(lu.url).pathname); } catch { return String(lu.url); }
    })();
    if (!attendu.url.test(chemin)) manque.push(`adresse ${attendu.url} (adresse vue : ${chemin})`);
  }
  return manque;
}

const court = (s, n = 200) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

/** Requête tolérée : { requete: 'GET /api/…' (chemin exact, sans la requête), statut, raison }. */
function toleree(q, chemin, toleres) {
  return toleres.find((t) => t.requete === `${q.methode} ${chemin}` && t.statut === q.statut);
}

/**
 * Problèmes d'un relevé de page (banc/chrome.mjs, page.quitter()) : exceptions, erreurs de console et du navigateur,
 * boîtes de dialogue, plantage, requêtes vers l'extérieur, réponses ≥ 400 non tolérées, requêtes en échec, et
 * écritures quand la vue n'en attend pas (`lecture` : une page qu'on ne fait qu'ouvrir ne doit rien modifier).
 * `origine` : http://127.0.0.1:<port> de l'interface du banc.
 */
export function problemesDuReleve(bilan, { origine, toleres = [], lecture = true }) {
  const p = [];
  for (const e of bilan.exceptions || []) p.push(`exception : ${court(e.texte.split('\n')[0])}${e.url ? ` (${court(e.url, 80)}:${e.ligne ?? '?'})` : ''}`);
  for (const c of bilan.consoles || []) p.push(`erreur de console : ${court(c.texte)}`);
  // Les erreurs « network » du journal du navigateur doublent les requêtes en erreur, vérifiées une à une ci-dessous
  for (const j of bilan.journaux || []) if (j.source !== 'network') p.push(`erreur du navigateur (${j.source}) : ${court(j.texte)}`);
  for (const d of bilan.dialogues || []) p.push(`boîte de dialogue inattendue : ${court(d)}`);
  if (bilan.plantage) p.push('onglet planté');
  for (const q of bilan.requetes || []) {
    if (/^(data|blob|about):/.test(q.url)) continue;
    let u;
    try { u = new URL(q.url); } catch { p.push(`adresse illisible : ${court(q.url, 120)}`); continue; }
    if (u.origin !== origine) {
      p.push(`requête vers l'extérieur : ${q.methode} ${court(q.url, 160)}`);
      continue;
    }
    const chemin = u.pathname;
    if (q.statut >= 400 && !toleree(q, chemin, toleres)) p.push(`HTTP ${q.statut} inattendu : ${q.methode} ${chemin}${q.corps ? ` — ${court(q.corps, 160)}` : ''}`);
    if (q.echec && !q.annule) p.push(`requête en échec : ${q.methode} ${chemin} (${q.echec})`);
    if (lecture && !['GET', 'HEAD', 'OPTIONS'].includes(q.methode)) p.push(`écriture à la seule ouverture de la page : ${q.methode} ${chemin}`);
  }
  return [...new Set(p)];
}

/** Chemins déclarés par <Route path="…"> dans un fichier source (index : « »). */
export function routesDeclarees(source) {
  const out = [];
  for (const m of String(source).matchAll(/<Route\b([^>]*)>/g)) {
    const attrs = m[1];
    const p = /\bpath=(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\})/.exec(attrs);
    if (p) out.push(p[1] ?? p[2] ?? p[3]);
    else if (/\bindex\b/.test(attrs)) out.push('');
  }
  return out;
}

/** Fichiers .jsx et .js d'un dossier, sans les tests. */
function sources(dossier) {
  if (!fs.existsSync(dossier)) return [];
  return fs.readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    const f = path.join(dossier, e.name);
    if (e.isDirectory()) return sources(f);
    return /\.(jsx?|mjs)$/.test(e.name) && !/\.test\./.test(e.name) ? [f] : [];
  });
}

/**
 * Sous-pages de chaque module (routes de son dossier, sous son chemin) : { '/routes/nouvelle': 'routes', … }.
 * Les routes à paramètre gardent leur forme déclarée (/routes/:id).
 */
export function sousPages(modules, dossierModules) {
  const out = {};
  for (const m of modules) {
    if (!m.chemin) continue;
    for (const f of sources(path.join(dossierModules, m.id))) {
      for (const r of routesDeclarees(fs.readFileSync(f, 'utf8'))) {
        if (r === '' || r === '*') continue;
        out[`${m.chemin}/${r.replace(/^\/+/, '')}`] = m.id;
      }
    }
  }
  return out;
}

/**
 * Trous entre les modules clients et les attendus : une page, une sous-page ou une fenêtre sans attendu (elle ne
 * serait jamais ouverte), ou un attendu sans page (faute de frappe, page retirée).
 * `app` : clés des attendus des pages ; `hud` : clés des attendus des fenêtres ; `fixes` : pages du cœur (/, /parametres…).
 */
export function trous({ modules, app, hud, sous, fixes, ensemble = hud }) {
  const t = [];
  const pages = new Set([...fixes, ...modules.filter((m) => m.chemin).map((m) => m.chemin), ...Object.keys(sous)]);
  const fenetres = new Set(modules.flatMap((m) => [...(m.hud ? [m.id] : []), ...m.pagesHud]));
  for (const p of pages) if (!app.includes(p)) t.push(`page ${p} sans attendu (scripts/controle/pages/attendus.mjs, APP)`);
  for (const p of app) if (!pages.has(p)) t.push(`attendu de page ${p} sans page dans l'interface (faute de frappe, ou page retirée ?)`);
  for (const f of fenetres) if (!hud.includes(f)) t.push(`fenêtre /hud/${f} sans attendu (scripts/controle/pages/attendus.mjs, HUD)`);
  for (const f of hud) if (!fenetres.has(f)) t.push(`attendu de fenêtre /hud/${f} sans fenêtre dans l'interface`);
  for (const f of fenetres) if (!ensemble.includes(f)) t.push(`fenêtre /hud/${f} sans attendu quand toutes sont ouvertes ensemble (attendus.mjs, FENETRES)`);
  for (const f of ensemble) if (!fenetres.has(f)) t.push(`attendu de fenêtre /hud/${f} (FENETRES) sans fenêtre dans l'interface`);
  return t;
}

/**
 * Concordance entre la déclaration commune des modes (server/src/core/modes.js : celle que le serveur suit pour basculer
 * seul) et les modules clients tels que Vite les charge (banc/client.mjs, decrireModules) : un module par mode, du même
 * identifiant, avec une page et `mode: modeInfo('<id>')` ; les fenêtres du mode = son HUD puis ses hudPages, dans
 * l'ordre. Rend la liste des écarts (vide : tout concorde).
 */
export function concordanceModes(modules, modes) {
  const ecarts = [];
  const parId = new Map(modules.map((m) => [m.id, m]));
  for (const mode of modes) {
    const m = parId.get(mode.id);
    if (!m) {
      ecarts.push(`mode « ${mode.id} » déclaré dans server/src/core/modes.js, mais aucun module client n'a cet identifiant`);
      continue;
    }
    if (m.modeId !== mode.id) ecarts.push(`module ${m.id} : un mode est déclaré pour lui, mais son champ mode ne vaut pas modeInfo('${mode.id}')`);
    if (!m.chemin) ecarts.push(`module ${m.id} : un mode de jeu a besoin d'une page (Component)`);
    const fenetres = [...(m.hud ? [m.id] : []), ...m.pagesHud];
    if (JSON.stringify(fenetres) !== JSON.stringify(mode.windows)) {
      ecarts.push(`mode ${mode.id} : fenêtres déclarées [${mode.windows.join(', ')}], module client [${fenetres.join(', ')}] (son HUD, puis ses hudPages)`);
    }
  }
  for (const m of modules) {
    if (m.mode && !m.modeId) ecarts.push(`module ${m.id} : mode écrit en dur ; utilise modeInfo('${m.id}') et déclare-le dans server/src/core/modes.js`);
    else if (m.modeId && m.modeId !== m.id) ecarts.push(`module ${m.id} : modeInfo('${m.modeId}') renvoie au mode d'un autre module`);
    else if (m.modeId && !modes.some((x) => x.id === m.modeId)) ecarts.push(`module ${m.id} : mode « ${m.modeId} » absent de server/src/core/modes.js`);
  }
  return ecarts;
}
