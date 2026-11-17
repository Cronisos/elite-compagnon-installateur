import { int } from '../../../core/format.js';
import { classeGrade, libelleCategorie, rangEchangeur } from '../materiauxVue.js';

/**
 * Matériaux : nécessaire, possédé, manquant (vert = réuni, rouge = manquant), méthode. Rangés comme dans les échangeurs
 * (type, catégorie, grade 1 → 5, couleur par grade). Quand des ingénieurs sous le rang 5 demandent des applications en
 * plus, la colonne « dont rangs » dit la part du nécessaire qui vient d'eux.
 */
export default function MaterialTable({ materials, onlyMissing = false }) {
  const rows = (onlyMissing ? materials.filter((m) => m.missing > 0) : [...materials]).sort((a, b) => rangEchangeur(a) - rangEchangeur(b));
  if (!rows.length) return <p className="good">Tous les matériaux sont réunis.</p>;
  const ranks = rows.some((m) => m.rankExtra > 0);
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Matériau</th>
            <th>Catégorie</th>
            <th className="right">Nécessaire</th>
            {ranks && <th className="right" title="Part du nécessaire due aux rangs des ingénieurs (calcul prudent)">dont rangs</th>}
            <th className="right">Possédé</th>
            <th className="right">Manquant</th>
            <th>Méthode d'obtention</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.key}>
              <td>
                {m.grade && <span className={`grade-badge ${classeGrade(m.grade)}`}>G{m.grade}</span>} {m.label}
              </td>
              <td className="muted small">{libelleCategorie(m)}</td>
              <td className="right num">{int(m.need)}</td>
              {ranks && <td className="right num warn">{m.rankExtra > 0 ? `+${int(m.rankExtra)}` : ''}</td>}
              <td className="right num">{int(m.owned)}</td>
              <td className={`right num ${m.missing ? 'bad' : 'good'}`}>{m.missing ? int(m.missing) : '✓'}</td>
              <td className="small muted">{m.missing ? m.method : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
