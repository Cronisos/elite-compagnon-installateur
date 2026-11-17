// Ligne du bas du HUD Sauvetage : matériaux ramassés pendant la session, par grade (G1 → G5, mêmes couleurs que la
// page Matériaux). Au survol, la liste (nom et nombre) s'ouvre dans le cadre du HUD, de son haut jusqu'à la ligne : rien
// ne s'agrandit ni ne bouge (une fenêtre de l'overlay qui change de taille au survol clignote), elle défile si elle est longue.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { int } from '../../core/format.js';

export const COULEURS_GRADE = ['#b4bcc6', '#5fd38d', '#4fa8ff', '#c08cff', '#ffb02e'];
const couleur = (g) => COULEURS_GRADE[g - 1] || '#8a94a0';

const CSS = `
.rg-ligne { display: flex; align-items: center; gap: 6px; min-height: 22px; padding-top: 3px; border-top: 1px solid rgba(var(--acc-rgb),.18);
  font-size: 12px; color: #8a94a0; cursor: default; }
.rg-titre { font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: var(--accent); margin-right: 2px; white-space: nowrap; }
.rg-g { display: inline-flex; align-items: baseline; gap: 4px; padding: 1px 7px 1px 6px; border-left: 2px solid var(--g);
  background: linear-gradient(90deg, color-mix(in srgb, var(--g) 22%, transparent), transparent);
  clip-path: polygon(0 0, calc(100% - 5px) 0, 100% 5px, 100% 100%, 0 100%); }
.rg-g b { color: var(--g); font-size: 11px; letter-spacing: .06em; }
.rg-g span { color: #f4f6f8; font-weight: 700; font-variant-numeric: tabular-nums; }
.rg-g.is-vide { opacity: .4; }
.rg-total { margin-left: auto; white-space: nowrap; }
.rg-pop { position: fixed; z-index: 10; box-sizing: border-box; overflow: auto; padding: 6px 10px 8px; font: 12px 'Segoe UI', system-ui, sans-serif;
  color: #dfe4ea; background: linear-gradient(180deg, rgba(7,9,12,.96), rgba(7,9,12,.9)); border: 1px solid rgba(var(--acc-rgb),.45);
  clip-path: polygon(0 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%); }
.rg-pop h4 { margin: 0 0 4px; font-size: 10px; letter-spacing: .16em; text-transform: uppercase; color: var(--accent); font-weight: 600; }
.rg-pop ul { list-style: none; margin: 0; padding: 0; columns: 3; column-gap: 16px; }
.rg-pop li { display: flex; align-items: center; gap: 6px; padding: 1px 0; break-inside: avoid; }
.rg-pop li i { font-style: normal; font-size: 10px; font-weight: 700; color: var(--g); min-width: 18px; }
.rg-pop li span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rg-pop li b { color: #f4f6f8; font-variant-numeric: tabular-nums; }
.rg-pop .rg-rien { color: #8a94a0; }
`;

export default function MateriauxGrades({ materiaux }) {
  const [ouvert, setOuvert] = useState(false);
  const [place, setPlace] = useState(null);
  const ligne = useRef(null);
  const fermeture = useRef(null);

  const ouvrir = () => {
    clearTimeout(fermeture.current);
    if (ouvert) return;
    const r = ligne.current?.getBoundingClientRect();
    // Du haut du cadre jusqu'au-dessus de la ligne, qui reste visible
    if (r) setPlace({ top: 4, left: Math.round(r.left), width: Math.round(r.width), height: Math.max(60, Math.round(r.top - 6)) });
    setOuvert(true);
  };
  const fermerBientot = () => {
    clearTimeout(fermeture.current);
    fermeture.current = setTimeout(() => setOuvert(false), 180);
  };
  useEffect(() => () => clearTimeout(fermeture.current), []);

  if (!materiaux) return null;
  const { byGrade = [0, 0, 0, 0, 0], items = [], total = 0 } = materiaux;
  return (
    <>
      <style>{CSS}</style>
      <div ref={ligne} className="rg-ligne" onMouseEnter={ouvrir} onMouseLeave={fermerBientot} aria-label={`Matériaux ramassés : ${int(total)}`}>
        <span className="rg-titre">Matériaux</span>
        {byGrade.map((n, i) => (
          <span key={i} className={`rg-g${n ? '' : ' is-vide'}`} style={{ '--g': couleur(i + 1) }}>
            <b>G{i + 1}</b>
            <span>{int(n)}</span>
          </span>
        ))}
        <span className="rg-total">{int(total)} au total</span>
      </div>
      {ouvert && place && createPortal(
        <div className="rg-pop" style={place} onMouseEnter={ouvrir} onMouseLeave={fermerBientot}>
          <h4>Matériaux ramassés pendant la session</h4>
          {items.length ? (
            <ul>
              {items.map((m) => (
                <li key={`${m.label}-${m.grade}`} style={{ '--g': couleur(m.grade) }}>
                  <i>{m.grade ? `G${m.grade}` : '—'}</i>
                  <span>{m.label}</span>
                  <b>{int(m.count)}</b>
                </li>
              ))}
            </ul>
          ) : <p className="rg-rien">Aucun matériau ramassé pour l’instant.</p>}
        </div>,
        document.body,
      )}
    </>
  );
}
