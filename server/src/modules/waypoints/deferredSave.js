// Sauvegarde différée et regroupée de Mes repères (balayage de l'EEP, dernier coin de minage) : une minuterie écrit une
// fois pour tous les changements d'ici là (chaque position du SRV compte pendant un balayage).
//
// Une écriture ratée dans la minuterie (fichier en lecture seule après une restauration, antivirus ou outil de
// sauvegarde qui le verrouille, disque plein) est écrite dans la console, et la sauvegarde suivante réessaie. Avant,
// l'erreur n'était rattrapée par rien : elle arrêtait tout le serveur, en pleine séance de minage. Une écriture
// demandée tout de suite (depuis une route) laisse remonter son erreur : la route répond 500 et la page le dit.

/**
 * @param {object} o
 * @param {() => void} o.write   l'écriture (atomique : core/atomic.js)
 * @param {number} o.delayMs     attente avant d'écrire
 * @param {string} o.label       nom dans la console : « <label> : non enregistré (<raison>) »
 * @returns {{ soon(), now(), pending(): boolean }}
 */
export function deferredSave({ write, delayMs, label, log = console.error, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let timer = null;
  const fromTimer = () => {
    timer = null;
    try {
      write();
    } catch (err) {
      log(`${label} : non enregistré (${err?.message ?? String(err)})`);
    }
  };
  return {
    /** Écriture dans `delayMs` : une seule pour tous les appels d'ici là. */
    soon() {
      timer ??= setTimer(fromTimer, delayMs);
    },
    /** Écriture tout de suite (celle qui attendait est annulée) ; une erreur remonte à l'appelant. */
    now() {
      clearTimer(timer);
      timer = null;
      write();
    },
    pending: () => timer !== null,
  };
}

/**
 * Écriture d'un JSON seulement si son texte a changé depuis la dernière écriture RÉUSSIE (eeps.json : plusieurs
 * centaines de Ko, écrits en synchrone avec fsync ; une position du SRV qui n'apprend rien ne coûte plus une écriture).
 * Une écriture ratée n'est pas retenue : la suivante réessaie, même sans changement.
 * @param {(texte: string) => void} ecrire  l'écriture du texte (atomique : core/atomic.js)
 * @returns {(valeur: unknown) => boolean}  vrai si le fichier a été écrit
 */
export function ecritureSiChange(ecrire) {
  let dernier = null;
  return (valeur) => {
    const texte = JSON.stringify(valeur);
    if (texte === dernier) return false;
    ecrire(texte);
    dernier = texte;
    return true;
  };
}
