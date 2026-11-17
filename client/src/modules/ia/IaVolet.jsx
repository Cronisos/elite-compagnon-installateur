// Bouton toujours visible en bas à droite de la fenêtre principale : il ouvre la discussion avec l'IA de bord dans un
// volet, sans quitter la page en cours. Absent de la page de l'IA, qui a sa discussion en grand.

import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import Discussion from './Discussion.jsx';
import { useIa } from './useIa.js';

const CSS = `
.ia-fab { position: fixed; right: 1.1rem; bottom: 1.1rem; z-index: 41; display: inline-flex; align-items: center; gap: .45rem;
  padding: .6rem .95rem; border-radius: 999px; border: 1px solid #3a2a18; background: rgba(18, 22, 27, .95);
  color: var(--text-strong); font: inherit; font-weight: 600; cursor: pointer; box-shadow: 0 10px 26px rgba(0, 0, 0, .5); }
.ia-fab:hover, .ia-fab.is-on { border-color: var(--accent); }
.ia-fab img { width: 22px; height: 22px; border-radius: 50%; object-fit: cover; }
.ia-fab .ia-point { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); animation: ia-pulse 1s ease-in-out infinite; }
@keyframes ia-pulse { 50% { opacity: .25; } }
.ia-volet { position: fixed; right: 1.1rem; bottom: 4.4rem; z-index: 46; width: min(430px, calc(100vw - 2.2rem));
  height: min(560px, calc(100vh - 7rem)); display: flex; flex-direction: column; gap: .5rem; padding: .8rem .9rem;
  background: var(--bg); border: 1px solid var(--border-strong); border-radius: var(--radius);
  box-shadow: 0 18px 40px rgba(0, 0, 0, .55); animation: ia-monte .16s ease-out; }
@keyframes ia-monte { from { transform: translateY(14px); opacity: 0; } }
.ia-volet-tete { display: flex; justify-content: space-between; align-items: center; gap: .5rem; }
.ia-volet-tete b { color: var(--accent); }
.ia-volet .ia-disc { flex: 1; }
`;

export default function IaVolet() {
  const { pathname } = useLocation();
  const [ouvert, setOuvert] = useState(false);
  const ia = useIa();
  useEffect(() => {
    if (!ouvert) return undefined;
    const echap = (e) => e.key === 'Escape' && setOuvert(false);
    window.addEventListener('keydown', echap);
    return () => window.removeEventListener('keydown', echap);
  }, [ouvert]);
  if (pathname === '/ia' || pathname.startsWith('/ia/')) return null;
  const nom = ia.copilote?.nom || 'Alicia';
  return (
    <>
      <style>{CSS}</style>
      {ouvert && (
        <div className="ia-volet" role="dialog" aria-label={`Discussion avec ${nom}`}>
          <div className="ia-volet-tete">
            <b>✶ {nom}</b>
            <span>
              <Link className="btn btn-ghost" to="/ia" onClick={() => setOuvert(false)} title={`Page de ${nom} : discussion en grand, réglages`}>⤢</Link>
              <button className="btn btn-ghost" onClick={() => setOuvert(false)} title="Fermer (Échap)">✕</button>
            </span>
          </div>
          <Discussion ia={ia} compact />
        </div>
      )}
      <button className={`ia-fab ${ouvert ? 'is-on' : ''}`} onClick={() => setOuvert(!ouvert)} title={`Parler à ${nom} (IA de bord)`}>
        {ia.copilote?.avatar ? <img src={ia.copilote.avatar} alt="" /> : '✶'}
        {nom}
        {ia.occupe && <span className="ia-point" />}
      </button>
    </>
  );
}
