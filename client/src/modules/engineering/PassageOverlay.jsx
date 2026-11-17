// Fenêtre en jeu (/hud/engineering-passage) : alertes de passage. En arrivant dans un système, ce qui y sert à tes plans
// du tableau de bord : un ingénieur qui peut faire un grade encore à faire, un échangeur utile pour ce qui manque. Le
// serveur l'ouvre (services/passage.js) et la ferme après 2 min ou au saut suivant ; ✕ la ferme tout de suite.

import { useEffect, useState } from 'react';
import { PanelOverlay } from '../../core/hud.jsx';
import { useEvent } from '../../core/stream.js';
import { engApi } from './api.js';

const CSS = `
.ps-alerte { padding: 4px 0 6px; font: 13px 'Segoe UI', system-ui, sans-serif; color: #dfe4ea; }
.ps-alerte + .ps-alerte { border-top: 1px solid rgba(var(--acc-rgb),.2); }
.ps-titre { display: flex; gap: 6px; align-items: baseline; font-weight: 700; color: var(--accent); letter-spacing: .03em; }
.ps-alerte.is-echangeur .ps-titre { color: #6fd3ff; }
.ps-lignes { margin: 2px 0 0 18px; padding: 0; list-style: none; }
.ps-lignes li { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ps-lignes li::before { content: '▸ '; color: #8a94a0; }
.ps-btn { -webkit-app-region: no-drag; margin-left: auto; padding: 0 6px; font: inherit; color: #8a94a0; background: none; border: 0; cursor: pointer; }
.ps-btn:hover { color: #f4f6f8; }
`;

export default function PassageOverlay() {
  const [etat, setEtat] = useState(null);
  useEffect(() => {
    engApi.passage().then(setEtat).catch(() => {});
  }, []);
  useEvent('engineering:passage', setEtat);
  const alertes = etat?.alertes || [];
  const footer = (
    <>
      <span>Passage · {etat?.system || '—'}</span>
      <button type="button" className="ps-btn" onClick={() => engApi.passageClose().catch(() => {})} title="Fermer jusqu’au prochain système">✕</button>
    </>
  );
  return (
    <PanelOverlay title="Utile ici pour tes plans" footer={footer} autoHeight>
      <style>{CSS}</style>
      {!alertes.length && <p className="ps-alerte">Rien pour tes plans dans ce système.</p>}
      {alertes.map((a, i) => (
        <div key={i} className={`ps-alerte is-${a.genre}`}>
          <div className="ps-titre"><span aria-hidden="true">{a.genre === 'ingenieur' ? '⚙' : '⇄'}</span>{a.titre}</div>
          <ul className="ps-lignes">{a.lignes.map((l, k) => <li key={k} title={l}>{l}</li>)}</ul>
        </div>
      ))}
    </PanelOverlay>
  );
}
