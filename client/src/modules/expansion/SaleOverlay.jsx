// Fenêtre en jeu (/hud/expansion-sale) : à quai, ce que ta soute rapporterait ici en mérites, l'alerte d'un 0 probable
// ou d'une vente en gros, puis le résultat de la vente. Le serveur l'ouvre à quai et la ferme au départ.

import { useEffect, useState } from 'react';
import { HudOverlay } from '../../core/hud.jsx';
import { useEvent, useNow } from '../../core/stream.js';
import { saleApi } from './saleApi.js';
import { hudProps } from './saleView.js';

export default function SaleOverlay() {
  const [data, setData] = useState(null);
  const now = useNow(15000); // âge du prix
  useEffect(() => {
    saleApi.forecast().then(setData).catch(() => {});
  }, []);
  useEvent('expansion:sale', setData);
  return <HudOverlay props={hudProps(data, now)} />;
}
