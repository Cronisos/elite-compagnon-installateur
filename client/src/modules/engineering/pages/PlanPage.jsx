import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { engApi, useEngineeringRefresh } from '../api.js';
import ShipImage from '../../../core/ShipImage.jsx';
import MaterialTable from '../components/MaterialTable.jsx';
import Tile from '../../../core/Tile.jsx';
import { int, pct } from '../../../core/format.js';
import ExternalLinks from '../../../core/ExternalLinks.jsx';
import RuleBadge from '../components/RuleBadge.jsx';
import ValidationBlock from '../components/ValidationBlock.jsx';
import { engineerRankSummary, extraMaterialCells, extraMaterialsNote, extraSummary, moduleRankLines, moduleRollsTitle, orderText, rankedEngineers, rankRollsSub, stepEngineerText } from '../rankView.js';

const GROUPS = [
  ['standard', 'Modules standard'],
  ['hardpoint', "Points d'emport"],
  ['utility', 'Utilitaires'],
  ['internal', 'Modules internes'],
];

/** Écran d'un vaisseau : modules, modification, grade, effet expérimental, puis calcul. */
export default function PlanPage() {
  const { id } = useParams();
  const [view, setView] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showCalc, setShowCalc] = useState(false);
  const calcRef = useRef(null);
  const navigate = useNavigate();

  const load = () => engApi.plan(id).then(setView).catch((e) => setError(e.message));
  useEffect(() => {
    setView(null);
    load();
  }, [id]);
  useEngineeringRefresh(load);

  async function run(fn) {
    setBusy(true);
    setError('');
    try {
      const v = await fn();
      if (v?.slots) setView(v);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const change = (slot, body) => run(() => engApi.setModule(id, slot, body));

  function calculate() {
    setShowCalc(true);
    load();
    setTimeout(() => calcRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }

  async function remove() {
    if (!window.confirm(`Supprimer le plan « ${view.plan.name} » ?`)) return;
    await engApi.deletePlan(id);
    navigate('/ingenierie');
  }

  if (!view) return <p className="muted">{error || 'Chargement…'}</p>;
  const c = view.calc;

  return (
    <div className="page">
      <header className="plan-header panel">
        <ShipImage shipKey={view.ship.key} hasImage={view.ship.hasImage} editable size="lg" />
        <div className="plan-header-body">
          <h1>{view.plan.name}</h1>
          <p className="muted">
            {view.ship.model} · {view.ship.live ? 'config actuelle lue dans le journal, mise à jour en temps réel' : 'vaisseau vierge'}
          </p>
          <div data-tuto="ingenierie-plan-chiffres" className="tiles tiles-4 compact-tiles">
            <Tile label="Matériaux réunis" value={pct(c.progress)} tone={c.progress >= 1 ? 'good' : c.progress > 0.6 ? undefined : 'warn'} />
            <Tile label="Modules terminés" value={`${c.modulesDone}/${c.modulesTotal}`} tone={c.modulesTotal && c.modulesDone === c.modulesTotal ? 'good' : undefined} />
            <Tile label="Matériaux manquants" value={int(c.missingCount)} tone={c.missingCount ? 'bad' : 'good'} />
            <Tile
              label="Applications restantes"
              value={int(c.rolls)}
              sub={rankRollsSub(c.rankExtra)}
              tone={c.rankExtra?.rolls ? 'warn' : undefined}
            />
          </div>
          <div data-tuto="ingenierie-plan-actions" className="form-actions">
            <button className="btn" onClick={() => run(() => engApi.allG5(id))} disabled={busy}>Tout en G5</button>
            {view.ship.live && (
              <button className="btn" onClick={() => window.confirm('Revenir à la config actuelle du vaisseau ?') && run(() => engApi.reset(id))} disabled={busy}>
                Revenir à la config actuelle
              </button>
            )}
            <button data-tuto="ingenierie-plan-calculer" className="btn btn-primary" onClick={calculate} disabled={busy}>Calculer</button>
            <button className="btn btn-ghost bad" onClick={remove}>Supprimer le plan</button>
          </div>
          {error && <p className="bad">{error}</p>}
          <ValidationBlock planId={view.plan.id} validation={view.validation} calc={c} onChanged={load} />
        </div>
      </header>

      {GROUPS.map(([g, title]) => {
        const slots = view.slots.filter((s) => s.group === g);
        if (!slots.length) return null;
        return (
          <section key={g} className="panel">
            <h2>{title}</h2>
            <div className="slot-list">
              {slots.map((s) => (
                <SlotRow key={s.key} slot={s} view={view} onChange={change} busy={busy} status={c.modules.find((m) => m.slot === s.key)} />
              ))}
            </div>
          </section>
        );
      })}

      {showCalc && (
        <div ref={calcRef} className="page">
          <section data-tuto="ingenierie-plan-materiaux" className="panel">
            <h2>Matériaux nécessaires</h2>
            {c.rankExtra?.rolls > 0 && <p className="small warn">Rangs des ingénieurs compris : {extraSummary(c.rankExtra)} (détail plus bas).</p>}
            <MaterialTable materials={c.materials} />
          </section>
          <RankSection calc={c} />
          <section data-tuto="ingenierie-plan-ingenieurs" className="panel">
            <h2>Ingénieurs par module</h2>
            <EngineerList modules={c.modules} engineers={c.engineers} rules={c.rules} />
          </section>
        </div>
      )}
    </div>
  );
}

/** Une ligne d'emplacement : config actuelle → config visée. */
function SlotRow({ slot, view, onChange, busy, status }) {
  const options = view.optionSets[slot.optionSet] || [];
  const grp = view.groups[slot.grp] || { blueprints: [], specials: [] };
  const t = slot.target;
  const cur = slot.current;
  const bp = grp.blueprints.find((b) => b.key === t.blueprint);
  const maxGrade = bp ? Math.max(...bp.grades) : 0;

  return (
    <div data-tuto="ingenierie-plan-ligne" className={`slot-row ${status?.done === false ? 'slot-todo' : status?.done ? 'slot-done' : ''}`}>
      <div className="slot-size">
        <span className="size-badge">{slot.size ?? '—'}</span>
      </div>
      <div className="slot-current">
        <div className="slot-label muted small">{slot.label}</div>
        <div>{cur?.label || <span className="muted">Vide</span>}</div>
        {cur?.blueprint && (
          <div className="small">
            <span className="accent">G{cur.grade}</span> {cur.blueprintLabel}
            {cur.quality > 0 && cur.quality < 1 && <span className="muted"> ({Math.round(cur.quality * 100)} %)</span>}
            {cur.experimentalLabel && <span className="pill pill-info">{cur.experimentalLabel}</span>}
          </div>
        )}
      </div>
      <div className="slot-target">
        <select value={t.module || ''} disabled={busy} onChange={(e) => onChange(slot.key, { module: e.target.value || null })}>
          <option value="">— Vide —</option>
          {t.module && !options.some((o) => o.symbol === t.module) && <option value={t.module}>{t.label}</option>}
          {options.map((o) => (
            <option key={o.symbol} value={o.symbol}>{o.label}</option>
          ))}
        </select>
        {grp.blueprints.length > 0 && (
          <div className="slot-eng">
            <select value={t.blueprint || ''} disabled={busy} onChange={(e) => onChange(slot.key, { blueprint: e.target.value || null })}>
              <option value="">Sans modification</option>
              {grp.blueprints.map((b) => (
                <option key={b.key} value={b.key}>{b.name}</option>
              ))}
            </select>
            {t.blueprint && (
              <span className="grade-picker">
                {Array.from({ length: maxGrade }, (_, i) => i + 1).map((g) => (
                  <button
                    key={g}
                    type="button"
                    disabled={busy}
                    className={`grade-btn ${t.grade === g ? 'on' : ''} ${cur?.blueprintKey === t.blueprint && cur.module === t.module && g <= cur.grade ? 'have' : ''}`}
                    onClick={() => onChange(slot.key, { grade: g })}
                  >
                    {g}
                  </button>
                ))}
              </span>
            )}
            {t.blueprint && grp.specials.length > 0 && (
              <select value={t.experimental || ''} disabled={busy} onChange={(e) => onChange(slot.key, { experimental: e.target.value || null })}>
                <option value="">Sans effet expérimental</option>
                {grp.specials.map((s) => (
                  <option key={s.key} value={s.key}>{s.name}</option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>
      <div data-tuto="ingenierie-plan-statut" className="slot-status">
        {status && (status.done ? <span className="pill pill-good">✓ Terminé</span> : (
          <span
            className={`pill ${status.blocked ? 'pill-bad' : 'pill-warn'}`}
            title={moduleRollsTitle(status)}
          >
            {status.rolls} appl.{status.estimate ? ' ≈' : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Rangs des ingénieurs du plan : progression, montées, applications et matériaux en plus, ordre conseillé. */
function RankSection({ calc }) {
  const list = rankedEngineers(calc);
  if (!list.length) return null;
  const extra = calc.rankExtra?.materials || [];
  return (
    <section className="panel">
      <h2>Rangs des ingénieurs</h2>
      <p className="small">
        Sous le rang 5, chaque grade demande plus d’applications, et viser un grade au-dessus du rang demande d’abord de
        le monter. Les applications du plan chez un même ingénieur comptent pour sa montée : seul le manque s’ajoute.
        Fais-les à son atelier : à distance, le rang ne monte pas.
      </p>
      <div className="eng-list">
        {list.map((e) => {
          const r = engineerRankSummary(e);
          return (
            <div key={e.name} className="eng-item">
              <div className="eng-title">
                {r.title} <RuleBadge status={r.status} source={calc.rules?.source} why={r.why} />
              </div>
              <div className="small muted">
                {r.progress}
                {r.after && ` · ${r.after}`}
              </div>
              {r.extras.map((x, i) => (
                <div key={i} className="small warn">
                  {x.text}{x.label && ` (modification de « ${x.label} »)`}
                </div>
              ))}
              {r.range && (
                <div className="small warn">
                  En tout : {r.range.text}
                  {r.range.reroll && <> (le bas de la fourchette suppose de refaire un grade déjà fini <RuleBadge status={calc.rules?.reroll?.status || 'inconnue'} />)</>}
                </div>
              )}
              {e.order?.length > 0 && <div className="small"><span className="muted">Ordre conseillé : </span>{orderText(e.order)}</div>}
            </div>
          );
        })}
      </div>
      {calc.engineers.some((e) => e.locked) && (
        <p className="small muted">
          Ingénieur pas encore débloqué : ses grades sont comptés comme après son déblocage, au rang 1{' '}
          <RuleBadge status={calc.rules?.unlockRank?.status || 'mesurée'} source={calc.rules?.unlockRank?.source} /> à 0 %{' '}
          <RuleBadge status={calc.rules?.unlockProgress?.status || 'à vérifier'} source={calc.rules?.unlockProgress?.source} why={calc.rules?.unlockProgress?.why} /> ; le module
          reste marqué bloqué tant qu’il ne l’est pas.
        </p>
      )}
      {calc.engineers.some((e) => e.extras.length) && (
        <p className="small muted">
          Applications en plus : sur un autre module de ce type, neuf, avec la même modification : G1, puis G2… jusqu’au
          grade du rang, car un grade ne s’applique qu’une fois le précédent à 100 %{' '}
          <RuleBadge status={calc.rules?.nextGrade?.status || 'mesurée'} source={calc.rules?.nextGrade?.source} />. Il te
          faut ce module (acheté, ou pris dans ta flotte), monté sur le vaisseau que tu amènes à l’atelier ; il sert d’une
          montée à la suivante. Refaire un grade déjà à 100 % n’a jamais été vu dans les journaux de référence{' '}
          <RuleBadge status={calc.rules?.reroll?.status || 'inconnue'} /> : seul le bas de la fourchette le suppose. Un
          module de ta flotte déjà au grade d’en dessous de cette modification en demanderait moins : ce n’est pas compté.
        </p>
      )}
      {extra.length > 0 && (
        <>
          <h3>Matériaux en plus dus aux rangs</h3>
          <p className="small muted">{extraMaterialsNote(extra, calc.engineers.some((e) => e.extraFavorableReroll))}</p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Matériau</th>
                  <th className="right">En plus</th>
                  <th className="right">Possédé</th>
                  <th className="right">Manquant (tout le plan)</th>
                  <th>Méthode d’obtention</th>
                </tr>
              </thead>
              <tbody>
                {extra.map((m) => {
                  const cells = extraMaterialCells(m);
                  return (
                    <tr key={m.key}>
                      <td>{m.label} {m.grade && <span className={`grade-badge g${m.grade}`}>G{m.grade}</span>}</td>
                      <td className="right num warn">
                        {cells.extra}
                        {cells.favorable && <div className="small muted">{cells.favorable}</div>}
                      </td>
                      <td className="right num">{int(m.owned)}</td>
                      <td className={`right num ${m.missing ? 'bad' : 'good'}`}>
                        {m.missing ? int(m.missing) : '✓'}
                        {cells.missingFavorable && <div className="small warn">{cells.missingFavorable}</div>}
                      </td>
                      <td className="small muted">{m.missing || cells.missingFavorable ? m.method : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function EngineerList({ modules, engineers = [], rules = {} }) {
  const todo = modules.filter((m) => !m.done);
  if (!todo.length) return <p className="good">Rien à faire : tous les modules sont au niveau visé.</p>;
  return (
    <div className="eng-list">
      {todo.map((m) => (
        <div key={m.slot} className="eng-item">
          <div className="eng-title">{m.label}</div>
          {m.steps.map((s, i) => {
            // « Juri Ishmaak (rang inconnu) » quand le journal n'a pas donné le rang : jamais « (rang ) »
            const who = stepEngineerText(s.status);
            return (
              <div key={i} className="eng-step small">
                <span className="accent">{s.label}</span>
                {s.rolls > 1 && <span className="muted"> × {s.rolls}</span>}
                {s.rollsBase != null && s.rolls !== s.rollsBase && <span className="warn"> (au lieu de {s.rollsBase})</span>}
                {' — '}
                <span className={who.tone}>
                  {who.text}
                  {i === 0 && s.status.best?.base && (
                    // Inara accepte aussi l'adresse du système dans sa recherche (comme EDMarketConnector)
                    <ExternalLinks kind="system" vars={{ system: s.status.best.base.systemAddress, systemAddress: s.status.best.base.systemAddress }} />
                  )}
                </span>
              </div>
            );
          })}
          {moduleRankLines(m, engineers).filter((l) => l.locked || l.rank == null || l.rank < 5).map((l) => (
            <div key={l.name} className="eng-step small warn">
              {l.text} <RuleBadge status={l.status} source={rules.source} why={l.why} />
              {l.range && (
                <> · en tout : {l.range.text}{l.range.reroll && <> (le bas suppose de refaire un grade fini <RuleBadge status={rules.reroll?.status || 'inconnue'} />)</>}</>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
