// Pilotage des fenêtres de l'overlay (par-dessus le jeu) : état partagé, et bouton afficher / masquer.

import { useEffect, useState } from 'react';
import { api } from './api.js';
import { useEvent } from './stream.js';
import { windowsOf } from './modes.js';
import { texteOverlayAbsentCourt } from './installation.js';

/**
 * Fenêtres d'un mode : son HUD, plus les pages qu'il déclare en plus (liste des repères du minage…), d'après la
 * déclaration commune des modes (core/modes.js) : les mêmes que celles que le serveur ouvre seul à l'embarquement.
 * Commerce n'en a pas.
 */
export const modePages = (mode) => windowsOf(mode);

/** Passe au mode proposé (bouton « Oui ») : ses fenêtres, en gardant le Coup d'œil s'il était ouvert. */
export async function switchMode(mode) {
  const state = await api('/overlay');
  const pages = [...modePages(mode), ...(state.glance ? ['glance'] : [])];
  return api('/overlay', { method: 'PUT', body: { mode, glance: state.glance, pages } });
}

/**
 * État de l'overlay ({ mode, glance, pages, installed }) et changement des fenêtres affichées.
 * Un seul mode de jeu à la fois ; la fenêtre Coup d'œil (glance) s'ajoute à n'importe quel mode.
 */
export function useOverlay() {
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api('/overlay').then(setState).catch(() => {});
  }, []);
  useEvent('overlay', setState);

  /**
   * @param windows ouvrir les fenêtres du mode (false : le garder sans elles ; Commerce n'en a pas)
   * @param o.dismissExtras « Aucun » : ferme aussi les fenêtres ouvertes d'elles-mêmes par les modules (itinéraire,
   *   alerte…), chacune jusqu'à sa prochaine occasion (server/src/core/overlay.js)
   */
  async function show(mode, glance, windows = true, { dismissExtras = false } = {}) {
    setError(null);
    const pages = [...(mode && windows ? modePages(mode) : []), ...(glance ? ['glance'] : [])];
    try {
      setState(await api('/overlay', { method: 'PUT', body: { mode, glance: Boolean(glance), pages, ...(dismissExtras ? { dismissExtras: true } : {}) } }));
    } catch (err) {
      setError(err.message);
    }
  }

  return { state, error, show };
}

/**
 * Bouton d'une page : affiche ou masque sa fenêtre par-dessus le jeu.
 * @param page identifiant de la page HUD (/hud/<page>) : un mode de jeu, ou 'glance'
 */
export function OverlayToggle({ page, className = '' }) {
  const { state, error, show } = useOverlay();
  if (!state) return null;
  if (!state.installed) return <span className="small muted">{texteOverlayAbsentCourt({ coupe: state.disabled })}</span>;

  const isGlance = page === 'glance';
  const visible = isGlance ? state.glance : state.mode === page;
  // Le mode en cours garde ses fenêtres s'il en avait (Commerce n'en a pas)
  const toggle = () => (isGlance ? show(state.mode, !state.glance, state.pages.includes(state.mode)) : show(visible ? null : page, state.glance));
  return (
    <>
      <button className={`btn ${visible ? '' : 'btn-primary'} ${className}`} onClick={toggle} title="Fenêtre par-dessus le jeu">
        🗔 {visible ? 'Masquer la fenêtre' : 'Afficher la fenêtre'}
      </button>
      {error && <span className="small bad">{error}</span>}
    </>
  );
}
