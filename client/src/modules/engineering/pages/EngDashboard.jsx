import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { engApi, useEngineeringRefresh } from '../api.js';
import ShipImage from '../../../core/ShipImage.jsx';
import MaterialTable from '../components/MaterialTable.jsx';
import Tile from '../../../core/Tile.jsx';
import { int, pct } from '../../../core/format.js';
import RuleBadge from '../components/RuleBadge.jsx';
import { engineerRankSummary, extraSummary } from '../rankView.js';
import ValidationPill from '../components/ValidationPill.jsx';
import Modale from '../../../core/Modale.jsx';
import Echangeur from '../components/Echangeur.jsx';

/**
 * « Ajouter un plan » : les plans qui ne sont pas encore au tableau de bord, un clic en ajoute un ; ou en créer un
 * nouveau (page Nouveau plan).
 */
function AjoutPlan({ plans, onAjouter, onFermer }) {
  const libres = plans.filter((p) => !p.selected);
  return (
    <Modale titre="Ajouter un plan au tableau de bord" onFermer={onFermer} large>
      <div className="tdb-cartes">
        {libres.map((p) => (
          <button key={p.id} type="button" className="tdb-carte tdb-choix" onClick={() => onAjouter(p)}>
            <ShipImage shipKey={p.shipType} hasImage={p.hasImage} size="sm" />
            <span className="tdb-carte-nom">{p.name}</span>
            <span className="tdb-carte-modele">{p.model}</span>
            <span className="tdb-carte-action is-ajout">+ Ajouter</span>
          </button>
        ))}
        <Link to="/ingenierie/nouveau-plan" className="tdb-carte tdb-carte-nouveau">
          <span className="tdb-plus" aria-hidden="true">+</span>
          <span>Créer un nouveau plan</span>
        </Link>
      </div>
      {!libres.length && <p className="muted small">Tous tes plans sont déjà au tableau de bord.</p>}
    </Modale>
  );
}

/**
 * Dashboard multi-vaisseaux. Stock commun : un matériau utilisé par plusieurs plans
 * n'est jamais compté deux fois ; le besoin total est comparé au stock unique.
 */
export default function EngDashboard() {
  const [d, setD] = useState(null);
  const [validated, setValidated] = useState(new Map());
  const [error, setError] = useState('');
  const [ajout, setAjout] = useState(false);
  const load = () => Promise.all([
    engApi.dashboard().then(setD),
    // Plans validés (itinéraire) : pastille « validé » ou « validé · modifié depuis » ; absents si la liste est illisible
    engApi.validations().then((list) => setValidated(new Map(list.map((v) => [v.planId, v])))).catch(() => setValidated(new Map())),
  ]).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  useEngineeringRefresh(load);

  async function toggle(p) {
    try {
      await engApi.updatePlan(p.id, { selected: !p.selected });
    } catch (e) {
      setError(e.message);
    }
    load();
  }

  if (!d) return <p className="muted">{error || 'Chargement…'}</p>;
  if (!d.plans.length) {
    return (
      <section data-tuto="ingenierie-tdb-vide" className="panel center">
        <p>Aucun plan pour l'instant.</p>
        <Link className="btn btn-primary" to="/vaisseaux">Choisir un vaisseau</Link>
      </section>
    );
  }
  const g = d.global;
  const done = d.perPlan.reduce((a, p) => a + p.modulesDone, 0);
  const total = d.perPlan.reduce((a, p) => a + p.modulesTotal, 0);
  const suivi = new Map(d.perPlan.map((p) => [p.id, p]));
  // Seulement les plans ajoutés ; les autres se choisissent dans « Ajouter un plan »
  const cartes = d.plans.filter((p) => p.selected);
  const inclus = cartes.length;

  return (
    <div className="page">
      <section className="panel">
        <div className="tdb-tete">
          <h2>Plans du tableau de bord</h2>
          <span className="muted small">{inclus} plan{inclus > 1 ? 's' : ''} · le stock est commun à tous les plans du tableau de bord</span>
          {error && <span className="bad small">{error}</span>}
        </div>
        <div data-tuto="ingenierie-tdb-plans" className="tdb-cartes">
          {cartes.map((p) => {
            const s = suivi.get(p.id);
            return (
              <div key={p.id} className="tdb-carte is-inclus">
                <Link to={`/ingenierie/plan/${p.id}`} className="tdb-carte-lien" title="Ouvrir le plan">
                  <ShipImage shipKey={p.shipType} hasImage={p.hasImage} size="sm" />
                  <span className="tdb-carte-nom">{p.name}</span>
                  <span className="tdb-carte-modele">{p.model}</span>
                </Link>
                {s && (
                  <div className="tdb-carte-suivi">
                    <div className="progress small-progress">
                      <div className={`progress-bar ${s.progress >= 1 ? 'bar-good' : ''}`} style={{ width: `${Math.round(s.progress * 100)}%` }} />
                    </div>
                    <span className="small">{pct(s.progress)} · {s.modulesDone}/{s.modulesTotal} modules</span>
                    {s.missing.length > 0 && <span className="small bad">{s.missing.length} matériau{s.missing.length > 1 ? 'x' : ''} manquant{s.missing.length > 1 ? 's' : ''}</span>}
                    <span className="tdb-pastilles">
                      {s.canFinishNow && <span className="pill pill-good">faisable</span>}
                      <ValidationPill v={validated.get(p.id)} />
                    </span>
                  </div>
                )}
                <button type="button" className="tdb-carte-action" onClick={() => toggle(p)} title="Retirer du tableau de bord (le plan est gardé)">
                  − Retirer
                </button>
              </div>
            );
          })}
          <button data-tuto="ingenierie-tdb-ajouter" type="button" className="tdb-carte tdb-carte-nouveau" onClick={() => setAjout(true)}>
            <span className="tdb-plus" aria-hidden="true">+</span>
            <span>Ajouter un plan</span>
          </button>
        </div>
      </section>
      {ajout && <AjoutPlan plans={d.plans} onFermer={() => setAjout(false)} onAjouter={(p) => { setAjout(false); toggle(p); }} />}

      {!inclus && <p className="panel center muted">Aucun plan au tableau de bord : « Ajouter un plan » ci-dessus.</p>}

      {inclus > 0 && <div data-tuto="ingenierie-tdb-chiffres" className="tiles tiles-4">
        <Tile label="Avancement général" value={pct(g.progress)} sub="matériaux réunis (stock commun)" tone={g.progress >= 1 ? 'good' : undefined} />
        <Tile label="Modules terminés" value={`${done}/${total}`} />
        <Tile label="Matériaux manquants" value={int(g.missingCount)} tone={g.missingCount ? 'bad' : 'good'} />
        <Tile label="Plans faisables maintenant" value={int(d.perPlan.filter((p) => p.canFinishNow).length)} sub="avec le stock actuel" tone="good" />
      </div>}

      {inclus > 0 && g.rankExtra?.rolls > 0 && (
        <section className="panel">
          <h2>Rangs des ingénieurs (tous plans confondus)</h2>
          <p className="small warn">
            {extraSummary(g.rankExtra)}, déjà comptés ci-dessous. Une montée de rang chez un ingénieur sert à tous les
            plans faits chez lui : elle n’est comptée qu’une fois.
          </p>
          <ul className="notes small">
            {g.engineers.map((e) => {
              // Même résumé que la section « Rangs des ingénieurs » du plan : fourchette et badge compris
              const r = engineerRankSummary(e);
              return (
                <li key={e.name}>
                  <strong>{r.title}</strong> <RuleBadge status={r.status} why={r.why} /> : {r.progress}
                  {r.after && ` · ${r.after}`}
                  {r.extras.map((x, i) => <div key={i}>{x.text}{x.label && ` (modification de « ${x.label} »)`}</div>)}
                  {r.range && (
                    <div>
                      En tout : {r.range.text}
                      {r.range.reroll && <> (le bas de la fourchette suppose de refaire un grade déjà fini <RuleBadge status="inconnue" />)</>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {inclus > 0 && (
        <section data-tuto="ingenierie-tdb-manque" className="panel">
          <h2>Ce qui manque (tous plans confondus)</h2>
          <MaterialTable materials={g.materials} onlyMissing />
        </section>
      )}
      {inclus > 0 && <Echangeur echanges={d.echanges} />}
    </div>
  );
}
