// Fenêtre en jeu (/hud/colonisation-station) : « À acheter ici ». En mode Colonisation, quand tu ouvres le marché d'une
// station qui vend ce qu'il manque au chantier actif, le serveur l'ouvre : chaque marchandise à prendre ici (le moins
// entre ce qu'il faut, le stock et la place en soute), son prix, et le total. Elle suit tes achats, se ferme au
// départ de la station ; ✕ la ferme jusqu'à la prochaine station.

import { useEffect, useState } from 'react';
import { PanelOverlay } from '../../core/hud.jsx';
import { useEvent } from '../../core/stream.js';
import { cr, int } from '../../core/format.js';
import { colApi } from './api.js';

const CSS = `
.st { font-family: 'Segoe UI', system-ui, sans-serif; color: #dfe4ea; display: flex; flex-direction: column; gap: 4px; }
.st-head { font-size: 13px; color: #8a94a0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.st-head b { color: #f4f6f8; }
.st-row { display: flex; align-items: baseline; gap: 10px; padding: 4px 8px; border-left: 3px solid var(--accent); background: rgba(255,255,255,.035); }
.st-name { flex: 1; min-width: 0; font-size: 15px; font-weight: 600; color: #f4f6f8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.st-take { flex: none; font-size: 16px; font-weight: 700; color: var(--accent); font-variant-numeric: tabular-nums; }
.st-info { flex: none; font-size: 12px; color: #8a94a0; font-variant-numeric: tabular-nums; }
.st-info.is-short { color: #ffb347; }
.st-empty { font-size: 13px; color: #8a94a0; }
.st-btn { -webkit-app-region: no-drag; margin-left: auto; padding: 0 6px; font: inherit; color: #8a94a0; background: none; border: 0; cursor: pointer; }
.st-btn:hover { color: #f4f6f8; }
`;

export function StationOverlay() {
  const [v, setV] = useState(undefined);
  useEffect(() => {
    colApi.station().then(setV).catch(() => setV(null));
  }, []);
  useEvent('colonisation:station', setV);
  const items = v?.items || [];
  let content;
  if (v === undefined) content = <p className="st-empty">Chargement…</p>;
  else if (!v?.site || (!items.length && !v.station)) content = <p className="st-empty">Ouvre le marché d’une station : ce qu’il y faut acheter pour le chantier s’affiche ici.</p>;
  else if (!items.length) content = <p className="st-empty">Rien (ou plus rien) à acheter ici pour ce chantier ✓</p>;
  else {
    content = items.map((i) => (
      <div key={i.symbol} className="st-row">
        <span className="st-name">{i.name}</span>
        <span className={`st-info ${i.enough ? '' : 'is-short'}`} title={i.enough ? 'Assez de stock' : `Stock insuffisant : il en faut ${int(i.toBuy)} t`}>stock {int(i.stock)} · {cr(i.price)}</span>
        <span className="st-take">{int(i.take)} t</span>
      </div>
    ));
  }
  const footer = (
    <>
      <span>
        {items.length ? `${int(v.total.tonnes)} t · ${cr(v.total.cost)}` : v?.station || '—'}
        {v?.free != null && ` · ${int(v.free)} t de place`}
      </span>
      <button type="button" className="st-btn" onClick={() => colApi.stationClose().catch(() => {})} title="Fermer jusqu’à la prochaine station">✕</button>
    </>
  );
  return (
    <PanelOverlay title="🛒 À acheter ici" footer={footer} autoHeight>
      <style>{CSS}</style>
      <div className="st">
        {v?.site && v.station && <div className="st-head"><b>{v.station}</b> · pour {v.site.label}</div>}
        {content}
      </div>
    </PanelOverlay>
  );
}
