// Le rapport de la semaine (bannière animée, systèmes travaillés, ton bilan, classement des activités) : affiché dans
// l'onglet Historique des mérites, et seul sur la page de capture (/capture/rapport-semaine) qui en fait un GIF pour
// Discord (desktop/main.js).

import { int } from '../../core/format.js';
import RouteMap, { Sky } from './RouteMap.jsx';
import NomSysteme from '../../core/NomSysteme.jsx';

// Ordre fixe des couleurs (palette validée sur le fond sombre) : il sert aussi d'ordre d'empilement
export const ACTIVITIES = {
  combat: { label: 'Combat', color: '#3987e5' },
  mining: { label: 'Minage', color: '#d95926' },
  rescue: { label: 'Sauvetage', color: '#199e70' },
  trade: { label: 'Commerce', color: '#c98500' },
  missions: { label: 'Missions', color: '#d55181' },
  exobiology: { label: 'Exobiologie', color: '#008300' },
  delivery: { label: 'Livraisons Powerplay', color: '#9085e9' },
  exploration: { label: 'Exploration', color: '#e66767' },
  other: { label: 'Autre', color: '#6b7480' },
};
export const ORDER = Object.keys(ACTIVITIES);
const ROLE_LABELS = {
  'held-stronghold': 'Déjà Forteresse',
  'held-fortified': 'Déjà Consolidé',
  fortified: 'Objectif Consolidé',
  stronghold: 'Objectif Forteresse',
  target: 'Arrivée',
};
const STATES = { Exploited: 'Exploité', Fortified: 'Consolidé', Stronghold: 'Forteresse', Unoccupied: 'Inoccupé' };

const dayName = (ms) => new Date(ms).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
const longDay = (ms) => new Date(ms).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const hour = (ms) => `${new Date(ms).getHours()} h`;
const stamp = (ms) => `${dayName(ms)} à ${new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;

const deadline = (ms) => `${longDay(ms)} ${hour(ms)}`;

/** Ton total dans un système, depuis le début des journaux, et tes points que le jeu n'a pas encore relevés. */
function MyTotal({ info, check, alone }) {
  return (
    <div className="mh-mine">
      {!alone && <p className="mh-sys-sub"><NomSysteme nom={info.system} /></p>}
      <dl className="mh-bilan">
        <dt>Mérites gagnés</dt><dd>{int(info.mine.merits)}</dd>
        <dt>Points de contrôle gagnés</dt><dd>{int(info.mine.points)}</dd>
        {info.pendingPoints > 0 && (
          <><dt>Pas encore relevés par le jeu <span className="mh-ratio">un saut dans le système les fait apparaître</span></dt><dd>≈ {int(info.pendingPoints)} pts</dd></>
        )}
      </dl>
      {check?.counted === false && (
        <p className="mh-check mh-check-warn">
          ⚠ Le relevé de tous les joueurs est plus bas que tes seuls ≈ {int(check.mine)} pts de la semaine : il manque des tiens. Refais un relevé sur place.
        </p>
      )}
    </div>
  );
}

/**
 * Infos générales d'un système d'après le dernier relevé du jeu (tous joueurs de la puissance) : niveau, points de
 * contrôle, ce qu'il manque pour le palier suivant et pour l'objectif de la route. Palier déclaré atteint par le
 * joueur (paliers.js côté serveur) : jauge pleine, « en attente du passage ». `onPalier` : le bouton qui le déclare
 * (onglet seulement, jamais sur l'image partagée).
 */
function SystemInfo({ info, role, current, end, onPalier }) {
  const r = info.reading;
  const declarable = onPalier && current && r?.mode === 'reinforcement' && info.next;
  return (
    <li className="mh-sys">
      <div className="mh-sys-head">
        <span className="mh-sys-name"><NomSysteme nom={info.system} /></span>
        {role && <span className="mh-sys-role">{ROLE_LABELS[role]}</span>}
      </div>
      {!r && <p className="muted small">Pas encore de relevé du jeu : passe dans le système pour voir son état.</p>}
      {r && (
        <dl className="mh-bilan">
          <dt>Niveau{' '}{r.stale && <span className="mh-ratio">avant le passage de jeudi</span>}</dt><dd className="mh-level">{STATES[r.state] || r.state}</dd>
          {info.band && (
            <>
              <dt>Points de contrôle du système</dt>
              <dd>{int(info.bandPoints)} <span className="mh-of">/ {int(info.band)}</span></dd>
              <dd className="mh-gauge"><span style={{ width: `${Math.min(100, (info.bandPoints / info.band) * 100)}%` }} /></dd>
            </>
          )}
          {r.mode === 'reinforcement' && !r.stale && (
            <><dt>Renforcement de la semaine <span className="mh-ratio">tous joueurs</span></dt><dd>{int(r.week)}</dd></>
          )}
          {r.undermining > 0 && (
            <><dt>Sape de la semaine <span className="mh-ratio">érosion du passage comprise</span></dt><dd className="mh-bad">{int(r.undermining)}</dd></>
          )}
          {info.erosion && (
            <>
              <dt title="Érosion = (points au passage − 25 % du palier) ÷ 12 (Règles du jeu › Powerplay)">
                Érosion prévue au passage
                <span className="mh-ratio">si la jauge reste à {int(info.erosion.base)}{info.erosion.verifiee ? '' : ' · règle vérifiée en Exploité seulement'}</span>
              </dt>
              <dd className="mh-bad">−{int(info.erosion.points)} pts</dd>
            </>
          )}
          {info.declared && (
            <dd className="mh-check mh-attente">✓ Palier atteint · {STATES[info.next]} au passage de semaine, {deadline(end)}</dd>
          )}
          {info.next && !info.declared && (
            <>
              <dt>
                Pour passer {STATES[info.next]}
                <span className="mh-ratio">{current ? `avant le passage de semaine, ${deadline(end)}` : 'au dernier relevé de la semaine'}</span>
              </dt>
              <dd>
                {info.missingNext == null ? 'à relever' : info.missingNext > 0 ? <>{int(info.missingNext)} pts</> : 'atteint ✓'}
                {info.missingNext > 0 && <span className="mh-ratio">≈ {int(info.missingNext * 4)} mérites</span>}
              </dd>
            </>
          )}
          {!info.next && <><dt>Palier suivant</dt><dd>niveau maximum</dd></>}
          {info.goal && info.goal !== info.next && (
            <>
              <dt>Objectif de la route : {STATES[info.goal]}</dt>
              <dd>{info.missingGoal == null ? 'à relever' : info.missingGoal > 0 ? `${int(info.missingGoal)} pts` : 'atteint ✓'}</dd>
            </>
          )}
        </dl>
      )}
      {r?.stale && (
        <p className="mh-check mh-check-warn">
          {current
            ? "Relevé d’avant le passage de jeudi : le renforcement est remis à zéro et la jauge a peut-être changé. Repasse dans le système pour voir son état."
            : "Aucun relevé cette semaine-là : ces chiffres datent d’avant son passage de semaine."}
        </p>
      )}
      {r && <p className="mh-sys-sub">Relevé du {stamp(r.at)}{info.declared ? ` (${String(Math.round(r.progress * 1000) / 10).replace('.', ',')} % au jeu)` : ''}</p>}
      {declarable && (
        <button className="btn btn-ghost small" onClick={() => onPalier(info.system, !info.declared)}
          title="Le relevé du jeu est en retard, ou d'autres joueurs ont déjà passé le palier : le rapport le montre atteint jusqu'au passage de jeudi">
          {info.declared ? 'Annuler « palier atteint »' : '✓ Marquer le palier atteint'}
        </button>
      )}
    </li>
  );
}

export function Swatch({ activity }) {
  return <span className="mh-swatch" style={{ background: ACTIVITIES[activity].color }} />;
}

function Ranking({ ranking }) {
  if (!ranking.length) return <p className="muted small">Aucun mérite cette semaine.</p>;
  const top = ranking[0].merits;
  return (
    <ol className="mh-ranking">
      {ranking.map((r, i) => (
        <li key={r.activity}>
          <span className="mh-rank">{i + 1}</span>
          <span className="mh-rank-label"><Swatch activity={r.activity} />{ACTIVITIES[r.activity].label}</span>
          <span className="mh-rank-value">{int(r.merits)}</span>
          <span className="mh-rank-bar"><span style={{ width: `${(r.merits / top) * 100}%`, background: ACTIVITIES[r.activity].color }} /></span>
        </li>
      ))}
    </ol>
  );
}


/**
 * Le rapport d'une semaine, d'après la réponse de GET /merits ; `name` : la route (ou « Tous les systèmes »).
 * `onPalier(système, atteint)` : bouton « palier atteint » (onglet seulement, absent de l'image pour Discord).
 */
export default function RapportSemaine({ report, name, onPalier }) {
  const roles = new Map(report.steps.map((s) => [s.name, s.role]));
  const shown = report.systems.length ? report.systems : report.objective ? [{ info: report.objective }] : [];
  return (
    <section className="panel mh-report">
      <Sky />
      <div className="mh-head">
        <h2>{report.current ? 'Rapport de la semaine' : 'Rapport de semaine'}</h2>
        <p className="mh-sub">Du {longDay(report.start)} au {longDay(report.end)} · {name}</p>
      </div>
      {report.steps.length > 0 && <RouteMap steps={report.steps} progress={report.progress} systems={report.systems} passage={report.current ? report.end : null} />}
      <div className="mh-cards">
        <div className="mh-card">
          <h3>{report.systems.length ? (report.systems.length > 1 ? `Systèmes travaillés : ${report.systems.length}` : 'Système travaillé') : 'Objectif de la route'}</h3>
          {shown.length === 0 && <p className="muted small">Aucun système cette semaine.</p>}
          <ul className="mh-systems">
            {shown.map((s) => (
              <SystemInfo key={s.info.system} info={s.info} role={roles.get(s.info.system)} current={report.current} end={report.end} onPalier={onPalier} />
            ))}
          </ul>
        </div>
        <div className="mh-card">
          <h3>Ton bilan de la semaine</h3>
          <dl className="mh-bilan">
            <dt>Mérites gagnés</dt><dd>{int(report.merits)}</dd>
            <dt>Points de contrôle gagnés <span className="mh-ratio">4 mérites = 1 pt (6 en exploration et exobiologie)</span></dt><dd>{int(report.points)}</dd>
          </dl>
          <h4 className="mh-subhead">Meilleurs jours</h4>
          {report.topDays.length === 0 && <p className="muted small">Aucun mérite cette semaine.</p>}
          <ol className="mh-ranking">
            {report.topDays.map((d, k) => (
              <li key={d.start}>
                <span className="mh-rank">{k + 1}</span>
                <span className="mh-rank-label">{longDay(d.start)}</span>
                <span className="mh-rank-value">{int(d.merits)}</span>
              </li>
            ))}
          </ol>
          {shown.length > 0 && (
            <>
              <h4 className="mh-subhead">{shown.length > 1 ? 'Ton total par système' : 'Ton total dans ce système'}</h4>
              {shown.map((s) => <MyTotal key={s.info.system} info={s.info} check={s.check} alone={shown.length === 1} />)}
            </>
          )}
        </div>
        <div className="mh-card">
          <h3>Classement des activités</h3>
          <Ranking ranking={report.ranking} />
        </div>
      </div>
    </section>
  );
}
