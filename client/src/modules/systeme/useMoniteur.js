// Relevés du moniteur PC en temps réel. La page relit toutes les 5 s pour que les relevés continuent tant qu'on la
// regarde (fenêtre visible : core/visible.js) ; la fenêtre en jeu, elle, les garde allumés tant qu'elle est ouverte
// (réglage côté serveur). Une lecture ou un réglage qui échoue donne son message (erreur, erreurReglage) au lieu
// de laisser la page sur « Lecture… » ou le bouton sans effet.

import { useEffect, useState } from 'react';
import { api } from '../../core/api.js';
import { useEvent } from '../../core/stream.js';
import { tenter } from '../../core/actions.js';
import { intervalleVisible } from '../../core/visible.js';

export const base = '/modules/systeme';

export function useMoniteur({ lecteur = false } = {}) {
  const [m, setM] = useState(null);
  const [reglages, setReglages] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [erreurReglage, setErreurReglage] = useState(null);
  const [essai, setEssai] = useState(0); // « Réessayer » relance la lecture
  useEffect(() => {
    const lire = () => tenter(async () => setM(await api(`${base}/mesure`)), setErreur);
    lire();
    api(`${base}/reglages`).then(setReglages).catch(() => {});
    if (!lecteur) return undefined;
    return intervalleVisible(lire, 5000);
  }, [lecteur, essai]);
  useEvent('systeme:mesure', setM);
  useEvent('systeme:reglages', setReglages);
  const regler = (r) => tenter(async () => setReglages(await api(`${base}/reglages`, { method: 'PUT', body: r })), setErreurReglage);
  const reessayer = () => setEssai((n) => n + 1);
  return { m, reglages, regler, erreur, erreurReglage, reessayer };
}
