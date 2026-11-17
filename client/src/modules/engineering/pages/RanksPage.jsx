import { useEffect, useState } from 'react';
import { engApi, useEngineeringRefresh } from '../api.js';
import RuleBadge from '../components/RuleBadge.jsx';
import { applicationsReadText, carryNote, lowerGradesNote, measureRows, orderDetail, progressText, rerollNote, sequenceBadge, sequenceText, sequenceTitle, shortDay } from '../rankView.js';

/**
 * « Ce que tes journaux montrent » : pour chaque rang et chaque grade, ce que la table des règles prévoit (colonnes
 * « (table) », avec le nombre d'observations qui les fondent) et ce que tes applications mesurent (qualité gagnée par
 * application, montées de rang lues par rang) ; les écarts avec la table. Mis à jour à chaque application (temps réel).
 */
export default function RanksPage() {
  const [r, setR] = useState(null);
  const [error, setError] = useState('');
  const load = () => Promise.all([engApi.ranks(), engApi.rankRules()]).then(([view, rules]) => setR({ ...view, rules })).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  useEngineeringRefresh(load);

  if (!r) return <p className="muted">{error || 'Chargement…'}</p>;
  const rows = measureRows(r);
  const general = r.rules.general;
  const lower = lowerGradesNote(r.rules);
  const carry = carryNote(general.CARRY_OVER.value);
  const reroll = rerollNote(r);

  return (
    <div className="page">
      <section className="panel">
        <h2>Ce que tes journaux montrent</h2>
        <p className="small">
          Pour chaque rang d'ingénieur et chaque grade : combien d'applications il faut pour finir le grade, et combien
          pour passer au rang suivant. Les colonnes « (table) » viennent de la table des règles, qui ne change jamais
          d'elle-même ; « Mesuré dans tes journaux » et « Montées dans tes journaux » viennent de tes applications, mises
          à jour en direct, et un écart avec la table est signalé plus bas.
        </p>
        <p className="muted small">
          {applicationsReadText(r) || 'Aucune application dans tes journaux pour l’instant.'}
          {` · table des règles du ${shortDay(r.rules.date)}`}
          {r.rules.table?.[0]?.finish?.source && ` : ${r.rules.table[0].finish.source} ; la colonne « Mesuré dans tes journaux » la compare à tes propres applications`}
        </p>
        <div data-tuto="ingenierie-rangs-table" className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Rang</th>
                <th>Grade</th>
                <th className="right">Pour finir le grade (table)</th>
                <th>Statut</th>
                <th className="right">Mesuré dans tes journaux</th>
                <th>Pour passer au rang suivant (table : applications de ce grade, depuis 0 %)</th>
                <th>Statut</th>
                <th>Montées dans tes journaux (ce rang)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td className="num">{row.rank}</td>
                  <td>
                    G{row.grade} {row.maxGrade && row.rank < 5 && <span className="pill pill-info" title="Grade maximal à ce rang : c'est lui qui fait monter le plus vite">grade max</span>}
                  </td>
                  <td className="right num">
                    {row.finish.value}
                    {row.finishObservations && <span className="muted small"> ({row.finishObservations})</span>}
                  </td>
                  <td><RuleBadge status={row.finish.status} source={row.finish.source} why={row.finish.why} /></td>
                  <td className={`right ${row.agrees === false ? 'bad' : row.agrees ? 'good' : 'muted'}`}>
                    {row.measuredText}
                    {row.measured?.places?.distance > 0 && <span className="muted small"> · dont {row.measured.places.distance} à distance</span>}
                  </td>
                  <td className="small">
                    {row.climbText}
                    {row.climbObservations && <span className="muted"> · {row.climbObservations}</span>}
                  </td>
                  <td>{row.climb ? <RuleBadge status={row.climb.status} source={row.climb.source} why={row.climbWhy} /> : <span className="muted small">rang max</span>}</td>
                  {row.rankFirst && (
                    <td rowSpan={row.rankSpan} className="small">
                      {row.rankClimbs == null ? <span className="muted">rang max</span>
                        : row.rankClimbs.length ? row.rankClimbs.map((c, i) => <div key={i} className={c.ok ? '' : 'bad'}>{c.text}</div>)
                          : <span className="muted">pas encore vue</span>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul data-tuto="ingenierie-rangs-regles" className="notes small">
          <li>
            Le rang ne monte qu'à l'atelier de l'ingénieur : une application faite à distance avance la qualité mais pas
            le rang <RuleBadge status={general.REMOTE_RANK_GAIN.status} source={general.REMOTE_RANK_GAIN.source} />.
          </li>
          <li>
            Un ingénieur débloqué démarre au rang 1 <RuleBadge status={general.UNLOCK_RANK?.status} source={general.UNLOCK_RANK?.source} />,
            à 0 % <RuleBadge status={general.UNLOCK_PROGRESS?.status} source={general.UNLOCK_PROGRESS?.source} why={general.UNLOCK_PROGRESS?.why} /> :
            le calcul compte ainsi un ingénieur pas encore débloqué.
          </li>
          <li>
            {lower.counts.text} <RuleBadge status={lower.counts.status} source={lower.counts.source} />.
            {lower.ratio && <> {lower.ratio.text} <RuleBadge status={lower.ratio.status} /></>}
            {lower.unbounded && <>{lower.ratio ? ' ; ' : ' '}{lower.unbounded.text} <RuleBadge status={lower.unbounded.status} why={lower.unbounded.help} /></>}
            {(lower.ratio || lower.unbounded) && '.'}
          </li>
          <li>
            Le surplus d'une montée passe au rang suivant <RuleBadge status={general.CARRY_OVER.status} /> : le calcul
            prudent ne le compte pas.{carry && <> Le cas favorable le compte, ramené au rang suivant, qui demande plus : {carry}.</>}
          </li>
          <li>
            Refaire un grade déjà à 100 % : <span className={reroll.seen ? 'bad' : ''}>{reroll.text}</span> <RuleBadge status={general.REROLL_FULL_GRADE.status} source={general.REROLL_FULL_GRADE.source} /> :
            pour monter un rang sans module du plan à ce grade, le calcul compte un autre module de ce type, neuf (G1, puis G2…).
          </li>
          <li>
            La progression du rang n'est écrite qu'au chargement de la partie <RuleBadge status={general.PROGRESS_AT_LOAD_ONLY.status} /> :
            pour la relever, reviens au menu principal et recharge la partie.
          </li>
        </ul>
      </section>

      {r.contradictions.length > 0 && (
        <section className="panel">
          <h2 className="bad">Écarts avec la table</h2>
          <p className="small">Ces mesures ne collent pas à la table des règles. La table n'a pas changé : à toi de voir s'il faut la corriger.</p>
          <ul className="notes small">
            {r.contradictions.map((c, i) => (
              <li key={i}>
                {shortDay(c.at)} · {c.engineer}{c.rank != null ? ` au rang ${c.rank}` : ', rang inconnu'}{c.grade ? `, G${c.grade}` : ''} : {c.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section data-tuto="ingenierie-rangs-miens" className="panel">
        <h2>Tes ingénieurs sous le rang 5</h2>
        {r.engineers.filter((e) => e.rank < 5).length ? (
          <ul className="notes small">
            {r.engineers.filter((e) => e.rank < 5).map((e) => (
              <li key={e.name}>
                <strong>{e.name}</strong> : rang {e.rank}, {progressText(e.progress, e.rank)}
                {e.progress?.basis?.kind === 'relevé' && e.progress.basis.at && <span className="muted"> · dernier relevé le {shortDay(e.progress.basis.at)}</span>}
                {e.progress?.basis?.kind === 'montée' && e.progress.basis.at && <span className="muted"> · montée au rang {e.rank} le {shortDay(e.progress.basis.at)}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">{r.engineers.length ? 'Tous tes ingénieurs débloqués sont au rang 5.' : 'Aucun ingénieur débloqué dans tes journaux.'}</p>
        )}
      </section>

      <section data-tuto="ingenierie-rangs-montees" className="panel">
        <h2>Montées de rang lues dans tes journaux</h2>
        {!r.sequences.length && <p className="muted small">Aucune pour l'instant : débloque un ingénieur et fais tes applications à son atelier, elles s'afficheront ici en direct.</p>}
        <div className="eng-list">
          {r.sequences.map((s, i) => (
            <div key={i} className="eng-item">
              <div className="eng-title">
                {sequenceTitle(s)} <span className={sequenceBadge(s).className}>{sequenceBadge(s).label}</span>
              </div>
              <div className="small muted">{shortDay(s.start.at)}{s.end.at && s.end.at.slice(0, 10) !== String(s.start.at).slice(0, 10) ? ` → ${shortDay(s.end.at)}` : ''} · {s.applications} {s.applications === 1 ? 'application' : 'applications'}</div>
              <div className="small">{sequenceText(s)}</div>
              {!s.ok && <div className="small bad">{s.message}</div>}
              {s.ok && s.note && <div className="small muted">{s.note}</div>}
              {s.order?.length > 0 && (
                <details className="small">
                  <summary className="muted">Application par application (qualité gagnée)</summary>
                  {orderDetail(s)}
                </details>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
