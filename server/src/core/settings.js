// Paramètres globaux de l'application (chemin des journaux, heures de jeu par soirée).

import { defaultJournalDir, isNetworkOrDevicePath } from './paths.js';

/**
 * Chemin réseau (\\serveur\partage, //serveur/partage) ou de périphérique Windows (\\?\, \\.\, \??\), défini dans
 * core/paths.js. Refusé pour le dossier des journaux : ouvrir un partage réseau fait envoyer par Windows l'identité de
 * la session (NTLM) à la machine visée, et un chemin de périphérique contourne les vérifications
 * habituelles des chemins. Les journaux du jeu sont toujours sur ce PC.
 */
export { isNetworkOrDevicePath };

export const NETWORK_PATH_ERROR =
  'Dossier refusé : les chemins réseau (\\\\serveur\\partage, //serveur) et de périphérique (\\\\?\\, \\\\.\\) ne sont pas acceptés. ' +
  'Indique un dossier de ce PC, par exemple C:\\Users\\<toi>\\Saved Games\\Frontier Developments\\Elite Dangerous.';

export async function getSettings(prisma) {
  let s = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!s) {
    s = await prisma.settings.create({
      data: { id: 1, journalPath: defaultJournalDir(), hoursPerEvening: 3 }, // core/paths.js : Saved Games (ou ELITE_JOURNAL_DIR)
    });
  }
  return s;
}

export async function updateSettings(prisma, input) {
  const data = {};
  if (typeof input.journalPath === 'string' && input.journalPath.trim()) {
    if (isNetworkOrDevicePath(input.journalPath)) {
      // Erreur lisible, renvoyée telle quelle (400) par le gestionnaire d'erreurs du serveur
      throw Object.assign(new Error(NETWORK_PATH_ERROR), { status: 400, publicMessage: NETWORK_PATH_ERROR });
    }
    data.journalPath = input.journalPath.trim();
  }
  const h = Number(input.hoursPerEvening);
  if (Number.isFinite(h) && h > 0 && h <= 24) data.hoursPerEvening = h;
  await getSettings(prisma);
  return prisma.settings.update({ where: { id: 1 }, data });
}
