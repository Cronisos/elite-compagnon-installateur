// Objectifs communautaires (OC) du Coup d'œil : case de la fenêtre en jeu, bloc et lignes « À encaisser » du panneau.
// Seuils des tranches et des paliers non publiés : aucune estimation de la suite.

import { useEffect, useState } from 'react';
import { compact } from '../../core/format.js';
import { bandText, contributionText, endText, placeText, shownGoals, tierText, zeroAlert } from './communityGoalsView.js';

// Turquoise : couleur libre dans la fenêtre (orange crédits, jaune mérites, vert soute, violet missions, bleu projet)
const CG_COLOR = '#3fd0d4';

const CSS = `
.gw-cg { margin-top: 5px; min-width: 0; }
.gw-cg + .gw-cg { border-top: 1px solid rgba(255,255,255,.07); padding-top: 5px; }
.gw-cg-head { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.gw-cg-head b { font-size: 14px; color: #f4f6f8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gw-cg-head em { font-style: normal; font-size: 12px; color: #8a94a0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gw-cg-end { margin-left: auto; color: var(--c); font-size: 12px; font-weight: 600; white-space: nowrap; font-variant-numeric: tabular-nums; }
.gw-cg-alert { color: #ff6b6b; font-size: 12px; font-weight: 600; }
/* Case en hud-warn pour un seul OC : les lignes des autres OC gardent leur gris (hud.jsx met tout .hud-sub en rouge) */
.hud-warn .gw-cg:not(.is-alert) .hud-sub { color: #8a94a0; font-weight: inherit; }
`;

/** Heure courante, rafraîchie toutes les minutes : le temps restant avance sans nouvel événement du journal. */
function useNow(ms = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** Fenêtre en jeu : une case pour les OC en cours, seulement s'il y en a ; rouge si une contribution nulle approche de la fin. */
export function CommunityGoalsCell({ goals }) {
  const now = useNow();
  const active = shownGoals(goals, now);
  if (!active.length) return null;
  const alerts = active.filter((g) => zeroAlert(g, goals.alertHours, now));
  return (
    <div className={`hud-cell gw-wide ${alerts.length ? 'hud-warn' : ''}`} style={{ '--c': CG_COLOR }}>
      <style>{CSS}</style>
      <div className="gw-head">
        <div className="hud-label">{active.length > 1 ? 'Objectifs communautaires' : 'Objectif communautaire'}</div>
        {active.length > 1 && <span className="gw-total">{active.length}</span>}
      </div>
      {active.map((g) => {
        const alert = alerts.includes(g);
        return (
          <div key={g.id} className={`gw-cg${alert ? ' is-alert' : ''}`}>
            <div className="gw-cg-head">
              <b>{g.title || `OC n° ${g.id}`}</b>
              {g.station && <em>{g.station}</em>}
              <span className="gw-cg-end">{endText(g, now)}</span>
            </div>
            <span className="hud-sub">
              {contributionText(g)} · {bandText(g)} · {tierText(g)}{g.reward ? ` · prévu ${compact(g.reward)} cr` : ''}
            </span>
            {alert && (
              <div className="gw-cg-alert">Contribution nulle : {endText(g, now)}{placeText(g) ? ` · ${placeText(g)}` : ''}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Panneau : bloc des OC en cours (les récompenses à réclamer sont dans « À encaisser »). */
export function CommunityGoalsBlock({ goals }) {
  const now = useNow();
  const active = shownGoals(goals, now);
  if (!active.length) return null;
  return (
    <section className="glance-block">
      <div className="glance-block-head">
        <h3>{active.length > 1 ? 'Objectifs communautaires' : 'Objectif communautaire'}</h3>
      </div>
      {active.map((g) => (
        <div key={g.id} className="small" style={{ marginBottom: '0.4rem' }}>
          <strong>{g.title || `OC n° ${g.id}`}</strong>
          {placeText(g) && <span className="muted"> · {placeText(g)}</span>}
          <div className={zeroAlert(g, goals.alertHours, now) ? 'bad' : 'muted'}>
            {endText(g, now)}{zeroAlert(g, goals.alertHours, now) ? ' · contribution nulle' : ''}
          </div>
          <div>
            {contributionText(g)} · {bandText(g)} · {tierText(g)}
            {g.reward ? <span className="muted"> · récompense prévue {compact(g.reward)} cr</span> : null}
          </div>
        </div>
      ))}
      <p className="tiny muted">
        Le journal ne liste que les OC rejoints. Seuils des tranches et des paliers non publiés : pas d'estimation de la suite.
      </p>
    </section>
  );
}

/** Panneau, liste « À encaisser » : une ligne par récompense d'OC à réclamer, avec la station. */
export function CommunityGoalCashRows({ goals }) {
  const toClaim = goals?.toClaim || [];
  return toClaim.map((g) => (
    <CashRow key={g.id} goal={g} />
  ));
}

function CashRow({ goal: g }) {
  return (
    <>
      <dt title={g.title}>Objectif communautaire</dt>
      <dd className="num warn">
        {g.reward ? `${compact(g.reward)} cr` : 'montant inconnu'} · à réclamer à {placeText(g) || 'la station de l’OC'}
      </dd>
    </>
  );
}
