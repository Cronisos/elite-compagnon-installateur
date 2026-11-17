import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import NomSysteme from '../../../core/NomSysteme.jsx';
import { FAMILLES, etatIngenieur, filtrerFamille, initiales, lignesOffres } from '../ingenieursVue.js';
import { engApi, useEngineeringRefresh } from '../api.js';
import { filterRows, listTitle, moduleFilterOptions, planFilterOptions } from '../engineerView.js';
import { storeWarningText } from '../routeView.js';

/** Carte d'un ingénieur, façon Inara mais avec TES infos : état chez toi, rang, distance, ce qu'il fait au grade max. */
function CarteIngenieur({ e, labels, famille, who }) {
  const etat = etatIngenieur(e.state);
  const [photo, setPhoto] = useState(true); // portrait fourni par le joueur (dossier « ingenieurs ») ; sinon les initiales
  const lignes = lignesOffres(e.offers, labels);
  return (
    <Link data-tuto="ingenierie-ing-carte" to={`/ingenierie/ingenieurs/${e.id}`} className={`ing-carte is-${etat.ton}`}>
      <div className="ing-portrait" aria-hidden="true">
        {photo && <img className="ing-photo" src={`/api/modules/engineering/engineers/${e.id}/portrait`} alt="" onError={() => setPhoto(false)} />}
        {!photo && <span className="ing-initiales">{initiales(e.name)}</span>}
        {who && <span className="ing-grade-max">G{e.maxGrade}</span>}
        <span className={`ing-etat is-${etat.ton}`}>{etat.texte}</span>
      </div>
      <div className="ing-tete">
        <div className="ing-nom">{e.name}</div>
        <div className="ing-lieu">{e.base} · <NomSysteme nom={e.system} /></div>
        <div className="ing-infos">
          {e.distanceAl != null && <span><b>{Math.round(e.distanceAl).toLocaleString('fr-FR')}</b> AL</span>}
          <span>{e.region}</span>
          {e.pads?.L > 0 ? <span>Pad L</span> : e.pads?.M > 0 ? <span>Pad M</span> : null}
          {e.permit?.required && <span className="ing-permis">Permis</span>}
        </div>
        {etat.rang != null && (
          <span className="ing-rang" title={`Rang ${etat.rang} sur 5`}>
            {[1, 2, 3, 4, 5].map((k) => <i key={k} className={k <= etat.rang ? 'is-plein' : ''} />)}
          </span>
        )}
      </div>
      <ul className="ing-offres">
        {lignes.map((l) => (
          <li key={l.grp} className={`g${l.grade}${famille && l.famille === famille ? ' is-filtre' : ''}`}>
            <b className={`grade-badge g${l.grade}`}>G{l.grade}</b> {l.nom}
          </li>
        ))}
      </ul>
    </Link>
  );
}

/**
 * Onglet Ingénieurs : une carte par ingénieur de vaisseau, triées par distance depuis ta position, avec leur état chez
 * toi ; filtres par famille de modules (comme Inara), région, débloqués seulement, et « Qui fait » un plan (grade max).
 */
export default function EngineersPage() {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [region, setRegion] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [grp, setGrp] = useState('');
  const [blueprint, setBlueprint] = useState('');
  const [famille, setFamille] = useState(null);
  const load = () => engApi.engineers().then(setList).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  useEngineeringRefresh(load, { live: true });

  const rows = useMemo(() => filtrerFamille(filterRows(list?.engineers || [], { region, unlocked, grp, blueprint }), famille), [list, region, unlocked, grp, blueprint, famille]);
  if (!list) return <p className="muted">{error || 'Chargement…'}</p>;
  const modules = moduleFilterOptions(list.engineers, list.labels);
  const plans = planFilterOptions(list.engineers, list.labels, grp);
  const who = grp && blueprint;

  return (
    <div className="page">
      <section className="panel">
        <h2>{listTitle(list.engineers.length, list.position)}</h2>
        {(list.warnings || []).map((w) => <p key={w.file} className="alert alert-warning small">{storeWarningText(w)}</p>)}
        <div className="form-actions">
          <label data-tuto="ingenierie-ing-region" className="check">
            Région
            <select value={region} onChange={(e) => setRegion(e.target.value)}>
              <option value="">Toutes</option>
              <option value="Bulle">Bulle</option>
              <option value="Colonia">Colonia</option>
            </select>
          </label>
          <label data-tuto="ingenierie-ing-debloques" className="check">
            <input type="checkbox" checked={unlocked} onChange={() => setUnlocked(!unlocked)} /> Débloqués seulement
          </label>
          <label data-tuto="ingenierie-ing-qui" className="check">
            Qui fait :
            <select value={grp} onChange={(e) => { setGrp(e.target.value); setBlueprint(''); }} aria-label="Module">
              <option value="">Module…</option>
              {modules.map((m) => <option key={m.grp} value={m.grp}>{m.label}</option>)}
            </select>
            <select value={blueprint} disabled={!grp} onChange={(e) => setBlueprint(e.target.value)} aria-label="Plan">
              <option value="">Plan…</option>
              {plans.map((p) => <option key={p.blueprint} value={p.blueprint}>{p.label}</option>)}
            </select>
          </label>
        </div>
      </section>
      <div data-tuto="ingenierie-ing-familles" className="ing-familles" role="group" aria-label="Familles de modules">
        <button type="button" className={`vx-filtre${!famille ? ' is-on' : ''}`} onClick={() => setFamille(null)}>Tous</button>
        {FAMILLES.map((f) => (
          <button key={f.id} type="button" className={`vx-filtre${famille === f.id ? ' is-on' : ''}`} onClick={() => setFamille(famille === f.id ? null : f.id)}>{f.titre}</button>
        ))}
      </div>
      {!rows.length && <p className="muted">Aucun ingénieur pour ces filtres.</p>}
      <div className="ing-grille">
        {rows.map((e) => <CarteIngenieur key={e.id} e={e} labels={list.labels} famille={famille} who={who} />)}
      </div>
    </div>
  );
}
