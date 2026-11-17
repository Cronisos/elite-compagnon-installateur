import { useEffect, useState } from 'react';
import { engApi } from '../api.js';
import { useEvent } from '../../../core/stream.js';
import { dateTime } from '../../../core/format.js';
import { tenter } from '../../../core/actions.js';
import Chargement from '../../../core/Chargement.jsx';

/** Données de référence : version, date, mise à jour. */
export default function DataPage() {
  const [status, setStatus] = useState(null);
  const [erreur, setErreur] = useState(null); // lecture de l'état impossible (serveur local injoignable…)
  const [erreurMaj, setErreurMaj] = useState(null); // la demande de mise à jour n'a pas abouti
  const load = () => tenter(async () => setStatus(await engApi.status()), setErreur);
  useEffect(() => {
    load();
  }, []);
  useEvent('engineering:refdata', (d) => {
    setStatus((s) => ({ ...(s || {}), download: d }));
    if (!d.running) load();
  });
  const mettreAJour = () => tenter(async () => {
    await engApi.updateReference();
    await load();
  }, setErreurMaj);

  if (!status) return <Chargement erreur={erreur} quoi="l'état des données de référence" onReessayer={load} />;
  const ref = status.reference;
  const integrity = status.integrity;
  const d = status.download || {};
  return (
    <div className="page narrow">
      <section className="panel">
        <h2>Données de référence</h2>
        {ref ? (
          <dl data-tuto="ingenierie-don-etat" className="kv">
            <dt>Version coriolis-data</dt>
            <dd className="num">{ref.version}</dd>
            <dt>Téléchargées le</dt>
            <dd>{dateTime(ref.downloadedAt)}</dd>
            <dt>Fichiers</dt>
            <dd className="num">{ref.files}</dd>
          </dl>
        ) : status.referenceError ? (
          <p data-tuto="ingenierie-don-etat" className="bad">{status.referenceError}</p>
        ) : (
          <p data-tuto="ingenierie-don-etat" className="warn">Aucune donnée téléchargée.</p>
        )}
        {ref && integrity && !integrity.pinned && (
          <div data-tuto="ingenierie-don-verif" className="warn">
            <p>
              Ces données ne sont pas exactement les versions vérifiées de cette version de l'app (téléchargées avant,
              ou modifiées depuis) : des vaisseaux ou des modules récents peuvent manquer. Clique sur « Mettre à jour
              les données ».
            </p>
            <ul className="small">
              {integrity.problems.map((p) => <li key={p}>{p}</li>)}
            </ul>
          </div>
        )}
        {ref && integrity?.pinned && <p data-tuto="ingenierie-don-verif" className="good small">Versions vérifiées (empreintes conformes).</p>}
        <p data-tuto="ingenierie-don-sources" className="muted small">
          Sources : EDCD/coriolis-data (vaisseaux, modules, recettes), EDCD/FDevIDs (noms des matériaux), dessins de
          vaisseaux de CMDR Qohen Leth (EliteUIAssets). Détails dans CREDITS.md.
        </p>
        <div className="form-actions">
          <button data-tuto="ingenierie-don-maj" className="btn btn-primary" disabled={d.running} onClick={mettreAJour}>
            {d.running ? 'Téléchargement…' : 'Mettre à jour les données'}
          </button>
          {d.running && <span className="accent">{d.message}</span>}
          {!d.running && d.message && <span className="good">{d.message}</span>}
          {d.error && <span className="bad">{d.error}</span>}
          {!d.running && erreurMaj && <span className="bad">{erreurMaj}</span>}
        </div>
      </section>
      <section data-tuto="ingenierie-don-regle" className="panel">
        <h2>Règle des applications</h2>
        <p className="small">
          Depuis la mise à jour 18.08 (août 2024), chaque application donne un résultat fixe : pour finir un grade, il
          faut grade + 5 − rang applications. Au rang 5 chez l'ingénieur : 1 en G1, 2 en G2… 5 en G5 ; au rang 3 :
          3 en G1, 4 en G2, 5 en G3 (mesuré dans les journaux de référence). Viser un grade au-dessus du rang demande d'abord
          de le monter : le calcul le compte, et le signale par « ≈ » quand le compte dépend d'une règle à vérifier ou
          inconnue. Un ingénieur pas encore débloqué est compté comme après son déblocage (rang 1). Seul ce qui reste
          est compté, y compris la fin d'un grade commencé. Détail et mesures : onglet « Rangs des ingénieurs ».
        </p>
      </section>
    </div>
  );
}
