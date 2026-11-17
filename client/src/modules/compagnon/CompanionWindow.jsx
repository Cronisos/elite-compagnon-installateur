import { useEffect } from 'react';
import { useOverlayPage } from '../../core/hud.jsx';
import { direAVoixHaute, jouerSon } from '../../core/voix.js';
import CompanionView from './CompanionView.jsx';
import { useCompanion } from './useCompanion.js';

const STEP = 40;

// Boutons de la fenêtre, en haut du côté de la bulle ; cadre pointillé en mode déplacement, posé au-dessus de
// l'avatar et de la bulle pour que toute la fenêtre se fasse glisser
const CSS = `
.cpw-tools { position: fixed; top: 4px; right: 4px; z-index: 2; display: flex; gap: 4px; -webkit-app-region: no-drag; }
.cpw-tools.is-left { right: auto; left: 4px; }
.cpw-tools .hud-pin { width: 24px; height: 22px; font-size: 12px; }
.cpw-edit { position: fixed; inset: 0; z-index: 1; border: 1px dashed var(--accent); background: rgba(var(--acc-rgb),.06); cursor: move; -webkit-app-region: drag; }
.cpw-hint { position: fixed; left: 50%; top: 4px; transform: translateX(-50%); z-index: 1; padding: 1px 6px; border-radius: 3px;
  background: rgba(7,9,12,.85); color: var(--accent); font: 11px 'Segoe UI', system-ui, sans-serif; white-space: nowrap; pointer-events: none; }
`;

/**
 * Page de l'overlay (/hud/compagnon) : le compagnon par-dessus le jeu, dans une fenêtre libre (déplaçable avec ✥,
 * redimensionnable en mode déplacement). Les clics passent au jeu, sauf sur le bouton.
 */
export default function CompanionWindow() {
  const { editing, pin, overlay } = useOverlayPage();
  const { state, line, pack, mood, name } = useCompanion();
  // Phrase à dire (réponse de l'IA de bord) : une fois, quand elle arrive
  useEffect(() => {
    if (!line?.parler || !line.visible) return;
    // Voix naturelle : son déjà prêt ; sinon (ou s'il ne se joue pas), la voix de Windows
    if (!(line.audio && jouerSon(line.audio, { volume: line.volume }))) direAVoixHaute(line.text, line.voix, { vitesse: line.vitesse, hauteur: line.hauteur, volume: line.volume });
  }, [line?.id]);
  if (!state?.settings?.enabled) return null;
  const { side } = state.settings;
  const grow = (dw, dh) => overlay?.grow(dw, dh);

  return (
    <>
      <style>{CSS}</style>
      {editing && <div className="cpw-edit" />}
      <CompanionView
        pack={pack}
        mood={mood}
        line={line}
        name={name}
        side={side}
        variant="window"
        placeholder={editing ? `${name} parlera ici.` : null}
      />
      {editing && <span className="cpw-hint">fais glisser, puis 📌 pour fixer</span>}
      <div className={`cpw-tools ${side === 'right' ? 'is-left' : ''}`}>
        {editing && (
          <>
            <button className="hud-pin" title="Moins large" onClick={() => grow(-STEP, 0)}>◂</button>
            <button className="hud-pin" title="Plus large" onClick={() => grow(STEP, 0)}>▸</button>
            <button className="hud-pin" title="Moins haute" onClick={() => grow(0, -STEP)}>▴</button>
            <button className="hud-pin" title="Plus haute" onClick={() => grow(0, STEP)}>▾</button>
          </>
        )}
        {pin}
      </div>
    </>
  );
}
