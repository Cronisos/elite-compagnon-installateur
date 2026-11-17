// Textes de la Garde des commandes, sans React : à quel lancement le rapport appartient, état d'une sauvegarde,
// marche à suivre pour la remettre. Les règles du jeu restent côté serveur (server/src/modules/bindings/rules.js).

/** À quel lancement du jeu le rapport appartient, en clair. */
export function concernsLabel(log, game) {
  if (!log) return '';
  const last = game?.running === false ? 'dernier lancement du jeu' : 'lancement en cours';
  if (log.concerns === 'current') return last;
  if (log.concerns === 'previous') return `lancement précédent : rien n'a été écrit depuis le ${last}`;
  return 'aucun lancement du jeu trouvé dans les journaux';
}

/**
 * Lancement du jeu, en clair : « jeu lancé le …, fermé le … », ou « …, sans nouvelles depuis le … » quand le journal
 * s'arrête sans Shutdown (jeu planté ou fermé autrement). fmt : mise en forme d'une date ISO.
 */
export function gameLabel(game, fmt) {
  if (!game?.launchedAt) return '';
  const launched = `jeu lancé le ${fmt(game.launchedAt)}`;
  if (game.running !== false) return launched;
  if (game.ended === 'silence') return `${launched}, sans nouvelles depuis le ${fmt(game.endedAt)} (fermé ou planté)`;
  return game.endedAt ? `${launched}, fermé le ${fmt(game.endedAt)}` : `${launched}, fermé depuis`;
}

const ENTRY = {
  'missing-devices': { label: 'Manette absente', tone: 'bad' },
  'preset-errors': { label: 'Profil en erreur', tone: 'warn' },
  duplicate: { label: 'Doublon, sans gravité', tone: 'muted' },
  other: { label: 'Inconnu', tone: 'warn' },
};

/** Étiquette d'une ligne du rapport. */
export const entryLabel = (kind) => (Object.hasOwn(ENTRY, kind) ? ENTRY[kind] : ENTRY.other);

/** État d'une sauvegarde .backup par rapport au profil qu'elle garde. */
export function backupState(b) {
  if (!b.profileExists) return { text: `${b.profile} n'existe plus : la sauvegarde est la seule copie`, tone: 'warn' };
  if (b.sameAsProfile) return { text: 'identique à ton profil actuel', tone: 'good' };
  if (b.sameAsProfile === false) return { text: 'différente de ton profil actuel : il a changé depuis cette sauvegarde', tone: 'warn' };
  return { text: 'non comparée (fichier illisible ou trop gros)', tone: 'muted' };
}

/** Marche à suivre pour remettre une sauvegarde, à faire soi-même : l'app n'écrit jamais dans ce dossier. */
export function restoreSteps(b, displayDir) {
  return [
    'Ferme le jeu.',
    `Ouvre le dossier ${displayDir} (Win + R, colle le chemin, Entrée).`,
    `Garde une copie de ${b.profile} ailleurs, par prudence.`,
    `Copie ${b.file}, puis renomme la copie en ${b.profile} (elle remplace le profil).`,
    'Rebranche ta manette, puis relance le jeu.',
  ];
}

/** « 142 commandes » / « 1 commande ». */
export const commands = (n) => `${n} commande${n > 1 ? 's' : ''}`;
