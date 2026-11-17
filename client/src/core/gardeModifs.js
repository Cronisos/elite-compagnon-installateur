// Garde des changements non enregistrés : une page qui a du travail en cours (build du constructeur…) pose une garde,
// et quitter la page demande alors confirmation.
//
// L'app tourne sous un routeur déclaratif (BrowserRouter), sans useBlocker : la garde attrape donc elle-même les
// départs possibles. Un clic sur un lien de l'app (menus, onglets, fil d'Ariane), les menus qui naviguent par code
// (MenuCascade, ModeMenu, barre de l'app de bureau, petit compagnon : ils appellent confirmerDepart()), et dans un navigateur la
// fermeture ou le rechargement de l'onglet (beforeunload). Dans l'app de bureau, beforeunload n'est pas utilisé :
// Electron bloquerait la fermeture de la fenêtre sans rien demander.

import { useEffect, useRef } from 'react';
import { bureau } from './bureau.js';

const gardes = new Set();

/** Pose une garde (message de confirmation) ; renvoie la fonction qui la retire. */
export function poserGarde(message) {
  const g = { message };
  gardes.add(g);
  return () => gardes.delete(g);
}

/** Une page garde-t-elle des changements non enregistrés ? */
export function gardeActive() {
  return gardes.size > 0;
}

/**
 * À appeler avant une navigation par code : true si on peut partir (aucune garde, ou le joueur confirme). Une seule
 * question, celle de la dernière garde posée.
 */
export function confirmerDepart(demander = (m) => window.confirm(m)) {
  if (!gardes.size) return true;
  return Boolean(demander([...gardes].at(-1).message));
}

/**
 * Départ par code qui change aussi autre chose (le mode de jeu et ses fenêtres en jeu…) : la question d'abord, puis
 * `avant` et `aller`, seulement si le joueur accepte de partir. S'il reste sur sa page, rien n'a changé.
 * @returns {boolean} parti ou non
 */
export function partirSiAccepte(aller, { avant, demander } = {}) {
  if (!confirmerDepart(demander)) return false;
  avant?.();
  aller();
  return true;
}

/**
 * Le clic mène-t-il à une autre page de l'app ? Clic gauche simple sur un lien de la même origine, ouvert dans la
 * même fenêtre, vers une autre adresse que celle affichée. `ici` : window.location (origin, pathname, search).
 */
export function clicVersAutrePage(e, ici) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  const a = e.target?.closest?.('a[href]');
  if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return false;
  let cible;
  try {
    cible = new URL(a.getAttribute('href'), ici.href || `${ici.origin}${ici.pathname}${ici.search || ''}`);
  } catch {
    return false;
  }
  if (cible.origin !== ici.origin) return false;
  return cible.pathname !== ici.pathname || cible.search !== (ici.search || '');
}

/**
 * Garde de la page tant que `actif` est vrai : clics sur les liens de l'app, menus qui naviguent par code et, dans un
 * navigateur, fermeture ou rechargement de l'onglet.
 */
export function useGardeModifs(actif, message = 'Tu as des changements non enregistrés. Quitter quand même la page ?') {
  const msg = useRef(message);
  msg.current = message;
  useEffect(() => {
    if (!actif) return undefined;
    const retirer = poserGarde(msg.current);
    const surClic = (e) => {
      if (!clicVersAutrePage(e, window.location)) return;
      if (window.confirm(msg.current)) return;
      e.preventDefault(); // le Link de react-router ne navigue pas sur un clic déjà empêché
      e.stopPropagation();
    };
    const surDepart = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    document.addEventListener('click', surClic, true);
    if (!bureau) window.addEventListener('beforeunload', surDepart);
    return () => {
      retirer();
      document.removeEventListener('click', surClic, true);
      if (!bureau) window.removeEventListener('beforeunload', surDepart);
    };
  }, [actif]);
}
