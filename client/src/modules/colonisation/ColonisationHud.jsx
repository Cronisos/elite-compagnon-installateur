import { HudOverlay, PanelOverlay } from '../../core/hud.jsx';
import { int, pct } from '../../core/format.js';
import { useActiveSite } from './useColonisation.jsx';
import { hudCells, hudLine, REASONS, toBuyList } from './view.js';

/**
 * HUD du mode Colonisation (/hud/colonisation) : chantier actif (à quai, épinglé, le premier en cours du projet de
 * l'escadron s'il est suivi, ou le dernier en cours), avancement, reste, à acheter (reste − soute) et trajets restants.
 * Pas de chrono : rien à chronométrer.
 */
export function ColonisationHud() {
  const active = useActiveSite();
  if (active === undefined) return <HudOverlay props={null} />;
  return (
    <HudOverlay props={{
      title: '🏗 Colonisation',
      seconds: null,
      dense: true,
      columns: 'auto repeat(4, 1fr)',
      tag: active ? REASONS[active.reason] || 'Chantier' : 'Chantier',
      cells: hudCells(active),
      last: <span><b>{active?.site.label || ''}</b>{active ? ' · ' : ''}{hudLine(active)}</span>,
    }} />
  );
}

const CSS = `
.cl { font-family: 'Segoe UI', system-ui, sans-serif; color: #dfe4ea; display: flex; flex-direction: column; gap: 4px; }
.cl-head { display: flex; align-items: baseline; gap: 8px; font-size: 13px; color: #8a94a0; margin-bottom: 2px; }
.cl-head b { color: #f4f6f8; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.cl-pct { margin-left: auto; color: #ffd24a; font-weight: 700; font-variant-numeric: tabular-nums; }
.cl-row { display: flex; align-items: baseline; gap: 10px; padding: 4px 8px; border-left: 3px solid var(--accent); background: rgba(255,255,255,.035); }
.cl-row.is-hold { border-left-color: #5fd38d; }
.cl-name { flex: 1; min-width: 0; font-size: 15px; font-weight: 600; color: #f4f6f8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cl-qty { flex: none; font-size: 16px; font-weight: 700; color: var(--accent); font-variant-numeric: tabular-nums; }
.cl-row.is-hold .cl-qty { color: #5fd38d; font-size: 13px; }
.cl-hold { flex: none; font-size: 12px; color: #8a94a0; font-variant-numeric: tabular-nums; }
.cl-empty { font-size: 13px; color: #8a94a0; }
`;

/**
 * Fenêtre « liste de courses » (/hud/colonisation-list), ouverte avec le mode : ce qu'il reste à acheter pour le
 * chantier actif, soute déduite ; ce qui est déjà tout en soute est marqué « en soute ».
 */
export function ShoppingListOverlay() {
  const active = useActiveSite();
  const site = active?.site;
  const plan = site?.plan;
  let content;
  if (active === undefined) content = <p className="cl-empty">Chargement…</p>;
  else if (!site) content = <p className="cl-empty">Aucun chantier suivi : amarre-toi à un dépôt de construction.</p>;
  else if (!plan.known) content = <p className="cl-empty">Besoins pas encore lus : ouvre le contact de colonisation du chantier.</p>;
  else {
    const buy = toBuyList(plan.items, 12);
    const held = plan.items.filter((i) => i.remaining > 0 && i.toBuy === 0);
    content = (
      <>
        {buy.map((i) => (
          <div key={i.symbol} className="cl-row">
            <span className="cl-name">{i.name}</span>
            {i.inHold > 0 && <span className="cl-hold">{int(i.inHold)} en soute</span>}
            {i.onCarrier > 0 && <span className="cl-hold">{int(i.onCarrier)} sur le porteur</span>}
            <span className="cl-qty">{int(i.toBuy)} t</span>
          </div>
        ))}
        {held.map((i) => (
          <div key={i.symbol} className="cl-row is-hold">
            <span className="cl-name">{i.name}</span>
            <span className="cl-qty">✓ {int(i.remaining)} t {i.onCarrier ? (i.inHold ? 'en soute et sur le porteur' : 'sur le porteur') : 'en soute'}</span>
          </div>
        ))}
        {!buy.length && !held.length && <p className="cl-empty">{site.complete ? 'Chantier terminé.' : 'Plus rien à livrer.'}</p>}
        {plan.items.filter((i) => i.toBuy > 0).length > buy.length && <p className="cl-empty">… et {plan.items.filter((i) => i.toBuy > 0).length - buy.length} autres</p>}
      </>
    );
  }
  const footer = plan?.known ? (
    <>
      <span className="hud-tag">{REASONS[active.reason] || 'Chantier'}</span>
      <span>{plan.trips == null ? 'trajets ?' : `${int(plan.trips)} trajet${plan.trips > 1 ? 's' : ''}`}{plan.capacity ? ` · soute ${int(plan.capacity)} t` : ''}</span>
    </>
  ) : null;
  return (
    <PanelOverlay title="🛒 Liste de courses" footer={footer} autoHeight>
      <style>{CSS}</style>
      <div className="cl">
        {site && (
          <div className="cl-head">
            <b>{site.label}</b>
            <span className="cl-pct">{pct(site.progress)}</span>
          </div>
        )}
        {content}
      </div>
    </PanelOverlay>
  );
}
