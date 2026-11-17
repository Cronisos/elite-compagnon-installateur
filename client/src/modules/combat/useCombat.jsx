// Session de combat en temps réel, et son contenu dans le HUD (mini-fenêtre et overlay) ; alerte du vaisseau.

import { perHour, useLiveSession } from '../../core/hud.jsx';
import { api } from '../../core/api.js';
import { compact, cr, int, time } from '../../core/format.js';

export function useCombat() {
  const session = useLiveSession('/modules/combat', 'combat:update');
  const { data, seconds } = session;
  return {
    ...session,
    creditsHour: data && perHour(data.credits, seconds),
    meritsHour: data && perHour(data.merits.combat, seconds),
    // Seuil de l'alerte du vaisseau (%) : la session revient avec la nouvelle alerte (combat:update)
    setSeuil: (seuil) => api('/modules/combat/alerte', { method: 'PUT', body: { seuil } }),
  };
}

/**
 * Case « Coque » du HUD : la coque en direct (le jeu l'écrit par paliers de 20 %), qui clignote sous le seuil ; contour
 * rouge si des modules sont sous le seuil au dernier relevé ; boucliers tombés.
 */
export function caseCoque(v) {
  if (!v) return null;
  const sub = [v.boucliers === false && 'boucliers ↓', v.sousSeuil.length && `${v.sousSeuil.length} mod. < ${v.seuil} %`].filter(Boolean).join(' · ');
  return {
    label: 'Coque',
    value: v.coque == null ? '—' : `${v.coque} %`,
    color: v.coqueBasse ? '#ff4d4d' : v.coque != null && v.coque < 60 ? '#ffb547' : '#5fd38d',
    sub,
    alert: v.coqueBasse,
    warn: v.sousSeuil.length > 0,
  };
}

/** Ligne du bas en alerte : les modules sous le seuil au dernier relevé, et l'heure du relevé. */
function ligneModules(v) {
  return (
    <>
      {v.sousSeuil.map((m, i) => <span key={`${m.nom}-${i}`} className="hud-mod-bas">{m.nom} <b>{m.sante} %</b></span>)}
      {v.releveAt && <span>relevé {time(v.releveAt)}</span>}
    </>
  );
}

/** Props du HUD : abattus, primes, mérites, coque ; le dernier kill, ou les modules abîmés. */
export function combatHud({ data, seconds, chrono, resetTime, creditsHour, meritsHour, pause, togglePause }) {
  if (!data) return null;
  const last = data.recent[0];
  const v = data.vaisseau;
  const coque = caseCoque(v);
  return {
    title: '⚔ Combat',
    seconds: chrono ?? seconds, // chrono affiché : depuis le dernier ↺ (les taux gardent toute la session)
    pause,
    onPause: togglePause,
    onResetTime: resetTime,
    ...(coque ? { columns: 'auto repeat(4, 1fr)' } : {}),
    cells: [
      { label: 'Abattus', value: int(data.kills), color: 'var(--accent)', sub: data.deaths ? `${data.deaths} destr.` : '' },
      { label: 'Primes', value: compact(data.credits), color: '#5fd38d', sub: creditsHour != null ? `${compact(creditsHour)}/h` : '' },
      { label: 'Mérites', value: int(data.merits.combat), color: '#ffd24a', sub: meritsHour != null ? `${int(meritsHour)}/h` : '' },
      ...(coque ? [coque] : []),
    ],
    ...(v?.sousSeuil.length ? { tag: 'Modules', tagClass: 'hud-tag-alerte', last: ligneModules(v) } : {
      last: last ? (
        <>
          <b>{last.ship || last.kind}</b>
          <span>{last.faction || last.kind} · {time(last.at)}</span>
          {(last.reward > 0 || last.merits > 0) && (
            <span className="hud-gain">{last.reward > 0 && `+${cr(last.reward)}`}{last.merits > 0 && ` (${int(last.merits)} mérites)`}</span>
          )}
        </>
      ) : <span>aucun kill pour l'instant</span>,
    }),
  };
}
