import { useId, useRef } from 'react';
import { feMatrix, hex, PALETTE } from './colour.js';

// Faux HUD dessiné pour l'app (aucune capture du jeu), dans des teintes proches de celles d'origine.
// Seul le calque de l'interface passe dans le filtre feColorMatrix, comme dans le jeu : l'espace, la
// planète et la structure du cockpit ne changent pas de couleur.

const C = Object.fromEntries(PALETTE.map((p) => [p.key, hex(p.rgb)]));
const W = 960;
const H = 540;
const FONT = "'Barlow Condensed', 'Segoe UI', 'Arial Narrow', sans-serif";

// Étoiles fixes (suite pseudo-aléatoire : même ciel à chaque affichage)
const STARS = (() => {
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: 90 }, () => ({ x: rnd() * W, y: rnd() * 360, r: 0.4 + rnd() * 1.1, o: 0.3 + rnd() * 0.6 }));
})();

function Scene({ id }) {
  return (
    <g aria-hidden="true">
      <rect width={W} height={H} fill={`url(#${id}-sky)`} />
      <ellipse cx="190" cy="150" rx="260" ry="120" fill={`url(#${id}-neb)`} />
      {STARS.map((st, i) => <circle key={i} cx={st.x} cy={st.y} r={st.r} fill="#e6edff" opacity={st.o} />)}
      <circle cx="830" cy="-70" r="270" fill={`url(#${id}-planet)`} />
      <circle cx="830" cy="-70" r="270" fill="none" stroke="#86a9d6" strokeOpacity="0.25" strokeWidth="3" />
      {/* Structure du cockpit : ce n'est pas l'interface, elle garde sa couleur */}
      <path d="M0 0 H960 V20 Q480 58 0 20 Z" fill="#0b0d11" />
      <path d="M0 36 H30 L64 330 L36 540 H0 Z" fill="#0b0d11" />
      <path d="M960 36 H930 L896 330 L924 540 H960 Z" fill="#0b0d11" />
      <path d="M0 540 V508 Q480 474 960 508 V540 Z" fill="#07080b" />
    </g>
  );
}

const Bar = ({ x, y, w, value, color }) => (
  <g>
    <rect x={x} y={y} width={w} height="7" fill="none" stroke={color} strokeOpacity="0.8" />
    <rect x={x + 1.5} y={y + 1.5} width={Math.max(0, (w - 3) * value)} height="4" fill={color} />
  </g>
);

const Label = ({ x, y, color, size = 10, anchor = 'start', weight = 500, spacing = 1.5, children }) => (
  <text x={x} y={y} fill={color} fontSize={size} textAnchor={anchor} fontWeight={weight} letterSpacing={spacing} fontFamily={FONT}>{children}</text>
);

/** Crochets autour d'une cible. */
function Brackets({ x, y, w, h, color, k = 8 }) {
  const d = [
    `M${x} ${y + k} V${y} H${x + k}`, `M${x + w - k} ${y} H${x + w} V${y + k}`,
    `M${x + w} ${y + h - k} V${y + h} H${x + w - k}`, `M${x + k} ${y + h} H${x} V${y + h - k}`,
  ].join(' ');
  return <path d={d} fill="none" stroke={color} strokeWidth="1.6" />;
}

/** Contact du radar avec sa tige jusqu'au plan. */
function Contact({ x, y, dy, color, shape }) {
  const mark = {
    tri: <path d={`M${x} ${y - 5} L${x + 5} ${y + 4} L${x - 5} ${y + 4} Z`} fill={color} />,
    hollow: <path d={`M${x} ${y - 5} L${x + 5} ${y + 4} L${x - 5} ${y + 4} Z`} fill="none" stroke={color} strokeWidth="1.4" />,
    square: <rect x={x - 4} y={y - 4} width="8" height="8" fill={color} />,
    diamond: <path d={`M${x} ${y - 5} L${x + 5} ${y} L${x} ${y + 5} L${x - 5} ${y} Z`} fill={color} />,
  }[shape];
  return (
    <g>
      <line x1={x} y1={y} x2={x} y2={y + dy} stroke={color} strokeWidth="1.2" />
      {mark}
    </g>
  );
}

function ShieldRings({ cx, cy, radii, color }) {
  return radii.map((r, i) => (
    <circle key={r} cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="2.2" strokeOpacity={0.95 - i * 0.2} strokeDasharray={`${(Math.PI * r) / 3.4} 6`} />
  ));
}

/** Calque de l'interface : tout ce qui passe dans la matrice du jeu. */
function HudArt() {
  return (
    <g fontFamily={FONT}>
      {/* Système et vitesse */}
      <Label x={480} y={46} color={C.white} size={15} anchor="middle" spacing={4} weight={600}>NOVA ARKTIS</Label>
      <line x1="392" x2="568" y1="54" y2="54" stroke={C.orange} strokeOpacity="0.6" />
      <Label x={480} y={68} color={C.orange} anchor="middle" spacing={2}>SUPERCROISIÈRE · 12,4 c</Label>

      {/* Alerte */}
      <g transform="translate(480 98)">
        <rect x="-118" y="-13" width="236" height="24" fill={C.red} fillOpacity="0.12" stroke={C.red} />
        <path d="M-100 6 L-92 -8 L-84 6 Z" fill="none" stroke={C.red} strokeWidth="1.6" />
        <Label x={8} y={4} color={C.red} size={11} anchor="middle" spacing={2} weight={700}>VERROUILLAGE ENNEMI</Label>
      </g>

      {/* Réticule */}
      <g transform="translate(480 238)" stroke={C.orange} strokeWidth="1.5" fill="none">
        <circle r="16" />
        <path d="M-32 0 H-23 M23 0 H32 M0 -32 V-23 M0 23 V32" />
        <circle r="1.8" fill={C.orange} stroke="none" />
      </g>

      {/* Cibles dans l'espace */}
      <Brackets x={590} y={176} w={46} h={30} color={C.red} />
      <path d="M613 184 L624 198 L613 195 L602 198 Z" fill={C.red} fillOpacity="0.85" />
      <Label x={613} y={222} color={C.red} anchor="middle" weight={700}>HOSTILE</Label>
      <Label x={613} y={235} color={C.white} size={9} anchor="middle">1,8 km</Label>

      <Brackets x={346} y={196} w={30} h={22} color={C.orange} k={6} />
      <Label x={361} y={232} color={C.orange} size={9} anchor="middle">CARGO · 4,2 km</Label>

      <path d="M292 132 L301 143 L292 154 L283 143 Z" fill="none" stroke={C.yellow} strokeWidth="1.8" />
      <Label x={292} y={170} color={C.yellow} size={9} anchor="middle" weight={600}>REPÈRE</Label>
      <Label x={292} y={182} color={C.white} size={9} anchor="middle">12 Mm</Label>

      <path d="M700 262 l8 -8 l8 8 M700 270 l8 -8 l8 8" fill="none" stroke={C.green} strokeWidth="1.8" />
      <Label x={708} y={286} color={C.green} size={9} anchor="middle" weight={600}>ÉQUIPIER</Label>

      <rect x="196" y="240" width="18" height="18" fill="none" stroke={C.white} strokeWidth="1.5" />
      <Label x={205} y={274} color={C.white} size={9} anchor="middle">PORT NOVA</Label>

      {/* Panneau de gauche : la cible */}
      <polygon points="76,340 292,352 292,512 76,512" fill={C.dark} fillOpacity="0.22" stroke={C.orange} strokeOpacity="0.7" />
      <Label x={88} y={368} color={C.orange} size={10} spacing={2}>CIBLE</Label>
      <Label x={280} y={368} color={C.red} size={9} anchor="end" weight={700}>HOSTILE</Label>
      <Label x={88} y={385} color={C.white} size={12} spacing={1}>CHASSEUR</Label>
      <g stroke={C.orange} strokeWidth="1.3" fill="none">
        <path d="M140 418 L164 470 L140 462 L116 470 Z" />
        <path d="M140 418 V462 M128 446 H152" strokeOpacity="0.6" />
      </g>
      <ShieldRings cx={140} cy={446} radii={[36, 42]} color={C.blue} />
      <Label x={196} y={414} color={C.blue} size={9} weight={600}>BOUCLIERS</Label>
      <Bar x={196} y={419} w={84} value={0.72} color={C.blue} />
      <Label x={196} y={446} color={C.orange} size={9} weight={600}>COQUE</Label>
      <Bar x={196} y={451} w={84} value={0.88} color={C.orange} />
      <Label x={196} y={480} color={C.orange} size={9}>SOUS-SYSTÈME</Label>
      <Label x={196} y={494} color={C.white} size={9}>Propulseurs 92 %</Label>

      {/* Vitesse : la zone bleue est la vitesse optimale pour tourner */}
      <rect x="312" y="372" width="14" height="136" fill="none" stroke={C.orange} strokeOpacity="0.85" />
      <rect x="308" y="398" width="22" height="24" fill={C.blue} fillOpacity="0.3" stroke={C.blue} />
      <rect x="315" y="432" width="8" height="73" fill={C.orange} />
      <Label x={319} y={364} color={C.white} size={9} anchor="middle">312</Label>

      {/* Radar */}
      <g transform="translate(480 450)">
        <ellipse rx="140" ry="56" fill={C.dark} fillOpacity="0.2" stroke={C.orange} strokeOpacity="0.9" strokeWidth="1.4" />
        <ellipse rx="94" ry="37" fill="none" stroke={C.orange} strokeOpacity="0.55" />
        <ellipse rx="47" ry="19" fill="none" stroke={C.orange} strokeOpacity="0.4" />
        <path d="M-140 0 H140 M0 -56 V56" stroke={C.orange} strokeOpacity="0.3" />
        <path d="M0 -6 L5 4 L-5 4 Z" fill={C.orange} />
      </g>
      <Contact x={420} y={428} dy={16} color={C.orange} shape="hollow" />
      <Contact x={515} y={436} dy={22} color={C.orange} shape="tri" />
      <Contact x={562} y={424} dy={18} color={C.red} shape="tri" />
      <Contact x={540} y={478} dy={-12} color={C.white} shape="square" />
      <Contact x={446} y={474} dy={-10} color={C.green} shape="diamond" />
      <Contact x={378} y={452} dy={-8} color={C.yellow} shape="diamond" />

      {/* Ton vaisseau et ses boucliers */}
      <path d="M652 432 L668 466 L652 460 L636 466 Z" fill="none" stroke={C.orange} strokeWidth="1.3" />
      <ShieldRings cx={652} cy={450} radii={[24, 30, 36]} color={C.blue} />
      <Label x={652} y={502} color={C.blue} size={9} anchor="middle" weight={600}>BOUCLIERS 100 %</Label>

      {/* Panneau de droite : distributeur, chaleur, carburant */}
      <polygon points="702,352 900,340 900,512 702,512" fill={C.dark} fillOpacity="0.22" stroke={C.orange} strokeOpacity="0.7" />
      <Label x={714} y={368} color={C.orange} size={10} spacing={2}>DISTRIBUTEUR</Label>
      {[['SYS', 2], ['MOT', 4], ['ARM', 3]].map(([name, pips], i) => (
        <g key={name}>
          {[0, 1, 2, 3].map((p) => (
            <rect key={p} x={716 + i * 30} y={466 - p * 13} width="20" height="9" fill={p < pips ? C.orange : 'none'} stroke={C.orange} strokeOpacity="0.8" />
          ))}
          <Label x={726 + i * 30} y={492} color={C.white} size={9} anchor="middle">{name}</Label>
        </g>
      ))}
      <Label x={812} y={392} color={C.orange} size={9} weight={600}>CHALEUR 38 %</Label>
      <Bar x={812} y={397} w={78} value={0.38} color={C.orange} />
      <Label x={812} y={424} color={C.orange} size={9} weight={600}>CARBURANT</Label>
      <Bar x={812} y={429} w={78} value={0.7} color={C.orange} />
      <Label x={812} y={456} color={C.orange} size={9}>SOUTE</Label>
      <Label x={812} y={470} color={C.white} size={10}>720 / 784 t</Label>
    </g>
  );
}

/**
 * Aperçu avant / après : à gauche du curseur la matrice « avant », à droite la matrice « après ».
 * split : 0 (tout après) à 1 (tout avant). onSplit : glisser sur l'image déplace le curseur.
 * space : 'srgb' (valeurs telles quelles) ou 'linear' (lumière linéaire, comme l'éditeur arkku).
 */
export default function FakeHud({ before, after, split, onSplit, space = 'srgb' }) {
  const id = `hc${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const svg = useRef(null);
  const x = Math.round(split * W);
  const cif = space === 'linear' ? 'linearRGB' : 'sRGB';

  function move(e) {
    if (!onSplit || !(e.buttons & 1)) return;
    const box = svg.current.getBoundingClientRect();
    onSplit(Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)));
  }

  return (
    <svg
      ref={svg}
      className="hc-preview"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Aperçu du HUD avec les couleurs choisies"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        move(e);
      }}
      onPointerMove={move}
    >
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#03050b" />
          <stop offset="1" stopColor="#0b1222" />
        </linearGradient>
        <radialGradient id={`${id}-neb`}>
          <stop offset="0" stopColor="#5b3d8a" stopOpacity="0.22" />
          <stop offset="1" stopColor="#5b3d8a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-planet`} cx="0.35" cy="0.75" r="0.8">
          <stop offset="0" stopColor="#4d6488" />
          <stop offset="0.6" stopColor="#1f2c44" />
          <stop offset="1" stopColor="#0d1320" />
        </radialGradient>
        {/* Calcul du jeu (approché) : valeurs telles quelles (sRGB) ou lumière linéaire, au choix du joueur */}
        <filter id={`${id}-before`} filterUnits="userSpaceOnUse" x="0" y="0" width={W} height={H} colorInterpolationFilters={cif}>
          <feColorMatrix type="matrix" values={feMatrix(before)} />
        </filter>
        <filter id={`${id}-after`} filterUnits="userSpaceOnUse" x="0" y="0" width={W} height={H} colorInterpolationFilters={cif}>
          <feColorMatrix type="matrix" values={feMatrix(after)} />
        </filter>
        <clipPath id={`${id}-left`}><rect x="0" y="0" width={x} height={H} /></clipPath>
        <clipPath id={`${id}-right`}><rect x={x} y="0" width={W - x} height={H} /></clipPath>
      </defs>
      <Scene id={id} />
      {x > 0 && <g clipPath={`url(#${id}-left)`}><g filter={`url(#${id}-before)`}><HudArt /></g></g>}
      {x < W && <g clipPath={`url(#${id}-right)`}><g filter={`url(#${id}-after)`}><HudArt /></g></g>}
      {x > 0 && x < W && (
        <g pointerEvents="none">
          <line x1={x} x2={x} y1="0" y2={H} stroke="#e8edf3" strokeOpacity="0.8" strokeWidth="2" />
          <circle cx={x} cy={H / 2} r="13" fill="#0b0d11" stroke="#e8edf3" strokeWidth="2" />
          <path d={`M${x - 4} ${H / 2 - 5} l-5 5 l5 5 M${x + 4} ${H / 2 - 5} l5 5 l-5 5`} fill="none" stroke="#e8edf3" strokeWidth="2" />
        </g>
      )}
      <g pointerEvents="none" fontFamily={FONT} fontSize="11" fontWeight="600" letterSpacing="2">
        {x > 60 && <g><rect x="44" y="30" width="62" height="20" rx="4" fill="#0b0d11" fillOpacity="0.8" /><text x="75" y="44" textAnchor="middle" fill="#cfd6df">AVANT</text></g>}
        {x < W - 60 && <g><rect x={W - 106} y="30" width="62" height="20" rx="4" fill="#0b0d11" fillOpacity="0.8" /><text x={W - 75} y="44" textAnchor="middle" fill="#cfd6df">APRÈS</text></g>}
      </g>
    </svg>
  );
}
