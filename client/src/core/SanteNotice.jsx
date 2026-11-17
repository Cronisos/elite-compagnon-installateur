// Bandeaux en haut des pages quand l'app ne peut pas bien marcher (santeVue.js) : journaux du jeu introuvables, module
// qui n'a pas démarré, données de référence abîmées ou périmées. Rien ne s'affiche quand tout va bien.

import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from './api.js';
import { useEvent } from './stream.js';
import { bandeauxSante } from './santeVue.js';

export default function SanteNotice() {
  const [sante, setSante] = useState(null);
  const [envoi, setEnvoi] = useState(null); // { id, texte, enCours } : retour du dernier bouton
  const load = () => api('/sante').then(setSante).catch(() => {});
  useEffect(() => {
    load();
  }, []);
  useEvent('journal:ready', load); // dossier des journaux trouvé ou changé (Paramètres)
  useEvent('settings', load);
  useEvent('engineering:refdata', (d) => {
    if (d && !d.running) {
      setEnvoi(d.error ? { id: 'reference', texte: d.error } : null); // échec du téléchargement : dit sous le bouton
      load();
    }
  });

  const lancer = (b) => {
    setEnvoi({ id: b.id, texte: 'Téléchargement lancé…', enCours: true });
    api(b.envoi, { method: 'POST' }).catch((err) => setEnvoi({ id: b.id, texte: err.message }));
  };

  const bandeaux = bandeauxSante(sante);
  if (!bandeaux.length) return null;
  return (
    <div className="alerts" style={{ marginBottom: '1rem' }}>
      {bandeaux.map((b) => (
        <div key={b.id} className={`alert alert-${b.ton}`} role="status">
          ⚠ {b.texte}
          {(b.lien || b.envoi) && (
            <div className="form-actions" style={{ marginTop: '0.5rem' }}>
              {b.envoi && (
                <button type="button" className="btn btn-primary" disabled={envoi?.id === b.id && envoi.enCours} onClick={() => lancer(b)}>
                  {b.bouton}
                </button>
              )}
              {b.lien && <Link to={b.lien}>{b.action}</Link>}
              {envoi?.id === b.id && <span className="small">{envoi.texte}</span>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
