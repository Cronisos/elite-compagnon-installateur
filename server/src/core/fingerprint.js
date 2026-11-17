// Empreinte du contenu d'un dossier : change si un fichier change vraiment, pas si seule sa date bouge.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function fingerprint(dir) {
  const hash = createHash('sha1');
  const files = readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name))
    .sort();
  for (const file of files) hash.update(file).update(readFileSync(file));
  return hash.digest('hex');
}
