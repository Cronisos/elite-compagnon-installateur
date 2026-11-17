import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { engApi } from '../api.js';
import { useEvent } from '../../../core/stream.js';
import { tenter } from '../../../core/actions.js';
import Chargement from '../../../core/Chargement.jsx';

/**
 * Tant que les données de référence ne sont pas téléchargées, affiche l'état du
 * téléchargement au lieu des pages (sauf l'onglet Données).
 */
export default function RefGate({ children }) {
  const [status, setStatus] = useState(null);
  const [erreur, setErreur] = useState(null); // lecture de l'état impossible (serveur local injoignable…)
  const [erreurTelechargement, setErreurTelechargement] = useState(null);
  const location = useLocation();
  const load = () => tenter(async () => setStatus(await engApi.status()), setErreur);
  useEffect(() => {
    load();
  }, []);
  useEvent('engineering:refdata', (d) => {
    setStatus((s) => ({ ...(s || {}), download: d }));
    if (!d.running) load();
  });

  if (!status) return <Chargement erreur={erreur} quoi="l'état des données de référence" onReessayer={load} />;
  if (status.reference || location.pathname.endsWith('/donnees')) return children;
  const d = status.download || {};
  // Échec du téléchargement : d.error (le serveur l'annonce) ; échec de la demande elle-même : erreurTelechargement
  const telecharger = () => tenter(async () => {
    await engApi.updateReference();
    await load();
  }, setErreurTelechargement);
  return (
    <section className="panel center narrow-panel">
      <h2>Données de référence</h2>
      <p>
        Le module a besoin des données des vaisseaux, modules et recettes (coriolis-data). Elles sont téléchargées une
        seule fois puis gardées sur ton PC.
      </p>
      {status.referenceError && !d.running && <p className="bad">{status.referenceError}</p>}
      {d.running && <p className="accent">{d.message || 'Téléchargement…'}</p>}
      {d.error && <p className="bad">{d.error}</p>}
      {!d.running && erreurTelechargement && <p className="bad">{erreurTelechargement}</p>}
      {!d.running && (
        <button className="btn btn-primary" onClick={telecharger}>
          Télécharger les données
        </button>
      )}
    </section>
  );
}
