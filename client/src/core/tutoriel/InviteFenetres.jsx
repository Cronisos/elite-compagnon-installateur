// Première fois qu'un mode de jeu est choisi : une petite invitation, en bas à gauche de la fenêtre principale, à
// aller voir ses fenêtres en jeu expliquées (page « Fenêtres en jeu »). Elle ne bloque rien, ne s'affiche qu'une
// fois par mode, jamais pendant un tutoriel, et seulement si les tutoriels se lancent d'eux-mêmes (Paramètres).

import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { api } from '../api.js';
import { useEvent } from '../stream.js';
import { CHEMIN_FENETRES, jeuxDeFenetres } from './FenetresEnJeu.jsx';
import { EVENEMENT_ETAT, reglerTutoriels } from './Tutoriel.jsx';

/** Identifiant du tutoriel des fenêtres d'un mode (parcours/fenetres-*.js). */
export const idJeu = (mode) => `jeu-${mode}`;

/**
 * Mode à proposer, ou null : il vient d'être choisi, il a des fenêtres en jeu, leur tutoriel n'a jamais été vu, et
 * le joueur n'est pas déjà sur leur page. Sans React : testé seul.
 */
export function modeAProposer({ avant, apres, etat, pathname, jeux }) {
  if (!apres || apres === avant) return null;
  if (!etat || etat.actifs === false || (etat.vus ?? []).includes(idJeu(apres))) return null;
  if (!jeux.some((j) => j.id === apres)) return null;
  if (String(pathname || '').startsWith(CHEMIN_FENETRES)) return null;
  return apres;
}

export default function InviteFenetres() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [etat, setEtat] = useState(null);
  const [mode, setMode] = useState(null); // mode proposé en ce moment
  const dernier = useRef(undefined); // dernier mode connu (undefined : pas encore lu)
  const jeux = useRef(jeuxDeFenetres()).current;

  useEffect(() => {
    api('/tutoriels').then(setEtat).catch(() => {});
    api('/overlay').then((o) => { dernier.current = o?.mode ?? null; }).catch(() => { dernier.current = null; });
    const maj = (e) => setEtat(e.detail);
    window.addEventListener(EVENEMENT_ETAT, maj);
    return () => window.removeEventListener(EVENEMENT_ETAT, maj);
  }, []);

  useEvent('overlay', (o) => {
    const apres = o?.mode ?? null;
    const avant = dernier.current;
    dernier.current = apres;
    if (avant === undefined) return; // premier état reçu : ce n'est pas un choix du joueur
    const propose = modeAProposer({ avant, apres, etat, pathname, jeux });
    if (propose) setMode(propose);
    else if (apres !== mode) setMode(null);
  });

  // Arrivé sur la page des fenêtres (par l'invitation ou autrement) : elle n'a plus lieu d'être
  useEffect(() => {
    if (pathname.startsWith(CHEMIN_FENETRES)) setMode(null);
  }, [pathname]);

  const jeu = jeux.find((j) => j.id === mode);
  if (!jeu) return null;
  return (
    <aside className="tuto-invite" role="status">
      <p><b>Mode « {jeu.titre} » choisi.</b> Il affiche {jeu.fenetres.length > 1 ? `${jeu.fenetres.length} fenêtres` : 'une fenêtre'} par-dessus le jeu.</p>
      <div className="tuto-actions">
        <button type="button" className="btn btn-ghost small" onClick={() => { setMode(null); reglerTutoriels({ vu: { id: idJeu(jeu.id), vu: true } }).catch(() => {}); }}>
          Ne plus proposer
        </button>
        <button type="button" className="btn btn-ghost small" onClick={() => setMode(null)}>Plus tard</button>
        <button type="button" className="btn btn-primary small" onClick={() => { setMode(null); navigate(`${CHEMIN_FENETRES}/${jeu.id}`); }}>Me les expliquer</button>
      </div>
    </aside>
  );
}
