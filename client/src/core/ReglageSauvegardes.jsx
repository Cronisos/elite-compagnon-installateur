// Paramètres › Sauvegardes : faire une copie de toutes ses données (repères, builds, routes, réglages…) dans son
// dossier Documents, et en restaurer une. Le serveur fait la copie (server/src/core/sauvegardes.js) ; la restauration
// se fait au relancement de l'app de bureau, qui met de côté les données actuelles (desktop/donnees.js).

import { useEffect, useState } from 'react';
import { api } from './api.js';
import { dateTime, int } from './format.js';

const MOT = 'RESTAURER';
const taille = (octets) => (octets >= 1048576 ? `${(octets / 1048576).toFixed(1).replace('.', ',')} Mo` : `${int(Math.max(1, Math.round(octets / 1024)))} Ko`);

export default function ReglageSauvegardes() {
  const [etat, setEtat] = useState(null); // { dossier, sauvegardes, restauration }
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState('');
  const [erreur, setErreur] = useState('');
  const [choix, setChoix] = useState(null); // sauvegarde à restaurer, en attente du mot tapé
  const [mot, setMot] = useState('');

  useEffect(() => {
    api('/sauvegardes').then(setEtat).catch(() => setEtat(null)); // serveur d'avant : pas de section
  }, []);
  if (!etat) return null;

  async function sauvegarder() {
    setErreur('');
    setMessage('');
    setOccupe(true);
    try {
      const r = await api('/sauvegardes', { method: 'POST' });
      setEtat((e) => ({ ...e, sauvegardes: r.sauvegardes }));
      setMessage(`Sauvegarde faite : ${int(r.faite.fichiers)} fichiers, ${taille(r.faite.octets)}.`);
    } catch (e) {
      setErreur(e.message);
    } finally {
      setOccupe(false);
    }
  }

  async function restaurer(e) {
    e.preventDefault();
    setErreur('');
    try {
      await api('/sauvegardes/restaurer', { method: 'POST', body: { nom: choix.nom, confirmation: mot } });
      setMessage('L’app se relance pour restaurer cette sauvegarde…');
      setChoix(null);
    } catch (err) {
      setErreur(err.message);
    }
  }

  return (
    <section className="panel" data-tuto="parametres-sauvegardes">
      <h2>Sauvegardes</h2>
      <p className="muted small">
        Une copie de tout ce qui est à toi : repères, builds, routes, sessions, réglages. Elle va dans ton dossier
        Documents, hors de l'app : désinstaller l'app ou effacer tes données ne la supprime pas. Rien ne part de ton PC.
        Elle contient aussi ton jeton d'escadron : ne la donne à personne.
      </p>
      <div className="form-actions">
        <button className="btn btn-primary" type="button" disabled={occupe} onClick={sauvegarder}>{occupe ? 'Sauvegarde en cours…' : 'Sauvegarder mes données'}</button>
        {message && <span className="good small">{message}</span>}
        {erreur && <span className="bad small">{erreur}</span>}
      </div>
      <p className="muted small">Dossier : <code>{etat.dossier}</code></p>
      {etat.sauvegardes.length === 0 ? <p className="muted small">Aucune sauvegarde pour l'instant.</p> : (
        <table className="table compact">
          <thead><tr><th>Sauvegarde du</th><th className="right">Fichiers</th><th className="right">Taille</th><th /></tr></thead>
          <tbody>
            {etat.sauvegardes.map((s) => (
              <tr key={s.nom}>
                <td>{s.le ? dateTime(s.le) : s.nom}</td>
                <td className="right num">{int(s.fichiers)}</td>
                <td className="right num">{taille(s.octets)}</td>
                <td className="right">
                  <button className="btn small" type="button" disabled={!etat.restauration} title={etat.restauration ? undefined : 'Seulement dans l’app de bureau'} onClick={() => { setChoix(s); setMot(''); setErreur(''); }}>
                    Restaurer…
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {choix && (
        <form className="form" onSubmit={restaurer}>
          <p className="warn small">
            Restaurer la sauvegarde du {choix.le ? dateTime(choix.le) : choix.nom} remplace tes données actuelles par
            celles de ce jour-là : ce que tu as fait depuis n'y sera plus. L'app se relance. Tes données actuelles ne
            sont pas effacées : elles sont mises de côté, à côté du dossier des données, jusqu'à la restauration suivante.
          </p>
          <label>
            Tape {MOT} pour confirmer
            <input value={mot} onChange={(e) => setMot(e.target.value)} autoComplete="off" spellCheck={false} />
          </label>
          <div className="form-actions">
            <button className="btn" type="submit" disabled={mot !== MOT}>Restaurer cette sauvegarde</button>
            <button className="btn btn-ghost" type="button" onClick={() => setChoix(null)}>Annuler</button>
          </div>
        </form>
      )}
      <p className="muted small">Les sauvegardes ne se suppriment pas toutes seules : efface les plus anciennes depuis ce dossier quand tu veux.</p>
    </section>
  );
}
