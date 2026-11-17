// Tutoriels : la page Outils › Tutoriels (tous les tutoriels par rubrique, vus ou non, à revoir un par un, à passer
// tous d'un coup) et la section de Paramètres (le lancement automatique, et un lien vers la page).

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { EVENEMENT_ETAT, lancerTutoriel, reglerTutoriels } from './Tutoriel.jsx';
import { PARCOURS, parRubrique } from './parcours.js';

export const CHEMIN_TUTORIELS = '/tutoriels';

function useTutoriels() {
  const [etat, setEtat] = useState(null);
  const [erreur, setErreur] = useState('');
  useEffect(() => {
    reglerTutoriels().then(setEtat).catch((e) => setErreur(e.message));
    const maj = (e) => setEtat(e.detail);
    window.addEventListener(EVENEMENT_ETAT, maj);
    return () => window.removeEventListener(EVENEMENT_ETAT, maj);
  }, []);
  const regler = (demande) => {
    setErreur('');
    reglerTutoriels(demande).catch((e) => setErreur(e.message));
  };
  return { etat, erreur, regler };
}

function CaseAuto({ etat, regler }) {
  return (
    <label className="small">
      <input type="checkbox" checked={etat.actifs} onChange={(e) => regler({ actifs: e.target.checked })} />{' '}
      Lancer le tutoriel d'une page à sa première visite
    </label>
  );
}

/** Paramètres › Tutoriels : le lancement automatique, où on en est, et le lien vers la page. */
export default function ReglageTutoriels() {
  const { etat, erreur, regler } = useTutoriels();
  const vus = etat ? PARCOURS.filter((p) => etat.vus.includes(p.id)).length : 0;
  return (
    <section className="panel" id="reglage-tutoriels">
      <h2>Tutoriels</h2>
      <p className="muted small">
        Chaque page a un petit tutoriel qui encadre ses boutons un par un et explique à quoi ils servent. Il se lance la
        première fois que tu ouvres la page ; tu peux le passer à tout moment (bouton, ou touche Échap).
      </p>
      {erreur && <p className="bad">{erreur}</p>}
      {!etat ? <p className="muted">Chargement…</p> : (
        <>
          <CaseAuto etat={etat} regler={regler} />
          <div className="form-actions" style={{ marginTop: '0.6rem' }}>
            <span className="small">{vus} vus sur {PARCOURS.length}</span>
            <Link className="btn small" to={CHEMIN_TUTORIELS}>Voir tous les tutoriels</Link>
          </div>
        </>
      )}
    </section>
  );
}

/** Outils › Tutoriels : la liste complète, par rubrique. */
export function TutorielsPage() {
  const { etat, erreur, regler } = useTutoriels();
  const navigate = useNavigate();
  /**
   * Va sur la page du tutoriel, puis le lance une fois la page affichée. Un tutoriel de fiche (un build, un repère :
   * l'adresse finit par un identifiant) n'a pas de page fixe : il est remis à « pas encore vu » et se relancera à la
   * prochaine fiche ouverte.
   */
  const revoir = (p) => {
    if (p.sousPages) return regler({ vu: { id: p.id, vu: false } });
    navigate(p.chemin);
    setTimeout(() => lancerTutoriel(p.id), 500);
    return undefined;
  };
  const vus = etat ? PARCOURS.filter((p) => etat.vus.includes(p.id)).length : 0;
  return (
    <div className="page">
      <header className="route-header">
        <div>
          <h1>Tutoriels</h1>
          <p className="muted">
            Tous les tutoriels de l'app. Chacun encadre les boutons d'une page un par un et explique à quoi ils servent.
            Revois celui que tu veux, ou passe-les tous si tu connais déjà l'app.
          </p>
        </div>
      </header>
      {erreur && <p className="bad">{erreur}</p>}
      {!etat ? <p className="muted">Chargement…</p> : (
        <>
          <section className="panel" data-tuto="tutoriels-reglages">
            <CaseAuto etat={etat} regler={regler} />
            <div className="form-actions" style={{ marginTop: '0.6rem' }}>
              <span className="small"><b>{vus}</b> vus sur {PARCOURS.length}</span>
              <button type="button" className="btn small" disabled={vus === PARCOURS.length} onClick={() => regler({ vus: PARCOURS.map((p) => p.id) })} title="Aucun ne se lancera plus de lui-même">
                Passer tous les tutoriels
              </button>
              <button type="button" className="btn btn-ghost small" disabled={!etat.vus.length} onClick={() => regler({ reinitialiser: true })} title="Ils se relanceront à la prochaine visite de chaque page">
                Tout remettre à « pas encore vu »
              </button>
            </div>
          </section>
          {parRubrique(PARCOURS).map(({ rubrique, parcours }) => (
            <section className="panel" key={rubrique} data-tuto="tutoriels-rubrique">
              <h2>{rubrique} <span className="muted small">· {parcours.filter((p) => etat.vus.includes(p.id)).length} sur {parcours.length}</span></h2>
              <table className="table compact">
                <tbody>
                  {parcours.map((p) => {
                    const vu = etat.vus.includes(p.id);
                    return (
                      <tr key={p.id}>
                        <td>
                          {p.titre} <span className="muted small">· {p.etapes.length} étapes</span>
                          {p.sousPages && <div className="muted small">Se lance quand tu ouvres une fiche de ce type.</div>}
                        </td>
                        <td className={vu ? 'good small' : 'muted small'} style={{ whiteSpace: 'nowrap' }}>{vu ? 'vu' : 'pas encore vu'}</td>
                        <td className="right" style={{ whiteSpace: 'nowrap' }}>
                          {vu
                            ? <button type="button" className="btn btn-ghost small" onClick={() => regler({ vu: { id: p.id, vu: false } })} title="Il se relancera à la prochaine visite">Remettre à voir</button>
                            : <button type="button" className="btn btn-ghost small" onClick={() => regler({ vu: { id: p.id, vu: true } })}>Passer</button>}
                          {p.sousPages
                            ? null
                            : <button type="button" className="btn small" onClick={() => revoir(p)}>{vu ? 'Revoir' : 'Voir maintenant'}</button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
