// Lecture d'un fichier de données écrit en JavaScript (eddb.js d'EDSY) SANS JAMAIS L'EXÉCUTER.
//
// eddb.js est un script téléchargé de la forme « 'use strict'; var eddb = { … }; ». L'évaluer (vm, eval,
// new Function, import dynamique) reviendrait à faire tourner du code venu d'Internet. On lit donc son texte
// avec un petit analyseur qui ne connaît que les valeurs littérales : un fichier qui contient autre chose est
// refusé, avec la ligne et la colonne du problème.
//
// Accepté :
//   - objets { clé: valeur, … } ; clé = identifiant (mots réservés compris, comme « class »), chaîne ou nombre ;
//   - tableaux [ valeur, … ] ; une virgule finale est permise dans les objets comme dans les tableaux ;
//   - chaînes '…' ou "…" et leurs échappements (\n, \t, \', \\, \xHH, \uHHHH, \u{…}, fin de ligne échappée) ;
//   - nombres décimaux, hexadécimaux (0x), octaux (0o) et binaires (0b), précédés d'un signe - ou + éventuel ;
//   - true, false, null, undefined, NaN, Infinity ;
//   - le quotient de deux nombres (« 1/0 » pour l'infini, « 50/.77 ») : eddb.js écrit ainsi l'infini et
//     quelques coefficients. C'est la seule opération calculée, et seulement entre deux nombres écrits tels quels ;
//   - commentaires // et /* */.
// Refusé : tout le reste — appels, fonctions, variables, opérateurs (sauf la division ci-dessus), accès à une
// propriété, gabarits `…`, expressions régulières, clés calculées [x] ou abrégées { x }, méthodes, « ... »,
// trous dans un tableau [1,,2], clé __proto__ (elle changerait le prototype de l'objet au lieu d'être une donnée).
//
// Les objets produits sont des objets ordinaires remplis dans l'ordre du texte : l'ordre des clés est celui
// qu'aurait donné le moteur JavaScript (clés numériques d'abord, croissantes), une clé répétée garde sa
// dernière valeur. Les tableaux appartiennent au contexte courant (comparables avec assert.deepStrictEqual).
// Le résultat passe une fois par structuredClone : un objet rempli clé par clé (au-delà d'une quinzaine de clés)
// reste rangé par V8 en « dictionnaire », environ 5 fois plus lent à lire qu'un littéral ; la copie structurée le
// range comme un littéral, sans rien changer aux valeurs (NaN, Infinity, -0 et undefined compris).

/** Erreur de lecture : raison, et position dans le texte (décalage, ligne et colonne comptées à partir de 1). */
export class LiteralSyntaxError extends SyntaxError {
  constructor(reason, source, offset) {
    const before = source.slice(0, offset).split(/\r\n|[\n\r\u{2028}\u{2029}]/u);
    const line = before.length;
    const column = before[before.length - 1].length + 1;
    super(`${reason} (ligne ${line}, colonne ${column})`);
    this.name = 'LiteralSyntaxError';
    this.reason = reason;
    this.offset = offset;
    this.line = line;
    this.column = column;
  }
}

// Blancs et commentaires, en une seule passe (expression collante : elle ne lit qu'à la position courante)
const BLANKS = /(?:[\s\u{FEFF}]+|\/\/[^\n\r\u{2028}\u{2029}]*|\/\*[\s\S]*?\*\/)*/uy;
// Nombre sans signe : hexadécimal, octal, binaire, ou décimal avec partie fractionnaire et exposant éventuels
const NUMBER = /0[xX][0-9a-fA-F]+|0[oO][0-7]+|0[bB][01]+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/y;
// Identifiant (nom de clé ou mot-clé) : lettres Unicode, chiffres après la première, $ et _
const WORD = /[\p{ID_Start}$_][\p{ID_Continue}$\u{200C}\u{200D}]*/uy;
const WORD_PART = /[\p{ID_Continue}$\\]/u;
const HEX = /^[0-9a-fA-F]+$/;

// Seuls mots acceptés comme valeurs (une Map : aucun nom hérité d'Object.prototype ne peut s'y glisser)
const CONSTANTS = new Map([['true', true], ['false', false], ['null', null], ['undefined', undefined], ['NaN', NaN], ['Infinity', Infinity]]);
const NUMERIC_WORDS = new Set(['NaN', 'Infinity']);
const SIMPLE_ESCAPES = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v' };
const OPERATOR_CHARS = new Set([...'+-*/%&|^<>=!?~.([:']);

const DEFAULT_LIMITS = { maxDepth: 100, maxLength: 32 * 1024 * 1024 };

/** Analyseur : un curseur sur le texte, une méthode par sorte de valeur. */
class LiteralReader {
  constructor(source, limits) {
    if (typeof source !== 'string') throw new TypeError('Texte attendu.');
    this.src = source;
    this.pos = 0;
    this.limits = { ...DEFAULT_LIMITS, ...limits };
    if (source.length > this.limits.maxLength) this.fail(`texte trop long (${source.length} caractères)`, 0);
  }

  fail(reason, at = this.pos) {
    throw new LiteralSyntaxError(reason, this.src, at);
  }

  get char() {
    return this.src[this.pos];
  }

  get atEnd() {
    return this.pos >= this.src.length;
  }

  /** Avance après les blancs et les commentaires. */
  skipBlank() {
    BLANKS.lastIndex = this.pos;
    BLANKS.exec(this.src);
    this.pos = BLANKS.lastIndex;
    if (this.src.startsWith('/*', this.pos)) this.fail('commentaire /* non refermé');
  }

  /** Lit le mot à la position courante (identifiant ou mot-clé), ou null s'il n'y en a pas. */
  word() {
    WORD.lastIndex = this.pos;
    const m = WORD.exec(this.src);
    if (!m) return null;
    this.pos = WORD.lastIndex;
    return m[0];
  }

  /** Une valeur quelconque ; `depth` = nombre d'objets et tableaux qui l'entourent. */
  value(depth) {
    const c = this.char;
    if (c === '{' || c === '[') {
      // Limite vérifiée avant de descendre : un texte piégé ne peut pas faire déborder la pile
      if (depth >= this.limits.maxDepth) this.fail(`imbrication trop profonde (plus de ${this.limits.maxDepth} niveaux)`);
      return c === '{' ? this.object(depth) : this.array(depth);
    }
    if (c === '"' || c === "'") return this.string();
    if (c === '`') this.fail('gabarit `…` refusé : seules les valeurs littérales sont lues');
    if (c === undefined) this.fail('valeur attendue, fin du texte atteinte');
    if (this.src.startsWith('...', this.pos)) this.fail('« ... » refusé');
    if (c === '-' || c === '+' || c === '.' || (c >= '0' && c <= '9')) return this.arithmetic();
    const at = this.pos;
    const w = this.word();
    if (w !== null) {
      this.pos = at;
      if (NUMERIC_WORDS.has(w)) return this.arithmetic();
      this.pos += w.length;
      if (CONSTANTS.has(w)) return CONSTANTS.get(w);
      this.fail(`« ${w} » refusé : ni variable, ni fonction, ni appel, seulement des valeurs littérales`, at);
    }
    this.fail(`caractère inattendu « ${c} »`);
  }

  /** Nombre signé, éventuellement divisé par un autre : « -3 », « 1/0 », « 50/.77 ». */
  arithmetic() {
    const dividend = this.signedNumber();
    this.skipBlank();
    if (this.char !== '/') return dividend;
    this.pos++;
    this.skipBlank();
    const divisor = this.signedNumber();
    this.skipBlank();
    if (this.char === '/') this.fail('une seule division est permise entre deux nombres');
    return dividend / divisor;
  }

  /** Un nombre écrit tel quel (ou NaN, Infinity), précédé d'un seul signe éventuel. */
  signedNumber() {
    let negative = false;
    const sign = this.char;
    if (sign === '-' || sign === '+') {
      negative = sign === '-';
      this.pos++;
      this.skipBlank();
      if (this.char === '-' || this.char === '+') this.fail('signe répété refusé');
    }
    const at = this.pos;
    let magnitude;
    NUMBER.lastIndex = at;
    const m = NUMBER.exec(this.src);
    if (m) {
      if (/^0\d/.test(m[0])) this.fail(`nombre « ${m[0]} » refusé : écriture octale ancienne`, at);
      this.pos = NUMBER.lastIndex;
      if (!this.atEnd && WORD_PART.test(this.char)) this.fail('nombre mal formé', at);
      magnitude = Number(m[0]);
    } else {
      const w = this.word();
      if (!NUMERIC_WORDS.has(w)) this.fail('nombre attendu', at);
      magnitude = CONSTANTS.get(w);
    }
    // -0 reste -0, comme dans le moteur JavaScript
    return negative ? -magnitude : magnitude;
  }

  /** Chaîne entre apostrophes ou guillemets. */
  string() {
    const start = this.pos;
    const quote = this.src[start];
    let out = '';
    let i = start + 1;
    let chunk = i;
    for (;;) {
      const c = this.src[i];
      if (c === undefined) this.fail('chaîne non refermée', start);
      if (c === quote) {
        this.pos = i + 1;
        return out + this.src.slice(chunk, i);
      }
      if (c === '\n' || c === '\r') this.fail('retour à la ligne dans une chaîne', i);
      if (c === '\\') {
        out += this.src.slice(chunk, i);
        const [text, next] = this.escape(i + 1);
        out += text;
        i = chunk = next;
      } else {
        i++;
      }
    }
  }

  /** Séquence d'échappement commençant juste après la barre oblique inverse : [texte produit, position suivante]. */
  escape(i) {
    const c = this.src[i];
    if (c === undefined) this.fail('chaîne non refermée', i);
    if (Object.hasOwn(SIMPLE_ESCAPES, c)) return [SIMPLE_ESCAPES[c], i + 1];
    if (c === '\r') return ['', this.src[i + 1] === '\n' ? i + 2 : i + 1]; // fin de ligne échappée : rien
    if (c === '\n' || c === '\u{2028}' || c === '\u{2029}') return ['', i + 1];
    if (c >= '0' && c <= '9') {
      const next = this.src[i + 1];
      if (c === '0' && !(next >= '0' && next <= '9')) return ['\0', i + 1];
      this.fail('échappement octal refusé', i - 1);
    }
    if (c === 'x') {
      const hex = this.src.slice(i + 1, i + 3);
      if (hex.length !== 2 || !HEX.test(hex)) this.fail('échappement \\x mal formé', i - 1);
      return [String.fromCharCode(parseInt(hex, 16)), i + 3];
    }
    if (c === 'u') {
      if (this.src[i + 1] === '{') {
        const close = this.src.indexOf('}', i + 2);
        const hex = close < 0 ? '' : this.src.slice(i + 2, close);
        const code = HEX.test(hex) ? parseInt(hex, 16) : NaN;
        if (!(code <= 0x10ffff)) this.fail('échappement \\u{…} mal formé', i - 1);
        return [String.fromCodePoint(code), close + 1];
      }
      const hex = this.src.slice(i + 1, i + 5);
      if (hex.length !== 4 || !HEX.test(hex)) this.fail('échappement \\u mal formé', i - 1);
      return [String.fromCharCode(parseInt(hex, 16)), i + 5];
    }
    return [c, i + 1]; // \' \" \\ et tout autre caractère : lui-même
  }

  /** Nom d'une propriété : identifiant, chaîne, ou nombre (écrit sous sa forme canonique : 0x10 → « 16 »). */
  key() {
    const c = this.char;
    if (c === '"' || c === "'") return this.string();
    if (c === '[') this.fail('clé calculée [ … ] refusée');
    if (this.src.startsWith('...', this.pos)) this.fail('« ... » refusé');
    if (c === '.' || (c >= '0' && c <= '9')) {
      const at = this.pos;
      NUMBER.lastIndex = at;
      const m = NUMBER.exec(this.src);
      if (!m || /^0\d/.test(m[0])) this.fail('clé numérique mal formée', at);
      this.pos = NUMBER.lastIndex;
      if (!this.atEnd && WORD_PART.test(this.char)) this.fail('clé numérique mal formée', at);
      return String(Number(m[0]));
    }
    const w = this.word();
    if (w === null) this.fail(c === undefined ? 'fin du texte inattendue : clé attendue' : `clé attendue, « ${c} » trouvé`);
    return w;
  }

  object(depth) {
    const out = {};
    this.pos++; // {
    for (;;) {
      this.skipBlank();
      if (this.char === '}') {
        this.pos++;
        return out;
      }
      const at = this.pos;
      const name = this.key();
      if (name === '__proto__') this.fail('clé __proto__ refusée', at);
      this.skipBlank();
      if (this.char !== ':') {
        if (this.char === '(') this.fail(`méthode « ${name}() » refusée`, at);
        if (this.char === ',' || this.char === '}') this.fail(`propriété abrégée « ${name} » refusée (« ${name}: valeur » attendu)`, at);
        this.fail(`« : » attendu après la clé « ${name} »`);
      }
      this.pos++;
      this.skipBlank();
      out[name] = this.value(depth + 1);
      if (this.closeOrContinue('}')) return out;
    }
  }

  array(depth) {
    const out = [];
    this.pos++; // [
    for (;;) {
      this.skipBlank();
      if (this.char === ']') {
        this.pos++;
        return out;
      }
      if (this.char === ',') this.fail('trou dans un tableau refusé');
      out.push(this.value(depth + 1));
      if (this.closeOrContinue(']')) return out;
    }
  }

  /** Après un élément : « , » (on continue, retourne false) ou le délimiteur fermant (retourne true). */
  closeOrContinue(closer) {
    this.skipBlank();
    const c = this.char;
    if (c === ',') {
      this.pos++;
      return false;
    }
    if (c === closer) {
      this.pos++;
      return true;
    }
    this.unexpectedAfterValue(closer);
  }

  unexpectedAfterValue(expected) {
    const c = this.char;
    if (c === undefined) this.fail(`fin du texte inattendue : « ${expected} » attendu`);
    if (OPERATOR_CHARS.has(c)) this.fail(`opérateur ou appel « ${c} » refusé : seules les valeurs littérales sont lues`);
    this.fail(`« , » ou « ${expected} » attendu, « ${c} » trouvé`);
  }
}

/**
 * Lit un texte qui ne contient qu'une valeur littérale JavaScript (blancs et commentaires autour permis).
 * @param {string} text
 * @param {{ maxDepth?: number, maxLength?: number }} [limits]
 * @throws {LiteralSyntaxError} dès qu'autre chose qu'une valeur littérale est rencontré
 */
export function parseLiteral(text, limits) {
  const r = new LiteralReader(text, limits);
  r.skipBlank();
  const v = r.value(0);
  r.skipBlank();
  if (!r.atEnd) r.unexpectedAfterValue('fin du texte');
  return structuredClone(v);
}

/**
 * Lit un script de données : directives éventuelles ('use strict';), puis une seule déclaration
 * « var|let|const <nom> = <valeur littérale> ; ». Rien d'autre n'est accepté, avant comme après.
 * @param {string} text contenu du fichier (un BOM en tête est ignoré)
 * @param {string} name nom de la variable déclarée (ex. « eddb »)
 * @returns {*} la valeur affectée à la variable
 * @throws {LiteralSyntaxError}
 */
export function parseDataScript(text, name, limits) {
  const r = new LiteralReader(text, limits);
  r.skipBlank();
  // Directives en tête de script : de simples chaînes, sans effet sur la lecture
  while (r.char === "'" || r.char === '"') {
    r.string();
    r.skipBlank();
    if (r.char === ';') r.pos++;
    r.skipBlank();
  }
  const at = r.pos;
  const keyword = r.word();
  if (keyword !== 'var' && keyword !== 'let' && keyword !== 'const') r.fail(`déclaration « var ${name} = … » attendue`, at);
  r.skipBlank();
  const id = r.word();
  if (id !== name) r.fail(`variable « ${name} » attendue`);
  r.skipBlank();
  if (r.char !== '=') r.fail('« = » attendu');
  r.pos++;
  r.skipBlank();
  const v = r.value(0);
  r.skipBlank();
  if (r.char === ';') r.pos++;
  r.skipBlank();
  if (!r.atEnd) r.fail(`texte en trop après la déclaration de « ${name} » : seule « var ${name} = {…}; » est acceptée`);
  return structuredClone(v);
}
