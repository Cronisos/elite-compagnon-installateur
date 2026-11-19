// Port du serveur déjà pris au démarrage (EADDRINUSE) : qui le tient, et un message clair pour un joueur.
//
// Avant : aucune écoute de l'erreur, donc une « Erreur imprévue » en anglais avec sa pile, et l'app de bureau qui
// accusait « npm run dev ». Ici : le programme qui tient le port est nommé (netstat, puis tasklist : deux outils de
// Windows, rien ne sort du PC), et le message dit quoi faire. Hors de Windows, ou si les outils ne répondent pas, le
// message reste clair, sans le nom du programme.

import { execFileSync } from 'node:child_process';

const DELAI_MS = 5000;

/**
 * PID du processus qui écoute sur `port`, lu dans la sortie de « netstat -ano -p TCP » (colonnes : protocole, adresse
 * locale, adresse distante, état, PID). L'état n'est pas lu : son nom change avec la langue de Windows. Une écoute a une
 * adresse distante vide (0.0.0.0:0 ou [::]:0). Rend un nombre, ou null.
 */
export function pidSurPort(sortie, port) {
  for (const ligne of String(sortie || '').split(/\r?\n/)) {
    const c = ligne.trim().split(/\s+/);
    if (c.length < 4 || !/^TCP/i.test(c[0])) continue;
    if (!c[1].endsWith(`:${port}`) || !/^(0\.0\.0\.0|\[::\]|\*):0$/.test(c[2])) continue;
    const pid = Number(c[c.length - 1]);
    if (Number.isSafeInteger(pid) && pid > 0) return pid;
  }
  return null;
}

/** Nom du programme dans la sortie de « tasklist /FI "PID eq n" /FO CSV /NH » (« "node.exe","1234",… »), ou null. */
export function nomDansTasklist(sortie) {
  const m = /^"([^"]+)","\d+"/m.exec(String(sortie || ''));
  return m ? m[1] : null;
}

/** Programme qui tient le port : { pid, nom } (nom peut être null), ou null s'il est introuvable. Jamais d'erreur. */
export function quiTientLePort(port, { exec = execFileSync, platform = process.platform } = {}) {
  if (platform !== 'win32') return null;
  const lancer = (cmd, args) => exec(cmd, args, { encoding: 'latin1', timeout: DELAI_MS, windowsHide: true });
  let pid;
  try {
    pid = pidSurPort(lancer('netstat', ['-ano', '-p', 'TCP']), port);
  } catch {
    return null;
  }
  if (!pid) return null;
  let nom = null;
  try {
    nom = nomDansTasklist(lancer('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH']));
  } catch {
    // nom inconnu : le PID suffit pour le gestionnaire des tâches
  }
  return { pid, nom };
}

/** Message pour le joueur : le port, qui le tient (si on le sait), et quoi faire. */
export function messagePortPris(port, qui) {
  const tenu = qui ? ` par ${qui.nom ? `« ${qui.nom} »` : 'un autre programme'} (PID ${qui.pid})` : ' par un autre programme';
  const nous = qui?.nom && /^(node|electron|elite compagnon)(\.exe)?$/i.test(qui.nom);
  const conseil = nous
    ? "C'est sans doute une autre copie d'Enova encore ouverte : ferme-la (icône près de l'horloge, ou gestionnaire des tâches), puis relance."
    : "Ferme ce programme (gestionnaire des tâches, onglet Détails, colonne PID), ou redémarre le PC, puis relance Enova.";
  return `Enova ne peut pas démarrer : le port ${port} de ce PC est déjà pris${tenu}. ${conseil}`;
}
