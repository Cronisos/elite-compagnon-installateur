// Paramètres → Vigie des règles (outil de développement, server/src/core/vigie.js) : coupée par défaut. Allumée, elle
// ouvre une fenêtre en jeu quand une règle de l'app semble fausse, et sa page apparaît dans Règles du jeu.

import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from './api.js';

export default function ReglageVigie() {
  const [reglage, setReglage] = useState(null);
  const [erreur, setErreur] = useState('');
  useEffect(() => {
    api('/vigie/reglage').then(setReglage).catch(() => {});
  }, []);
  if (!reglage) return null;
  const regler = async (actif) => {
    setErreur('');
    try {
      setReglage(await api('/vigie/reglage', { method: 'PUT', body: { actif } }));
    } catch (e) {
      setErreur(e.message);
    }
  };
  return (
    <section className="panel">
      <h2>Vigie des règles (outil de développement)</h2>
      <p className="small muted">
        Compare les règles de l’app (mérites, rachat, refroidissement…) à ce que le jeu fait vraiment, et ouvre une fenêtre
        en jeu quand une règle semble fausse. Elle ne sert qu’à qui développe l’app : laisse-la coupée si tu joues
        simplement. Rien ne quitte ton PC.
      </p>
      <label className="check">
        <input type="checkbox" checked={reglage.actif} onChange={(e) => regler(e.target.checked)} /> Vigie allumée
      </label>
      {reglage.actif && <p className="small"><Link to="/regles/vigie">Ouvrir la vigie →</Link></p>}
      {erreur && <p className="small bad">{erreur}</p>}
    </section>
  );
}
