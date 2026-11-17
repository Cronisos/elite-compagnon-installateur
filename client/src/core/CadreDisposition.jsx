// Cadre d'une fenêtre en jeu pendant « Disposer les fenêtres » (Paramètres) : tout le tour de la fenêtre en pointillés,
// son nom au milieu, et la fenêtre se déplace en la glissant. Derrière le contenu de la page : une fenêtre vide
// d'habitude (FSD prêt, saut du porteur…) se voit et se place quand même. Hors de l'overlay, ou hors disposition : rien.

import { useEffect, useState } from 'react';

const CSS = `
.dispo-cadre { position: fixed; inset: 0; z-index: -1; -webkit-app-region: drag; cursor: move;
  border: 2px dashed var(--accent); background: rgba(7,9,12,.72); display: grid; place-items: center; }
.dispo-cadre span { font-family: 'Segoe UI', system-ui, sans-serif; font-size: 13px; font-weight: 700; letter-spacing: .08em;
  text-transform: uppercase; color: var(--accent); padding: 4px 10px; border: 1px solid rgba(var(--acc-rgb),.5);
  border-radius: 3px; background: rgba(7,9,12,.85); text-align: center; max-width: 90%; }
.dispo-cadre small { display: block; margin-top: 2px; font-size: 10px; font-weight: 400; letter-spacing: 0; text-transform: none; color: #8a94a0; }
`;

export default function CadreDisposition({ nom, children }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const o = window.eliteOverlay;
    o?.isDisposition?.().then((v) => setOn(Boolean(v))).catch(() => {});
    const off = o?.onDisposition?.(setOn);
    return typeof off === 'function' ? off : undefined;
  }, []);
  return (
    <>
      {on && (
        <div className="dispo-cadre" aria-label={`Fenêtre « ${nom} » à placer`}>
          <style>{CSS}</style>
          <span>{nom}<small>glisse pour la placer</small></span>
        </div>
      )}
      {children}
    </>
  );
}
