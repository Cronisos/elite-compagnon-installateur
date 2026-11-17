// Onglet « Vigie des règles » : toutes les règles du dépôt, ce que le jeu en a montré, les alertes et les propositions.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../core/api.js';
import { useEvent } from '../../core/stream.js';
import { CONTROLES, PILL_STATUT, alerteTexte, compteurs, fichesVisibles, lireValeur, valeurCourte } from './vigieView.js';

function Proposition({ regle, depart, onDone }) {
  const [valeur, setValeur] = useState(depart == null ? '' : String(depart));
  const [note, setNote] = useState('');
  const [erreur, setErreur] = useState('');
  const envoyer = async () => {
    try {
      await api(`/vigie/regles/${encodeURIComponent(regle)}/proposition`, { method: 'POST', body: { valeur: lireValeur(valeur), note } });
      onDone();
    } catch (e) {
      setErreur(e.message);
    }
  };
  return (
    <div className="vigie-proposition">
      <input value={valeur} onChange={(e) => setValeur(e.target.value)} placeholder="Nouvelle valeur" aria-label="Nouvelle valeur" />
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (ce que tu as vu)" aria-label="Note" maxLength={500} />
      <button type="button" className="btn small btn-primary" onClick={envoyer}>Noter la proposition</button>
      <span className="small muted">Notée seulement : je l'applique dans le code à notre prochaine session.</span>
      {erreur && <span className="small bad">{erreur}</span>}
    </div>
  );
}

export default function VigiePage() {
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState('');
  const [filtres, setFiltres] = useState({ domaine: '', controle: '', alertes: false, texte: '' });
  const [proposer, setProposer] = useState(null);
  const [resume, setResume] = useState('');
  const charger = () => api('/vigie').then(setDonnees).catch((e) => setErreur(e.message));
  useEffect(() => {
    charger();
  }, []);
  useEvent('vigie', (vue) => setDonnees((d) => (d ? { ...d, ...vue } : d)));
  const visibles = useMemo(() => (donnees ? fichesVisibles(donnees.domaines, donnees, filtres) : []), [donnees, filtres]);
  if (!donnees) return <p className="muted">{erreur || 'Chargement…'}</p>;
  const total = donnees.domaines.reduce((n, d) => n + d.fiches.length, 0);
  const auto = donnees.domaines.reduce((n, d) => n + d.fiches.filter((f) => f.controle === 'auto').length, 0);
  const compris = (id) => api(`/vigie/regles/${encodeURIComponent(id)}/compris`, { method: 'POST' }).then(charger).catch((e) => setErreur(e.message));
  const lireResume = () => api('/vigie/resume').then((r) => setResume(r.texte)).catch((e) => setErreur(e.message));
  return (
    <div className="page vigie">
      <section className="panel">
        <h2>Vigie des règles</h2>
        {donnees.actif === false && (
          <p className="small warn">
            Vigie coupée : elle note ce qu’elle voit, mais n’ouvre aucune fenêtre en jeu. C’est un outil pour qui développe
            l’app ; tu peux l’allumer dans <Link to="/parametres">Paramètres</Link>.
          </p>
        )}
        <p className="small muted">
          {total} règles dans le dépôt, dont {auto} mesurées en jeu par l'app. Une alerte s'ouvre au {donnees.seuil}e écart inexpliqué sur une
          même règle ; une valeur proposée est notée, jamais appliquée seule.
        </p>
        <button type="button" className="btn small" onClick={lireResume}>Résumé du jour</button>
        {resume && <pre className="vigie-resume">{resume}</pre>}
        {erreur && <p className="small bad">{erreur}</p>}
      </section>

      {donnees.alertes.length > 0 && (
        <section className="panel">
          <h2>⚠ Règles à revoir</h2>
          {donnees.alertes.map((a) => (
            <div key={a.regle} className="vigie-alerte">
              <p>{alerteTexte(a)}</p>
              <div className="form-actions">
                <button type="button" className="btn small" onClick={() => compris(a.regle)}>Compris</button>
                <button type="button" className="btn small" onClick={() => setProposer(a.regle)}>Proposer une valeur</button>
              </div>
              {proposer === a.regle && <Proposition regle={a.regle} depart={a.valeurEstimee} onDone={() => { setProposer(null); charger(); }} />}
            </div>
          ))}
        </section>
      )}

      <section className="panel">
        <div className="vigie-filtres">
          <select value={filtres.domaine} onChange={(e) => setFiltres({ ...filtres, domaine: e.target.value })} aria-label="Domaine">
            <option value="">Tous les domaines</option>
            {donnees.domaines.map((d) => <option key={d.nom} value={d.nom}>{d.titre}</option>)}
          </select>
          <select value={filtres.controle} onChange={(e) => setFiltres({ ...filtres, controle: e.target.value })} aria-label="Contrôle">
            <option value="">Tous les contrôles</option>
            {Object.entries(CONTROLES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <label className="check"><input type="checkbox" checked={filtres.alertes} onChange={(e) => setFiltres({ ...filtres, alertes: e.target.checked })} /> en alerte</label>
          <input value={filtres.texte} onChange={(e) => setFiltres({ ...filtres, texte: e.target.value })} placeholder="Chercher (mot, id, nom)" aria-label="Chercher" />
        </div>
        {visibles.map((d) => (
          <div key={d.nom} className="vigie-domaine">
            <h3>{d.titre}</h3>
            <table className="table vigie-table">
              <tbody>
                {d.fiches.map((f) => {
                  const c = donnees.regles?.[f.id];
                  return (
                    <tr key={f.id} className={c?.alerte ? 'is-alerte' : ''}>
                      <td>
                        <div>{f.titre}</div>
                        <div className="tiny muted" title={f.source}>{f.id} · {f.date}</div>
                      </td>
                      <td className="num">{valeurCourte(f.valeur, f.unite)}</td>
                      <td><span className={`pill ${PILL_STATUT[f.statut] || ''}`}>{f.statut}</span></td>
                      <td className="small">{CONTROLES[f.controle]}</td>
                      <td className="small">{compteurs(c, f.controle)}</td>
                      <td>
                        <button type="button" className="btn small" onClick={() => setProposer(proposer === f.id ? null : f.id)}>Proposer</button>
                        {proposer === f.id && <Proposition regle={f.id} depart={f.valeur} onDone={() => { setProposer(null); charger(); }} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
        {!visibles.length && <p className="muted">Aucune règle pour ces filtres.</p>}
      </section>

      {donnees.propositions.length > 0 && (
        <section className="panel">
          <h2>Propositions notées</h2>
          <ul className="small">
            {[...donnees.propositions].reverse().map((p, i) => (
              <li key={`${p.at}-${i}`}>{p.at.slice(0, 16).replace('T', ' ')} · {p.regle} → {valeurCourte(p.valeur)}{p.note ? ` · ${p.note}` : ''}{p.appliquee ? ' · appliquée' : ' · à appliquer dans le code'}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
