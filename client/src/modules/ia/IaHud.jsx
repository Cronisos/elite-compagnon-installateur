// Fenêtre en jeu de l'IA de bord (/hud/ia) : son état, ta dernière question et sa réponse, et une zone pour écrire.
// On y écrit en mode souris (Alt+Maj+K), comme dans les autres fenêtres en jeu, ou on lui parle : Alt+Maj+V (ou 🎤)
// pour commencer, encore une fois pour finir. La réponse s'affiche aussi dans la bulle du Compagnon (et à voix haute
// si la voix est allumée).

import { useEffect, useRef, useState } from 'react';
import { useEvent } from '../../core/stream.js';
import { enregistreur } from './micro.js';
import { useOverlayPage } from '../../core/hud.jsx';
import { useIa } from './useIa.js';
import { pourLaBulleCourte } from './iaVue.js';

const CSS = `
html, body { overflow: hidden !important; }
.iah { position: relative; width: 100vw; height: 100vh; box-sizing: border-box; padding: 6px 9px 7px; display: flex; flex-direction: column; gap: 5px;
  font-family: 'Segoe UI', system-ui, sans-serif; color: #dfe4ea; background: linear-gradient(90deg, rgba(7,9,12,.86), rgba(7,9,12,.68));
  border-left: 2px solid var(--accent); }
.iah.is-edit { outline: 1px dashed var(--accent); outline-offset: -1px; cursor: move; -webkit-app-region: drag; }
.iah-tete { display: flex; align-items: center; gap: 7px; font-family: 'Barlow Condensed', 'Segoe UI', sans-serif; }
.iah-tete b { color: var(--accent); font-size: 13px; letter-spacing: .16em; text-transform: uppercase; }
.iah-tete img { width: 20px; height: 20px; border-radius: 50%; object-fit: cover; }
.iah-etat { flex: 1; color: #8a94a0; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.iah-etat.is-pense { color: var(--accent); }
.iah-q { color: #8a94a0; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.iah-r { flex: 1; min-height: 0; font-size: 13px; line-height: 1.35; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; }
.iah-r.is-erreur { color: #ff8a8a; }
.iah form { display: flex; gap: 5px; -webkit-app-region: no-drag; }
.iah input { flex: 1; min-width: 0; padding: 4px 8px; border-radius: 4px; border: 1px solid rgba(var(--acc-rgb),.45); background: rgba(7,9,12,.85);
  color: #f4f6f8; font: inherit; font-size: 13px; outline: none; }
.iah input:focus { border-color: var(--accent); }
.iah form button { padding: 0 10px; border-radius: 4px; border: 1px solid var(--accent); background: rgba(var(--acc-rgb),.18); color: var(--accent);
  font-weight: 700; cursor: pointer; }
.iah form button:disabled { opacity: .45; cursor: default; }
.iah form button.is-micro { min-width: 34px; }
.iah form button.is-ecoute { background: #ff4d4d; border-color: #ff4d4d; color: #07090c; animation: iah-pouls 1s ease-in-out infinite; }
@keyframes iah-pouls { 50% { opacity: .55; } }
.iah-pin { position: absolute; top: 2px; right: 3px; -webkit-app-region: no-drag; }
`;

export default function IaHud() {
  const { editing, pin, hover } = useOverlayPage();
  const ia = useIa();
  const [texte, setTexte] = useState('');
  // Micro : 'repos' | 'ecoute' (enregistre) | 'transcrit' (Whisper travaille)
  const [micro, setMicro] = useState('repos');
  const rec = useRef(null);
  useEvent('ia:ecoute', ({ etat }) => setMicro((m) => (etat === 'transcrit' ? 'transcrit' : m === 'transcrit' ? 'repos' : m)));
  async function finirEcoute(wav) {
    rec.current = null;
    if (!wav) return setMicro('repos');
    setMicro('transcrit');
    await ia.ecouter(wav);
    return setMicro('repos');
  }
  async function basculerMicro() {
    if (rec.current?.actif()) return finirEcoute(rec.current.arreter());
    if (ia.occupe || micro !== 'repos') return undefined;
    const r = enregistreur({ onFin: finirEcoute });
    try {
      await r.demarrer();
      rec.current = r;
      setMicro('ecoute');
    } catch (e) {
      setMicro('repos');
      ia.signaler?.(`Micro inaccessible : ${e.message}`);
    }
    return undefined;
  }
  const bascule = useRef(basculerMicro);
  bascule.current = basculerMicro;
  useEffect(() => {
    const off = window.eliteOverlay?.onEcouteKey?.(() => bascule.current());
    return typeof off === 'function' ? off : undefined;
  }, []);
  const ecoutePrete = ia.etat?.ecoute?.pret && ia.etat?.reglages?.ecoute;
  const nom = ia.copilote?.nom || 'Alicia';
  const derniereQ = [...ia.messages].reverse().find((m) => m.role === 'user');
  const derniereR = [...ia.messages].reverse().find((m) => m.role === 'assistant' && (!derniereQ || m.id > derniereQ.id));
  const m = ia.etat?.modeles;
  const charge = m && [m.grand, m.moyen, m.leger].find((x) => x?.charge);
  const etat = micro === 'ecoute' ? '🎙 je t’écoute… (Alt+Maj+V pour finir)'
    : micro === 'transcrit' ? 'je transcris ce que tu as dit…'
    : ia.occupe ? `${nom} réfléchit…`
    : !ia.etat ? 'lecture…'
    : !ia.etat.reglages.actif ? 'coupée'
    : ia.etat.ollamaErreur ? 'Ollama ne répond pas'
    : charge ? `prête · ${charge.nom}` : 'prête · se charge à la 1re question (~15 s)';
  const envoyer = (e) => {
    e.preventDefault();
    const t = texte.trim();
    if (!t || ia.occupe) return;
    setTexte('');
    ia.envoyer(t);
  };
  return (
    <div className={`iah ${editing ? 'is-edit' : ''}`}>
      <style>{CSS}</style>
      <div className="iah-tete">
        {ia.copilote?.avatar && <img src={ia.copilote.avatar} alt="" />}
        <b>{nom}</b>
        <span className={`iah-etat ${ia.occupe ? 'is-pense' : ''}`}>{editing ? 'fais glisser, puis 📌' : etat}</span>
        {ia.etat?.reglages?.vision && <span title="Vue du jeu allumée : elle peut regarder la fenêtre du jeu (et rien d’autre)">👁</span>}
      </div>
      {derniereQ && <div className="iah-q">« {derniereQ.texte} »</div>}
      <div className={`iah-r ${derniereR?.erreur ? 'is-erreur' : ''}`}>
        {derniereR ? pourLaBulleCourte(derniereR.texte) : ia.occupe ? '…' : <span style={{ color: '#8a94a0' }}>{ecoutePrete ? 'Alt+Maj+V pour lui parler, ou Alt+Maj+K pour écrire.' : 'Alt+Maj+K pour la souris, puis écris ta question en bas.'}</span>}
      </div>
      {ia.erreur && <div className="iah-r is-erreur">{ia.erreur}</div>}
      <form onSubmit={envoyer}>
        <input value={texte} maxLength={1000} placeholder={`Ta question à ${nom}…`} {...hover} onChange={(e) => setTexte(e.target.value)} />
        <button type="submit" disabled={ia.occupe || !texte.trim()} {...hover}>➤</button>
        {ecoutePrete && (
          <button type="button" className={`is-micro ${micro === 'ecoute' ? 'is-ecoute' : ''}`} disabled={micro === 'transcrit' || (ia.occupe && micro !== 'ecoute')}
            title="Parler (Alt+Maj+V) : un appui pour commencer, un pour finir" {...hover} onClick={basculerMicro}>🎤</button>
        )}
      </form>
      <span className="iah-pin">{pin}</span>
    </div>
  );
}
