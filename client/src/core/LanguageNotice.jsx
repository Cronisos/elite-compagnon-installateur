// Avertissement en haut des pages quand le jeu n'est pas en français (langue lue dans le Fileheader du journal) :
// la lecture d'écran (OCR) et les noms comparés par l'app ne sont alors pas garantis. Rien ne s'affiche sinon.

import { useEffect, useState } from 'react';
import { api } from './api.js';
import { useEvent } from './stream.js';

export default function LanguageNotice() {
  const [status, setStatus] = useState(null);
  const load = () => api('/journal/language').then(setStatus).catch(() => {});
  useEffect(() => {
    load();
  }, []);
  useEvent('journal:language', setStatus);
  useEvent('journal:ready', load);

  if (!status?.warning) return null;
  return (
    <div className="alert alert-warning" role="status" style={{ marginBottom: '1rem' }}>
      ⚠ {status.warning}
    </div>
  );
}
