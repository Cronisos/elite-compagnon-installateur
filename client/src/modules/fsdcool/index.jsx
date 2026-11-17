import { useLiveSession, useOverlayPage } from '../../core/hud.jsx';
import { useNow } from '../../core/stream.js';
import { clock } from '../../core/format.js';
import { scoPhase } from './sco.js';
import Jauge from './Jauge.jsx';

const CSS = `
html, body { overflow: hidden !important; } /* jamais de barre de défilement dans la fenêtre en jeu */
.jh-hud { display: flex; flex-direction: column; gap: 6px; padding: 4px; width: 288px; font-family: 'Barlow Condensed', 'Segoe UI', sans-serif; position: relative; }
.jh-hud.is-edit { outline: 1px dashed var(--accent); outline-offset: -1px; background: rgba(7,9,12,.35); cursor: move; -webkit-app-region: drag; } /* toute la fenêtre se fait glisser */
.jh { display: flex; align-items: stretch; gap: 7px; }
.jh-cadre { flex: none; width: 42px; height: 46px; display: grid; place-items: center; background: linear-gradient(160deg, color-mix(in srgb, var(--c) 22%, rgba(7,9,12,.9)), rgba(7,9,12,.82)); border: 1px solid color-mix(in srgb, var(--c) 70%, transparent); clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px)); }
.jh-icone { width: 26px; height: 40px; filter: drop-shadow(0 0 4px color-mix(in srgb, var(--c) 60%, transparent)); }
.jh-corps { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 4px; padding: 3px 8px 4px; background: linear-gradient(90deg, rgba(7,9,12,.78), rgba(7,9,12,.45)); border-left: 2px solid var(--c); }
.jh-haut { display: flex; align-items: baseline; gap: 6px; line-height: 1; }
.jh-label { color: var(--c); font-weight: 700; font-size: 15px; letter-spacing: .18em; text-shadow: 0 0 8px color-mix(in srgb, var(--c) 50%, transparent); }
.jh-etat { flex: 1; color: #aab3bd; font-weight: 600; font-size: 11px; letter-spacing: .14em; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.jh-temps { color: #f4f6f8; font-weight: 700; font-size: 22px; letter-spacing: .04em; font-variant-numeric: tabular-nums; text-shadow: 0 0 10px color-mix(in srgb, var(--c) 55%, transparent), 0 1px 2px #000; }
.jh-barre { display: flex; gap: 2px; height: 9px; }
.jh-barre i { flex: 1; background: rgba(255,255,255,.08); transform: skewX(-20deg); }
.jh-barre i.is-on { background: var(--c); box-shadow: 0 0 5px color-mix(in srgb, var(--c) 70%, transparent); }
.jh-barre i.is-suivant { background: color-mix(in srgb, var(--c) 45%, transparent); animation: jh-cligne .8s steps(2, jump-none) 3; } /* 3 clignements par segment qui se remplit, puis fixe : jamais sans fin au-dessus du jeu */
.jh.is-pret .jh-cadre, .jh.is-pret .jh-barre { animation: jh-pouls 1.1s ease-in-out 4; } /* quelques pulsations à « PRÊT », puis fixe */
.jh.is-pret .jh-temps { color: var(--c); }
.jh-pin { position: absolute; top: -2px; right: -2px; opacity: .35; }
.jh-pin:hover, .jh-hud.is-edit .jh-pin { opacity: 1; }
@keyframes jh-cligne { 50% { opacity: .25; } }
@keyframes jh-pouls { 50% { opacity: .6; } } /* opacité, pas un filtre : moins de travail pour la carte graphique au-dessus du jeu */
`;

/**
 * Page de l'overlay (/hud/fsdcool), sans fenêtre : une jauge horizontale par refroidissement (icône de propulseur, barre en
 * segments, compte à rebours).
 * FSD (hors saut, après une surcharge du supercruise…), en bleu : le jeu ne donne pas la durée, elle vient des
 * refroidissements déjà mesurés. SCO (overdrive) après sa coupure, en orange, puis « PRÊT » en vert.
 */
function FsdCoolOverlay() {
  const { data } = useLiveSession('/modules/fsdcool', 'fsdcool:update', { horloge: false }); // sa propre horloge (now)
  const { editing, pin } = useOverlayPage();
  const now = useNow(250);
  const sco = scoPhase(data?.sco, now);
  const jauges = [];
  if (data?.active) {
    const ecoule = (now - Date.parse(data.active.since)) / 1000;
    const prevu = data.expectedMs != null ? data.expectedMs / 1000 : null;
    const reste = prevu != null ? Math.max(0, prevu - ecoule) : null;
    jauges.push(reste != null
      ? { cle: 'fsd', label: 'FSD', etat: reste > 0 ? 'Refroidissement' : 'Prêt', fraction: prevu ? ecoule / prevu : 0, texte: reste > 0 ? `${Math.ceil(reste)} s` : 'PRÊT', pret: reste === 0, couleur: '#6fd3ff' }
      : { cle: 'fsd', label: 'FSD', etat: 'Refroidissement · 1re mesure', fraction: 0, texte: clock(ecoule), couleur: '#6fd3ff' });
  }
  if (sco) {
    const pret = sco.phase === 'ready';
    jauges.push({ cle: 'sco', label: 'SCO', etat: pret ? 'Overdrive prêt' : 'Refroidissement', fraction: pret ? 1 : sco.durationS ? 1 - sco.leftS / sco.durationS : 0, texte: pret ? 'PRÊT' : `${Math.ceil(sco.leftS)} s`, pret, couleur: 'var(--accent)' });
  }
  // Rien à montrer : la fenêtre reste vide (transparente), sauf en mode déplacement pour pouvoir la placer
  if (!jauges.length && !editing) return null;
  return (
    <div className={`jh-hud${editing ? ' is-edit' : ''}`}>
      <style>{CSS}</style>
      {jauges.length ? jauges.map(({ cle, ...j }) => <Jauge key={cle} {...j} />) : <Jauge label="SCO" etat="Exemple · place la fenêtre" fraction={0.6} texte="—" couleur="var(--accent)" />}
      {pin && <span className="jh-pin">{pin}</span>}
    </div>
  );
}

export default {
  id: 'fsdcool',
  title: 'Refroidissement FSD',
  Hud: FsdCoolOverlay, // pas de page : seulement la fenêtre, ouverte d'elle-même
};
