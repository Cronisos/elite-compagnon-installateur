// Tutoriel interactif de la fenêtre principale : il encadre un élément de la page, explique à quoi il sert dans une
// bulle, et peut attendre que le joueur clique dessus. Le reste de la page est voilé et ne répond pas ; l'élément
// encadré, lui, reste cliquable. Toujours deux sorties : « Suivant » (ou « Passer cette étape ») et « Passer le
// tutoriel ». Il se lance de lui-même à la première visite d'une page (réglable), ou à la demande depuis Paramètres
// (événement « tutoriel:lancer »). Jamais dans les fenêtres en jeu ni dans une fenêtre détachée.
//
// La logique (quel parcours, où poser le cadre et la bulle) est dans moteur.js ; les textes dans parcours.js.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { api } from '../api.js';
import { aLancer, cadreAutour, horsParcours, placerBulle, voiles } from './moteur.js';
import { PARCOURS, parcoursParId } from './parcours.js';

const ATTENTE_CIBLE_MS = 1500; // une cible absente de l'écran au bout de ce délai : l'étape est sautée (étape déjà faite, repliée)
const DELAI_LANCEMENT_MS = 700; // le temps que la page s'affiche
export const EVENEMENT_LANCER = 'tutoriel:lancer';
export const EVENEMENT_ETAT = 'tutoriel:etat';

/** Lit ou change l'état gardé par le serveur ({ actifs, vus }) et prévient les autres composants. */
export async function reglerTutoriels(demande) {
  const etat = await api('/tutoriels', demande ? { method: 'PUT', body: demande } : {});
  window.dispatchEvent(new CustomEvent(EVENEMENT_ETAT, { detail: etat }));
  return etat;
}

/** Lance un tutoriel à la demande (Paramètres), même déjà vu. */
export function lancerTutoriel(id) {
  window.dispatchEvent(new CustomEvent(EVENEMENT_LANCER, { detail: { id } }));
}

const fenetre = () => ({ l: window.innerWidth, h: window.innerHeight });
const visible = (el) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};

/**
 * Élément d'une étape et son rectangle dans la fenêtre principale. `etape.fenetre` : la cible est cherchée dans la
 * fenêtre en jeu de ce nom, montrée en démonstration dans un cadre (iframe[data-fenetre]) : son rectangle est décalé
 * de la place du cadre. Rend { el, rect, doc } ou null.
 */
function trouver(etape) {
  if (!etape.fenetre) {
    const el = [...document.querySelectorAll(etape.cible)].find(visible) ?? null;
    return el && { el, rect: el.getBoundingClientRect(), doc: document };
  }
  const cadre = document.querySelector(`iframe[data-fenetre="${etape.fenetre}"]`);
  let doc = null;
  try {
    doc = cadre?.contentDocument ?? null;
  } catch {
    doc = null;
  }
  if (!doc) return null;
  const el = [...doc.querySelectorAll(etape.cible)].find(visible) ?? null;
  if (!el) return null;
  const c = cadre.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  // Borné au cadre : une cible plus grande que la fenêtre (liste qui défile) n'encadre que sa partie visible
  const left = Math.max(c.left, c.left + r.left);
  const top = Math.max(c.top, c.top + r.top);
  const right = Math.min(c.right, c.left + r.right);
  const bottom = Math.min(c.bottom, c.top + r.bottom);
  return { el, rect: { left, top, right, bottom }, doc, cadre };
}

export default function Tutoriel() {
  const { pathname, search } = useLocation();
  const [etat, setEtat] = useState(null); // { actifs, vus }, lu au serveur
  const [cours, setCours] = useState(null); // { parcours, i }
  const [cadre, setCadre] = useState(null); // rectangle encadré, ou null (bulle au milieu)
  const [place, setPlace] = useState(null); // position de la bulle
  const bulle = useRef(null);
  const cible = useRef(null);

  useEffect(() => {
    api('/tutoriels').then(setEtat).catch(() => setEtat(null)); // serveur d'avant, ou injoignable : aucun tutoriel
    const maj = (e) => setEtat(e.detail);
    window.addEventListener(EVENEMENT_ETAT, maj);
    return () => window.removeEventListener(EVENEMENT_ETAT, maj);
  }, []);

  const finir = useCallback((parcours) => {
    setCours(null);
    setCadre(null);
    cible.current = null;
    reglerTutoriels({ vu: { id: parcours.id, vu: true } }).catch(() => {});
  }, []);

  // Lancement à la demande (Paramètres) : même déjà vu, et à la place de celui en cours
  useEffect(() => {
    const lancer = (e) => {
      const p = parcoursParId(e.detail?.id);
      if (p) setCours({ parcours: p, i: 0 });
    };
    window.addEventListener(EVENEMENT_LANCER, lancer);
    return () => window.removeEventListener(EVENEMENT_LANCER, lancer);
  }, []);

  // Première visite d'une page : son tutoriel se lance de lui-même, une fois la page affichée
  useEffect(() => {
    if (cours) return undefined;
    const p = aLancer(PARCOURS, pathname, etat, search);
    if (!p) return undefined;
    const t = setTimeout(() => setCours((c) => c ?? { parcours: p, i: 0 }), DELAI_LANCEMENT_MS);
    return () => clearTimeout(t);
  }, [pathname, search, etat, cours]);

  // Le joueur a quitté la page du tutoriel : il s'arrête là (et compte comme vu)
  useEffect(() => {
    if (cours && horsParcours(cours.parcours, pathname, search)) finir(cours.parcours);
  }, [pathname, search, cours, finir]);

  const etape = cours ? cours.parcours.etapes[cours.i] : null;
  const suivant = useCallback(() => {
    setCours((c) => {
      if (!c) return c;
      if (c.i + 1 >= c.parcours.etapes.length) {
        finir(c.parcours);
        return null;
      }
      return { ...c, i: c.i + 1 };
    });
  }, [finir]);

  // Cherche l'élément de l'étape, le fait venir à l'écran, puis le suit (la page peut bouger ou se redessiner)
  useEffect(() => {
    if (!etape) return undefined;
    cible.current = null;
    setCadre(null);
    if (!etape.cible) return undefined;
    const debut = Date.now();
    let amene = false;
    const tour = () => {
      const t = trouver(etape);
      if (!t) {
        // Une fenêtre en jeu met un peu plus de temps à s'afficher qu'un élément de la page
        if (Date.now() - debut > (etape.fenetre ? ATTENTE_CIBLE_MS * 3 : ATTENTE_CIBLE_MS)) suivant(); // cible absente : étape sautée
        return;
      }
      if (!amene) {
        amene = true;
        (t.cadre ?? t.el).scrollIntoView({ block: 'center', inline: 'nearest' });
        if (t.cadre) t.el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        return; // le rectangle se lit au tour suivant, une fois la page en place
      }
      cible.current = t.el;
      const c = cadreAutour(t.rect, fenetre());
      setCadre((avant) => (avant && avant.x === c.x && avant.y === c.y && avant.l === c.l && avant.h === c.h ? avant : c));
    };
    tour();
    const t = setInterval(tour, 150);
    return () => clearInterval(t);
  }, [etape, suivant]);

  // Étape « clic » : le clic du joueur sur l'élément encadré fait avancer (l'élément fait aussi son travail)
  useEffect(() => {
    if (!etape || etape.action !== 'clic') return undefined;
    const clic = (e) => {
      if (cible.current && cible.current.contains(e.target)) setTimeout(suivant, 250);
    };
    // Dans une fenêtre en jeu de démonstration, le clic arrive dans le document de son cadre
    let doc = document;
    try {
      doc = (etape.fenetre && document.querySelector(`iframe[data-fenetre="${etape.fenetre}"]`)?.contentDocument) || document;
    } catch {
      doc = document;
    }
    doc.addEventListener('click', clic, true);
    return () => doc.removeEventListener('click', clic, true);
  }, [etape, suivant, cadre === null]);

  // Échap : passer le tutoriel
  useEffect(() => {
    if (!cours) return undefined;
    const clavier = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      finir(cours.parcours);
    };
    document.addEventListener('keydown', clavier, true);
    return () => document.removeEventListener('keydown', clavier, true);
  }, [cours, finir]);

  // La bulle se pose une fois sa taille connue
  useLayoutEffect(() => {
    if (!etape || !bulle.current) return;
    const r = bulle.current.getBoundingClientRect();
    setPlace(placerBulle(etape.cible ? cadre : null, { l: r.width, h: r.height }, fenetre()));
  }, [etape, cadre]);

  if (!cours || !etape) return null;
  // Cible attendue mais pas encore trouvée : rien à l'écran pour l'instant (la page finit de s'afficher)
  if (etape.cible && !cadre) return null;
  const { parcours, i } = cours;
  const dernier = i + 1 >= parcours.etapes.length;
  const clicAttendu = etape.action === 'clic';
  const box = (r) => ({ left: r.x, top: r.y, width: r.l, height: r.h });
  return (
    <div className="tuto" role="dialog" aria-modal="false" aria-label={`Tutoriel : ${parcours.titre}`}>
      {voiles(cadre, fenetre()).map((v, k) => <div key={k} className="tuto-voile" style={box(v)} />)}
      {cadre && <div className={`tuto-cadre${clicAttendu ? ' est-clic' : ''}`} style={box(cadre)} />}
      <div ref={bulle} className="tuto-bulle" style={place ? { left: place.x, top: place.y } : { left: -9999, top: 0 }}>
        <div className="tuto-tete">
          <span className="tuto-nom">{parcours.titre}</span>
          <span className="tuto-pas">{i + 1} / {parcours.etapes.length}</span>
        </div>
        <h3>{etape.titre}</h3>
        <p>{etape.texte}</p>
        {clicAttendu && <p className="tuto-consigne">Clique sur l'élément encadré pour continuer.</p>}
        <div className="tuto-actions">
          <button type="button" className="btn btn-ghost small" onClick={() => finir(parcours)}>Passer le tutoriel</button>
          <button type="button" className={`btn small ${clicAttendu ? '' : 'btn-primary'}`} onClick={suivant}>
            {dernier ? 'Terminer' : clicAttendu ? 'Passer cette étape' : 'Suivant'}
          </button>
        </div>
      </div>
    </div>
  );
}
