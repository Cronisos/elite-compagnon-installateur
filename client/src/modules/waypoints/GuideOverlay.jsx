import { useEffect, useRef, useState } from 'react';
import { PanelOverlay, useHiddenWindow } from '../../core/hud.jsx';
import { useEvent } from '../../core/stream.js';
import { meters, wpApi } from './api.js';
import { shortPlace } from './places.js';
import { drillState } from './drillsFormat.js';
import NomSysteme from '../../core/NomSysteme.jsx';

// Fenêtre de guidage de l'overlay (/hud/waypoints-guide), ouverte cachée avec le mode Minage Rhino : le bouton 🧭
// d'un repère, dans la fenêtre des repères, la montre et lui donne ce repère. Une flèche qui montre où aller par
// rapport à là où l'on regarde, la distance et le cap à suivre, recalculés à chaque position. Quand tu quittes la
// planète du repère (ou de la foreuse) après y avoir été, elle se cache et le repère n'est plus suivi (l’auteur, 12 nov. 2026).
const CSS = `
.gd { font-family: 'Segoe UI', system-ui, sans-serif; display: flex; align-items: center; gap: 18px; padding: 4px 2px; }
.gd-dial { flex: none; width: 92px; height: 92px; border-radius: 50%; display: grid; place-items: center;
  background: radial-gradient(circle, rgba(var(--acc-rgb),.10) 0%, rgba(var(--acc-rgb),.02) 70%); border: 2px solid rgba(var(--acc-rgb),.55); }
.gd-dial.is-here { border-color: #5fd38d; background: radial-gradient(circle, rgba(95,211,141,.18) 0%, rgba(95,211,141,.03) 70%); }
.gd-arrow { width: 58px; height: 58px; transition: transform .5s ease-out; }
.gd-check { font-size: 44px; color: #5fd38d; line-height: 1; }
.gd-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.gd-dist { font-size: 34px; font-weight: 700; color: #f4f6f8; line-height: 1.05; font-variant-numeric: tabular-nums; }
.gd-say { font-size: 17px; font-weight: 600; color: var(--accent); }
.gd-say.is-here { color: #5fd38d; }
.gd-msg { font-family: 'Segoe UI', system-ui, sans-serif; font-size: 15px; color: #dfe4ea; line-height: 1.4; margin: 4px 0; }
.gd-msg small { display: block; color: #8a94a0; font-size: 13px; }
`;

/** Angle de la flèche, qui tourne toujours par le plus court chemin (pas de tour complet en passant de 179° à -179°). */
function useSmoothAngle(angle) {
  const last = useRef(angle ?? 0);
  if (angle != null) {
    const delta = ((angle - last.current) % 360 + 540) % 360 - 180;
    last.current += delta;
  }
  return last.current;
}

export default function GuideOverlay() {
  const [target, setTarget] = useState(null);
  const [list, setList] = useState([]);
  const [g, setG] = useState(null);
  // Foreuse du Rhino suivie (« next » : la prochaine à vider, ou son numéro) : elle passe avant le repère
  const [drill, setDrill] = useState(null);
  const loadList = () => {
    wpApi.list().then(setList).catch(() => {});
  };
  useEffect(() => {
    loadList();
    wpApi.guideTarget().then((t) => setTarget(t.id)).catch(() => {});
    wpApi.drillGuide().then((x) => setDrill(x?.target ?? null)).catch(() => {});
  }, []);
  useEvent('waypoints:update', loadList);
  useEvent('waypoints:guide-target', (t) => setTarget(t?.id ?? null));
  useEvent('waypoints:drill-guide', (x) => setDrill(x?.target ?? null));
  const refresh = () => {
    if (drill != null) {
      wpApi.drillGuide().then(setG).catch(() => setG(null));
      return;
    }
    if (target == null) return setG(null);
    wpApi.guide(target).then(setG).catch(() => setG(null));
  };
  useEffect(refresh, [target, drill]);
  const [here, setHere] = useState(null);
  useEffect(() => {
    wpApi.here().then(setHere).catch(() => {});
  }, []);
  useEvent('waypoints:here', (h) => {
    setHere(h);
    if (drill == null) refresh(); // nouvelle position : nouvelle direction
  });
  useEvent('waypoints:drills', () => drill != null && refresh()); // foreuses : à chaque position et à chaque vidange
  // Planète quittée : la fenêtre s'en va. surPlace garde la planète où tu étais près du repère suivi : changer de
  // repère pour une autre planète ne la cache donc pas, seul le départ de celle où tu étais le fait.
  const fenetre = useHiddenWindow('waypoints-guide');
  const surPlace = useRef(null);
  const corps = drill != null ? g?.body ?? null : list.find((x) => x.id === target)?.body ?? null;
  useEffect(() => {
    if (!corps || !here?.system) return;
    if (here.body === corps) {
      surPlace.current = corps;
      return;
    }
    if (surPlace.current !== corps) return;
    surPlace.current = null;
    if (fenetre.shown) fenetre.toggle();
    if (drill == null && target != null) wpApi.setGuideTarget(null).catch(() => {});
  }, [here?.body, here?.system, corps]);
  const angle = useSmoothAngle(g?.state === 'guiding' && !g.arrived ? g.turn : null);

  const w = drill != null
    ? g?.n != null && { drill: true, label: `Foreuse ${g.n}${drill === 'next' ? ' (la prochaine)' : ''}`, system: g.system, note: drillState(g).label }
    : list.find((x) => x.id === target);
  let body;
  if (!w && drill != null) {
    body = g?.state === 'none'
      ? <p className="gd-msg">Aucune foreuse à suivre.<small>Pose-en une (⛏ du balayage, ou Alt+Maj+F), ou vide-en une : l’app la repère seule.</small></p>
      : <p className="gd-msg">Calcul…</p>;
  }
  else if (!w) body = <p className="gd-msg">Aucune destination.<small>Clique sur 🧭 à côté d’un repère pour t’y faire guider.</small></p>;
  else if (!g) body = <p className="gd-msg">Calcul…</p>;
  else if (g.state === 'guiding' && g.arrived) {
    body = (
      <div className="gd">
        <div className="gd-dial is-here"><span className="gd-check">✓</span></div>
        <div className="gd-text">
          <span className="gd-dist">Tu y es</span>
          <span className="gd-say is-here">{w.drill ? `Tu es sur la foreuse${w.note ? ` · ${w.note}` : ''}` : 'Le repère est à moins de 100 m'}</span>
        </div>
      </div>
    );
  } else if (g.state === 'guiding') {
    body = (
      <div className="gd">
        <div className="gd-dial">
          <svg className="gd-arrow" viewBox="0 0 60 60" style={{ transform: `rotate(${angle}deg)` }} aria-hidden="true">
            <path d="M30 4 L50 50 L30 40 L10 50 Z" fill="#ff9a3c" />
          </svg>
        </div>
        <div className="gd-text">
          <span className="gd-dist">{meters(g.distance)}</span>
          <span className="gd-say">Cap {g.bearing}°{w.drill && w.note ? ` · ${w.note}` : ''}</span>
        </div>
      </div>
    );
  } else if (g.state === 'other-system') {
    body = <p className="gd-msg">{w.drill ? 'Cette foreuse' : 'Ce repère'} est dans un autre système.<small>Rends-toi d’abord dans <NomSysteme nom={g.system} />.</small></p>;
  } else if (g.state === 'other-body') {
    body = <p className="gd-msg">{w.drill ? 'Cette foreuse' : 'Ce repère'} est sur une autre planète.<small>Approche-toi de la planète {shortPlace(g.body, w.system)} : le guidage démarrera près du sol.</small></p>;
  } else {
    body = <p className="gd-msg">Ce repère n’a pas de position au sol.<small>Il a été pris dans l’espace ou à quai.</small></p>;
  }

  return (
    <PanelOverlay title={w ? `🧭 Vers : ${w.label}` : '🧭 Guidage'}>
      <style>{CSS}</style>
      {body}
    </PanelOverlay>
  );
}
