import { useEffect, useRef, useState } from 'react';
import { useOverlayPage } from '../../core/hud.jsx';
import { wpApi } from './api.js';

// Cadre transparent de l'overlay : on le place sur le panneau du jeu qui montre le contenu d'un EEP ciblé.
// Le bouton 📷 (ou Alt+Maj+P, même en jeu) photographie ce qu'il y a dessous : le cadre se cache le temps de la
// photo, l'image part à l'application qui en lit le texte.
const CSS = `
.cap { position: fixed; inset: 0; border: 1px dashed rgba(var(--acc-rgb),.55); font-family: 'Segoe UI', system-ui, sans-serif; }
.cap.cap-editing { border: 2px solid var(--accent); background: rgba(var(--acc-rgb),.07); cursor: move; -webkit-app-region: drag; }
.cap-bar { position: absolute; top: 2px; left: 2px; display: flex; gap: 3px; -webkit-app-region: no-drag; }
/* Boutons pleins et opaques : bien visibles sur n'importe quel fond du jeu */
.cap-bar .hud-pin { width: 26px; height: 24px; font-size: 14px; opacity: 1; color: var(--accent); background: #07090c; border: 1px solid var(--accent); }
.cap-bar .hud-pin:hover { color: #07090c; background: var(--accent); }
.cap-msg { position: absolute; left: 2px; bottom: 2px; max-width: calc(100% - 4px); padding: 2px 7px; border-radius: 3px;
  background: rgba(7,9,12,.85); color: #dfe4ea; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cap-msg.is-ok { color: #5fd38d; }
.cap-msg.is-bad { color: #ff6b6b; }
`;

export default function CaptureFrame() {
  const { editing, pin, overlay, hover } = useOverlayPage();
  const [msg, setMsg] = useState(null); // { text, tone }
  const [step, setStep] = useState(10);
  const timer = useRef(null);

  const say = (text, tone = '', ms = 6000) => {
    clearTimeout(timer.current);
    setMsg({ text, tone });
    if (ms) timer.current = setTimeout(() => setMsg(null), ms);
  };

  /** Envoie la photo à l'application, qui en lit le texte. */
  async function send(shot) {
    if (!shot) return say('Photo impossible', 'is-bad');
    say('Lecture…', '', 0);
    try {
      const c = await wpApi.capture(shot);
      if (c.error) return say(c.error, 'is-bad', 10000);
      const ores = (c.ores || []).join(', ');
      if (!ores) say(c.lines.length ? 'Aucun minerai reconnu' : 'Aucun texte lu', 'is-bad');
      else if (c.applied) say(`✓ EEP ${c.site} : ${ores}`, 'is-ok', 8000);
      else say(`${ores} · aucun EEP ciblé : rien de rangé`, 'is-bad', 10000);
    } catch (e) {
      say(e.message, 'is-bad', 10000);
    }
  }

  useEffect(() => {
    const off = overlay?.onCaptured?.(send); // photo prise au raccourci Alt+Maj+P
    overlay?.step?.().then((s) => s && setStep(s));
    return typeof off === 'function' ? off : undefined;
  }, []);

  const grow = (dw, dh) => overlay?.grow(dw, dh);
  return (
    <div className={`cap ${editing ? 'cap-editing' : ''}`}>
      <style>{CSS}</style>
      <div className="cap-bar">
        <button className="hud-pin" title="Photographier le cadre (Alt+Maj+P)" {...hover} onClick={async () => send(await overlay?.capture?.())}>📷</button>
        {pin}
        {editing && (
          <>
            <button className="hud-pin" title="Moins large" onClick={() => grow(-step, 0)}>◂</button>
            <button className="hud-pin" title="Plus large" onClick={() => grow(step, 0)}>▸</button>
            <button className="hud-pin" title="Moins haut" onClick={() => grow(0, -step)}>▴</button>
            <button className="hud-pin" title="Plus haut" onClick={() => grow(0, step)}>▾</button>
          </>
        )}
      </div>
      {editing && !msg && <div className="cap-msg">Place le cadre sur le panneau de l’EEP ciblé, puis 📌</div>}
      {msg && <div className={`cap-msg ${msg.tone}`}>{msg.text}</div>}
    </div>
  );
}
