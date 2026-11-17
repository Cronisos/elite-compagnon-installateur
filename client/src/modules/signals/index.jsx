import { PanelOverlay, useLiveSession } from '../../core/hud.jsx';
import { useNow } from '../../core/stream.js';
import { int, time } from '../../core/format.js';

// Styles propres à cette fenêtre, en plus de ceux du HUD.
const CSS = `
.sg { font-family: 'Segoe UI', system-ui, sans-serif; color: #dfe4ea; display: flex; flex-direction: column; gap: 6px; }
.sg-group h4 { margin: 0 0 3px; font-size: 10px; font-weight: 600; letter-spacing: .16em; text-transform: uppercase; color: var(--c); }
.sg-item { display: flex; align-items: baseline; gap: 6px; font-size: 12px; line-height: 1.35; padding: 1px 0 1px 8px; border-left: 2px solid var(--c); }
.sg-item b { color: #f4f6f8; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sg-count { color: var(--c); font-weight: 700; }
.sg-meta { margin-left: auto; font-size: 11px; color: #8a94a0; white-space: nowrap; }
.sg-threat { font-weight: 600; }
.sg-empty { color: #8a94a0; font-size: 13px; }
`;
const COLORS = { uss: '#6fd3ff', site: '#5fd38d', combat: '#ff6b6b', res: 'var(--accent)', megaship: '#d3a6ff', installation: '#ffd24a' };
const threatColor = (t) => (t >= 4 ? '#ff6b6b' : t >= 2 ? '#ffd24a' : '#5fd38d');

/**
 * Page de l'overlay (/hud/signals) : signaux utiles du système, au fur et à mesure qu'ils apparaissent.
 * Le serveur ouvre la fenêtre à l'arrivée dans un système en mode Sauvetage ou Matériaux.
 */
function SignalsOverlay() {
  const { data } = useLiveSession('/modules/signals', 'signals:update', { horloge: false }); // sa propre horloge (now)
  const now = useNow(1000);
  // Les sources non identifiées disparaissent après un moment : on les retire à leur expiration
  const groups = (data?.groups || [])
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.expires || Date.parse(i.expires) > now) }))
    .filter((g) => g.items.length);
  const count = groups.reduce((a, g) => a + g.items.reduce((b, i) => b + i.count, 0), 0);

  const footer = data?.system && (
    <>
      <span className="hud-tag">Signaux</span>
      <span><b>{int(count)}</b> · arrivée à {time(data.system.at)}</span>
    </>
  );

  return (
    <PanelOverlay title={`📡 ${data?.system?.name || 'Signaux'}`} footer={footer}>
      <style>{CSS}</style>
      <div className="sg">
        {groups.length === 0 && <p className="sg-empty">Aucun signal utile pour l'instant. Lance un scan (FSS ou balayage) pour en révéler.</p>}
        {groups.map((g) => (
          <div key={g.group} className="sg-group" style={{ '--c': COLORS[g.group] }}>
            <h4>{g.title}</h4>
            {g.items.map((i) => (
              <div key={`${i.label}-${i.threat}`} className="sg-item">
                {i.count > 1 && <span className="sg-count">{i.count}×</span>}
                <b>{i.label}</b>
                <span className="sg-meta">
                  {i.threat != null && <span className="sg-threat" style={{ color: threatColor(i.threat) }}>menace {i.threat}</span>}
                  {i.expires && ` · ${Math.max(1, Math.round((Date.parse(i.expires) - now) / 60000))} min`}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </PanelOverlay>
  );
}

export default {
  id: 'signals',
  title: 'Signaux',
  Hud: SignalsOverlay, // pas de page : seulement la fenêtre, ouverte d'elle-même
};
