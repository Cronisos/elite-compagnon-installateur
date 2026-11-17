// Scénarios d'attaque qui préparent des fichiers dans les dossiers TEMPORAIRES du serveur isolé (packs d'avatar, XML des
// couleurs du HUD), ou qui suivent un secret (jeton d'escadron) d'un bout à l'autre. Chacun joue ses requêtes par le
// bilan (bilan.mjs : résultat attendu + contrôles communs) et constate en plus ce que le disque montre : un refus n'a
// rien écrit, un fichier piégé n'est jamais servi.
//
// Garde-fou : avant toute écriture réussie (contrôles positifs), le dossier que le serveur dit utiliser est comparé au
// dossier temporaire du banc ; s'il en sort, le scénario s'arrête net.

import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { GUARD } from '../banc/serveur.mjs';
import { SVG, dataUrl, jpeg, nomsContenant, fichiersContenant, png, versionDe } from './fichiers.mjs';
import { sansPlantage } from './familles.mjs';
import { envoyer } from './http.mjs';

const JSON_ECRIT = { ...GUARD, 'content-type': 'application/json' };
const OK = (texte = '200') => ({ statuts: [200], texte });
const refus = (statuts, message, texte) => ({ statuts, message, texte });
const dans = (racine, p) => {
  const r = path.resolve(racine).toLowerCase();
  const x = path.resolve(String(p || '')).toLowerCase();
  return x === r || x.startsWith(`${r}${path.sep}`);
};
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

function garde(srv, dossier, quoi) {
  if (!dans(srv.dossiers.racine, dossier)) {
    throw new Error(`${quoi} : le serveur isolé utilise ${dossier}, hors de son dossier temporaire (${srv.dossiers.racine}). Scénario arrêté avant toute écriture.`);
  }
}

// --- Packs d'avatar ---

/**
 * Packs piégés déposés dans le dossier des packs du serveur isolé (donnees/compagnon/avatars) : chacun doit être
 * déclaré inutilisable, avec sa raison, et son image ne doit jamais être servie. Un pack valide sert de témoin.
 */
export async function scenarioAvatars(b, srv, M) {
  const F = 'Packs d’avatar refusés';
  const base = '/api/modules/compagnon';
  const dossier = path.join(srv.dossiers.donnees, 'compagnon', 'avatars');
  const notes = [];
  const poser = (pack, fichier, contenu) => {
    fs.mkdirSync(path.join(dossier, pack), { recursive: true });
    if (fichier) fs.writeFileSync(path.join(dossier, pack, fichier), contenu);
  };
  poser('piege-valide', 'neutre.png', png());
  poser('piege-svg', 'neutre.svg', SVG);
  poser('piege-svg-renomme', 'neutre.png', SVG);
  poser('piege-faux-png', 'neutre.png', 'pas une image');
  poser('piege-gros', 'neutre.png', Buffer.concat([png(), Buffer.alloc(4 * 1024 * 1024 + 1)]));
  poser('piege-geant', 'neutre.png', png(30_000, 30_000));
  poser('piege-chemin', 'pack.json', JSON.stringify({ humeurs: { neutre: '../piege-valide/neutre.png' } }));
  poser('piege-cles', 'neutre.png', png());
  poser('piege-cles', 'pack.json', `{"__proto__":{"pollue":"${M}"},"humeurs":{"__proto__":"neutre.png","constructor":"neutre.png"},"nom":{"toString":"${M}"}}`);
  // Dossiers au nom d'une propriété d'objet : jamais listés
  for (const nom of ['constructor', '__proto__', 'toString']) poser(nom, 'neutre.png', png());
  // Pack qui est une jonction (lien de dossier) vers le pack valide : jamais suivi
  const cibleJonction = path.join(srv.dossiers.racine, 'hors-des-packs');
  fs.mkdirSync(cibleJonction, { recursive: true });
  fs.writeFileSync(path.join(cibleJonction, 'neutre.png'), png());
  fs.symlinkSync(cibleJonction, path.join(dossier, 'piege-jonction'), 'junction');
  // Image qui est une jonction vers un dossier
  fs.mkdirSync(path.join(dossier, 'piege-jonction-image'), { recursive: true });
  fs.symlinkSync(cibleJonction, path.join(dossier, 'piege-jonction-image', 'neutre.png'), 'junction');
  // Image qui est un lien dur vers un fichier hors du pack, qui n'est pas une image (fichier de données du banc)
  const horsPack = path.join(srv.dossiers.racine, 'hors-pack.json');
  fs.writeFileSync(horsPack, JSON.stringify({ donnee: M }));
  fs.mkdirSync(path.join(dossier, 'piege-lien-dur'), { recursive: true });
  fs.linkSync(horsPack, path.join(dossier, 'piege-lien-dur', 'neutre.png'));
  // Lien symbolique de fichier : Windows le réserve à l'administrateur (ou au mode développeur)
  let lienFichier = true;
  fs.mkdirSync(path.join(dossier, 'piege-lien'), { recursive: true });
  try {
    fs.symlinkSync(path.join(cibleJonction, 'neutre.png'), path.join(dossier, 'piege-lien', 'neutre.png'), 'file');
  } catch (err) {
    if (err.code !== 'EPERM') throw err;
    lienFichier = false;
    notes.push('lien symbolique de fichier non créable sur ce PC sans droits (Windows) : couvert par la jonction et le lien dur');
  }

  const liste = await b.jouer({ famille: F, nom: 'liste des packs relue', methode: 'GET', chemin: `${base}/packs`, attendu: OK('200 : liste des packs') });
  const packs = new Map((Array.isArray(liste?.json?.packs) ? liste.json.packs : []).map((p) => [p.id, p]));
  garde(srv, liste?.json?.dir, 'Packs d’avatar');
  const temoin = packs.get('piege-valide');
  b.constat(F, 'pack témoin (PNG valide)', 'pack utilisable (le contrôle voit bien les packs déposés)', temoin?.ok === true ? null : `pack ${temoin ? 'inutilisable' : 'absent'} ${JSON.stringify(temoin?.errors || [])}`);

  const refuses = [
    ['piege-svg', /SVG refusé/, 'SVG'],
    ['piege-svg-renomme', /n'est pas une image PNG, WebP ou GIF/, 'SVG renommé en .png'],
    ['piege-faux-png', /n'est pas une image PNG, WebP ou GIF/, 'faux PNG (texte)'],
    ['piege-gros', /4 Mo au plus/, 'fichier au-delà de 4 Mo'],
    ['piege-geant', /px de côté au plus/, 'PNG de 30 000 × 30 000 px'],
    ['piege-chemin', /nom de fichier invalide/, 'pack.json qui pointe hors du pack (../)'],
    ['piege-jonction-image', /Aucune image d’humeur utilisable/, 'image qui est une jonction'],
    ['piege-lien-dur', /n'est pas une image PNG, WebP ou GIF/, 'lien dur vers un fichier qui n’est pas une image'],
    ...(lienFichier ? [['piege-lien', /Aucune image d’humeur utilisable/, 'lien symbolique de fichier']] : []),
  ];
  for (const [id, raison, nom] of refuses) {
    const p = packs.get(id);
    const erreurs = Array.isArray(p?.errors) ? p.errors.join(' | ') : '';
    b.constat(F, nom, 'pack inutilisable, avec la raison', !p ? 'pack absent de la liste' : p.ok ? `pack déclaré utilisable (${erreurs})` : raison.test(erreurs) ? null : `raison inattendue : ${erreurs.slice(0, 200)}`);
    await b.jouer({ famille: F, nom: `${nom} : image jamais servie`, methode: 'GET', chemin: `${base}/avatars/${id}/neutre`, attendu: refus([404], null, '404 : image jamais servie') });
  }
  for (const id of ['piege-jonction', 'constructor', '__proto__', 'toString']) {
    b.constat(F, `dossier « ${id} »`, 'jamais listé', packs.has(id) ? 'listé' : null);
    await b.jouer({ famille: F, nom: `${id} : image jamais servie`, methode: 'GET', chemin: `${base}/avatars/${encodeURIComponent(id)}/neutre`, attendu: refus([404], null, '404 : image jamais servie') });
    await b.jouer({ famille: F, nom: `${id} : pack introuvable`, methode: 'GET', chemin: `${base}/packs/${encodeURIComponent(id)}`, attendu: refus([404], /Pack introuvable/, '404 « Pack introuvable. »') });
  }
  const cles = packs.get('piege-cles');
  b.constat(F, 'pack.json aux clés __proto__ et constructor', 'clés signalées comme humeurs inconnues, image neutre gardée', cles?.ok === true && /Humeur inconnue/.test((cles.errors || []).join(' ')) ? null : JSON.stringify(cles || null).slice(0, 200));
  await b.jouer({ famille: F, nom: 'pack témoin servi', methode: 'GET', chemin: `${base}/avatars/piege-valide/neutre`, attendu: { statuts: [200], texte: '200 image/png (avec sandbox et nosniff)', verifier: (r) => (/^image\/png/.test(r.entetes['content-type'] || '') ? null : `type ${r.entetes['content-type']}`) } });

  // Choisir un pack refusé : 400, réglages inchangés
  const reglages = path.join(srv.dossiers.donnees, 'compagnon.json');
  const avant = fs.existsSync(reglages) ? fs.readFileSync(reglages) : null;
  for (const id of ['piege-svg', 'piege-gros', 'piege-jonction', 'constructor', '__proto__', '../piege-valide']) {
    await b.jouer({ famille: F, nom: `choisir « ${id} »`, methode: 'PUT', chemin: `${base}/settings`, entetes: JSON_ECRIT, corps: JSON.stringify({ pack: id }), attendu: refus([400], /introuvable ou inutilisable/, '400 « Pack d’avatar introuvable ou inutilisable. »') });
  }
  const apres = fs.existsSync(reglages) ? fs.readFileSync(reglages) : null;
  b.constat(F, 'réglages du compagnon après les refus', 'fichier inchangé', (avant == null ? apres == null : apres?.equals(avant)) ? null : 'fichier modifié');
  return notes;
}

// --- Couleurs du HUD ---

/**
 * XML piégés posés dans le dossier d'options TEMPORAIRE du serveur isolé : le module doit refuser d'y toucher (raison
 * dite, fichier inchangé, aucune sauvegarde). Puis les écritures sans confirmation, et un contrôle positif.
 */
export async function scenarioCouleurs(b, srv, M, { optionsReelles } = {}) {
  const FX = 'XML des couleurs du HUD refusé';
  const FM = 'Matrice des couleurs refusée';
  const FC = 'Couleurs sans confirmation refusées';
  const base = '/api/modules/hudcolours';
  const dir = path.join(srv.dossiers.options, 'Graphics');
  const fichier = path.join(dir, 'GraphicsConfigurationOverride.xml');
  const original = fs.readFileSync(fichier);
  const sauvegardes = () => fs.readdirSync(dir).filter((n) => /\.bak$/i.test(n)).sort();
  const reelAvant = optionsReelles ? empreinteReelle(optionsReelles) : null;

  const etat0 = await b.jouer({ famille: FX, nom: 'état du fichier de test', methode: 'GET', chemin: `${base}/state`, attendu: OK() });
  garde(srv, etat0?.json?.path, 'Couleurs du HUD');
  const matrice = { red: [0, 0, 1], green: [0, 1, 0], blue: [1, 0, 0] };
  const ecrire = (route, corps) => ({ methode: 'POST', chemin: `${base}/${route}`, entetes: JSON_ECRIT, corps: typeof corps === 'string' ? corps : JSON.stringify(corps) });
  /** Joue une écriture qui doit être refusée, puis vérifie que ni le fichier ni les sauvegardes n'ont bougé. */
  const refusee = async (famille, nom, route, corps, attendu, contenu) => {
    const bak = sauvegardes().join('|');
    await b.jouer({ famille, nom, ...ecrire(route, corps), attendu });
    const maintenant = fs.readFileSync(fichier);
    b.constat(famille, `${nom} : rien d'écrit`, 'fichier inchangé, aucune sauvegarde', !maintenant.equals(contenu) ? 'fichier modifié' : sauvegardes().join('|') !== bak ? 'sauvegarde créée' : null);
  };

  // Fichiers piégés
  const MAX = 1024 * 1024;
  const xml = (corps) => Buffer.from(`<?xml version="1.0" encoding="UTF-8" ?>\r\n${corps}\r\n`, 'utf8');
  const gros = (() => {
    const tete = '<?xml version="1.0" encoding="UTF-8" ?>\r\n<GraphicsConfig>\r\n<!-- ';
    const fin = ' -->\r\n</GraphicsConfig>\r\n';
    return Buffer.from(tete + 'x'.repeat(MAX + 1 - tete.length - fin.length) + fin, 'utf8');
  })();
  const pieges = [
    ['DOCTYPE avec une entité interne déclarée', xml('<!DOCTYPE GraphicsConfig [<!ENTITY e "1">]>\r\n<GraphicsConfig />'), 200, /DOCTYPE/],
    ['DOCTYPE sans sous-ensemble', xml('<!DOCTYPE GraphicsConfig>\r\n<GraphicsConfig />'), 200, /DOCTYPE/],
    ['référence à une entité non déclarée', xml('<GraphicsConfig>\r\n  <Planets>&e;</Planets>\r\n</GraphicsConfig>'), 200, /entité/],
    ['fichier au-delà de la limite (1 Mo + 1 octet)', gros, 409, /trop gros/],
    ['fichier qui n’est pas en UTF-8', Buffer.concat([xml('<GraphicsConfig>\r\n<!-- '), Buffer.from([0xff, 0xfe]), Buffer.from(' -->\r\n</GraphicsConfig>\r\n')]), 200, /UTF-8/],
    ['racine inattendue', xml('<Autre />'), 200, /racine/],
  ];
  for (const [nom, contenu, statutEtat, raison] of pieges) {
    fs.writeFileSync(fichier, contenu);
    const version = versionDe(contenu);
    const e = await b.jouer({
      famille: FX,
      nom: `${nom} : état`,
      methode: 'GET',
      chemin: `${base}/state`,
      attendu: statutEtat === 200
        ? { statuts: [200], texte: 'état lu, fichier déclaré illisible (matrice inconnue), raison dite', verifier: (r) => (r.json?.error && raison.test(r.json.error) && r.json.matrix === null ? null : `erreur « ${r.json?.error} », matrice ${JSON.stringify(r.json?.matrix)}`) }
        : refus([409], raison, '409 avec la raison'),
    });
    if (statutEtat === 200 && e?.json?.version && e.json.version !== version) b.constat(FX, `${nom} : version`, 'version calculée comme le module', `${e.json.version} ≠ ${version}`);
    await refusee(FX, `${nom} : appliquer`, 'apply', { matrix: matrice, version, confirm: true }, refus([409], raison, '409 : l’app n’y touche pas'), contenu);
    await refusee(FX, `${nom} : orange d’origine`, 'reset', { version, confirm: true }, refus([409], raison, '409 : l’app n’y touche pas'), contenu);
  }

  // Matrice NaN dans une sauvegarde : jamais restaurée
  fs.writeFileSync(fichier, original);
  const bakNaN = 'GraphicsConfigurationOverride.xml.piege-nan.bak';
  fs.writeFileSync(path.join(dir, bakNaN), xml('<GraphicsConfig>\r\n  <GUIColour>\r\n    <Default>\r\n      <LocalisationName>Standard</LocalisationName>\r\n      <MatrixRed>NaN, 0, 0</MatrixRed>\r\n      <MatrixGreen>0, 1, 0</MatrixGreen>\r\n      <MatrixBlue>0, 0, 1</MatrixBlue>\r\n    </Default>\r\n  </GUIColour>\r\n</GraphicsConfig>'));
  const v0 = versionDe(original);
  await refusee(FM, 'restaurer une sauvegarde à la matrice NaN', 'restore', { name: bakNaN, version: v0, confirm: true }, refus([409], /Sauvegarde illisible/, '409 « Sauvegarde illisible »'), original);
  for (const [nom, valeur, statut, message] of [
    ['remonter hors du dossier (../)', '../GraphicsConfigurationOverride.xml.x.bak', [400], /Sauvegarde inconnue/],
    ['chemin piégé dans le nom', `GraphicsConfigurationOverride.xml.\\..\\..\\${M}.bak`, [404], /introuvable/],
    ['sauvegarde inexistante', `GraphicsConfigurationOverride.xml.${M}.bak`, [404], /introuvable/],
    ['nom « constructor »', 'constructor', [400], /Sauvegarde inconnue/],
    ['nom « __proto__ »', '__proto__', [400], /Sauvegarde inconnue/],
    ['nom qui n’est pas un texte', ['GraphicsConfigurationOverride.xml.x.bak'], [400], /Sauvegarde inconnue/],
  ]) {
    await refusee(FM, `restaurer : ${nom}`, 'restore', { name: valeur, version: v0, confirm: true }, refus(statut, message, `${statut.join('/')} avec la raison`), original);
  }

  // Matrices reçues : NaN, infinis, hors bornes, mal formées
  const ligne = (red) => `{"matrix":{"red":${red},"green":[0,1,0],"blue":[0,0,1]},"version":"${v0}","confirm":true}`;
  for (const [nom, corps] of [
    ['NaN en texte', ligne('["NaN",0,0]')],
    ['null', ligne('[null,0,0]')],
    ['1e999 (infini)', ligne('[1e999,0,0]')],
    ['-1e999', ligne('[-1e999,0,0]')],
    ['hors bornes (3,5)', ligne('[3.5,0,0]')],
    ['deux nombres', ligne('[1,0]')],
    ['quatre nombres', ligne('[1,0,0,0]')],
    ['tableaux imbriqués', ligne('[[1],0,0]')],
    ['texte « 1, 0, 0 »', ligne('"1, 0, 0"')],
    ['objet', ligne('{"0":1,"1":0,"2":0,"length":3}')],
    ['ligne sous __proto__', `{"matrix":{"__proto__":{"red":[1,0,0]},"green":[0,1,0],"blue":[0,0,1]},"version":"${v0}","confirm":true}`],
    ['matrice tableau', `{"matrix":[[1,0,0],[0,1,0],[0,0,1]],"version":"${v0}","confirm":true}`],
    ['matrice absente', `{"version":"${v0}","confirm":true}`],
  ]) {
    await refusee(FM, `matrice ${nom}`, 'apply', corps, refus([400], /(nombre|Matrice|il faut 3)/, '400 avec la raison'), original);
  }

  // Sans confirmation : jamais d'écriture
  for (const [nom, confirm] of [['sans confirmation', undefined], ['confirm: false', false], ['confirm: "true"', 'true'], ['confirm: 1', 1], ['confirm: null', null], ['confirm: [true]', [true]], ['confirm: {}', {}]]) {
    const avec = confirm === undefined ? {} : { confirm };
    await refusee(FC, `appliquer, ${nom}`, 'apply', { matrix: matrice, version: v0, ...avec }, refus([400], /Confirmation requise/, '400 « Confirmation requise »'), original);
    await refusee(FC, `orange d’origine, ${nom}`, 'reset', { version: v0, ...avec }, refus([400], /Confirmation requise/, '400 « Confirmation requise »'), original);
    await refusee(FC, `restaurer, ${nom}`, 'restore', { name: bakNaN, version: v0, ...avec }, refus([400], /Confirmation requise/, '400 « Confirmation requise »'), original);
  }
  await refusee(FC, 'version périmée', 'apply', { matrix: matrice, version: '0000000000000000', confirm: true }, refus([409], /a changé/, '409 « Le fichier a changé »'), original);
  await refusee(FC, 'version absente', 'apply', { matrix: matrice, confirm: true }, refus([400], /Version du fichier manquante/, '400 « Version du fichier manquante »'), original);

  // Contrôle positif, dans le dossier temporaire : avec confirmation et version, le fichier change et une sauvegarde est faite
  const bak = sauvegardes();
  const r = await b.jouer({ famille: FC, nom: 'avec confirmation (témoin, dossier temporaire)', ...ecrire('apply', { matrix: matrice, version: v0, confirm: true }), attendu: { statuts: [200], texte: '200, fichier modifié et sauvegardé', verifier: (x) => (x.json?.result?.changed === true && x.json?.result?.backup ? null : JSON.stringify(x.json?.result)) } });
  const nouveau = fs.readFileSync(fichier);
  b.constat(FC, 'témoin : écriture faite dans le dossier temporaire', 'fichier modifié, une sauvegarde de plus', nouveau.equals(original) ? 'fichier inchangé' : sauvegardes().length !== bak.length + 1 ? `${sauvegardes().length - bak.length} sauvegarde(s) de plus` : null);
  if (r?.json?.state?.path) garde(srv, r.json.state.path, 'Couleurs du HUD');

  // Horloge qui a reculé (heure d'hiver, heure corrigée, double démarrage) : 10 copies de l'app au nom plus tardif que
  // l'heure actuelle. La copie faite à cette écriture ne doit jamais être effacée par le ménage qui la suit.
  const FH = 'Copie faite avant chaque écriture des couleurs';
  const futures = Array.from({ length: 10 }, (_, i) => `GraphicsConfigurationOverride.xml.elite-compagnon-2099-01-01_00-00-0${i}.bak`);
  for (const n of futures) fs.writeFileSync(path.join(dir, n), original);
  const avantEcriture = fs.readFileSync(fichier);
  const etat = await b.jouer({ famille: FH, nom: 'état avant l’écriture', methode: 'GET', chemin: `${base}/state`, attendu: OK() });
  const ecrite = await b.jouer({
    famille: FH,
    nom: 'horloge qui a reculé : écriture avec 10 copies de l’app au nom plus tardif',
    ...ecrire('apply', { matrix: { red: [0.5, 0.2, 0.1], green: [0, 1, 0], blue: [0, 0, 1] }, version: etat?.json?.version, confirm: true }),
    attendu: { statuts: [200], texte: '200, copie annoncée', verifier: (x) => (x.json?.result?.changed === true && x.json?.result?.backup ? null : JSON.stringify(x.json?.result)) },
  });
  const annoncee = ecrite?.json?.result?.backup ? path.join(dir, path.basename(ecrite.json.result.backup)) : null;
  b.constat(FH, 'horloge qui a reculé : la copie annoncée', 'présente sur le disque, avec le fichier d’avant l’écriture',
    !annoncee || !fs.existsSync(annoncee) ? `copie ${ecrite?.json?.result?.backup} absente : effacée par le ménage` : !fs.readFileSync(annoncee).equals(avantEcriture) ? 'copie différente du fichier d’avant' : null);
  const copiesApp = fs.readdirSync(dir).filter((n) => n.includes('.elite-compagnon-') && n.endsWith('.bak')).length;
  b.constat(FH, 'horloge qui a reculé : ménage', '10 copies de l’app au plus', copiesApp > 10 ? `${copiesApp} copies` : null);
  for (const n of futures) fs.rmSync(path.join(dir, n), { force: true });

  if (optionsReelles) {
    const reelApres = empreinteReelle(optionsReelles);
    b.constat(FC, 'options du jeu réelles (lues seulement)', 'fichier et dossier du jeu inchangés', reelApres === reelAvant ? null : 'changement dans le dossier Options\\Graphics du jeu');
  }
  fs.rmSync(path.join(dir, bakNaN), { force: true });
}

/** Empreinte du dossier Graphics réel du jeu (noms, tailles, dates ; rien n'y est ouvert en écriture). */
function empreinteReelle(dossier) {
  try {
    return fs.readdirSync(dossier).sort().map((n) => {
      const st = fs.statSync(path.join(dossier, n));
      return `${n}:${st.size}:${st.mtimeMs}`;
    }).join('|');
  } catch {
    return 'absent';
  }
}

// --- Textes pour Discord ---

/**
 * Nom de build piégé (reçu par un lien EDSY partagé) : le texte « Copier pour Discord » rendu par le serveur ne
 * mentionne personne, ne mentionne aucun rôle et n'affiche aucun lien masqué autre que celui d'EDSY fait par l'app.
 * Les autres textes pour Discord (calculateur de routes, « Où agir », routes, repères) sont faits dans l'interface et
 * testés avec elle (client/src/core/discord.test.js et les tests de chaque module).
 */
export async function scenarioTextesDiscord(b) {
  const F = 'Textes pour Discord neutralisés';
  const base = '/api/modules/builder';
  const notes = [];
  const PIEGE = '@everyone [EDSY](https://exemple.invalid/) <@&123456789012345678> @here';
  const statut = await b.jouer({ famille: F, nom: 'constructeur de builds : état', methode: 'GET', chemin: `${base}/status`, attendu: OK() });
  if (!statut?.json?.ready) {
    notes.push(`constructeur de builds non prêt (${statut?.json?.message || 'données de référence absentes'}) : texte Discord du build non essayé`);
    return notes;
  }
  const vaisseaux = await b.jouer({ famille: F, nom: 'constructeur de builds : vaisseaux', methode: 'GET', chemin: `${base}/ships`, attendu: OK() });
  const shipId = vaisseaux?.json?.[0]?.id;
  const depart = await b.jouer({ famille: F, nom: 'build de départ', methode: 'POST', chemin: `${base}/start`, entetes: JSON_ECRIT, corps: JSON.stringify({ shipId }), attendu: OK() });
  const dangers = (s) => {
    const vus = [];
    if (/@(everyone|here)\b/.test(s)) vus.push('mention de tout le monde');
    if (/<@&?!?\d/.test(s)) vus.push('mention d’un rôle ou d’un membre');
    const liens = [...s.matchAll(/(^|[^\\])\[[^\]]*\]\(([^)]*)\)/g)].map((m) => m[2]);
    if (liens.length !== 1 || !/^https:\/\/edsy\.org\/#\/L=/.test(liens[0])) vus.push(`liens masqués : ${JSON.stringify(liens)}`);
    if (/exemple\.invalid/.test(s) && /https?:\/\/exemple/.test(s)) vus.push('adresse piégée cliquable');
    return vus.join(', ') || null;
  };
  await b.jouer({
    famille: F,
    nom: 'nom de build piégé : texte « Copier pour Discord »',
    methode: 'POST',
    chemin: `${base}/stats`,
    entetes: JSON_ECRIT,
    corps: JSON.stringify({ ...(depart?.json?.build || { shipId }), name: PIEGE }),
    attendu: { statuts: [200], texte: 'ni mention, ni rôle, ni autre lien masqué que celui d’EDSY', verifier: (r) => (typeof r.json?.share === 'string' ? dangers(r.json.share) : 'aucun texte de partage') },
  });
  return notes;
}

// --- Images de vaisseau ---

/** Images envoyées pour un vaisseau : contenu, type et nom de vaisseau vérifiés ; rien n'est écrit sur un refus. */
export async function scenarioImagesVaisseau(b, srv, M) {
  const F = 'Images de vaisseau refusées';
  const base = '/api/modules/engineering';
  const images = path.join(srv.dossiers.donnees, 'images');
  const liste = await b.jouer({ famille: F, nom: 'liste des vaisseaux', methode: 'GET', chemin: `${base}/ships`, attendu: OK() });
  const cles = (Array.isArray(liste?.json) ? liste.json : []).map((s) => s.key).filter((k) => typeof k === 'string');
  if (!cles.length) {
    b.constat(F, 'liste des vaisseaux', 'au moins un vaisseau (données de référence)', 'aucun vaisseau');
    return;
  }
  const cle = cles.includes('adder') ? 'adder' : cles[0];
  const contenu = () => (fs.existsSync(images) ? fs.readdirSync(images).sort().join('|') : '');
  const envoyer = async (nom, k, corps, attendu) => {
    const avant = contenu();
    await b.jouer({ famille: F, nom, methode: 'POST', chemin: `${base}/ships/${encodeURIComponent(k)}/image`, entetes: JSON_ECRIT, corps: typeof corps === 'string' ? corps : JSON.stringify(corps), attendu });
    b.constat(F, `${nom} : rien d'écrit`, 'dossier des images inchangé', contenu() === avant ? null : `dossier : ${contenu()}`);
  };
  const invalide = refus([400], /Image invalide|image/i, '400 « Image invalide » avec la raison');
  await envoyer('faux PNG (texte)', cle, { dataUrl: dataUrl('image/png', 'pas une image') }, invalide);
  await envoyer('SVG déclaré PNG', cle, { dataUrl: dataUrl('image/png', SVG) }, invalide);
  await envoyer('SVG déclaré tel quel', cle, { dataUrl: dataUrl('image/svg+xml', SVG) }, invalide);
  await envoyer('JPEG déclaré PNG', cle, { dataUrl: dataUrl('image/png', jpeg()) }, invalide);
  await envoyer('PNG déclaré JPEG', cle, { dataUrl: dataUrl('image/jpeg', png()) }, invalide);
  await envoyer('PNG de 30 000 × 30 000 px', cle, { dataUrl: dataUrl('image/png', png(30_000, 30_000)) }, invalide);
  await envoyer('base64 invalide', cle, { dataUrl: 'data:image/png;base64,!!!!' }, invalide);
  await envoyer('base64 vide', cle, { dataUrl: 'data:image/png;base64,' }, invalide);
  await envoyer('adresse qui n’est pas un texte', cle, { dataUrl: [dataUrl('image/png', png())] }, invalide);
  await envoyer('sans adresse', cle, {}, invalide);
  const vaisseau = refus([400, 404], /Vaisseau/, '400/404 « Vaisseau invalide ou inconnu »');
  for (const k of ['nul', 'con', 'com1', 'lpt1', 'aux', 'prn', 'conin', `piege_${M}`, 'constructor', '__proto__', 'tostring']) {
    await envoyer(`PNG valide pour le vaisseau « ${k} »`, k, { dataUrl: dataUrl('image/png', png()) }, vaisseau);
  }
  b.constat(F, 'noms piégés', 'aucun fichier à leur nom', nomsContenant(srv.dossiers.racine, `piege_${M}`).length ? 'fichier créé' : null);

  // Témoin : un vrai PNG pour un vrai vaisseau est accepté, puis servi avec sandbox et nosniff
  await b.jouer({ famille: F, nom: `PNG valide pour « ${cle} » (témoin)`, methode: 'POST', chemin: `${base}/ships/${cle}/image`, entetes: JSON_ECRIT, corps: JSON.stringify({ dataUrl: dataUrl('image/png', png()) }), attendu: OK() });
  b.constat(F, 'témoin : image enregistrée', `images/${cle}.png`, fs.existsSync(path.join(images, `${cle}.png`)) ? null : 'absente');
  await b.jouer({ famille: F, nom: 'témoin servi', methode: 'GET', chemin: `${base}/ships/${cle}/image`, attendu: { statuts: [200], texte: '200 image/png', verifier: (r) => (/^image\/png/.test(r.entetes['content-type'] || '') ? null : `type ${r.entetes['content-type']}`) } });
  // Dessins de référence (SVG) : tous servis avec sandbox et nosniff (contrôles communs)
  let svg = 0;
  for (const k of cles.filter((x) => x !== cle)) {
    const r = await b.jouer({ famille: F, nom: `dessin de référence ${k}`, methode: 'GET', chemin: `${base}/ships/${k}/image`, attendu: { statuts: [200, 404], texte: 'dessin servi (200) ou absent (404)' } });
    if (/svg/.test(r?.entetes?.['content-type'] || '')) svg += 1;
  }
  b.constat(F, 'dessins SVG de référence', 'au moins un servi (contrôle des en-têtes)', svg ? null : 'aucun');
}

// --- Jeton d'escadron ---

/**
 * Jeton synthétique au format attendu (43 caractères base64url), tiré au hasard à chaque lancement et sans rien de
 * commun avec le marqueur des chemins piégés : un nom de repère contenant le marqueur ne ressemble jamais au jeton.
 */
export const jetonAuHasard = () => crypto.randomBytes(32).toString('base64url');

/**
 * Le jeton d'escadron enregistré n'est jamais renvoyé en clair (le bilan fouille chaque réponse dès que `secrets` le
 * contient), ni écrit ailleurs que dans son fichier, ni dans la sortie du serveur ; le réseau étant coupé, les envois
 * échouent proprement.
 */
export async function scenarioJeton(b, srv, jeton, { routes, sortie }) {
  const F = 'Jeton d’escadron';
  const base = '/api/modules/escadron';
  const fichierJeton = path.join(srv.dossiers.donnees, 'escadron-jeton.json');
  const vue = (r) => r?.json || {};
  // App neuve : aucun serveur d'escadron par défaut, un jeton sans serveur est refusé ; puis le serveur de l'escadron
  // du banc est réglé (nom public fictif : le réseau est coupé, rien ne part)
  await b.jouer({ famille: F, nom: 'jeton sans serveur réglé', methode: 'PUT', chemin: `${base}/token`, entetes: JSON_ECRIT, corps: JSON.stringify({ token: jeton }), attendu: { statuts: [409], texte: '409 : règle d’abord le serveur de ton escadron' } });
  await b.jouer({ famille: F, nom: 'régler le serveur de l’escadron', methode: 'PUT', chemin: `${base}/worker`, entetes: JSON_ECRIT, corps: JSON.stringify({ url: 'https://escadron-du-banc.workers.dev' }), attendu: { statuts: [200], texte: '200' } });
  const r1 = await b.jouer({ famille: F, nom: 'enregistrer le jeton', methode: 'PUT', chemin: `${base}/token`, entetes: JSON_ECRIT, corps: JSON.stringify({ token: jeton }), attendu: { statuts: [200], texte: '200, jeton masqué', verifier: (r) => (r.json?.hasToken === true && r.json?.token === `••••••••${jeton.slice(-4)}` ? null : `vue ${JSON.stringify({ hasToken: r.json?.hasToken, token: r.json?.token })}`) } });
  if (!r1) return;
  for (const [nom, valeur] of [['44 caractères', `${jeton}x`], ['précédé de « Bearer »', `Bearer ${jeton}`], ['dans un tableau', [jeton]], ['dans un objet', { toString: jeton }], ['nombre', 12345], ['vide', '']]) {
    await b.jouer({ famille: F, nom: `jeton refusé : ${nom}`, methode: 'PUT', chemin: `${base}/token`, entetes: JSON_ECRIT, corps: JSON.stringify({ token: valeur }), attendu: refus([400], /^Jeton invalide/, '400 « Jeton invalide », sans le répéter') });
  }
  const st = await b.jouer({ famille: F, nom: 'jeton gardé après les refus', methode: 'GET', chemin: `${base}/status`, attendu: { statuts: [200], texte: 'le jeton enregistré reste le premier', verifier: (r) => (vue(r).token === `••••••••${jeton.slice(-4)}` ? null : `jeton ${vue(r).token}`) } });
  void st;
  // Envoi activé, réseau coupé : l'essai échoue proprement, sans jamais montrer le jeton
  await b.jouer({ famille: F, nom: 'activer l’envoi', methode: 'PUT', chemin: `${base}/config`, entetes: JSON_ECRIT, corps: JSON.stringify({ enabled: true, since: 'max' }), attendu: OK() });
  await b.jouer({ famille: F, nom: 'réessayer maintenant (réseau coupé)', methode: 'POST', chemin: `${base}/retry`, entetes: JSON_ECRIT, corps: '{}', attendu: OK() });
  await attendre(1500);
  // Toutes les lectures, jeton enregistré : aucune ne le renvoie (le bilan fouille chaque réponse)
  for (const r of routes.filter((x) => x.methode === 'GET' && !x.params.length && !x.chemin.endsWith('/stream'))) {
    await b.jouer({ famille: F, nom: 'lecture, jeton enregistré', methode: 'GET', chemin: r.chemin, attendu: { statuts: sansPlantage, texte: 'réponse sans le jeton (et sans erreur serveur)' } });
  }
  const fichiers = fichiersContenant(srv.dossiers.racine, jeton);
  const attendu = path.relative(srv.dossiers.racine, fichierJeton).replace(/\\/g, '/');
  b.constat(F, 'fichiers qui contiennent le jeton', `seulement ${attendu}`, fichiers.length === 1 && fichiers[0] === attendu ? null : `[${fichiers.join(', ')}]`);
  b.constat(F, 'sortie du serveur', 'jamais le jeton', sortie().some((l) => l.includes(jeton) || l.includes(jeton.slice(0, 16))) ? 'jeton écrit dans la sortie' : null);
  // Effacer : le fichier disparaît
  await b.jouer({ famille: F, nom: 'effacer le jeton', methode: 'DELETE', chemin: `${base}/token`, entetes: JSON_ECRIT, attendu: { statuts: [200], texte: '200, plus de jeton', verifier: (r) => (r.json?.hasToken === false ? null : `hasToken ${r.json?.hasToken}`) } });
  b.constat(F, 'fichier du jeton après effacement', 'absent', fs.existsSync(fichierJeton) ? 'toujours là' : null);
  b.constat(F, 'jeton après effacement', 'dans aucun fichier', fichiersContenant(srv.dossiers.racine, jeton).length ? 'encore écrit quelque part' : null);
}

/** Réseau coupé : chaque lecture et chaque service extérieur répond sans planter (503 lisible au pire). */
export async function scenarioReseau(b, routes) {
  const F = 'Réseau coupé';
  const attendu = { statuts: sansPlantage, texte: 'réponse sans erreur serveur (502, 503 ou 504 lisible si un service extérieur est coupé)' };
  for (const r of routes.filter((x) => x.methode === 'GET' && !x.chemin.endsWith('/stream'))) {
    await b.jouer({ famille: F, nom: 'lecture', methode: 'GET', chemin: r.chemin.replace(/:(\w+)/g, '1'), attendu });
  }
  // Services extérieurs déclenchés par une écriture
  for (const chemin of ['/api/modules/engineering/reference/update', '/api/modules/escadron/retry']) {
    await b.jouer({ famille: F, nom: 'service extérieur', methode: 'POST', chemin, entetes: JSON_ECRIT, corps: '{}', attendu });
  }
}

export const dossierOptionsReelles = () => path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Frontier Developments', 'Elite Dangerous', 'Options', 'Graphics');

// --- Écriture ratée dans une minuterie (balayage de l'EEP, dernier coin de minage) ---

const PLANETE = 'Banc Testeur 1 a';
const BALAYAGE = { center: { latitude: 10, longitude: 20, body: PLANETE, system: 'Banc Testeur', planetRadius: 1_000_000 }, radius: null, direction: 1, startedAt: '2026-11-07T09:30:00.000Z', trail: [], covered: null };
// Bibliothèque des EEP balayés (waypoints/eeps.js) : un EEP au centre marqué, le bord pas encore
const EEPS = { version: 1, actif: null, eeps: [{ id: '00000000-0000-4000-8000-000000000001', nom: null, numero: null, createdAt: BALAYAGE.startedAt, updatedAt: BALAYAGE.startedAt, ...BALAYAGE }] };
const COIN = { [PLANETE]: { body: PLANETE, latitude: 9.99, longitude: 19.99, site: null, at: '2026-11-07T09:00:00.000Z' } };
/**
 * Posés avant le démarrage : un balayage (centre marqué : le SRV qui roule autour enregistre sa trace 10 s plus tard)
 * et un dernier coin de minage (réécrit 10 s après une tonne raffinée en SRV).
 */
export function poserBalayage(dossiers) {
  fs.mkdirSync(dossiers.donnees, { recursive: true });
  fs.writeFileSync(path.join(dossiers.donnees, 'eeps.json'), JSON.stringify(EEPS));
  fs.writeFileSync(path.join(dossiers.donnees, 'last-mining.json'), JSON.stringify(COIN));
}

/**
 * eeps.json (EEP balayés) et last-mining.json en lecture seule (sauvegarde restaurée, antivirus, disque plein), puis le SRV roule et
 * raffine une tonne : chaque écriture différée échoue dans sa minuterie. Avant, l'erreur du balayage n'était rattrapée
 * par rien et arrêtait tout le serveur (et celle du coin de minage passait sous silence). Il doit rester en vie, dire
 * chaque échec dans sa console, et ne rien écrire d'autre.
 */
export async function scenarioMinuterie(b, srv, { sortie }) {
  const F = 'Écriture ratée dans une minuterie';
  const fichiers = ['eeps.json', 'last-mining.json'].map((n) => path.join(srv.dossiers.donnees, n));
  const avant = fichiers.map((f) => fs.readFileSync(f, 'utf8'));
  const journal = fs.readdirSync(srv.dossiers.journaux).filter((n) => /^Journal\..*\.log$/.test(n)).sort().at(-1);
  if (!journal) throw new Error('Écriture ratée dans une minuterie : aucun journal dans le dossier du banc (séance absente).');
  const lignesAvant = sortie().length;
  for (const f of fichiers) fs.chmodSync(f, 0o444);
  try {
    // Dans le SRV (Flags : vaisseau absent, SRV), à 100 m du centre, sur la planète du balayage
    const status = { timestamp: '2026-11-07T09:31:00Z', event: 'Status', Flags: 1 << 26, Flags2: 0, Latitude: 10.0009, Longitude: 20.0001, Altitude: 0, Heading: 90, BodyName: PLANETE, PlanetRadius: 1_000_000 };
    fs.writeFileSync(path.join(srv.dossiers.journaux, 'Status.json'), JSON.stringify(status));
    await attendre(1500); // position lue (le lecteur passe toutes les 500 ms), puis une tonne raffinée sur place
    const tonne = { timestamp: srv.maintenant, event: 'MiningRefined', Type: '$platinum_name;', Type_Localised: 'Platine' };
    fs.appendFileSync(path.join(srv.dossiers.journaux, journal), `${JSON.stringify(tonne)}\r\n`);
    await attendre(12_000); // chaque écriture attend 10 s
    await b.jouer({ famille: F, nom: 'serveur toujours là après les écritures ratées', methode: 'GET', chemin: '/api/state', attendu: OK('200 : le serveur répond encore'), delaiMs: 10_000 });
  } finally {
    for (const f of fichiers) fs.chmodSync(f, 0o644);
  }
  const lues = sortie().slice(lignesAvant);
  for (const [i, [quoi, ligne]] of [['balayage', 'EEP balayés : non enregistré'], ['dernier coin de minage', 'Dernier coin de minage : non enregistré']].entries()) {
    b.constat(F, `${quoi} sur le disque`, 'inchangé (lecture seule)', fs.readFileSync(fichiers[i], 'utf8') === avant[i] ? null : 'modifié');
    b.constat(F, `console du serveur (${quoi})`, 'l’échec y est écrit', lues.some((l) => l.includes(ligne)) ? null : `aucune ligne « ${ligne} »`);
  }
  b.constat(F, 'console du serveur', 'aucune erreur imprévue', lues.filter((l) => /Erreur imprévue|Promesse rejetée sans traitement/.test(l)).join(' ; ') || null);
}

// --- Journal piégé : lignes que le jeu n'écrit pas, au milieu d'un lot ---

/**
 * Le jeu (ou un autre outil, un journal recopié, un format changé) écrit d'un coup, dans le journal suivi : un Loadout
 * sans ShipID, une ligne JSON qui n'est pas un objet (« null », un tableau, un nombre), puis un saut et un amarrage
 * ordinaires. Avant, l'exception d'un module (flotte de l'ingénierie) ou du lecteur lui-même faisait perdre le reste du
 * lot à TOUS les modules, sans un mot, et l'erreur restait affichée ; au démarrage suivant, le serveur ne démarrait plus.
 * Attendu : le saut et l'amarrage reçus (état du jeu, derniers événements), aucune erreur du journal, aucune erreur
 * imprévue, la flotte lisible (ingénierie, constructeur de builds), et un serveur qui DÉMARRE sur ce même journal relu
 * comme historique (`demarrer` : demarrerServeur du banc, passé par le contrôleur).
 */
export async function scenarioJournalPiege(b, srv, { sortie, demarrer }) {
  const F = 'Journal piégé (lignes que le jeu n’écrit pas)';
  const journal = fs.readdirSync(srv.dossiers.journaux).filter((n) => /^Journal\..*\.log$/.test(n)).sort().at(-1);
  if (!journal) throw new Error(`${F} : aucun journal dans le dossier du banc (séance absente).`);
  const lignesAvant = sortie().length;
  const t = Date.parse(srv.maintenant);
  const heure = (s) => new Date(t + s * 1000).toISOString().replace('.000Z', 'Z');
  const lot = [
    JSON.stringify({ timestamp: heure(1), event: 'Loadout', Ship: 'cutter', ShipName: 'Sans identifiant', Modules: [] }),
    'null',
    '[1,2,3]',
    '42',
    JSON.stringify({ timestamp: heure(2), event: 'Loadout', ShipID: 'pas un nombre', Ship: 'cutter', Modules: 'pas une liste' }),
    // Vaisseaux valides, modules abîmés : ils entrent dans la flotte (ingénierie, constructeur de builds), qui doit les ignorer
    JSON.stringify({ timestamp: heure(2), event: 'Loadout', ShipID: 99, Ship: 'cutter', ShipName: 42, ShipIdent: ['x'], Modules: { pas: 'une liste' }, FuelCapacity: 'plein' }),
    JSON.stringify({ timestamp: heure(2), event: 'Loadout', ShipID: 98, Ship: 'python', Modules: [null, 7, { Slot: 'FrameShiftDrive', Item: 'int_hyperdrive_size5_class5', Engineering: { Modifiers: 'abîmé' } }] }),
    JSON.stringify({ timestamp: heure(3), event: 'StoredShips', ShipsHere: [null, { ShipType: 'krait' }], ShipsRemote: { pas: 'une liste' } }),
    JSON.stringify({ timestamp: heure(4), event: 'FSDJump', StarSystem: 'Banc Piège', SystemAddress: 1234567, StarPos: [0, 0, 0], JumpDist: 1 }),
    JSON.stringify({ timestamp: heure(5), event: 'Docked', StarSystem: 'Banc Piège', SystemAddress: 1234567, StationName: 'Quai du banc', StationType: 'Coriolis', MarketID: 7654321 }),
  ];
  fs.appendFileSync(path.join(srv.dossiers.journaux, journal), `${lot.join('\r\n')}\r\n`); // un seul lot
  await attendre(1500); // le lecteur passe toutes les 500 ms
  const etat = await srv.get('/api/state');
  const recents = await srv.get('/api/journal/recent');
  b.constat(F, 'saut et amarrage après les lignes piégées, du même lot', 'reçus (état du jeu : système et station du banc)', etat.game?.system === 'Banc Piège' && etat.game?.docked === true && etat.game?.station === 'Quai du banc' ? null : `système « ${etat.game?.system} », amarré ${etat.game?.docked}, station « ${etat.game?.station} »`);
  b.constat(F, 'derniers événements', 'le saut et l’amarrage y sont', ['FSDJump', 'Docked'].every((e) => recents.some((r) => r.event === e && Date.parse(r.timestamp) >= t)) ? null : JSON.stringify(recents.slice(0, 4)));
  b.constat(F, 'erreur du journal (Paramètres)', 'aucune', etat.journal?.error ? String(etat.journal.error) : null);
  await b.jouer({ famille: F, nom: 'flotte de l’ingénierie lisible après les Loadout piégés', methode: 'GET', chemin: '/api/modules/engineering/fleet', attendu: OK('200 : la flotte se lit encore') });
  await b.jouer({ famille: F, nom: 'vaisseaux du constructeur de builds lisibles après les Loadout piégés', methode: 'GET', chemin: '/api/modules/builder/fleet', attendu: OK('200 : « Mes vaisseaux » se lit encore') });
  const lues = sortie().slice(lignesAvant);
  b.constat(F, 'console du serveur', 'aucune erreur imprévue ni module en échec', lues.filter((l) => /Erreur imprévue|Promesse rejetée sans traitement|un module a échoué/.test(l)).join(' ; ').slice(0, 400) || null);

  // Le même journal, relu au démarrage d'un autre serveur isolé : avant, un seul Loadout sans ShipID l'empêchait de
  // démarrer (exception dans un écouteur « ready »), et cela à chaque lancement
  if (!demarrer) return;
  const lignes = [];
  let autre = null;
  try {
    autre = await demarrer({ journaux: [path.join(srv.dossiers.journaux, journal)], sortie: (l) => lignes.push(l) });
    const e2 = await autre.get('/api/state');
    b.constat(F, 'serveur démarré sur ce journal (historique)', 'prêt, état du jeu lu jusqu’au bout', e2.game?.station === 'Quai du banc' ? null : `station « ${e2.game?.station} »`);
  } catch (err) {
    b.constat(F, 'serveur démarré sur ce journal (historique)', 'prêt, état du jeu lu jusqu’au bout', `ne démarre pas : ${String(err.message).split('\n')[0].slice(0, 300)}`);
  } finally {
    await autre?.arreter().catch(() => {});
  }
  b.constat(F, 'console du serveur démarré sur ce journal', 'aucune erreur imprévue ni module en échec', lignes.filter((l) => /Erreur imprévue|Promesse rejetée sans traitement|un module a échoué/.test(l)).join(' ; ').slice(0, 400) || null);
}

// --- Profil de commandes piégé (partagé sur Discord, copié dans Options\Bindings) ---

/** Limite de réponse d'une lecture de la garde des commandes, même avec un profil piégé (quelques ms d'habitude). */
const PROFIL_LIMITE_MS = 2000;

/**
 * Un membre de l'escadron partage « son profil X52 » : un XML valide de 490 Ko (sous le plafond de lecture), avec des
 * « <Root » cachés dans un commentaire et des valeurs « &amp;amp;… » démesurées, plus un fichier de 600 Ko (au-dessus).
 * Le jeu les ignore. Avant, la garde des commandes les analysait en temps quadratique, sans rendre la main : chaque
 * GET /status, et le démarrage, figeaient TOUT le serveur (17 s pour 600 Ko, des minutes pour 4 Mo). Attendu : /status et
 * une route sans rapport, lancée pendant la lecture, répondent en moins de 2 s, sans erreur imprévue.
 */
export async function scenarioProfilPiege(b, srv, { sortie }) {
  const F = 'Profil de commandes piégé (partagé)';
  const dossier = path.join(srv.dossiers.options, 'Bindings');
  garde(srv, dossier, F);
  const lignesAvant = sortie().length;
  const amp = `&${'amp;'.repeat(25_000)}`;
  const piege = path.join(dossier, 'Partage.4.2.binds');
  const enorme = path.join(dossier, 'Enorme.4.2.binds');
  fs.writeFileSync(piege, `<?xml version="1.0" encoding="UTF-8" ?>\n<!-- ${'<Root '.repeat(40_000)} -->\n<Root PresetName="${amp}" MajorVersion="4" MinorVersion="2">\n<Primary Device="${amp}" Key="Key_A" />\n</Root>\n`);
  fs.writeFileSync(enorme, '<Root'.repeat(120_000)); // 600 Ko
  try {
    const debut = performance.now();
    let etat = 'pas de réponse';
    const [rep] = await Promise.all([
      b.jouer({ famille: F, nom: 'état de la garde des commandes, profil piégé dans le dossier', methode: 'GET', chemin: '/api/modules/bindings/status', delaiMs: 30_000, attendu: OK('200, sans figer le serveur') }),
      (async () => {
        await attendre(50); // pendant la lecture du dossier
        try {
          const r = await envoyer({ base: srv.url, chemin: '/api/state', delaiMs: 30_000 });
          etat = r.statut === 200 ? r.ms : `réponse ${r.statut}`;
        } catch (err) {
          etat = `pas de réponse (${err.message})`;
        }
      })(),
    ]);
    const statusMs = performance.now() - debut;
    b.constat(F, 'durée de GET /api/modules/bindings/status', `moins de ${PROFIL_LIMITE_MS / 1000} s`, statusMs < PROFIL_LIMITE_MS ? null : `${(statusMs / 1000).toFixed(1)} s`);
    b.constat(F, 'GET /api/state lancé pendant la lecture (route sans rapport)', `répond en moins de ${PROFIL_LIMITE_MS / 1000} s`, typeof etat === 'number' && etat < PROFIL_LIMITE_MS ? null : `${typeof etat === 'number' ? `${(etat / 1000).toFixed(1)} s` : etat} : tout le serveur était figé`);
    b.constat(F, 'réponse de /status', 'lisible (JSON)', rep?.json && typeof rep.json === 'object' ? null : (rep ? `${rep.statut}` : 'aucune'));
  } finally {
    fs.rmSync(piege, { force: true });
    fs.rmSync(enorme, { force: true });
  }
  await envoyer({ base: srv.url, chemin: '/api/modules/bindings/status', delaiMs: 120_000 }).catch(() => {}); // dossier remis comme avant pour la suite
  const lues = sortie().slice(lignesAvant);
  b.constat(F, 'console du serveur', 'aucune erreur imprévue', lues.filter((l) => /Erreur imprévue|Promesse rejetée sans traitement/.test(l)).join(' ; ').slice(0, 400) || null);
}

// --- Captures de Mes repères ---

export const CAPTURE_TEMOIN = '1762520000000';
// Restes d'enregistrements coupés (capturesStore.js) : une image hors de la liste, une entrée sans image, un temporaire
export const CAPTURE_ORPHELINE = '1762510000000';
export const CAPTURE_SANS_IMAGE = '1762500000000';
const RESTE_COUPE = 'index.json.4242.1.abcdef.tmp';
/** Captures posées avant le démarrage (le module relit captures/index.json à son lancement) : de vrais PNG d'un pixel. */
export function poserCapture(dossiers) {
  const dir = path.join(dossiers.donnees, 'captures');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${CAPTURE_TEMOIN}.png`), png());
  fs.writeFileSync(path.join(dir, `${CAPTURE_ORPHELINE}.png`), png());
  fs.writeFileSync(path.join(dir, RESTE_COUPE), '[{"id":"17625');
  const entree = (id) => ({ id, at: new Date(Number(id)).toISOString(), system: null, body: null, site: null, width: 1, height: 1, lines: [], error: null, ores: [] });
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify([{ ...entree(CAPTURE_TEMOIN), at: '2026-11-07T12:13:20.000Z' }, entree(CAPTURE_SANS_IMAGE)]));
}

/**
 * Captures envoyées par le cadre de l'overlay : un vrai PNG seulement (reconnu à son contenu), sinon 400 et rien
 * d'enregistré. La capture témoin est servie en image/png avec sandbox et nosniff (contrôles communs).
 */
export async function scenarioCaptures(b, srv) {
  const F = 'Captures refusées';
  const base = '/api/modules/waypoints';
  const dir = path.join(srv.dossiers.donnees, 'captures');
  const contenu = () => (fs.existsSync(dir) ? fs.readdirSync(dir).sort().map((n) => `${n}:${fs.statSync(path.join(dir, n)).size}`).join('|') : '');
  await b.jouer({ famille: F, nom: 'capture témoin servie', methode: 'GET', chemin: `${base}/captures/${CAPTURE_TEMOIN}.png`, attendu: { statuts: [200], texte: '200 image/png (avec sandbox et nosniff)', verifier: (r) => (/^image\/png/.test(r.entetes['content-type'] || '') ? null : `type ${r.entetes['content-type']}`) } });
  const invalide = refus([400], /^Image invalide|Version pour la lecture du texte|Image manquante/, '400 avec la raison, rien d’enregistré');
  const b64 = (x) => Buffer.from(x).toString('base64');
  for (const [nom, corps] of [
    ['texte en guise d’image', { image: b64('pas une image') }],
    ['SVG en guise d’image', { image: b64(SVG) }],
    ['JPEG en guise de PNG', { image: b64(jpeg()) }],
    ['base64 invalide', { image: '!!!!' }],
    ['PNG de 30 000 × 30 000 px', { image: png(30_000, 30_000).toString('base64') }],
    ['version pour l’OCR qui n’est pas une image', { image: png().toString('base64'), ocr: [b64(SVG)] }],
    ['image qui n’est pas un texte', { image: [png().toString('base64')] }],
    ['sans image', {}],
  ]) {
    const avant = contenu();
    await b.jouer({ famille: F, nom, methode: 'POST', chemin: `${base}/captures`, entetes: JSON_ECRIT, corps: JSON.stringify(corps), attendu: invalide });
    b.constat(F, `${nom} : rien d'enregistré`, 'dossier des captures inchangé', contenu() === avant ? null : 'dossier modifié');
  }

  // Rapprochement au démarrage : l'image hors de la liste y revient (sans texte lu), l'entrée sans image en sort, le
  // reste d'une écriture coupée est effacé. Plus aucune image que l'app ne connaisse.
  const R = 'Captures rapprochées';
  await b.jouer({
    famille: R,
    nom: 'liste relue au démarrage',
    methode: 'GET',
    chemin: `${base}/captures`,
    attendu: {
      statuts: [200],
      texte: 'la capture témoin, puis l’image retrouvée (sans texte lu) ; pas l’entrée sans image',
      verifier: (r) => {
        const ids = Array.isArray(r.json) ? r.json.map((c) => c.id) : null;
        if (JSON.stringify(ids) !== JSON.stringify([CAPTURE_TEMOIN, CAPTURE_ORPHELINE])) return `ids ${JSON.stringify(ids)}`;
        return /retrouvée/.test(r.json[1].error || '') ? null : `image retrouvée sans mention (${r.json[1].error})`;
      },
    },
  });
  b.constat(R, 'reste d’une écriture coupée', 'effacé au démarrage', fs.existsSync(path.join(dir, RESTE_COUPE)) ? 'toujours là' : null);
  const images = () => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => /\.png$/i.test(n)).sort() : []);
  b.constat(R, 'images du dossier', 'exactement celles de la liste', JSON.stringify(images()) === JSON.stringify([`${CAPTURE_ORPHELINE}.png`, `${CAPTURE_TEMOIN}.png`]) ? null : JSON.stringify(images()));

  // Vraie capture, mais la liste ne peut pas être écrite (lecture seule) : refus expliqué, et pas d'image orpheline
  const index = path.join(dir, 'index.json');
  const avant = contenu();
  fs.chmodSync(index, 0o444);
  try {
    await b.jouer({ famille: R, nom: 'vraie capture, liste en lecture seule', methode: 'POST', chemin: `${base}/captures`, entetes: JSON_ECRIT, corps: JSON.stringify({ image: png().toString('base64') }), delaiMs: 120_000, attendu: refus([409], /Capture non enregistrée/, '409 avec la raison, rien d’enregistré') });
  } finally {
    fs.chmodSync(index, 0o644);
  }
  b.constat(R, 'liste en lecture seule : rien d’enregistré', 'dossier des captures inchangé (aucune image orpheline)', contenu() === avant ? null : `dossier modifié : ${contenu()}`);
  await b.jouer({ famille: R, nom: 'liste inchangée après le refus', methode: 'GET', chemin: `${base}/captures`, attendu: { statuts: [200], texte: 'toujours les deux mêmes captures', verifier: (r) => (Array.isArray(r.json) && r.json.map((c) => c.id).join(',') === `${CAPTURE_TEMOIN},${CAPTURE_ORPHELINE}` ? null : `ids ${JSON.stringify(r.json?.map?.((c) => c.id))}`) } });
}

// --- Recherches en ligne de Mes repères (Spansh, Ardent) ---

/**
 * Adresses de Spansh que le serveur a le droit de construire : la prospection (un entier du jeu derrière /api/dump/,
 * rien d'autre), la recherche de planètes (Systèmes importants), celle des systèmes et l'autocomplétion des noms (Où
 * agir). Toute autre adresse de spansh.co.uk vient d'un paramètre piégé.
 */
export const ROUTES_SPANSH = [
  /^https:\/\/spansh\.co\.uk\/api\/dump\/\d{1,20}$/,
  /^https:\/\/spansh\.co\.uk\/api\/bodies\/search$/,
  /^https:\/\/spansh\.co\.uk\/api\/systems\/search$/,
  /^https:\/\/spansh\.co\.uk\/api\/systems\/field_values\/system_names\?q=[^#]*$/,
];
/** Tentatives de la passerelle réseau vers spansh.co.uk hors de ces adresses. */
export const spanshHorsRoutes = (sorties) => sorties.filter((s) => /^https:\/\/spansh\.co\.uk(\/|$)/i.test(s.url) && !ROUTES_SPANSH.some((re) => re.test(s.url)));


/**
 * Tentatives des recherches de Mes repères réservées au clic du joueur (réglage des recherches automatiques coupé) :
 * la prospection du système (Spansh, /api/dump/<adresse>) et les prix du système (Ardent, imports du système). Les
 * autres pages (calculateur de routes…) ont leurs propres adresses, jamais comptées ici.
 */
export const RECHERCHES_AU_CLIC = [
  /^https:\/\/spansh\.co\.uk\/api\/dump\/\d{1,20}$/,
  /^https:\/\/api\.ardent-insight\.com\/v2\/system\/name\/[^/?#]+\/commodities\/imports\?fleetCarriers=false$/,
];
export const recherchesAuClic = (sorties) => sorties.filter((s) => RECHERCHES_AU_CLIC.some((re) => re.test(s.url)));

/**
 * Rien ne part sans le choix du joueur, et jamais une adresse piégée. Réseau coupé : la sonde relève quand même ce que
 * la passerelle AURAIT demandé (canal elite-compagnon:net, voir banc/sonde.mjs).
 *   1. Réglage par défaut (coupé) : la prospection du système où l'on est, celle d'un système choisi et les prix du
 *      système ne font AUCUNE tentative vers Spansh ni Ardent.
 *   2. Une lecture ne vaut jamais un clic : ?online=1 (le clic d'une ancienne version), avec une adresse valide, sans
 *      adresse, sans en-tête (curl) ou depuis un lien ouvert dans le navigateur (Sec-Fetch-Site: none, un lien posté sur
 *      Discord) : aucune tentative. Depuis la page d'un autre programme de ce PC (balise <img>, Sec-Fetch-Site:
 *      same-site, sans Origin) : refus 403 de la garde. Avant, Chrome envoyait ces requêtes sans un clic, et le serveur
 *      les prenait pour le bouton (775 tentatives vers Spansh en 3 s avec une boucle d'images).
 *   3. Le clic est une écriture (POST /survey/load, POST /sweep/markets/load, avec l'en-tête maison) : une seule
 *      tentative chacun, à l'adresse exacte attendue ; dix clics du même instant : une seule ; un clic de plus dans les
 *      30 s : 429 avec le délai, aucune tentative. Sans l'en-tête (formulaire, lien) : 403.
 *   4. SystemAddress piégé, en lecture ou dans le corps d'une écriture (dont le clic) : 400 avec la raison, aucune
 *      tentative, rien d'enregistré.
 */
export async function scenarioRecherchesEnLigne(b, srv) {
  const F = 'Recherches en ligne sans choix du joueur';
  const P = 'SystemAddress piégé vers Spansh';
  const base = '/api/modules/waypoints';
  const sorties = async () => (await srv.demander('sonde')).sorties || [];
  const depuis = async (n) => (await sorties()).slice(n);
  const lister = (l) => (l.length ? l.map((s) => `${s.url}${s.refus ? ` (${s.refus})` : ''}`).join(' ; ').slice(0, 600) : null);
  const exterieures = (l) => l.filter((s) => /^https:\/\/(spansh\.co\.uk|api\.ardent-insight\.com)\//i.test(s.url));

  const h = await srv.get(`${base}/here`);
  const adresse = h?.systemAddress != null ? String(h.systemAddress) : null;
  b.constat(F, 'séance du banc', 'un système avec son SystemAddress (FSDJump ou Location)', h?.system && /^\d+$/.test(adresse || '') ? null : JSON.stringify(h).slice(0, 200));
  await b.jouer({ famille: F, nom: 'réglage par défaut', methode: 'GET', chemin: `${base}/online`, attendu: { statuts: [200], texte: '200 : coupé, pas encore choisi', verifier: (r) => (r.json?.auto === false && r.json?.asked === false ? null : JSON.stringify(r.json)) } });

  // 1. Réglage coupé : rien ne part, quelle que soit la vue
  let n = (await sorties()).length;
  const coupe = (quoi, champ) => ({ statuts: [200], texte: `200, ${quoi} non demandé`, verifier: (r) => (r.json?.[champ]?.loaded === false && r.json?.[champ]?.auto === false ? null : `${champ} : ${JSON.stringify(r.json?.[champ])}`) });
  await b.jouer({ famille: F, nom: 'prospection du système où l’on est', methode: 'GET', chemin: `${base}/survey`, attendu: coupe('Spansh', 'spansh') });
  if (h?.system && adresse) {
    await b.jouer({ famille: F, nom: 'prospection d’un système choisi', methode: 'GET', chemin: `${base}/survey?${new URLSearchParams({ system: h.system, systemAddress: adresse })}`, attendu: coupe('Spansh', 'spansh') });
  }
  await b.jouer({ famille: F, nom: 'prix des minerais du système', methode: 'GET', chemin: `${base}/sweep/markets`, attendu: coupe('Ardent', 'ardent') });
  b.constat(F, 'tentatives vers Spansh ou Ardent, réglage coupé et sans clic', 'aucune', lister(exterieures(await depuis(n))));

  // 2. Une lecture ne vaut jamais un clic, d'où qu'elle vienne
  n = (await sorties()).length;
  const lien = { 'sec-fetch-site': 'none', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document', 'sec-fetch-user': '?1' };
  const img = { 'sec-fetch-site': 'same-site', 'sec-fetch-mode': 'no-cors', 'sec-fetch-dest': 'image' };
  const AUTRE_PROGRAMME = { statuts: [403], texte: 'refus 403 de la garde (page d’un autre programme de ce PC)', message: /autre programme de ce PC/ };
  const lectures = [
    ['prospection du système où l’on est', `${base}/survey?online=1`, coupe('Spansh', 'spansh')],
    ['prix des minerais du système', `${base}/sweep/markets?online=1`, coupe('Ardent', 'ardent')],
  ];
  if (h?.system && adresse) {
    lectures.push(['prospection d’un système choisi, adresse valide', `${base}/survey?${new URLSearchParams({ system: h.system, systemAddress: adresse, online: '1' })}`, coupe('Spansh', 'spansh')]);
    lectures.push(['prospection d’un système choisi, sans adresse', `${base}/survey?${new URLSearchParams({ system: h.system, online: '1' })}`, coupe('Spansh', 'spansh')]);
    lectures.push(['prospection, autre adresse valide', `${base}/survey?${new URLSearchParams({ system: 'Banc Système Image', systemAddress: '111111', online: '1' })}`, coupe('Spansh', 'spansh')]);
  }
  for (const [nom, chemin, attendu] of lectures) {
    await b.jouer({ famille: F, nom: `${nom} : ?online=1 sans en-tête (curl)`, methode: 'GET', chemin, attendu });
    await b.jouer({ famille: F, nom: `${nom} : ?online=1 par un lien ouvert dans le navigateur (Sec-Fetch-Site: none)`, methode: 'GET', chemin, entetes: lien, attendu });
    await b.jouer({ famille: F, nom: `${nom} : balise img d’un autre port (Sec-Fetch-Site: same-site)`, methode: 'GET', chemin, entetes: img, attendu: AUTRE_PROGRAMME });
  }
  // Une boucle d'images d'une page d'un autre port : toutes refusées, aucune tentative
  for (let i = 0; i < 20; i += 1) {
    await b.jouer({ famille: F, nom: `boucle d’images d’un autre port (${i + 1}/20)`, methode: 'GET', chemin: `${base}/survey?online=1&i=${i}`, entetes: img, attendu: AUTRE_PROGRAMME });
  }
  b.constat(F, 'tentatives vers Spansh ou Ardent après des lectures (?online=1, lien, image)', 'aucune', lister(exterieures(await depuis(n))));

  // 3. Clic : une écriture, une tentative chacun, à l'adresse attendue (réseau coupé : refusée par ELITE_NO_NETWORK)
  n = (await sorties()).length;
  for (const chemin of [`${base}/survey/load`, `${base}/sweep/markets/load`]) {
    await b.jouer({ famille: F, nom: `${chemin} sans l’en-tête maison (formulaire ou lien d’une page)`, methode: 'POST', chemin, entetes: { 'content-type': 'application/json', ...lien }, corps: '{}', attendu: { statuts: [403], texte: 'refus 403 de la garde (en-tête d’écriture)', message: /X-Elite-Compagnon: 1 » manquant/ } });
  }
  b.constat(F, 'tentatives après des clics sans l’en-tête', 'aucune', lister(exterieures(await depuis(n))));
  n = (await sorties()).length;
  const reseauCoupe = (service, erreur) => ({ statuts: [200], texte: `200, ${service} injoignable (réseau coupé) et dit`, verifier: (r) => (/Réseau coupé/.test(erreur(r) || '') ? null : JSON.stringify(r.json).slice(0, 200)) });
  await b.jouer({ famille: F, nom: 'clic « Charger depuis Spansh » (POST /survey/load)', methode: 'POST', chemin: `${base}/survey/load`, entetes: JSON_ECRIT, corps: '{}', attendu: reseauCoupe('Spansh', (r) => r.json?.spansh?.error) });
  const spansh = await depuis(n);
  b.constat(F, 'clic sur Spansh', `une tentative : https://spansh.co.uk/api/dump/${adresse}`, spansh.length === 1 && spansh[0].url === `https://spansh.co.uk/api/dump/${adresse}` ? null : lister(spansh) || 'aucune');
  const tropTot = (service) => ({ statuts: [429], texte: `429 « ${service} vient d’être interrogé… réessaie dans N s », rien demandé`, message: new RegExp(`^${service} vient d’être interrogé pour ce système : réessaie dans \\d+ s\\.$`) });
  n = (await sorties()).length;
  await b.jouer({ famille: F, nom: 'second clic sur Spansh dans les 30 s', methode: 'POST', chemin: `${base}/survey/load`, entetes: JSON_ECRIT, corps: '{}', attendu: tropTot('Spansh') });
  b.constat(F, 'second clic sur Spansh dans les 30 s', 'aucune tentative', lister(exterieures(await depuis(n))));
  // Dix clics du même instant sur un autre système choisi : une seule tentative
  n = (await sorties()).length;
  const choisi = JSON.stringify({ system: 'Banc Système Choisi', systemAddress: '222222' });
  const rafale = await Promise.all(Array.from({ length: 10 }, () => b.jouer({ famille: F, nom: 'dix clics du même instant (système choisi)', methode: 'POST', chemin: `${base}/survey/load`, entetes: JSON_ECRIT, corps: choisi, attendu: { statuts: [200, 429], texte: '200 (la même réponse) ou 429 (trop tôt), jamais une erreur' } })));
  const dix = await depuis(n);
  b.constat(F, 'dix clics du même instant', 'une seule tentative : https://spansh.co.uk/api/dump/222222', dix.length === 1 && dix[0].url === 'https://spansh.co.uk/api/dump/222222' ? null : `${lister(dix) || 'aucune'} (statuts : ${rafale.map((r) => r?.statut).join(', ')})`);

  n = (await sorties()).length;
  const marches = await b.jouer({ famille: F, nom: 'clic « Charger les prix d’Ardent » (POST /sweep/markets/load)', methode: 'POST', chemin: `${base}/sweep/markets/load`, entetes: GUARD, attendu: reseauCoupe('Ardent', (r) => r.json?.error) });
  const ardent = await depuis(n);
  const attendue = marches?.json?.system ? `https://api.ardent-insight.com/v2/system/name/${encodeURIComponent(marches.json.system)}/commodities/imports?fleetCarriers=false` : '?';
  b.constat(F, 'clic sur Ardent', `une tentative : ${attendue}`, ardent.length === 1 && ardent[0].url === attendue ? null : lister(ardent) || 'aucune');
  n = (await sorties()).length;
  await b.jouer({ famille: F, nom: 'second clic sur Ardent dans les 30 s', methode: 'POST', chemin: `${base}/sweep/markets/load`, entetes: GUARD, attendu: tropTot('Ardent Insight') });
  b.constat(F, 'second clic sur Ardent dans les 30 s', 'aucune tentative', lister(exterieures(await depuis(n))));

  // 4. SystemAddress piégé : refusé avant toute tentative, en lecture, au clic comme dans les autres écritures
  n = (await sorties()).length;
  const REFUS = { statuts: [400], texte: '400 « SystemAddress invalide », rien demandé', message: /SystemAddress invalide/ };
  const systeme = 'Banc Piège Spansh';
  const pieges = ['../../api/search/save?x=', '1?jsonp=a#', '%2e%2e/%2e%2e/api/search/save', '..', `${adresse || '1'}/../../x`, '18446744073709551616', '012', ' 1', '1e9', '-1'];
  for (const v of pieges) {
    const lecture = `${base}/survey?${new URLSearchParams({ system: systeme, systemAddress: v, online: '1' })}`;
    await b.jouer({ famille: P, nom: `lecture : « ${v} »`, methode: 'GET', chemin: lecture, attendu: REFUS });
    await b.jouer({ famille: P, nom: `lecture, balise img d’un autre port : « ${v} »`, methode: 'GET', chemin: lecture, entetes: img, attendu: AUTRE_PROGRAMME });
    await b.jouer({ famille: P, nom: `clic (POST /survey/load) : « ${v} »`, methode: 'POST', chemin: `${base}/survey/load`, entetes: JSON_ECRIT, corps: JSON.stringify({ system: systeme, systemAddress: v }), attendu: REFUS });
  }
  for (const route of ['site', 'body']) {
    const corps = { system: systeme, systemAddress: '../../api/stocke?z=', body: `${systeme} 1 a`, number: 1, rating: 7, notes: 'piège' };
    await b.jouer({ famille: P, nom: `écriture /survey/${route}`, methode: 'PUT', chemin: `${base}/survey/${route}`, entetes: JSON_ECRIT, corps: JSON.stringify(corps), attendu: REFUS });
  }
  b.constat(P, 'tentatives après les adresses piégées', 'aucune', lister(exterieures(await depuis(n))));
  const prospectes = await srv.get(`${base}/survey/systems`);
  b.constat(P, 'systèmes prospectés', `aucune trace de « ${systeme} »`, Array.isArray(prospectes) && !prospectes.some((s) => s.system === systeme) ? null : JSON.stringify(prospectes).slice(0, 200));
}

// --- Flux temps réel : client qui ne lit plus, connexions sans fin ---

/** Connexion brute au flux temps réel : { socket, entete (promesse : ce qui est reçu jusqu'à la fin de l'en-tête), texte() }. */
function ouvrirFlux(srv) {
  const socket = net.connect(srv.port, '127.0.0.1');
  let recu = '';
  const entete = new Promise((resolve) => {
    const fini = () => resolve(recu);
    socket.on('data', (d) => {
      if (recu.length < 4096) recu += d.toString('utf8');
      if (/\r\n\r\n/.test(recu)) resolve(recu);
    });
    socket.on('error', fini);
    socket.on('close', fini);
  });
  socket.on('connect', () => socket.write(`GET /api/stream HTTP/1.1\r\nHost: 127.0.0.1:${srv.port}\r\n\r\n`));
  return { socket, entete, texte: () => recu };
}

/**
 * Un client du flux qui ne lit plus (console figée par une sélection de texte, script bloqué) : avant, le serveur lui
 * gardait TOUS ses messages en mémoire, sans limite, jusqu'à la fermeture. Le jeu écrit ici, en lots, des événements
 * diffusés à chaque client (journal:event, une dizaine de Ko chacun, 16 Mo en tout au plus) : le client muet doit être
 * coupé en route (retard de plus de 1 Mo), le serveur le dire dans sa console, et le client qui lit (écoute du banc)
 * continuer à tout recevoir. Puis les connexions ouvertes sans fin : au-delà de 32, refus 503 avec la raison.
 */
export async function scenarioFluxMuet(b, srv, { sortie, flux }) {
  const F = 'Flux temps réel : client qui ne lit plus';
  const journal = fs.readdirSync(srv.dossiers.journaux).filter((n) => /^Journal\..*\.log$/.test(n)).sort().at(-1);
  if (!journal) throw new Error(`${F} : aucun journal dans le dossier du banc (séance absente).`);
  const lignesAvant = sortie().length;
  const muet = ouvrirFlux(srv);
  const debut = await muet.entete;
  b.constat(F, 'client muet connecté au flux', '200 text/event-stream', /^HTTP\/1\.1 200/.test(debut) && /text\/event-stream/.test(debut) ? null : debut.split('\r\n')[0] || 'aucune réponse');
  muet.socket.pause(); // ne lit plus rien
  let ferme = false;
  muet.socket.on('close', () => (ferme = true));
  const avantFlux = flux.texte().length;
  const nom = `BancFlux${'X'.repeat(10_000)}`; // événement inconnu des modules, diffusé tel quel (journal:event)
  const t = Date.parse(srv.maintenant);
  let envoye = 0;
  let lignesEnvoyees = 0;
  const coupe = () => sortie().slice(lignesAvant).some((l) => /Flux temps réel : un client ne lit plus/.test(l));
  for (let lot = 0; lot < 16 && !coupe(); lot += 1) {
    const lignes = Array.from({ length: 100 }, (_, i) => JSON.stringify({ timestamp: new Date(t + 60_000 + lot * 100 + i).toISOString(), event: nom }));
    fs.appendFileSync(path.join(srv.dossiers.journaux, journal), `${lignes.join('\r\n')}\r\n`);
    envoye += lignes.length * nom.length;
    lignesEnvoyees += lignes.length;
    await attendre(800); // le lecteur passe toutes les 500 ms
  }
  await attendre(1000);
  b.constat(F, `client muet après ${Math.round(envoye / 1048576)} Mo diffusés`, 'coupé par le serveur (« un client ne lit plus » dans sa console)', coupe() ? null : 'toujours servi : le serveur lui garde tout en mémoire');
  // Relu : il reçoit ce qui était déjà parti, puis la fin de la connexion
  muet.socket.resume();
  for (let i = 0; i < 50 && !ferme; i += 1) await attendre(100);
  b.constat(F, 'connexion du client muet', 'fermée par le serveur', ferme ? null : 'encore ouverte');
  muet.socket.destroy();
  const recus = flux.texte().slice(avantFlux).split('"event":"BancFlux').length - 1;
  b.constat(F, 'client qui lit (écoute du banc)', `les ${lignesEnvoyees} événements diffusés, toujours connecté`, recus === lignesEnvoyees ? null : `${recus} reçus`);
  b.constat(F, 'console du serveur', 'aucune erreur imprévue', sortie().slice(lignesAvant).filter((l) => /Erreur imprévue|Promesse rejetée sans traitement|un module a échoué/.test(l)).join(' ; ').slice(0, 400) || null);

  // Connexions sans fin : au plus 32 en tout (l'écoute du banc en tient déjà une)
  const ouvertes = [];
  let refus = null;
  try {
    for (let i = 0; i < 40 && !refus; i += 1) {
      const c = ouvrirFlux(srv);
      ouvertes.push(c);
      const e = await c.entete;
      if (!/^HTTP\/1\.1 200/.test(e)) {
        await attendre(300); // le corps du refus suit l'en-tête
        refus = c.texte();
      }
    }
  } finally {
    for (const c of ouvertes) c.socket.destroy();
  }
  b.constat(F, 'connexions au flux ouvertes sans fin', 'refus 503 au-delà de 32, avec la raison', refus && /^HTTP\/1\.1 503/.test(refus) && /Trop de connexions au flux temps réel \(32\)/.test(refus) && ouvertes.length <= 32 ? null : `${ouvertes.length} connexion(s) ouvertes, dernière réponse : ${String(refus || 'aucun refus').split('\r\n')[0]}`);
  await attendre(300);
  const apres = ouvrirFlux(srv);
  const e = await apres.entete;
  apres.socket.destroy();
  b.constat(F, 'nouvelle connexion une fois les autres fermées', '200 (places libérées)', /^HTTP\/1\.1 200/.test(e) ? null : e.split('\r\n')[0] || 'aucune réponse');
}

// --- Overlay : demande du menu mal formée ---

/**
 * PUT /api/overlay : la demande est vérifiée avant de savoir si l'overlay est installé (server/src/core/overlay.js,
 * overlayRequest). Le banc coupe l'overlay (ELITE_NO_OVERLAY) : avant, la route répondait 409 sans lire le corps, et
 * les corps piégés passaient au vert sans jamais toucher ce code ; overlay installé, `{"pages":"combat"}` donnait une
 * erreur 500 et un mode de 200 000 caractères était enregistré puis diffusé.
 */
export async function scenarioOverlay(b) {
  const F = 'Overlay : demande mal formée';
  const cas = [
    [{ pages: 'combat' }, /Pages invalides/],
    [{ pages: { length: 1 } }, /Pages invalides/],
    [{ pages: true }, /Pages invalides/],
    [{ pages: ['combat', '../x'] }, /Page invalide/],
    [{ pages: ['constructor'] }, /Page invalide/],
    [{ pages: Array.from({ length: 17 }, (_, i) => `p${i}`) }, /Trop de pages demandées/],
    [{ mode: { piege: 1 } }, /Mode de jeu invalide/],
    [{ mode: 'x'.repeat(200_000) }, /Mode de jeu invalide/],
    [{ mode: '__proto__' }, /Mode de jeu invalide/],
    [{ mode: 'combat', glance: 'oui' }, /vrai ou faux/],
    [{ mode: 'combat', dismissExtras: 'oui' }, /vrai ou faux/],
    [[], /Demande invalide/],
  ];
  for (const [corps, message] of cas) {
    await b.jouer({ famille: F, nom: JSON.stringify(corps).slice(0, 60), methode: 'PUT', chemin: '/api/overlay', entetes: JSON_ECRIT, corps: JSON.stringify(corps), attendu: { statuts: [400], texte: '400 avec la raison, même overlay coupé', message } });
  }
  await b.jouer({ famille: F, nom: 'demande bien formée (« Aucun »), overlay coupé', methode: 'PUT', chemin: '/api/overlay', entetes: JSON_ECRIT, corps: JSON.stringify({ mode: null, glance: false, pages: [], dismissExtras: true }), attendu: { statuts: [409], texte: '409 « overlay coupé »', message: /ELITE_NO_OVERLAY/ } });
  await b.jouer({ famille: F, nom: 'état après les refus', methode: 'GET', chemin: '/api/overlay', attendu: { statuts: [200], texte: '200 : aucun mode, overlay vu comme absent', verifier: (r) => (r.json?.mode === null && r.json?.installed === false ? null : JSON.stringify(r.json).slice(0, 200)) } });
}
