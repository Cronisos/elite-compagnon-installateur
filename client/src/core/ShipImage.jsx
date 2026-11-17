// Image d'un modèle de vaisseau (Mes vaisseaux, Ingénierie…), avec l'envoi de sa propre capture. Les images sont
// servies par le serveur (module Ingénierie : données de référence, captures envoyées par le joueur).

import { useRef, useState } from 'react';
import { api } from './api.js';

const BASE = '/modules/engineering/ships';
const imageUrl = (key, bust = '') => `/api${BASE}/${key}/image${bust ? `?v=${bust}` : ''}`;
const envoyerImage = (key, dataUrl) => api(`${BASE}/${key}/image`, { method: 'POST', body: { dataUrl } });

/** Silhouette par défaut quand le vaisseau n'a pas d'image (vaisseaux récents). */
function DefaultShip() {
  return (
    <svg viewBox="0 0 200 120" className="ship-default" aria-hidden="true">
      <path d="M100 12 L178 92 L132 82 L100 108 L68 82 L22 92 Z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      <path d="M100 30 L118 74 L100 66 L82 74 Z" fill="currentColor" opacity="0.35" />
    </svg>
  );
}

/** Image du vaisseau, avec possibilité d'envoyer sa propre capture. */
export default function ShipImage({ shipKey, hasImage, editable = false, size = 'md' }) {
  const [bust, setBust] = useState('');
  const [failed, setFailed] = useState(!hasImage);
  const input = useRef(null);

  function upload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await envoyerImage(shipKey, reader.result);
        setFailed(false);
        setBust(String(Date.now()));
      } catch (err) {
        window.alert(err.message);
      }
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className={`ship-image ship-image-${size}`}>
      {failed && !bust ? <DefaultShip /> : <img src={imageUrl(shipKey, bust)} alt="" onError={() => setFailed(true)} />}
      {editable && (
        <>
          <button type="button" className="btn btn-ghost small ship-image-btn" onClick={() => input.current.click()}>
            Changer l'image
          </button>
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={upload} />
        </>
      )}
    </div>
  );
}
