// Synthèse vocale de Windows (voix installées sur le PC, rien ne sort) : partagée par le Compagnon, qui dit à voix
// haute les réponses de l'IA de bord, et par la page de l'IA (choix et essai de la voix). La voix naturelle
// (server/src/modules/ia/parole.js) arrive en son déjà prêt, joué par jouerSon.

/** Voix françaises disponibles (Julie, Hortense, Paul… selon le PC). */
export function voixFrancaises(synth = globalThis.speechSynthesis) {
  return (synth?.getVoices?.() || []).filter((v) => /^fr/i.test(v.lang));
}

/** Voix à utiliser : celle demandée par son nom, sinon une voix française (Julie de préférence), sinon aucune. */
export function choisirVoix(voix, nom) {
  return (nom && voix.find((v) => v.name === nom))
    || voix.find((v) => /julie/i.test(v.name))
    || voix.find((v) => /^fr/i.test(v.lang))
    || null;
}

/** Texte lisible à voix haute : sans la mise en forme ni le renvoi à la fenêtre principale. */
export const texteParle = (t) => String(t || '').replace(/\s*\(la suite dans la fenêtre principale\)\s*$/, '').replace(/\*\*|__|`/g, '').trim();

/** Voix naturelle (« naturelle:N ») plutôt qu'une voix de Windows ? */
export const estNaturelle = (nom) => /^naturelle:\d$/.test(String(nom || ''));

let sonEnCours = null;
/** Coupe ce qui se dit (son de la voix naturelle, voix de Windows). */
export function taire(synth = globalThis.speechSynthesis) {
  sonEnCours?.pause();
  sonEnCours = null;
  synth?.cancel?.();
}

/** Joue un son de l'app (voix naturelle, chemin /api/…), au volume voulu ; coupe la phrase précédente. */
export function jouerSon(chemin, { volume = 1 } = {}) {
  if (!/^\/api\//.test(String(chemin || '')) || typeof Audio === 'undefined') return false;
  taire();
  const a = new Audio(chemin);
  a.volume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 1;
  sonEnCours = a;
  a.play().catch(() => {});
  return true;
}

/** Dit un texte à voix haute (coupe la phrase précédente), vitesse, hauteur et volume réglables. Sans synthèse vocale : rien. */
export function direAVoixHaute(texte, nom = null, { vitesse = 1, hauteur = 1, volume = 1 } = {}, synth = globalThis.speechSynthesis) {
  const Phrase = globalThis.SpeechSynthesisUtterance;
  if (!synth || !Phrase || !texte) return false;
  sonEnCours?.pause();
  sonEnCours = null;
  const u = new Phrase(texteParle(texte));
  const voix = choisirVoix(voixFrancaises(synth), nom);
  if (voix) u.voice = voix;
  u.lang = voix?.lang || 'fr-FR';
  if (Number.isFinite(vitesse)) u.rate = vitesse;
  if (Number.isFinite(hauteur)) u.pitch = hauteur;
  if (Number.isFinite(volume)) u.volume = Math.max(0, Math.min(1, volume));
  synth.cancel();
  synth.speak(u);
  return true;
}
