// Jauge des boucliers lue sur l'image du jeu, sans IA : on compte les pixels allumés des anneaux de bouclier autour de
// l'hologramme du vaisseau. Le jeu ne donne nulle part le pourcentage (Status.json : seulement « levés » ou non).
//
// Réglage en deux temps, sur ta propre image (couleurs du HUD, résolution, position du cadre) :
//   1. boucliers tombés (à quai, par exemple) : ce qui est allumé là, c'est l'hologramme du vaisseau, pas les anneaux ;
//   2. boucliers pleins : ce qui s'allume en plus, ce sont les anneaux. Leur forme est gardée (le « masque »).
// Ensuite, le pourcentage est la part du masque allumée maintenant. Approximatif (l'hologramme bouge un peu avec le
// vaisseau, et si tu tournes la tête il sort du cadre), mais bien plus que « levés / tombés ».
// Tout se fait ici, dans l'overlay : l'image ne quitte jamais ce processus, seul le pourcentage part à l'app.

/** Un pixel du HUD allumé : vif et coloré (le décor du cockpit est sombre ou gris). Image RVBA ou BGRA : même test. */
function allume(px, i) {
  const a = px[i];
  const b = px[i + 1];
  const c = px[i + 2];
  const max = Math.max(a, b, c);
  return max >= 110 && max - Math.min(a, b, c) >= 50;
}

/** Pixels allumés d'une image (largeur × hauteur, 4 octets par pixel) : un octet 0/1 par pixel. */
function pixelsAllumes(px, largeur, hauteur) {
  const n = largeur * hauteur;
  if (!px || px.length < n * 4) throw new Error('Image incomplète.');
  const out = new Uint8Array(n);
  for (let p = 0; p < n; p += 1) out[p] = allume(px, p * 4) ? 1 : 0;
  return out;
}

/** Élargit une carte de pixels d'un rayon r : l'hologramme qui tremble d'un ou deux pixels ne passe pas pour un anneau. */
function elargir(carte, largeur, hauteur, r = 2) {
  const out = new Uint8Array(carte.length);
  for (let y = 0; y < hauteur; y += 1) {
    for (let x = 0; x < largeur; x += 1) {
      if (!carte[y * largeur + x]) continue;
      for (let dy = -r; dy <= r; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= hauteur) continue;
        for (let dx = -r; dx <= r; dx += 1) {
          const xx = x + dx;
          if (xx >= 0 && xx < largeur) out[yy * largeur + xx] = 1;
        }
      }
    }
  }
  return out;
}

const MIN_MASQUE = 40; // moins de 40 pixels d'anneau : le cadre n'est pas sur l'hologramme, ou les deux images se ressemblent

/**
 * Réglage : masque des anneaux d'après une image boucliers tombés et une boucliers pleins (mêmes dimensions).
 * @returns {{ largeur, hauteur, masque: string (base64 d'un octet 0/1 par pixel), pixels: number }}
 */
function calibrer(tombes, pleins) {
  if (tombes.largeur !== pleins.largeur || tombes.hauteur !== pleins.hauteur) throw new Error('Les deux images n’ont pas la même taille : ne redimensionne pas le cadre entre les deux.');
  const { largeur, hauteur } = pleins;
  const fond = elargir(pixelsAllumes(tombes.px, largeur, hauteur), largeur, hauteur);
  const allumes = pixelsAllumes(pleins.px, largeur, hauteur);
  const masque = new Uint8Array(allumes.length);
  let pixels = 0;
  for (let p = 0; p < masque.length; p += 1) {
    if (allumes[p] && !fond[p]) {
      masque[p] = 1;
      pixels += 1;
    }
  }
  if (pixels < MIN_MASQUE) throw new Error(`Presque aucune différence entre les deux images (${pixels} pixels) : place le cadre sur l'hologramme du vaisseau, et note bien une fois boucliers tombés, une fois pleins.`);
  return { largeur, hauteur, masque: Buffer.from(masque).toString('base64'), pixels };
}

/** Pourcentage des boucliers sur une image, d'après le réglage ; null si l'image n'a pas la taille du réglage. */
function pourcentage(image, reglage) {
  if (!reglage || image.largeur !== reglage.largeur || image.hauteur !== reglage.hauteur) return null;
  const masque = Buffer.from(reglage.masque, 'base64');
  const allumes = pixelsAllumes(image.px, image.largeur, image.hauteur);
  let dedans = 0;
  for (let p = 0; p < masque.length; p += 1) if (masque[p] && allumes[p]) dedans += 1;
  return Math.max(0, Math.min(100, Math.round((dedans / reglage.pixels) * 100)));
}

/** Réglage relu d'un fichier : complet et cohérent, sinon null. */
function reglageValide(r) {
  if (!r || typeof r !== 'object') return null;
  const { largeur, hauteur, masque, pixels } = r;
  if (!Number.isInteger(largeur) || !Number.isInteger(hauteur) || largeur < 8 || hauteur < 8 || largeur * hauteur > 1e6) return null;
  if (typeof masque !== 'string' || !Number.isInteger(pixels) || pixels < MIN_MASQUE) return null;
  return Buffer.from(masque, 'base64').length === largeur * hauteur ? { largeur, hauteur, masque, pixels } : null;
}

module.exports = { allume, pixelsAllumes, elargir, calibrer, pourcentage, reglageValide, MIN_MASQUE };
