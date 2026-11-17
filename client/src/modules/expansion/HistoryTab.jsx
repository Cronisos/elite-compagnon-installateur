// Historique des mérites : rapport de la semaine Powerplay (du jeudi au jeudi) sur les systèmes d'une route,
// façon rapport Discord du squadron mais pour soi seul, avec le classement des activités et la vue jour par jour.

import { useEffect, useState } from 'react';
import { useEvent } from '../../core/stream.js';
import { useGameState } from '../../core/useGameState.js';
import { compact, int } from '../../core/format.js';
import { expansionApi } from './api.js';
import OngletsRoutes from './OngletsRoutes.jsx';
import RapportSemaine, { ACTIVITIES, ORDER, Swatch } from './RapportSemaine.jsx';
import { dePuissance } from './texte.js';

export { ACTIVITIES };
const STORE = 'expansion.history.project';

const dayName = (ms) => new Date(ms).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
const longDay = (ms) => new Date(ms).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const hour = (ms) => `${new Date(ms).getHours()} h`;

const mo = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`);

/**
 * « Copier pour Discord » (app de bureau seulement) : le rapport de la semaine en GIF animé, vaisseau compris. Le
 * fichier est mis dans le presse-papiers (Ctrl+V dans Discord l'envoie), et se glisse aussi dans Discord.
 */
function PartageDiscord({ projet, semaine }) {
  const [etat, setEtat] = useState(null); // null, { cours }, réponse de l'app ({ ok, copie, octets… } ou { erreur })
  const bureau = window.eliteBureau;
  if (!bureau?.rapportGif) return null;
  async function copier() {
    setEtat({ cours: true });
    try {
      setEtat(await bureau.rapportGif({ projet, semaine }));
    } catch (err) {
      setEtat({ erreur: err?.message || 'GIF impossible.' });
    }
  }
  return (
    <div className="mh-partage">
      <button className="btn small" disabled={etat?.cours} onClick={copier}>{etat?.cours ? 'GIF en préparation…' : '📋 Copier pour Discord'}</button>
      {etat?.ok && (
        <span className="mh-glisser" draggable title="Glisse-le dans un salon Discord" onDragStart={(e) => { e.preventDefault(); bureau.glisserRapport(); }}>
          ⇱ Glisser dans Discord
        </span>
      )}
      {etat?.ok && (
        <span className="small muted">
          {etat.copie ? 'Copié : Ctrl+V dans Discord.' : 'Presse-papiers indisponible : glisse-le.'} GIF de {mo(etat.octets)}, {etat.largeur} × {etat.hauteur}.
        </span>
      )}
      {etat?.erreur && <span className="small warn">{etat.erreur}</span>}
    </div>
  );
}

function readStore() {
  try {
    return localStorage.getItem(STORE);
  } catch {
    return null;
  }
}
function writeStore(v) {
  try {
    localStorage.setItem(STORE, v);
  } catch {
    // stockage indisponible : le choix ne sera pas retenu
  }
}

/** Barres empilées par activité, une par journée de jeu (de passage de semaine à passage de semaine). */
function DayChart({ days, legend }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(...days.map((d) => d.merits), 1);
  return (
    <div className="mh-chart">
      <div className="mh-legend">
        {legend.map((a) => <span key={a}><Swatch activity={a} />{ACTIVITIES[a].label}</span>)}
      </div>
      <div className="mh-plot" onMouseLeave={() => setHover(null)}>
        {days.map((d, i) => {
          const parts = [...d.ranking].sort((a, b) => ORDER.indexOf(a.activity) - ORDER.indexOf(b.activity));
          return (
            <div key={d.start} className="mh-col" onMouseEnter={() => setHover(i)}>
              <span className="mh-col-total">{d.merits ? compact(d.merits) : ''}</span>
              <div className="mh-stack" style={{ height: `${(d.merits / max) * 85}%` }}>
                {parts.map((p) => (
                  <span key={p.activity} style={{ flexGrow: p.merits, background: ACTIVITIES[p.activity].color }} />
                ))}
              </div>
              <span className="mh-col-day">{dayName(d.start)}</span>
              {hover === i && (
                <div className={`mh-tip ${i > 3 ? 'mh-tip-left' : ''}`}>
                  <strong>{longDay(d.start)}</strong>
                  <span className="muted small">{hour(d.start)} → {hour(d.start + 86400000)}</span>
                  {d.ranking.map((r) => (
                    <span key={r.activity} className="mh-tip-row"><Swatch activity={r.activity} />{ACTIVITIES[r.activity].label}<b>{int(r.merits)}</b></span>
                  ))}
                  <span className="mh-tip-row mh-tip-total">Total<b>{int(d.merits)}</b></span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayTable({ days }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Journée</th><th>Mérites</th><th>Activités</th></tr></thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.start}>
              <td>{longDay(d.start)}</td>
              <td className="num">{d.merits ? int(d.merits) : '—'}</td>
              <td className="small">{d.ranking.map((r) => `${ACTIVITIES[r.activity].label} ${int(r.merits)}`).join(' · ') || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function HistoryTab({ projects }) {
  const [project, setProject] = useState(() => readStore() ?? '');
  const [week, setWeek] = useState(null);
  const [report, setReport] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [table, setTable] = useState(false);
  const power = useGameState().game?.powerplay?.power || null;

  // Sans choix retenu (ou projet supprimé), le projet le plus récent
  const known = project === 'all' || projects?.some((p) => String(p.id) === project);
  const selected = known ? project : projects?.[0] ? String(projects[0].id) : 'all';

  const load = () => {
    if (!projects) return;
    expansionApi.merits(selected === 'all' ? null : selected, week)
      .then((r) => {
        setReport(r);
        setLoadError(null);
      })
      .catch((err) => setLoadError(err.message || 'erreur inconnue'));
  };
  useEffect(() => { load(); }, [selected, week, projects]);
  useEvent('expansion:merits', load);

  function choose(v) {
    setProject(v);
    writeStore(v);
  }

  if (!report && loadError) {
    return (
      <section className="panel">
        <p className="bad">Le rapport de la semaine n’a pas pu être chargé : {loadError}</p>
        <button className="btn" onClick={load}>Réessayer</button>
      </section>
    );
  }
  if (!report) return <p className="muted">Chargement…</p>;
  const name = selected === 'all' ? 'Tous les systèmes' : projects.find((p) => String(p.id) === selected)?.name;
  const index = report.weeks.indexOf(report.start);
  const legend = ORDER.filter((a) => report.ranking.some((r) => r.activity === a));

  return (
    <>
      <OngletsRoutes projects={projects} selected={selected} onSelect={choose} extra={[{ id: 'all', label: 'Tous les systèmes' }]} />
      <div className="form-actions mh-controls">
        <div className="mh-weeknav">
          <button className="btn btn-ghost small" disabled={index <= 0} onClick={() => setWeek(report.weeks[index - 1])}>◂</button>
          <span>Du {longDay(report.start)} au {longDay(report.end)}</span>
          <button className="btn btn-ghost small" disabled={index >= report.weeks.length - 1} onClick={() => setWeek(report.weeks[index + 1])}>▸</button>
        </div>
        {!report.current && <button className="btn btn-ghost small" onClick={() => setWeek(null)}>Semaine en cours</button>}
        <PartageDiscord key={`${selected}-${report.start}`} projet={selected} semaine={report.current ? null : report.start} />
      </div>

      <RapportSemaine report={report} name={name} onPalier={(system, atteint) => expansionApi.palier(system, atteint).then(load)} />

      <section className="panel" data-tuto="extension-jours">
        <div className="form-actions">
          <h2>Jour par jour</h2>
          <button className="btn btn-ghost small" data-tuto="extension-jours-bascule" onClick={() => setTable(!table)}>{table ? 'Graphique' : 'Tableau'}</button>
        </div>
        <p className="small muted">Une journée va de {hour(report.start)} à {hour(report.start)} le lendemain, au rythme du passage de semaine du jeudi.</p>
        {table ? <DayTable days={report.days} /> : <DayChart days={report.days} legend={legend} />}
      </section>

      <p className="small muted">
        Le jeu n'écrit pas d'où vient un gain : il est rangé d'après ce qui le précède (vente, livraison, mission, sauvetage, kill).
        Un gain compte pour le système où tu es à ce moment-là. Points de contrôle : 4 mérites = 1 point, en prise comme en
        renforcement (6 en exploration et exobiologie), 120 000 points pour une prise. Le jeu écrit l'état du
        système à chaque arrivée : ce relevé additionne tous les joueurs {dePuissance(power)} (toi, tes coéquipiers, les autres). Il ne
        prouve qu'une chose : s'il est plus bas que tes seuls points, il en manque des tiens.
      </p>
    </>
  );
}
