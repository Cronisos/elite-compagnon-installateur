// Fiche d'un vaisseau (fenêtre modale, lecture seule) : ce qu'il est aujourd'hui, d'après le jeu. Onglet Builds : ses
// builds et ce qu'il te faut pour y arriver (BuildsVaisseau.jsx). Onglet Stats
// (défense, saut, mobilité, énergie, armement, soute et valeur), onglet Modules (emplacement, module, ingénierie). Rien à
// modifier ici : le constructeur sert à changer un build, l'ingénierie à préparer ses plans.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import Modale from '../../core/Modale.jsx';
import ShipImage from '../../core/ShipImage.jsx';
import ShipNickname, { shipTitle } from '../../core/ShipNickname.jsx';
import ShipRole from '../../core/ShipRole.jsx';
import RoleTags from '../../core/RoleTags.jsx';
import NomSysteme from '../../core/NomSysteme.jsx';
import { vaisseauxApi } from './api.js';
import BuildsVaisseau from './BuildsVaisseau.jsx';
import { barresGrade, groupesStats, modulesParGroupe, padTexte, texteIngenierie } from './ficheVue.js';

function Resistances({ res }) {
  if (!res?.length) return null;
  return (
    <span className="fv-res">
      {res.map((r) => (
        <span key={r.label} className={r.valeur < 0 ? 'is-neg' : ''}>{r.label} {r.valeur} %</span>
      ))}
    </span>
  );
}

function Stats({ fiche }) {
  return (
    <div className="fv-stats">
      {groupesStats(fiche).map((g) => (
        <section key={g.titre} className="fv-groupe">
          <h3>{g.titre}</h3>
          <dl>
            {g.lignes.map((l) => (
              <div key={l.label} className={`fv-ligne${l.fort ? ' is-fort' : ''}`}>
                <dt>{l.label}</dt>
                <dd>
                  {l.valeur}
                  {l.jauge != null && <span className={`fv-jauge${l.jauge > 1 ? ' is-trop' : ''}`}><span style={{ width: `${Math.min(100, l.jauge * 100)}%` }} /></span>}
                  <Resistances res={l.res} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

/**
 * Une tuile par module, comme un emplacement de l'écran d'équipement du jeu : classe et note en gros (« 5A »), le nom,
 * la taille de l'emplacement, l'ingénierie en barres de grade, l'effet expérimental, la caractéristique clé.
 */
function TuileModule({ m }) {
  const ing = m.ingenierie;
  const complet = ing && ing.grade >= ing.max;
  return (
    <div className={`fv-tuile${ing ? ' is-inge' : ''}${complet ? ' is-complet' : ''}`} title={m.emplacement}>
      <div className="fv-classe">{m.classe || '—'}</div>
      <div className="fv-tuile-corps">
        <div className="fv-tuile-nom">
          {m.nom || m.module}
          {m.nombre > 1 && <span className="fv-nombre">×{m.nombre}</span>}
        </div>
        <div className="fv-tuile-emp">{m.emplacement}{m.info ? ` · ${m.info}` : ''}</div>
        {ing && (
          <div className="fv-tuile-inge">
            <span className="fv-barres" aria-label={`Grade ${ing.grade} sur ${ing.max}`}>
              {barresGrade(ing).map((plein, k) => <i key={k} className={plein ? 'is-plein' : ''} />)}
            </span>
            <span className="fv-plan">{texteIngenierie(ing)}</span>
          </div>
        )}
        {m.effet && <div className="fv-effet">◆ {m.effet}</div>}
      </div>
    </div>
  );
}

function Modules({ fiche }) {
  return (
    <div className="fv-modules">
      {modulesParGroupe(fiche).map((g) => (
        <section key={g.key} className={`fv-section fv-section-${g.key}`}>
          <h3>{g.label} <span className="fv-compte">{g.modules.reduce((n, m) => n + m.nombre, 0)}</span></h3>
          <div className="fv-tuiles">
            {g.modules.map((m, i) => <TuileModule key={`${g.key}-${i}`} m={m} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

export default function FicheVaisseau({ vaisseau: s, role, onFermer, onRenomme }) {
  const [fiche, setFiche] = useState(null);
  const [erreur, setErreur] = useState('');
  const [onglet, setOnglet] = useState('stats');
  const navigate = useNavigate();
  useEffect(() => {
    setFiche(null);
    setErreur('');
    vaisseauxApi.fiche(s.shipId).then(setFiche, (e) => setErreur(e.message));
  }, [s.shipId]);

  const titre = (
    <span className="fv-titre">
      {shipTitle(s)}
      {s.current && <span className="fv-actuel">ACTUEL</span>}
    </span>
  );
  const construire = () => navigate(`/builder/nouveau?depuis=${encodeURIComponent(s.shipId)}`);
  const pied = fiche && (
    <button type="button" className="btn" data-tuto="vaisseaux-fiche-construire" onClick={construire} title="Ouvre le constructeur sur la configuration actuelle de ce vaisseau">
      Construire un build à partir de celui-ci
    </button>
  );
  return (
    <Modale titre={titre} onFermer={onFermer} pied={pied} large>
      <div className="fv-tete">
        <ShipImage shipKey={s.key || s.type} hasImage={s.hasImage} />
        <div className="fv-ident">
          <div className="fv-modele">{[shipTitle(s) !== s.model ? s.model : null, s.ident].filter(Boolean).join(' · ')}</div>
          <div className="fv-etiquettes">
            {fiche?.pad && <span className="fv-pad">{padTexte(fiche.pad)}</span>}
            <RoleTags role={role} />
          </div>
          {s.system && <div className="fv-ou">{s.current ? 'Tu es dans' : 'Garé à'} <NomSysteme nom={s.system} /></div>}
          <div className="form-actions" data-tuto="vaisseaux-fiche-nom">
            <ShipNickname shipId={s.shipId} nickname={s.nickname} onSaved={onRenomme} />
            <ShipRole shipId={s.shipId} role={role} summary={false} />
          </div>
        </div>
      </div>
      <nav className="tabs" data-tuto="vaisseaux-fiche-onglets" aria-label="Fiche du vaisseau">
        <button type="button" className={onglet === 'stats' ? 'active' : ''} onClick={() => setOnglet('stats')}>Stats</button>
        <button type="button" className={onglet === 'modules' ? 'active' : ''} onClick={() => setOnglet('modules')}>Modules</button>
        <button type="button" className={onglet === 'builds' ? 'active' : ''} onClick={() => setOnglet('builds')}>Ses builds</button>
      </nav>
      {erreur && <p className="muted">{erreur}</p>}
      {!fiche && !erreur && <p className="muted">Chargement…</p>}
      {fiche && fiche.alertes?.length > 0 && <p className="small warn">{fiche.alertes.join(' · ')}</p>}
      {fiche && onglet === 'stats' && <Stats fiche={fiche} />}
      {fiche && onglet === 'modules' && <Modules fiche={fiche} />}
      {fiche && onglet === 'builds' && <BuildsVaisseau shipId={s.shipId} onConstruire={construire} />}
    </Modale>
  );
}
