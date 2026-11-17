// Carburant de l'itinéraire, côté fenêtre en jeu (fonctions pures, testées par carburant.test.js). Le calcul vient du
// serveur (server/src/modules/navroute/state.js, règles dans server/src/regles/saut.js).

const t = (v) => `${String(Math.round(v * 10) / 10).replace('.', ',')} t`;
const sauts = (n) => `${n} saut${n > 1 ? 's' : ''}`;

/** Sous-titre de la prochaine étoile : récupérable ou non, et sans effet s'il n'y a pas de récupérateur. */
export function etoileSous(recuperable, fuel) {
  if (fuel && !fuel.scoop) return recuperable ? 'récupérable, mais pas de récupérateur' : 'non récupérable';
  return recuperable ? 'récupérable' : 'non récupérable';
}

/** Case « Carburant » : niveau, et pour combien de sauts de la route. */
export function carburantCellule(fuel) {
  const portee = !fuel.known ? 'conso. connue au 1er saut' : fuel.all ? 'jusqu’au bout' : `pour ${sauts(fuel.jumps)}`;
  const color = fuel.alerte ? '#ff6b6b' : fuel.known && !fuel.all && fuel.jumps < 4 ? '#ffd24a' : '#5fd38d';
  return { label: 'Carburant', value: fuel.level == null ? '—' : t(fuel.level), text: true, color, sub: portee };
}

/** Ligne du bas : l'alerte si le carburant ne couvre pas les sauts suivants ; sans récupérateur, un rappel ; sinon null. */
export function carburantLigne(fuel) {
  if (!fuel) return null;
  const a = fuel.alerte;
  if (a) {
    const quand = a.in === 1 ? 'Le prochain saut' : `Le saut ${a.in}`;
    return {
      alerte: true,
      texte: `⚠ Carburant : ${quand} (${a.name}) ne passe pas : il resterait ${t(a.fuel)}, il en faut environ ${t(a.need)} (${a.raison}). Fais le plein avant de continuer.`,
    };
  }
  // Sans récupérateur : un rappel en rouge (pas une alerte qui clignote), même quand le réservoir suffit
  if (!fuel.scoop) {
    return { alerte: false, rouge: true, texte: fuel.known && !fuel.all ? `Pas de récupérateur : réservoir pour ${sauts(fuel.jumps)}, ravitaille en station.` : 'Pas de récupérateur de carburant : ravitaille en station.' };
  }
  return null;
}
