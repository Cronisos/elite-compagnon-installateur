import { useEffect, useState } from 'react';
import { engApi, useEngineeringRefresh } from '../api.js';
import { dateTime, int } from '../../../core/format.js';
import { matchesSearch } from '../../../core/text.js';
import { TYPES, basculerGrade, classeGrade, filtrerGrades, grouperMateriaux } from '../materiauxVue.js';

/**
 * Inventaire des matériaux, en temps réel, rangé comme dans les échangeurs du jeu : par type, par catégorie, du grade 1
 * au grade 5 (couleur par grade), avec la limite de stock. Les matériaux à 0 restent visibles, en retrait.
 */
export default function MaterialsPage() {
  const [inv, setInv] = useState(null);
  const [q, setQ] = useState('');
  const [grades, setGrades] = useState(() => new Set()); // grades choisis ; vide : tous
  const [error, setError] = useState('');
  const load = () => engApi.inventory().then(setInv).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  useEngineeringRefresh(load);

  if (!inv) return <p className="muted">{error || 'Chargement…'}</p>;
  const filter = (m) => matchesSearch(q, [m.label, m.english]); // en français ou en anglais, sans accents
  const cherches = [...inv.items, ...(inv.absents || [])].filter(filter);
  const tous = filtrerGrades(cherches, grades);

  return (
    <div className="page">
      <div className="panel form-actions">
        <input data-tuto="ingenierie-mat-recherche" placeholder="Rechercher un matériau (français ou anglais)…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span data-tuto="ingenierie-mat-grades" className={`mat-grades${grades.size ? ' is-filtre' : ''}`} role="group" aria-label="Filtrer par grade">
          {[1, 2, 3, 4, 5].map((g) => (
            <button
              key={g}
              type="button"
              className={`grade-badge grade-filtre g${g}${grades.has(g) ? ' is-on' : ''}`}
              aria-pressed={grades.has(g)}
              title={grades.has(g) ? `Ne plus filtrer sur le grade ${g}` : `Montrer le grade ${g} (plusieurs grades possibles)`}
              onClick={() => setGrades((s) => basculerGrade(s, g))}
            >
              G{g}
            </button>
          ))}
          {grades.size > 0 && <button type="button" className="btn btn-ghost mat-grades-tous" onClick={() => setGrades(new Set())}>Tous</button>}
        </span>
        <span data-tuto="ingenierie-mat-date" className="muted small">
          Recalé sur le jeu le {dateTime(inv.at)} (à chaque lancement), puis suivi en direct. Certaines récompenses
          (Powerplay) ne sont écrites dans le journal qu'à la reconnexion suivante.
        </span>
      </div>
      <div data-tuto="ingenierie-mat-colonnes" className="three-cols">
        {TYPES.map(([type, title]) => {
          const groupes = grouperMateriaux(tous, type);
          return (
            <section key={type} className="panel">
              <h2>{title}</h2>
              {!groupes.length && <p className="muted">Aucun.</p>}
              {groupes.map((g) => (
                <div key={g.cle} className="mat-cat">
                  <h3 className="mat-cat-titre">{g.titre}</h3>
                  {g.items.map((m) => (
                    <div data-tuto="ingenierie-mat-ligne"
                      key={m.key}
                      className={`mat-row${m.count ? '' : ' is-vide'}`}
                      title={[m.method, m.english && m.english !== m.label && `En anglais : ${m.english}`, m.absent && 'Jamais ramassé : le jeu ne donne son nom français qu’une fois en soute.'].filter(Boolean).join('\n') || undefined}
                    >
                      <span className={`grade-badge ${classeGrade(m.grade)}`}>G{m.grade ?? '?'}</span>
                      <span className="mat-name">{m.label}</span>
                      <span className="mat-bar">
                        <span style={{ width: `${m.max ? Math.min(100, (m.count / m.max) * 100) : 0}%` }} className={m.max && m.count >= m.max ? 'full' : ''} />
                      </span>
                      <span className="num mat-count">
                        {int(m.count)}
                        {m.max && <span className="muted">/{m.max}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
