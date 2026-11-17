// Fenêtre en jeu (/hud/vigie) : les règles à revoir. Le serveur l'ouvre à une nouvelle alerte de la vigie (3e écart
// inexpliqué sur une même règle) ; « Compris » ferme l'alerte, ✕ la fenêtre jusqu'à la prochaine.

import { useEffect, useState } from 'react';
import { PanelOverlay } from '../../core/hud.jsx';
import { api } from '../../core/api.js';
import { useEvent } from '../../core/stream.js';
import { alerteTexte } from './vigieView.js';

const CSS = `
.vg { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: #dfe4ea; }
.vg-row { padding: 5px 8px; border-left: 3px solid var(--accent); background: rgba(255,255,255,.04); display: flex; gap: 8px; align-items: flex-start; }
.vg-row span { flex: 1; }
.vg-btn { font: inherit; font-size: 12px; cursor: pointer; }
.vg-empty { color: #8a94a0; margin: 0; }
`;

export default function VigieOverlay() {
  const [vue, setVue] = useState(null);
  useEffect(() => {
    api('/vigie').then(setVue).catch(() => {});
  }, []);
  useEvent('vigie', (v) => setVue((d) => ({ ...(d || {}), ...v })));
  const alertes = vue?.alertes || [];
  const compris = (id) => api(`/vigie/regles/${encodeURIComponent(id)}/compris`, { method: 'POST' }).catch(() => {});
  const footer = (
    <>
      <span>Détails : Règles du jeu → Vigie des règles</span>
      <button type="button" className="vg-btn" onClick={() => api('/vigie/fenetre/fermer', { method: 'POST' }).catch(() => {})} title="Fermer jusqu’à la prochaine alerte">✕</button>
    </>
  );
  return (
    <PanelOverlay title="⚠ Règle à revoir" footer={footer} autoHeight>
      <style>{CSS}</style>
      <div className="vg">
        {alertes.length ? alertes.map((a) => (
          <div key={a.regle} className="vg-row">
            <span>{alerteTexte(a)}</span>
            <button type="button" className="vg-btn" onClick={() => compris(a.regle)}>Compris</button>
          </div>
        )) : <p className="vg-empty">Aucune règle à revoir.</p>}
      </div>
    </PanelOverlay>
  );
}
