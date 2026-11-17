// Page de capture (/capture/rapport-semaine?projet=…&semaine=…) : le rapport de la semaine seul, sans cadre ni menu.
// L'app de bureau l'ouvre hors écran et en fait un GIF animé pour Discord (desktop/main.js) : elle attend
// window.__eliteCapture, mesure le rapport (zone), puis fige les animations à chaque instant voulu (instant) avant
// chaque capture. Le temps ne s'écoule pas pendant la capture : la boucle de 2,4 s du vaisseau tombe juste.

import { useEffect, useRef, useState } from 'react';
import { expansionApi } from './api.js';
import RapportSemaine from './RapportSemaine.jsx';

/** Largeur du GIF (px) : lisible en grand dans Discord, léger à envoyer. */
export const LARGEUR_CAPTURE = 1000;

const deuxImages = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

/** Attend que les images des SVG (le vaisseau) soient décodées : sans elles, la première capture serait vide. */
async function imagesPretes(racine) {
  const liens = [...racine.querySelectorAll('image')].map((im) => im.getAttribute('href') || im.getAttribute('xlink:href')).filter(Boolean);
  await Promise.all(liens.map((src) => {
    const im = new Image();
    im.src = src;
    return im.decode().catch(() => {});
  }));
}

export default function CaptureRapport() {
  const [donnees, setDonnees] = useState(null);
  const racine = useRef(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const projet = q.get('projet') || 'all';
    const semaine = q.get('semaine') || null;
    Promise.all([expansionApi.merits(projet === 'all' ? null : projet, semaine), expansionApi.list()])
      .then(([report, projects]) => {
        const name = projet === 'all' ? 'Tous les systèmes' : projects.find((p) => String(p.id) === projet)?.name || '';
        setDonnees({ report, name });
      })
      .catch((err) => {
        window.__eliteCapture = { erreur: err?.message || 'Rapport illisible.' };
      });
  }, []);

  useEffect(() => {
    if (!donnees || !racine.current) return;
    let annule = false;
    (async () => {
      await document.fonts?.ready;
      await imagesPretes(racine.current);
      await deuxImages();
      if (annule) return;
      const el = racine.current;
      window.__eliteCapture = {
        zone: () => {
          const r = el.getBoundingClientRect();
          return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
        },
        // Fige toutes les animations du rapport à l'instant t (s), puis attend que l'image soit peinte
        instant: async (t) => {
          for (const svg of el.querySelectorAll('svg')) {
            svg.pauseAnimations?.();
            svg.setCurrentTime?.(t);
          }
          await deuxImages();
          return true;
        },
      };
    })();
    return () => {
      annule = true;
    };
  }, [donnees]);

  if (!donnees) return null;
  return (
    <div ref={racine} className="capture-rapport" style={{ width: LARGEUR_CAPTURE }}>
      <RapportSemaine report={donnees.report} name={donnees.name} />
    </div>
  );
}
