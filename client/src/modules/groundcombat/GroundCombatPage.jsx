// Page « Combat au sol » : la session à pied (kills, gains, mérites, morts), le contexte (guerres du système,
// installation, équipement), les kills par faction, les consommables utilisés et les derniers kills.

import { PauseButton, pauseLabel } from '../../core/hud.jsx';
import { OverlayToggle } from '../../core/overlay.jsx';
import { clock, compact, cr, int, time } from '../../core/format.js';
import Tile from '../../core/Tile.jsx';
import { useGroundCombat } from './useGroundCombat.jsx';

function Liste({ titre, lignes, unite = '', vide }) {
  return (
    <section className="panel">
      <h2>{titre}</h2>
      {lignes.length ? (
        <table className="table compact">
          <tbody>
            {lignes.map((l) => (
              <tr key={l.label}><td>{l.label}</td><td className="right num">{unite === 'cr' ? cr(l.n) : int(l.n)}</td></tr>
            ))}
          </tbody>
        </table>
      ) : <p className="small muted">{vide}</p>}
    </section>
  );
}

export default function GroundCombatPage() {
  const combat = useGroundCombat();
  const { data, seconds, creditsHour, meritsHour } = combat;

  async function reset() {
    if (window.confirm('Remettre la session de combat au sol à zéro ?')) await combat.reset();
  }

  if (!data) return <div className="page"><h1>Combat au sol</h1><p className="muted">Chargement…</p></div>;

  return (
    <div className="page">
      <header className="route-header">
        <div>
          <h1>Combat au sol</h1>
          <p className="muted">
            Session {data.startedAt ? `depuis ${time(data.startedAt)}, ${clock(seconds)}${combat.pause ? ` (${pauseLabel(combat.pause)})` : ''}` : 'non commencée'}
            {' · '}{data.aPied ? 'à pied' : 'pas à pied'}
            {data.largages > 0 && ` · ${int(data.largages)} largage${data.largages > 1 ? 's' : ''} Frontline Solutions`}
          </p>
        </div>
        <div className="form-actions">
          <OverlayToggle page="groundcombat" />
          <PauseButton session={combat} />
          <button className="btn" data-tuto="activites-sol-zero" onClick={reset}>Remettre à zéro</button>
        </div>
      </header>

      <div className="tiles tiles-4" data-tuto="activites-sol-tuiles">
        <Tile label="Kills" value={int(data.kills)} sub={data.killsHeure != null ? `${int(data.killsHeure)} par heure` : 'en zone de conflit au sol ou à prime'} tone={data.kills ? 'good' : undefined} />
        <Tile label="Gains" value={cr(data.gains)} sub={`obligations ${compact(data.bonds)} · primes ${compact(data.primes.total)}${creditsHour != null ? ` · ${compact(creditsHour)} cr/h` : ''}`} tone={data.gains ? 'good' : undefined} />
        <Tile label="Mérites" value={int(data.merites)} sub={meritsHour != null ? `${int(meritsHour)} par heure` : 'gagnés à pied'} tone={data.merites ? 'good' : undefined} />
        <Tile label="Morts" value={int(data.morts)} sub={data.crimes ? `${int(data.crimes)} crime${data.crimes > 1 ? 's' : ''} à pied` : 'aucun crime'} tone={data.morts ? 'bad' : undefined} />
      </div>

      <div className="two-cols">
        <section className="panel" data-tuto="activites-sol-lieu">
          <h2>Où tu es</h2>
          <p><b>{data.systeme || 'Système inconnu'}</b>{data.installation && <> · {data.installation.nom}{data.installation.faction && <span className="muted"> ({data.installation.faction})</span>}</>}</p>
          {data.guerres.length ? (
            <table className="table compact">
              <thead><tr><th>Conflit</th><th>Faction</th><th className="right">Jours gagnés</th><th>Enjeu</th></tr></thead>
              <tbody>
                {data.guerres.flatMap((g, i) => [g.a, g.b].map((f, j) => (
                  <tr key={`${i}-${j}`}>
                    <td>{j === 0 ? `${g.type}${g.enCours ? '' : ' (en attente)'}` : ''}</td>
                    <td>{f.nom}</td>
                    <td className="right num">{int(f.jours)}</td>
                    <td className="small muted">{f.enjeu || '—'}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          ) : <p className="small muted">Aucune guerre dans ce système : pas de zone de conflit au sol ici.</p>}
        </section>
        <section className="panel" data-tuto="activites-sol-equipement">
          <h2>Équipement</h2>
          {data.equipement ? (
            <>
              <p><b>{data.equipement.combinaison}</b>{data.equipement.config && <span className="muted"> · {data.equipement.config}</span>}</p>
              <p className="small">{data.equipement.armes.join(' · ') || 'aucune arme'}</p>
            </>
          ) : <p className="small muted">Combinaison inconnue : elle s’affiche à ta prochaine sortie à pied.</p>}
        </section>
      </div>

      <div className="two-cols" data-tuto="activites-sol-listes">
        <Liste titre="Kills par faction" lignes={data.parVictime} vide="Aucun kill à pied pour l’instant." />
        <Liste titre="Payé par" lignes={data.parPayeur} unite="cr" vide="Rien à encaisser pour l’instant." />
        <Liste titre="Consommables utilisés" lignes={data.consommables} vide="Aucun consommable utilisé." />
      </div>

      <h2 data-tuto="activites-sol-kills">Derniers kills</h2>
      {data.recent.length ? (
        <div className="table-wrap">
          <table className="table compact">
            <thead><tr><th>Heure</th><th>Type</th><th>Faction abattue</th><th>Payé par</th><th className="right">Gain</th></tr></thead>
            <tbody>
              {data.recent.map((k, i) => (
                <tr key={`${k.at}-${i}`}>
                  <td className="num">{time(k.at)}</td>
                  <td>{k.kind === 'prime' ? 'Prime' : 'Obligation de combat'}</td>
                  <td>{k.victime || '—'}</td>
                  <td>{k.payeur || '—'}</td>
                  <td className="right num">{k.reward ? cr(k.reward) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="muted">Aucun kill à pied pendant cette session. Les obligations de combat se gagnent en zone de conflit au sol (système en guerre, installations des deux factions) ; elles s’encaissent auprès de la faction qui paie.</p>}
    </div>
  );
}
