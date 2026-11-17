// Lecture et retouche ciblée de GraphicsConfigurationOverride.xml, sans dépendance.
//
// Le fichier n'est jamais réécrit en entier : on repère les positions des balises (petit lecteur XML qui
// saute commentaires, déclarations et CDATA), puis seul le bloc <GUIColour><Default> est créé, remplacé
// ou retiré. Tout le reste (autres réglages, commentaires, retours à la ligne, BOM) reste octet pour octet.
//
// Sens de la matrice (vérifié dans le code de l'éditeur de référence arkku.com/elite/hud_editor) :
// chaque ligne est une couleur D'ORIGINE du jeu, ses trois nombres disent combien elle donne de rouge,
// de vert et de bleu À L'ÉCRAN.
//   affiché = R × MatrixRed + V × MatrixGreen + B × MatrixBlue
// L'orange du HUD (beaucoup de rouge, un peu de vert) dépend donc surtout de MatrixRed.

export const ROWS = [
  ['red', 'MatrixRed'],
  ['green', 'MatrixGreen'],
  ['blue', 'MatrixBlue'],
];
export const IDENTITY = { red: [1, 0, 0], green: [0, 1, 0], blue: [0, 0, 1] };
export const LIMIT = 3; // nombres acceptés : de −3 à 3 (l'éditeur de référence va jusqu'à ±2)
export const ROOT = 'GraphicsConfig';

const DECLARATION = '<?xml version="1.0" encoding="UTF-8" ?>';

function fail(message) {
  const err = new Error(message);
  err.code = 'XML';
  return err;
}

// Références permises dans le texte et les attributs : les cinq entités prédéfinies du XML et les caractères numériques.
// Toute autre (« &e; ») ne peut venir que d'une déclaration d'entité, que le fichier n'a pas le droit de contenir.
const UNKNOWN_REFERENCE = /&(?!(?:amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);)/;
function checkReferences(text) {
  if (UNKNOWN_REFERENCE.test(text)) throw fail('Référence d’entité inconnue : seules &amp; &lt; &gt; &quot; &apos; et les caractères numériques sont acceptés.');
}

// Hors de l'élément racine, seuls des blancs XML peuvent séparer déclarations, commentaires et racine
const XML_BLANK = /^[ \t\r\n]*$/;

/**
 * Arbre des éléments avec leurs positions dans le texte :
 * { name, start, openEnd, closeStart, end, selfClosing, children }. Erreur si le XML est mal formé,
 * y compris du texte avant ou après l'élément racine (le jeu ne pourrait pas lire le fichier).
 */
export function scan(xml) {
  const root = { name: null, children: [] };
  const stack = [root];
  let i = 0;
  const n = xml.length;
  const outside = (from, to) => {
    if (stack.length === 1 && !XML_BLANK.test(xml.slice(from, to))) throw fail('Texte hors de l’élément racine.');
  };
  while (i < n) {
    const lt = xml.indexOf('<', i);
    outside(i, lt < 0 ? n : lt);
    if (lt < 0) break;
    checkReferences(xml.slice(i, lt));
    if (xml.startsWith('<!--', lt)) {
      const e = xml.indexOf('-->', lt + 4);
      if (e < 0) throw fail('Commentaire non fermé.');
      i = e + 3;
    } else if (xml.startsWith('<![CDATA[', lt)) {
      const e = xml.indexOf(']]>', lt + 9);
      if (e < 0) throw fail('Bloc CDATA non fermé.');
      i = e + 3;
    } else if (xml.startsWith('<?', lt)) {
      const e = xml.indexOf('?>', lt + 2);
      if (e < 0) throw fail('Déclaration non fermée.');
      i = e + 2;
    } else if (xml.startsWith('<!', lt)) {
      // <!DOCTYPE …>, <!ENTITY …> : le jeu n'en écrit jamais, et une entité déclarée changerait ce que le jeu lit sans
      // que ce petit lecteur le voie (bloc de couleurs caché dans une entité, définition externe…). Refus : l'app ne
      // touche pas à un tel fichier.
      throw fail('Déclaration DOCTYPE ou ENTITY refusée : le jeu n’en écrit jamais.');
    } else if (xml[lt + 1] === '/') {
      const e = xml.indexOf('>', lt);
      if (e < 0) throw fail('Balise fermante incomplète.');
      const name = xml.slice(lt + 2, e).trim();
      const top = stack[stack.length - 1];
      if (stack.length < 2 || top.name !== name) throw fail(`Balise </${name}> inattendue.`);
      top.closeStart = lt;
      top.end = e + 1;
      stack.pop();
      i = e + 1;
    } else {
      // Balise ouvrante : les valeurs d'attributs entre guillemets peuvent contenir « > »
      let j = lt + 1;
      let quote = null;
      for (; j < n; j++) {
        const c = xml[j];
        if (quote) {
          if (c === quote) quote = null;
        } else if (c === '"' || c === "'") quote = c;
        else if (c === '>') break;
      }
      if (j >= n) throw fail('Balise incomplète.');
      const inner = xml.slice(lt + 1, j);
      checkReferences(inner); // valeurs des attributs
      const m = /^([A-Za-z_][\w.-]*)/.exec(inner);
      if (!m) throw fail('Nom de balise invalide.');
      const selfClosing = inner.trimEnd().endsWith('/');
      const node = { name: m[1], start: lt, openEnd: j + 1, selfClosing, children: [] };
      stack[stack.length - 1].children.push(node);
      if (selfClosing) {
        node.closeStart = j + 1;
        node.end = j + 1;
      } else stack.push(node);
      i = j + 1;
    }
  }
  if (stack.length > 1) throw fail(`Balise <${stack[stack.length - 1].name}> non fermée.`);
  return root.children;
}

const child = (node, name) => node?.children.find((c) => c.name === name) || null;

/** Texte brut d'un élément sans enfant. */
function textOf(xml, node) {
  if (node.selfClosing) return '';
  return xml.slice(node.openEnd, node.closeStart);
}

/** « 0.2, 0.2, 1 » → [0.2, 0.2, 1] ; null si ce n'est pas exactement 3 nombres. */
export function parseRow(text) {
  if (text.includes('<')) return null;
  const parts = text.trim().split(/\s*,\s*|\s+/).filter(Boolean);
  if (parts.length !== 3) return null;
  const nums = parts.map((p) => (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(p) ? Number(p) : NaN));
  return nums.every(Number.isFinite) ? nums : null;
}

/** Retire un éventuel BOM, garde de quoi le remettre. */
function splitBom(text) {
  return text.charCodeAt(0) === 0xfeff ? ['﻿', text.slice(1)] : ['', text];
}

/**
 * Lecture du fichier. Renvoie :
 * - empty : fichier vide (ou seulement la déclaration XML) ;
 * - hasBlock : un bloc GUIColour/Default existe ;
 * - matrix : la matrice appliquée par le jeu (lignes absentes : celles d'origine) ;
 * - rows : ce qui est écrit dans le fichier pour chaque ligne (null si absente, 'invalid' si illisible) ;
 * - otherSettings : le fichier contient d'autres réglages, qui seront gardés.
 * Erreur (code XML) si le fichier est illisible.
 */
export function readConfig(text) {
  const [, body] = splitBom(text);
  const nodes = scan(body);
  if (!nodes.length) {
    if (body.replace(/<\?[\s\S]*?\?>|<!--[\s\S]*?-->/g, '').trim()) throw fail('Texte hors de toute balise.');
    return { empty: true, hasBlock: false, matrix: structuredClone(IDENTITY), rows: { red: null, green: null, blue: null }, otherSettings: false };
  }
  if (nodes.length > 1) throw fail('Plusieurs éléments racines.');
  const root = nodes[0];
  if (root.name !== ROOT) throw fail(`L'élément racine est <${root.name}>, pas <${ROOT}>.`);
  const gui = child(root, 'GUIColour');
  const def = child(gui, 'Default');
  const matrix = structuredClone(IDENTITY);
  const rows = { red: null, green: null, blue: null };
  if (def) {
    for (const [key, tag] of ROWS) {
      const el = child(def, tag);
      if (!el) continue;
      const row = el.children.length ? null : parseRow(textOf(body, el));
      rows[key] = row || 'invalid';
      if (row) matrix[key] = row;
    }
  }
  const otherSettings = root.children.some((c) => c !== gui) || Boolean(gui && gui.children.some((c) => c !== def));
  return { empty: false, hasBlock: Boolean(def), matrix, rows, otherSettings };
}

/** Matrice reçue de l'interface : 3 lignes de 3 nombres finis entre −LIMIT et LIMIT. Sinon : message d'erreur. */
export function checkMatrix(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return 'Matrice manquante.';
  const out = {};
  for (const [key, tag] of ROWS) {
    const row = Object.hasOwn(m, key) ? m[key] : undefined;
    if (!Array.isArray(row) || row.length !== 3) return `${tag} : il faut 3 nombres.`;
    for (const v of row) {
      if (typeof v !== 'number' || !Number.isFinite(v)) return `${tag} : nombre invalide.`;
      if (Math.abs(v) > LIMIT) return `${tag} : chaque nombre doit rester entre −${LIMIT} et ${LIMIT}.`;
    }
    out[key] = row.map((v) => Number(v.toFixed(4)) || 0); // 4 décimales, jamais « -0 »
  }
  return out;
}

/** Nombre écrit comme dans les fichiers du jeu : « 0.2 », « 1 », « -0.15 ». */
export function formatNumber(v) {
  const r = Number(v.toFixed(4)) || 0;
  return String(r);
}

export const formatRow = (row) => row.map(formatNumber).join(', ');

function eolOf(text) {
  if (text.includes('\r\n')) return '\r\n';
  if (text.includes('\n')) return '\n';
  return '\r\n'; // fichiers du jeu sous Windows
}

/** Espaces en début de ligne avant la position (null si autre chose que des espaces les précède). */
function indentBefore(text, pos) {
  let j = pos;
  while (j > 0 && (text[j - 1] === ' ' || text[j - 1] === '\t')) j--;
  if (j === 0 || text[j - 1] === '\n' || text[j - 1] === '\r') return text.slice(j, pos);
  return null;
}

function defaultBlock(matrix, indent, unit, eol) {
  const inner = indent + unit;
  return [
    '<Default>',
    `${inner}<LocalisationName>Standard</LocalisationName>`,
    ...ROWS.map(([key, tag]) => `${inner}<${tag}>${formatRow(matrix[key])}</${tag}>`),
    `${indent}</Default>`,
  ].join(eol);
}

/** Balise ouvrante d'un élément vide (« <A x="1" /> ») réécrite sans la barre : « <A x="1"> ». */
function openTagOf(text, node) {
  return text.slice(node.start, node.openEnd).replace(/\s*\/>$/, '>');
}

/**
 * Nouveau texte du fichier avec ce bloc GUIColour/Default (créé ou remplacé). Le reste ne bouge pas.
 * Fichier absent ou vide : fichier neuf.
 */
export function withMatrix(text, matrix) {
  const [bom, body] = splitBom(text ?? '');
  const eol = eolOf(body);
  const nodes = scan(body);
  if (!nodes.length) {
    if (body.replace(/<\?[\s\S]*?\?>|<!--[\s\S]*?-->/g, '').trim()) throw fail('Texte hors de toute balise.');
    // Déclaration et commentaires éventuels gardés, la racine ajoutée après
    const unit = '  ';
    const head = body.trim() ? body.replace(/\s+$/, '') : DECLARATION;
    return `${bom}${head}${eol}<${ROOT}>${eol}${unit}<GUIColour>${eol}${unit}${unit}${defaultBlock(matrix, unit + unit, unit, eol)}${eol}${unit}</GUIColour>${eol}</${ROOT}>${eol}`;
  }
  if (nodes.length > 1 || nodes[0].name !== ROOT) throw fail(`L'élément racine doit être <${ROOT}>.`);
  const root = nodes[0];
  const rootIndent = indentBefore(body, root.start) ?? '';
  const gui = child(root, 'GUIColour');
  const def = child(gui, 'Default');
  const guiIndent = gui ? indentBefore(body, gui.start) : null;
  const unit = guiIndent && guiIndent.length > rootIndent.length ? guiIndent.slice(rootIndent.length) : '  ';
  const gIndent = guiIndent ?? rootIndent + unit;
  const splice = (from, to, s) => bom + body.slice(0, from) + s + body.slice(to);

  if (def) {
    const dIndent = indentBefore(body, def.start) ?? gIndent + unit;
    return splice(def.start, def.end, defaultBlock(matrix, dIndent, unit, eol));
  }
  const block = defaultBlock(matrix, gIndent + unit, unit, eol);
  if (gui) {
    if (gui.selfClosing) {
      return splice(gui.start, gui.end, `${openTagOf(body, gui)}${eol}${gIndent}${unit}${block}${eol}${gIndent}</GUIColour>`);
    }
    return splice(gui.openEnd, gui.openEnd, `${eol}${gIndent}${unit}${block}`);
  }
  const guiText = `<GUIColour>${eol}${gIndent}${unit}${block}${eol}${gIndent}</GUIColour>`;
  if (root.selfClosing) {
    return splice(root.start, root.end, `${openTagOf(body, root)}${eol}${gIndent}${guiText}${eol}${rootIndent}</${ROOT}>`);
  }
  return splice(root.openEnd, root.openEnd, `${eol}${gIndent}${guiText}`);
}

/** Retire un élément et ses espaces de début de ligne (et le retour à la ligne qui le précède). */
function removeNode(body, node) {
  let from = node.start;
  const indent = indentBefore(body, from);
  if (indent != null) {
    from -= indent.length;
    if (body[from - 1] === '\n') from--;
    if (body[from - 1] === '\r') from--;
  }
  return body.slice(0, from) + body.slice(node.end);
}

/** Rien que des espaces (ni texte, ni commentaire, ni élément) entre les balises de l'élément. */
const blankInside = (body, node) => !node.selfClosing && !body.slice(node.openEnd, node.closeStart).trim();

/**
 * Retour à l'orange d'origine : le bloc GUIColour/Default est retiré, puis GUIColour s'il est vide, et la
 * racine redevient « <GraphicsConfig /> » si plus rien ne reste. Le reste du fichier ne bouge pas.
 * Renvoie le texte inchangé s'il n'y a pas de bloc.
 */
export function withoutMatrix(text) {
  const [bom, original] = splitBom(text ?? '');
  let body = original;
  let root = scan(body)[0];
  if (!root || root.name !== ROOT) {
    if (!root) return text ?? '';
    throw fail(`L'élément racine doit être <${ROOT}>.`);
  }
  const def = child(child(root, 'GUIColour'), 'Default');
  if (!def) return text;
  body = removeNode(body, def);
  root = scan(body)[0];
  const gui = child(root, 'GUIColour');
  if (gui && (gui.selfClosing || blankInside(body, gui))) {
    body = removeNode(body, gui);
    root = scan(body)[0];
  }
  if (!root.selfClosing && blankInside(body, root)) {
    const open = body.slice(root.start, root.openEnd).replace(/\s*>$/, '');
    body = body.slice(0, root.start) + `${open} />` + body.slice(root.end);
  }
  return bom + body;
}
