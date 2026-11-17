// Cadre de la jauge des boucliers (/hud/bouclier) : on le pose sur l'hologramme du vaisseau, en bas du cockpit, puis on
// note deux images : boucliers tombés (à quai, par exemple), puis pleins. L'overlay compte ensuite, toutes les
// secondes, les pixels allumés des anneaux (overlay/bouclier.js) : seul le pourcentage part à l'app. Le cadre ne sert
// qu'au réglage : une fois réglée, la jauge marche cadre fermé.

import { useEffect, useState } from 'react';
import { useOverlayPage } from '../../core/hud.jsx';

const CSS = `
html, body { overflow: hidden !important; }
.bcd { position: fixed; inset: 0; border: 1px dashed rgba(var(--acc-rgb),.6); font-family: 'Segoe UI', system-ui, sans-serif; color: #dfe4ea; }
.bcd.is-edit { border: 2px solid var(--accent); background: rgba(var(--acc-rgb),.07); cursor: move; -webkit-app-region: drag; }
.bcd-bar { position: absolute; top: 2px; left: 2px; right: 30px; display: flex; gap: 3px; flex-wrap: wrap; -webkit-app-region: no-drag; }
.bcd-bar button { padding: 2px 6px; font-size: 11px; border-radius: 3px; border: 1px solid var(--accent); background: #07090c; color: var(--accent); cursor: pointer; }
.bcd-bar button:hover { background: var(--accent); color: #07090c; }
.bcd-msg { position: absolute; left: 2px; right: 2px; bottom: 2px; padding: 2px 6px; border-radius: 3px; background: rgba(7,9,12,.85); font-size: 11px; line-height: 1.3; }
.bcd-msg.is-bad { color: #ff6b6b; }
.bcd-pct { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font: 700 20px 'Barlow Condensed', 'Segoe UI', sans-serif;
  color: var(--accent); text-shadow: 0 0 4px #000; pointer-events: none; }
.bcd-pin { position: absolute; top: 2px; right: 3px; -webkit-app-region: no-drag; }
`;

export default function BouclierCadre() {
  const { editing, pin, hover } = useOverlayPage();
  const [etat, setEtat] = useState(null); // { regle, tombes, pct }
  const [msg, setMsg] = useState(null); // { texte, mauvais }
  const o = window.eliteOverlay;

  useEffect(() => {
    o?.bouclierEtat?.().then(setEtat).catch(() => {});
    const off = o?.onBouclierPct?.((pct) => setEtat((e) => ({ ...e, pct })));
    return typeof off === 'function' ? off : undefined;
  }, []);

  async function noter(quoi) {
    setMsg({ texte: 'Je regarde…' });
    const r = await o?.bouclierNoter?.(quoi);
    if (!r || r.erreur) return setMsg({ texte: r?.erreur || 'Overlay injoignable.', mauvais: true });
    setEtat(await o.bouclierEtat());
    if (quoi === 'tombes') return setMsg({ texte: 'Noté. Maintenant, boucliers PLEINS (en vol), sans bouger le cadre : « Pleins ».' });
    if (quoi === 'pleins') return setMsg({ texte: `Réglé (${r.pixels} pixels d’anneau). Tu peux fermer le cadre : la jauge continue.` });
    return setMsg({ texte: 'Réglage oublié.' });
  }

  const aide = editing ? 'Fais glisser sur l’hologramme du vaisseau, puis 📌.'
    : !etat?.regle && !etat?.tombes ? '1. Boucliers tombés (à quai) : « Tombés ». Mode souris : Alt+Maj+K.'
      : etat?.tombes ? '2. Boucliers pleins : « Pleins ».' : 'Jauge réglée.';
  return (
    <div className={`bcd ${editing ? 'is-edit' : ''}`}>
      <style>{CSS}</style>
      {!editing && (
        <div className="bcd-bar">
          <button type="button" {...hover} onClick={() => noter('tombes')}>Tombés</button>
          <button type="button" {...hover} onClick={() => noter('pleins')} disabled={!etat?.tombes}>Pleins</button>
          {etat?.regle && <button type="button" {...hover} onClick={() => noter('oublier')}>Oublier</button>}
        </div>
      )}
      {etat?.regle && etat.pct != null && <div className="bcd-pct">{etat.pct} %</div>}
      <div className={`bcd-msg ${msg?.mauvais ? 'is-bad' : ''}`}>{msg?.texte || aide}</div>
      <span className="bcd-pin">{pin}</span>
    </div>
  );
}
