// Images reçues de la page (data URL « data:image/png;base64,… ») : reconnues à leur CONTENU, jamais seulement à ce
// qu'elles déclarent. Un texte, un SVG (qui peut contenir du script) ou un JPEG annoncé « png » sont refusés, comme une
// image aux dimensions démesurées (un PNG de quelques Ko peut annoncer 30 000 × 30 000 px : 3,6 Go une fois décodé).

/** Côté le plus grand accepté (px) : une capture 8K passe (7 680 × 4 320) ; au-delà, ce n'est plus une illustration. */
export const MAX_SIDE_PX = 8192;

/** Format réel d'après les premiers octets : 'png', 'jpeg', 'webp', 'gif' ou null. */
export function imageType(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG' && buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  const head = buf.toString('latin1', 0, 6);
  if (head === 'GIF87a' || head === 'GIF89a') return 'gif';
  return null;
}

/** Largeur et hauteur lues dans l'en-tête (sans décoder l'image) ; null si l'en-tête est illisible. */
export function imageSize(buf, type) {
  if (type === 'png') {
    if (buf.length < 24 || buf.toString('latin1', 12, 16) !== 'IHDR') return null;
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (type === 'gif') return buf.length >= 10 ? { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) } : null;
  if (type === 'webp') {
    const chunk = buf.toString('latin1', 12, 16);
    if (chunk === 'VP8X' && buf.length >= 30) return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    if (chunk === 'VP8L' && buf.length >= 25 && buf[20] === 0x2f) {
      const bits = buf.readUInt32LE(21);
      return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) };
    }
    if (chunk === 'VP8 ' && buf.length >= 30 && buf[23] === 0x9d && buf[24] === 0x01 && buf[25] === 0x2a) {
      return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    }
    return null;
  }
  if (type === 'jpeg') {
    // Segments jusqu'au premier « début d'image » (SOF0 à SOF15, sauf DHT C4, JPG C8 et DAC CC)
    let p = 2;
    while (p + 9 < buf.length) {
      if (buf[p] !== 0xff) return null;
      const marker = buf[p + 1];
      if (marker === 0xff) {
        p += 1; // remplissage
        continue;
      }
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
        p += 2;
        continue;
      }
      const len = buf.readUInt16BE(p + 2);
      if (len < 2) return null;
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { width: buf.readUInt16BE(p + 7), height: buf.readUInt16BE(p + 5) };
      }
      if (marker === 0xd9 || marker === 0xda) return null; // fin ou données avant toute dimension
      p += 2 + len;
    }
    return null;
  }
  return null;
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

const formats = (allowed) => allowed.map((t) => t.toUpperCase()).join(', ').replace(/, ([^,]*)$/, ' ou $1');

/**
 * Image en base64 (sans « data: ») → { type, ext, buf, width, height } ; ou { error } (message en français).
 * `allowed` : formats acceptés, dans l'ordre de la phrase d'erreur ; `declared` : format annoncé, qui doit être le
 * vrai ; `maxPixels` : surface maximale. Le base64 doit être exact (Buffer.from ignorerait en silence les caractères
 * faux).
 */
export function decodeBase64Image(b64, allowed = ['png', 'jpeg', 'webp'], { declared = null, maxSide = MAX_SIDE_PX, maxPixels = Infinity } = {}) {
  const invalid = (why) => ({ error: `Image invalide : ${why} (${formats(allowed)}).` });
  if (typeof b64 !== 'string' || !b64 || b64.length % 4 !== 0 || !BASE64.test(b64)) return invalid('contenu base64 illisible');
  const buf = Buffer.from(b64, 'base64');
  const type = imageType(buf);
  if (!type) return invalid('ce n’est pas une image');
  if (declared && type !== declared) return invalid(`c’est en réalité une image ${type.toUpperCase()}`);
  if (!allowed.includes(type)) return invalid(`format ${type.toUpperCase()} refusé`);
  const size = imageSize(buf, type);
  if (!size || !size.width || !size.height) return invalid('dimensions illisibles, l’image semble abîmée');
  if (size.width > maxSide || size.height > maxSide) return invalid(`${size.width} × ${size.height} px, ${maxSide} px de côté au plus`);
  if (size.width * size.height > maxPixels) return invalid(`${size.width} × ${size.height} px, trop grande`);
  return { type, ext: type === 'jpeg' ? 'jpg' : type, buf, ...size };
}

/** Data URL d'image (« data:image/png;base64,… ») → comme decodeBase64Image ; le format annoncé doit être le vrai. */
export function decodeImageDataUrl(dataUrl, allowed = ['png', 'jpeg', 'webp'], options = {}) {
  const invalid = (why) => ({ error: `Image invalide : ${why} (${formats(allowed)}).` });
  if (typeof dataUrl !== 'string') return invalid('aucune image reçue');
  const m = /^data:image\/([a-z0-9.+-]{1,20});base64,(.*)$/s.exec(dataUrl);
  if (!m) return invalid('adresse « data:image/…;base64, » attendue');
  if (!allowed.includes(m[1])) return invalid(`format « ${m[1]} » refusé`);
  return decodeBase64Image(m[2], allowed, { ...options, declared: m[1] });
}
