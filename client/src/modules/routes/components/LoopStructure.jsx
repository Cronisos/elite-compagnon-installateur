import { dec1, int } from '../../../core/format.js';
import ExternalLinks from '../../../core/ExternalLinks.jsx';
import NomSysteme from '../../../core/NomSysteme.jsx';

function Goods({ verb, list }) {
  if (!list?.length) return null;
  return (
    <div className="goods">
      <span className="muted">{verb}</span>{' '}
      {list.map((g, i) => (
        <span key={g.commodity} className="good-item">
          {i > 0 && ', '}
          {g.name} <span className="muted num">{int(g.count)} t à {int(g.price)} cr/t</span>
        </span>
      ))}
    </div>
  );
}

function Leg({ leg, label }) {
  return (
    <div className="step step-leg">
      <div className="step-title">
        {label} <span className="muted">· {leg.jumps.length} saut{leg.jumps.length > 1 ? 's' : ''} · {dec1(leg.distance)} al</span>
      </div>
      <div className="jumps">
        {leg.jumps.map((j, i) => (
          <span key={i} className="jump">
            <NomSysteme nom={j.system} /> <span className="muted num">{dec1(j.dist)} al</span>
          </span>
        ))}
        {!leg.jumps.length && <span className="muted">Même système</span>}
      </div>
    </div>
  );
}

/** Section « La boucle » : stations, sauts, marchandises à chaque étape. */
export default function LoopStructure({ structure, laden }) {
  const s = structure;
  return (
    <div className="loop-structure">
      <div className="step step-station">
        <div className="step-title">
          <span className="step-num">1</span> {s.startStation} <span className="muted">(<NomSysteme nom={s.startSystem} />)</span>
          <ExternalLinks kind="station" vars={{ system: s.startSystem, station: s.startStation, marketId: s.startMarketId }} />
        </div>
        <Goods verb="Achat :" list={s.start.buys} />
      </div>
      {s.stops.map((stop, k) => (
        <div key={k} className="step-group">
          <Leg leg={s.legs[k]} label={k === 0 ? 'Aller' : `Étape ${k + 1}`} />
          <div className="step step-station">
            <div className="step-title">
              <span className="step-num">{k + 2}</span> {stop.station} <span className="muted">(<NomSysteme nom={stop.system} />)</span>
              <ExternalLinks kind="station" vars={{ system: stop.system, station: stop.station, marketId: stop.marketId }} />
            </div>
            <Goods verb="Vente :" list={stop.sells} />
            <Goods verb="Achat :" list={stop.buys} />
          </div>
        </div>
      ))}
      <Leg leg={s.legs[s.legs.length - 1]} label="Retour" />
      <div className="step step-station">
        <div className="step-title">
          <span className="step-num">↺</span> {s.startStation}
        </div>
        <Goods verb="Vente :" list={s.arrival.sells} />
      </div>
      {laden && (
        <p className="laden">
          Plus long saut : <strong className="num">{dec1(s.longestJump)} al</strong>
          {laden.range ? (
            <>
              {' '}· portée chargée{laden.manual ? ' (saisie)' : ''} : <strong className="num">{dec1(laden.range)} al</strong>{' '}
              <span className={laden.margin < 1 ? 'bad' : 'good'}>
                (marge {dec1(laden.margin)} al)
              </span>
            </>
          ) : (
            <span className="muted"> · portée chargée inconnue (Loadout absent) — saisis-la dans les réglages</span>
          )}
        </p>
      )}
    </div>
  );
}
