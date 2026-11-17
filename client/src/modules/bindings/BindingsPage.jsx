import { useState } from 'react';
import { dateTime, int } from '../../core/format.js';
import { backupState, commands, concernsLabel, entryLabel, gameLabel, restoreSteps } from './labels.js';
import { useBindings } from './useBindings.js';
import './bindings.css';

const TONE = { good: 'good', warn: 'warn', bad: 'bad', muted: 'muted' };

/** Bouton « Copier » d'un chemin (à coller dans Win + R ou l'Explorateur). */
function CopyPath({ text }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      // presse-papiers refusé : le chemin reste affiché
    }
  }
  return <button className="btn small" onClick={copy}>{done ? '✓ Copié' : 'Copier le chemin'}</button>;
}

/** Résumé en haut de page : alerte, avertissement, ou tout va bien. */
function Summary({ status }) {
  const { alert, level, log, game } = status;
  if (!status.dirFound) {
    return (
      <div className="alert alert-warning bnd-status">
        <strong>Dossier des commandes introuvable</strong>
        <span className="bnd-path">{status.dir}</span>
        <span>Le jeu le crée à son premier lancement. Sans lui, l'app ne peut pas vérifier tes commandes.</span>
      </div>
    );
  }
  if (alert && level !== 'info') {
    return (
      <div className={`alert ${level === 'alert' ? 'alert-danger' : 'alert-warning'} bnd-status`} role="alert">
        <strong>⚠ {alert.title}</strong>
        <span>{alert.message}</span>
        <span className="small">{alert.backupsHint}</span>
      </div>
    );
  }
  const launch = game.running === false ? 'dernier lancement du jeu' : 'lancement en cours';
  const when = log?.concerns === 'current' || log?.concerns === 'previous' ? ` au ${launch}` : '';
  return (
    <div className="panel bnd-status">
      <strong className="good">✓ Rien d'anormal{when}</strong>
      {!log && <span className="muted">Le jeu n'a signalé aucune erreur de chargement des commandes.</span>}
      {alert && <span className="muted">{alert.message}</span>}
      {log?.concerns === 'previous' && log.lines.length > 0 && (
        <span className="muted small">Le rapport du jeu date du {dateTime(log.modifiedAt)}, avant ce lancement : il ne le concerne pas.</span>
      )}
    </div>
  );
}

/** Page « Garde des commandes » : rapport du jeu, profils et manettes utilisés, sauvegardes .backup. */
export default function BindingsPage() {
  const { status, error, reload } = useBindings();

  if (!status) {
    return (
      <div className="page">
        <h1>Garde des commandes</h1>
        <p className={error ? 'bad' : 'muted'}>{error || 'Chargement…'}</p>
      </div>
    );
  }

  const { log, game, startPresets, profiles, backups } = status;
  return (
    <div className="page">
      <header className="route-header">
        <div>
          <h1>Garde des commandes</h1>
          <p className="muted">
            Quand une manette manque, le jeu ignore ton profil de commandes sans prévenir et repasse aux commandes par
            défaut : réassigner à ce moment écrase ton profil. L'app lit le rapport du jeu à chaque lancement et te
            prévient, ici et par-dessus le jeu. Elle ne modifie jamais tes fichiers de commandes.
          </p>
        </div>
        <div className="form-actions">
          <button className="btn" data-tuto="outils-garde-relire" onClick={reload}>↻ Relire</button>
        </div>
      </header>

      <Summary status={status} />
      {error && <p className="bad small">{error}</p>}

      <div className="two-cols">
        <section className="panel" data-tuto="outils-garde-rapport">
          <h2>Rapport du jeu</h2>
          <p className="bnd-path">{status.displayDir}\{log?.file || 'BindingLoadingErrors.log'}</p>
          {log ? (
            <>
              <p className="small muted">
                Écrit le {dateTime(log.modifiedAt)} · {concernsLabel(log, game)}
                {game.launchedAt && ` · ${gameLabel(game, dateTime)}`}
              </p>
              {log.entries.length ? (
                <ul className="bnd-lines">
                  {log.entries.map((e, i) => {
                    const tag = entryLabel(e.kind);
                    return (
                      <li key={i}>
                        <span className={`pill pill-${tag.tone}`}>{tag.label}</span>
                        <code>{e.line}</code>
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="muted">Fichier vide : aucune erreur.</p>}
            </>
          ) : <p className="muted">Pas de rapport : le jeu n'a signalé aucune erreur de chargement.</p>}
        </section>

        <section className="panel" data-tuto="outils-garde-profils">
          <h2>Profils utilisés</h2>
          {startPresets ? (
            <div className="table-wrap">
              <table className="table compact">
                <thead><tr><th>Commandes</th><th>Profil</th><th>Fichier</th></tr></thead>
                <tbody>
                  {startPresets.categories.map((c) => (
                    <tr key={c.label}>
                      <td>{c.label}</td>
                      <td>{c.preset}</td>
                      <td className="small">{c.file || <span className="muted">fourni avec le jeu</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="muted">Aucun fichier StartPreset : le jeu n'a pas encore enregistré tes choix.</p>}
          {profiles.map((p) => (
            <div key={p.file}>
              <h3>{p.file} <span className="small muted">modifié le {dateTime(p.modifiedAt)}</span></h3>
              {p.devices.length ? (
                <ul className="bnd-lines">
                  {p.devices.map((d) => (
                    <li key={d.id}>
                      <code>{d.id}</code>
                      <span className="muted">{commands(d.count)}</span>
                      {d.missing && <span className="pill pill-bad">absente d'après le rapport du {dateTime(log?.modifiedAt)}</span>}
                    </li>
                  ))}
                </ul>
              ) : <p className="muted small">Clavier et souris seulement.</p>}
            </div>
          ))}
        </section>
      </div>

      <section className="panel" data-tuto="outils-garde-sauvegardes">
        <h2>Sauvegardes du jeu (.backup)</h2>
        <p className="muted">
          Le jeu les écrit lui-même quand il n'arrive pas à charger un profil. L'app les montre sans jamais les toucher.
        </p>
        <p className="form-actions"><span className="bnd-path">{status.displayDir}</span> <CopyPath text={status.displayDir} /></p>
        {backups.length ? (
          <>
            <div className="table-wrap">
              <table className="table compact">
                <thead><tr><th>Sauvegarde</th><th>Écrite le</th><th className="right">Taille</th><th>État</th></tr></thead>
                <tbody>
                  {backups.map((b) => {
                    const state = backupState(b);
                    return (
                      <tr key={b.file}>
                        <td className="small">{b.file}</td>
                        <td>{dateTime(b.modifiedAt)}</td>
                        <td className="right num">{b.size != null ? `${int(b.size / 1024)} Ko` : '—'}</td>
                        <td className={TONE[state.tone]}>{state.text}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <h3>Remettre une sauvegarde</h3>
            <p className="small muted">
              Seulement si tu as réassigné des commandes pendant que la manette manquait. À faire toi-même, jeu fermé :
            </p>
            <ol className="bnd-steps small">
              {restoreSteps(backups[0], status.displayDir).map((s) => <li key={s}>{s}</li>)}
            </ol>
          </>
        ) : <p className="muted">Aucune sauvegarde pour l'instant.</p>}
      </section>
    </div>
  );
}
