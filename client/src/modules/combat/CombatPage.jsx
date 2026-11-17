import { useEffect, useState } from 'react';
import { PauseButton, pauseLabel } from '../../core/hud.jsx';
import { OverlayToggle } from '../../core/overlay.jsx';
import { useCombat } from './useCombat.jsx';
import { clock, compact, cr, int, time } from '../../core/format.js';
import Tile from '../../core/Tile.jsx';

/** Alerte du vaisseau : seuil réglable, coque, boucliers et modules au dernier relevé. */
function AlerteVaisseau({ v, setSeuil }) {
  const [texte, setTexte] = useState(String(v?.seuil ?? ''));
  const [erreur, setErreur] = useState(null);
  useEffect(() => setTexte(String(v?.seuil ?? '')), [v?.seuil]);
  if (!v) return null;
  const enregistrer = (n) => {
    setErreur(null);
    if (n === v.seuil) return;
    setSeuil(n).catch((e) => setErreur(e.message));
  };
  const valider = () => enregistrer(Number(texte));
  return (
    <>
      <h2>Alerte du vaisseau{v.nom ? ` · ${v.nom}` : ''}</h2>
      <div className="form-actions" data-tuto="activites-combat-alerte" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <span>Alerte sous</span>
        <button className="btn" onClick={() => enregistrer(Math.max(5, v.seuil - 5))}>−5</button>
        <input
          className="input"
          style={{ width: '4.5rem', textAlign: 'center' }}
          type="number"
          min={5}
          max={95}
          step={5}
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          onBlur={valider}
          onKeyDown={(e) => e.key === 'Enter' && valider()}
        />
        <span>%</span>
        <button className="btn" onClick={() => enregistrer(Math.min(95, v.seuil + 5))}>+5</button>
        {erreur && <span className="bad">{erreur}</span>}
      </div>
      <p className={v.alerte ? 'bad' : 'muted'}>
        Coque {v.coque == null ? 'inconnue' : <b>{v.coque} %</b>}
        {v.coqueAt && ` (${v.coqueDirect ? 'en direct' : 'relevé'}, ${time(v.coqueAt)})`}
        {v.boucliers === false && ' · boucliers tombés'}
        {v.boucliers === true && ' · boucliers en place'}
        {' · '}
        {v.sousSeuil.length ? `${v.sousSeuil.length} module${v.sousSeuil.length > 1 ? 's' : ''} sous ${v.seuil} %` : `aucun module sous ${v.seuil} %`}
        {v.releveAt && ` au relevé de ${time(v.releveAt)}`}
      </p>
      {v.modules.length > 0 && (
        <div className="table-wrap">
          <table className="table compact">
            <thead>
              <tr>
                <th>Module</th>
                <th className="right">État</th>
              </tr>
            </thead>
            <tbody>
              {v.modules.map((m, i) => (
                <tr key={`${m.nom}-${i}`} className={m.sante < v.seuil ? 'bad' : undefined}>
                  <td>{m.nom}</td>
                  <td className="right num">{m.sante} %</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="tiny muted">
        Le jeu écrit la coque en direct, mais par paliers d’environ 20 % (80, 60, 40, 20 %). L’état des modules, lui,
        n’est écrit qu’au lancement du jeu, à quai (réparation, équipement, changement de vaisseau), au retour à bord et
        quand l’AFMU répare : jamais en plein combat. Les modules affichés sont donc ceux du dernier relevé.
      </p>
    </>
  );
}

export default function CombatPage() {
  const combat = useCombat();
  const { data, seconds, creditsHour, meritsHour } = combat;

  async function reset() {
    if (window.confirm('Remettre la session de combat à zéro ?')) await combat.reset();
  }

  if (!data) return <div className="page"><h1>Combat</h1><p className="muted">Chargement…</p></div>;

  const details = [
    data.bounties.count && `${int(data.bounties.count)} prime${data.bounties.count > 1 ? 's' : ''}`,
    data.bonds.count && `${int(data.bonds.count)} obligation${data.bonds.count > 1 ? 's' : ''}`,
    data.capShip.count && `${int(data.capShip.count)} vaisseau${data.capShip.count > 1 ? 'x' : ''} capita${data.capShip.count > 1 ? 'ux' : 'l'}`,
    data.pvp && `${int(data.pvp)} joueur${data.pvp > 1 ? 's' : ''}`,
  ].filter(Boolean);

  return (
    <div className="page">
      <header className="route-header">
        <div>
          <h1>Combat</h1>
          <p className="muted" data-tuto="activites-combat-session">
            Session {data.startedAt ? `depuis ${time(data.startedAt)}, ${clock(seconds)}${combat.pause ? ` (${pauseLabel(combat.pause)})` : ''}` : 'non commencée'}
            {data.lastKillAt && ` · dernier kill à ${time(data.lastKillAt)}`}
            {data.deaths > 0 && <span className="bad"> · {data.deaths} destruction{data.deaths > 1 ? 's' : ''}</span>}
          </p>
        </div>
        <div className="form-actions">
          <OverlayToggle page="combat" />
          <PauseButton session={combat} />
          <button className="btn" data-tuto="activites-combat-zero" onClick={reset}>Remettre à zéro</button>
        </div>
      </header>

      <div className="tiles tiles-4" data-tuto="activites-combat-tuiles">
        <Tile label="Ennemis abattus" value={int(data.kills)} sub={details.join(' · ') || 'aucun pour l\'instant'} />
        <Tile
          label="Primes et obligations"
          value={compact(data.credits)}
          sub={`primes ${cr(data.bounties.total)} · obligations ${cr(data.bonds.total + data.capShip.total)}`}
          tone={data.credits ? 'good' : undefined}
        />
        <Tile
          label="Mérites en combat"
          value={int(data.merits.combat)}
          sub={`hors combat : ${int(data.merits.other)}`}
          tone={data.merits.combat ? 'good' : undefined}
        />
        <Tile
          label="Par heure"
          value={creditsHour != null ? `${compact(creditsHour)} cr` : '—'}
          sub={meritsHour != null ? `${int(meritsHour)} mérites en combat` : 'après 5 min de session'}
        />
      </div>

      <AlerteVaisseau v={data.vaisseau} setSeuil={combat.setSeuil} />

      <h2 data-tuto="activites-combat-kills">Derniers kills</h2>
      {data.recent.length ? (
        <div className="table-wrap">
          <table className="table compact">
            <thead>
              <tr>
                <th>Heure</th>
                <th>Type</th>
                <th>Vaisseau</th>
                <th>Pilote</th>
                <th>Faction</th>
                <th className="right">Gain</th>
                <th className="right">Mérites</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.map((k, i) => (
                <tr key={`${k.at}-${i}`}>
                  <td className="num">{time(k.at)}</td>
                  <td>{k.kind}</td>
                  <td>{k.ship || '—'}</td>
                  <td>{k.pilot || '—'}</td>
                  <td>{k.faction || '—'}</td>
                  <td className="right num">{k.reward ? cr(k.reward) : '—'}</td>
                  <td className="right num">{k.merits ? int(k.merits) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">Aucun kill pendant cette session.</p>
      )}

      <p className="tiny muted">
        Kills comptés sur les primes, obligations de combat, vaisseaux capitaux et joueurs. Un vaisseau abattu sans
        prime ni obligation, comme un vaisseau « propre » d'une puissance ennemie, n'apparaît pas dans le journal :
        il n'est pas compté, mais ses mérites le sont. Le journal ne précise pas d'où viennent les mérites : ils sont
        comptés en combat s'ils arrivent dans la minute qui suit un ciblage, une attaque ou un kill, et pas juste après
        une vente, une livraison ou une mission. Primes et obligations sont comptées au moment du kill : une destruction
        efface celles qui n'étaient pas encaissées.
      </p>
    </div>
  );
}
