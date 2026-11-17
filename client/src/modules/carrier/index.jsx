import { HudOverlay, useLiveSession } from '../../core/hud.jsx';
import { useNow } from '../../core/stream.js';
import { clock, int, time } from '../../core/format.js';
import NomSysteme from '../../core/NomSysteme.jsx';

/**
 * Page de l'overlay (/hud/carrier) : compte à rebours du saut programmé du porteur.
 * Le serveur ouvre la fenêtre à la programmation du saut et la ferme après le saut ou à l'annulation.
 */
function CarrierOverlay() {
  const { data } = useLiveSession('/modules/carrier', 'carrier:update', { horloge: false }); // son propre compte à rebours (now)
  const now = useNow(1000);
  const jump = data?.jump;
  if (!jump) return <HudOverlay props={null} />;

  const left = Math.max(0, (Date.parse(jump.departure) - now) / 1000);
  const c = jump.carrier;
  return (
    <HudOverlay props={{
      title: '⛴ Saut porteur',
      seconds: null, // le compte à rebours est la case principale
      tag: 'Porteur',
      square: true,
      cells: [
        {
          label: left > 0 ? 'Départ dans' : 'Départ',
          value: left > 0 ? clock(left) : 'En cours',
          big: true,
          still: true,
          color: left === 0 ? '#5fd38d' : left < 60 ? '#ff6b6b' : 'var(--accent)',
          sub: '',
        },
        { label: 'Destination', value: jump.system, text: true, color: '#6fd3ff', sub: jump.body || '' },
        { label: 'Heure de départ', value: time(jump.departure), color: '#ffd24a', sub: `demandé à ${time(jump.requestedAt)}` },
        { label: 'Tritium', value: c?.fuel != null ? `${int(c.fuel)} t` : '—', color: '#d3a6ff', sub: c?.callsign || '' },
      ],
      last: left > 0
        ? <span><b>{c?.name || '—'}</b> part pour <NomSysteme nom={jump.system} /></span>
        : <span><b>{c?.name || '—'}</b> : saut en cours…</span>,
    }} />
  );
}

export default {
  id: 'carrier',
  title: 'Saut du porteur',
  Hud: CarrierOverlay, // pas de page : seulement la fenêtre, ouverte d'elle-même
};
