// Partage avec l'escadron, côté page : textes et petits calculs sans React (testés dans partage.test.js).
// Les pages parlent au module Escadron par son API (/modules/escadron/partage), jamais par son code : sans ce
// module, les boutons « Partager » et les onglets « Escadron » n'apparaissent pas.

export const API_PARTAGE = '/modules/escadron/partage';

/** À qui va un partage : « tout l'escadron », « Lieutenant et au-dessus », « Testeur, Testeur 2 ». */
export function libelleAudience(s, roles = []) {
  if (s.audience === 'role') {
    const role = roles.find((r) => r.id === s.role);
    return role ? `${role.name} et au-dessus` : 'un rôle supprimé (plus personne ne le reçoit)';
  }
  if (s.audience === 'cmdrs') {
    if (!s.to?.length) return 'toi';
    return s.to.length <= 3 ? s.to.join(', ') : `${s.to.slice(0, 3).join(', ')} et ${s.to.length - 3} de plus`;
  }
  return 'tout l’escadron';
}

/** Mon partage de cet objet, s'il existe déjà. */
export const partageDe = (miens, kind, ref) => (miens || []).find((s) => s.kind === kind && s.ref === String(ref)) || null;

/** Les partages reçus de ces types, du plus récent au plus ancien. */
export function recusDe(vue, kinds) {
  const voulus = new Set(kinds);
  return (vue?.recus || []).filter((s) => voulus.has(s.kind)).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

/** Destinataires choisis dans le formulaire → ce que l'API attend, ou null si le choix est incomplet. */
export function versDestinataires({ mode, role, cmdrs }) {
  if (mode === 'all') return { all: true };
  if (mode === 'role') return role ? { role } : null;
  if (mode === 'cmdrs') return cmdrs?.length ? { cmdrs } : null;
  return null;
}

/** Choix du formulaire d'après un partage existant (pour le modifier). */
export function choixDepuis(s) {
  if (!s) return { mode: 'all', role: '', cmdrs: [] };
  if (s.audience === 'role') return { mode: 'role', role: s.role || '', cmdrs: [] };
  if (s.audience === 'cmdrs') return { mode: 'cmdrs', role: '', cmdrs: s.to || [] };
  return { mode: 'all', role: '', cmdrs: [] };
}

/** Pourquoi le partage n'est pas utilisable, en une phrase ; null s'il l'est. */
export function blocage(vue) {
  if (!vue) return null;
  if (!vue.pret) return 'Rejoins d’abord ton escadron : le partage passe par son serveur.';
  if (!vue.actif) return 'Le partage avec l’escadron est coupé.';
  if (vue.attente) return 'Cette installation doit être confirmée : depuis une autre installation à ton nom, ou par le chef de l’escadron.';
  return null;
}

/** Réglage automatique d'un type → valeur de sa liste déroulante : '', 'all', 'role:<id>' ou 'cmdrs'. */
export function valeurAuto(to) {
  if (!to) return '';
  if (to.all) return 'all';
  if (to.role) return `role:${to.role}`;
  return 'cmdrs';
}

/** Valeur de la liste déroulante → destinataires pour l'API (null : jamais). 'cmdrs' ne se choisit pas ici. */
export function destinatairesAuto(valeur) {
  if (valeur === 'all') return { all: true };
  if (typeof valeur === 'string' && valeur.startsWith('role:') && valeur.length > 5) return { role: valeur.slice(5) };
  return null;
}

/**
 * Un partage à ces personnes sera-t-il chiffré de bout en bout ? (le serveur de l'escadron ne pourra alors pas le lire)
 * Rend null si le choix n'est pas « des personnes » ou n'en nomme aucune, sinon { chiffre, sansCle: [noms], pret } :
 *   - pret : ce PC a publié sa clé (sinon le serveur de l'escadron est trop ancien : tout part en clair) ;
 *   - sansCle : les destinataires qui n'ont pas encore de clé (ils n'ont jamais ouvert le partage dans une app à jour).
 */
export function chiffrementPrevu(vue, choix) {
  if (choix?.mode !== 'cmdrs' || !Array.isArray(choix.cmdrs) || !choix.cmdrs.length) return null;
  const chiffrables = new Map((vue?.membres ?? []).map((m) => [m.cmdr.toLowerCase(), m.chiffrable === true]));
  const sansCle = choix.cmdrs.filter((c) => !chiffrables.get(String(c).toLowerCase()));
  const pret = vue?.chiffrement === true;
  return { chiffre: pret && sansCle.length === 0, sansCle, pret };
}
