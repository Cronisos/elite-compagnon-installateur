import { cr, dateTime, duration, int } from '../../../core/format.js';

const TAG_CLASS = { destroyed: 'pill-bad', shields: 'pill-warn', station: 'pill-info', pause: 'pill-muted' };

function cargoLabel(loop) {
  const main = loop.cargoDetail?.[0];
  if (!main) return `${int(loop.cargo)} t`;
  return `${int(main.count)} t ${main.name.toLocaleLowerCase('fr-FR')}`;
}

/** Journal des boucles : heure, cargaison, durée, gain net, mérites, étiquettes. */
export default function LoopTable({ loops, showRoute = false, empty = 'Aucune boucle enregistrée.' }) {
  if (!loops.length) return <p className="muted">{empty}</p>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Départ</th>
            {showRoute && <th>Route</th>}
            <th>Soute</th>
            <th className="right">Durée</th>
            <th className="right">Gain net</th>
            <th className="right">Mérites</th>
            <th>Événements</th>
          </tr>
        </thead>
        <tbody>
          {loops.map((l) => {
            const tags = [...(l.tags || [])];
            if (l.pause) tags.push({ type: 'pause', label: 'Hors moyenne' });
            return (
              <tr key={l.id} className={l.destroyed ? 'row-bad' : l.pause ? 'row-muted' : ''}>
                <td className="num nowrap">{dateTime(l.startAt)}</td>
                {showRoute && <td>{l.routeName}</td>}
                <td className="nowrap">{cargoLabel(l)}</td>
                <td className="right num" title={`Durée brute : ${duration(l.durationSec)}`}>{duration(l.activeSec > 0 ? l.activeSec : l.durationSec)}</td>
                <td className={`right num ${l.netGain < 0 ? 'bad' : ''}`} title={detail(l)}>{cr(l.netGain)}</td>
                <td className="right num">{int(l.merits)}</td>
                <td>
                  {tags.map((t, i) => (
                    <span key={i} className={`pill ${TAG_CLASS[t.type] || ''}`}>{t.label}</span>
                  ))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function detail(l) {
  return [
    `Ventes : ${cr(l.sales)}`,
    `Achats : ${cr(l.purchases)}`,
    `Carburant : ${cr(l.fuel)}`,
    `Réparations : ${cr(l.repairs)}`,
    `Salaires équipage : ${cr(l.wages)}`,
    `Munitions : ${cr(l.ammo)}`,
    `Rachat : ${cr(l.rebuy)}`,
  ].join('\n');
}
