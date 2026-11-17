import { useEffect, useRef, useState } from 'react';
import { distinctImages } from './bubble.js';

// Avatar et bulle du compagnon, communs à la fenêtre en jeu, au petit compagnon de l'app et à l'aperçu des réglages.
// Animation d'attente en CSS : respiration et léger balancement ; clignement si le pack fournit l'image ; petit saut
// quand il parle ; changement d'humeur en fondu (toutes les images du pack restent chargées, superposées).
const CSS = `
.cp { --cp-accent: var(--accent); display: flex; align-items: flex-end; gap: 10px; box-sizing: border-box;
  font-family: 'Segoe UI', system-ui, sans-serif; color: #f4f6f8; }
.cp *, .cp *::before { box-sizing: border-box; }
.cp.cp-right { flex-direction: row-reverse; }
.cp-figure { position: relative; flex: none; aspect-ratio: 1; padding: 0; border: 0; background: none; }
.cp-figure.cp-hop { animation: cp-hop .6s ease-out; }
button.cp-figure { cursor: pointer; }
.cp-sway { position: absolute; inset: 0; transform-origin: 50% 92%; animation: cp-sway 7s ease-in-out infinite; }
.cp-breathe { position: absolute; inset: 0; transform-origin: 50% 100%; animation: cp-breathe 4.2s ease-in-out infinite; }
.cp-mood-endormi .cp-breathe { animation-duration: 6.5s; }
.cp-mood-endormi .cp-sway { animation-duration: 12s; }
.cp-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; opacity: 0;
  transition: opacity .45s ease; user-select: none; pointer-events: none; -webkit-user-drag: none; }
.cp-img.is-on { opacity: 1; }
.cp-blink { transition: none; }
.cp-blink.is-blinking { animation: cp-blink 5.3s infinite; }
.cp-empty { position: absolute; inset: 12%; border-radius: 50%; border: 2px dashed rgba(var(--acc-rgb),.5); }
.cp-name { position: absolute; left: 50%; bottom: 1%; transform: translateX(-50%); max-width: 100%; padding: 1px 8px;
  border-radius: 3px; background: rgba(7,9,12,.85); border: 1px solid rgba(var(--acc-rgb),.5); color: var(--cp-accent);
  font-size: 10px; font-weight: 600; letter-spacing: .16em; text-transform: uppercase; line-height: 1.5;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cp-bubble { position: relative; min-width: 0; padding: .6em .9em; background: rgba(9,12,16,.92);
  border: 1px solid rgba(var(--acc-rgb),.6); border-radius: 14px; line-height: 1.35;
  box-shadow: 0 6px 18px rgba(0,0,0,.45); opacity: 0; transform: translateY(8px) scale(.96); transform-origin: 0 100%;
  transition: opacity .35s ease, transform .35s ease; }
.cp-right .cp-bubble { transform-origin: 100% 100%; }
.cp-bubble.is-on { opacity: 1; transform: none; }
.cp-bubble.is-alert { border-color: #ff6b6b; box-shadow: 0 0 16px rgba(255,107,107,.35), 0 6px 18px rgba(0,0,0,.45); }
.cp-bubble.is-placeholder { border-style: dashed; color: #8a94a0; }
.cp-bubble p { margin: 0; overflow-wrap: anywhere; }
/* Queue de la bulle, tournée vers l'avatar */
.cp-bubble::before { content: ''; position: absolute; bottom: 18px; left: -8px; width: 14px; height: 14px;
  background: inherit; border-left: inherit; border-bottom: inherit; transform: rotate(45deg); border-bottom-left-radius: 3px; }
.cp-right .cp-bubble::before { left: auto; right: -8px; border-left: 0; border-bottom: 0; border-right: inherit; border-top: inherit;
  border-bottom-left-radius: 0; border-top-right-radius: 3px; }

/* Fenêtre par-dessus le jeu : toute la fenêtre, avatar à la hauteur de la fenêtre. Les animations d'attente y font
   quelques cycles (une vingtaine de secondes), puis s'arrêtent jusqu'au prochain changement d'humeur ou de phrase :
   une animation sans fin redessine la fenêtre transparente au-dessus du jeu en continu. */
.cp-window { position: fixed; inset: 0; padding: 8px; }
.cp-window .cp-sway { animation-iteration-count: 3; }
.cp-window .cp-breathe { animation-iteration-count: 5; }
.cp-window.cp-mood-endormi .cp-breathe { animation-iteration-count: 3; }
.cp-window .cp-blink.is-blinking { animation-iteration-count: 4; }
.cp-window .cp-figure { height: min(calc(100vh - 16px), 48vw); }
.cp-window .cp-bubble { flex: 1 1 auto; align-self: center; max-height: calc(100vh - 16px); overflow: hidden;
  font-size: clamp(13px, 4.6vh, 18px); }
/* Petit compagnon de l'application, en bas à droite */
.cp-dock { position: fixed; right: 1.1rem; bottom: 1rem; z-index: 39; pointer-events: none; max-width: min(460px, calc(100vw - 2rem)); }
.cp-dock .cp-figure { width: 92px; height: 92px; pointer-events: auto; }
.cp-dock .cp-bubble { max-width: 330px; font-size: 14px; margin-bottom: 26px; }
/* Aperçu de la page des réglages */
.cp-preview { min-height: 200px; }
.cp-preview .cp-figure { width: 190px; height: 190px; }
.cp-preview .cp-bubble { flex: 0 1 360px; align-self: center; font-size: 15px; }

@keyframes cp-sway { 0%, 100% { transform: rotate(-1.3deg); } 50% { transform: rotate(1.3deg); } }
@keyframes cp-breathe { 0%, 100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-1.2%) scale(1.018); } }
@keyframes cp-hop { 0% { transform: translateY(0); } 30% { transform: translateY(-7%); } 55% { transform: translateY(0); }
  75% { transform: translateY(-2%); } 100% { transform: translateY(0); } }
@keyframes cp-blink { 0%, 94% { opacity: 0; } 94.5%, 97% { opacity: 1; } 97.5%, 100% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .cp-sway, .cp-breathe, .cp-figure.cp-hop, .cp-blink.is-blinking { animation: none; }
  .cp-img, .cp-bubble { transition: none; }
}
`;

/** Styles ajoutés une seule fois à la page. */
function useStyles() {
  useEffect(() => {
    if (document.getElementById('compagnon-css')) return;
    const style = document.createElement('style');
    style.id = 'compagnon-css';
    style.textContent = CSS;
    document.head.append(style);
  }, []);
}

/**
 * @param pack     pack d'avatar ({ moods: { humeur: adresse }, blink })
 * @param mood     humeur à montrer
 * @param line     phrase { id, text, alert, visible } ou null
 * @param name     nom du personnage (étiquette sous l'avatar)
 * @param side     'left' : avatar à gauche de la bulle ; 'right' : à droite
 * @param variant  'window' (fenêtre en jeu), 'dock' (application) ou 'preview' (réglages)
 * @param placeholder texte montré dans la bulle quand il ne dit rien (placement de la fenêtre, aperçu)
 * @param onFigureClick clic sur l'avatar (le petit compagnon de l'app ouvre ses réglages)
 */
export default function CompanionView({ pack, mood = 'neutre', line, name, side = 'left', variant = 'window', placeholder = null, onFigureClick, figureTitle }) {
  useStyles();
  const [hop, setHop] = useState(false);
  useEffect(() => {
    if (!line?.id || !line.visible) return undefined;
    setHop(true);
    const t = setTimeout(() => setHop(false), 650);
    return () => clearTimeout(t);
  }, [line?.id]);

  // En jeu, les animations d'attente sont finies (CSS) : elles repartent à chaque nouvelle humeur ou phrase
  const figure = useRef(null);
  useEffect(() => {
    if (variant !== 'window') return;
    try {
      for (const a of figure.current?.getAnimations?.({ subtree: true }) || []) if (a.playState === 'finished') a.play();
    } catch {
      // navigateur sans getAnimations : les animations restent arrêtées, rien d'autre ne change
    }
  }, [variant, mood, line?.id]);

  const images = distinctImages(pack);
  const src = pack?.moods?.[mood] || pack?.moods?.neutre || null;
  const blinking = Boolean(pack?.blink) && mood === 'neutre' && !line?.visible;
  const text = line?.text || placeholder || '';
  const on = line ? line.visible : Boolean(placeholder);
  const Figure = onFigureClick ? 'button' : 'div';

  return (
    <div className={`cp cp-${variant} cp-${side === 'right' ? 'right' : 'left'} cp-mood-${mood}`}>
      <Figure ref={figure} className={`cp-figure ${hop ? 'cp-hop' : ''}`} onClick={onFigureClick} title={figureTitle} type={onFigureClick ? 'button' : undefined}>
        <div className="cp-sway">
          <div className="cp-breathe">
            {images.length === 0 && <div className="cp-empty" />}
            {images.map((url) => (
              <img key={url} src={url} alt="" draggable={false} className={`cp-img ${url === src ? 'is-on' : ''}`} />
            ))}
            {pack?.blink && <img src={pack.blink} alt="" draggable={false} className={`cp-img cp-blink ${blinking ? 'is-blinking' : ''}`} />}
          </div>
        </div>
        {name && <span className="cp-name">{name}</span>}
      </Figure>
      <div className={`cp-bubble ${on ? 'is-on' : ''} ${line?.alert ? 'is-alert' : ''} ${!line && placeholder ? 'is-placeholder' : ''}`} role="status" aria-live="polite">
        <p>{text}</p>
      </div>
    </div>
  );
}
