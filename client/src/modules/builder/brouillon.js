// Éditeur de build (pages/BuildEditor.jsx) : ce qui compte pour savoir s'il reste des changements non enregistrés, et
// les remarques d'import (modules inconnus…), gardées à part des erreurs d'appel.

/**
 * Empreinte de ce que le joueur enregistrerait : nom, vaisseau, emplacements (modules et ingénierie), vaisseau visé
 * et notes. Les pips SYS et l'emplacement choisi n'en font pas partie : ils ne sont pas enregistrés.
 */
export function empreinteBuild(build, meta) {
  if (!build) return null;
  return JSON.stringify({
    shipId: build.shipId,
    name: build.name ?? '',
    slots: build.slots,
    gameShipId: meta?.gameShipId === '' || meta?.gameShipId == null ? null : Number(meta.gameShipId),
    notes: meta?.notes ?? '',
  });
}

/** Le build affiché diffère-t-il de sa dernière version enregistrée (ou chargée) ? */
export function modifie(build, meta, reference) {
  if (!build || reference == null) return false;
  return empreinteBuild(build, meta) !== reference;
}

/** Texte des remarques d'un import ou d'un départ (modules non reconnus…), ou null. */
export function texteRemarques(warnings) {
  const liste = (warnings || []).filter(Boolean);
  return liste.length ? liste.join(' · ') : null;
}
