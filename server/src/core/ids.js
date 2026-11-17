// Identifiants reçus dans une adresse (req.params), une requête (?id=) ou un corps : vérifiés strictement avant tout
// accès à la base. Number() accepterait « 1.5 », « 0x10 », « 1e3 », « -1 », « 01 », « » (0) ou « ١ » (chiffre arabe), et
// la base en arrondit certains : « 1.5 » modifiait ou effaçait la ligne 1. Un identifiant impossible ne désigne rien.

/** Plus grand Int de Prisma (SQLite) : au-delà, la base refuse la valeur (erreur, pas un « introuvable »). */
export const MAX_ROW_ID = 2_147_483_647;

function wholeNumber(value, min) {
  if (typeof value === 'number') return Number.isInteger(value) && value >= min && value <= MAX_ROW_ID ? value : null;
  if (typeof value !== 'string' || !(min === 0 ? /^(0|[1-9][0-9]{0,9})$/ : /^[1-9][0-9]{0,9}$/).test(value)) return null;
  const n = Number(value);
  return n <= MAX_ROW_ID ? n : null;
}

/** Identifiant de ligne (Int autoincrement) : entier, ou texte décimal sans signe ni zéro de tête, de 1 à MAX_ROW_ID ; sinon null. */
export const rowId = (value) => wholeNumber(value, 1);

/** Numéro de vaisseau du jeu (ShipID du journal, qui commence à 0) : entier de 0 à MAX_ROW_ID ; sinon null. */
export const gameShipId = (value) => wholeNumber(value, 0);

/** Erreur lisible (status + publicMessage, comme les erreurs des modules). */
export function idError(status, message) {
  const err = new Error(message);
  err.status = status;
  err.publicMessage = message;
  return err;
}

/** rowId, ou erreur 404 « message » (« Build introuvable. ») : un identifiant impossible ne désigne aucune ligne. */
export function requireRowId(value, message) {
  const id = rowId(value);
  if (id == null) throw idError(404, message);
  return id;
}
