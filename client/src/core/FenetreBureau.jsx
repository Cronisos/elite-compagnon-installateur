// Boutons de fenêtre de l'app de bureau (cadre maison, sans la barre de Windows) : détacher la page, réduire, agrandir,
// fermer ; dans une fenêtre détachée, garder au premier plan et fermer. Rien dans un navigateur.

import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { bureau } from './bureau.js';

export function BoutonsFenetre({ detachee = false }) {
  const { pathname } = useLocation();
  const [agrandie, setAgrandie] = useState(false);
  const [premierPlan, setPremierPlan] = useState(true);
  const [detache, setDetache] = useState('');
  useEffect(() => {
    if (!bureau) return;
    bureau.etat().then((e) => {
      if (!e) return;
      setAgrandie(e.agrandie);
      setPremierPlan(e.premierPlan);
    }).catch(() => {});
    // Désabonnés au démontage (une ancienne app de bureau ne rend rien : typeof)
    const fins = [bureau.surAgrandie(setAgrandie), bureau.surPremierPlan(setPremierPlan)];
    return () => fins.forEach((f) => typeof f === 'function' && f());
  }, []);
  if (!bureau) return null;
  const detacher = async () => {
    const ok = await bureau.detacher(pathname).catch(() => false);
    setDetache(ok ? 'Page détachée' : 'Impossible de détacher cette page');
    setTimeout(() => setDetache(''), 2000);
  };
  return (
    <div className="fen-boutons">
      {detache && <span className="fen-note">{detache}</span>}
      {detachee ? (
        <button type="button" className={`fen-btn ${premierPlan ? 'is-on' : ''}`} onClick={() => bureau.premierPlan()} title={premierPlan ? 'Au premier plan, par-dessus le jeu (clic : non)' : 'Garder au premier plan, par-dessus le jeu'}>{premierPlan ? '◉ Épinglé' : '○ Épingler'}</button>
      ) : (
        <>
          <button type="button" className="fen-btn" onClick={detacher} title="Détacher cette page dans sa propre fenêtre, par-dessus le jeu">⧉ Détacher</button>
          <button type="button" className="fen-btn" onClick={() => bureau.reduire()} title="Réduire">▾ Réduire</button>
          <button type="button" className="fen-btn" onClick={() => bureau.agrandir()} title={agrandie ? 'Revenir à la taille d’avant' : 'Plein écran'}>{agrandie ? '⤡ Restaurer' : '⤢ Agrandir'}</button>
        </>
      )}
      <button type="button" className="fen-btn fen-fermer" onClick={() => bureau.fermer()} title={detachee ? 'Fermer cette fenêtre' : 'Masquer (l’app reste lancée : le ◆ du MAR la rappelle)'}>{detachee ? '✕ Fermer' : '✕ Masquer'}</button>
    </div>
  );
}
