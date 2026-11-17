// État de l'IA de bord tenu à jour en temps réel : modèles, mémoire vidéo, conversation ; et l'avatar du Copilote
// (lu par l'API du module Compagnon : un module n'importe jamais le code d'un autre).

import { useEffect, useState } from 'react';
import { api, apiBrut } from '../../core/api.js';
import { useEvent } from '../../core/stream.js';

export const base = '/modules/ia';

export function useIa() {
  const [etat, setEtat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [copilote, setCopilote] = useState(null); // { nom, avatar } du module Compagnon, s'il est là

  const relire = () => api(`${base}/etat`).then(setEtat).catch((e) => setErreur(e.message));
  useEffect(() => {
    relire();
    api(`${base}/historique`).then(setMessages).catch(() => {});
    api('/modules/compagnon/state')
      .then((s) => setCopilote({ nom: s.settings?.name || 'Alicia', avatar: s.pack?.moods?.neutre || null }))
      .catch(() => {});
  }, []);
  useEvent('ia:etat', setEtat);
  useEvent('ia:message', (m) => setMessages((l) => (l.some((x) => x.id === m.id) ? l : [...l, m])));
  useEvent('ia:oubli', () => setMessages([]));
  useEvent('compagnon:settings', (s) => setCopilote({ nom: s.settings?.name || 'Alicia', avatar: s.pack?.moods?.neutre || null }));

  async function envoyer(texte) {
    setErreur(null);
    setEnvoi(true);
    try {
      await api(`${base}/question`, { method: 'POST', body: { texte } });
    } catch (e) {
      setErreur(e.message);
    } finally {
      setEnvoi(false);
    }
  }
  /** Enregistrement → texte (Whisper) → question. Rend le texte compris, ou null. */
  async function ecouter(wav) {
    setErreur(null);
    try {
      // Corps binaire, mais les mêmes messages d'erreur que partout (serveur arrêté, 5xx sans JSON) : core/api.js
      const d = await apiBrut(`${base}/ecoute`, wav, { type: 'audio/wav' });
      if (!d?.texte) {
        setErreur('Je n’ai rien entendu.');
        return null;
      }
      await envoyer(d.texte);
      return d.texte;
    } catch (e) {
      setErreur(e.message);
      return null;
    }
  }
  const action = (chemin, opts) => api(`${base}${chemin}`, opts).catch((e) => setErreur(e.message));

  return {
    etat,
    messages,
    copilote,
    erreur,
    occupe: envoi || Boolean(etat?.occupe),
    envoyer,
    ecouter,
    signaler: setErreur,
    oublier: () => action('/oublier', { method: 'POST', body: {} }),
    decharger: () => action('/decharger', { method: 'POST', body: {} }),
    regler: (r) => action('/reglages', { method: 'PUT', body: r }).then(relire),
    // Cadre de réglage de la jauge des boucliers, en jeu : ouvert pour le placer, fermé ensuite
    cadreBouclier: (on) => action('/vision/cadre', { method: 'POST', body: { on } }),
    relire,
  };
}
