// Sites externes affichés dans l'app de bureau (pages « Inara », « Spansh », « EDSY », « Coriolis »), chacun isolé du reste de l'app. C'est ce registre
// qui fait foi : l'interface n'envoie qu'un identifiant, jamais une adresse. Ajouter un site : une entrée ici, et sa
// page dans client/src/modules/sites/sites.js (même identifiant).
//
// Un site tiers fait tourner son propre code : il a sa session à lui (cookies, connexion à son compte, gardés d'une
// fois sur l'autre), aucun pont vers l'app, aucune requête vers ce PC ni le réseau local (l'API locale de l'app reste
// hors de sa portée), aucune permission (micro, caméra, position, notifications…), et sa page ne navigue que sur ses
// propres adresses : un lien vers un autre site s'ouvre dans le navigateur du joueur.

const SITES = Object.freeze({
  inara: Object.freeze({
    titre: 'Inara',
    accueil: 'https://inara.cz/',
    // Domaines où la page peut naviguer (sous-domaines compris)
    hotes: Object.freeze(['inara.cz']),
  }),
  spansh: Object.freeze({
    titre: 'Spansh',
    accueil: 'https://spansh.co.uk/',
    hotes: Object.freeze(['spansh.co.uk']),
  }),
  edsy: Object.freeze({
    titre: 'EDSY',
    accueil: 'https://edsy.org/',
    hotes: Object.freeze(['edsy.org']),
  }),
  coriolis: Object.freeze({
    titre: 'Coriolis',
    accueil: 'https://coriolis.io/',
    hotes: Object.freeze(['coriolis.io']),
  }),
});

/** Partition de session du site : persistante (connexion gardée), à part de celle de l'app. */
const partition = (id) => `persist:site-${id}`;

/** Site connu, ou null. */
function site(id) {
  return typeof id === 'string' && Object.hasOwn(SITES, id) ? SITES[id] : null;
}

function url(raw) {
  try {
    return new URL(String(raw));
  } catch {
    return null;
  }
}

/** Adresse où la page du site peut naviguer : https, sur un de ses domaines. */
function navigationPermise(s, raw) {
  const u = url(raw);
  if (!s || !u || u.protocol !== 'https:' || u.username || u.password) return false;
  const h = u.hostname.toLowerCase();
  return s.hotes.some((d) => h === d || h.endsWith(`.${d}`));
}

/** Adresse IPv4 de ce PC ou du réseau local (a.b.c.d en nombres). */
function ipv4Locale(a, b) {
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

/**
 * Adresse de ce PC ou du réseau local (l'API de l'app, un routeur, une imprimante…) : jamais depuis un site externe.
 * Adresses IP en clair, et les noms DNS qui portent une adresse locale dans leur nom (192.168.1.1.nip.io,
 * 10-0-0-1.sslip.io : ces services répondent l'adresse écrite dans le nom). Un autre nom DNS qui pointerait vers le
 * réseau local n'est pas reconnaissable ici : la vérification « réseau local » de Chromium (main.js) l'arrête, et
 * l'API de l'app refuse de toute façon un Host et une Origin étrangers (core/localGuard.js).
 */
function adresseLocale(h) {
  const host = String(h || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan') || host.endsWith('.home.arpa')) return true;
  // IPv6 (avec « : ») : boucle locale, lien local, réseau privé (fc00::/7), IPv4 mappée
  if (host.includes(':')) return host === '::1' || host === '::' || /^(fe[89ab][0-9a-f]?|f[cd][0-9a-f]{0,2}):/.test(host) || host.startsWith('::ffff:') || host.startsWith('::');
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (m) return ipv4Locale(Number(m[1]), Number(m[2]));
  if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/.test(host)) return true; // 2130706433, 0x7f000001 : 127.0.0.1 déguisé
  // Nom qui porte une adresse : « 192.168.1.1.nip.io », « app-10-0-0-1.sslip.io », « 7f000001.nip.io »
  for (const n of host.matchAll(/(?:^|[.-])(\d{1,3})[.-](\d{1,3})[.-](\d{1,3})[.-](\d{1,3})(?=$|[.-])/g)) {
    if ([n[1], n[2], n[3], n[4]].every((x) => Number(x) <= 255) && ipv4Locale(Number(n[1]), Number(n[2]))) return true;
  }
  // Forme hexadécimale (8 chiffres, « ac100001.nip.io » = 172.16.0.1) : décodée, puis les mêmes plages qu'en clair
  const hex = /(?:^|[.-])([0-9a-f]{8})\.(?:nip|sslip|xip)\.io$/.exec(host);
  if (hex) {
    const n = Number.parseInt(hex[1], 16);
    if (ipv4Locale(Math.floor(n / 2 ** 24) % 256, Math.floor(n / 2 ** 16) % 256)) return true;
  }
  return false;
}

/**
 * Requête permise à la page d'un site : web chiffré (https, wss) hors de ce PC et du réseau local, ou data/blob.
 * Jamais en clair (http, ws) : une page https n'en a pas besoin, et c'est le chemin habituel vers un routeur.
 */
function requetePermise(raw) {
  const u = url(raw);
  if (!u) return false;
  if (u.protocol === 'data:' || u.protocol === 'blob:') return true;
  if (!['https:', 'wss:'].includes(u.protocol)) return false;
  return !adresseLocale(u.hostname);
}

/**
 * Limite d'ouvertures (navigateur ouvert par la page d'un site) : au plus une toutes les `ms` millisecondes. Rend une
 * fonction (now) => true si l'ouverture est permise maintenant.
 */
function limiteur(ms) {
  let derniere = -Infinity;
  return (now = Date.now()) => {
    if (now - derniere < ms) return false;
    derniere = now;
    return true;
  };
}

/** Lien à ouvrir dans le navigateur du joueur : http(s) hors de ce PC. */
function versNavigateur(raw) {
  const u = url(raw);
  return Boolean(u && (u.protocol === 'https:' || u.protocol === 'http:') && !adresseLocale(u.hostname) && !u.username && !u.password);
}

/** Zone de la page où afficher le site (pixels de la fenêtre), relue sans confiance ; null si elle ne va pas. */
function zone(r, taille) {
  if (!r || typeof r !== 'object') return null;
  const [x, y, width, height] = [r.x, r.y, r.width, r.height].map((v) => (Number.isFinite(v) ? Math.round(v) : NaN));
  if ([x, y, width, height].some(Number.isNaN) || x < 0 || y < 0 || width < 50 || height < 50) return null;
  if (taille && (x + width > taille.width + 2 || y + height > taille.height + 2)) return null;
  return { x, y, width, height };
}


module.exports = { SITES, partition, site, navigationPermise, adresseLocale, requetePermise, versNavigateur, zone, limiteur };
