// Jauge de refroidissement sans fenêtre (fenêtre en jeu /hud/fsdcool), à l'horizontale, comme un instrument du cockpit :
// l'icône du propulseur dans son cadre, le nom et l'état, le compte à rebours, et une barre en segments qui s'allument
// un à un (le dernier clignote). Prêt : tout passe au vert, la flamme s'allume. Dessin original (SVG), sans image.

export const SEGMENTS = 24;

/**
 * Icône de propulseur : la tuyère et sa flamme. Couleurs en style (pas en attributs SVG) : la couleur peut être une
 * variable de teinte de l'app (« var(--accent) », couleur du HUD), que les attributs SVG ne comprennent pas.
 */
function Propulseur({ couleur, actif }) {
  const trait = { stroke: couleur };
  return (
    <svg viewBox="30 18 40 66" className="jh-icone" aria-hidden="true">
      <rect x="39" y="25" width="22" height="6" rx="1.5" fill="none" style={trait} strokeWidth="2.6" />
      <path d="M41 31 h18 l6 19 h-30 z" style={{ ...trait, fill: `color-mix(in srgb, ${couleur} 15%, transparent)` }} strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M36 54 h28" style={trait} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M40 58 Q50 80 50 80 Q50 80 60 58 Z" style={{ ...trait, fill: actif ? couleur : 'none' }} strokeWidth="2.2" strokeDasharray={actif ? undefined : '3 3'} opacity={actif ? 0.95 : 0.6} />
      <path d="M45 58 Q50 70 50 70 Q50 70 55 58 Z" fill={actif ? '#fff' : 'none'} opacity={actif ? 0.8 : 0} />
    </svg>
  );
}

/**
 * @param fraction 0 à 1 : avancement du refroidissement (1 : prêt)
 * @param texte compte à rebours (« 7 s ») ou « PRÊT »
 * @param etat « refroidissement », « prêt », « 1re mesure »…
 */
export default function Jauge({ label, etat, fraction, texte, couleur, pret = false }) {
  const f = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
  const c = pret ? '#5fd38d' : couleur;
  const allumes = pret ? SEGMENTS : Math.floor(f * SEGMENTS);
  return (
    <div className={`jh${pret ? ' is-pret' : ''}`} style={{ '--c': c }}>
      <div className="jh-cadre"><Propulseur couleur={c} actif={pret} /></div>
      <div className="jh-corps">
        <div className="jh-haut">
          <span className="jh-label">{label}</span>
          <span className="jh-etat">{etat}</span>
          <span className="jh-temps">{texte}</span>
        </div>
        <div className="jh-barre" aria-label={`${label} : ${Math.round(f * 100)} %`}>
          {Array.from({ length: SEGMENTS }, (_, k) => (
            <i key={k} className={k < allumes ? 'is-on' : k === allumes && !pret ? 'is-suivant' : ''} />
          ))}
        </div>
      </div>
    </div>
  );
}
