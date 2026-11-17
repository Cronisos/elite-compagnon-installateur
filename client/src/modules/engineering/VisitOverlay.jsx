// Fenêtre en jeu (/hud/engineering-visit) : la fiche « Chez l'ingénieur ». Le serveur l'ouvre à quai chez un ingénieur qui
// a des tâches pour tes plans validés, et la ferme au départ ; ✕ la ferme jusqu'au prochain amarrage.

import { useEffect, useState } from 'react';
import { PanelOverlay } from '../../core/hud.jsx';
import { useEvent } from '../../core/stream.js';
import { engApi } from './api.js';
import VisitSheet, { VISIT_CSS } from './components/VisitSheet.jsx';
import { footText, visitTitle } from './visitView.js';

export default function VisitOverlay() {
  const [state, setState] = useState(null);
  useEffect(() => {
    engApi.visit().then(setState).catch(() => {});
  }, []);
  useEvent('engineering:visit', setState);
  const footer = (
    <>
      <span>{footText(state)}</span>
      <button type="button" className="vs-btn" onClick={() => engApi.visitClose().catch(() => {})} title="Fermer jusqu’au prochain amarrage">✕</button>
    </>
  );
  return (
    <PanelOverlay title={visitTitle(state)} footer={footer} autoHeight>
      <style>{VISIT_CSS}</style>
      <VisitSheet state={state} compact />
    </PanelOverlay>
  );
}
