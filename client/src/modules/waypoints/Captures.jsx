import { useEffect, useState } from 'react';
import { useEvent } from '../../core/stream.js';
import { dateTime } from '../../core/format.js';
import { wpApi } from './api.js';

// Photos prises par le cadre de capture de l'overlay : l'image et le texte que l'OCR intégré (Tesseract) y a lu.
// Pour l'instant on vérifie la lecture ; le remplissage de la fiche de l'EEP viendra ensuite.

const SHOWN = 4;

export function CapturesPanel() {
  const [list, setList] = useState([]);
  const [all, setAll] = useState(false);
  const load = () => {
    wpApi.captures().then(setList).catch(() => {});
  };
  useEffect(load, []); // load ne renvoie rien : React prendrait une promesse pour une fonction de nettoyage
  useEvent('waypoints:capture', load);

  async function remove(c) {
    await wpApi.removeCapture(c.id);
    load();
  }

  const shown = all ? list : list.slice(0, SHOWN);
  return (
    <section className="panel" data-tuto="reperes-captures">
      <div className="survey-top">
        <h2>Captures</h2>
        <span className="small muted">{list.length} photo{list.length > 1 ? 's' : ''}</span>
        <span className="survey-grow" />
        {list.length > SHOWN && <button className="btn btn-ghost small" onClick={() => setAll(!all)}>{all ? 'Les dernières' : `Toutes (${list.length})`}</button>}
      </div>
      {!list.length && (
        <p className="small muted">
          En mode Minage Rhino, l’overlay ouvre un cadre en pointillés : place-le (✥ puis 📌) sur le panneau qui montre le
          contenu d’un EEP ciblé, puis 📷 ou Alt+Maj+P, même en jeu. La photo et le texte lu apparaissent ici.
        </p>
      )}
      <div className="captures">
        {shown.map((c) => (
          <div key={c.id} className="capture">
            <img src={wpApi.captureImage(c.id)} alt="Capture" />
            <div className="capture-text">
              <div className="tiny muted">
                {dateTime(c.at)}
                {c.body && ` · ${c.body}`}
                {c.site != null && <> · <span className="pill pill-eep">EEP {c.site}</span></>}
                <button className="btn btn-ghost small" onClick={() => remove(c)} aria-label="Supprimer">✕</button>
              </div>
              {c.ores?.length > 0 && (
                <p className="small">
                  <b>{c.ores.join(', ')}</b>{' '}
                  {c.applied ? <span className="good">→ rangés dans la fiche de l’EEP {c.site}</span> : <span className="warn">aucun EEP ciblé : rien de rangé</span>}
                </p>
              )}
              {c.error && <p className="small bad">{c.error}</p>}
              {!c.error && !c.lines.length && <p className="small muted">Aucun texte lu.</p>}
              {c.lines.length > 0 && <pre className="capture-lines">{c.lines.map((l) => l.text).join('\n')}</pre>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
