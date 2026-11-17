// Échangeur de matériaux (tableau de bord) : pour chaque matériau qui manque aux plans, quoi donner chez l'échangeur
// (seulement ce qui dépasse les besoins des plans), aux taux du jeu mesurés, et les échangeurs connus les plus proches.

import { int } from '../../../core/format.js';
import NomSysteme from '../../../core/NomSysteme.jsx';
import { classeGrade } from '../materiauxVue.js';

const TYPES = { Raw: 'matières premières', Manufactured: 'manufacturés', Encoded: 'données' };

const Grade = ({ g }) => <span className={`grade-badge ${classeGrade(g)}`}>G{g}</span>;

export default function Echangeur({ echanges }) {
  const props = echanges?.propositions || [];
  if (!props.length) return null;
  const types = Object.entries(echanges.echangeurs || {});
  return (
    <section data-tuto="ingenierie-tdb-echangeur" className="panel ech">
      <h2>Échangeur de matériaux</h2>
      <p className="small muted">
        Ce que tu peux donner chez l’échangeur pour ce qui manque, en ne prenant que ce que tes plans n’utilisent pas.
        D’abord les matériaux à leur plafond (perdus à la prochaine collecte), puis la même catégorie (sans pénalité).
      </p>
      <ul className="ech-liste">
        {props.map((p) => (
          <li key={p.key} className={p.reste ? '' : 'is-couvert'}>
            <div className="ech-cible">
              <span>Il te manque <b>{int(p.manque)}</b> × <Grade g={p.grade} /> <b>{p.label}</b></span>
              {!p.echangeable && <span className="small muted"> · ne s’échange pas (gardien, thargoïde…)</span>}
              {p.echangeable && !p.echanges.length && p.place !== 0 && <span className="small bad"> · pas de surplus à échanger</span>}
              {p.echanges.length > 0 && <span className={`small ${p.reste ? 'warn' : 'good'}`}> · {p.reste ? `il manquera encore ${int(p.reste)}` : 'couvert par l’échange'}</span>}
              {p.plusieursPassages && (
                <div className="small warn">
                  {p.place > 0
                    ? `Ton stock n’en garde que ${int(p.place)} de plus (plafond) : utilise-les dans tes plans, puis reviens échanger le reste. À faire en plusieurs passages.`
                    : 'Ton stock est déjà au plafond : utilise-en dans tes plans avant d’échanger. À faire en plusieurs passages.'}
                </div>
              )}
            </div>
            {p.echanges.length > 0 && (
              <ul className="ech-dons">
                {p.echanges.map((e) => (
                  <li key={e.key}>
                    donne <b>{int(e.donne)}</b> × <Grade g={e.grade} /> {e.label} → reçois <b>{int(e.recoit)}</b>
                    {!e.memeCategorie && <span className="small muted"> (autre catégorie : taux ÷ 6)</span>}
                    {e.perdu > 0 && <span className="small warn"> · dont {int(e.perdu)} perdus : ton stock sera au plafond</span>}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {types.length > 0 && (
        <div className="ech-ou">
          {types.map(([type, liste]) => (
            <p key={type} className="small">
              <span className="muted">Échangeur de {TYPES[type] || type} :</span>{' '}
              {liste.length ? liste.map((s, i) => (
                <span key={`${s.station}-${i}`} className="ech-station">
                  {i > 0 && ' · '}<b>{s.station}</b> (<NomSysteme nom={s.system} />{s.distanceAl != null ? `, ${s.distanceAl.toLocaleString('fr-FR')} al` : ''})
                  {!s.exact && <span className="muted" title="Type d’après l’économie de la station : tu n’y as pas encore échangé"> ?</span>}
                </span>
              )) : <span className="muted">aucun connu (amarre-toi à une station qui en a un : l’app s’en souviendra)</span>}
            </p>
          ))}
          <p className="small muted">Échangeurs appris dans ton journal, à vol d’oiseau depuis {echanges.position || 'ta position'}.</p>
        </div>
      )}
    </section>
  );
}
