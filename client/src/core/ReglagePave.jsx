// Paramètres → pavé tactile (app de bureau) : une fenêtre de menus à gros boutons, à poser sur un petit écran tactile
// (sous l'écran principal, à la manière d'un Stream Deck). Cochée, elle s'ouvre tout de suite ; décochée, elle se ferme.
// Gardé au lancement suivant, comme sa place. Rien dans un navigateur.

import { useEffect, useState } from 'react';
import { bureau } from './bureau.js';

export default function ReglagePave() {
  const [actif, setActif] = useState(null);
  useEffect(() => {
    bureau?.lirePave?.().then((r) => r && setActif(r.actif)).catch(() => {});
    return bureau?.surPave?.(setActif);
  }, []);
  if (!bureau?.reglerPave || actif === null) return null;
  const regler = (v) => {
    setActif(v);
    bureau.reglerPave(v);
  };
  return (
    <section className="panel" data-tuto="parametres-pave">
      <h2>Pavé tactile</h2>
      <p className="small muted">
        Les menus de l’app en gros boutons, dans une fenêtre à part : pose-la sur ton petit écran tactile (sous l’écran
        principal). Un bouton ouvre son sous-menu, « ◂ Retour » remonte, une page s’ouvre dans la fenêtre principale.
        Déplace-la par sa barre du haut, agrandis-la par ses bords : sa place est gardée. Toucher un bouton laisse le
        clavier et la souris au jeu.
      </p>
      <label className="check">
        <input type="checkbox" checked={actif} onChange={(e) => regler(e.target.checked)} /> Afficher le pavé tactile
      </label>
    </section>
  );
}
