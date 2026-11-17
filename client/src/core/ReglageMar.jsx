// Paramètres → place du MAR (menu d'accès rapide de l'app de bureau) : le coin de l'écran, et un décalage le long du
// bord pour ne pas cacher un élément du jeu, et, avec plusieurs écrans, l'écran où il se pose. Appliqué tout de suite
// (le MAR bouge sous tes yeux), gardé au lancement suivant. Au même endroit : envoyer la fenêtre principale sur un
// autre écran. Rien dans un navigateur.

import { useEffect, useState } from 'react';
import { bureau } from './bureau.js';

const COINS = [
  ['haut-gauche', '↖ Haut gauche'],
  ['haut-droite', '↗ Haut droite'],
  ['bas-gauche', '↙ Bas gauche'],
  ['bas-droite', '↘ Bas droite'],
];

export default function ReglageMar() {
  const [mar, setMar] = useState(null);
  const [ecrans, setEcrans] = useState([]); // [{ numero, principal, taille }], de gauche à droite
  useEffect(() => {
    bureau?.lireMar?.().then((r) => r && setMar(r)).catch(() => {});
    bureau?.lireEcrans?.().then((l) => Array.isArray(l) && setEcrans(l)).catch(() => {});
  }, []);
  if (!bureau?.reglerMar || !mar) return null;
  const regler = (r) => {
    const n = { ...mar, ...r };
    setMar(n);
    bureau.reglerMar(n);
  };
  return (
    <section className="panel" data-tuto="parametres-mar">
      <h2>MAR (menu d’accès rapide)</h2>
      <p className="small muted">Le menu posé sur l’écran, par-dessus le jeu : le ◆ qui cache ou affiche l’app, et ses menus déroulants. Choisis son coin, puis éloigne-le du coin dans les deux sens : le long du bord, et vers l’intérieur de l’écran.</p>
      <div className="form-actions" role="group" aria-label="Coin du MAR">
        {COINS.map(([coin, label]) => (
          <button key={coin} type="button" className={`btn${mar.coin === coin ? ' btn-primary' : ''}`} onClick={() => regler({ coin })} aria-pressed={mar.coin === coin}>
            {label}
          </button>
        ))}
      </div>
      <label className="mar-decalage">
        Écart le long du bord (gauche ↔ droite) : <b>{mar.decalage} px</b>
        <input type="range" min="0" max="2000" step="10" value={mar.decalage} onChange={(e) => regler({ decalage: Number(e.target.value) })} aria-label="Écart horizontal du MAR" />
      </label>
      <label className="mar-decalage">
        Écart depuis le {mar.coin.startsWith('bas') ? 'bas' : 'haut'} de l'écran : <b>{mar.decalageY ?? 0} px</b>
        <input type="range" min="0" max="1500" step="10" value={mar.decalageY ?? 0} onChange={(e) => regler({ decalageY: Number(e.target.value) })} aria-label="Écart vertical du MAR" />
      </label>
      {ecrans.length > 1 && (
        <>
          <h3>Sur quel écran ?</h3>
          <p className="small muted">
            Tu as {ecrans.length} écrans, numérotés de gauche à droite. Si l'écran choisi est débranché, le menu revient
            sur l'écran principal.
          </p>
          <div className="form-actions" role="group" aria-label="Écran du MAR">
            <button type="button" className={`btn${mar.ecran == null ? ' btn-primary' : ''}`} onClick={() => regler({ ecran: null })} aria-pressed={mar.ecran == null}>
              Écran principal
            </button>
            {ecrans.map((e) => (
              <button key={e.numero} type="button" className={`btn${mar.ecran === e.numero ? ' btn-primary' : ''}`} onClick={() => regler({ ecran: e.numero })} aria-pressed={mar.ecran === e.numero}>
                Écran {e.numero} <span className="small muted">· {e.taille}{e.principal ? ' · principal' : ''}</span>
              </button>
            ))}
          </div>
          <h3>Fenêtre principale</h3>
          <p className="small muted">
            Elle se déplace aussi à la souris, par sa barre du haut, et garde sa place d'un lancement à l'autre. Ces
            boutons l'envoient d'un clic au milieu d'un écran.
          </p>
          <div className="form-actions" role="group" aria-label="Écran de la fenêtre principale">
            {ecrans.map((e) => (
              <button key={e.numero} type="button" className="btn" onClick={() => bureau.principaleSurEcran?.(e.numero)}>
                L'envoyer sur l'écran {e.numero}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
