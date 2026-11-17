import { useEffect, useState } from 'react';
import GoalInput, { parseCredits } from './GoalInput.jsx';
import { api } from '../../../core/api.js';
import { routesApi } from '../api.js';
import { cr, dec1, dec2, int } from '../../../core/format.js';

/**
 * Réglages de la route. Seuls l'objectif et les heures par soirée sont à saisir ;
 * le reste est lu dans le journal, avec une saisie manuelle possible en secours.
 */
export default function RouteSettings({ view, onSaved }) {
  const { route, stats, overrides, laden } = view;
  const [goal, setGoal] = useState(String(route.goal));
  const [hours, setHours] = useState(String(view.hoursPerEvening));
  const [ov, setOv] = useState(overrides);
  const [msg, setMsg] = useState('');

  useEffect(() => setOv(overrides), [JSON.stringify(overrides)]);

  async function save(e) {
    e.preventDefault();
    const g = parseCredits(goal);
    if (!g) return setMsg('Objectif invalide.');
    try {
      await routesApi.update(route.id, { goal: g, overrides: ov });
      if (Number(hours) !== view.hoursPerEvening) await api('/settings', { method: 'PUT', body: { hoursPerEvening: hours } });
      setMsg('Enregistré.');
      setTimeout(() => setMsg(''), 2000);
      onSaved();
    } catch (err) {
      setMsg(err.message);
    }
  }

  const manual = (key, placeholder) => (
    <input
      className="input-small"
      value={ov[key] ?? ''}
      placeholder={placeholder}
      onChange={(e) => setOv({ ...ov, [key]: e.target.value })}
      inputMode="decimal"
      title="Saisie manuelle (laisser vide pour la valeur automatique)"
    />
  );

  return (
    <form className="panel" data-tuto="commerce-route-reglages" onSubmit={save}>
      <h2>Réglages</h2>
      <table className="table settings-table">
        <tbody>
          <tr>
            <th>Solde actuel</th>
            <td className="num">{cr(view.game.balance)}</td>
            <td className="muted">Status.json</td>
          </tr>
          <tr>
            <th>Objectif</th>
            <td colSpan={2}>
              <GoalInput value={goal} onChange={setGoal} />
            </td>
          </tr>
          <tr>
            <th>Soute</th>
            <td className="num">{int(stats.cargo)} t</td>
            <td>{manual('cargoCapacity', 'Loadout')}</td>
          </tr>
          <tr>
            <th>Minutes par boucle</th>
            <td className="num">{dec1(stats.avgMinutes)}</td>
            <td>{manual('minutesPerLoop', 'moyenne, pauses exclues')}</td>
          </tr>
          {stats.trends.map((t) => (
            <FragmentRows key={t.commodity} t={t} />
          ))}
          <tr>
            <th>Coûts par boucle</th>
            <td className="num">{cr(stats.costPerLoop)}</td>
            <td className="muted">carburant, réparations, salaires, munitions</td>
          </tr>
          <tr>
            <th>Portée chargée</th>
            <td className="num">{laden.range ? `${dec2(laden.range)} al` : '—'}</td>
            <td>{manual('ladenRange', 'Loadout')}</td>
          </tr>
          <tr>
            <th>Heures de jeu par soirée</th>
            <td colSpan={2}>
              <input className="input-small" type="number" min="0.5" max="24" step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} />
            </td>
          </tr>
        </tbody>
      </table>
      <div className="form-actions">
        <button className="btn btn-primary" type="submit">Enregistrer</button>
        {msg && <span className="muted">{msg}</span>}
      </div>
    </form>
  );
}

function FragmentRows({ t }) {
  const n = t.name.toLocaleLowerCase('fr-FR');
  return (
    <>
      <tr>
        <th>Vente {n}</th>
        <td className="num">{int(t.lastSell)} cr/t</td>
        <td className="muted">dernier MarketSell</td>
      </tr>
      <tr>
        <th>Achat {n}</th>
        <td className="num">{int(t.lastBuy)} cr/t</td>
        <td className="muted">dernier MarketBuy</td>
      </tr>
      <tr>
        <th>Érosion {n}</th>
        <td className="num">{dec2(t.erosion)} cr/t par boucle</td>
        <td className="muted">{t.measured ? `mesurée (achat +${dec2(t.buyRise)})` : 'pas encore assez de boucles'}</td>
      </tr>
    </>
  );
}
