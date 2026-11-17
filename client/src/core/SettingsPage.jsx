import { useEffect, useState } from 'react';
import { api } from './api.js';
import { useEvent } from './stream.js';
import { useGameState } from './useGameState.js';
import { ago } from './format.js';
import { etatLecteur } from './lecteurVue.js';
import ReglageMar from './ReglageMar.jsx';
import ReglagePave from './ReglagePave.jsx';
import ReglageDisposition from './ReglageDisposition.jsx';
import ReglageCompte from './ReglageCompte.jsx';
import { ReglagePartage } from './PartageEscadron.jsx';
import ReglageVigie from './ReglageVigie.jsx';
import ReglageTutoriels from './tutoriel/ReglageTutoriels.jsx';
import ReglageSauvegardes from './ReglageSauvegardes.jsx';
import { ReglageMiseAJour } from './MiseAJour.jsx';
import ReglageRaccourcis from './ReglageRaccourcis.jsx';

/** Paramètres : dossier des journaux, heures de jeu, Mon compte (ce qui est à toi), et flux d’événements en direct. */
export default function SettingsPage() {
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');
  const [events, setEvents] = useState([]);
  const { journal } = useGameState();

  useEffect(() => {
    api('/settings').then(setForm).catch((e) => setError(e.message));
    // Le serveur n'envoie que le nom et l'heure de chaque événement (jamais le chat, le FID ou d'autres CMDR)
    api('/journal/recent')
      .then((list) => setEvents(list.map((e) => ({ event: e.event, timestamp: e.timestamp, receivedAt: null }))))
      .catch(() => {});
  }, []);

  // Chaque événement écrit par le jeu arrive ici en temps réel (nom et heure)
  useEvent('journal:event', (e) => {
    setEvents((list) => [{ event: e.event, timestamp: e.timestamp, receivedAt: new Date().toISOString() }, ...list].slice(0, 50));
  });

  async function save(e) {
    e.preventDefault();
    setError('');
    try {
      const s = await api('/settings', { method: 'PUT', body: form });
      setForm(s);
      setSaved('Paramètres enregistrés.');
      setTimeout(() => setSaved(''), 2500);
    } catch (err) {
      setError(err.message);
    }
  }

  if (!form) return <p className="muted">{error || 'Chargement…'}</p>;

  return (
    <div className="settings">
      <h1>Paramètres</h1>
      <form className="panel form" data-tuto="parametres-general" onSubmit={save}>
        <label>
          Dossier des journaux Elite Dangerous
          <input
            value={form.journalPath}
            onChange={(e) => setForm({ ...form, journalPath: e.target.value })}
            spellCheck={false}
          />
        </label>
        <label>
          Heures de jeu par soirée
          <input
            type="number"
            min="0.5"
            max="24"
            step="0.5"
            value={form.hoursPerEvening}
            onChange={(e) => setForm({ ...form, hoursPerEvening: e.target.value })}
          />
        </label>
        <div className="form-actions">
          <button className="btn btn-primary" type="submit">Enregistrer</button>
          {saved && <span className="good">{saved}</span>}
          {error && <span className="bad">{error}</span>}
        </div>
      </form>

      <ReglageCompte />
      <ReglageSauvegardes />
      <ReglageMiseAJour />
      <ReglagePartage />
      <ReglageTutoriels />
      <ReglageRaccourcis />
      <ReglageMar />
      <ReglagePave />
      <ReglageDisposition />
      <ReglageVigie />

      <section className="panel" data-tuto="parametres-lecteur">
        <h2>Lecteur de journaux</h2>
        {/* Relecture de l'historique en cours (démarrage, dossier changé) : l'ancien journal n'est plus montré */}
        {etatLecteur(journal) === 'relecture' && (
          <p className="muted" role="status">
            Relecture de tes journaux en cours… Le journal actif s’affichera une fois la lecture finie (quelques secondes,
            un peu plus si tu as beaucoup de journaux).
          </p>
        )}
        {etatLecteur(journal) === 'pret' && (
          <dl className="kv">
            <dt>Journal actif</dt>
            <dd>{journal.file || '—'}</dd>
            <dt>Dernier événement</dt>
            <dd>{journal.lastEventAt ? ago(journal.lastEventAt) : 'aucun depuis le lancement'}</dd>
            {journal.galaxy && journal.galaxy !== 'live' && (
              <>
                <dt>Galaxie</dt>
                <dd className="muted">
                  {journal.galaxy === 'beta' ? 'Version bêta du jeu' : 'Galaxie Legacy'} : l’app ne suit que la galaxie Live. Cette partie
                  ne change ni ta flotte, ni tes matériaux, ni tes routes.
                </dd>
              </>
            )}
            {journal.error && (
              <>
                <dt>Problème</dt>
                <dd className="bad">{journal.error}</dd>
              </>
            )}
          </dl>
        )}
        <h3>Événements en direct</h3>
        {events.length === 0 && <p className="muted">Lance le jeu : les événements apparaîtront ici.</p>}
        <table className="table compact">
          <thead>
            <tr>
              <th>Heure du jeu</th>
              <th>Événement</th>
              <th>Reçu</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e, i) => (
              <tr key={i} className={i === 0 && e.receivedAt ? 'flash' : ''}>
                <td className="num">{new Date(e.timestamp).toLocaleTimeString('fr-FR')}</td>
                <td>{e.event}</td>
                <td className="muted">{e.receivedAt ? `${((new Date(e.receivedAt) - new Date(e.timestamp)) / 1000).toFixed(1)} s après` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
