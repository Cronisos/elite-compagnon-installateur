// Onglet « Builds » de la fiche d'un vaisseau : ses builds (ceux qui lui sont destinés, puis ceux du même modèle), et
// pour chacun « ce qu'il te faut » depuis sa configuration actuelle : modules à acheter (prix catalogue), modifications
// d'ingénierie, modules à retirer. Le build se modifie dans le constructeur ; les matériaux se calculent dans un plan
// d'ingénierie (créé à partir du build, rattaché à ce vaisseau). Lecture seule ici : chaque fenêtre a un rôle.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { vaisseauxApi } from './api.js';
import { credits, resumeEcart } from './ficheVue.js';

const ICONES = { acheter: '＋', ingenierie: '⚙', retirer: '−', 'sans-modif': '·' };

function CarteBuild({ b, shipId, lie }) {
  const [ouvert, setOuvert] = useState(lie);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const navigate = useNavigate();
  const e = b.ecart;
  const resume = resumeEcart(e);
  const preparerPlan = async () => {
    if (!b.edsy) return;
    setOccupe(true);
    setErreur('');
    try {
      const r = await vaisseauxApi.planDepuisBuild(b.edsy, shipId);
      navigate(`/ingenierie/plan/${r.plan.id}`);
    } catch (err) {
      setErreur(err.message);
      setOccupe(false);
    }
  };
  return (
    <article className={`fvb-carte${e?.identique ? ' is-fait' : ''}`}>
      <header className="fvb-tete">
        <button type="button" className="fvb-nom" onClick={() => setOuvert(!ouvert)} aria-expanded={ouvert}>
          <span aria-hidden="true">{ouvert ? '▾' : '▸'}</span> {b.name}
        </button>
        <span className={`fvb-resume${e?.identique ? ' good' : ''}`}>{resume}</span>
      </header>
      {ouvert && e && e.lignes.length > 0 && (
        <ul className="fvb-lignes">
          {e.lignes.map((l, i) => (
            <li key={i} className={`is-${l.type}`}>
              <span className="fvb-icone" aria-hidden="true">{ICONES[l.type]}</span>
              <span className="fvb-emplacement">{l.emplacement}</span>
              <span className="fvb-module">
                {l.type === 'acheter' && <><s>{l.actuel || 'vide'}</s> → <b>{l.cible}</b></>}
                {l.type === 'retirer' && <>retirer <b>{l.actuel}</b></>}
                {l.type === 'ingenierie' && <b>{l.cible}</b>}
                {l.type === 'sans-modif' && <>{l.cible} <span className="muted">· le tien est modifié ({l.actuelModif?.plan} G{l.actuelModif?.grade}), pas celui du build</span></>}
              </span>
              {l.ingenierie && (
                <span className="fvb-modif">
                  {l.ingenierie.plan} G{l.ingenierie.depuis ? `${l.ingenierie.depuis} → ` : ''}{l.ingenierie.grade}
                  {l.ingenierie.effet && ` · ${l.ingenierie.effet}`}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {ouvert && (
        <div className="form-actions fvb-actions">
          <button type="button" className="btn" onClick={() => navigate(`/builder/build/${b.id}`)}>Ouvrir dans le constructeur</button>
          {e?.ingenierie > 0 && b.edsy && (
            <button type="button" className="btn btn-primary" disabled={occupe} onClick={preparerPlan} title="Crée un plan d'ingénierie à partir de ce build, rattaché à ce vaisseau : matériaux nécessaires et manquants">
              {occupe ? 'Préparation…' : 'Matériaux : préparer le plan d’ingénierie'}
            </button>
          )}
          {e?.cout > 0 && <span className="small muted">Achats ≈ {credits(e.cout)} (prix catalogue, sans remise)</span>}
          {erreur && <span className="small bad">{erreur}</span>}
        </div>
      )}
    </article>
  );
}

export default function BuildsVaisseau({ shipId, onConstruire }) {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState('');
  useEffect(() => {
    setD(null);
    vaisseauxApi.builds(shipId).then(setD, (e) => setErreur(e.message));
  }, [shipId]);
  if (erreur) return <p className="muted">{erreur}</p>;
  if (!d) return <p className="muted">Chargement…</p>;
  if (!d.lies.length && !d.modele.length) {
    return (
      <div className="fvb-vide">
        <p className="muted">Aucun build pour ce vaisseau.</p>
        <button type="button" className="btn btn-primary" onClick={onConstruire}>Construire un build à partir de celui-ci</button>
      </div>
    );
  }
  return (
    <div className="fvb">
      {d.lies.length > 0 && <h3 className="fvb-titre">Destinés à ce vaisseau</h3>}
      {d.lies.map((b) => <CarteBuild key={b.id} b={b} shipId={shipId} lie />)}
      {d.modele.length > 0 && <h3 className="fvb-titre">Builds du même modèle</h3>}
      {d.modele.map((b) => <CarteBuild key={b.id} b={b} shipId={shipId} lie={false} />)}
    </div>
  );
}
