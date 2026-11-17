import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../core/api.js';
import { useEvent } from '../../core/stream.js';
import { compact, cr, date, dateTime, int, pct } from '../../core/format.js';
import { cleanText } from '../../core/text.js';
import { RebuyBlock } from './Rebuy.jsx';
import { CommunityGoalCashRows, CommunityGoalsBlock } from './CommunityGoals.jsx';
import NomSysteme from '../../core/NomSysteme.jsx';

const base = '/modules/glance';
const CURRENCY_LABELS = { credits: 'Crédits', merits: 'Mérites Powerplay', merc: 'Points de mercenaire' };

/** Données du Coup d'œil, mises à jour en temps réel. */
function useGlance() {
  const [data, setData] = useState(null);
  const [extra, setExtra] = useState({});
  const timer = useRef(null);
  const load = () => {
    api(`${base}/summary`).then(setData).catch(() => {});
    // Données d'autres modules, par leur API (sans importer leur code) ; absentes = ignorées
    api('/modules/engineering/inventory').then((inv) => setExtra((x) => ({ ...x, inventory: inv }))).catch(() => {});
    api('/modules/routes/routes').then((rs) => setExtra((x) => ({ ...x, route: rs.find((r) => r.active) || null }))).catch(() => {});
  };
  useEffect(() => {
    load();
    return () => clearTimeout(timer.current);
  }, []);
  const later = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(load, 500);
  };
  useEvent('glance:update', later);
  return { data, extra, reload: load };
}

function Block({ title, children, to }) {
  return (
    <section className="glance-block">
      <div className="glance-block-head">
        <h3>{title}</h3>
        {to && <Link to={to} className="small">voir →</Link>}
      </div>
      {children}
    </section>
  );
}

function Big({ value, sub, tone }) {
  return (
    <>
      <div className={`glance-big num ${tone || ''}`}>{value}</div>
      {sub && <div className="small muted">{sub}</div>}
    </>
  );
}

/** Panneau de synthèse : monnaies, à encaisser, soute, missions, ressources, objectifs, rappels. */
export default function GlancePanel({ onNavigate }) {
  const { data, extra, reload } = useGlance();
  const [merc, setMerc] = useState('');
  const [goal, setGoal] = useState({ label: '', currency: 'merits', target: '' });

  if (!data) return <p className="muted">Chargement…</p>;
  const t = data.toCash;
  const inv = extra.inventory;
  const byType = (type) => (inv?.items || []).filter((m) => m.type === type).reduce((a, m) => a + m.count, 0);

  async function saveMerc(e) {
    e.preventDefault();
    await api(`${base}/manual/merc`, { method: 'PUT', body: { value: merc } });
    setMerc('');
    reload();
  }
  async function addGoal(e) {
    e.preventDefault();
    await api(`${base}/goals`, { method: 'POST', body: goal });
    setGoal({ ...goal, label: '', target: '' });
    reload();
  }
  async function removeGoal(id) {
    await api(`${base}/goals/${id}`, { method: 'DELETE' });
    reload();
  }

  // Objectifs : ceux saisis, plus l'objectif de crédits de la route active
  const goals = [...data.goals];
  if (extra.route?.goal) {
    goals.unshift({
      id: 'route',
      label: `Route « ${extra.route.name} »`,
      currency: 'credits',
      currencyLabel: 'Crédits',
      target: extra.route.goal,
      owned: data.credits.balance,
      missing: data.credits.balance == null ? null : Math.max(0, extra.route.goal - data.credits.balance),
      auto: true,
    });
  }

  return (
    <div className="glance" onClick={(e) => e.target.closest('a') && onNavigate?.()}>
      {data.reminders.length > 0 && (
        <div className="glance-reminders">
          {data.reminders.map((r, i) => (
            <div key={i} className={`alert alert-${r.level === 'danger' ? 'danger' : 'warning'}`}>{r.text}</div>
          ))}
        </div>
      )}

      <div className="glance-grid">
        <Block title="Crédits">
          <Big value={compact(data.credits.balance)} sub={cr(data.credits.balance)} />
        </Block>

        <RebuyBlock rebuy={data.rebuy} />

        <Block title="Powerplay">
          {data.powerplay.power ? (
            <Big value={int(data.powerplay.merits)} sub={`mérites · ${data.powerplay.power} · rang ${int(data.powerplay.rank)}`} />
          ) : (
            <p className="muted small">Pas d'allégeance.</p>
          )}
        </Block>

        <Block title="Points de mercenaire">
          <Big value={data.merc.value != null ? int(data.merc.value) : '—'} sub={data.merc.updatedAt ? `saisis le ${date(data.merc.updatedAt)}` : 'non renseignés'} />
          <form className="glance-inline" onSubmit={saveMerc}>
            <input value={merc} onChange={(e) => setMerc(e.target.value)} placeholder="nouveau total" inputMode="numeric" aria-label="Nouveau total de points de mercenaire" />
            <button className="btn small" disabled={!merc}>OK</button>
          </form>
          <p className="tiny muted">Absents du journal du jeu : saisie manuelle.</p>
        </Block>

        <Block title="À encaisser">
          <dl className="kv glance-kv">
            <dt>Primes</dt>
            <dd className={`num ${t.bounties ? 'warn' : 'muted'}`}>{cr(t.bounties)}</dd>
            <dt>Obligations de combat</dt>
            <dd className={`num ${t.bonds ? 'warn' : 'muted'}`}>{cr(t.bonds)}</dd>
            <dt>Exploration</dt>
            <dd className={`num ${t.exploration.value ? 'warn' : 'muted'}`}>
              {t.exploration.bodies ? `≥ ${compact(t.exploration.value)} cr · ${t.exploration.systems} syst., ${t.exploration.bodies} corps` : 'rien'}
            </dd>
            <dt>Exobiologie</dt>
            <dd className={`num ${t.exobiology.count ? 'bad' : 'muted'}`}>
              {t.exobiology.count
                ? `${t.exobiology.count} échantillon${t.exobiology.count > 1 ? 's' : ''}${t.exobiology.value ? ` · ${compact(t.exobiology.value)} cr` : ''}${t.exobiology.unknownValues ? ` (+${t.exobiology.unknownValues} de valeur inconnue)` : ''}`
                : 'rien'}
            </dd>
            <CommunityGoalCashRows goals={data.communityGoals} />
          </dl>
          <p className="tiny muted">
            Exploration : estimation prudente (ceintures d'astéroïdes et bonus de système complet non comptés).
            {t.lostAt && ` Données perdues lors de la destruction du ${dateTime(t.lostAt)}.`}
          </p>
        </Block>

        <Block title="Soute et missions">
          <Big value={`${int(data.cargo.count)} t`} sub={data.cargo.items.slice(0, 3).map((c) => `${int(c.count)} t ${c.label.toLocaleLowerCase('fr-FR')}`).join(' · ') || 'soute vide'} />
          {data.cargo.powerplay.map((c) => (
            <div key={c.name} className="small warn">Powerplay à livrer : {int(c.count)} t {c.label}</div>
          ))}
          {data.missions.length ? (
            <ul className="glance-missions">
              {data.missions.map((m) => (
                <li key={m.id} className="small">
                  {cleanText(m.name)}
                  {m.destinationStation && <span className="muted"> → {m.destinationStation} (<NomSysteme nom={m.destinationSystem} />)</span>}
                  {m.expiresAt && <span className="muted"> · expire {dateTime(m.expiresAt)}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="small muted">Aucune mission active.</p>
          )}
        </Block>

        <CommunityGoalsBlock goals={data.communityGoals} />

        <Block title="Ressources" to={inv ? '/ingenierie/materiaux' : undefined}>
          {inv ? (
            <dl className="kv glance-kv">
              <dt>Matières premières</dt>
              <dd className="num">{int(byType('Raw'))}</dd>
              <dt>Manufacturés</dt>
              <dd className="num">{int(byType('Manufactured'))}</dd>
              <dt>Données</dt>
              <dd className="num">{int(byType('Encoded'))}</dd>
            </dl>
          ) : (
            <p className="small muted">Module Ingénierie indisponible.</p>
          )}
          {data.locker && (
            <p className="small muted">
              Odyssey : {int(data.locker.components)} composants, {int(data.locker.items)} objets, {int(data.locker.data)} données, {int(data.locker.consumables)} consommables
            </p>
          )}
        </Block>
      </div>

      <Block title="Ce qu'il me faut">
        {goals.length ? (
          <div className="glance-goals">
            {goals.map((g) => {
              const p = g.owned != null && g.target ? Math.min(1, g.owned / g.target) : 0;
              return (
                <div key={g.id} className="glance-goal">
                  <div className="glance-goal-head">
                    <span>
                      {g.label} <span className="muted small">({g.currencyLabel})</span>
                    </span>
                    {!g.auto && (
                      <button className="btn btn-ghost small" onClick={() => removeGoal(g.id)} aria-label="Supprimer">✕</button>
                    )}
                  </div>
                  <div className="progress small-progress">
                    <div className={`progress-bar ${p >= 1 ? 'bar-good' : ''}`} style={{ width: `${Math.round(p * 100)}%` }} />
                  </div>
                  <div className="small">
                    possédé <strong className="num">{compact(g.owned)}</strong> · il faut <strong className="num">{compact(g.target)}</strong> ·{' '}
                    {g.owned == null ? (
                      <span className="muted">valeur inconnue</span>
                    ) : g.missing > 0 ? (
                      <span className="bad">manque {compact(g.missing)}</span>
                    ) : (
                      <span className="good">atteint</span>
                    )}{' '}
                    <span className="muted">({pct(p)})</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="small muted">Aucun objectif.</p>
        )}
        <form className="glance-inline" onSubmit={addGoal}>
          <input placeholder="Objectif (ex. rang Powerplay 150)" value={goal.label} onChange={(e) => setGoal({ ...goal, label: e.target.value })} aria-label="Nom de l’objectif" />
          <select value={goal.currency} onChange={(e) => setGoal({ ...goal, currency: e.target.value })} aria-label="Ce que l’objectif compte">
            {Object.entries(CURRENCY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <input placeholder="Montant" value={goal.target} onChange={(e) => setGoal({ ...goal, target: e.target.value })} inputMode="numeric" aria-label="Montant visé" />
          <button className="btn small" disabled={!goal.target}>Ajouter</button>
        </form>
      </Block>
    </div>
  );
}
