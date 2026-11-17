// Fichiers fabriqués pour les attaques (images, XML) et relevés du disque. Les charges sont MINIMALES et INERTES : elles
// servent seulement à vérifier qu'un refus a lieu (un SVG avec un élément <script> vide, une seule entité interne
// déclarée, aucune adresse externe, aucun chemin réel du joueur).

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const SIGNATURE_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function bloc(type, donnees) {
  const longueur = Buffer.alloc(4);
  longueur.writeUInt32BE(donnees.length);
  const corps = Buffer.concat([Buffer.from(type, 'latin1'), donnees]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(corps) >>> 0);
  return Buffer.concat([longueur, corps, crc]);
}

/**
 * PNG RVBA 8 bits. 1 × 1 : une vraie image (un pixel). Plus grand : seul l'en-tête annonce la taille (les données ne
 * suivent pas) : de quoi vérifier un refus sur les dimensions sans fabriquer une image énorme.
 */
export function png(largeur = 1, hauteur = 1) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largeur, 0);
  ihdr.writeUInt32BE(hauteur, 4);
  ihdr[8] = 8; // bits par composante
  ihdr[9] = 6; // RVBA
  const pixels = largeur === 1 && hauteur === 1 ? Buffer.from([0, 255, 128, 0, 255]) : Buffer.alloc(0);
  return Buffer.concat([SIGNATURE_PNG, bloc('IHDR', ihdr), bloc('IDAT', zlib.deflateSync(pixels)), bloc('IEND', Buffer.alloc(0))]);
}

/** JPEG minimal reconnaissable (marqueurs SOI, APP0 JFIF, SOF0 1 × 1, EOI) : assez pour vérifier qu'il n'est pas un PNG. */
export function jpeg() {
  return Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xd9,
  ]);
}

/** SVG inerte : un élément <script> VIDE suffit à vérifier que le SVG est refusé. */
export const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><script></script></svg>';

export const dataUrl = (type, buf) => `data:${type};base64,${Buffer.from(buf).toString('base64')}`;

/** Version d'un fichier telle que la calcule le module des couleurs (16 premiers caractères du SHA-256). */
export const versionDe = (buf) => (buf == null ? 'absent' : crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16));

const empreinte = (fichier) => crypto.createHash('sha1').update(fs.readFileSync(fichier)).digest('hex');

/** Tous les fichiers d'un dossier (récursif, liens non suivis) : Map(chemin relatif → « taille:empreinte »). */
export function photo(dossier, { exclure = () => false } = {}) {
  const out = new Map();
  const parcourir = (d) => {
    let entrees;
    try {
      entrees = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entrees) {
      const p = path.join(d, e.name);
      const rel = path.relative(dossier, p).replace(/\\/g, '/');
      if (exclure(rel)) continue;
      if (e.isSymbolicLink()) out.set(rel, 'lien');
      else if (e.isDirectory()) parcourir(p);
      else if (e.isFile()) {
        try {
          out.set(rel, `${fs.statSync(p).size}:${empreinte(p)}`);
        } catch {
          out.set(rel, 'illisible');
        }
      }
    }
  };
  parcourir(dossier);
  return out;
}

/** Différences entre deux photos : ['ajouté x', 'modifié y', 'supprimé z']. */
export function differences(avant, apres) {
  const out = [];
  for (const [k, v] of apres) {
    if (!avant.has(k)) out.push(`ajouté ${k}`);
    else if (avant.get(k) !== v) out.push(`modifié ${k}`);
  }
  for (const k of avant.keys()) if (!apres.has(k)) out.push(`supprimé ${k}`);
  return out;
}

/** Chemins (relatifs à `dossier`, récursif) dont le nom contient `texte`. */
export function nomsContenant(dossier, texte) {
  const out = [];
  const parcourir = (d) => {
    let entrees;
    try {
      entrees = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entrees) {
      const p = path.join(d, e.name);
      if (e.name.toLowerCase().includes(texte.toLowerCase())) out.push(path.relative(dossier, p).replace(/\\/g, '/'));
      if (e.isDirectory() && !e.isSymbolicLink()) parcourir(p);
    }
  };
  parcourir(dossier);
  return out;
}

/** Fichiers (relatifs, récursif) dont le contenu contient `texte`. */
export function fichiersContenant(dossier, texte) {
  const cherche = Buffer.from(texte, 'utf8');
  return [...photo(dossier).keys()].filter((rel) => {
    try {
      return fs.readFileSync(path.join(dossier, rel)).includes(cherche);
    } catch {
      return false;
    }
  });
}
