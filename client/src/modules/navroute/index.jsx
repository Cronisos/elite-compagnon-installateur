import { HudOverlay, useLiveSession } from '../../core/hud.jsx';
import { dec1, int } from '../../core/format.js';
import { carburantCellule, carburantLigne, etoileSous } from './carburant.js';
import NomSysteme, { BoutonCopier } from '../../core/NomSysteme.jsx';

/**
 * Page de l'overlay (/hud/navroute) : avancement de l'itinéraire tracé et carburant.
 * Le serveur ouvre la fenêtre au tracé d'un itinéraire de plus de 2 sauts, ou dès que le carburant ne couvre pas les
 * 2 sauts suivants (récupérateur de carburant compris), et la ferme à l'arrivée.
 */
function RouteOverlay() {
  const { data: r } = useLiveSession('/modules/navroute', 'navroute:update', { horloge: false }); // ni chrono ni taux
  if (!r) return <HudOverlay props={null} />;

  const bad = r.nextUnscoopable;
  const fuel = r.fuel;
  const ligne = carburantLigne(fuel);
  const sansRecup = fuel && !fuel.scoop;
  return (
    <HudOverlay props={{
      title: '➤ Itinéraire',
      seconds: null,
      square: true,
      tag: 'Carburant',
      cells: [
        { label: 'Sauts restants', value: int(r.jumpsLeft), big: true, still: true, center: true, color: 'var(--accent)', sub: `sur ${int(r.total)}` },
        // Nom seul dans la valeur (coupé en « … » s'il est long) ; 📋 à côté de la distance
        { label: 'Destination', value: r.destination, text: true, color: '#6fd3ff', sub: <span>{dec1(r.distance)} AL <BoutonCopier texte={r.destination} /></span> },
        {
          label: 'Prochaine étoile',
          value: r.next.starClass || '—',
          text: true,
          // Sans récupérateur, une étoile récupérable ne sert à rien : grisée
          color: sansRecup ? '#8a94a0' : r.next.scoopable ? '#5fd38d' : '#ff6b6b',
          sub: etoileSous(r.next.scoopable, fuel),
        },
        fuel
          ? carburantCellule(fuel)
          : { label: 'Non récupérables', value: int(r.unscoopable), center: true, color: r.unscoopable ? '#ffd24a' : '#5fd38d', sub: 'sur la route' },
      ],
      last: ligne
        ? <span style={{ color: ligne.alerte || ligne.rouge ? '#ff6b6b' : undefined }}>{ligne.alerte ? <b>{ligne.texte}</b> : ligne.texte}{fuel?.alerte && <BoutonCopier texte={fuel.alerte.name} />}</span>
        : bad
          ? <span><b>Non récupérable dans {bad.in} saut{bad.in > 1 ? 's' : ''}</b> · <NomSysteme nom={bad.name} /> ({bad.starClass})</span>
          : <span>toutes les étoiles de la route sont récupérables</span>,
    }} />
  );
}

export default {
  id: 'navroute',
  title: 'Itinéraire',
  Hud: RouteOverlay, // pas de page : seulement la fenêtre, ouverte d'elle-même
};
