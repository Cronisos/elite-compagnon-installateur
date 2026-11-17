// App de bureau (desktop/, Electron) : le pont de desktop/preload.js, absent dans un navigateur. Une page détachée
// (fenêtre à part, par-dessus le jeu) s'ouvre avec ?fenetre=detachee : lu une fois au chargement, la fenêtre le reste
// même si on y change de page.

/** Pont de l'app de bureau, ou null (navigateur). */
export const bureau = typeof window !== 'undefined' && window.eliteBureau ? window.eliteBureau : null;

// Dans l'app de bureau, la page laisse voir le fond translucide de sa fenêtre (styles.css : html.bureau)
if (bureau && typeof document !== 'undefined') document.documentElement.classList.add('bureau');

/** Fenêtre détachée de l'app de bureau (lu à l'adresse de chargement). */
export function estDetachee(search, pont = bureau) {
  return Boolean(pont) && new URLSearchParams(search || '').get('fenetre') === 'detachee';
}

export const DETACHEE = estDetachee(typeof location !== 'undefined' ? location.search : '');

/**
 * Ligne « Version » de Paramètres → Mon compte, d'après la vérification du paquet par l'app de bureau
 * (desktop/version.js) : { texte, detail?, ok } (ok : true conforme, false modifié, null copie de développement), ou
 * null (navigateur, ancienne app de bureau).
 */
export function texteVersion(v) {
  if (!v || typeof v !== 'object') return null;
  if (!v.version) return { texte: 'copie de développement (pas un paquet de l’escadron)', ok: null };
  const base = `${v.version} · empreinte ${v.courte}`;
  if (v.conforme) return { texte: base, detail: 'fichiers identiques au paquet', ok: true };
  const n = Number(v.nbChanges) || 0;
  const changes = Array.isArray(v.changes) ? v.changes : [];
  const s = n > 1 ? 's' : '';
  const quoi = n > 0
    ? `${n} fichier${s} modifié${s} ou manquant${s} depuis le paquet (${changes.join(', ')}${n > changes.length ? '…' : ''})`
    : 'liste des fichiers du paquet modifiée';
  return { texte: base, detail: `${quoi} : ce n’est plus la version distribuée`, ok: false };
}
