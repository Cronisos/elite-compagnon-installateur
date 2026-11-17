// Normalisation des réponses du serveur isolé avant comparaison : seul ce qui change d'un lancement à l'autre sans
// rien dire du code est remplacé, par une étiquette lisible.
//   - dossier temporaire du banc (C:\…\Temp\elite-controle-XXXX)  → <banc>
//   - port choisi au lancement (127.0.0.1:54321)                   → 127.0.0.1:<port>
//   - identifiants aléatoires (UUID)                                → <uuid>
//   - heure RÉELLE du lancement (date écrite par la base SQLite, date d'un fichier créé pendant le contrôle) : toute
//     date ISO ou tout horodatage en ms compris dans la fenêtre du lancement → <heure réelle>. L'heure figée
//     (CONTROLE_NOW) et les heures des journaux ne sont jamais dans cette fenêtre : elles restent telles quelles.
//   - version d'un fichier du dépôt dans une adresse (avatars du compagnon : ?v=<date du fichier, en ms>) : elle
//     change à chaque copie du dépôt (worktree, clone, dossier de l'app)   → ?v=<date du fichier>

const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const MARGE_MS = 60_000;
const VERSION = /([?&]v=)\d{10,}\b/g;

function variantes(chemin) {
  const v = new Set([chemin, chemin.replace(/\\/g, '/'), chemin.replace(/\\/g, '\\\\')]);
  // Windows : le lecteur peut s'écrire en minuscule, et le dossier temporaire sous son nom court
  for (const x of [...v]) v.add(x.charAt(0).toLowerCase() + x.slice(1));
  return [...v].filter(Boolean).sort((a, b) => b.length - a.length);
}

/**
 * Normaliseur pour un serveur : { racine, port, debut, fin } (debut et fin : heure réelle du lancement, en ms).
 * Renvoie une fonction valeur → valeur normalisée (copie).
 */
export function normaliseur({ racine, port, debut, fin }) {
  const chemins = racine ? variantes(racine) : [];
  const enFenetre = (ms) => Number.isFinite(ms) && ms >= debut - MARGE_MS && ms <= fin + MARGE_MS;
  const texte = (s) => {
    if (ISO.test(s) && enFenetre(Date.parse(s))) return '<heure réelle>';
    let out = s;
    for (const c of chemins) if (out.includes(c)) out = out.split(c).join('<banc>');
    if (port) out = out.replace(new RegExp(`(127\\.0\\.0\\.1|localhost):${port}\\b`, 'g'), '$1:<port>');
    return out.replace(UUID, '<uuid>').replace(VERSION, '$1<date du fichier>');
  };
  const parcourir = (v) => {
    if (typeof v === 'string') return texte(v);
    if (typeof v === 'number') return Number.isInteger(v) && v > 1e12 && enFenetre(v) ? '<heure réelle>' : v;
    if (Array.isArray(v)) return v.map(parcourir);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, parcourir(x)]));
    return v;
  };
  return parcourir;
}

/** Première différence entre deux valeurs JSON : { chemin, attendu, obtenu }, ou null si elles sont égales. */
export function difference(attendu, obtenu, chemin = '') {
  if (Object.is(attendu, obtenu)) return null;
  const ta = Array.isArray(attendu) ? 'tableau' : attendu === null ? 'null' : typeof attendu;
  const to = Array.isArray(obtenu) ? 'tableau' : obtenu === null ? 'null' : typeof obtenu;
  if (ta !== to || (ta !== 'object' && ta !== 'tableau')) return { chemin: chemin || '(racine)', attendu, obtenu };
  if (ta === 'tableau') {
    for (let i = 0; i < Math.max(attendu.length, obtenu.length); i += 1) {
      if (i >= attendu.length) return { chemin: `${chemin}[${i}]`, attendu: '(absent)', obtenu: obtenu[i] };
      if (i >= obtenu.length) return { chemin: `${chemin}[${i}]`, attendu: attendu[i], obtenu: '(absent)' };
      const d = difference(attendu[i], obtenu[i], `${chemin}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  const cles = [...new Set([...Object.keys(attendu), ...Object.keys(obtenu)])];
  for (const k of cles) {
    if (!Object.hasOwn(attendu, k)) return { chemin: `${chemin}.${k}`, attendu: '(absent)', obtenu: obtenu[k] };
    if (!Object.hasOwn(obtenu, k)) return { chemin: `${chemin}.${k}`, attendu: attendu[k], obtenu: '(absent)' };
    const d = difference(attendu[k], obtenu[k], `${chemin}.${k}`);
    if (d) return d;
  }
  // Même contenu, ordre des clés différent : c'est une différence (l'interface peut en dépendre)
  if (JSON.stringify(Object.keys(attendu)) !== JSON.stringify(Object.keys(obtenu))) {
    return { chemin: chemin || '(racine)', attendu: `clés ${Object.keys(attendu).join(', ')}`, obtenu: `clés ${Object.keys(obtenu).join(', ')}` };
  }
  return null;
}
