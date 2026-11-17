// Carte de la route façon rapport Discord du squadron : fond étoilé, route courbe, systèmes validés allumés,
// Forteresses en hexagone, et le vaisseau sur le système en cours avec sa jauge de progression.

import { compact } from '../../core/format.js';
import shipImage from '../../assets/vaisseau-rapport.png';
import { partSemaine, placesFleches, positionVaisseau } from './routeTransit.js';

const W = 1200;
const H = 270; // assez haut pour les noms complets sur deux lignes
const C = { a: '#ff8a1f', b: '#ffd08a', neb1: '#7a2f0b', neb2: '#231447', bg: '#07060b', flame: '#7fd8ff' };
const HUD = { fontFamily: 'Chakra Petch, var(--font)', fontWeight: 700 };
const LABEL = { fontFamily: 'Barlow Condensed, var(--font)', fontWeight: 600 };

const curve = (t) => [75 + 1050 * t, 125 + 48 * Math.sin(t * 7.4 + 0.5)];
const slope = (t) => (Math.atan2(48 * 7.4 * Math.cos(t * 7.4 + 0.5), 1050) * 180) / Math.PI;
const trail = (a, b) => Array.from({ length: 61 }, (_, k) => curve(a + ((b - a) * k) / 60).map((n) => n.toFixed(1)).join(',')).join(' ');

function hexagon(x, y, r) {
  return Array.from({ length: 6 }, (_, k) => {
    const angle = (Math.PI / 3) * k + Math.PI / 6;
    return `${(x + r * Math.cos(angle)).toFixed(1)},${(y + r * Math.sin(angle)).toFixed(1)}`;
  }).join(' ');
}

/**
 * Nom complet en deux lignes, pour qu'il tienne entre deux systèmes : « Synuefe OU-E c28-2 » → [« Synuefe »,
 * « OU-E c28-2 »] ; « HIP 73834 » reste sur une ligne. Jamais abrégé : la carte de la galaxie du jeu ne trouve un
 * système qu'à son nom complet (« HK-C d14-83 » seul ne donne rien, 15 nov. 2026).
 */
export function nameLines(name) {
  const m = /^(.+?) ([A-Z]{2}-[A-Z] [a-h]\d+(?:-\d+)?)$/.exec(name);
  return m ? [m[1], m[2]] : [name];
}

// Étoiles tirées une fois pour toutes (même graine que la carte Discord)
const STARS = (() => {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: 220 }, () => ({ x: rnd() * W, y: rnd() * 720, r: rnd() * 1.3 + 0.3, o: rnd() * 0.55 + 0.1 }));
})();

/** Fond du rapport : nébuleuses orange et violette, étoiles. */
export function Sky() {
  return (
    <svg className="mh-sky" viewBox={`0 0 ${W} 720`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <radialGradient id="mh-n1" cx="18%" cy="22%" r="60%"><stop offset="0" stopColor={C.neb1} stopOpacity=".95" /><stop offset="1" stopColor={C.neb1} stopOpacity="0" /></radialGradient>
        <radialGradient id="mh-n2" cx="85%" cy="70%" r="65%"><stop offset="0" stopColor={C.neb2} stopOpacity=".95" /><stop offset="1" stopColor={C.neb2} stopOpacity="0" /></radialGradient>
      </defs>
      <rect width={W} height="720" fill={C.bg} />
      <rect width={W} height="720" fill="url(#mh-n1)" />
      <rect width={W} height="720" fill="url(#mh-n2)" />
      {STARS.map((s, k) => <circle key={k} cx={s.x.toFixed(0)} cy={s.y.toFixed(0)} r={s.r.toFixed(1)} fill="#fff" opacity={s.o.toFixed(2)} />)}
    </svg>
  );
}

// Image du vaisseau (assets/vaisseau-rapport.png, 480 × 313, fond transparent) : vue de trois quarts, le nez vers le bas
// à droite, à environ 32° sous l'horizontale. On la redresse de ce même angle pour qu'elle suive la pente de la route.
const SHIP_W = 90;
const SHIP_H = (SHIP_W * 313) / 480;
const SHIP_NOSE_DEG = 32;

// Propulseurs, dans le repère du vaisseau redressé (nez vers la droite) : arrière du corps et des deux nacelles,
// relevés sur l'image (pour SHIP_W = 90). Flamme : x, y, longueur de base, demi-épaisseur.
const THRUSTERS = [
  { x: -24.6, y: -1.5, n: 34, h: 3.2 },
  { x: -37.7, y: 11.5, n: 22, h: 2 },
  { x: -12.2, y: -18.8, n: 22, h: 2 },
];
const flame = ({ x, y, h }, n) => `M${(x - n).toFixed(1)} ${(y - h).toFixed(1)} L${x} ${(y - h * 0.8).toFixed(1)} L${x} ${(y + h * 0.8).toFixed(1)} L${(x - n).toFixed(1)} ${(y + h).toFixed(1)} Z`;
// Scintillement de l'ancien vaisseau : la flamme s'allonge et se raccourcit (0,6 s)
const FLICKER = [0.85, 1.2, 0.9, 1.1, 0.85];

function Ship({ t }) {
  const [x, y] = curve(t);
  return (
    <g transform={`translate(${x.toFixed(1)} ${(y - 38).toFixed(1)}) rotate(${slope(t).toFixed(1)})`}>
      <g>
        <animateTransform attributeName="transform" type="translate" values="0 0;0 4;0 0;0 -4;0 0" dur="2.4s" repeatCount="indefinite" />
        {THRUSTERS.map((th) => (
          <path key={`${th.x},${th.y}`} d={flame(th, th.n)} fill="url(#mh-flame)">
            <animate attributeName="d" values={FLICKER.map((f) => flame(th, th.n * f)).join(';')} dur="0.6s" repeatCount="indefinite" />
          </path>
        ))}
        <g transform={`rotate(${-SHIP_NOSE_DEG})`} filter="url(#mh-ship-glow)">
          <image href={shipImage} x={(-SHIP_W / 2).toFixed(1)} y={(-SHIP_H / 2).toFixed(1)} width={SHIP_W} height={SHIP_H.toFixed(1)} />
        </g>
      </g>
    </g>
  );
}

function Node({ step, k, last, index, frac, merits }) {
  const [x, y] = curve(last ? k / last : 0);
  const done = k < index;
  const current = k === index;
  const fort = step.role === 'stronghold' || step.role === 'held-stronghold';
  const r = fort ? 17 : 12;
  const fill = done ? 'url(#mh-done)' : 'url(#mh-idle)';
  const stroke = done || current ? C.a : '#5d586a';
  const ring = 2 * Math.PI * 25;
  const color = current ? '#fff' : done ? C.b : '#a8a2b2';
  const lines = nameLines(step.name);
  return (
    <g>
      <title>{`${step.name}${merits ? ` · ${compact(merits)} mérites cette semaine` : ''}`}</title>
      <g filter={done || current ? 'url(#mh-glow)' : undefined}>
        {fort
          ? <polygon points={hexagon(x, y, r)} fill={fill} stroke={stroke} strokeWidth="2" />
          : <circle cx={x} cy={y} r={r} fill={fill} stroke={stroke} strokeWidth="2" />}
      </g>
      {current && (
        <>
          <circle cx={x} cy={y} r="25" fill="none" stroke="#fff" strokeOpacity=".16" strokeWidth="4" />
          <circle cx={x} cy={y} r="25" fill="none" stroke={C.b} strokeWidth="4" strokeLinecap="round"
            strokeDasharray={`${(ring * frac).toFixed(1)} ${ring.toFixed(1)}`} transform={`rotate(-90 ${x} ${y})`} />
        </>
      )}
      {lines.length > 1 && (
        <text x={x} y={y + (current ? 46 : 34)} textAnchor="middle" style={LABEL} fontSize={current ? 16 : 14} fill={color}
          stroke={C.bg} strokeWidth="4" paintOrder="stroke">{lines[0]}</text>
      )}
      <text x={x} y={y + (current ? 46 : 34) + (lines.length > 1 ? (current ? 20 : 17) : 4)} textAnchor="middle" style={LABEL} fontSize={current ? 21 : 17} fill={color}
        stroke={C.bg} strokeWidth="4" paintOrder="stroke">{lines.at(-1)}</text>
      {merits > 0 && (
        <text x={x} y={y + (current ? 46 : 34) + (lines.length > 1 ? (current ? 42 : 37) : 26)} textAnchor="middle" style={LABEL} fontSize="17" fill={C.a}
          stroke={C.bg} strokeWidth="4" paintOrder="stroke">+{compact(merits)}</text>
      )}
    </g>
  );
}

/** « jeudi 19 nov. » */
const jour = (ms) => new Date(ms).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });

/**
 * Bulle au-dessus d'un système déclaré atteint (palier passé, le relevé du jeu pas encore) : en attente du passage de
 * semaine. Elle reste dans la carte, même sur le premier ou le dernier système.
 */
function Attente({ k, last, passage }) {
  const [x, y] = curve(last ? k / last : 0);
  const texte = `PALIER ATTEINT ✓ · PASSAGE ${jour(passage).toUpperCase()}`;
  const l = texte.length * 8.6 + 24;
  const bx = Math.max(8, Math.min(W - 8 - l, x - l / 2));
  const by = Math.max(6, y - 70);
  const pointe = Math.max(bx + 12, Math.min(bx + l - 12, x));
  return (
    <g>
      <rect x={bx.toFixed(1)} y={by.toFixed(1)} width={l.toFixed(1)} height="30" rx="8" fill="#1a1208" fillOpacity=".92" stroke={C.b} strokeWidth="1.5" />
      <path d={`M${(pointe - 7).toFixed(1)} ${(by + 30).toFixed(1)} l7 9 l7 -9 Z`} fill="#1a1208" stroke={C.b} strokeWidth="1.5" strokeLinejoin="round" />
      <rect x={(pointe - 6).toFixed(1)} y={(by + 28).toFixed(1)} width="12" height="3" fill="#1a1208" />
      <text x={(bx + l / 2).toFixed(1)} y={(by + 20).toFixed(1)} textAnchor="middle" style={HUD} fontSize="14" fill={C.b} letterSpacing="0.5">{texte}</text>
    </g>
  );
}

const BLEU_ROUTE = '#4fb4ff';

/**
 * Flèches sans queue, bleues, sur le tronçon entre le système complet et le suivant, qui s'illuminent en vague vers
 * l'avant : le vaisseau fait route, le système suivant n'est pas encore ouvert. Seulement en attente du passage.
 */
function Fleches({ depart, arrivee }) {
  const places = placesFleches(depart, arrivee);
  return (
    <g filter="url(#mh-glow)">
      {places.map((p, k) => {
        const [x, y] = curve(p);
        return (
          <path key={k} d="M-6 -9 L5 0 L-6 9" transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${slope(p).toFixed(1)})`}
            fill="none" stroke={BLEU_ROUTE} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.22">
            {/* La vague part du système complet et court vers le suivant */}
            <animate attributeName="opacity" values="0.22;1;0.22;0.22" keyTimes="0;0.18;0.45;1" dur="1.8s" begin={`${(k * 0.22).toFixed(2)}s`} repeatCount="indefinite" />
          </path>
        );
      })}
    </g>
  );
}

/**
 * La route, le vaisseau entre le dernier système validé et le système en cours. Système d'avant déclaré atteint cette
 * semaine (en attente du passage) : on ne peut pas encore travailler sur le système en cours. Le vaisseau a quitté le
 * système complet et avance vers le suivant au fil de la semaine, sans y arriver avant le passage ; des flèches bleues
 * le montrent, et une bulle le dit (routeTransit.js, même règle que la carte Discord).
 * `passage` : fin de la semaine en cours (ms), ou null pour une semaine passée (pas de bulle).
 */
export default function RouteMap({ steps, progress, systems, passage = null }) {
  const last = steps.length - 1;
  const gained = new Map(systems.map((s) => [s.system, s.merits]));
  const { index, frac } = progress;
  const enAttente = passage != null && index > 0 && index <= last && steps[index - 1]?.declared;
  const end = positionVaisseau({ index, frac, last, enAttente, semaine: partSemaine(passage) });
  const [cx, cy] = curve(Math.min(index, last) / last);
  return (
    <svg className="mh-map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Avancée de la route">
      <defs>
        <filter id="mh-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <radialGradient id="mh-done" cx="35%" cy="30%"><stop offset="0" stopColor={C.b} /><stop offset="1" stopColor={C.a} /></radialGradient>
        <radialGradient id="mh-idle" cx="35%" cy="30%"><stop offset="0" stopColor="#3a3744" /><stop offset="1" stopColor="#121018" /></radialGradient>
        {/* Flammes des propulseurs */}
        <linearGradient id="mh-flame"><stop offset="0" stopColor={C.flame} stopOpacity="0" /><stop offset="1" stopColor={C.flame} /></linearGradient>
        {/* Halo léger autour du vaisseau : le détache du fond étoilé sans le flouter */}
        <filter id="mh-ship-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <polyline points={trail(0, 1)} fill="none" stroke="#fff" strokeOpacity=".28" strokeWidth="2" strokeDasharray="3 9" strokeLinecap="round" />
      {end > 0 && <polyline points={trail(0, end)} fill="none" stroke={C.b} strokeWidth="6" filter="url(#mh-glow)" />}
      {enAttente && <Fleches depart={(index - 1) / last} arrivee={index / last} />}
      {steps.map((s, k) => (
        <Node key={s.name} step={s} k={k} last={last} index={index} frac={frac} merits={gained.get(s.name) || 0} />
      ))}
      {index < steps.length && <path d={`M${cx.toFixed(1)} ${(cy - 32).toFixed(1)} l-7 -12 h14 Z`} fill={C.b} opacity={index === 0 || enAttente ? 0 : 1} />}
      {passage != null && steps.map((s, k) => (s.declared ? <Attente key={`attente-${s.name}`} k={k} last={last} passage={passage} /> : null))}
      <Ship t={end} />
      {index < steps.length && (
        <text x={W - 24} y={H - 12} textAnchor="end" style={HUD} fontSize="15" fill={C.b} letterSpacing="1">
          {enAttente
            ? `EN ROUTE VERS ${steps[index].name.toUpperCase()} · OUVERT AU PASSAGE DU ${jour(passage).toUpperCase()}`
            : `OBJECTIF : ${steps[index].name.toUpperCase()} · ${Math.round(frac * 100)} %`}
        </text>
      )}
    </svg>
  );
}
