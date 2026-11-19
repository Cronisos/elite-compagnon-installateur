// Avis de nouvelle version (server/src/core/miseAJour.js) : le réglage dans Paramètres (coupé par défaut), et le
// bandeau en haut des pages quand une version plus récente a été publiée. L'app ne télécharge rien : le lien s'ouvre
// dans le navigateur du joueur, sur la page des versions du dépôt de l'installateur.

import { useEffect, useState } from 'react';
import { api } from './api.js';
import { dateTime } from './format.js';

const EVENEMENT = 'mise-a-jour:etat';
async function regler(demande) {
  const etat = await api('/mise-a-jour', demande ? { method: 'PUT', body: demande } : {});
  window.dispatchEvent(new CustomEvent(EVENEMENT, { detail: etat }));
  return etat;
}

function useMiseAJour() {
  const [etat, setEtat] = useState(null);
  useEffect(() => {
    regler().then(setEtat).catch(() => setEtat(null)); // serveur d'avant : ni bandeau ni réglage
    const maj = (e) => setEtat(e.detail);
    window.addEventListener(EVENEMENT, maj);
    return () => window.removeEventListener(EVENEMENT, maj);
  }, []);
  return etat;
}

/** Bandeau en haut des pages : une version plus récente est publiée. */
export function MiseAJourNotice() {
  const etat = useMiseAJour();
  const n = etat?.nouvelle;
  if (!n) return null;
  return (
    <div className="alerts" style={{ marginBottom: '1rem' }}>
      <div className="alert alert-info" role="status">
        Une nouvelle version d'Enova est disponible{n.version ? ` (${n.version})` : ''}, publiée le {dateTime(n.publieeLe)}.
        <div className="form-actions" style={{ marginTop: '0.5rem' }}>
          <a className="btn btn-primary small" href={n.page} target="_blank" rel="noopener noreferrer">Ouvrir la page de téléchargement ↗</a>
          <button className="btn btn-ghost small" type="button" onClick={() => regler({ ignorer: true }).catch(() => {})}>Ne plus me le dire pour cette version</button>
        </div>
        <span className="small muted">Télécharge l'installateur et lance-le : il remplace l'app sans toucher à tes données.</span>
      </div>
    </div>
  );
}

/** Paramètres › Nouvelles versions. */
export function ReglageMiseAJour() {
  const etat = useMiseAJour();
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  if (!etat) return null;
  const faire = (demande) => {
    setErreur('');
    setOccupe(true);
    regler(demande).catch((e) => setErreur(e.message)).finally(() => setOccupe(false));
  };
  return (
    <section className="panel" data-tuto="parametres-versions">
      <h2>Nouvelles versions</h2>
      <p className="muted small">
        L'app peut regarder d'elle-même si une version plus récente a été publiée, et te le dire avec un lien. Elle ne
        télécharge et n'installe rien. Activé, elle lit deux fois par jour au plus la page publique des versions sur
        GitHub (<code>{etat.depot}</code>) : GitHub voit alors ton adresse IP, rien d'autre ne part.
      </p>
      <label className="small">
        <input type="checkbox" checked={etat.actif} disabled={occupe} onChange={(e) => faire({ actif: e.target.checked })} />{' '}
        Me prévenir quand une nouvelle version est publiée
      </label>
      <dl className="kv" style={{ marginTop: '0.6rem' }}>
        <dt>Ta version</dt>
        <dd>{etat.installee ? <code>{etat.installee.version}</code> : <span className="muted">version de travail (pas installée par l'installateur) : rien à comparer</span>}</dd>
        {etat.actif && etat.verifiable && (
          <>
            <dt>Dernière vérification</dt>
            <dd>{etat.vueLe ? dateTime(etat.vueLe) : 'pas encore faite'}{etat.vueLe && !etat.nouvelle && <span className="good small"> · tu es à jour</span>}</dd>
          </>
        )}
      </dl>
      {etat.actif && etat.verifiable && (
        <div className="form-actions">
          <button className="btn small" type="button" disabled={occupe} onClick={() => faire({ verifier: true })}>{occupe ? 'Vérification…' : 'Vérifier maintenant'}</button>
          {erreur && <span className="bad small">{erreur}</span>}
        </div>
      )}
    </section>
  );
}
