// Vue du jeu pour l'IA de bord : quand le joueur lui demande ce qu'elle voit, l'overlay prend UNE image de la seule
// fenêtre du jeu (overlay/vision.js : jamais l'écran ni une autre fenêtre), l'envoie ici, et le modèle déjà chargé
// (les trois modèles d'Alicia lisent les images) la décrit. L'image reste en mémoire le temps de la lecture : jamais
// écrite sur le disque, jamais envoyée hors du PC. Coupée par défaut (réglage « vision »).
//
// L'overlay demande toutes les secondes s'il y a une photo à prendre (GET /vision) : pas de canal en plus à ouvrir.

export const ATTENTE_IMAGE_MS = 6000; // l'overlay passe au plus toutes les secondes, et la photo prend moins d'une seconde
export const MAX_JPEG_B64 = 900_000; // ~650 Ko d'image : largement plus qu'une capture de 1280 pixels (≈ 130 Ko)

// 12 nov. 2026, qwen3.6:35b-a3b sur une capture à quai : à quai, menu, heure et statut lus ; les petits textes
// (nom du système) écorchés. D'où « recopie seulement ce qui est net ».
export const CONSIGNE_VUE = [
  "Tu regardes une capture de la fenêtre du jeu Elite Dangerous (cockpit et HUD). Décris en français, en 6 lignes au plus,",
  'uniquement ce que tu vois vraiment : où est le vaisseau (à quai, en vol, en supercroisière, posé…), ce qui est devant,',
  'les panneaux et menus ouverts, les jauges et alertes visibles (boucliers, coque, chaleur, carburant), la cible.',
  "Recopie seulement les textes nets ; un texte flou ou trop petit : dis qu'il est illisible, n'invente rien.",
].join(' ');

/** Demande de photo en attente (une à la fois) : l'overlay la prend, l'image ou l'erreur revient par `rendre`. */
export class DemandesVue {
  constructor({ attenteMs = ATTENTE_IMAGE_MS } = {}) {
    this.attenteMs = attenteMs;
    this.courante = null; // { id, resolve, timer }
    this.n = 0;
  }

  /** Numéro de la demande en attente (pour l'overlay), ou null. */
  enAttente() {
    return this.courante?.id ?? null;
  }

  /** Nouvelle demande : promesse de { jpeg } ou { erreur }. Une demande déjà en cours est refusée. */
  demander() {
    if (this.courante) return Promise.resolve({ erreur: 'Je regarde déjà.' });
    const id = `v${Date.now().toString(36)}${++this.n}`;
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.rendre(id, { erreur: "L'overlay n'a pas pris d'image (il ne tourne pas, ou le jeu n'est pas trouvé)." }), this.attenteMs);
      timer.unref?.();
      this.courante = { id, resolve, timer };
    });
  }

  /** Réponse de l'overlay pour la demande `id` ; false si ce n'est pas la demande en attente. */
  rendre(id, reponse) {
    const c = this.courante;
    if (!c || c.id !== id) return false;
    clearTimeout(c.timer);
    this.courante = null;
    c.resolve(reponse);
    return true;
  }
}

/** Image JPEG en base64 acceptable (commence comme un JPEG, taille raisonnable) ? */
export function estJpegB64(s) {
  return typeof s === 'string' && s.length > 100 && s.length <= MAX_JPEG_B64 && /^\/9j\/[A-Za-z0-9+/=]+$/.test(s);
}
