// Réglages de l'IA de bord (server/data/ia.json) : modèles, marge de mémoire vidéo laissée au jeu, durée de chargement.

export const REGLAGES_DEFAUT = Object.freeze({
  // Coupée tant que le joueur ne l'allume pas (sa page) : elle demande Ollama et une grosse carte graphique. Les
  // réglages enregistrés (ia.json) gardent son choix.
  actif: false,
  grand: 'qwen3.8:27b', // le plus malin, entier sur la carte seulement (17,4 Go) : hors jeu
  moyen: 'qwen3.6:35b-a3b', // en jeu : 35B « à experts » réparti carte/processeur (12 nov. 2026 : 13,7 Go sur la carte, ~3 s)
  leger: 'qwen3.5:9b', // si le moyen ne tient pas (6,1 Go)
  margeMo: 1024, // mémoire vidéo toujours libre : en dessous, le modèle chargé est déchargé
  margeJeuMo: 2560, // mémoire laissée au jeu quand le moyen est réparti (le jeu peut grossir en cours de route)
  fenetre: false, // fenêtre en jeu (/hud/ia) ouverte
  voix: true, // réponses dites à voix haute par le Compagnon
  // voix choisie : « naturelle:N » (Supertonic, parole.js, voix 0 à 9), ou une voix de Windows (« Microsoft Julie… ») ;
  // vide : une voix française de Windows, Julie de préférence. Voix naturelle 4 : choix de l’auteur (12 nov. 2026)
  voixNom: 'naturelle:4',
  voixVitesse: 1, // vitesse de parole (0,6 à 1,6)
  voixHauteur: 1, // hauteur de la voix (0,5 à 1,5)
  voixVolume: 0.6, // volume de la voix (0,05 à 1) : à 1, c'était bien trop fort (l’auteur, 12 nov. 2026)
  personnalite: '', // texte libre du joueur : caractère, façon de parler (donné au modèle avec sa consigne)
  longueur: 'courte', // longueur des réponses : courte, normale, detaillee
  ecoute: true, // le joueur peut lui parler au micro (Whisper)
  // programme whisper-cli ; vide : Programs\whisper-cpp\bin\Release\whisper-cli.exe (core/paths.js, programmesDir)
  whisperExe: '',
  modeleEcoute: 'rapide', // rapide (small, 1,5 s) ou precis (large-v3-turbo, 5 s)
  whisperModele: '', // modèle de Whisper imposé ; vide : celui de modeleEcoute, dans le dossier de whisper-cpp
  langueEcoute: 'fr', // langue parlée
  vision: false, // lui permettre de regarder le jeu (images de la seule fenêtre d'Elite, overlay/vision.js) : coupé par défaut
  visionBouclier: false, // jauge des boucliers lue sur l'image (cadre réglé une fois sur l'hologramme du vaisseau)
  garderSec: 1200, // modèle déchargé après 20 min sans question (2 min, c’était trop court : demande de l’auteur, 12 nov. 2026)
});

export const MAX_PERSONNALITE = 4000;
export const LONGUEURS = ['courte', 'normale', 'detaillee'];
const NOM_MODELE = /^[a-z0-9][a-z0-9._\-/]*(:[a-z0-9._-]+)?$/i;
const entier = (v, min, max) => (Number.isInteger(v) && v >= min && v <= max ? v : null);

/**
 * Réglages nettoyés : ce qui est valide dans `entree` remplace `base` ; erreurs pour le reste.
 * @returns {{ reglages, erreurs: string[] }}
 */
export function nettoyerReglages(entree, base = REGLAGES_DEFAUT) {
  const r = { ...REGLAGES_DEFAUT, ...base };
  const erreurs = [];
  const e = entree && typeof entree === 'object' ? entree : {};
  for (const [cle, motif, aide] of [
    ['whisperExe', /whisper[^\\/]*\.exe$/i, 'le chemin de whisper-cli.exe'],
    ['whisperModele', /\.bin$/i, 'le chemin d’un modèle .bin de Whisper'],
  ]) {
    if (!Object.hasOwn(e, cle)) continue;
    const v = typeof e[cle] === 'string' ? e[cle].trim() : null;
    // Un programme lancé par le serveur : seulement whisper…exe, jamais un autre
    if (v === '' || (v && v.length <= 400 && !/[\u0000-\u001f]/.test(v) && motif.test(v))) r[cle] = v;
    else erreurs.push(`Écoute : ${aide} (ou vide pour l’installation par défaut).`);
  }
  if (Object.hasOwn(e, 'modeleEcoute')) {
    if (['rapide', 'precis'].includes(e.modeleEcoute)) r.modeleEcoute = e.modeleEcoute;
    else erreurs.push('Modèle de l’écoute : rapide ou precis.');
  }
  if (Object.hasOwn(e, 'langueEcoute')) {
    if (typeof e.langueEcoute === 'string' && /^[a-z]{2}$/.test(e.langueEcoute)) r.langueEcoute = e.langueEcoute;
    else erreurs.push('Langue de l’écoute : deux lettres (fr, en…).');
  }
  for (const cle of ['actif', 'fenetre', 'voix', 'ecoute', 'vision', 'visionBouclier']) {
    if (!Object.hasOwn(e, cle)) continue;
    if (typeof e[cle] === 'boolean') r[cle] = e[cle];
    else erreurs.push(`« ${cle} » : vrai ou faux.`);
  }
  if (Object.hasOwn(e, 'voixNom')) {
    const v = typeof e.voixNom === 'string' ? e.voixNom.trim() : null;
    if (v != null && v.length <= 100 && !/[\u0000-\u001f]/.test(v)) r.voixNom = v;
    else erreurs.push('Voix : un nom de 100 caractères au plus.');
  }
  for (const cle of ['grand', 'moyen', 'leger']) {
    if (!Object.hasOwn(e, cle)) continue;
    const v = typeof e[cle] === 'string' ? e[cle].trim() : '';
    if (v.length <= 80 && NOM_MODELE.test(v)) r[cle] = v;
    else erreurs.push(`Modèle « ${cle} » : un nom comme qwen3.5:9b.`);
  }
  if (Object.hasOwn(e, 'personnalite')) {
    const v = typeof e.personnalite === 'string' ? e.personnalite.replace(/\r\n/g, '\n').trim() : null;
    if (v != null && v.length <= MAX_PERSONNALITE) r.personnalite = v;
    else erreurs.push(`Personnalité : un texte de ${MAX_PERSONNALITE} caractères au plus.`);
  }
  if (Object.hasOwn(e, 'longueur')) {
    if (LONGUEURS.includes(e.longueur)) r.longueur = e.longueur;
    else erreurs.push(`Longueur des réponses : ${LONGUEURS.join(', ')}.`);
  }
  for (const [cle, min, max, nom] of [['voixVitesse', 0.6, 1.6, 'Vitesse de la voix'], ['voixHauteur', 0.5, 1.5, 'Hauteur de la voix'], ['voixVolume', 0.05, 1, 'Volume de la voix']]) {
    if (!Object.hasOwn(e, cle)) continue;
    const pas = cle === 'voixVolume' ? 20 : 10; // volume au 5 % près, le reste au dixième
    if (typeof e[cle] === 'number' && e[cle] >= min && e[cle] <= max) r[cle] = Math.round(e[cle] * pas) / pas;
    else erreurs.push(`${nom} : de ${String(min).replace('.', ',')} à ${String(max).replace('.', ',')}.`);
  }
  if (Object.hasOwn(e, 'margeMo')) {
    const v = entier(e.margeMo, 256, 8192);
    if (v != null) r.margeMo = v;
    else erreurs.push('Marge : de 256 à 8192 Mo.');
  }
  if (Object.hasOwn(e, 'margeJeuMo')) {
    const v = entier(e.margeJeuMo, 512, 8192);
    if (v != null) r.margeJeuMo = v;
    else erreurs.push('Marge pour le jeu : de 512 à 8192 Mo.');
  }
  if (Object.hasOwn(e, 'garderSec')) {
    const v = entier(e.garderSec, 0, 3600);
    if (v != null) r.garderSec = v;
    else erreurs.push('Durée de chargement : de 0 à 3600 s.');
  }
  return { reglages: r, erreurs };
}
